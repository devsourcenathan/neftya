import { z } from 'zod';

/**
 * Un nom de donnée métier, traduit.
 *
 * **Un nom de modèle est de la donnée, pas une chaîne d'interface.** Une organisation qui
 * crée son propre modèle lui donne un nom qu'aucun fichier de locale ne connaîtra jamais :
 * il ne peut donc pas passer par `t()`, et il vit avec la donnée.
 *
 * Le français est la **langue de référence** : il est obligatoire, et sert de repli. Une
 * traduction absente affiche le français plutôt qu'une clé technique — un menuisier
 * anglophone lira « Meuble TV » et comprendra ; il ne comprendrait pas `template.42.name`.
 *
 * Ce qui n'est **pas** traduit, et ne doit jamais l'être : les identifiants de pièces
 * (`P01`), les codes de devise, les codes d'erreur, les références de prix, les slugs.
 *
 * @see docs/I18N.md §6
 */
export const localisedName = z
  .object({
    /** Obligatoire : c'est la langue de référence, celle du repli. */
    fr: z.string().trim().min(1).max(120),
    en: z.string().trim().min(1).max(120).optional(),
  })
  // Une langue ajoutée demain ne doit pas obliger à migrer le schéma.
  .catchall(z.string().trim().min(1).max(120));

export type LocalisedName = z.infer<typeof localisedName>;

/**
 * Le nom dans la langue demandée, ou en français.
 *
 * La locale peut arriver sous la forme `en-GB` : seule sa base est comparée. Un jeton qui
 * annonce `en-GB` doit lire l'anglais, pas retomber en français pour un tiret.
 */
export function resolveName(name: LocalisedName, locale: string): string {
  const base = locale.toLowerCase().split('-')[0] ?? '';
  const translated = base ? name[base] : undefined;

  return translated && translated.trim() !== '' ? translated : name.fr;
}
