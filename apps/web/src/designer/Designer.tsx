import {
  Suspense,
  lazy,
  useCallback,
  useDeferredValue,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { build, cutList, type ParsedFurnitureInput } from '@neftya/engine';
import {
  technicalDrawing,
  technicalViewSvg,
  VIEWS,
  type ViewName,
} from '@neftya/drawing';
import { UNIT_SYSTEMS } from '@neftya/units';
import { usePreferences } from '../preferences/PreferencesContext.js';
import { Controls } from './Controls.js';
import { PartDetails, PartList } from './PartDetails.js';
import { reduce, type DesignerAction } from './model.js';

/**
 * Le mode conception.
 *
 * **Le moteur tourne dans le navigateur.** Faire glisser un curseur reconstruit le meuble
 * localement et redessine la 3D, sans aller-retour réseau : c'est la raison d'être du
 * moteur pur, et la condition de la fluidité.
 *
 * `useDeferredValue` sépare deux cadences : le curseur suit le doigt à la fréquence de
 * l'écran, la reconstruction du meuble suit dès que React a du temps. Sur un appareil
 * lent, le curseur ne saccade pas — la 3D prend simplement un cran de retard.
 *
 * @see docs/IMPLEMENTATION.md — phase 3
 */

/**
 * Three.js pèse un mégaoctet à lui seul. La liste de projets n'en a aucun besoin : la scène
 * est chargée à l'ouverture d'un projet, pas à l'ouverture de l'application. Sur un mobile
 * d'entrée de gamme et un réseau lent, c'est la différence entre une page qui s'affiche et
 * une page qui attend.
 */
const Scene = lazy(async () => ({
  default: (await import('../viewer/Scene.js')).Scene,
}));

export interface DesignerProps {
  initialModel: ParsedFurnitureInput;
  onSave?: (model: ParsedFurnitureInput) => void;
  saving?: boolean;
}

export function Designer({ initialModel, onSave, saving = false }: DesignerProps) {
  const { t } = useTranslation();
  const { unitSystem, setUnitSystem, format } = usePreferences();

  const [model, dispatch] = useReducer(reduce, initialModel);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [explode, setExplode] = useState(0);
  const [mode, setMode] = useState<'3d' | '2d'>('3d');
  const [view, setView] = useState<ViewName>('front');

  const deferredModel = useDeferredValue(model);
  const furniture = useMemo(() => build(deferredModel), [deferredModel]);
  const rows = useMemo(() => cutList(furniture), [furniture]);

  // Les vues cotées ne sont calculées que si on les regarde : coter six vues à chaque
  // glissement de curseur coûterait pour rien tant qu'on est en 3D.
  const drawing = useMemo(
    () => (mode === '2d' ? technicalDrawing(furniture, { label: format }) : null),
    [mode, furniture, format],
  );

  const act = useCallback((action: DesignerAction) => dispatch(action), []);

  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[320px_1fr_300px]">
      <aside className="order-2 overflow-y-auto lg:order-1">
        <Controls model={model} dispatch={act} />
      </aside>

      <section className="order-1 flex min-h-[50vh] flex-col gap-2 lg:order-2">
        <div className="flex items-center gap-2">
          {/* La 3D montre le meuble, la 2D le mesure. Les deux sont des vues du même
              modèle, calculées par le même moteur : basculer ne recharge rien. */}
          {(['3d', '2d'] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setMode(candidate)}
              className={`rounded border px-3 py-1 text-sm ${
                candidate === mode
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : 'border-stone-300 hover:border-emerald-700'
              }`}
            >
              {t(`designer.mode.${candidate}`)}
            </button>
          ))}

          {mode === '2d' && (
            <select
              className="ml-2 rounded border border-stone-300 px-2 py-1 text-sm"
              value={view}
              aria-label={t('plans.view')}
              onChange={(event) => setView(event.target.value as ViewName)}
            >
              {VIEWS.map((name) => (
                <option key={name} value={name}>
                  {t(`plans.views.${name}`)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex-1 overflow-hidden rounded-lg border border-stone-200">
          {mode === '3d' ? (
            <Suspense
              fallback={
                <p className="p-4 text-sm text-stone-500">{t('state.loading')}</p>
              }
            >
              <Scene
                furniture={furniture}
                selectedPartId={selectedPartId}
                onSelect={setSelectedPartId}
                explode={explode}
              />
            </Suspense>
          ) : (
            <div
              className="h-full overflow-auto bg-white p-2"
              role="img"
              aria-label={t(`plans.views.${view}`)}
              // Le SVG vient de `@neftya/drawing`, qui échappe ce qu'il insère.
              dangerouslySetInnerHTML={{
                __html: technicalViewSvg(
                  drawing?.views.find((candidate) => candidate.view === view) ??
                    (drawing?.views[0] as NonNullable<typeof drawing>['views'][number]),
                ),
              }}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label
            className={`flex items-center gap-2 ${mode === '3d' ? '' : 'opacity-40'}`}
          >
            {t('designer.explode')}
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={explode}
              disabled={mode !== '3d'}
              onChange={(event) => setExplode(Number(event.target.value))}
              aria-label={t('designer.explode')}
            />
          </label>

          <fieldset className="flex items-center gap-2">
            <legend className="sr-only">{t('units.legend')}</legend>
            {UNIT_SYSTEMS.map((system) => (
              <label key={system} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="unit-system"
                  checked={unitSystem === system}
                  onChange={() => setUnitSystem(system)}
                />
                {t(`units.${system}`)}
              </label>
            ))}
          </fieldset>

          {onSave && (
            <button
              type="button"
              className="ml-auto rounded bg-emerald-700 px-3 py-1 text-white disabled:opacity-50"
              onClick={() => onSave(model)}
              disabled={saving}
            >
              {saving ? t('action.saving') : t('action.save')}
            </button>
          )}
        </div>

        {furniture.warnings.length > 0 && (
          <ul className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
            {furniture.warnings.map((warning, index) => (
              <li key={index}>{t(`warning.${warning.code}`)}</li>
            ))}
          </ul>
        )}
      </section>

      <aside className="order-3 flex flex-col gap-4 overflow-y-auto">
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
            {t('designer.selection')}
          </h2>
          <PartDetails furniture={furniture} selectedPartId={selectedPartId} />
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
            {t('designer.parts', { count: rows.length })}
          </h2>
          <PartList
            parts={furniture.parts}
            selectedPartId={selectedPartId}
            onSelect={setSelectedPartId}
          />
        </div>
      </aside>
    </div>
  );
}
