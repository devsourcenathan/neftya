import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { cutPlanSvg } from '@neftya/drawing';
import type { NestedPanel } from '@neftya/engine';
import { formatMoney, type Money } from '@neftya/units';
import { ApiRequestError } from '../api/client.js';
import {
  createExport,
  downloadCutList,
  downloadCutPlan,
  getManufacturing,
  useApi,
  useFiles,
} from '../api/projects.js';
import { DownloadButton } from '../components/DownloadButton.js';
import { Exports } from './Exports.js';
import { PriceEditor } from './PriceEditor.js';
import { usePreferences } from '../preferences/PreferencesContext.js';
import { DataPoint, Pipeline, SectionTitle } from '../ui/index.js';

/**
 * Le dossier de fabrication : plan de découpe, matériaux, montage, devis.
 *
 * Tout vient du serveur — c'est **lui** qui fait foi pour ce qui part à l'atelier. La 3D
 * du mode conception calcule dans le navigateur pour être fluide ; le plan de découpe, lui,
 * n'a aucune raison de l'être, et une seule raison d'être juste.
 *
 * @see docs/MANUFACTURING.md
 */
export function Manufacturing({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation();
  const { format } = usePreferences();
  const api = useApi();
  const files = useFiles();
  const queryClient = useQueryClient();

  const plan = useQuery({
    queryKey: ['manufacturing', projectId],
    queryFn: () => getManufacturing(api, projectId),
  });

  const freeze = useMutation({
    mutationFn: () => createExport(api, projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['exports', projectId] });
    },
  });

  if (plan.isPending)
    return <p className="p-6 text-sm text-ink-variant">{t('state.loading')}</p>;

  if (plan.isError) {
    return (
      <p className="p-6 text-sm text-danger">
        {plan.error instanceof ApiRequestError ? plan.error.message : t('state.error')}
      </p>
    );
  }

  const data = plan.data;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-4 pt-20 pb-12 lg:px-margin-desktop lg:pt-margin-desktop">
      {/* Le fil d'étapes du système : il dit où l'on en est dans le processus, pas où l'on
          est dans une arborescence. */}
      <Pipeline
        current="manufacturing"
        steps={[
          { key: 'design', label: t('pipeline.design') },
          { key: 'materials', label: t('pipeline.materials') },
          { key: 'manufacturing', label: t('pipeline.manufacturing') },
        ]}
      />

      <section>
        <SectionTitle
          hint={t('manufacturing.panelsUsed', { count: data.nesting.panels.length })}
        >
          {t('manufacturing.cutPlan')}
        </SectionTitle>

        {data.nesting.unplaced.length > 0 && (
          // Une pièce qu'aucun panneau ne peut recevoir est dite, pas tue : un plan
          // amputé d'une pièce a l'air complet.
          <p className="mb-3 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-900">
            {t('manufacturing.unplaced', {
              parts: [...new Set(data.nesting.unplaced)].join(', '),
            })}
          </p>
        )}

        <ul className="flex flex-col gap-6">
          {data.nesting.panels.map((panel, index) => (
            <li key={index}>
              <div className="mb-2 flex flex-wrap items-center gap-4">
                <DataPoint
                  label={t('manufacturing.yield')}
                  value={`${(panel.utilisation * 100).toFixed(1)} %`}
                />
                <DataPoint
                  label={t('manufacturing.board')}
                  value={`${panel.format.lengthMm}×${panel.format.widthMm}×${panel.thicknessMm}`}
                />
                <DataPoint
                  label={t('manufacturing.trim')}
                  value={`${panel.trimMm} mm`}
                />
              </div>
              <p className="mb-1 hidden text-sm text-ink-variant">
                {t('manufacturing.panel', {
                  material: t(`material.${panel.material}`),
                  thickness: panel.thicknessMm,
                  length: panel.format.lengthMm,
                  width: panel.format.widthMm,
                  utilisation: (panel.utilisation * 100).toFixed(1),
                })}
              </p>
              <PanelDrawing panel={panel} />
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {/* Des boutons, pas des liens : un lien de navigateur ne porte pas le jeton, et
              l'API rendrait un 401 à la place du fichier. */}
          <DownloadButton
            label={t('manufacturing.downloadCsv')}
            download={() => downloadCutList(files, projectId, data.project.name)}
          />
          <DownloadButton
            label={t('manufacturing.downloadCutPlan')}
            download={() => downloadCutPlan(files, projectId, data.project.name)}
          />
          <button
            type="button"
            className="rounded bg-primary px-3 py-1 text-white disabled:opacity-50"
            onClick={() => freeze.mutate()}
            disabled={freeze.isPending}
          >
            {freeze.isPending ? t('manufacturing.freezing') : t('manufacturing.freeze')}
          </button>
          {freeze.isSuccess && (
            <span className="self-center text-success">
              {t('manufacturing.frozen')}
            </span>
          )}
        </div>
      </section>

      <section>
        <SectionTitle>{t('exports.title')}</SectionTitle>
        <Exports projectId={projectId} />
      </section>

      <section>
        <SectionTitle>{t('manufacturing.materials')}</SectionTitle>
        <ul className="flex flex-col gap-1 text-sm">
          {data.bill.panels.map((line, index) => (
            <li key={index}>
              {t('manufacturing.panelLine', {
                count: line.quantity,
                material: t(`material.${line.material}`),
                thickness: line.thicknessMm,
                length: line.format.lengthMm,
                width: line.format.widthMm,
              })}
            </li>
          ))}
          <li>
            {/* Le séparateur décimal vient de la locale, jamais d'un `toFixed` : « 18.37 »
                est faux en français, et I18N.md §8 l'interdit. */}
            {t('manufacturing.edgeBanding', {
              metres: new Intl.NumberFormat(i18n.language, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(data.bill.edgeBandingMm / 1000),
            })}
          </li>
          {data.bill.accessories.map((line) => (
            <li key={line.key}>
              {t(`accessory.${line.key}`)} × {line.quantity}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionTitle>{t('manufacturing.assembly')}</SectionTitle>
        <ol className="flex flex-col gap-3 text-sm">
          {data.assembly.map((step) => (
            <li key={step.key} className="rounded-md border border-hairline p-3">
              <p className="font-medium">
                {t('manufacturing.step', { index: step.index, total: step.total })}
              </p>
              <p>{t(`assembly.${step.key}`)}</p>
              <p className="text-ink-variant">
                {step.parts.map((part) => `${part.id} ×${part.quantity}`).join(', ')}
              </p>
              {step.fastener && (
                <p className="text-ink-variant">
                  {t(`accessory.${step.fastener.key}`)} × {step.fastener.quantity}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* Le devis n'est rendu qu'à qui a le droit de voir les coûts : le serveur ne
          l'envoie pas aux autres, et l'interface n'a pas à décider à sa place. */}
      {data.quotation && (
        <section>
          <SectionTitle>{t('manufacturing.quotation')}</SectionTitle>

          <p className="mb-3 max-w-2xl text-sm text-ink-variant">
            {t('manufacturing.priceHelp')}
          </p>

          <PriceEditor
            lines={data.quotation.lines}
            currency={data.quotation.currency}
            projectId={projectId}
          />

          <p className="mt-3 text-sm">
            {data.quotation.total
              ? t('manufacturing.total', {
                  amount: money(data.quotation.total, i18n.language),
                })
              : // Un total partiel se lit comme un total.
                t('manufacturing.incomplete', {
                  count: data.quotation.missing.length,
                })}
          </p>
        </section>
      )}

      <p className="text-xs text-ink-variant">
        {t('manufacturing.dimensionsIn', {
          example: format(data.cut_list[0]?.lengthMm ?? 0),
        })}
      </p>
    </div>
  );
}

function PanelDrawing({ panel }: { panel: NestedPanel }) {
  const { t } = useTranslation();

  const svg = cutPlanSvg(panel, {
    title: '',
    panel: () => '',
    part: (placement) => `${placement.sizeXMm} × ${placement.sizeYMm}`,
  });

  return (
    <div
      className="overflow-x-auto rounded-md border border-hairline"
      role="img"
      aria-label={t('manufacturing.cutPlan')}
      // Le SVG vient de `@neftya/drawing`, qui échappe ce qu'il insère : aucune donnée
      // utilisateur n'y entre sans passer par cet échappement.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function money(amount: Money, locale: string): string {
  return formatMoney(amount, locale);
}
