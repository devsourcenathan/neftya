import type { ParsedFurnitureInput } from '@neftya/engine';
import type { ApiClient } from './client.js';

/**
 * L'assistant : une description, une configuration.
 *
 * Deux appels, parce que la tâche n'est pas synchrone côté plateforme. Le navigateur
 * revient, et c'est le bon endroit pour attendre : le serveur, lui, tiendrait un processus
 * pendant que le modèle réfléchit.
 *
 * @see apps/api/src/assistant/routes.ts
 * @see docs/SEKUU.md §8.1
 */

/**
 * `unusable` n'est **pas** une erreur.
 *
 * La génération a réussi, elle a coûté, et son résultat est lisible : la phrase ne disait
 * simplement pas de quoi faire un meuble. Il faut la reformuler, pas réessayer — et c'est
 * pour cela que ce n'est pas un état d'échec HTTP.
 */
export type InterpretationStatus =
  'queued' | 'running' | 'succeeded' | 'unusable' | 'failed' | 'cancelled';

export interface InterpretationResource {
  id: string;
  status: InterpretationStatus;
  /** Présent uniquement sur `succeeded`. */
  model: ParsedFurnitureInput | null;
  /** Présent uniquement sur `unusable` : les problèmes, par champ. */
  problems: Record<string, string[]> | null;
}

export const interpretDescription = (api: ApiClient, text: string) =>
  api<InterpretationResource>('/v1/assistant/interpretations', {
    method: 'POST',
    body: { text },
  });

/**
 * Depuis une photo, et **une seule cote**.
 *
 * Une image ne porte aucune dimension. Le modèle rend des proportions ; la largeur
 * hors-tout donne l'échelle, et les deux autres cotes s'en déduisent. Demander des
 * millimètres à un modèle qui regarde une photo, c'est lui demander d'inventer.
 */
export const interpretImage = (
  api: ApiClient,
  image: string,
  widthMm?: number,
  depthMm?: number,
) =>
  api<InterpretationResource>('/v1/assistant/interpretations', {
    method: 'POST',
    body: {
      image,
      ...(widthMm === undefined ? {} : { widthMm }),
      ...(depthMm === undefined ? {} : { depthMm }),
    },
  });

/**
 * Au-delà, l'API refuse — autant le dire avant d'envoyer trois mégaoctets pour rien.
 *
 * La borne est celle du serveur, ramenée en octets : le base64 pèse un tiers de plus que
 * les octets qu'il transporte.
 */
export const MAX_IMAGE_BYTES = 3_000_000;

/** Lit un fichier en `data:` URL, la forme que l'API attend. */
export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(new Error('lecture impossible')));
    reader.readAsDataURL(file);
  });
}

export const readInterpretation = (api: ApiClient, id: string) =>
  api<InterpretationResource>(`/v1/assistant/interpretations/${id}`);

/** Entre deux sondages. Assez court pour ne pas se faire attendre, assez long pour ne pas marteler. */
export const POLL_INTERVAL_MS = 1_500;

/**
 * Combien de fois on redemande avant de renoncer.
 *
 * Vingt sondages à 1,5 s font trente secondes. Au-delà, quelque chose ne va pas, et
 * continuer indéfiniment laisserait un onglet interroger la plateforme toute la journée —
 * ce que personne ne verrait et que tout le monde paierait.
 */
export const MAX_POLLS = 20;

/**
 * Faut-il redemander, et dans combien de temps ?
 *
 * Extraite du composant parce que c'est la seule logique du cycle : un `refetchInterval`
 * écrit en place serait vrai le jour où on l'écrit et faux au premier état ajouté.
 */
export function nextPoll(
  status: InterpretationStatus | undefined,
  polls: number,
): number | false {
  // Rien n'est encore parti : il n'y a rien à redemander.
  if (status === undefined) return false;

  // `unusable` est terminal au même titre que `succeeded` : la génération est finie, et la
  // redemander ne la rendra pas meilleure — elle coûterait un appel de plus pour rien.
  if (status !== 'queued' && status !== 'running') return false;

  if (polls >= MAX_POLLS) return false;

  return POLL_INTERVAL_MS;
}

/** A-t-on renoncé, plutôt qu'obtenu une réponse ? */
export function gaveUp(
  status: InterpretationStatus | undefined,
  polls: number,
): boolean {
  return (status === 'queued' || status === 'running') && polls >= MAX_POLLS;
}
