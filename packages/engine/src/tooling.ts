import type { DrillingResult, HolePurpose, Pocket } from './drilling.js';

/**
 * Ce qui peut réclamer un outil.
 *
 * Un perçage, ou une poche : la défonceuse n'est demandée par aucun trou, et une liste
 * qui ne connaîtrait que les trous l'aurait oubliée — précisément l'outil dont l'absence
 * arrête le travail.
 */
export type ToolReason = HolePurpose | Pocket['purpose'];

/**
 * De quoi faut-il, et est-ce que je sais le faire ?
 *
 * La question qu'on se pose **avant** d'acheter des panneaux, et à laquelle rien ne
 * répondait : le dossier de fabrication dit où percer et avec quel diamètre, mais il ne dit
 * nulle part qu'un boîtier de charnière demande une mèche Forstner de 35 — que personne n'a
 * dans son tiroir — ni qu'une poignée encastrée demande une défonceuse.
 *
 * **Tout est déduit du perçage, rien n'est décidé ici.** Un outil est nécessaire parce
 * qu'un trou le réclame ; la liste suit donc le meuble, et change avec lui. Un inventaire
 * écrit d'avance aurait fini par mentionner une mèche dont plus aucun trou n'a besoin.
 *
 * Le niveau se lit de la même source : il n'est pas une appréciation, c'est le nom de
 * l'outil le plus exigeant que le meuble réclame.
 *
 * @see docs/MANUFACTURING.md §6
 */

export type ToolKey =
  | 'drill'
  | 'driver'
  | 'clamps'
  | 'square'
  | 'tape'
  | 'saw'
  | 'countersink'
  | 'forstner_35'
  | 'router'
  | 'dowel_jig'
  | `bit_${string}`;

export interface ToolLine {
  key: ToolKey;
  /**
   * Ce qui réclame cet outil, dans l'ordre du perçage.
   *
   * Nommé, parce qu'« une mèche de 5 » ne dit pas si on peut s'en passer. « Pour les
   * taquets d'étagère » le dit : on renonce aux étagères réglables, ou on achète la mèche.
   */
  reasons: ToolReason[];
  /**
   * Faux pour ce qu'on peut faire faire ou remplacer.
   *
   * La scie en est le seul cas aujourd'hui : le magasin coupe. Le marquer évite de décourager
   * quelqu'un devant une liste où la scie à panneaux voisine avec le mètre ruban.
   */
  optional?: boolean;
}

/**
 * Le niveau, et ce qu'il veut dire.
 *
 * `beginner` — une perceuse, des mèches, des serre-joints. Rien qui demande d'avoir déjà
 * fait. `intermediate` — un outil qu'on achète pour l'occasion et qu'on apprend en une
 * fois : la Forstner, le gabarit de tourillonnage. `advanced` — la défonceuse, qui
 * s'apprend sur des chutes avant de toucher une façade.
 */
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export interface Tooling {
  tools: ToolLine[];
  level: SkillLevel;
  /** Les outils qui ont fait monter le niveau. Vide pour un meuble de débutant. */
  demanding: ToolKey[];
}

/** Ce qui fait passer au-dessus du niveau débutant, du plus exigeant au moins. */
const DEMANDING: readonly { key: ToolKey; level: SkillLevel }[] = [
  { key: 'router', level: 'advanced' },
  { key: 'forstner_35', level: 'intermediate' },
  { key: 'dowel_jig', level: 'intermediate' },
];

/** Toujours là : on ne monte aucun meuble sans ça. */
const ALWAYS: readonly ToolKey[] = ['drill', 'driver', 'clamps', 'square', 'tape'];

/**
 * Le perçage suffit, et c'est voulu.
 *
 * Passer le meuble en plus aurait ouvert la porte à des règles qui ne viennent pas des
 * trous — « un meuble de plus de deux mètres demande un escabeau » — et la liste aurait
 * cessé d'être vérifiable contre quoi que ce soit.
 */
export function tooling(drilling: DrillingResult): Tooling {
  const reasons = new Map<ToolKey, ToolReason[]>();

  const need = (key: ToolKey, purpose?: ToolReason) => {
    const existing = reasons.get(key) ?? [];
    if (purpose !== undefined && !existing.includes(purpose)) existing.push(purpose);
    reasons.set(key, existing);
  };

  for (const key of ALWAYS) need(key);

  // Le magasin coupe, et c'est tout l'intérêt de la fiche de débit. La scie reste listée
  // pour qui a de quoi scier, et marquée comme telle.
  need('saw');

  for (const part of drilling.parts) {
    for (const hole of part.holes) {
      /*
       * **La mèche se nomme par le diamètre du trou, pas par l'outil supposé.**
       *
       * Un boîtier de charnière est un trou de 35 : c'est une Forstner, et une mèche à bois
       * ordinaire de 35 n'existe pas. Le cas est donc nommé, et tout le reste suit le
       * diamètre — y compris les 5,5 et les 3 du mode vissé, qu'aucune liste écrite d'avance
       * n'aurait prévus.
       */
      if (hole.purpose === 'hinge_cup') need('forstner_35', hole.purpose);
      else need(`bit_${format(hole.diameterMm)}`, hole.purpose);

      // Une tête de vis qui ne s'enfonce pas tient le panneau écarté. La fraise est le seul
      // outil réclamé par un trou traversant plutôt que par son diamètre.
      if (hole.purpose === 'screw_clearance') need('countersink', hole.purpose);
    }

    // Une poche se fraise. Aucune mèche ne creuse un rectangle, et l'essayer abîme la
    // façade qu'on voulait soigner.
    for (const pocket of part.pockets) need('router', pocket.purpose);
  }

  /*
   * Le gabarit, et seulement s'il y a des tourillons à poser.
   *
   * C'est lui qui sépare le meuble faisable du meuble raté : deux trous qui se font face au
   * dixième ne s'obtiennent pas à main levée. Le dire ici, c'est donner le choix de passer
   * en vissé avant d'avoir percé.
   */
  const hasDowels = drilling.parts.some((part) =>
    part.holes.some((hole) => hole.purpose === 'dowel'),
  );

  if (hasDowels) need('dowel_jig', 'dowel');

  /*
   * **L'ordre d'une liste de courses, pas celui d'un dictionnaire.**
   *
   * Trier sur la clé rangeait « Fraise à lamer » entre les serre-joints et la perceuse : un
   * ordre alphabétique dans une langue que personne ne lit — celle des clés. On range donc
   * par ce qu'on fait : ce qu'on a déjà, ce qu'il faut acheter, les mèches dans l'ordre des
   * diamètres, et ce dont on peut se passer en dernier.
   */
  const tools = [...reasons.entries()]
    .map(([key, list]) => ({
      key,
      reasons: list,
      ...(key === 'saw' ? { optional: true } : {}),
    }))
    .sort((a, b) => compareTools(a.key, b.key));

  const demanding = DEMANDING.filter((candidate) => reasons.has(candidate.key));

  return {
    tools,
    level: demanding[0]?.level ?? 'beginner',
    demanding: demanding.map((candidate) => candidate.key),
  };
}

/**
 * L'ordre de deux outils.
 *
 * Exporté pour être éprouvé sur son propre domaine, et non seulement sur les diamètres
 * qu'un meuble perce aujourd'hui. Ceux-là — 3, 5, 5,5 et 8 — se trient pareil en texte et
 * en nombre, par accident : `bit_10` passerait avant `bit_3`, et aucun meuble ne l'aurait
 * montré avant le jour où le moteur gagne une mèche de 10.
 */
export function compareTools(a: ToolKey, b: ToolKey): number {
  return rank(a) - rank(b) || compare(a, b);
}

/** Les familles, dans l'ordre où on les lit. */
function rank(key: ToolKey): number {
  if (key === 'saw') return 5;
  if (ALWAYS.includes(key)) return 0;
  if (DEMANDING.some((candidate) => candidate.key === key)) return 2;
  return key.startsWith('bit_') ? 3 : 4;
}

/**
 * À l'intérieur d'une famille.
 *
 * Les mèches par diamètre croissant — c'est l'ordre du tiroir et celui du rayon. Les
 * outils de toujours dans l'ordre où `ALWAYS` les nomme, qui est celui où on les prend.
 */
function compare(a: ToolKey, b: ToolKey): number {
  if (a.startsWith('bit_') && b.startsWith('bit_')) {
    return diameterOf(a) - diameterOf(b);
  }

  const order = ALWAYS.indexOf(a) - ALWAYS.indexOf(b);
  return ALWAYS.includes(a) && ALWAYS.includes(b) ? order : a.localeCompare(b);
}

function diameterOf(key: ToolKey): number {
  return Number(key.slice('bit_'.length).replace('_', '.'));
}

/**
 * `5.5` → `5_5`, `5` → `5`.
 *
 * Le point n'a pas sa place dans une clé — il se lit comme un séparateur de chemin dans un
 * catalogue de traduction, et `bit_5.5` y deviendrait `bit_5` contenant `5`.
 */
function format(diameterMm: number): string {
  return String(diameterMm).replace('.', '_');
}
