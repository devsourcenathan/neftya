import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as renderReact } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ApiClient } from '../api/client.js';
import { ApiProvider, FileProvider } from '../api/projects.js';
import { PreferencesProvider } from '../preferences/PreferencesContext.js';
import '../i18n.js';

/**
 * Rendre un composant avec ce dont il a besoin pour vivre.
 *
 * L'API est un espion : les tests d'interface vérifient **ce qui part vers le serveur**,
 * pas ce que le serveur en fait — c'est le travail des tests d'API, qui tournent contre un
 * vrai PostgreSQL.
 */
export function renderWithProviders(
  ui: ReactNode,
  options: {
    api?: ApiClient;
    unitSystem?: 'metric' | 'imperial';
  } = {},
) {
  const calls: { path: string; options: unknown }[] = [];

  const api = (options.api ??
    (async (path: string, requestOptions: unknown) => {
      calls.push({ path, options: requestOptions });
      return undefined;
    })) as ApiClient;

  const client = new QueryClient({
    // Les tests ne réessaient pas : un échec doit échouer tout de suite, pas trois fois.
    defaultOptions: { queries: { retry: false } },
  });

  const result = renderReact(
    <QueryClientProvider client={client}>
      <ApiProvider value={api}>
        <FileProvider value={async () => {}}>
          <PreferencesProvider
            language="fr"
            initialUnitSystem={options.unitSystem ?? 'metric'}
          >
            {ui}
          </PreferencesProvider>
        </FileProvider>
      </ApiProvider>
    </QueryClientProvider>,
  );

  return { ...result, calls };
}
