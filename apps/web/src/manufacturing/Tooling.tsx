import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ToolKey, ToolLine, Tooling as Result } from '@neftya/engine';
import { Badge, SectionTitle } from '../ui/index.js';
import { Term } from '../ui/Term.js';

/** Les outils dont le nom ne dit rien tant qu'on ne les a pas vus. */
const EXPLAINED: Partial<Record<ToolKey, string>> = {
  forstner_35: 'forstner',
  countersink: 'countersink',
};

/**
 * Ce qu'il faut pour le faire.
 *
 * **Placée en tête du dossier, avant le plan de découpe.** C'est la question qu'on se pose
 * avant d'acheter des panneaux, pas après : découvrir au montage qu'un boîtier de charnière
 * demande une mèche de 35 qu'on n'a pas, c'est découvrir que le meuble s'arrête là.
 *
 * Chaque outil dit pourquoi il est là. « Une mèche de 5 » ne permet pas de décider ; « pour
 * les taquets d'étagère » le permet — on renonce aux étagères réglables, ou on achète la
 * mèche.
 */
export function Tooling({ tooling }: { tooling: Result }) {
  const { t } = useTranslation();

  const demanding = tooling.demanding.map((key) => toolName(t, key)).join(', ');

  return (
    <section>
      {/* Le niveau est porté par la pastille juste dessous : le répéter en titre le
          dirait deux fois sans rien ajouter. */}
      <SectionTitle>{t('tooling.title')}</SectionTitle>

      <p className="mb-4 flex flex-wrap items-baseline gap-2 text-sm text-ink-variant">
        <Badge tone={tooling.level === 'beginner' ? 'success' : 'warning'}>
          {t(`tooling.${tooling.level}`)}
        </Badge>
        <span className="max-w-prose">
          {tooling.level === 'beginner'
            ? t('tooling.beginnerHint')
            : t(`tooling.${tooling.level}Hint`, { tools: demanding })}
        </span>
      </p>

      <ul className="flex flex-col gap-1.5 text-sm">
        {tooling.tools.map((tool) => (
          <li key={tool.key} className="flex flex-wrap items-baseline gap-x-2">
            <span className={tool.optional ? 'text-ink-variant' : 'text-ink'}>
              {EXPLAINED[tool.key] ? (
                <Term term={EXPLAINED[tool.key] as string} />
              ) : (
                toolName(t, tool.key)
              )}
            </span>

            {tool.reasons.length > 0 && (
              <span className="text-xs text-outline">
                {t('tooling.for', {
                  reasons: tool.reasons
                    .map((reason) => t(`purpose.${reason}`))
                    .join(', '),
                })}
              </span>
            )}

            {/* La scie à panneaux au même rang que le mètre ruban découragerait pour rien :
                le magasin coupe, et c'est tout l'objet de la fiche de débit. */}
            {tool.optional && (
              <span className="text-xs text-outline">
                — {t('tooling.optional')}
                {tool.key === 'saw' && `, ${t('tooling.sawHint')}`}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Le nom d'un outil.
 *
 * Les mèches portent leur diamètre dans leur clé — `bit_5_5` — et une entrée de traduction
 * par diamètre dirait six fois la même chose, en laissant tomber le jour où le moteur
 * percerait un diamètre de plus. Le même raisonnement que pour les barres de poignée.
 */
export function toolName(t: TFunction, key: ToolKey): string {
  if (!key.startsWith('bit_')) return t(`tool.${key}`);

  return t('tool.bit', { diameter: key.slice('bit_'.length).replace('_', ',') });
}

/** Rendu exporté pour les tests : l'ordre et les raisons sont ce qui se lit. */
export type { ToolLine };
