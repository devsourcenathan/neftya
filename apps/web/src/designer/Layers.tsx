import { useTranslation } from 'react-i18next';
import type { Part } from '@neftya/engine';
import { usePreferences } from '../preferences/PreferencesContext.js';
import { Button } from '../ui/index.js';
import { EyeIcon, EyeOffIcon } from '../ui/icons.js';

/**
 * Le panneau de calques.
 *
 * Chaque pièce peut être masquée pour voir ce qu'elle cache : les portes devant un
 * aménagement, le fond derrière un caisson. C'est le geste que réclame une vue 3D dès
 * qu'un meuble est fermé — sans lui, un dressing à deux vantaux ne montre que ses vantaux.
 *
 * **Masquer est une affaire de vue, et rien d'autre.** Une pièce invisible reste dans la
 * liste de découpe, dans la nomenclature, dans le devis et dans l'export : on la cache pour
 * regarder derrière, pas pour cesser de la fabriquer. Confondre les deux produirait un plan
 * amputé d'une pièce que personne n'aurait décidé de retirer.
 */
export function Layers({
  parts,
  hidden,
  onToggle,
  onShowAll,
  selectedPartId,
  onSelect,
}: {
  parts: Part[];
  hidden: ReadonlySet<string>;
  onToggle: (partId: string) => void;
  onShowAll: () => void;
  selectedPartId: string | null;
  onSelect: (partId: string) => void;
}) {
  const { t } = useTranslation();
  const { format } = usePreferences();

  return (
    <div className="flex flex-col gap-2">
      {hidden.size > 0 && (
        <div className="flex items-center justify-between gap-2 rounded bg-accent-container px-2 py-1.5">
          <span className="label-caps text-on-accent-container">
            {t('layers.hiddenCount', { count: hidden.size })}
          </span>
          <Button tone="ghost" className="px-2 py-1" onClick={onShowAll}>
            {t('layers.showAll')}
          </Button>
        </div>
      )}

      <ul className="flex flex-col">
        {parts.map((part) => {
          const isHidden = hidden.has(part.id);

          return (
            <li
              key={part.id}
              className={`flex items-center gap-2 border-b border-hairline py-1.5 last:border-b-0 ${
                isHidden ? 'opacity-45' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => onToggle(part.id)}
                aria-pressed={!isHidden}
                aria-label={t(isHidden ? 'layers.show' : 'layers.hide', {
                  part: part.id,
                })}
                title={t(isHidden ? 'layers.show' : 'layers.hide', { part: part.id })}
                className="rounded p-1 text-ink-variant transition-colors hover:bg-surface-low hover:text-ink"
              >
                {isHidden ? <EyeOffIcon /> : <EyeIcon />}
              </button>

              <button
                type="button"
                onClick={() => onSelect(part.id)}
                className={`flex min-w-0 flex-1 items-baseline gap-2 rounded px-1.5 py-1 text-left transition-colors ${
                  part.id === selectedPartId
                    ? 'bg-primary text-on-primary'
                    : 'hover:bg-surface-low'
                }`}
              >
                <span className="technical shrink-0">{part.id}</span>
                <span className="truncate text-sm">{t(`part.roles.${part.role}`)}</span>
                <span className="technical ml-auto shrink-0 text-xs opacity-70">
                  {format(part.lengthMm)} × {format(part.widthMm)}
                </span>
                {part.quantity > 1 && (
                  <span className="technical shrink-0 text-xs opacity-70">
                    ×{part.quantity}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
