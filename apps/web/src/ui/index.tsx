import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

/**
 * La trousse d'interface, réglée sur le Neftya Industrial Design System.
 *
 * Trois principes du système, et tout en découle :
 *
 *  - **des filets, pas des ombres** — un panneau se délimite par un trait d'un pixel ;
 *  - **un arrondi de 4 px** — présent, discret, « machiné » ;
 *  - **l'or ne sert qu'à ce qui est actif ou finalise** — un accent distribué ne désigne
 *    plus rien.
 *
 * @see stitch_neftya_furniture_design_platform/neftya_industrial_design_system/DESIGN.md
 */

type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'action' | 'danger';

const TONES: Record<ButtonTone, string> = {
  /** Bleu plein : l'action principale, celle qui fait avancer. */
  primary: 'bg-primary text-on-primary hover:bg-primary-container',
  /** Fantôme cerné : présent sans réclamer l'attention. */
  secondary: 'border border-primary/25 text-primary hover:border-primary/60',
  ghost: 'text-ink-variant hover:bg-surface-low hover:text-ink',
  /** Or : « finaliser », « exporter ». Réservé, sous peine de ne plus rien dire. */
  action: 'bg-accent-container text-on-accent-container hover:brightness-95',
  danger: 'border border-danger/30 text-danger hover:bg-danger-container/40',
};

export function Button({
  tone = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${TONES[tone]} ${className}`}
      {...props}
    />
  );
}

/** Un panneau. Délimité par un filet, jamais par une ombre. */
export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded border border-hairline bg-surface ${className}`}>
      {children}
    </div>
  );
}

/**
 * Le titre d'un bloc, en capitales espacées.
 *
 * C'est la convention des documents techniques, et elle donne au panneau latéral une
 * hiérarchie lisible sans recourir à des tailles de police différentes.
 */
export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-hairline pb-2">
      <h2 className="label-caps text-ink-variant">{children}</h2>
      {hint && <span className="technical text-xs text-outline">{hint}</span>}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-caps text-ink-variant">{label}</span>
      {children}
      {hint && <span className="text-xs text-outline">{hint}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}

/**
 * Un champ de saisie de données, comme dans un logiciel de CAO.
 *
 * Aplat gris clair, **filet inférieur seul au repos**, trait bleu complet à la saisie :
 * l'œil suit une colonne de champs sans être arrêté par quatre bordures par ligne.
 */
export function Input({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-t border-b border-outline-variant bg-surface-low px-3 py-2 text-sm text-ink transition-colors placeholder:text-outline focus:border-primary focus:bg-surface focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-headline-md text-ink">{title}</p>
      <p className="max-w-md text-sm text-ink-variant">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </Card>
  );
}

/** Une pastille d'état, dans l'esprit « Draft / Optimized / Ready to Cut » des maquettes. */
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'warning' | 'success';
}) {
  const tones = {
    neutral: 'bg-surface-high text-ink-variant',
    accent: 'bg-accent-container text-on-accent-container',
    warning: 'bg-accent-container text-on-accent-container',
    success: 'bg-success/10 text-success',
  };

  return (
    <span
      className={`label-caps inline-flex items-center gap-1 rounded px-2 py-1 ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Une donnée technique : son libellé en capitales, sa valeur en chasse fixe.
 *
 * C'est le motif des cartes du système — une grille de deux colonnes sous un filet — et
 * c'est ce qui permet de comparer deux projets sans les lire.
 */
export function DataPoint({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label-caps text-outline">{label}</span>
      <span className="technical text-ink">{value}</span>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-surface-high ${className}`}
      aria-hidden="true"
    />
  );
}

/** Un groupe de cartes en attente, de la forme de celles qui vont les remplacer. */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <ul className="grid gap-gutter sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>
          <Card className="flex flex-col gap-3 p-6">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <div className="mt-2 grid grid-cols-2 gap-3 border-t border-hairline pt-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** Deux ou trois choix exclusifs, tous visibles. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex rounded border border-hairline bg-surface p-0.5 ${className}`}
      role="tablist"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
          className={`label-caps inline-flex items-center gap-1.5 rounded px-3 py-2 transition-colors ${
            option.value === value
              ? 'bg-primary text-on-primary'
              : 'text-ink-variant hover:bg-surface-low'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Le fil d'étapes — « Conception → Matériaux → Fabrication ».
 *
 * Le système l'appelle une *pipeline* : elle dit où l'on en est dans un processus, pas où
 * l'on est dans une arborescence. Les étapes franchies restent lisibles, celle en cours est
 * en bleu, les suivantes s'effacent.
 */
export function Pipeline({
  steps,
  current,
}: {
  steps: readonly { key: string; label: ReactNode }[];
  current: string;
}) {
  const index = steps.findIndex((step) => step.key === current);

  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((step, position) => (
        <li key={step.key} className="flex items-center gap-2">
          <span
            className={`label-caps ${
              position < index
                ? 'text-ink-variant'
                : position === index
                  ? 'text-primary'
                  : 'text-outline-variant'
            }`}
          >
            {step.label}
          </span>
          {position < steps.length - 1 && (
            <span aria-hidden="true" className="text-outline-variant">
              ›
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
