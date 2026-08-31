import { useState } from 'react';
import * as Slider from '@radix-ui/react-slider';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { useTranslation } from 'react-i18next';
import {
  materialKey,
  type MaterialKey,
  type ParsedFurnitureInput,
} from '@neftya/engine';
import { roundingIsNotable, stepFor } from '@neftya/units';
import { usePreferences } from '../preferences/PreferencesContext.js';
import { LIMITS, type DesignerAction } from './model.js';

/**
 * Le panneau de conception : dimensions, structure, matériaux.
 *
 * Chaque cote se règle au curseur **et** au clavier. Le curseur sert à explorer, la saisie
 * à poser une cote exacte — un menuisier qui veut 1847 mm ne le trouvera jamais au curseur.
 */

/** Le catalogue vient du moteur : une liste réécrite ici finirait par diverger. */
const MATERIALS: readonly MaterialKey[] = materialKey.options;

export interface ControlsProps {
  model: ParsedFurnitureInput;
  dispatch: (action: DesignerAction) => void;
}

export function Controls({ model, dispatch }: ControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          {t('designer.dimensions')}
        </h2>

        {(['widthMm', 'heightMm', 'depthMm'] as const).map((axis) => (
          <LengthControl
            key={axis}
            label={t(`designer.axis.${axis}`)}
            valueMm={model.dimensions[axis]}
            min={LIMITS[axis].min}
            max={LIMITS[axis].max}
            onChange={(valueMm) => dispatch({ type: 'dimension', axis, valueMm })}
          />
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          {t('designer.structure')}
        </h2>

        <CountControl
          label={t('designer.compartments')}
          value={model.compartments.length}
          min={LIMITS.compartments.min}
          max={LIMITS.compartments.max}
          onChange={(count) => dispatch({ type: 'compartments', count })}
        />

        <ol className="flex flex-col gap-3">
          {model.compartments.map((compartment, index) => (
            // La clé est l'indice : les compartiments n'ont pas d'identité propre, ils
            // sont définis par leur rang dans le meuble.
            <li key={index} className="rounded border border-stone-200 p-3">
              <p className="mb-2 text-sm font-medium">
                {t('designer.compartment', { index: index + 1 })}
              </p>
              <div className="flex flex-col gap-2">
                <CountControl
                  label={t('designer.shelves')}
                  value={compartment.shelves}
                  min={LIMITS.shelves.min}
                  max={LIMITS.shelves.max}
                  onChange={(count) => dispatch({ type: 'shelves', index, count })}
                />
                <CountControl
                  label={t('designer.drawers')}
                  value={compartment.drawers}
                  min={LIMITS.drawers.min}
                  max={LIMITS.drawers.max}
                  onChange={(count) => dispatch({ type: 'drawers', index, count })}
                />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          {t('designer.material')}
        </h2>

        <ToggleGroup.Root
          type="single"
          value={model.material}
          onValueChange={(material) => {
            // Radix rend une chaîne vide quand on déselectionne : un meuble sans matériau
            // n'existe pas.
            if (material)
              dispatch({ type: 'material', material: material as MaterialKey });
          }}
          className="flex flex-wrap gap-2"
        >
          {MATERIALS.map((material) => (
            <ToggleGroup.Item
              key={material}
              value={material}
              className="rounded border border-stone-300 px-3 py-1 text-sm data-[state=on]:border-emerald-700 data-[state=on]:bg-emerald-700 data-[state=on]:text-white"
            >
              {t(`material.${material}`)}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={model.hasBack}
            onChange={(event) =>
              dispatch({ type: 'back', hasBack: event.target.checked })
            }
          />
          {t('designer.hasBack')}
        </label>
      </section>
    </div>
  );
}

interface LengthControlProps {
  label: string;
  valueMm: number;
  min: number;
  max: number;
  onChange: (valueMm: number) => void;
}

function LengthControl({ label, valueMm, min, max, onChange }: LengthControlProps) {
  const { t } = useTranslation();
  const { format, parse, unitSystem } = usePreferences();
  const [draft, setDraft] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);

  const commit = (text: string) => {
    const parsed = parse(text);
    setDraft(null);

    // Une saisie incomprise ne devient pas une cote : le champ revient à la valeur du
    // modèle et le dit.
    if (parsed === null) {
      setRejected(true);
      return;
    }

    setRejected(false);
    onChange(parsed);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-sm">{label}</label>
        <input
          className="w-28 rounded border border-stone-300 px-2 py-1 text-right text-sm tabular-nums"
          value={draft ?? format(valueMm)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          aria-label={label}
        />
      </div>

      <Slider.Root
        className="relative flex h-5 w-full touch-none items-center"
        value={[valueMm]}
        min={min}
        max={max}
        step={stepFor(unitSystem)}
        onValueChange={([next]) => onChange(next as number)}
        aria-label={label}
      >
        <Slider.Track className="relative h-1 w-full rounded bg-stone-200">
          <Slider.Range className="absolute h-full rounded bg-emerald-700" />
        </Slider.Track>
        <Slider.Thumb className="block h-4 w-4 rounded-full border border-stone-400 bg-white shadow" />
      </Slider.Root>

      {rejected && <p className="text-xs text-red-700">{t('designer.badLength')}</p>}

      {/* L'écart d'arrondi impérial est dit, pas masqué : le modèle vaut autre chose que
          ce que le mètre affiche. */}
      {unitSystem === 'imperial' && roundingIsNotable(valueMm) && (
        <p className="text-xs text-amber-700">
          {t('designer.roundedDisplay', { exact: `${valueMm} mm` })}
        </p>
      )}
    </div>
  );
}

interface CountControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (count: number) => void;
}

function CountControl({ label, value, min, max, onChange }: CountControlProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-sm">{label}</label>
      <input
        type="number"
        className="w-20 rounded border border-stone-300 px-2 py-1 text-right text-sm tabular-nums"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
      />
    </div>
  );
}
