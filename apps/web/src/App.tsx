import { useMemo } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiProvider, FileProvider, getSettings, useApi } from './api/projects.js';
import { createApiClient, createFileClient } from './api/client.js';
import { PreferencesProvider } from './preferences/PreferencesContext.js';
import { SessionProvider, useSession } from './sekuu/SessionContext.js';
import { redirectToPortal } from './sekuu/session.js';
import { Landing } from './landing/Landing.js';
import { Button, Card } from './ui/index.js';
import { router } from './router.js';

/**
 * La coquille : session, client d'API, préférences, routeur.
 *
 * L'ordre n'est pas arbitraire. Rien ne peut appeler l'API avant qu'une organisation soit
 * active, parce qu'une requête sans `org` serait refusée — c'est le piège numéro un de
 * l'intégration, et l'arbre de composants l'interdit par construction.
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Le jeton vit quinze minutes ; une donnée de projet n'a pas besoin d'être plus
      // fraîche que la seconde où on la regarde.
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Réessayer un 401, un 403 ou un 404 ne les changera pas.
        const status = (error as { status?: number }).status ?? 0;
        return status >= 500 && failureCount < 2;
      },
    },
  },
});

export function App() {
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <Authenticated />
      </QueryClientProvider>
    </SessionProvider>
  );
}

function Authenticated() {
  const { t } = useTranslation();
  const { state, choose, token } = useSession();

  const api = useMemo(() => createApiClient(token), [token]);
  const files = useMemo(() => createFileClient(token), [token]);

  if (state.status === 'loading') {
    return (
      <Centered>
        <p className="text-sm text-ink-variant">{t('state.loading')}</p>
      </Centered>
    );
  }

  // Un visiteur non connecté voit la page publique, pas un message d'erreur. La connexion
  // et l'inscription vivent sur le portail de la plateforme.
  if (state.status === 'anonymous') return <Landing />;

  if (state.status === 'unreachable') {
    return (
      <Centered>
        <Card className="w-full max-w-sm p-6">
          <h1 className="font-sans text-lg text-ink">{t('auth.unreachable')}</h1>
          <p className="mt-2 text-sm text-ink-variant">{t('auth.unreachableHint')}</p>
          <Button tone="primary" className="mt-5 w-full" onClick={state.retry}>
            {t('action.retry')}
          </Button>
        </Card>
      </Centered>
    );
  }

  if (state.status === 'choosing') {
    return (
      <Centered>
        <Card className="w-full max-w-sm p-6 text-left">
          <h1 className="font-sans text-xl text-ink">{t('auth.chooseOrganization')}</h1>
          <p className="mt-1 text-sm text-ink-variant">{t('auth.chooseHint')}</p>

          <ul className="mt-5 flex flex-col gap-2">
            {state.session.organizations.map((organization) => (
              <li key={organization.id}>
                <Button
                  className="w-full justify-start"
                  onClick={() => void choose(organization.id)}
                >
                  {organization.name}
                </Button>
              </li>
            ))}
          </ul>

          {state.session.organizations.length === 0 && (
            <Button
              tone="primary"
              className="mt-4 w-full"
              onClick={() => redirectToPortal('subscribe')}
            >
              {t('auth.subscribe')}
            </Button>
          )}
        </Card>
      </Centered>
    );
  }

  return (
    <ApiProvider value={api}>
      <FileProvider value={files}>
        <WithSettings language={state.session.language} />
      </FileProvider>
    </ApiProvider>
  );
}

/**
 * Les réglages de l'organisation décident du système d'unités **par défaut**.
 *
 * Ils ne l'imposent pas : un menuisier impérial dans une organisation métrique bascule son
 * affichage, et son choix local l'emporte. Le réglage serveur est une valeur de départ.
 */
function WithSettings({ language }: { language: string }) {
  const api = useApi();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings(api),
  });

  return (
    <PreferencesProvider
      language={language}
      {...(settings.data ? { initialUnitSystem: settings.data.unit_system } : {})}
    >
      <RouterProvider router={router} />
    </PreferencesProvider>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      {children}
    </div>
  );
}
