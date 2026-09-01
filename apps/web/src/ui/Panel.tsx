import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeftIcon, ChevronRightIcon } from './icons.js';

/**
 * Un panneau repliable.
 *
 * Replié, il ne disparaît pas : il devient un bandeau étroit qui porte son nom à la
 * verticale et se rouvre d'un clic. Un panneau qui s'évanouirait laisserait l'utilisateur
 * sans moyen de le retrouver — c'est la faute classique des interfaces à volets.
 *
 * **Le dernier panneau ouvert ne peut pas être replié.** Tout replier laisserait un écran
 * vide, et un écran vide dont on ne sait pas sortir est pire qu'un panneau de trop.
 */
export function Panel({
  title,
  hint,
  side,
  collapsed,
  canCollapse,
  onToggle,
  children,
  className = '',
}: {
  title: string;
  hint?: ReactNode;
  /** De quel côté la flèche pointe une fois repliée. */
  side: 'left' | 'right';
  collapsed: boolean;
  canCollapse: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title={t('panel.expand', { panel: title })}
        aria-label={t('panel.expand', { panel: title })}
        aria-expanded={false}
        className="flex h-full w-11 shrink-0 flex-col items-center gap-3 rounded border border-hairline bg-surface py-3 text-ink-variant transition-colors hover:border-primary/40 hover:text-ink"
      >
        <span aria-hidden="true">
          {side === 'left' ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </span>
        {/* Le nom reste lisible, à la verticale : un bandeau muet ne dit pas ce qu'il
            cache. */}
        <span className="label-caps [writing-mode:vertical-rl]">{title}</span>
      </button>
    );
  }

  return (
    <section
      className={`flex min-h-0 flex-col rounded border border-hairline bg-surface ${className}`}
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <h2 className="label-caps text-ink-variant">{title}</h2>

        <span className="flex items-baseline gap-3">
          {hint && <span className="technical text-xs text-outline">{hint}</span>}
          <button
            type="button"
            onClick={onToggle}
            disabled={!canCollapse}
            aria-expanded
            title={
              canCollapse ? t('panel.collapse', { panel: title }) : t('panel.lastOpen')
            }
            aria-label={
              canCollapse ? t('panel.collapse', { panel: title }) : t('panel.lastOpen')
            }
            className="hidden rounded p-1 text-ink-variant transition-colors hover:bg-surface-low hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 lg:inline-flex"
          >
            <span aria-hidden="true">
              {side === 'left' ? <ChevronLeftIcon /> : <ChevronRightIcon />}
            </span>
          </button>
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
    </section>
  );
}
