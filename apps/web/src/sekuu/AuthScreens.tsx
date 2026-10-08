import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiUnreachable, CredentialsRejected, login, register } from './session.js';
import { useSession } from './SessionContext.js';
import { Button, Card, Field, Input } from '../ui/index.js';

/**
 * L'entrée : connexion ou inscription, sans portail.
 *
 * Deux onglets, un seul formulaire visible à la fois. L'inscription crée le
 * compte **et** son premier atelier — un compte naît toujours dans une
 * organisation, côté API comme ici.
 *
 * Les erreurs d'identifiants montrent le message de l'API, qui est déjà
 * rédigé pour : le réécrire ici le ferait dériver au premier changement
 * de règle (douze caractères aujourd'hui, autre chose demain).
 */
export function AuthScreens({ initialMode = 'login' }: { initialMode?: 'login' | 'register' }) {
  const { t } = useTranslation();
  const { enter } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFailure(null);
    setUnreachable(false);
    setBusy(true);

    try {
      const form = new FormData(event.currentTarget);
      const text = (name: string) => String(form.get(name) ?? '').trim();
      const session =
        mode === 'login'
          ? await login({
              email: text('email'),
              password: String(form.get('password') ?? ''),
            })
          : await register({
              email: text('email'),
              password: String(form.get('password') ?? ''),
              firstName: text('firstName'),
              lastName: text('lastName'),
              organizationName: text('organizationName'),
            });
      enter(session);
    } catch (error) {
      if (error instanceof CredentialsRejected) setFailure(error.message);
      else if (error instanceof ApiUnreachable) setUnreachable(true);
      else throw error;
    } finally {
      setBusy(false);
    }
  };

  if (unreachable) {
    return (
      <Centered>
        <Card className="w-full max-w-sm p-6">
          <h1 className="font-sans text-lg text-ink">{t('auth.unreachable')}</h1>
          <p className="mt-2 text-sm text-ink-variant">{t('auth.unreachableHint')}</p>
          <Button
            tone="primary"
            className="mt-5 w-full"
            onClick={() => setUnreachable(false)}
          >
            {t('action.retry')}
          </Button>
        </Card>
      </Centered>
    );
  }

  return (
    <Centered>
      <Card className="w-full max-w-sm p-6 text-left">
        <h1 className="font-sans text-xl text-ink">{t('app.name')}</h1>
        <p className="mt-1 text-sm text-ink-variant">{t('auth.tagline')}</p>

        <div className="mt-5 grid grid-cols-2 gap-1 rounded border border-hairline bg-surface-low p-1">
          {(['login', 'register'] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={mode === choice}
              onClick={() => {
                setMode(choice);
                setFailure(null);
              }}
              className={`rounded px-3 py-2 text-sm transition-colors ${
                mode === choice
                  ? 'bg-surface font-medium text-ink shadow-sm'
                  : 'text-ink-variant hover:text-ink'
              }`}
            >
              {t(choice === 'login' ? 'auth.signIn' : 'auth.createAccount')}
            </button>
          ))}
        </div>

        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(event) => void submit(event)}
        >
          <Field label={t('auth.email')}>
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field
            label={t('auth.password')}
            hint={mode === 'register' ? t('auth.passwordHint') : undefined}
          >
            <Input
              name="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'register' ? 12 : undefined}
            />
          </Field>
          {mode === 'register' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('auth.firstName')}>
                  <Input name="firstName" autoComplete="given-name" required />
                </Field>
                <Field label={t('auth.lastName')}>
                  <Input name="lastName" autoComplete="family-name" required />
                </Field>
              </div>
              <Field label={t('auth.organizationName')}>
                <Input name="organizationName" required />
              </Field>
            </>
          )}

          {failure && (
            <p role="alert" className="text-sm text-danger">
              {failure}
            </p>
          )}

          <Button tone="primary" className="w-full" disabled={busy} type="submit">
            {busy
              ? t('state.loading')
              : t(mode === 'login' ? 'auth.signIn' : 'auth.createAccount')}
          </Button>
        </form>
      </Card>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      {children}
    </div>
  );
}
