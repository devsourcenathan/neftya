import { describe, it, expect } from 'vitest';
import { paymentOutcome, renewalKind } from './state.js';

/**
 * Ce que la page de facturation a le droit de dire.
 *
 * Les deux défauts corrigés ici portaient sur de l'argent et sur un accès : une page qui
 * affirme « rien n'a été débité » sans l'avoir vérifié, et une page qui promet un
 * renouvellement qui n'arrivera pas.
 */

describe('ce qu’est devenu un paiement', () => {
  it('suit la ligne de paiement, pas l’adresse de retour', () => {
    /*
     * **La garde qui compte.** L'encaisseur renvoie le client avec `status=complete` dans
     * l'URL ; s'y fier laisserait n'importe qui afficher « merci, c'est payé » en tapant
     * cette adresse à la main. Et à l'inverse, un paiement *réglé* reste réglé même si le
     * client est revenu par le bouton « annuler » — ce qui arrive quand il reclique après
     * avoir validé sur son téléphone.
     */
    expect(paymentOutcome('annule', 'settled')).toBe('confirmed');
    expect(paymentOutcome('succes', 'failed')).toBe('refused');
  });

  it('distingue un refus d’un abandon', () => {
    /*
     * Les deux arrivaient sur la même adresse de retour et affichaient la même phrase :
     * « Paiement abandonné. Rien n'a été débité. » Un refus n'est pas un abandon — il y a
     * quelque chose à corriger — et la seconde phrase était inventée.
     */
    expect(paymentOutcome('annule', 'failed')).toBe('refused');
    expect(paymentOutcome('annule', 'pending')).toBe('unfinished');
    expect(paymentOutcome('annule', 'expired')).toBe('unfinished');
    expect(paymentOutcome('annule', 'canceled')).toBe('unfinished');
  });

  it('n’attend que là où il y a de quoi attendre', () => {
    // Le seul état mouvant : le client annonce un succès, l'encaisseur ne l'a pas encore
    // confirmé. Partout ailleurs, faire tourner un compteur ne mènerait à rien.
    expect(paymentOutcome('succes', 'pending')).toBe('waiting');
    expect(paymentOutcome('succes', null)).toBe('unfinished');
  });
});

describe('ce qui arrivera à l’échéance', () => {
  it('ne promet un prélèvement que s’il y a une carte', () => {
    expect(
      renewalKind({
        status: 'active',
        cancel_at_period_end: false,
        provider: 'stripe',
      }),
    ).toBe('auto');

    /*
     * **Le libellé qui mentait.** En mobile money rien ne se renouvelle : il faut repayer,
     * et personne ne le rappellera. « Renouvellement » promettait le contraire, et l'accès
     * tombait le jour dit.
     */
    expect(
      renewalKind({
        status: 'active',
        cancel_at_period_end: false,
        provider: 'notchpay',
      }),
    ).toBe('manual');

    // Sans encaisseur connu, on ne promet rien non plus.
    expect(
      renewalKind({ status: 'active', cancel_at_period_end: false, provider: null }),
    ).toBe('manual');
  });

  it('fait passer une résiliation devant tout le reste', () => {
    /*
     * Un abonnement par carte marqué « ne pas renouveler » doit annoncer une fin d'accès.
     * Annoncer un prélèvement automatique ferait croire au client que son clic sur
     * « résilier » n'a pas pris — et il recliquerait, ou écrirait au support.
     */
    expect(
      renewalKind({ status: 'active', cancel_at_period_end: true, provider: 'stripe' }),
    ).toBe('ends');

    expect(
      renewalKind({
        status: 'canceled',
        cancel_at_period_end: false,
        provider: 'stripe',
      }),
    ).toBe('ends');
  });

  it('garde l’accès à un impayé jusqu’à son échéance', () => {
    /*
     * `past_due` veut dire « un prélèvement a échoué », pas « c'est fini » : une carte
     * expirée se règle en deux minutes, et c'est l'échéance qui coupe. Annoncer une fin
     * d'accès ici ferait partir un client qui n'avait qu'une carte à remplacer.
     */
    expect(
      renewalKind({
        status: 'past_due',
        cancel_at_period_end: false,
        provider: 'stripe',
      }),
    ).toBe('auto');
  });
});
