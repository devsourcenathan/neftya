import type { BillingService } from './service.js';

/**
 * Le balayage des abonnements finis.
 *
 * **Sans lui, un prépayé expiré sert indéfiniment.** Stripe envoie une résiliation quand
 * il cesse de prélever ; NotchPay n'envoie rien du tout quand un client ne repaie pas —
 * c'est un non-événement, et personne ne notifie un non-événement. L'échéance est donc la
 * seule information disponible, et il faut aller la regarder.
 *
 * Un minuteur dans le processus, et non une tâche planifiée externe. Trois raisons :
 *
 *  - l'hébergement gratuit n'offre pas de planificateur, et en acheter un pour balayer
 *    trois lignes serait disproportionné ;
 *  - une tâche externe demanderait une route déclenchable, donc un secret de plus et une
 *    surface publique de plus, pour un travail qui n'intéresse personne du dehors ;
 *  - l'instance s'endort faute de trafic — mais les plafonds ne mordent que lorsque
 *    quelqu'un se sert du produit, c'est-à-dire exactement quand elle est réveillée. Un
 *    balayage manqué pendant un sommeil n'a servi personne de trop.
 *
 * Le premier passage a lieu au démarrage : un déploiement rattrape ainsi ce qu'une
 * instance endormie a laissé passer.
 */

/** Une fois par heure. Une échéance à la minute près n'intéresse personne. */
export const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export interface Sweeper {
  /** Le passage, exposé pour être déclenché à la main — et pour être testé. */
  run: () => Promise<number>;
  stop: () => void;
}

export function startExpirySweeper(
  service: BillingService,
  options: {
    intervalMs?: number;
    /** Où dire ce qui s'est passé. Un balayage muet ne se diagnostique pas. */
    report?: (message: string, details: Record<string, unknown>) => void;
  } = {},
): Sweeper {
  const intervalMs = options.intervalMs ?? SWEEP_INTERVAL_MS;
  const report = options.report ?? (() => {});

  const run = async (): Promise<number> => {
    try {
      const downgraded = await service.expire();

      /*
       * On ne journalise que ce qui s'est produit.
       *
       * Une ligne par heure disant « rien à faire » noierait celles qui comptent, et
       * c'est précisément dans ce journal qu'on cherchera le jour où un client dira avoir
       * perdu son accès sans raison.
       */
      if (downgraded > 0) {
        report('billing.expired', { downgraded });
      }

      return downgraded;
    } catch (error) {
      /*
       * Une base indisponible ne doit pas arrêter le minuteur.
       *
       * Laisser l'erreur remonter d'un `setInterval` tue le processus sur un rejet non
       * capturé : l'API entière tomberait parce qu'un balayage de fond a échoué. On note
       * et on réessaiera dans une heure.
       */
      report('billing.expiry_failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      return 0;
    }
  };

  void run();

  const timer = setInterval(() => void run(), intervalMs);

  /*
   * `unref` : ce minuteur n'est pas une raison de garder le processus en vie.
   *
   * Sans lui, un arrêt propre attendrait l'heure suivante, et les tests ne rendraient
   * jamais la main.
   */
  timer.unref();

  return { run, stop: () => clearInterval(timer) };
}
