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
import { Badge, Button, Card, SectionTitle, SegmentedControl } from '../ui/index.js';
import { CubeIcon, RulerIcon, SaveIcon, WarningIcon } from '../ui/icons.js';
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
  // Sur téléphone, les trois panneaux ne tiennent pas côte à côte et les empiler oblige à
  // faire défiler trois écrans pour régler une cote. Un onglet à la fois ; au-dessus de
  // `lg`, les trois reviennent ensemble et l'onglet n'a plus d'effet.
  const [panel, setPanel] = useState<'settings' | 'view' | 'parts'>('view');

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
    <div className="flex h-full flex-col gap-4">
      <SegmentedControl
        className="self-start lg:hidden"
        value={panel}
        onChange={setPanel}
        options={[
          { value: 'settings', label: t('designer.tabs.settings') },
          { value: 'view', label: t('designer.tabs.view') },
          { value: 'parts', label: t('designer.tabs.parts') },
        ]}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[340px_1fr_320px]">
        <aside
          className={`order-2 overflow-y-auto lg:order-1 lg:block ${
            panel === 'settings' ? '' : 'hidden'
          }`}
        >
          <Card className="p-4">
            <Controls model={model} dispatch={act} />
          </Card>
        </aside>

        <section
          className={`order-1 flex min-h-[55vh] flex-col gap-3 lg:order-2 lg:flex ${
            panel === 'view' ? 'flex' : 'hidden'
          }`}
        >
          <div className="flex items-center gap-2">
            {/* La 3D montre le meuble, la 2D le mesure. Les deux sont des vues du même
              modèle, calculées par le même moteur : basculer ne recharge rien. */}
            <div className="inline-flex rounded-md border border-outline-variant bg-surface p-0.5">
              {(['3d', '2d'] as const).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => setMode(candidate)}
                  className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    candidate === mode
                      ? 'bg-primary text-on-primary'
                      : 'text-ink-variant hover:text-ink'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {candidate === '3d' ? <CubeIcon /> : <RulerIcon />}
                    {t(`designer.mode.${candidate}`)}
                  </span>
                </button>
              ))}
            </div>

            {mode === '2d' && (
              <select
                className="ml-1 rounded-md border border-outline-variant bg-surface px-2.5 py-1.5 text-sm"
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

          <div className="flex-1 overflow-hidden rounded border border-hairline bg-surface">
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
                className="h-full overflow-auto bg-surface p-3"
                role="img"
                aria-label={t(`plans.views.${view}`)}
                // Le SVG vient de `@neftya/drawing`, qui échappe ce qu'il insère.
                dangerouslySetInnerHTML={{
                  __html: technicalViewSvg(
                    drawing?.views.find((candidate) => candidate.view === view) ??
                      (drawing?.views[0] as NonNullable<
                        typeof drawing
                      >['views'][number]),
                  ),
                }}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-5 text-sm">
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
              <Button
                tone="primary"
                className="ml-auto"
                onClick={() => onSave(model)}
                disabled={saving}
              >
                <SaveIcon />
                {saving ? t('action.saving') : t('action.save')}
              </Button>
            )}
          </div>

          {furniture.warnings.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
              {furniture.warnings.map((warning, index) => (
                <li key={index} className="flex gap-2">
                  <Badge tone="warning">
                    <WarningIcon className="mr-1" />
                    {t('designer.warning')}
                  </Badge>
                  <span>{t(`warning.${warning.code}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside
          className={`order-3 flex-col gap-4 overflow-y-auto lg:flex ${
            panel === 'parts' ? 'flex' : 'hidden'
          }`}
        >
          <Card className="p-4">
            <SectionTitle>{t('designer.selection')}</SectionTitle>
            <PartDetails furniture={furniture} selectedPartId={selectedPartId} />
          </Card>

          <Card className="p-4">
            <SectionTitle hint={t('designer.partsCount', { count: rows.length })}>
              {t('designer.partsTitle')}
            </SectionTitle>
            <PartList
              parts={furniture.parts}
              selectedPartId={selectedPartId}
              onSelect={setSelectedPartId}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}
