import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { build } from '@neftya/engine';
import {
  technicalDrawing,
  technicalViewSvg,
  VIEWS,
  type ViewName,
} from '@neftya/drawing';
import { ApiRequestError } from '../api/client.js';
import { getProject, useApi } from '../api/projects.js';
import { usePreferences } from '../preferences/PreferencesContext.js';

/**
 * Les plans techniques cotés.
 *
 * Ils sont calculés **dans le navigateur**, à partir du modèle : projection et cotation
 * sont des fonctions pures, et le serveur en produit exactement les mêmes à l'impression.
 * Faire descendre six vues cotées par le réseau à chaque changement d'unité serait payer un
 * aller-retour pour un calcul qui prend une milliseconde.
 *
 * À l'écran, les cotes suivent le système d'unités du lecteur. Sur le PDF, elles sont en
 * millimètres : il part à l'atelier, où la préférence de celui qui a dessiné n'a pas cours.
 *
 * @see docs/VISUALIZATION.md §3
 */
export function Plans({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { format } = usePreferences();
  const api = useApi();
  const [view, setView] = useState<ViewName>('front');

  const project = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => getProject(api, projectId),
  });

  const drawing = useMemo(
    () =>
      project.data
        ? technicalDrawing(build(project.data.model), { label: format })
        : null,
    [project.data, format],
  );

  if (project.isPending)
    return <p className="p-6 text-sm text-stone-500">{t('state.loading')}</p>;

  if (project.isError || !drawing) {
    return (
      <p className="p-6 text-sm text-red-700">
        {project.error instanceof ApiRequestError
          ? project.error.message
          : t('state.error')}
      </p>
    );
  }

  const current = drawing.views.find((candidate) => candidate.view === view);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setView(name)}
            className={`rounded border px-3 py-1 text-sm ${
              name === view
                ? 'border-emerald-700 bg-emerald-700 text-white'
                : 'border-stone-300 hover:border-emerald-700'
            }`}
          >
            {t(`plans.views.${name}`)}
          </button>
        ))}

        <a
          className="ml-auto rounded border border-stone-300 px-3 py-1 text-sm hover:border-emerald-700"
          href={`${import.meta.env['VITE_API_URL'] ?? ''}/v1/projects/${projectId}/plans.pdf`}
        >
          {t('plans.download')}
        </a>
      </div>

      {current && (
        <div
          className="overflow-x-auto rounded border border-stone-200 bg-white p-2"
          role="img"
          aria-label={t(`plans.views.${view}`)}
          // Le SVG vient de `@neftya/drawing`, qui échappe ce qu'il insère — étiquettes de
          // cotes comprises.
          dangerouslySetInnerHTML={{ __html: technicalViewSvg(current) }}
        />
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
          {t('plans.parts')}
        </h2>

        <table className="w-full max-w-3xl text-sm">
          <thead>
            <tr className="text-left text-stone-500">
              <th className="py-1">{t('part.id')}</th>
              <th className="py-1">{t('part.role')}</th>
              <th className="py-1 text-right">{t('part.length')}</th>
              <th className="py-1 text-right">{t('part.width')}</th>
              <th className="py-1 text-right">{t('part.thickness')}</th>
              <th className="py-1 text-right">{t('part.quantity')}</th>
            </tr>
          </thead>
          <tbody>
            {drawing.parts.map((part) => (
              <tr key={part.partId} className="border-t border-stone-100">
                <td className="py-1 font-mono">{part.partId}</td>
                <td className="py-1">{t(`part.roles.${part.role}`)}</td>
                <td className="py-1 text-right tabular-nums">
                  {format(part.lengthMm)}
                </td>
                <td className="py-1 text-right tabular-nums">{format(part.widthMm)}</td>
                <td className="py-1 text-right tabular-nums">
                  {format(part.thicknessMm)}
                </td>
                <td className="py-1 text-right tabular-nums">{part.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-stone-500">{t('plans.pdfInMillimetres')}</p>
    </div>
  );
}
