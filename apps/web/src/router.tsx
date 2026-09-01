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
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CubeIcon,
  PlanIcon,
  SettingsIcon,
} from './ui/icons.js';
import { useMediaQuery } from './ui/useMediaQuery.js';
import { usePersisted } from './ui/usePersisted.js';
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
  const [stored, setStored] = usePersisted<boolean>(
    'neftya.sidebarCollapsed',
    false,
    (raw) => (typeof raw === 'boolean' ? raw : null),
  );

  // Sous `lg`, la barre est horizontale : le repli n'y a pas de sens, et un état hérité
  // d'un grand écran ne doit pas la mutiler sur un téléphone.
  const wide = useMediaQuery('(min-width: 1024px)');
  const collapsed = wide && stored;

  return (
    <div className="relative flex min-h-screen bg-canvas text-ink">
      {/* La couche de fond de plan : derrière tout, et sans capture de clic. */}
      <div className="blueprint-grid pointer-events-none fixed inset-0 z-0" />

      <SideNav collapsed={collapsed} onToggle={() => setStored(!stored)} />

      <div
        className={`relative z-10 flex min-h-screen flex-1 flex-col transition-[padding] ${
          collapsed ? 'lg:pl-16' : 'lg:pl-[280px]'
        }`}
      >
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * La barre latérale.
 *
 * Largeur fixe de 280 px, comme le veut le système : la zone de travail garde tout le
 * reste. Sous `lg` elle passe en barre horizontale — 280 px de large sur un téléphone de
 * 375, ce serait les trois quarts de l'écran pour une navigation à trois entrées.
 */
function SideNav({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-20 flex items-center gap-2 border-b border-hairline bg-surface px-4 py-2 transition-[width] lg:inset-y-0 lg:right-auto lg:h-screen lg:flex-col lg:items-stretch lg:gap-0 lg:border-r lg:border-b-0 lg:px-0 lg:py-margin-desktop ${
        collapsed ? 'lg:w-16' : 'lg:w-[280px]'
      }`}
    >
      <Link
        to="/"
        className={`flex items-center gap-3 lg:mb-8 ${collapsed ? 'lg:justify-center lg:px-0' : 'px-gutter'}`}
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-outline-variant bg-surface-high text-primary"
        >
          <CubeIcon />
        </span>
        {/* Repliée, la barre garde sa marque et perd ses mots : c'est le seul élément qui
            reste reconnaissable à 64 pixels. */}
        <span className={collapsed ? 'hidden' : 'hidden lg:block'}>
          <span className="block text-headline-md font-bold leading-none text-primary">
            {t('app.name')}
          </span>
          <span className="label-caps mt-1 block text-outline">{t('nav.tagline')}</span>
        </span>
      </Link>

      <div
        className={`ml-auto flex items-center gap-1 lg:ml-0 lg:flex-col lg:items-stretch lg:gap-1 ${
          collapsed ? 'lg:px-2' : 'lg:px-4'
        }`}
      >
        <NavItem to="/" icon={<PlanIcon />} collapsed={collapsed}>
          {t('nav.projects')}
        </NavItem>
        <NavItem to="/settings" icon={<SettingsIcon />} collapsed={collapsed}>
          {t('settings.title')}
        </NavItem>
      </div>

      <button
        type="button"
        onClick={onToggle}
        title={t(collapsed ? 'nav.expand' : 'nav.collapse')}
        aria-label={t(collapsed ? 'nav.expand' : 'nav.collapse')}
        aria-expanded={!collapsed}
        className={`mt-auto hidden items-center gap-3 rounded py-3 text-ink-variant transition-colors hover:bg-surface-low hover:text-ink lg:flex ${
          collapsed ? 'lg:mx-2 lg:justify-center' : 'lg:mx-4 lg:px-3'
        }`}
      >
        <span aria-hidden="true">
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </span>
        <span className={`label-caps ${collapsed ? 'hidden' : ''}`}>
          {t('nav.collapse')}
        </span>
      </button>
    </nav>
  );
}

/**
 * Une entrée de navigation.
 *
 * L'entrée active porte un filet à droite et un fond légèrement plus dense — le motif des
 * maquettes. C'est TanStack qui pose `data-status="active"` : aucune comparaison d'URL
 * écrite à la main, donc rien à corriger le jour où une route change.
 */
function NavItem({
  to,
  icon,
  collapsed,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  const label = typeof children === 'string' ? children : undefined;

  return (
    <Link
      to={to}
      activeOptions={{ exact: to === '/' }}
      // Repliée, l'entrée n'a plus que son icône : l'infobulle et le nom accessible
      // portent alors le libellé, faute de quoi la navigation deviendrait un rébus.
      {...(collapsed && label ? { title: label, 'aria-label': label } : {})}
      className={`label-caps flex items-center gap-3 rounded py-3 text-ink-variant transition-colors hover:bg-surface-low active:scale-[0.98] [&[data-status=active]]:bg-surface-high [&[data-status=active]]:font-bold [&[data-status=active]]:text-primary lg:[&[data-status=active]]:border-r-2 lg:[&[data-status=active]]:border-primary ${
        collapsed ? 'px-3 lg:justify-center lg:px-0' : 'px-3'
      }`}
    >
      <span aria-hidden="true" className="text-base">
        {icon}
      </span>
      <span className={collapsed ? 'hidden' : 'hidden sm:block'}>{children}</span>
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
