import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { portalUrl, signOut, type Session } from './session.js';
import { useSession } from './SessionContext.js';
import { SettingsIcon } from '../ui/icons.js';

/**
 * Qui je suis, et les trois portes qui vont avec.
 *
 * ## Ce que Neftya montre, et ce qu'il ne montre pas
 *
 * Il montre **ce que le jeton porte déjà** : le nom, l'adresse, l'organisation active.
 * Rien n'est demandé au serveur pour cela — `refresh` l'a rendu, et une seconde copie
 * vieillirait dès que quelqu'un modifie son profil sur la plateforme.
 *
 * Il ne montre **ni le plan, ni la facture, ni l'échéance**. Ce sont les mêmes écrans pour
 * tous les produits Sekuu ; les recopier ici, c'est les voir diverger de la facturation le
 * jour où l'une des deux change. Le compte et l'abonnement sont donc des liens vers le
 * portail, pas des pages de Neftya.
 *
 * ## La déconnexion
 *
 * Elle part chez la plateforme. La session vit dans le cookie partagé de `.sekuu.test` :
 * l'effacer ici seulement laisserait la personne connectée sur tous les autres produits
 * pendant que celui-ci prétend le contraire.
 *
 * @see docs/SEKUU.md §7
 */
export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const { state } = useSession();
  const [open, setOpen] = useState(false);
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
  // abonnement à montrer, et l'écran qui s'affiche alors porte déjà ses propres actions.
  if (state.status !== 'ready') return null;

  const { session } = state;
  const name = displayName(session);
  const organization = session.organizations.find(
    (candidate) => candidate.id === session.organizationId,
  );

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

          {/* Deux liens, pas deux écrans : le portail détient le compte et l'abonnement. */}
          <MenuLink href={portalUrl('account')}>{t('account.profile')}</MenuLink>
          <MenuLink href={portalUrl('subscription')}>
            {t('account.subscription')}
          </MenuLink>

          <button
            type="button"
            role="menuitem"
            className="w-full rounded px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-surface-low"
            onClick={() => void signOut(session)}
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
          <SettingsIcon />
        </span>
      </button>
    </div>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      role="menuitem"
      className="block rounded px-3 py-2 text-sm text-ink transition-colors hover:bg-surface-low"
    >
      {children}
    </a>
  );
}

/**
 * Le nom affichable.
 *
 * Quelqu'un qui s'est inscrit sans renseigner son nom n'en a pas, et la barre doit tout de
 * même afficher quelque chose : son adresse fait l'affaire, et elle l'identifie.
 */
export function displayName(session: Session): string {
  const full = `${session.user.first_name} ${session.user.last_name}`.trim();
  return full || session.user.email || '—';
}

/** Deux lettres, ou une seule. Jamais vide : un rond vide n'est pas un avatar. */
export function initials(session: Session): string {
  const letters = [session.user.first_name, session.user.last_name]
    .map((part) => part.trim()[0])
    .filter(Boolean);

  if (letters.length > 0) return letters.join('').toUpperCase();

  return (session.user.email.trim()[0] ?? '?').toUpperCase();
}
