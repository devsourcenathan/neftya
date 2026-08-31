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
    <div className="flex h-screen flex-col bg-white text-stone-900">
      <header className="flex items-center gap-4 border-b border-stone-200 px-4 py-2">
        <Link to="/" className="font-semibold">
          {t('app.name')}
        </Link>
        <span className="text-sm text-stone-500">{t('app.tagline')}</span>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
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

export const router = createRouter({
  routeTree: rootRoute.addChildren([
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
