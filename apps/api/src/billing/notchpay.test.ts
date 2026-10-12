import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { NotchPayProvider } from './notchpay.js';
import type { CheckoutRequest } from './provider.js';

/**
 * L'adaptateur NotchPay.
 *
 * Aucun réseau : `fetch` est remplacé. La signature, elle, est calculée pour de vrai — la
 * vérification est le seul endroit de ce fichier où une erreur se paie en accès offert, et
 * un faux qui rendrait toujours « valide » laisserait passer exactement ce défaut.
 *
 * Deux particularités de ce fournisseur sont tenues ici : la clé d'autorisation s'envoie
 * **nue**, sans `Bearer`, et c'est **notre** référence qui permet de retrouver le paiement
 * — son webhook peut arriver avant que notre requête d'initialisation ne soit revenue.
 */

const HASH = 'hash_de_test_pour_les_webhooks_notchpay';

const config = {
  publicKey: 'pk_test_abc',
  webhookHash: HASH,
  baseUrl: 'https://api.notchpay.test',
};

const request: CheckoutRequest = {
  organizationId: '01924f00-0000-7000-8000-00000000000a',
  planCode: 'pro',
  period: 'monthly',
  currency: 'XAF',
  amountMinor: 19000,
  label: 'Neftya Pro',
  customerEmail: 'menuisier@atelier.test',
  successUrl: 'https://neftya.test/facturation?paiement=succes',
  cancelUrl: 'https://neftya.test/facturation',
  idempotencyKey: 'org:pro:monthly:XAF',
};

/** Un `fetch` qui ne sort pas et retient ce qu'on lui a demandé. */
function fakeFetch(response: { status?: number; body?: unknown } = {}): {
  impl: typeof fetch;
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];

  const impl = ((url: string, init: RequestInit) => {
    calls.push({ url, init });

    return Promise.resolve({
      ok: (response.status ?? 201) < 400,
      status: response.status ?? 201,
      json: () =>
        Promise.resolve(
          response.body ?? {
            status: 'Accepted',
            code: 201,
            /*
             * La forme **réelle**, relevée sur l'API avec une clé de test le 12 octobre
             * 2026. La documentation annonce `transaction: "<identifiant>"` ; elle rend
             * un objet. Un faux écrit d'après la documentation rendait ce test vert
             * pendant que l'ouverture d'un paiement échouait en production.
             */
            transaction: {
              amount: 19000,
              reference: 'trx.test_abc123',
              merchant_reference: 'org:pro:monthly:XAF',
              trxref: 'org:pro:monthly:XAF',
              status: 'pending',
            },
            authorization_url: 'https://pay.notchpay.co/pay_abc123',
          },
        ),
    });
  }) as unknown as typeof fetch;

  return { impl, calls };
}

describe('ouvrir un paiement', () => {
  it('envoie la clé nue, sans Bearer', async () => {
    /*
     * La documentation l'écrit en toutes lettres, et c'est inhabituel. Ajouter le préfixe
     * par réflexe donne un 401 dont rien ne dit la cause — on cherche alors du côté de la
     * clé, qui est pourtant bonne.
     */
    const { impl, calls } = fakeFetch();
    await new NotchPayProvider(config, impl).startCheckout(request);

    const headers = calls[0]?.init.headers as Record<string, string>;

    expect(headers['authorization']).toBe('pk_test_abc');
    expect(headers['authorization']).not.toMatch(/Bearer/iu);
  });

  it('envoie le montant et la devise tels quels', async () => {
    // Le franc CFA n'a pas de décimale : 19 000 F se transmet 19000, sans conversion.
    const { impl, calls } = fakeFetch();
    await new NotchPayProvider(config, impl).startCheckout(request);

    const body = JSON.parse(calls[0]?.init.body as string) as Record<string, unknown>;

    expect(body['amount']).toBe(19000);
    expect(body['currency']).toBe('XAF');
  });

  it('fait voyager notre référence', async () => {
    // C'est par elle que le webhook retrouvera la ligne, quel que soit l'ordre d'arrivée.
    const { impl, calls } = fakeFetch();
    await new NotchPayProvider(config, impl).startCheckout(request);

    const body = JSON.parse(calls[0]?.init.body as string) as Record<string, unknown>;

    expect(body['reference']).toBe('org:pro:monthly:XAF');
  });

  it('rend l’adresse de la page hébergée et leur référence', async () => {
    const { impl } = fakeFetch();
    const started = await new NotchPayProvider(config, impl).startCheckout(request);

    expect(started.redirectUrl).toBe('https://pay.notchpay.co/pay_abc123');
    expect(started.providerRef).toBe('trx.test_abc123');
  });

  it('accepte aussi la forme décrite par la documentation', async () => {
    // Rien ne dit si c'est la documentation qui est en retard ou l'API qui est en avance.
    // La tolérance coûte une ligne.
    const { impl } = fakeFetch({
      body: {
        transaction: 'trx_ancienne_forme',
        authorization_url: 'https://pay.notchpay.co/x',
      },
    });

    const started = await new NotchPayProvider(config, impl).startCheckout(request);

    expect(started.providerRef).toBe('trx_ancienne_forme');
  });

  it('refuse un rejet sans relayer le corps de l’erreur', async () => {
    /*
     * Le corps peut porter des éléments de configuration du compte marchand, et l'appelant
     * n'en ferait rien. Le message dit le code HTTP, pas le détail.
     */
    const { impl } = fakeFetch({ status: 422, body: { message: 'secret interne' } });

    await expect(
      new NotchPayProvider(config, impl).startCheckout(request),
    ).rejects.toThrow(/HTTP 422/u);

    await expect(
      new NotchPayProvider(config, impl).startCheckout(request),
    ).rejects.not.toThrow(/secret interne/u);
  });

  it('refuse une réponse sans adresse plutôt que d’y envoyer le client', async () => {
    const { impl } = fakeFetch({ body: { transaction: { reference: 'trx.test_x' } } });

    await expect(
      new NotchPayProvider(config, impl).startCheckout(request),
    ).rejects.toThrow(/sans adresse/u);
  });
});

/** Signe un corps comme NotchPay le signe : HMAC-SHA256 hexadécimal sur les octets reçus. */
function signed(payload: unknown): {
  body: Buffer;
  headers: Record<string, string | undefined>;
} {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');

  return {
    body,
    headers: {
      'x-notch-signature': createHmac('sha256', HASH).update(body).digest('hex'),
    },
  };
}

const provider = new NotchPayProvider(config);

describe('lire un webhook', () => {
  /*
   * La forme **réelle** du paiement, relevée sur `GET /payments/{reference}`.
   *
   * `reference` est celle de NotchPay, `merchant_reference` est la nôtre — la
   * documentation dit l'inverse — et il n'y a pas de champ `id`. Le schéma écrit d'après
   * la documentation exigeait `data.id` : un vrai webhook aurait été refusé, NotchPay
   * aurait réessayé indéfiniment, et un client qui a payé n'aurait jamais eu son accès.
   */
  const complete = {
    id: 'evt_1',
    type: 'payment.complete',
    data: {
      reference: 'trx.test_abc123',
      merchant_reference: 'org:pro:monthly:XAF',
      trxref: 'org:pro:monthly:XAF',
      status: 'complete',
      amount: 19000,
      currency: 'XAF',
    },
  };

  it('accepte une signature juste', () => {
    const { body, headers } = signed(complete);

    expect(provider.readEvent(body, headers)).toMatchObject({
      kind: 'payment_settled',
      eventId: 'evt_1',
      // La leur pour les retrouver chez eux, la nôtre pour retrouver la ligne chez nous.
      providerRef: 'trx.test_abc123',
      merchantRef: 'org:pro:monthly:XAF',
    });
  });

  it('refuse une signature fausse', () => {
    const { body } = signed(complete);

    expect(() =>
      provider.readEvent(body, { 'x-notch-signature': 'a'.repeat(64) }),
    ).toThrow(/invalide/u);
  });

  it('refuse une signature tronquée sans lever d’erreur de comparaison', () => {
    /*
     * `timingSafeEqual` lève quand les longueurs diffèrent. Sans le contrôle préalable,
     * une signature courte produirait une exception interne au lieu d'un refus — un 500
     * là où il faut un 400, donc un fournisseur qui réessaie indéfiniment.
     */
    const { body } = signed(complete);

    expect(() => provider.readEvent(body, { 'x-notch-signature': 'ab' })).toThrow(
      /invalide/u,
    );
  });

  it('refuse un corps modifié après signature', () => {
    const { body, headers } = signed(complete);
    const altered = Buffer.from(
      body.toString('utf8').replace('trx.test_abc123', 'trx.test_pirate'),
      'utf8',
    );

    expect(() => provider.readEvent(altered, headers)).toThrow(/invalide/u);
  });

  it('refuse un webhook sans signature du tout', () => {
    const { body } = signed(complete);

    expect(() => provider.readEvent(body, {})).toThrow(/signature/u);
  });

  it('traite les trois issues négatives pareil', () => {
    // Échoué, annulé, expiré : dans les trois cas le client n'a pas payé, et le registre
    // n'a rien d'autre à en dire.
    for (const type of ['payment.failed', 'payment.canceled', 'payment.expired']) {
      const { body, headers } = signed({ ...complete, id: `evt_${type}`, type });

      expect(provider.readEvent(body, headers)).toMatchObject({
        kind: 'payment_failed',
        providerRef: 'trx.test_abc123',
        merchantRef: 'org:pro:monthly:XAF',
      });
    }
  });

  it('ignore ce qui ne change aucun droit', () => {
    // `payment.created` arrive sur chaque paiement : répondre en erreur le ferait
    // réessayer indéfiniment.
    const { body, headers } = signed({
      ...complete,
      id: 'evt_2',
      type: 'payment.created',
    });

    expect(provider.readEvent(body, headers)).toMatchObject({ kind: 'ignored' });
  });

  it('accepte un webhook sans identifiant d’événement', () => {
    /*
     * **Le champ qu'on n'a jamais observé.**
     *
     * La documentation annonce un `id` au premier niveau ; elle s'est déjà trompée sur le
     * type de `transaction`, sur l'existence de `data.id` et sur le sens de `reference`.
     * L'exiger, c'était risquer de refuser un webhook authentique — et un webhook refusé
     * laisse un client payé sans accès, en silence.
     */
    const { body, headers } = signed({
      type: 'payment.complete',
      data: {
        reference: 'trx.test_sansid',
        merchant_reference: 'org:pro:monthly:XAF',
        status: 'complete',
      },
    });

    const event = provider.readEvent(body, headers);

    expect(event).toMatchObject({
      kind: 'payment_settled',
      merchantRef: 'org:pro:monthly:XAF',
    });
    // L'identifiant dérivé reste le même d'un rejeu à l'autre : c'est tout ce que la
    // déduplication demande.
    expect(event.eventId).toBe('payment.complete:trx.test_sansid');
    expect(provider.readEvent(body, headers).eventId).toBe(event.eventId);
  });

  it('refuse un corps signé mais illisible', () => {
    /*
     * Signé ne veut pas dire conforme. Un `data` absent ferait lever une erreur de lecture
     * plus loin, là où plus rien ne dit que le défaut vient du corps reçu.
     */
    const { body, headers } = signed({ id: 'evt_3', type: 'payment.complete' });

    expect(() => provider.readEvent(body, headers)).toThrow(/illisible/u);
  });
});

/**
 * La sonde.
 *
 * Un webhook peut ne jamais arriver — c'est arrivé le jour de la mise en service, avec un
 * point de terminaison non déclaré chez le fournisseur. Le client restait devant « nous
 * attendons la confirmation » pendant que son argent était parti.
 */
describe('demander l’état d’un paiement', () => {
  const retrieve = (status: string) =>
    fakeFetch({
      body: {
        transaction: {
          reference: 'trx.test_abc123',
          merchant_reference: 'org:pro:monthly:XAF',
          status,
        },
      },
    });

  it('interroge leur référence, pas la nôtre', async () => {
    // `GET /payments/{reference}` ne connaît pas `merchant_reference` : un essai avec la
    // nôtre rend 404, et le paiement resterait bloqué.
    const { impl, calls } = retrieve('complete');
    await new NotchPayProvider(config, impl).verify('trx.test_abc123');

    expect(calls[0]?.url).toContain('/payments/trx.test_abc123');
  });

  it('règle un paiement abouti, en portant les deux références', async () => {
    const { impl } = retrieve('complete');
    const event = await new NotchPayProvider(config, impl).verify('trx.test_abc123');

    expect(event).toMatchObject({
      kind: 'payment_settled',
      providerRef: 'trx.test_abc123',
      merchantRef: 'org:pro:monthly:XAF',
    });
  });

  it('ne conclut rien tant que le client valide encore', async () => {
    /*
     * `pending` et `processing` : il est peut-être devant son téléphone, en train de taper
     * son code. Fermer la tentative ici lui ferait perdre un paiement en cours.
     */
    for (const status of ['pending', 'processing']) {
      const { impl } = retrieve(status);

      expect(
        await new NotchPayProvider(config, impl).verify('trx.test_abc123'),
      ).toBeNull();
    }
  });

  it('ferme une tentative perdue', async () => {
    for (const status of ['failed', 'canceled', 'expired']) {
      const { impl } = retrieve(status);

      expect(
        await new NotchPayProvider(config, impl).verify('trx.test_abc123'),
      ).toMatchObject({ kind: 'payment_failed' });
    }
  });

  it('ne conclut rien quand le fournisseur ne répond pas', async () => {
    // Une panne chez eux ne doit pas fermer une tentative qui a peut-être abouti.
    const { impl } = fakeFetch({ status: 503, body: {} });

    expect(
      await new NotchPayProvider(config, impl).verify('trx.test_abc123'),
    ).toBeNull();
  });
});
