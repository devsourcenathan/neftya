import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { Session } from './session.js';
import { useSession } from './SessionContext.js';
import { MoreIcon } from '../ui/icons.js';

/**
 * Qui je suis, et les portes qui vont avec.
 *
 * Il montre **ce que la session porte déjà** : le nom, l'adresse,
 * l'organisation active. Rien n'est demandé au serveur pour cela.
 *
 * Il ne montre **ni plan, ni facture** : il n'y en a pas en local, et le
 * jour où la facturation reviendra, ses écrans vivront à part — les recopier
 * ici, c'est les voir diverger le jour où l'un des deux change.
 *
 * ## Changer d'organisation
 *
 * Trois gestes, dans cet ordre, et l'ordre est le sujet : activer
 * l'organisation, **vider le cache**, revenir à l'accueil. Tout ce qui est
 * chargé appartient à celle qu'on quitte.
 */
export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const { state, choose, leave } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  // Un menu ouvert qu'on ne peut fermer qu'en cliquant le même bouton est un piège au
  // clavier comme à la souris. Échappe et le clic extérieur le referment tous deux.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  // Le menu n'a de sens qu'une fois l'organisation active : avant, il n'y a ni nom ni
  // organisation à montrer, et l'écran qui s'affiche alors porte déjà ses propres actions.
  if (state.status !== 'ready') return null;

  const { session } = state;
  const name = displayName(session);
  const organization = session.organizations.find(
    (candidate) => candidate.id === session.organizationId,
  );
  const others = session.organizations.filter(
    (candidate) => candidate.id !== session.organizationId,
  );

  const change = async (organizationId: string) => {
    setFailed(false);
    setSwitching(organizationId);

    const ok = await switchTo(organizationId, {
      choose,
      forgetCache: () => queryClient.clear(),
      goHome: () => navigate({ to: '/' }),
    });

    setSwitching(null);
    if (ok) setOpen(false);
    else setFailed(true);
  };

  const quit = async () => {
    queryClient.clear();
    await leave();
    await navigate({ to: '/' });
  };

  return (
    <div ref={container} className="relative">
      {open && (
        <div
          className="absolute bottom-full left-0 z-30 mb-2 w-64 rounded border border-outline-variant bg-surface p-2 shadow-lg lg:left-2 lg:w-[264px]"
          role="menu"
        >
          <div className="border-b border-hairline px-3 pt-2 pb-3">
            <p className="truncate text-sm font-medium text-ink" title={name}>
              {name}
            </p>
            <p className="truncate text-xs text-ink-variant" title={session.user.email}>
              {session.user.email}
            </p>
            {organization && (
              <p
                className="label-caps mt-2 truncate text-outline"
                title={organization.name}
              >
                {organization.name}
              </p>
            )}
          </div>

          {/* Une seule organisation ne se choisit pas : la liste n'apparaît qu'à qui a
              vraiment quelque chose à changer. */}
          {others.length > 0 && (
            <div className="border-b border-hairline py-1">
              <p className="label-caps px-3 pt-1 pb-1 text-outline">
                {t('account.switchTo')}
              </p>
              {others.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  role="menuitem"
                  disabled={switching !== null}
                  className="block w-full truncate rounded px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-low disabled:opacity-50"
                  onClick={() => void change(candidate.id)}
                >
                  {switching === candidate.id ? t('state.loading') : candidate.name}
                </button>
              ))}
              {failed && (
                <p className="px-3 py-1 text-xs text-danger">
                  {t('account.switchFailed')}
                </p>
              )}
            </div>
          )}

          {/* Les réglages de Neftya vivent ici plutôt que dans la navigation : ils se
              règlent une fois et ne se visitent pas. La barre garde les lieux où l'on
              travaille. */}
          <Link
            to="/settings"
            role="menuitem"
            className="block rounded px-3 py-2 text-sm text-ink transition-colors hover:bg-surface-low"
            onClick={() => setOpen(false)}
          >
            {t('settings.title')}
          </Link>

          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-surface-low"
            onClick={() => void quit()}
          >
            {t('account.signOut')}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        aria-haspopup="menu"
        // Repliée, la barre ne laisse que les initiales : l'infobulle et le nom accessible
        // portent alors le libellé, sans quoi le bouton devient un rébus.
        {...(collapsed ? { title: name, 'aria-label': name } : {})}
        className={`flex w-full items-center gap-3 rounded py-2 text-left transition-colors hover:bg-surface-low ${
          collapsed ? 'lg:justify-center lg:px-0' : 'px-3'
        }`}
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-outline-variant bg-surface-high text-xs font-bold text-primary"
        >
          {initials(session)}
        </span>
        <span className={`min-w-0 flex-1 ${collapsed ? 'hidden' : 'hidden lg:block'}`}>
          <span className="block truncate text-sm text-ink">{name}</span>
          {organization && (
            <span className="block truncate text-xs text-ink-variant">
              {organization.name}
            </span>
          )}
        </span>
        <span aria-hidden="true" className={collapsed ? 'hidden' : 'hidden lg:block'}>
          <MoreIcon />
        </span>
      </button>
    </div>
  );
}

/**
 * Le changement d'organisation, sans React.
 *
 * L'ordre porte tout : on ne vide le cache **que** si le changement a abouti. L'inverse
 * viderait l'écran de quelqu'un dont l'adhésion a été révoquée, pour le laisser devant
 * une application vide sans lui dire ce qui s'est passé.
 */
export async function switchTo(
  organizationId: string,
  actions: {
    choose: (id: string) => Promise<boolean>;
    forgetCache: () => void;
    goHome: () => Promise<unknown> | unknown;
  },
): Promise<boolean> {
  if (!(await actions.choose(organizationId))) return false;

  // Projets, réglages, modèles : tout ce qui est en cache appartient à l'organisation
  // qu'on vient de quitter.
  actions.forgetCache();
  await actions.goHome();

  return true;
}

/**
 * Le nom affichable.
 *
 * Quelqu'un qui s'est inscrit sans renseigner son nom n'en a pas, et la barre doit tout de
 * même afficher quelque chose : son adresse fait l'affaire, et elle l'identifie.
 */
export function displayName(session: Session): string {
  const full = `${session.user.firstName} ${session.user.lastName}`.trim();
  return full || session.user.email || '—';
}

/** Deux lettres, ou une seule. Jamais vide : un rond vide n'est pas un avatar. */
export function initials(session: Session): string {
  const letters = [session.user.firstName, session.user.lastName]
    .map((part) => part.trim()[0])
    .filter(Boolean);

  if (letters.length > 0) return letters.join('').toUpperCase();

  return (session.user.email.trim()[0] ?? '?').toUpperCase();
}
