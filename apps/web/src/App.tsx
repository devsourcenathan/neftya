import { useMemo } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiProvider, FileProvider, getSettings, useApi } from './api/projects.js';
import { createApiClient, createFileClient } from './api/client.js';
import { PreferencesProvider } from './preferences/PreferencesContext.js';
import { SessionProvider, useSession } from './sekuu/SessionContext.js';
import { redirectToPortal } from './sekuu/session.js';
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
    return <Centered>{t('state.loading')}</Centered>;
  }

  if (state.status === 'anonymous') {
    return (
      <Centered>
        <p className="mb-3">{t('auth.required')}</p>
        <button
          type="button"
          className="rounded bg-emerald-700 px-4 py-2 text-white"
          onClick={() => redirectToPortal('login')}
        >
          {t('auth.signIn')}
        </button>
      </Centered>
    );
  }

  if (state.status === 'choosing') {
    return (
      <Centered>
        <p className="mb-3">{t('auth.chooseOrganization')}</p>
        <ul className="flex flex-col gap-2">
          {state.session.organizations.map((organization) => (
            <li key={organization.id}>
              <button
                type="button"
                className="w-full rounded border border-stone-300 px-4 py-2 hover:border-emerald-700"
                onClick={() => void choose(organization.id)}
              >
                {organization.name}
              </button>
            </li>
          ))}
        </ul>
        {state.session.organizations.length === 0 && (
          <button
            type="button"
            className="mt-3 rounded bg-emerald-700 px-4 py-2 text-white"
            onClick={() => redirectToPortal('subscribe')}
          >
            {t('auth.subscribe')}
          </button>
        )}
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
