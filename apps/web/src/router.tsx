import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Manufacturing } from './manufacturing/Manufacturing.js';
import { Plans } from './plans/Plans.js';
import { Settings } from './settings/Settings.js';
import { ProjectDesigner } from './routes/ProjectDesigner.js';
import { Projects } from './routes/Projects.js';

/**
 * Les routes.
 *
 * L'arbre est déclaré ici, en un seul endroit : le typage des paramètres en découle, et un
 * lien vers une route qui n'existe pas ne compile pas.
 */

const rootRoute = createRootRoute({
  component: Shell,
});

function Shell() {
  const { t } = useTranslation();

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <header className="border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-5">
          <Link to="/" className="font-display text-lg text-ink">
            {t('app.name')}
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            <NavItem to="/">{t('nav.projects')}</NavItem>
          </nav>

          <Link
            to="/settings"
            className="ml-auto rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-line/60 hover:text-ink"
          >
            {t('settings.title')}
          </Link>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

/** Un onglet de navigation, qui se marque lui-même quand il est actif. */
function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      // TanStack pose `data-status="active"` sur le lien de la route courante : c'est lui
      // qui décide, pas une comparaison d'URL écrite à la main.
      className="rounded-md px-3 py-1.5 text-muted transition-colors hover:bg-line/60 hover:text-ink [&[data-status=active]]:bg-line/70 [&[data-status=active]]:text-ink"
      activeOptions={{ exact: true }}
    >
      {children}
    </Link>
  );
}

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Projects,
});

const designerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  component: function DesignerRoute() {
    const { projectId } = designerRoute.useParams();
    return <ProjectDesigner projectId={projectId} />;
  },
});

const manufacturingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/manufacturing',
  component: function ManufacturingRoute() {
    const { projectId } = manufacturingRoute.useParams();
    return <Manufacturing projectId={projectId} />;
  },
});

const plansRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/plans',
  component: function PlansRoute() {
    const { projectId } = plansRoute.useParams();
    return <Plans projectId={projectId} />;
  },
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: Settings,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    settingsRoute,
    projectsRoute,
    designerRoute,
    manufacturingRoute,
    plansRoute,
  ]),
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
