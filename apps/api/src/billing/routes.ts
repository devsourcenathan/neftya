import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { success } from '@neftya/contracts';
import { conflict, forbidden, notFound, serviceUnavailable } from '../http/errors.js';
import { sekuuOf } from '../sekuu/authenticate.js';
import { can } from '../sekuu/permission-resolver.js';
import type { AuthRepository } from '../auth/repository.js';
import { entitlementOf } from './entitlement.js';
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
  /** Les fournisseurs configurés. Un fournisseur sans clé n'est tout simplement pas là. */
  providers: readonly PaymentProvider[];
  /** L'adresse publique de l'interface, où le client revient après avoir payé. */
  appUrl: string;
}

export function registerBillingRoutes(
  app: FastifyInstance,
  dependencies: BillingDependencies,
): void {
  const { billing, service, auth, providers, appUrl } = dependencies;

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

    const [offers, subscription] = await Promise.all([
      billing.offers(),
      billing.subscriptionOf(context.organizationId),
    ]);

    const plans = new Map(offers.map((offer) => [offer.code, offer]));
    const entitlement = entitlementOf(subscription, plans, FREE_PLAN_CODE, now);

    const sellable = new Set(providers.flatMap((provider) => provider.currencies));

    return success({
      subscription: {
        plan: entitlement.planCode,
        /** L'offre payée, quand elle diffère de celle servie — un abonnement expiré. */
        paid_plan: subscription?.planCode ?? FREE_PLAN_CODE,
        status: subscription?.status ?? 'active',
        period: subscription?.period ?? 'free',
        current_period_end: subscription?.currentPeriodEnd?.toISOString() ?? null,
        lapsed: entitlement.lapsed,
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
          })),
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

    /*
     * La clé d'idempotence décrit **ce qui est demandé**, pas quand.
     *
     * Deux clics à une seconde d'intervalle produisent la même clé, donc la même ligne et
     * la même session chez le fournisseur. Y mêler l'horodatage aurait rendu la clé unique
     * à chaque clic, c'est-à-dire inutile.
     */
    const idempotencyKey = `${context.organizationId}:${body.plan}:${body.period}:${body.currency}`;

    const payment = await service.openPayment({
      organizationId: context.organizationId,
      provider: provider.key,
      planCode: body.plan,
      period: body.period,
      currency: body.currency,
      amountMinor,
      idempotencyKey,
    });

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
        label: `Neftya ${body.plan}`,
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

    await service.attachProviderRef(payment.id, started.providerRef);

    return success({ redirect_url: started.redirectUrl });
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
    } catch {
      /*
       * Une signature fausse reçoit 400, et rien d'autre.
       *
       * Pas de détail : il n'y a aucune raison d'apprendre à qui essaie si c'est
       * l'empreinte ou l'horodatage qui a manqué. Et pas de 500 : un 5xx ferait réessayer
       * le fournisseur indéfiniment pour une requête qui ne sera jamais valide.
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
