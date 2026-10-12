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
  type PaymentAttempt,
} from '../api/projects.js';
import { Badge, Button, DataPoint, SectionTitle } from '../ui/index.js';
import { currenciesOf, preferredCurrency, rememberCurrency } from './currency.js';
import { takeIntendedPlan } from './intent.js';
import { monthlyEquivalent, yearlyAdvantage } from './offers.js';
import { paymentOutcome, renewalKind, type Returned } from './state.js';

/**
 * La facturation, vue du client.
 *
 * Quatre choses à dire, dans cet ordre : **ce qui vient de se passer**, **où j'en suis**,
 * **ce que je peux prendre**, et **ce que j'ai déjà payé**. Les moyens de paiement et les
 * factures restent chez l'encaisseur, et c'est voulu : on ne touche pas aux cartes.
 *
 * **Rien n'est affiché qu'on ne puisse vendre.** Le serveur ne rend que les prix qu'un
 * encaisseur configuré sait prendre ; une offre sans prix disponible porte « bientôt »
 * plutôt qu'un bouton qui mènerait à un refus.
 */

function returnedFromLocation(): Returned {
  const value = new URLSearchParams(window.location.search).get('paiement');

  return value === 'succes' || value === 'annule' ? value : null;
}

interface Choice {
  plan: string;
  period: 'monthly' | 'yearly';
  currency: string;
}

export function Billing() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();

  /*
   * Lu une fois, au montage.
   *
   * Le relire à chaque rendu ferait réapparaître l'écran de retour après que
   * l'utilisateur l'a écarté — et l'adresse, elle, ne change pas.
   */
  const [returned, setReturned] = useState<Returned>(returnedFromLocation);

  /*
   * L'offre choisie avant l'inscription, consommée au montage.
   *
   * Elle met la carte en avant, et rien de plus : ouvrir une page de carte bancaire dans
   * la seconde qui suit une inscription ressemble à un piège. C'est le client qui clique.
   */
  const [intended] = useState(takeIntendedPlan);

  /** La devise affichée. `null` tant que le catalogue n'est pas revenu. */
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null);

  /**
   * Le paiement qu'on s'apprête à faire, en attente de confirmation.
   *
   * Posé uniquement quand ce paiement **se cumule** à une période déjà payée. Sans cette
   * étape, un client qui avait Pro jusqu'au 12/11 a repayé un mois en croyant que le
   * premier n'avait pas abouti, et s'est retrouvé au 12/12 : le calcul était juste, et
   * rien ne l'avait prévenu.
   */
  const [confirming, setConfirming] = useState<Choice | null>(null);

  const billing = useQuery({
    queryKey: ['billing'],
    queryFn: () => getBilling(api),
    /*
     * Au retour d'un paiement, l'encaissement peut n'être pas encore constaté.
     *
     * Quelques secondes séparent le « merci » de l'encaisseur de son appel chez nous.
     * Sans ces tentatives, l'écran annoncerait « gratuit » à quelqu'un qui vient de
     * payer, et il rechargerait la page en se demandant où est passé son argent.
     *
     * La condition porte sur **la ligne de paiement** et non sur l'offre servie : un
     * client qui prolonge un abonnement déjà actif n'est pas « au gratuit », et son
     * attente ne se serait jamais rafraîchie.
     */
    refetchInterval: (query) =>
      returned === 'succes' && query.state.data?.payments[0]?.status === 'pending'
        ? 2000
        : false,
  });

  /*
   * Au retour d'un paiement, on va demander plutôt que d'attendre.
   *
   * Le webhook reste le chemin normal — il arrive même quand le client ferme l'onglet.
   * Mais il peut ne jamais venir : en production, aucun webhook NotchPay n'est arrivé, et
   * les deux encaissements observés l'ont été par cette sonde. Le balayage horaire la
   * double désormais, pour qui ferme l'onglet avant de revenir.
   *
   * Une seule fois, au montage : la sonde interroge un service tiers, et la relancer à
   * chaque rendu en ferait une boucle d'appels payants.
   */
  useEffect(() => {
    if (returned !== 'succes') return;

    void verifyPayments(api)
      .then(() => queryClient.invalidateQueries({ queryKey: ['billing'] }))
      .catch(() => {
        // Le compte à rebours du rafraîchissement prend le relais : une sonde ratée ne
        // doit pas transformer un retour de paiement en page d'erreur.
      });
  }, [returned, api, queryClient]);

  const checkout = useMutation({
    mutationFn: (choice: Choice) => startCheckout(api, choice),
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
  const latest = data.payments[0] ?? null;

  const currencies = currenciesOf(data.plans.flatMap((plan) => plan.prices));
  const currency = chosenCurrency ?? preferredCurrency(currencies, data.currency);

  const pickCurrency = (code: string) => {
    setChosenCurrency(code);
    rememberCurrency(code);
  };

  const priceFor = (choice: Choice) =>
    data.plans
      .find((plan) => plan.code === choice.plan)
      ?.prices.find(
        (price) => price.currency === choice.currency && price.period === choice.period,
      ) ?? null;

  /**
   * Partir payer — en passant par une confirmation si les périodes se cumulent.
   *
   * Le cumul se reconnaît **sans refaire aucun calcul** : le serveur a rendu la date que
   * ce paiement poserait, et l'échéance en cours est déjà là. Une échéance encore à venir
   * veut dire que ce paiement s'ajoute, et il y a donc quelque chose à dire avant
   * d'encaisser.
   */
  const choose = (choice: Choice) => {
    const end = data.subscription.current_period_end;

    if (end !== null && new Date(end).getTime() > Date.now()) {
      setConfirming(choice);
      return;
    }

    checkout.mutate(choice);
  };

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-4 pt-20 pb-12 lg:px-margin-desktop lg:pt-margin-desktop">
      <header>
        <h1 className="text-display-sm font-bold">{t('billing.title')}</h1>
        <p className="mt-2 max-w-prose text-ink-variant">{t('billing.lead')}</p>
      </header>

      {returned !== null && (
        <Outcome
          outcome={paymentOutcome(returned, latest?.status ?? null)}
          payment={latest}
          accessUntil={data.subscription.current_period_end}
          plan={t(`billing.plan.${data.subscription.paid_plan}`)}
          language={i18n.language}
          onDismiss={() => setReturned(null)}
        />
      )}

      <CurrentPlan data={data} language={i18n.language} />

      <section>
        <SectionTitle>{t('billing.offers')}</SectionTitle>

        {/*
         * Le sélecteur de devise n'apparaît que s'il y a un choix à faire.
         *
         * Avec une seule devise encaissable, il n'offrirait rien et laisserait croire
         * qu'un autre tarif existe ailleurs.
         */}
        {currencies.length > 1 && (
          <div className="mb-4 flex items-center gap-2 text-sm">
            <span className="text-ink-variant">{t('billing.payIn')}</span>
            {currencies.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => pickCurrency(code)}
                aria-pressed={currency === code}
                className={`min-h-11 rounded-full px-3 font-bold transition-colors ${
                  currency === code
                    ? 'text-ink underline decoration-primary decoration-2 underline-offset-4'
                    : 'text-ink-variant hover:text-ink'
                }`}
              >
                {t(`currency.${code}`)}
              </button>
            ))}
          </div>
        )}

        {confirming !== null && (
          <Confirmation
            choice={confirming}
            currentEnd={data.subscription.current_period_end}
            accessUntil={priceFor(confirming)?.access_until ?? null}
            plan={t(`billing.plan.${confirming.plan}`)}
            amount={
              priceFor(confirming) === null
                ? null
                : formatMoney({
                    amount: priceFor(confirming)?.amount_minor ?? 0,
                    currency: confirming.currency,
                  })
            }
            language={i18n.language}
            busy={checkout.isPending}
            onConfirm={() => checkout.mutate(confirming)}
            onCancel={() => setConfirming(null)}
          />
        )}

        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data.plans.map((plan) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              currency={currency}
              current={data.subscription.paid_plan === plan.code}
              highlighted={intended === plan.code}
              busy={checkout.isPending || confirming !== null}
              onChoose={(period, priceCurrency) =>
                choose({ plan: plan.code, period, currency: priceCurrency })
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

      <History payments={data.payments} language={i18n.language} />

      {/* Le portail n'apparaît que s'il y a quelque chose à y gérer : en mobile money il
          n'y a pas de carte à remplacer, et une résiliation s'y fait en ne repayant pas. */}
      {data.subscription.provider === 'stripe' && (
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

/** Au-delà, l'attente n'est plus normale et il faut donner une porte de sortie. */
const PATIENCE_MS = 20_000;

/**
 * Le retour de paiement, en quatre états.
 *
 * **C'était une bande de texte gris de trois lignes**, et elle disait parfois faux : un
 * paiement refusé affichait « Paiement abandonné. Rien n'a été débité » — une affirmation
 * sur de l'argent, faite sans la moindre vérification. Un succès ne nommait ni le montant,
 * ni la date d'accès, ni ce qui venait d'être débloqué, et ne proposait rien ensuite.
 *
 * L'attente, surtout, n'avait pas de fin : « cela prend quelques secondes » restait
 * affiché au bout de dix minutes, sans référence de transaction à donner au support.
 */
function Outcome({
  outcome,
  payment,
  accessUntil,
  plan,
  language,
  onDismiss,
}: {
  outcome: ReturnType<typeof paymentOutcome>;
  payment: PaymentAttempt | null;
  accessUntil: string | null;
  plan: string;
  language: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();

  /*
   * Le temps écoulé, compté pendant l'attente seulement.
   *
   * Un minuteur qui tourne sous un écran de succès ne sert personne et redessine la page
   * toutes les secondes pour rien.
   */
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (outcome !== 'waiting') return;

    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 1000);

    return () => clearInterval(timer);
  }, [outcome]);

  const tone = {
    confirmed: 'border-success/40 bg-success/10',
    waiting: 'border-primary/40 bg-primary/5',
    refused: 'border-danger/40 bg-danger/10',
    unfinished: 'border-outline-variant bg-surface-low',
  }[outcome];

  const amount =
    payment === null
      ? null
      : formatMoney({ amount: payment.amount_minor, currency: payment.currency });

  return (
    <section
      role="status"
      aria-live="polite"
      className={`rounded-lg border p-5 ${tone}`}
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-bold">{t(`billing.outcome.${outcome}Title`)}</h2>

        {/* On n'écarte pas une attente : il n'y aurait plus rien pour la remplacer. */}
        {outcome !== 'waiting' && (
          <button
            type="button"
            onClick={onDismiss}
            className="label-caps min-h-11 text-ink-variant"
          >
            {t('action.dismiss')}
          </button>
        )}
      </div>

      <p className="mt-2 max-w-prose text-sm text-ink-variant">
        {t(`billing.outcome.${outcome}Body`)}
      </p>

      {/* Ce qui a changé, nommé. « Votre offre est active » ne disait ni quoi, ni
          jusqu'à quand, ni combien a été débité. */}
      {outcome === 'confirmed' && (
        <div className="mt-4 flex flex-wrap items-baseline gap-6">
          <DataPoint label={t('billing.outcome.planLabel')} value={plan} />
          {amount !== null && (
            <DataPoint label={t('billing.outcome.amountLabel')} value={amount} />
          )}
          {accessUntil !== null && (
            <DataPoint
              label={t('billing.renewal.manualLabel')}
              value={new Date(accessUntil).toLocaleDateString(language)}
            />
          )}
        </div>
      )}

      {/*
       * Au-delà de la patience, une porte de sortie.
       *
       * C'est l'écran sur lequel un client est resté bloqué : la page annonçait se mettre
       * à jour toute seule, sauf qu'il n'y avait rien à mettre à jour — et aucune
       * référence à citer pour qu'on puisse chercher.
       */}
      {outcome === 'waiting' && elapsed >= PATIENCE_MS && (
        <p className="mt-3 max-w-prose text-sm font-medium text-ink">
          {t('billing.outcome.waitingTooLong')}
        </p>
      )}

      {/* La référence, dès la première seconde : c'est la seule chose qui permette de
          retrouver un paiement, chez nous comme chez l'encaisseur. */}
      {payment !== null && (
        <p className="mt-4 font-mono text-xs break-all text-outline">
          {t('billing.outcome.reference', {
            reference: payment.reference ?? payment.id,
          })}
        </p>
      )}
    </section>
  );
}

/**
 * La confirmation d'un paiement qui **prolonge** une période déjà payée.
 *
 * Les deux dates côte à côte, parce que c'est l'information qui manquait : « jusqu'au
 * 12/11 » et « jusqu'au 12/12 » rendent le cumul évident, là où un simple « Payer »
 * laissait croire qu'on remplaçait l'abonnement en cours.
 *
 * Un bloc en place, et non une fenêtre par-dessus : une fenêtre modale correcte demande de
 * capturer le focus et de traiter la touche d'échappement, et une fenêtre modale
 * incorrecte piège les lecteurs d'écran sur un écran de paiement.
 */
function Confirmation({
  choice,
  currentEnd,
  accessUntil,
  plan,
  amount,
  language,
  busy,
  onConfirm,
  onCancel,
}: {
  choice: Choice;
  currentEnd: string | null;
  accessUntil: string | null;
  plan: string;
  amount: string | null;
  language: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const date = (value: string | null) =>
    value === null ? '—' : new Date(value).toLocaleDateString(language);

  return (
    <div className="mb-6 rounded-lg border border-primary bg-surface-low p-5">
      <h3 className="text-lg font-bold">{t('billing.confirm.title')}</h3>

      <p className="mt-2 max-w-prose text-sm text-ink-variant">
        {t('billing.confirm.body', {
          plan,
          amount: amount ?? '—',
          period: t(`billing.period.${choice.period}Name`),
          from: date(currentEnd),
          to: date(accessUntil),
        })}
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={onConfirm} disabled={busy}>
          {t('billing.confirm.go')}
        </Button>
        <Button tone="secondary" onClick={onCancel} disabled={busy}>
          {t('action.cancel')}
        </Button>
      </div>
    </div>
  );
}

/** Où l'on en est : l'offre servie, ses plafonds, et ce qui arrivera à l'échéance. */
function CurrentPlan({ data, language }: { data: BillingResource; language: string }) {
  const { t } = useTranslation();
  const { subscription, quotas } = data;

  const end = subscription.current_period_end;
  const renewal = renewalKind(subscription);

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
            label={t(`billing.renewal.${renewal}Label`)}
            value={new Date(end).toLocaleDateString(language)}
          />
        )}
      </div>

      {/*
       * **Ce qui arrivera, écrit noir sur blanc.**
       *
       * L'écran disait « Renouvellement » à tout le monde. En mobile money rien ne se
       * renouvelle : le libellé promettait un prélèvement qui n'arrivera jamais, et
       * l'accès tombait le jour dit sans que personne n'ait été averti.
       */}
      {end !== null && (
        <p className="mt-3 max-w-prose text-sm text-ink-variant">
          {t(`billing.renewal.${renewal}Hint`)}
        </p>
      )}
    </section>
  );
}

/**
 * Ce qui a déjà été payé.
 *
 * **C'est ce qui rend une échéance vérifiable.** Un client qui voit « jusqu'au 12/12 »
 * après avoir cru acheter un mois n'avait aucun moyen de comprendre : la réponse — deux
 * encaissements d'un mois chacun — existait en base et aucune page ne la montrait. Il
 * fallait demander à quelqu'un qui sait lire du SQL.
 *
 * C'est aussi le seul endroit où un échec se voit.
 */
function History({
  payments,
  language,
}: {
  payments: readonly PaymentAttempt[];
  language: string;
}) {
  const { t } = useTranslation();

  // Pas de section vide : une organisation qui n'a jamais payé n'a pas de tableau à lire.
  if (payments.length === 0) return null;

  return (
    <section>
      <SectionTitle>{t('billing.history')}</SectionTitle>

      <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
        {payments.map((payment) => (
          <li
            key={payment.id}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
          >
            <span className="text-sm text-ink-variant">
              {new Date(payment.created_at).toLocaleDateString(language)}
            </span>

            <span className="flex-1 text-sm font-medium">
              {t(`billing.plan.${payment.plan_code}`)}{' '}
              <span className="text-ink-variant">
                {t(`billing.period.${payment.period}Name`)}
              </span>
            </span>

            <span className="text-sm font-bold">
              {formatMoney({
                amount: payment.amount_minor,
                currency: payment.currency,
              })}
            </span>

            <Badge tone={badgeToneOf(payment.status)}>
              {t(`billing.payment.${payment.status}`)}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}

function badgeToneOf(
  status: PaymentAttempt['status'],
): 'success' | 'warning' | 'accent' {
  if (status === 'settled') return 'success';

  /*
   * Un refus et un abandon ne se distinguent pas par la couleur mais par le mot.
   *
   * Les deux demandent la même chose au client — recommencer — et peindre l'un en rouge
   * vif ferait d'un abandon volontaire un incident.
   */
  return status === 'pending' ? 'accent' : 'warning';
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
  /** La devise affichée. `null` : il n'y a rien à vendre. */
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
   * Les prix de la devise affichée, le mensuel d'abord.
   *
   * **Le filtre existait et ne servait à personne.** Il portait sur la devise des réglages
   * de l'organisation, nulle par défaut et jamais renseignée : chaque offre montrait donc
   * ses quatre combinaisons — mensuel et annuel, euros et francs — soit un mur de boutons
   * dont la moitié s'adresse à l'autre continent. La devise affichée, elle, est toujours
   * connue : payée, choisie, ou devinée du fuseau.
   */
  const shown = useMemo(() => {
    const mine = plan.prices.filter((price) => price.currency === currency);

    // Le mensuel avant l'annuel : c'est l'engagement le plus court, donc celui qu'on
    // propose en premier.
    return [...mine].sort((a, b) =>
      a.period === b.period ? 0 : a.period === 'monthly' ? -1 : 1,
    );
  }, [plan.prices, currency]);

  const monthly = shown.find((price) => price.period === 'monthly');

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

      <div className="mt-6 flex flex-col gap-3">
        {free && <p className="text-sm text-ink-variant">{t('billing.freeAlways')}</p>}

        {!free && shown.length === 0 && (
          /*
           * Aucun prix encaissable dans cette devise : « bientôt », et pas de bouton.
           *
           * C'est l'état d'une offre dont le tarif n'est pas arrêté, ou dont la devise n'a
           * pas d'encaisseur. Un bouton y mènerait tout droit à un refus.
           */
          <p className="text-sm text-ink-variant">{t('billing.soon')}</p>
        )}

        {shown.map((price) => {
          /*
           * L'économie de l'annuel, **calculée des prix réels**.
           *
           * Écrite à la main, elle mentirait au premier changement de tarif ; et elle
           * n'est annoncée que si elle existe, car prétendre une remise qui n'existe pas
           * se vérifie en une division.
           */
          const advantage =
            price.period === 'yearly' && monthly !== undefined
              ? yearlyAdvantage(monthly.amount_minor, price.amount_minor)
              : null;

          return (
            <div key={`${price.currency}-${price.period}`} className="flex flex-col">
              <Button
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

              {price.period === 'yearly' && (
                <span className="mt-1 text-xs text-ink-variant">
                  {t('landing.pricing.perMonthEquivalent', {
                    amount: formatMoney({
                      amount: monthlyEquivalent(price.amount_minor),
                      currency: price.currency,
                    }),
                  })}
                  {/* L'espace est explicite en plus de la marge : la marge sépare à
                      l'œil, l'espace sépare les mots pour qui copie la ligne ou
                      l'écoute — « par mois2 mois offerts » ne s'entend pas. */}
                  {advantage !== null && ' '}
                  {advantage !== null && (
                    <span className="ml-1 font-bold text-primary">
                      {advantage.kind === 'months'
                        ? t('landing.pricing.monthsFree', { count: advantage.months })
                        : t('landing.pricing.percentOff', {
                            percent: advantage.percent,
                          })}
                    </span>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </li>
  );
}
