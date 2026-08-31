import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { success } from '@neftya/contracts';
import {
  cutPlanPdf,
  technicalDrawing,
  technicalDrawingPdf,
  type ViewName,
} from '@neftya/drawing';
import { build } from '@neftya/engine';
import { paperSizeFor, type Money } from '@neftya/units';
import { forbidden, notFound, validationFailed } from '../http/errors.js';
import { sekuuOf } from '../sekuu/authenticate.js';
import { can } from '../sekuu/permission-resolver.js';
import { StorageUnavailable, type SekuuStorage } from '../sekuu/storage.js';
import type { ProjectRepository } from '../projects/repository.js';
import type { SettingsRepository } from '../settings/repository.js';
import type { ManufacturingRepository } from './repository.js';
import { cutListCsv, manufacturingPlan } from './service.js';

/**
 * La fabrication : plan de découpe, nomenclature, montage, devis, exports.
 *
 * Tout est recalculé à partir du modèle à chaque appel — sauf l'export, figé au moment où
 * il part à l'atelier.
 *
 * @see docs/MANUFACTURING.md
 */

const identifier = z.object({ id: z.uuid() });

const priceBody = z.object({
  reference: z.string().min(1).max(120),
  /** Unités mineures entières. Un prix flottant est un devis faux. */
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/u),
});

export interface ManufacturingDependencies {
  projects: ProjectRepository;
  settings: SettingsRepository;
  manufacturing: ManufacturingRepository;
  /** Absent quand aucune clé d'API n'est configurée : l'export reste possible, sans dépôt. */
  storage?: SekuuStorage;
}

/**
 * Les noms de vues du PDF.
 *
 * Sans accent : l'écrivain PDF encode en WinAnsi, et le français accentué y passe — mais
 * ces libellés partent à l'atelier tels quels, et un plan lisible partout vaut mieux
 * qu'un plan joli ici.
 */
const VIEW_LABELS: Record<ViewName, string> = {
  front: 'Vue de face',
  back: 'Vue arriere',
  top: 'Vue de dessus',
  bottom: 'Vue de dessous',
  left: 'Vue de gauche',
  right: 'Vue de droite',
};

/** La devise par défaut quand l'organisation n'en a pas choisi. */
const FALLBACK_CURRENCY = 'XAF';

export function registerManufacturingRoutes(
  app: FastifyInstance,
  dependencies: ManufacturingDependencies,
): void {
  const { projects, settings, manufacturing, storage } = dependencies;

  async function planFor(request: FastifyRequest) {
    const context = sekuuOf(request);
    const project = await projects.find(context.organizationId, parseId(request));
    if (!project) throw notFound('Projet introuvable.');

    const organizationSettings = await settings.get(context.organizationId);
    const currency = organizationSettings.currency ?? FALLBACK_CURRENCY;
    const prices = await manufacturing.prices(context.organizationId);

    return {
      project,
      settings: organizationSettings,
      plan: manufacturingPlan(project.model, currency ? prices : new Map(), currency),
    };
  }

  app.get('/v1/projects/:id/manufacturing', async (request) => {
    requirePermission(request, 'project.read');
    const { plan, project } = await planFor(request);

    // Le devis n'apparaît qu'à qui a le droit de voir les coûts. Un menuisier salarié
    // accède au plan de découpe et au guide d'assemblage sans voir les marges.
    const withCosts = can(sekuuOf(request), 'costs.read');

    return success({
      project: { id: project.id, name: project.name },
      cut_list: plan.cutList,
      nesting: plan.nesting,
      bill: plan.bill,
      assembly: plan.assembly,
      ...(withCosts ? { quotation: plan.quotation } : {}),
    });
  });

  app.get('/v1/projects/:id/cut-list.csv', async (request, reply) => {
    requirePermission(request, 'project.read');
    const { plan, project } = await planFor(request);

    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header(
        'content-disposition',
        `attachment; filename="${fileNameOf(project.name)}.csv"`,
      )
      .send(cutListCsv(plan.cutList));
  });

  app.get('/v1/projects/:id/cut-plan.pdf', async (request, reply) => {
    requirePermission(request, 'project.read');
    const { plan, project, settings: organizationSettings } = await planFor(request);

    const pdf = renderPlan(plan.nesting, project.name, organizationSettings.country);

    return reply
      .header('content-type', 'application/pdf')
      .header(
        'content-disposition',
        `attachment; filename="${fileNameOf(project.name)}.pdf"`,
      )
      .send(Buffer.from(pdf));
  });

  /**
   * Les plans techniques cotés.
   *
   * Une page par vue, puis la table des pièces — parce qu'une élévation dit où va une
   * étagère, elle ne dit pas à quelle cote la scier.
   *
   * Les cotes sont en millimètres, sans exception : le PDF part à l'atelier, où la
   * préférence d'affichage de celui qui a dessiné n'a pas cours. L'écran, lui, suit le
   * système d'unités de son lecteur.
   */
  app.get('/v1/projects/:id/plans.pdf', async (request, reply) => {
    requirePermission(request, 'project.read');
    const { project, settings: organizationSettings } = await planFor(request);

    const drawing = technicalDrawing(build(project.model), {
      label: (valueMm) => `${valueMm} mm`,
    });

    const pdf = technicalDrawingPdf(
      drawing,
      {
        title: project.name,
        view: (view: ViewName) => VIEW_LABELS[view],
        partsTitle: 'Pieces',
        columns: ['Repere', 'Role', 'Cotes (mm)', 'Ep.', 'Qte'],
      },
      paperSizeFor(organizationSettings.country),
    );

    return reply
      .header('content-type', 'application/pdf')
      .header(
        'content-disposition',
        `attachment; filename="${fileNameOf(project.name)}-plans.pdf"`,
      )
      .send(Buffer.from(pdf));
  });

  /**
   * Fige un export.
   *
   * L'instantané est enregistré **avant** le dépôt : si Storage est indisponible, on garde
   * ce qui a été produit plutôt que de perdre l'export au motif qu'on n'a pas su le
   * ranger.
   */
  app.post('/v1/projects/:id/exports', async (request, reply) => {
    const context = sekuuOf(request);
    requirePermission(request, 'project.write');

    const { plan, project, settings: organizationSettings } = await planFor(request);
    const pdf = renderPlan(plan.nesting, project.name, organizationSettings.country);

    let storageObjectId: string | null = null;
    let warning: string | null = null;

    if (storage) {
      try {
        storageObjectId = await storage.upload({
          organizationId: context.organizationId,
          ownerId: project.id,
          name: `${fileNameOf(project.name)}.pdf`,
          mimeType: 'application/pdf',
          bytes: pdf,
        });
      } catch (error) {
        // Un magasin indisponible ne doit pas faire perdre le plan produit.
        if (!(error instanceof StorageUnavailable)) throw error;
        warning = error.message;
      }
    }

    const record = await manufacturing.recordExport({
      organizationId: context.organizationId,
      projectId: project.id,
      createdBy: context.userId,
      kind: 'pdf',
      snapshot: {
        model: project.model,
        cut_list: plan.cutList,
        nesting: plan.nesting,
        bill: plan.bill,
        assembly: plan.assembly,
        quotation: plan.quotation,
      },
      storageObjectId,
    });

    return reply.status(201).send(
      success({
        id: record.id,
        kind: record.kind,
        storage_object_id: record.storageObjectId,
        created_at: record.createdAt.toISOString(),
        ...(warning ? { warning } : {}),
      }),
    );
  });

  app.get('/v1/projects/:id/exports', async (request) => {
    const context = sekuuOf(request);
    requirePermission(request, 'project.read');

    const project = await projects.find(context.organizationId, parseId(request));
    if (!project) throw notFound('Projet introuvable.');

    const records = await manufacturing.listExports(context.organizationId, project.id);

    return success(
      records.map((record) => ({
        id: record.id,
        kind: record.kind,
        storage_object_id: record.storageObjectId,
        created_at: record.createdAt.toISOString(),
      })),
    );
  });

  app.get('/v1/prices', async (request) => {
    const context = sekuuOf(request);
    requirePermission(request, 'costs.read');

    const prices = await manufacturing.prices(context.organizationId);

    return success(
      [...prices.entries()].map(([reference, price]) => ({
        reference,
        amount_minor: price.amount,
        currency: price.currency,
      })),
    );
  });

  app.put('/v1/prices', async (request) => {
    const context = sekuuOf(request);
    if (!can(context, 'settings.write')) {
      throw forbidden('Votre rôle ne permet pas de saisir les prix.');
    }

    const result = priceBody.safeParse(request.body);
    if (!result.success) {
      const details: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        (details[issue.path.join('.') || '_'] ??= []).push(issue.message);
      }
      throw validationFailed(details);
    }

    const price: Money = {
      amount: result.data.amountMinor,
      currency: result.data.currency,
    };
    await manufacturing.savePrice(context.organizationId, result.data.reference, price);

    return success({
      reference: result.data.reference,
      amount_minor: price.amount,
      currency: price.currency,
    });
  });
}

function renderPlan(
  nesting: Parameters<typeof cutPlanPdf>[0],
  projectName: string,
  country: string | null,
): Uint8Array {
  return cutPlanPdf(
    nesting,
    {
      title: projectName,
      panel: (panel, index, total) =>
        `${panel.material} ${panel.thicknessMm} mm - ${panel.format.lengthMm} x ${
          panel.format.widthMm
        } - ${index}/${total} - ${(panel.utilisation * 100).toFixed(1)} %`,
      part: (placement) => `${placement.sizeXMm} x ${placement.sizeYMm}`,
    },
    // A4 ou Letter selon le pays : un plan technique imprimé sur le mauvais format est
    // mis à l'échelle, et les cotes deviennent fausses à la règle.
    paperSizeFor(country),
  );
}

function requirePermission(
  request: FastifyRequest,
  permission: Parameters<typeof can>[1],
): void {
  if (!can(sekuuOf(request), permission)) {
    throw forbidden('Votre rôle ne permet pas cette action.');
  }
}

function parseId(request: FastifyRequest): string {
  const params = identifier.safeParse(request.params);
  if (!params.success) throw notFound('Projet introuvable.');
  return params.data.id;
}

/** Un nom de fichier sans accent ni espace : il traverse des systèmes qui n'aiment ni l'un ni l'autre. */
function fileNameOf(projectName: string): string {
  const ascii = projectName
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/[^A-Za-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase();

  return ascii || 'projet';
}
