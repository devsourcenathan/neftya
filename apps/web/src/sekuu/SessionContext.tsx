import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  NotSignedIn,
  openSession,
  refresh,
  switchOrganization,
  type Session,
} from './session.js';

/**
 * La session, disponible à l'arbre entier.
 *
 * Le jeton vit **en mémoire seulement**. Le stocker dans `localStorage` l'exposerait à
 * n'importe quel script de la page ; sa durée de vie est de quinze minutes, et le cookie
 * de la plateforme sait le régénérer.
 */

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  /** Connecté, mais aucune organisation active : `switch-organization` n'a pas abouti. */
  | { status: 'choosing'; session: Session }
  | { status: 'ready'; session: Session };

interface SessionApi {
  state: SessionState;
  choose: (organizationId: string) => Promise<void>;
  /** Rend un jeton frais, en rafraîchissant s'il est sur le point d'expirer. */
  token: () => Promise<string>;
}

const SessionContext = createContext<SessionApi | null>(null);

/** Marge avant expiration : une requête partie à `exp - 5 s` arriverait expirée. */
const RENEW_MARGIN_MS = 60_000;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    openSession()
      .then((session) => {
        if (cancelled) return;
        setState(settle(session));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof NotSignedIn) setState({ status: 'anonymous' });
        else throw error;
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const choose = useCallback(
    async (organizationId: string) => {
      if (state.status !== 'choosing' && state.status !== 'ready') return;
      setState(settle(await switchOrganization(state.session, organizationId)));
    },
    [state],
  );

  const token = useCallback(async () => {
    if (state.status !== 'ready') throw new NotSignedIn();

    if (state.session.expiresAt - Date.now() > RENEW_MARGIN_MS) {
      return state.session.accessToken;
    }

    // `refresh` sérialise de lui-même : plusieurs requêtes qui expirent en même temps
    // n'en déclenchent qu'un seul.
    const renewed = await refresh();
    const active = renewed.organizationId
      ? renewed
      : await switchOrganization(renewed, state.session.organizationId as string);

    setState(settle(active));
    return active.accessToken;
  }, [state]);

  const api = useMemo<SessionApi>(
    () => ({ state, choose, token }),
    [state, choose, token],
  );

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const api = useContext(SessionContext);
  if (!api) throw new Error('useSession hors de SessionProvider.');
  return api;
}

function settle(session: Session): SessionState {
  return session.organizationId
    ? { status: 'ready', session }
    : { status: 'choosing', session };
}
