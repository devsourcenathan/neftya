import { useTranslation } from 'react-i18next';
import { build } from '@neftya/engine';
import { technicalDrawing, technicalViewSvg } from '@neftya/drawing';
import { redirectToPortal } from '../sekuu/session.js';
import { Button, Card } from '../ui/index.js';

/**
 * La page qu'un visiteur non connecté voit.
 *
 * Elle ne porte **aucun champ d'identifiant** : la connexion et l'inscription vivent sur
 * le portail de la plateforme, et un produit qui affiche un champ de mot de passe voit
 * passer un mot de passe. Les deux boutons y renvoient.
 *
 * Le dessin n'est pas une image : c'est le moteur qui le calcule au chargement, avec le
 * même code que l'application. Montrer une capture d'écran d'un plan qu'on ne sait pas
 * produire serait la première promesse fausse.
 *
 * @see docs/SEKUU.md §7
 * @see docs/BRIEF.md §2
 */
export function Landing() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-canvas">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-sans text-xl text-ink">{t('app.name')}</span>
        <div className="flex items-center gap-2">
          <Button tone="ghost" onClick={() => redirectToPortal('login')}>
            {t('auth.signIn')}
          </Button>
          <Button tone="primary" onClick={() => redirectToPortal('register')}>
            {t('landing.createAccount')}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20">
        <section className="grid items-center gap-10 py-12 lg:grid-cols-2 lg:py-20">
          <div>
            <h1 className="font-sans text-4xl leading-tight text-ink sm:text-5xl">
              {t('landing.headline')}
            </h1>
            <p className="mt-5 max-w-lg text-lg text-ink-variant">
              {t('landing.subhead')}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button tone="primary" onClick={() => redirectToPortal('register')}>
                {t('landing.start')}
              </Button>
              <Button onClick={() => redirectToPortal('login')}>
                {t('landing.haveAccount')}
              </Button>
            </div>

            <p className="mt-4 text-sm text-ink-variant">{t('landing.platformNote')}</p>
          </div>

          <Card className="overflow-hidden p-4">
            <Preview />
            <p className="mt-3 text-center text-xs text-ink-variant">
              {t('landing.previewNote')}
            </p>
          </Card>
        </section>

        <section className="grid gap-5 border-t border-hairline py-14 sm:grid-cols-3">
          {(['dimensions', 'cutplan', 'quote'] as const).map((key) => (
            <div key={key}>
              <h2 className="font-sans text-lg text-ink">
                {t(`landing.features.${key}.title`)}
              </h2>
              <p className="mt-2 text-sm text-ink-variant">
                {t(`landing.features.${key}.body`)}
              </p>
            </div>
          ))}
        </section>

        <section className="border-t border-hairline py-14">
          <h2 className="font-sans text-2xl text-ink">{t('landing.honestTitle')}</h2>
          <p className="mt-3 max-w-2xl text-ink-variant">{t('landing.honestBody')}</p>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto max-w-6xl px-6 py-6 text-sm text-ink-variant">
          {t('landing.footer')}
        </div>
      </footer>
    </div>
  );
}

/**
 * Le meuble de démonstration, coté, calculé à l'instant.
 *
 * Une bibliothèque à deux compartiments : la même que celle du plan de découpe documenté.
 */
function Preview() {
  const { t } = useTranslation();

  const drawing = technicalDrawing(
    build({
      dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
      compartments: [
        { shelves: 1, drawers: 0 },
        { shelves: 1, drawers: 0 },
      ],
    }),
    { label: (valueMm) => `${valueMm}` },
  );

  const front = drawing.views.find((view) => view.view === 'front');
  if (!front) return null;

  return (
    <div
      className="[&_svg]:h-auto [&_svg]:w-full"
      role="img"
      aria-label={t('landing.previewAlt')}
      dangerouslySetInnerHTML={{ __html: technicalViewSvg(front) }}
    />
  );
}
