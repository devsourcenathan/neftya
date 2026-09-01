import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listExports, useApi } from '../api/projects.js';

/**
 * Les exports figés.
 *
 * Un export est un instantané : modèle, pièces, placement, nomenclature et devis au moment
 * où le plan est parti à l'atelier. Le projet a pu changer depuis — c'est précisément la
 * raison d'être de la liste.
 *
 * Ce que la liste **ne fait pas** : rejouer un export. Il faudrait une route qui rende
 * l'instantané, et il n'y en a pas encore ; annoncer un bouton qui n'existe pas serait pire
 * que de ne rien annoncer.
 *
 * @see docs/MANUFACTURING.md §6
 */
export function Exports({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation();
  const api = useApi();

  const exports = useQuery({
    queryKey: ['exports', projectId],
    queryFn: () => listExports(api, projectId),
  });

  if (exports.isPending || exports.isError) return null;
  if (exports.data.length === 0) {
    return <p className="text-sm text-muted">{t('exports.none')}</p>;
  }

  const dates = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <ul className="flex flex-col gap-1 text-sm">
      {exports.data.map((record) => (
        <li key={record.id} className="flex flex-wrap items-baseline gap-x-3">
          <span className="tabular-nums">
            {dates.format(new Date(record.created_at))}
          </span>
          <span className="uppercase text-muted">{record.kind}</span>
          {record.storage_object_id ? (
            <span className="text-success">{t('exports.stored')}</span>
          ) : (
            // Dit, pas tu : l'export existe et reste consultable, mais il n'est pas rangé
            // chez Sekuu Storage — souvent parce qu'aucune clé d'API n'est configurée.
            <span className="text-accent">{t('exports.notStored')}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
