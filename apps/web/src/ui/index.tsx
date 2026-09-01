import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

/**
 * La trousse d'interface.
 *
 * Six composants, pas trente : ce sont ceux qui reviennent partout, et les avoir en un
 * seul endroit évite qu'un bouton d'un écran ait deux pixels de plus que celui d'à côté.
 * Chaque écran qui invente sa propre bordure ajoute une variante que personne ne maintient.
 */

type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger';

const TONES: Record<ButtonTone, string> = {
  primary: 'bg-ink text-paper hover:bg-ink/90',
  secondary: 'border border-line-strong bg-surface text-ink hover:border-ink/40',
  ghost: 'text-muted hover:bg-line/60 hover:text-ink',
  danger: 'border border-danger/30 text-danger hover:bg-danger/5',
};

export function Button({
  tone = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${TONES[tone]} ${className}`}
      {...props}
    />
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-panel border border-line bg-surface shadow-[0_1px_2px_rgba(28,25,23,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

/** Le titre d'un bloc. Toujours le même : un écran qui varie ses titres se lit mal. */
export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="font-display text-lg text-ink">{children}</h2>
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </div>
  );
}

/** Le libellé d'un réglage, avec son explication sous le champ plutôt qu'en infobulle. */
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
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}

export function Input({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink transition-colors placeholder:text-muted/70 focus:border-accent focus:outline-none ${className}`}
      {...props}
    />
  );
}

/**
 * Un écran vide dit quoi faire.
 *
 * « Aucun projet » laisse l'utilisateur devant une page blanche ; « partez d'un modèle »
 * lui donne son prochain geste. C'est la différence entre une absence et une impasse.
 */
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
    <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="font-display text-lg text-ink">{title}</p>
      <p className="max-w-md text-sm text-muted">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

/** Une pastille d'état : un avertissement, un compte, une devise. */
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'warning' | 'success';
}) {
  const tones = {
    neutral: 'bg-line/70 text-muted',
    accent: 'bg-accent-soft text-accent',
    warning: 'bg-amber-50 text-amber-800',
    success: 'bg-green-50 text-success',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
