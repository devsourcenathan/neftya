import type { ParsedFurnitureInput } from '@neftya/engine';
import { normalise, reduce, type DesignerAction } from './model.js';

/**
 * L'annulation.
 *
 * ## Pourquoi elle vient avant les menus contextuels, et non après
 *
 * La manipulation directe sans `Ctrl+Z` fait peur. Quelqu'un qui ne peut pas revenir en
 * arrière cesse d'essayer — et un menu qui supprime un compartiment devient un piège plutôt
 * qu'un outil. L'historique n'est pas un confort ajouté après coup : c'est ce qui autorise
 * tout le reste.
 *
 * ## Ce qui entre dans l'historique, et ce qui n'y entre pas
 *
 * **Un état identique n'est pas un pas.** Le moteur borne les valeurs : tirer un curseur
 * déjà au maximum rend le même modèle, et empiler ces pas obligerait à presser `Ctrl+Z`
 * quarante fois pour défaire un geste.
 *
 * **Les gestes continus se fondent.** Faire glisser un curseur produit une action par
 * pixel ; chacune serait un pas, et annuler ne reculerait que d'un millimètre. Les actions
 * `fusible` — celles d'un même axe, à moins d'une demi-seconde — remplacent la précédente
 * au lieu de s'ajouter.
 */

export interface History {
  present: ParsedFurnitureInput;
  /** Du plus ancien au plus récent. Le dernier est ce qu'on retrouve en annulant. */
  past: readonly ParsedFurnitureInput[];
  /** Du plus proche au plus lointain : `future[0]` est ce que `redo` rétablit. */
  future: readonly ParsedFurnitureInput[];
  /** L'action qui a produit `present`, et quand — pour savoir si la suivante s'y fond. */
  last: { key: string; atMs: number } | null;
}

export type HistoryAction =
  | { type: 'do'; action: DesignerAction; atMs?: number }
  | { type: 'undo' }
  | { type: 'redo' }
  /** Repartir d'un modèle chargé : l'historique n'a plus lieu d'être. */
  | { type: 'reset'; model: unknown };

/**
 * Au-delà, on n'annule plus, on refait.
 *
 * Cinquante pas couvrent largement une séance de réglage, et bornent la mémoire : un
 * modèle est un petit objet, mais une pile sans fin en garde autant qu'on en produit.
 */
export const HISTORY_DEPTH = 50;

/** Deux actions du même geste continu se fondent en deçà de ce délai. */
export const MERGE_WINDOW_MS = 500;

/**
 * Ouvre un historique sur un modèle, **remis à la forme courante du schéma**.
 *
 * La normalisation est ici plutôt que chez l'appelant parce qu'un appelant peut l'oublier
 * — et l'a oublié : un projet enregistré avant l'ajout d'un champ levait « Cannot read
 * properties of undefined » au premier clic droit. Ici, c'est le seul chemin par lequel un
 * modèle entre dans le concepteur, et il n'y a plus rien à ne pas oublier.
 */
export function initialHistory(model: unknown): History {
  return { present: normalise(model), past: [], future: [], last: null };
}

export function reduceHistory(history: History, action: HistoryAction): History {
  switch (action.type) {
    case 'reset':
      return initialHistory(action.model);

    case 'undo': {
      const previous = history.past.at(-1);
      if (!previous) return history;

      return {
        present: previous,
        past: history.past.slice(0, -1),
        future: [history.present, ...history.future],
        // Après une annulation, le geste suivant ouvre un pas neuf : le fondre dans celui
        // qu'on vient de défaire le referait disparaître.
        last: null,
      };
    }

    case 'redo': {
      const next = history.future[0];
      if (!next) return history;

      return {
        present: next,
        past: [...history.past, history.present],
        future: history.future.slice(1),
        last: null,
      };
    }

    case 'do': {
      const present = reduce(history.present, action.action);

      // Une action bornée rend le **même modèle**, dans un objet neuf : tirer un curseur
      // déjà au maximum passe par `clamp` et reconstruit l'objet à l'identique. Comparer
      // les identités ne verrait rien, et chaque pixel de trop deviendrait un pas à
      // annuler. La comparaison porte donc sur les valeurs.
      if (identical(present, history.present)) return history;

      const atMs = action.atMs ?? Date.now();
      const key = mergeKey(action.action);

      if (
        key !== null &&
        history.last?.key === key &&
        atMs - history.last.atMs < MERGE_WINDOW_MS
      ) {
        // Le geste continue : on remplace son état d'arrivée, on n'empile pas.
        return { ...history, present, future: [], last: { key, atMs } };
      }

      return {
        present,
        past: [...history.past, history.present].slice(-HISTORY_DEPTH),
        // Refaire n'a plus de sens dès qu'on repart dans une autre direction.
        future: [],
        last: key === null ? null : { key, atMs },
      };
    }
  }
}

/**
 * Ce qui identifie un geste continu, ou `null` si l'action est un pas franc.
 *
 * Seuls les réglages qu'on fait glisser se fondent. Ajouter une étagère, dupliquer un
 * compartiment, en supprimer un : chacun est une décision, et chacun s'annule seul.
 */
function mergeKey(action: DesignerAction): string | null {
  // Ce qui se fait glisser se fond ; ce qui se clique, non. Trois clics sur un compteur
  // sont trois décisions, et fondre les deux derniers ferait reculer de deux quand on
  // demande un.
  if (action.type === 'dimension') return `dimension:${action.axis}`;

  // Tirer un séparateur émet une action par mouvement de pointeur. Sans fusion, annuler ne
  // reculerait que d'un millimètre — et il faudrait deux cents `Ctrl+Z` pour défaire un
  // geste. Un seul séparateur se tire à la fois : la clé n'a pas besoin de son rang.
  if (action.type === 'compartmentWidths') return 'compartmentWidths';

  // Tirer une poignée sur sa façade émet aussi une action par mouvement. La clé porte son
  // rang : deux poignées voisines déplacées coup sur coup restent deux pas.
  if (action.type === 'movePull') return `movePull:${action.index}:${action.pull}`;

  return null;
}

/**
 * Deux modèles portent-ils les mêmes valeurs ?
 *
 * Par sérialisation plutôt que par comparaison champ à champ : le modèle est un petit
 * objet construit par diffusion, donc d'ordre de clés stable, et une comparaison écrite à
 * la main oublierait le champ ajouté l'an prochain.
 */
function identical(a: ParsedFurnitureInput, b: ParsedFurnitureInput): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export const canUndo = (history: History): boolean => history.past.length > 0;
export const canRedo = (history: History): boolean => history.future.length > 0;
