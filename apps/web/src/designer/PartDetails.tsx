import { useTranslation } from 'react-i18next';
import type { Furniture, Part } from '@neftya/engine';
import { usePreferences } from '../preferences/PreferencesContext.js';

/**
 * Les cotes de la pièce sélectionnée.
 *
 * Ce sont **les cotes du moteur**, celles-là mêmes que le serveur recalcule pour la liste
 * de découpe : la même fonction pure tourne des deux côtés. C'est le critère de sortie de
 * la phase 3, et il se vérifie ici à l'œil comme il se vérifie en test côté API.
 */
export function PartDetails({
  furniture,
  selectedPartId,
}: {
  furniture: Furniture;
  selectedPartId: string | null;
}) {
  const { t } = useTranslation();
  const { format } = usePreferences();

  const part = furniture.parts.find((candidate) => candidate.id === selectedPartId);

  if (!part) {
    return <p className="text-sm text-stone-500">{t('designer.selectPart')}</p>;
  }

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-stone-500">{t('part.id')}</dt>
      {/* Un identifiant de pièce n'est pas traduit : c'est ce que le menuisier lit sur
          son plan. */}
      <dd className="font-mono">{part.id}</dd>

      <dt className="text-stone-500">{t('part.role')}</dt>
      <dd>{t(`part.roles.${part.role}`)}</dd>

      <dt className="text-stone-500">{t('part.length')}</dt>
      <dd className="tabular-nums">{format(part.lengthMm)}</dd>

      <dt className="text-stone-500">{t('part.width')}</dt>
      <dd className="tabular-nums">{format(part.widthMm)}</dd>

      <dt className="text-stone-500">{t('part.thickness')}</dt>
      <dd className="tabular-nums">{format(part.thicknessMm)}</dd>

      <dt className="text-stone-500">{t('part.quantity')}</dt>
      <dd className="tabular-nums">{part.quantity}</dd>

      <dt className="text-stone-500">{t('part.grain')}</dt>
      <dd>{t(`part.grains.${part.grain}`)}</dd>

      <dt className="text-stone-500">{t('part.edges')}</dt>
      <dd>
        {part.edges.length === 0
          ? t('part.noEdges')
          : part.edges.map((edge) => t(`part.edgeNames.${edge}`)).join(', ')}
      </dd>
    </dl>
  );
}

/** La liste des pièces, qui sert aussi de sélecteur pour qui ne veut pas viser en 3D. */
export function PartList({
  parts,
  selectedPartId,
  onSelect,
}: {
  parts: Part[];
  selectedPartId: string | null;
  onSelect: (partId: string) => void;
}) {
  const { t } = useTranslation();
  const { format } = usePreferences();

  return (
    <ul className="flex flex-col gap-1">
      {parts.map((part) => (
        <li key={part.id}>
          <button
            type="button"
            onClick={() => onSelect(part.id)}
            className={`flex w-full items-baseline justify-between gap-2 rounded px-2 py-1 text-left text-sm ${
              part.id === selectedPartId
                ? 'bg-emerald-700 text-white'
                : 'hover:bg-stone-100'
            }`}
          >
            <span className="font-mono">{part.id}</span>
            <span>{t(`part.roles.${part.role}`)}</span>
            <span className="tabular-nums">
              {format(part.lengthMm)} × {format(part.widthMm)}
            </span>
            <span className="tabular-nums text-stone-500">×{part.quantity}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
