import { createContext, useContext } from 'react';
import type {
  AssemblyStep,
  BillOfMaterials,
  CutListRow,
  CuttingOrder,
  DrillingResult,
  NestingResult,
  ParsedFurnitureInput,
  Tooling,
} from '@neftya/engine';
import type { Money } from '@neftya/units';
import type { ApiClient, FileClient } from './client.js';

/**
 * Les ressources de l'API, typées depuis les contrats — jamais retapées à la main.
 *
 * DealerOS portait 94 types réécrits entre son back et son front : un statut ajouté côté
 * serveur n'y cassait aucun build, il produisait un `undefined` à l'exécution.
 */

/**
 * L'état d'avancement, **déduit par le serveur** à chaque lecture.
 *
 * `needs_review` prime : un plan parti à l'atelier avec un avertissement reste un plan à
 * relire. Il n'y a pas d'état « optimisé » — le plan de découpe est recalculé à chaque
 * appel, il l'est donc toujours, et l'annoncer comme une étape franchie ne dirait rien.
 */
export type ProjectStatus = 'draft' | 'needs_review' | 'ready';

export interface ProjectResource {
  id: string;
  name: string;
  model: ParsedFurnitureInput;
  status: ProjectStatus;
  export_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SettingsResource {
  country: string | null;
  currency: string | null;
  unit_system: 'metric' | 'imperial';
}

export const listProjects = (api: ApiClient) => api<ProjectResource[]>('/v1/projects');

export const getProject = (api: ApiClient, id: string) =>
  api<ProjectResource>(`/v1/projects/${id}`);

export const createProject = (api: ApiClient, body: { name: string; model: unknown }) =>
  api<ProjectResource>('/v1/projects', { method: 'POST', body });

export const updateProject = (
  api: ApiClient,
  id: string,
  body: { name?: string; model?: unknown },
) => api<ProjectResource>(`/v1/projects/${id}`, { method: 'PATCH', body });

export const deleteProject = (api: ApiClient, id: string) =>
  api<void>(`/v1/projects/${id}`, { method: 'DELETE' });

export const getSettings = (api: ApiClient) => api<SettingsResource>('/v1/settings');

export const saveSettings = (api: ApiClient, body: Partial<SettingsResource>) =>
  api<SettingsResource>('/v1/settings', { method: 'PUT', body });

export interface QuotationLine {
  reference: string;
  unit: string;
  quantity: number;
  /** `null` tant que le prix n'a pas été saisi. Jamais un prix inventé. */
  unitPrice: Money | null;
  total: Money | null;
}

export interface ManufacturingResource {
  project: { id: string; name: string };
  cut_list: CutListRow[];
  nesting: NestingResult;
  /** Ce qu'on fait couper au magasin : cotes finies, quantités, rien de plus. */
  cutting_order: CuttingOrder;
  /** Les positions de perçage, et la quincaillerie qu'elles impliquent. */
  drilling: DrillingResult;
  bill: BillOfMaterials;
  assembly: AssemblyStep[];
  /** L'outillage nécessaire, et le niveau qui s'en déduit. */
  tooling: Tooling;
  /** Absent quand le rôle n'autorise pas la lecture des coûts. */
  quotation?: {
    lines: QuotationLine[];
    total: Money | null;
    currency: string;
    missing: string[];
  };
}

/**
 * Un modèle, du catalogue ou de l'organisation.
 *
 * Les deux arrivent dans une seule liste, avec la même forme : `name` est **déjà résolu**
 * à la langue du jeton par le serveur, `name_translations` porte les traductions brutes
 * pour qui veut les modifier.
 *
 * @see docs/I18N.md §6
 */
export interface TemplateResource {
  id: string;
  source: 'catalogue' | 'organization';
  name: string;
  name_translations: Record<string, string>;
  model: ParsedFurnitureInput;
}

export const listTemplates = (api: ApiClient) =>
  api<TemplateResource[]>('/v1/templates');

export const createTemplate = (
  api: ApiClient,
  body: { name: Record<string, string>; model: unknown },
) => api<TemplateResource>('/v1/templates', { method: 'POST', body });

export const deleteTemplate = (api: ApiClient, id: string) =>
  api<void>(`/v1/templates/${id}`, { method: 'DELETE' });

export interface ExportResource {
  id: string;
  kind: 'pdf' | 'csv';
  storage_object_id: string | null;
  created_at: string;
}

export const getManufacturing = (api: ApiClient, id: string) =>
  api<ManufacturingResource>(`/v1/projects/${id}/manufacturing`);

export const createExport = (api: ApiClient, id: string) =>
  api<ExportResource>(`/v1/projects/${id}/exports`, { method: 'POST', body: {} });

export const listExports = (api: ApiClient, id: string) =>
  api<ExportResource[]>(`/v1/projects/${id}/exports`);

/**
 * L'état de la facturation, et ce qu'on peut souscrire.
 *
 * Les deux arrivent ensemble : deux appels auraient pu rendre un catalogue et un
 * abonnement pris à des instants différents, et l'écran aurait annoncé une offre qui vient
 * de changer.
 */
export interface BillingResource {
  /**
   * La devise de l'organisation, celle de ses réglages. `null` si elle n'en a pas choisi.
   *
   * Elle sert à ne montrer que les prix qui la concernent : sans elle, chaque offre
   * affichait quatre boutons dont la moitié s'adresse à l'autre continent.
   */
  currency: string | null;
  subscription: {
    /** L'offre **servie**. Elle retombe au gratuit quand la période est finie. */
    plan: string;
    /** L'offre payée, qui peut différer de celle servie. */
    paid_plan: string;
    status: 'active' | 'past_due' | 'canceled';
    period: 'free' | 'monthly' | 'yearly';
    current_period_end: string | null;
    /** Vrai quand l'accès est retombé au gratuit faute de paiement en cours. */
    lapsed: boolean;
  };
  quotas: {
    projects_max: number | null;
    ai_month_max: number | null;
    members_max: number | null;
  };
  plans: {
    code: string;
    projects_max: number | null;
    ai_month_max: number | null;
    members_max: number | null;
    /** Seuls les prix qu'un encaisseur configuré sait prendre. */
    prices: { currency: string; period: 'monthly' | 'yearly'; amount_minor: number }[];
  }[];
}

export const getBilling = (api: ApiClient) => api<BillingResource>('/v1/billing');

export type PublicPlan = BillingResource['plans'][number];

/**
 * Le catalogue public, pour la page d'accueil.
 *
 * Sans jeton : elle s'adresse à des visiteurs. C'est ce qui permet aux tarifs affichés
 * d'être ceux que l'API encaissera — écrits en dur dans la page, ils auraient fini par
 * annoncer un prix que personne ne débite.
 */
export const getPublicPlans = (api: ApiClient) =>
  api<{ plans: PublicPlan[] }>('/v1/billing/plans');

export const startCheckout = (
  api: ApiClient,
  body: { plan: string; period: 'monthly' | 'yearly'; currency: string },
) => api<{ redirect_url: string }>('/v1/billing/checkout', { method: 'POST', body });

export const openBillingPortal = (api: ApiClient) =>
  api<{ redirect_url: string }>('/v1/billing/portal', { method: 'POST', body: {} });

export interface PriceReference {
  reference: string;
  amount_minor: number;
  currency: string;
}

/**
 * Les prix de référence de l'organisation.
 *
 * Lus une fois et partagés : c'est le concepteur qui s'en sert pour chiffrer en direct, et
 * refaire l'appel à chaque millimètre glissé coûterait une requête par image.
 */
export const listPrices = (api: ApiClient) => api<PriceReference[]>('/v1/prices');

export const savePrice = (
  api: ApiClient,
  body: { reference: string; amountMinor: number; currency: string },
) => api<{ reference: string }>('/v1/prices', { method: 'PUT', body });

export const sendQuotationEmail = (
  api: ApiClient,
  id: string,
  body: { to: string; message?: string },
) =>
  api<{ to: string; status: 'sent' }>(`/v1/projects/${id}/quotation/email`, {
    method: 'POST',
    body,
  });

/** Un nom de fichier sans accent ni espace : il traverse des systèmes qui n'aiment ni l'un ni l'autre. */
export function fileNameOf(projectName: string, suffix: string): string {
  const ascii = projectName
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/[^A-Za-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase();

  return `${ascii || 'projet'}${suffix}`;
}

export const downloadCutList = (files: FileClient, id: string, name: string) =>
  files(`/v1/projects/${id}/cut-list.csv`, fileNameOf(name, '.csv'));

export const downloadCutPlan = (files: FileClient, id: string, name: string) =>
  files(`/v1/projects/${id}/cut-plan.pdf`, fileNameOf(name, '-decoupe.pdf'));

export const downloadPlans = (files: FileClient, id: string, name: string) =>
  files(`/v1/projects/${id}/plans.pdf`, fileNameOf(name, '-plans.pdf'));

export const downloadDrilling = (files: FileClient, id: string, name: string) =>
  files(`/v1/projects/${id}/drilling.dxf`, fileNameOf(name, '-percage.dxf'));

const ApiContext = createContext<ApiClient | null>(null);
const FileContext = createContext<FileClient | null>(null);

export const ApiProvider = ApiContext.Provider;
export const FileProvider = FileContext.Provider;

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi hors de ApiProvider.');
  return api;
}

export function useFiles(): FileClient {
  const files = useContext(FileContext);
  if (!files) throw new Error('useFiles hors de FileProvider.');
  return files;
}
