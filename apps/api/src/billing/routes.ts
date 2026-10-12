import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { success } from '@neftya/contracts';
import { conflict, forbidden, notFound, serviceUnavailable } from '../http/errors.js';
import { sekuuOf } from '../sekuu/authenticate.js';
import { can } from '../sekuu/permission-resolver.js';
import type { AuthRepository } from '../auth/repository.js';
import type { SettingsRepository } from '../settings/repository.js';
import { entitlementOf, nextPeriodEnd } from './entitlement.js';
import { FREE_PLAN_CODE } from './repository.js';
import type { BillingRepository } from './repository.js';
import type { BillingService } from './service.js';
import type { PaymentProvider } from './provider.js';

/**
 * Les routes de facturation.
 *
 * Deux mondes s'y croisent, et ils n'ont ni la même authentification ni le même corps de
 * requête. Celles que l'interface appelle portent un jeton et un JSON ; le webhook, lui,
 * vient du fournisseur, s'authentifie par une signature, et **doit être lu en octets
 * bruts**. C'est la raison pour laquelle il est déclaré à part, hors du contexte
 * authentifié.
 */

const checkoutBody = z.object({
  plan: z.string().min(1).max(40),
  period: z.enum(['monthly', 'yearly']),
  currency: z.string().regex(/^[A-Z]{3}$/u, 'Code devise ISO 4217 attendu.'),
});

export interface BillingDependencies {
  billing: BillingRepository;
  service: BillingService;
  auth: AuthRepository;
  settings: SettingsRepository;
  /** Les fournisseurs configurés. Un fournisseur sans clé n'est tout simplement pas là. */
  providers: readonly PaymentProvider[];
  /** L'adresse publique de l'interface, où le client revient après avoir payé. */
  appUrl: string;
}

/**
 * Le catalogue, sans jeton.
 *
 * La page d'accueil en a besoin et n'a personne à authentifier. Sans elle, les tarifs y
 * seraient écrits en dur — une seconde source de vérité, qui annoncerait 29 € le jour où
 * l'environnement en dit 39, et c'est le montant de l'environnement qui serait débité.
 *
 * **Rien de confidentiel n'y passe** : les offres et leurs prix sont ce qu'on affiche à
 * qui visite le site. Les quotas y figurent parce qu'ils sont l'argument de vente, pas une
 * information interne.
 */
export function registerPublicBillingRoutes(
  app: FastifyInstance,
  dependencies: { billing: BillingRepository; providers: readonly PaymentProvider[] },
): void {
  app.get('/v1/billing/plans', async () => {
    const offers = await dependencies.billing.offers();
    const sellable = new Set(
      dependencies.providers.flatMap((provider) => provider.currencies),
    );

    return success({
      plans: offers.map((offer) => ({
        code: offer.code,
        projects_max: offer.projectsMax,
        ai_month_max: offer.aiMonthMax,
        members_max: offer.membersMax,
        prices: offer.prices
          .filter((price) => sellable.has(price.currency))
          .map((price) => ({
            currency: price.currency,
            period: price.period,
            amount_minor: price.amountMinor,
          })),
      })),
    });
  });
}

export function registerBillingRoutes(
  app: FastifyInstance,
  dependencies: BillingDependencies,
): void {
  const { billing, service, auth, settings, providers, appUrl } = dependencies;

  /**
   * L'état de l'abonnement, et ce qu'on peut souscrire.
   *
   * Le catalogue est rendu avec l'abonnement plutôt que sur une route séparée : l'interface
   * en a besoin des deux en même temps, et deux appels auraient pu rendre un catalogue et
   * un abonnement pris à des instants différents.
   */
  app.get('/v1/billing', async (request) => {
    const context = sekuuOf(request);
    const now = new Date();

    const [offers, subscription, organizationSettings, payments] = await Promise.all([
      billing.offers(),
      billing.subscriptionOf(context.organizationId),
      settings.get(context.organizationId),
      billing.paymentsOf(context.organizationId),
    ]);

    const plans = new Map(offers.map((offer) => [offer.code, offer]));
    const entitlement = entitlementOf(subscription, plans, FREE_PLAN_CODE, now);

    const sellable = new Set(providers.flatMap((provider) => provider.currencies));

    /*
     * La devise de l'organisation, déjà choisie pour ses devis.
     *
     * Sans elle, chaque offre montrait quatre boutons — mensuel et annuel, en euros et en
     * francs CFA — dont la moitié ne concerne pas le client. Un menuisier de Douala n'a
     * pas à trier entre des euros et des francs pour payer, ni un menuisier de Lyon
     * l'inverse.
     *
     * Rendue plutôt qu'appliquée ici : c'est l'interface qui décide quoi montrer, et l'API
     * garde l'information complète pour qui voudrait payer autrement.
     */
    return success({
      currency: organizationSettings.currency,
      subscription: {
        plan: entitlement.planCode,
        /** L'offre payée, quand elle diffère de celle servie — un abonnement expiré. */
        paid_plan: subscription?.planCode ?? FREE_PLAN_CODE,
        status: subscription?.status ?? 'active',
        period: subscription?.period ?? 'free',
        current_period_end: subscription?.currentPeriodEnd?.toISOString() ?? null,
        lapsed: entitlement.lapsed,
        /*
         * Qui encaisse, et s'il renouvellera de lui-même.
         *
         * L'interface disait « Renouvellement » à tout le monde. En mobile money rien ne
         * se renouvelle : le libellé promettait un prélèvement qui n'arrivera jamais, et
         * l'accès tomberait le jour dit sans que personne n'ait été averti. Dire qui
         * encaisse est la seule façon de dire la vérité sur ce qui suit.
         */
        provider: subscription?.provider ?? null,
        cancel_at_period_end: subscription?.cancelAtPeriodEnd ?? false,
      },
      quotas: {
        projects_max: entitlement.quotas.projectsMax,
        ai_month_max: entitlement.quotas.aiMonthMax,
        members_max: entitlement.quotas.membersMax,
      },
      plans: offers.map((offer) => ({
        code: offer.code,
        projects_max: offer.projectsMax,
        ai_month_max: offer.aiMonthMax,
        members_max: offer.membersMax,
        /*
         * Seuls les prix qu'un fournisseur configuré sait encaisser.
         *
         * Afficher un tarif en francs CFA alors qu'aucun encaisseur ne les prend mènerait
         * le client jusqu'au bouton, puis à un refus. Mieux vaut ne pas le proposer.
         */
        prices: offer.prices
          .filter((price) => sellable.has(price.currency))
          .map((price) => ({
            currency: price.currency,
            period: price.period,
            amount_minor: price.amountMinor,
            /*
             * Jusqu'à quand ce paiement porterait l'accès, s'il était fait maintenant.
             *
             * **Calculé ici, et nulle part ailleurs.** Un abonnement en cours se prolonge
             * depuis son échéance et non depuis aujourd'hui : refaire cette arithmétique
             * dans l'interface en aurait fait une seconde source de vérité, qui dérive au
             * premier cas limite — un 31 janvier, une année bissextile — et annoncerait
             * une date que le serveur ne posera pas.
             *
             * C'est ce que l'interface doit pouvoir dire avant d'encaisser : « vous avez
             * jusqu'au 12/11, ce paiement vous portera au 12/12 ». Faute de le dire, un
             * client paie deux fois en croyant que la première n'avait pas marché.
             */
            access_until: nextPeriodEnd(
              subscription?.currentPeriodEnd ?? null,
              price.period,
              now,
            ).toISOString(),
          })),
      })),
      /*
       * Les dernières tentatives, réussies comme ratées.
       *
       * C'est ce qui rend une échéance vérifiable — « jusqu'au 12/12 » après avoir cru
       * acheter un mois n'a de réponse que là. Et c'est le seul endroit où un échec se
       * voit : `payments.status = 'failed'` était écrit en base et lu par personne.
       */
      payments: payments.map((payment) => ({
        id: payment.id,
        /** La référence du fournisseur : celle que le client lit sur son téléphone. */
        reference: payment.providerRef,
        plan_code: payment.planCode,
        period: payment.period,
        currency: payment.currency,
        amount_minor: payment.amountMinor,
        status: payment.status,
        created_at: payment.createdAt.toISOString(),
        settled_at: payment.settledAt?.toISOString() ?? null,
      })),
    });
  });

  /**
   * Ouvrir un paiement et rendre l'adresse où envoyer le client.
   *
   * Rien n'est accordé ici : c'est le webhook qui ouvre l'accès. Accorder à l'aller
   * donnerait un abonnement à qui abandonne la page de paiement.
   */
  app.post('/v1/billing/checkout', async (request) => {
    const context = sekuuOf(request);

    if (!can(context, 'settings.write')) {
      throw forbidden('Votre rôle ne permet pas de souscrire une offre.');
    }

    const body = checkoutBody.parse(request.body);

    const offer = (await billing.offers()).find(
      (candidate) => candidate.code === body.plan,
    );

    if (!offer) throw notFound('Offre inconnue.');

    if (offer.code === FREE_PLAN_CODE) {
      throw conflict('L’offre gratuite ne se souscrit pas : elle est déjà active.');
    }

    const amountMinor = billing.priceOf(body.plan, body.currency, body.period);

    /*
     * Un prix absent n'est pas une erreur de l'appelant : c'est une offre qu'on ne vend
     * pas dans cette combinaison. Le dire plutôt que de convertir au taux du jour.
     */
    if (amountMinor === null) {
      throw conflict(
        `L’offre ${body.plan} n’est pas encore proposée en ${body.currency} (${body.period}).`,
      );
    }

    const provider = providers.find((candidate) =>
      candidate.currencies.includes(body.currency),
    );

    if (!provider) {
      throw conflict(`Aucun moyen de paiement configuré pour ${body.currency}.`);
    }

    const user = await auth.findUserById(context.userId);

    if (!user) throw notFound('Utilisateur introuvable.');

    const payment = await service.openPayment({
      organizationId: context.organizationId,
      provider: provider.key,
      planCode: body.plan,
      period: body.period,
      currency: body.currency,
      amountMinor,
    });

    /*
     * Une tentative encore en vol renvoie sa propre page de paiement.
     *
     * Deux clics sur « Payer » ne doivent pas ouvrir deux sessions : on ne rappelle donc
     * pas le fournisseur, on renvoie là où le client était déjà attendu.
     */
    if (!payment.fresh && payment.providerRef !== null) {
      const existing = await service.redirectOf(payment.id);

      if (existing !== null) return success({ redirect_url: existing });
    }

    /*
     * La référence envoyée au fournisseur est l'identifiant de la ligne.
     *
     * Unique par tentative, et c'est indispensable : NotchPay refuse une référence déjà
     * employée (`409 Reference already existing`), si bien qu'une clé descriptive —
     * organisation, offre, période, devise — aurait fait échouer tous les renouvellements.
     * Elle sert aussi de clé d'idempotence à Stripe, pour qui un nouvel essai mérite bien
     * une nouvelle session.
     */
    const idempotencyKey = payment.id;

    /*
     * Un encaisseur injoignable n'est pas une erreur interne.
     *
     * Une clé périmée, une panne chez le fournisseur, un réseau qui tombe : le client n'y
     * est pour rien et il n'a rien à corriger. « Une erreur interne est survenue » le
     * laisse devant un bouton mort ; un 503 qui dit de réessayer lui donne la seule
     * conduite utile. Le détail, lui, part au journal — il peut porter des éléments du
     * compte marchand.
     *
     * La ligne « en cours » reste au registre : le prochain essai la retrouvera par sa clé
     * d'idempotence plutôt que d'en ouvrir une seconde.
     */
    let started;

    try {
      started = await provider.startCheckout({
        organizationId: context.organizationId,
        planCode: body.plan,
        period: body.period,
        currency: body.currency,
        amountMinor,
        // Ce libellé part sur la page de paiement et sur la facture du client :
        // « Neftya pro » en minuscule s'y lisait comme une faute de frappe.
        label: `Neftya ${body.plan.charAt(0).toUpperCase()}${body.plan.slice(1)}`,
        customerEmail: user.email,
        successUrl: `${appUrl}/facturation?paiement=succes`,
        cancelUrl: `${appUrl}/facturation?paiement=annule`,
        idempotencyKey,
      });
    } catch (error) {
      request.log.error({ err: error, provider: provider.key }, 'checkout.failed');

      throw serviceUnavailable(
        'Le paiement est momentanément indisponible. Réessayez dans un instant — rien n’a été débité.',
      );
    }

    await service.attachProviderSession(
      payment.id,
      started.providerRef,
      started.redirectUrl,
    );

    return success({ redirect_url: started.redirectUrl });
  });

  /**
   * Aller demander où en sont les paiements, au lieu d'attendre.
   *
   * Appelée au retour d'une page de paiement. Un webhook peut ne jamais arriver — mal
   * déclaré, perdu, refusé — et le client reste alors devant « nous attendons la
   * confirmation » pendant que son argent est parti. C'est arrivé le jour de la mise en
   * service.
   *
   * **Rien n'est accordé sur la foi de l'adresse de retour.** Le fournisseur renvoie le
   * client avec `status=complete` dans l'URL : s'y fier laisserait n'importe qui ouvrir un
   * abonnement en tapant cette adresse à la main. C'est le fournisseur qu'on interroge, et
   * lui seul.
   */
  app.post('/v1/billing/verify', async (request) => {
    const context = sekuuOf(request);

    const changed = await service.verifyPending(context.organizationId, providers);

    return success({ changed });
  });

  /**
   * Le portail du fournisseur, où le client change de carte et résilie lui-même.
   *
   * Le faire chez nous aurait voulu dire toucher aux moyens de paiement — ce qu'on évite
   * précisément en passant par des pages hébergées.
   */
  app.post('/v1/billing/portal', async (request) => {
    const context = sekuuOf(request);

    if (!can(context, 'settings.write')) {
      throw forbidden('Votre rôle ne permet pas de gérer la facturation.');
    }

    const customerRef = await billing.stripeCustomerOf(context.organizationId);

    if (!customerRef) {
      throw conflict('Aucun abonnement par carte à gérer pour cette organisation.');
    }

    const provider = providers.find((candidate) => candidate.portalUrl !== undefined);

    if (!provider?.portalUrl) throw conflict('Aucun portail de facturation configuré.');

    return success({
      redirect_url: await provider.portalUrl(customerRef, `${appUrl}/facturation`),
    });
  });
}

/**
 * Le webhook, déclaré hors du contexte authentifié.
 *
 * **Le corps brut est indispensable.** La signature couvre les octets reçus ; re-sérialiser
 * un JSON analysé change l'ordre des clés et les espaces, donc l'empreinte, et la
 * vérification échoue pour une raison qui n'a rien à voir avec la sécurité. Fastify analyse
 * le JSON par défaut : ce point de terminaison déclare donc son propre lecteur, qui garde
 * les octets.
 */
export function registerBillingWebhook(
  app: FastifyInstance,
  dependencies: { service: BillingService; providers: readonly PaymentProvider[] },
): void {
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_request, body, done) => {
      done(null, body);
    },
  );

  app.post('/v1/billing/webhooks/:provider', async (request, reply) => {
    const key = (request.params as { provider: string }).provider;
    const provider = dependencies.providers.find((candidate) => candidate.key === key);

    if (!provider) throw notFound('Fournisseur inconnu.');

    const headers: Record<string, string | undefined> = {};

    for (const [name, value] of Object.entries(request.headers)) {
      headers[name] = Array.isArray(value) ? value[0] : value;
    }

    let event;

    try {
      event = provider.readEvent(request.body as Buffer, headers);
    } catch (error) {
      /*
       * **Un refus laisse une trace, et c'est ce qui manquait.**
       *
       * Un webhook refusé ne disait rien de plus qu'un 400 au fournisseur : de notre côté,
       * rien. Quand un paiement est resté bloqué, il a été impossible de distinguer
       * « jamais livré » de « livré et refusé » — et c'est précisément la question à
       * laquelle il fallait répondre.
       *
       * Le corps part au journal, tronqué. Il vient du dehors et peut être volumineux ;
       * mais sans lui on sait seulement qu'on a refusé, pas pourquoi.
       */
      request.log.warn(
        {
          provider: provider.key,
          reason: error instanceof Error ? error.message : String(error),
          signature_present:
            headers['x-notch-signature'] !== undefined ||
            headers['stripe-signature'] !== undefined,
          body: (request.body as Buffer).toString('utf8').slice(0, 500),
        },
        'webhook.rejected',
      );

      /*
       * La réponse, elle, ne dit rien : il n'y a aucune raison d'apprendre à qui essaie si
       * c'est l'empreinte ou l'horodatage qui a manqué. Et pas de 500 — un 5xx ferait
       * réessayer indéfiniment une requête qui ne sera jamais valide.
       */
      return reply.status(400).send({ success: false });
    }

    const result = await dependencies.service.apply(provider, event);

    /*
     * 200 même pour un événement ignoré ou déjà vu.
     *
     * Le fournisseur ne lit qu'un code : tout ce qui n'est pas 2xx le fait réessayer. Un
     * doublon qu'on signalerait en erreur reviendrait en boucle, indéfiniment.
     */
    return reply.status(200).send(success({ applied: result.applied }));
  });
}
