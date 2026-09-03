import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParsedFurnitureInput } from '@neftya/engine';
import { LIMITS, type DesignerAction } from './model.js';

/**
 * Le menu contextuel d'un compartiment.
 *
 * ## Ce qu'il peut proposer, et pourquoi pas davantage
 *
 * Le modèle est **paramétrique** : une pièce est une conséquence, pas un objet. « Supprimer
 * cette étagère » n'a pas de sens — le jour où le projet se rouvre, le moteur la
 * reconstruit à partir du même paramètre. Le menu agit donc sur le compartiment, et le dit :
 * *retirer une étagère de ce compartiment*.
 *
 * C'est aussi la phrase que dirait un menuisier, ce qui est bon signe.
 *
 * ## Ce qui est grisé plutôt qu'absent
 *
 * Une entrée qui disparaît fait douter de ce qu'on a vu ; une entrée grisée dit qu'elle
 * existe et pourquoi elle ne s'applique pas ici. Le dernier compartiment ne se supprime
 * donc pas — il se montre inerte.
 */

export interface MenuTarget {
  /** Le compartiment visé, tel que le moteur l'a marqué sur l'instance cliquée. */
  compartment: number;
  /** En pixels de la fenêtre : c'est là que le doigt ou la souris se trouvait. */
  xPx: number;
  yPx: number;
}

export function CompartmentMenu({
  target,
  model,
  dispatch,
  onClose,
}: {
  target: MenuTarget;
  model: ParsedFurnitureInput;
  dispatch: (action: DesignerAction) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointer = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) onClose();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [onClose]);

  const compartment = model.compartments[target.compartment];
  if (!compartment) return null;

  const run = (action: DesignerAction) => {
    dispatch(action);
    onClose();
  };

  const step = (type: 'shelves' | 'drawers' | 'doors', by: number): DesignerAction => ({
    type,
    index: target.compartment,
    count: compartment[type] + by,
  });

  return (
    <div
      ref={container}
      role="menu"
      // Le menu suit le clic, comme tout menu contextuel. Bordé à la fenêtre pour qu'un
      // clic dans le coin bas-droit n'en pousse pas la moitié hors de l'écran.
      style={{
        left: Math.min(target.xPx, window.innerWidth - 240),
        top: Math.min(target.yPx, window.innerHeight - 320),
      }}
      className="fixed z-40 w-56 rounded border border-outline-variant bg-surface p-1 shadow-lg"
    >
      <p className="label-caps px-3 pt-2 pb-1 text-outline">
        {t('designer.compartmentNumber', { number: target.compartment + 1 })}
      </p>

      {(['shelves', 'drawers', 'doors'] as const).map((kind) => (
        <div key={kind} className="flex items-center justify-between gap-2 px-3 py-1">
          <span className="text-sm text-ink">{t(`designer.${kind}`)}</span>
          <span className="flex items-center gap-1">
            <Step
              label={t(`menu.remove.${kind}`)}
              disabled={compartment[kind] <= LIMITS[kind].min}
              onClick={() => run(step(kind, -1))}
            >
              −
            </Step>
            <span className="w-5 text-center text-sm tabular-nums text-ink">
              {compartment[kind]}
            </span>
            <Step
              label={t(`menu.add.${kind}`)}
              disabled={compartment[kind] >= LIMITS[kind].max}
              onClick={() => run(step(kind, 1))}
            >
              +
            </Step>
          </span>
        </div>
      ))}

      <div className="mt-1 border-t border-hairline pt-1">
        <Item
          disabled={model.compartments.length >= LIMITS.compartments.max}
          onClick={() =>
            run({ type: 'duplicateCompartment', index: target.compartment })
          }
        >
          {t('menu.duplicate')}
        </Item>
        <Item
          onClick={() => run({ type: 'applyToAll', index: target.compartment })}
          disabled={model.compartments.length < 2}
        >
          {t('menu.applyToAll')}
        </Item>
        <Item
          // Le chemin du retour : sans lui, une largeur posée en tirant un séparateur ne
          // se retire plus qu'en annulant — et une annulation ne se rattrape pas trois
          // séances plus tard.
          disabled={model.compartments.every((entry) => entry.widthMm === undefined)}
          onClick={() => run({ type: 'evenWidths' })}
        >
          {t('menu.evenWidths')}
        </Item>
        <Item
          tone="danger"
          // Un meuble sans compartiment n'est plus un meuble.
          disabled={model.compartments.length <= LIMITS.compartments.min}
          onClick={() => run({ type: 'removeCompartment', index: target.compartment })}
        >
          {t('menu.remove.compartment')}
        </Item>
      </div>
    </div>
  );
}

function Item({
  onClick,
  disabled,
  tone,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone?: 'danger';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`block w-full rounded px-3 py-2 text-left text-sm transition-colors hover:bg-surface-low disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
        tone === 'danger' ? 'text-danger' : 'text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function Step({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded border border-outline-variant text-sm text-ink transition-colors hover:bg-surface-low disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
