import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '@neftya/units';
import { ApiRequestError } from '../api/client.js';
import {
  getBilling,
  openBillingPortal,
  startCheckout,
  useApi,
  verifyPayments,
  type BillingResource,
} from '../api/projects.js';
import { Badge, Button, DataPoint, SectionTitle } from '../ui/index.js';
import { takeIntendedPlan } from './intent.js';

/**
 * La facturation, vue du client.
 *
 * Trois choses à dire, dans cet ordre : **où j'en suis**, **ce que je peux prendre**, et
 * **comment j'arrête**. Le reste — factures, moyens de paiement — vit chez le
 * fournisseur, et c'est voulu : on ne touche pas aux cartes.
 *
 * **Rien n'est affiché qu'on ne puisse vendre.** Le serveur ne rend que les prix qu'un
 * encaisseur configuré sait prendre ; une offre sans prix disponible porte « bientôt »
 * plutôt qu'un bouton qui mènerait à un refus.
 */

/** Ce que le retour de paiement dit, lu dans l'adresse. */
type Outcome = 'succes' | 'annule' | null;

function outcomeFromLocation(): Outcome {
  const value = new URLSearchParams(window.location.search).get('paiement');

  return value === 'succes' || value === 'annule' ? value : null;
}

export function Billing() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();

  /*
   * Lu une fois, au montage.
   *
   * Le relire à chaque rendu ferait réapparaître « paiement réussi » après que
   * l'utilisateur l'a écarté — et l'adresse, elle, ne change pas.
   */
  const [outcome, setOutcome] = useState<Outcome>(outcomeFromLocation);

  /*
   * L'offre choisie avant l'inscription, consommée au montage.
   *
   * Elle met la carte en avant, et rien de plus : ouvrir une page de carte bancaire dans
   * la seconde qui suit une inscription ressemble à un piège. C'est le client qui clique.
   */
  const [intended] = useState(takeIntendedPlan);

  const billing = useQuery({
    queryKey: ['billing'],
    queryFn: () => getBilling(api),
    /*
     * Au retour d'un paiement, le webhook peut n'être pas encore arrivé.
     *
     * Quelques secondes séparent le « merci » de Stripe de son appel chez nous. Sans ces
     * tentatives, l'écran annoncerait « gratuit » à quelqu'un qui vient de payer, et il
     * rechargerait la page en se demandant où est passé son argent.
     */
    refetchInterval: (query) =>
      outcome === 'succes' && query.state.data?.subscription.plan === 'free'
        ? 2000
        : false,
  });

  /*
   * Au retour d'un paiement, on va demander plutôt que d'attendre.
   *
   * Le webhook reste le chemin normal — il arrive même quand le client ferme l'onglet.
   * Mais il peut ne jamais venir : mal déclaré chez le fournisseur, perdu, refusé. Le
   * client voyait alors « nous attendons la confirmation » indéfiniment, son argent parti.
   *
   * Une seule fois, au montage : la sonde interroge un service tiers, et la relancer à
   * chaque rendu en ferait une boucle d'appels payants.
   */
  useEffect(() => {
    if (outcome !== 'succes') return;

    void verifyPayments(api)
      .then(() => queryClient.invalidateQueries({ queryKey: ['billing'] }))
      .catch(() => {
        // Le compte à rebours du rafraîchissement prend le relais : une sonde ratée ne
        // doit pas transformer un retour de paiement en page d'erreur.
      });
  }, [outcome, api, queryClient]);

  const checkout = useMutation({
    mutationFn: (choice: {
      plan: string;
      period: 'monthly' | 'yearly';
      currency: string;
    }) => startCheckout(api, choice),
    onSuccess: (result) => {
      // Une redirection plein écran, pas un onglet : le client doit revenir ici, et un
      // onglet laisserait la page d'origine afficher un état périmé.
      window.location.assign(result.redirect_url);
    },
  });

  const portal = useMutation({
    mutationFn: () => openBillingPortal(api),
    onSuccess: (result) => {
      window.location.assign(result.redirect_url);
    },
  });

  if (billing.isPending) {
    return <p className="p-6 text-sm text-ink-variant">{t('state.loading')}</p>;
  }

  if (billing.isError) {
    return <p className="p-6 text-sm text-danger">{t('state.error')}</p>;
  }

  const data = billing.data;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-4 pt-20 pb-12 lg:px-margin-desktop lg:pt-margin-desktop">
      <header>
        <h1 className="text-display-sm font-bold">{t('billing.title')}</h1>
        <p className="mt-2 max-w-prose text-ink-variant">{t('billing.lead')}</p>
      </header>

      {outcome !== null && (
        <Notice
          outcome={outcome}
          pending={data.subscription.plan === 'free'}
          onDismiss={() => setOutcome(null)}
        />
      )}

      <CurrentPlan data={data} language={i18n.language} />

      <section>
        <SectionTitle>{t('billing.offers')}</SectionTitle>

        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data.plans.map((plan) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              currency={data.currency}
              current={data.subscription.paid_plan === plan.code}
              highlighted={intended === plan.code}
              busy={checkout.isPending}
              onChoose={(period, currency) =>
                checkout.mutate({ plan: plan.code, period, currency })
              }
            />
          ))}
        </ul>

        {checkout.isError && (
          <p className="mt-4 text-sm text-danger">
            {checkout.error instanceof ApiRequestError
              ? checkout.error.message
              : t('state.error')}
          </p>
        )}
      </section>

      {/* Le portail n'apparaît que s'il y a quelque chose à y gérer : en mobile money il
          n'y a pas de carte à remplacer, et une résiliation s'y fait en ne repayant pas. */}
      {data.subscription.period !== 'free' && (
        <section>
          <SectionTitle>{t('billing.manage')}</SectionTitle>
          <p className="mb-4 max-w-prose text-sm text-ink-variant">
            {t('billing.manageHint')}
          </p>

          <Button onClick={() => portal.mutate()} disabled={portal.isPending}>
            {t('billing.openPortal')}
          </Button>

          {portal.isError && (
            <p className="mt-3 text-sm text-danger">
              {portal.error instanceof ApiRequestError
                ? portal.error.message
                : t('state.error')}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * Le retour de paiement.
 *
 * Un succès dont l'abonnement n'est pas encore ouvert dit qu'on attend, et ne ment pas :
 * le webhook met quelques secondes, et annoncer « c'est bon » avant qu'il arrive ferait
 * recharger une page qui montre encore le gratuit.
 */
function Notice({
  outcome,
  pending,
  onDismiss,
}: {
  outcome: 'succes' | 'annule';
  pending: boolean;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();

  const message =
    outcome === 'annule'
      ? t('billing.canceled')
      : pending
        ? t('billing.confirming')
        : t('billing.thanks');

  return (
    <p
      role="status"
      className={`flex items-baseline justify-between gap-4 rounded-md border p-3 text-sm ${
        outcome === 'annule'
          ? 'border-outline-variant bg-surface-low text-ink-variant'
          : 'border-success/30 bg-success/10 text-ink'
      }`}
    >
      <span>{message}</span>
      <button type="button" onClick={onDismiss} className="label-caps text-ink-variant">
        {t('action.dismiss')}
      </button>
    </p>
  );
}

/** Où l'on en est : l'offre servie, ses plafonds, et jusqu'à quand. */
function CurrentPlan({ data, language }: { data: BillingResource; language: string }) {
  const { t } = useTranslation();
  const { subscription, quotas } = data;

  const end = subscription.current_period_end;

  return (
    <section>
      <SectionTitle>{t('billing.current')}</SectionTitle>

      <div className="flex flex-wrap items-baseline gap-3">
        <Badge tone={subscription.lapsed ? 'warning' : 'accent'}>
          {t(`billing.plan.${subscription.plan}`)}
        </Badge>

        {/* L'écart entre payé et servi est dit, pas déduit : quelqu'un qui voit ses
            projets plafonnés doit comprendre pourquoi sans chercher. */}
        {subscription.lapsed && (
          <span className="text-sm text-ink-variant">
            {t('billing.lapsed', { plan: t(`billing.plan.${subscription.paid_plan}`) })}
          </span>
        )}

        {subscription.status === 'past_due' && !subscription.lapsed && (
          <span className="text-sm text-ink-variant">{t('billing.pastDue')}</span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-6">
        <DataPoint
          label={t('billing.projects')}
          value={
            quotas.projects_max === null ? t('billing.unlimited') : quotas.projects_max
          }
        />
        <DataPoint
          label={t('billing.aiMonth')}
          value={
            quotas.ai_month_max === null ? t('billing.unlimited') : quotas.ai_month_max
          }
        />
        <DataPoint
          label={t('billing.members')}
          value={
            quotas.members_max === null ? t('billing.unlimited') : quotas.members_max
          }
        />
        {end !== null && (
          <DataPoint
            label={t(
              subscription.status === 'canceled'
                ? 'billing.endsOn'
                : 'billing.renewsOn',
            )}
            value={new Date(end).toLocaleDateString(language)}
          />
        )}
      </div>
    </section>
  );
}

/** Une offre, avec ses prix — ou la raison pour laquelle elle n'en a pas. */
function PlanCard({
  plan,
  currency,
  current,
  highlighted,
  busy,
  onChoose,
}: {
  plan: BillingResource['plans'][number];
  /** La devise de l'organisation. `null` : on montre tout, faute de savoir. */
  currency: string | null;
  current: boolean;
  /** Celle que le visiteur avait choisie avant de créer son compte. */
  highlighted: boolean;
  busy: boolean;
  onChoose: (period: 'monthly' | 'yearly', currency: string) => void;
}) {
  const { t } = useTranslation();

  /*
   * Le gratuit n'a pas de prix et ne se souscrit pas : il est l'état par défaut. Lui
   * mettre un bouton « choisir » laisserait croire qu'on peut y revenir d'un clic, alors
   * qu'on y retombe en cessant de payer.
   */
  const free = plan.prices.length === 0 && plan.code === 'free';

  /*
   * Les prix de la devise du client, le mensuel d'abord.
   *
   * Montrer les quatre combinaisons donnait un mur de boutons dont la moitié s'adresse à
   * l'autre continent. Si l'organisation n'a pas choisi de devise, ou si la sienne n'a pas
   * de prix, on montre tout plutôt que rien : ne rien montrer la laisserait sans moyen de
   * payer.
   */
  const sorted = useMemo(() => {
    const mine = plan.prices.filter((price) => price.currency === currency);
    const shown = mine.length > 0 ? mine : plan.prices;

    // Le mensuel avant l'annuel : c'est l'engagement le plus court, donc celui qu'on
    // propose en premier.
    return [...shown].sort((a, b) =>
      a.period === b.period ? 0 : a.period === 'monthly' ? -1 : 1,
    );
  }, [plan.prices, currency]);

  return (
    <li
      className={`flex flex-col rounded-lg border bg-surface p-6 ${
        highlighted ? 'border-primary shadow-lg' : 'border-hairline'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xl font-bold">{t(`billing.plan.${plan.code}`)}</h3>
        {current && <Badge tone="success">{t('billing.yours')}</Badge>}
        {!current && highlighted && <Badge tone="accent">{t('billing.chosen')}</Badge>}
      </div>

      <ul className="mt-4 flex flex-1 flex-col gap-1 text-sm text-ink-variant">
        <li>
          {plan.projects_max === null
            ? t('billing.unlimitedProjects')
            : t('billing.nProjects', { count: plan.projects_max })}
        </li>
        <li>{t('billing.nAi', { count: plan.ai_month_max ?? 0 })}</li>
        <li>
          {plan.members_max === null
            ? t('billing.unlimitedMembers')
            : t('billing.nMembers', { count: plan.members_max })}
        </li>
      </ul>

      <div className="mt-6 flex flex-col gap-2">
        {free && <p className="text-sm text-ink-variant">{t('billing.freeAlways')}</p>}

        {!free && sorted.length === 0 && (
          /*
           * Aucun prix encaissable : « bientôt », et pas de bouton.
           *
           * C'est l'état d'une offre dont le tarif n'est pas arrêté, ou dont la devise n'a
           * pas d'encaisseur. Un bouton y mènerait tout droit à un refus.
           */
          <p className="text-sm text-ink-variant">{t('billing.soon')}</p>
        )}

        {sorted.map((price) => (
          <Button
            key={`${price.currency}-${price.period}`}
            tone={current ? 'secondary' : 'primary'}
            disabled={busy}
            onClick={() => onChoose(price.period, price.currency)}
          >
            {t(`billing.period.${price.period}`, {
              amount: formatMoney({
                amount: price.amount_minor,
                currency: price.currency,
              }),
            })}
          </Button>
        ))}
      </div>
    </li>
  );
}
