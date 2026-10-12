import { describe, it, expect, vi } from 'vitest';
import { startExpirySweeper } from './sweeper.js';
import type { BillingService } from './service.js';

/**
 * Le balayage horaire de la facturation.
 *
 * C'est le seul mécanisme qui coupe un prépayé non renouvelé : le mobile money ne notifie
 * rien quand un client ne repaie pas. Ce qui est tenu ici n'est pas le compte des lignes
 * — `expire()` s'en charge et a ses propres tests — mais que **le balayage survive à ce
 * qui tourne mal**. Un rejet non capturé dans un `setInterval` tue le processus : l'API
 * entière tomberait parce qu'un travail de fond a échoué.
 */

const serviceThat = (
  expire: () => Promise<number>,
  rest: Partial<BillingService> = {},
) =>
  ({
    expire,
    expireStalePayments: () => Promise.resolve(0),
    verifyAllPending: () => Promise.resolve(0),
    ...rest,
  }) as unknown as BillingService;

describe('le balayage', () => {
  it('passe une première fois au démarrage', async () => {
    // Un déploiement rattrape ainsi ce qu'une instance endormie a laissé passer.
    const expire = vi.fn(() => Promise.resolve(2));
    const sweeper = startExpirySweeper(serviceThat(expire));

    await vi.waitFor(() => {
      expect(expire).toHaveBeenCalledTimes(1);
    });

    sweeper.stop();
  });

  it('ne journalise que ce qui s’est produit', async () => {
    /*
     * Une ligne par heure disant « rien à faire » noierait celles qui comptent — et c'est
     * dans ce journal qu'on cherchera le jour où un client dira avoir perdu son accès.
     */
    const lines: string[] = [];
    const report = (message: string) => lines.push(message);

    const quiet = startExpirySweeper(
      serviceThat(() => Promise.resolve(0)),
      { report },
    );
    await quiet.run();
    quiet.stop();

    expect(lines.filter((line) => line === 'billing.expired')).toEqual([]);

    const busy = startExpirySweeper(
      serviceThat(() => Promise.resolve(3)),
      { report },
    );
    await busy.run();
    busy.stop();

    expect(lines).toContain('billing.expired');
  });

  it('survit à une base indisponible', async () => {
    /*
     * Le cas qui compte. Laisser l'erreur remonter d'un `setInterval` tue le processus sur
     * un rejet non capturé : une base qui tousse emporterait l'API avec elle, et le
     * redémarrage retomberait sur la même base.
     */
    const lines: { message: string; details: Record<string, unknown> }[] = [];

    const sweeper = startExpirySweeper(
      serviceThat(() => Promise.reject(new Error('la base ne répond pas'))),
      { report: (message, details) => lines.push({ message, details }) },
    );

    await expect(sweeper.run()).resolves.toBe(0);
    sweeper.stop();

    expect(lines.map((line) => line.message)).toContain('billing.sweep_failed');
    // Le message de l'erreur part au journal : sans lui, on sait qu'il a échoué et pas
    // pourquoi.
    expect(lines[lines.length - 1]?.details['error']).toMatch(/ne répond pas/u);
  });

  it('va demander aux encaisseurs ce que le webhook n’a pas dit', async () => {
    /*
     * Le cas qui a coûté un accès en production : deux encaissements réels, aucun webhook
     * reçu, et la seule sonde qui existait ne partait que si le client revenait sur la
     * page. Sans fournisseur, rien à sonder — et surtout pas une erreur.
     */
    const verifyAllPending = vi.fn(() => Promise.resolve(2));
    const lines: string[] = [];
    const report = (message: string) => lines.push(message);

    const blind = startExpirySweeper(
      serviceThat(() => Promise.resolve(0), { verifyAllPending }),
      { report },
    );
    await blind.run();
    blind.stop();

    expect(verifyAllPending).not.toHaveBeenCalled();

    const sighted = startExpirySweeper(
      serviceThat(() => Promise.resolve(0), { verifyAllPending }),
      { report, providers: [{ key: 'notchpay' }] as never },
    );
    await sighted.run();
    sighted.stop();

    // Pas un compte : le premier passage a lieu au démarrage, sans être attendu.
    expect(verifyAllPending).toHaveBeenCalled();
    expect(lines).toContain('billing.confirmed_late');
  });

  it('clôt les tentatives qu’aucun encaissement n’honorera plus', async () => {
    /*
     * Une page de paiement périmée que `openPayment` rouvrirait renverrait un client qui
     * reclique vers une adresse morte. Et une ligne jamais close serait sondée sans fin.
     */
    const expireStalePayments = vi.fn(() => Promise.resolve(3));
    const lines: string[] = [];

    const sweeper = startExpirySweeper(
      serviceThat(() => Promise.resolve(0), { expireStalePayments }),
      { report: (message) => lines.push(message) },
    );
    await sweeper.run();
    sweeper.stop();

    expect(expireStalePayments).toHaveBeenCalled();
    expect(lines).toContain('billing.payments_expired');
  });

  it('repasse à l’intervalle demandé, et s’arrête quand on le lui dit', async () => {
    vi.useFakeTimers();

    const expire = vi.fn(() => Promise.resolve(0));
    const sweeper = startExpirySweeper(serviceThat(expire), { intervalMs: 1000 });

    await vi.advanceTimersByTimeAsync(3500);
    expect(expire.mock.calls.length).toBeGreaterThanOrEqual(4);

    sweeper.stop();
    const after = expire.mock.calls.length;

    await vi.advanceTimersByTimeAsync(5000);
    expect(expire.mock.calls.length).toBe(after);

    vi.useRealTimers();
  });
});
