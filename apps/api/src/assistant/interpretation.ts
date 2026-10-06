import { furnitureInput, type ParsedFurnitureInput } from '@neftya/engine';

/**
 * D'une description en français ou en anglais à une entrée du moteur.
 *
 * ## Ce que l'IA fait, et ce qu'elle ne décide pas
 *
 * Sekuu AI lit des **faits mesurables** dans une phrase : des cotes, un nombre de
 * compartiments, une matière. Elle ne construit pas le modèle. La structure — un
 * compartiment est un objet qui porte ses étagères, ses tiroirs et ses portes — est
 * composée **ici**, en code, parce que c'est une règle du moteur et non une lecture.
 *
 * C'est aussi ce que le contrat permet : la tâche `extract` rend un objet portant
 * exactement les clés demandées, et rien ne permet de déclarer la forme d'une valeur
 * imbriquée. Demander un tableau d'objets serait demander au modèle de l'inventer.
 *
 * ## La sortie est une proposition, jamais une vérité
 *
 * `furnitureInput.parse` tranche — le **même** schéma qui garde l'API. Un modèle qui rend
 * « 1800 » pour une hauteur en mètres, ou « chêne » pour une matière, est refusé par la
 * garde qui existait déjà, pas par du code de confiance écrit pour l'occasion.
 *
 * @see Sekuu-Platform/docs/03-services/ai/06-integration.md
 * @see docs/SEKUU.md
 */

/**
 * Les champs demandés à `extract`, et **le seul levier sur l'unité**.
 *
 * Les instructions de la tâche appartiennent à la plateforme — « Extrais les champs
 * demandés » — et ne sont pas surchargeables. Le nom du champ est donc tout ce qui dit au
 * modèle qu'on attend des millimètres, et ce n'est pas une garantie : d'où les bornes de
 * vraisemblance plus bas.
 */
export const EXTRACTED_FIELDS = [
  'widthMm',
  'heightMm',
  'depthMm',
  'compartments',
  'shelvesPerCompartment',
  'drawersPerCompartment',
  'doorsPerCompartment',
  'material',
  'hasBack',
] as const;

/**
 * Les champs demandés **à partir d'une image**.
 *
 * Mêmes faits de structure, mais **aucune cote** : une photo n'en porte pas, et le brief le
 * dit lui-même — « une image ne fournit pas : les dimensions ». Ce qu'elle porte, ce sont
 * des **proportions**, et l'utilisateur fournit l'échelle : une seule cote, la largeur
 * hors-tout.
 *
 * Demander des millimètres à un modèle qui regarde une photo, c'est lui demander d'inventer
 * — et une cote inventée a exactement l'air d'une cote mesurée.
 */
export const IMAGE_FIELDS = [
  'heightRatio',
  'depthRatio',
  'compartments',
  'shelvesPerCompartment',
  'drawersPerCompartment',
  'doorsPerCompartment',
  'material',
  'hasBack',
] as const;

/**
 * Au-delà de quoi une proportion n'en est plus une.
 *
 * Une penderie fait 2,4 fois sa largeur en hauteur ; une étagère basse, 0,11. Les bornes
 * sont donc larges : elles n'arbitrent pas une silhouette, elles attrapent un rapport qui
 * n'a pas de sens. Le vrai filet reste les bornes en millimètres, appliquées après l'échelle.
 */
export const MIN_RATIO = 0.05;
export const MAX_RATIO = 20;

/**
 * Au-delà de quoi une cote n'est plus un meuble.
 *
 * `positiveMillimetres` accepte 2 comme 2 000 000 : le moteur n'a pas d'opinion sur la
 * taille d'un meuble, et il a raison de ne pas en avoir. Mais « une bibliothèque de 1,80 m »
 * mal lue donne une bibliothèque de **1,8 mm**, que le moteur calculerait sans broncher —
 * des pièces de fractions de millimètre, un plan de découpe absurde, et aucune erreur.
 *
 * Les bornes sont larges exprès. Elles n'arbitrent pas le goût ; elles attrapent un facteur
 * mille.
 */
export const MIN_DIMENSION_MM = 100;
export const MAX_DIMENSION_MM = 4_000;

/** Au-delà, ce n'est plus une description de meuble mais un document. */
export const MAX_DESCRIPTION_LENGTH = 2_000;

/** Ce qu'on refuse de composer, avec la raison, par champ. */
export type Problems = Record<string, string[]>;

export type Interpretation =
  | { readonly ok: true; readonly model: ParsedFurnitureInput }
  | { readonly ok: false; readonly problems: Problems };

/** La sortie brute de la tâche : des clés connues, des valeurs dont on ne sait rien. */
export type Extracted = Record<string, unknown>;

/**
 * Lit un entier d'une valeur dont on ne sait rien.
 *
 * Un modèle rend « 1800 », `1800`, `1800.0` ou « 1 800 mm » selon son humeur, et les trois
 * premiers veulent dire la même chose. Le quatrième aussi, mais le lire demanderait
 * d'analyser une unité — ce qu'on refuse de faire ici : une unité devinée est une cote
 * fausse qui a l'air juste.
 */
function integer(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return /^-?\d+$/u.test(trimmed) ? Number(trimmed) : null;
}

function boolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

/**
 * Compose une entrée du moteur, ou dit précisément ce qui manque.
 *
 * Les trois cotes sont exigées : un meuble sans hauteur n'est pas un meuble incomplet,
 * c'est une phrase qui ne parlait pas d'un meuble. Tout le reste a un défaut — un
 * compartiment, pas d'étagère, un fond — parce que `furnitureInput` en a déjà un, et en
 * inventer d'autres ici les ferait diverger.
 */
export function interpret(extracted: Extracted): Interpretation {
  const problems: Problems = {};
  return compose(extracted, measured(extracted, problems), problems);
}

/**
 * D'une image et d'une seule cote à une entrée du moteur.
 *
 * L'échelle vient de l'utilisateur, les proportions du modèle. Un rapport faux donne une
 * cote fausse, mais **du bon ordre de grandeur** — et c'est tout l'écart avec une cote
 * inventée : elle reste corrigeable à l'œil dans le concepteur, là où « 1 800 mm » annoncé
 * pour un meuble de 900 ne se voit pas.
 */
export function interpretFromImage(
  extracted: Extracted,
  reference: { widthMm: number; depthMm?: number | null },
): Interpretation {
  const problems: Problems = {};
  return compose(extracted, scaled(extracted, reference, problems), problems);
}

type Dimensions = { widthMm: number; heightMm: number; depthMm: number } | null;

/** Les trois cotes lues telles quelles, pour une description écrite. */
function measured(extracted: Extracted, problems: Problems): Dimensions {
  const dimension = (field: 'widthMm' | 'heightMm' | 'depthMm'): number | null => {
    const value = integer(extracted[field]);

    if (value === null) {
      problems[field] = ['Cote absente ou illisible.'];
      return null;
    }

    if (value < MIN_DIMENSION_MM || value > MAX_DIMENSION_MM) {
      // Le message cite les bornes : qui le lit vient d'écrire « 1,80 m » et doit
      // comprendre qu'on attend des millimètres.
      problems[field] = [
        `Cote hors de ce qu'un meuble peut mesurer : ${value} mm, attendu entre ${MIN_DIMENSION_MM} et ${MAX_DIMENSION_MM}.`,
      ];
      return null;
    }

    return value;
  };

  const widthMm = dimension('widthMm');
  const heightMm = dimension('heightMm');
  const depthMm = dimension('depthMm');

  return widthMm !== null && heightMm !== null && depthMm !== null
    ? { widthMm, heightMm, depthMm }
    : null;
}

/**
 * Les cotes manquantes, déduites des proportions et de ce que l'utilisateur a donné.
 *
 * **La profondeur se donne, elle ne se devine pas.** Une vue de face n'en montre aucune : un
 * modèle honnête rend `null`, et refuser là-dessus rendrait inutilisable la photo la plus
 * courante. Une vue de trois quarts, elle, permet au modèle de la proposer — on prend donc ce
 * que l'utilisateur donne, sinon ce que le modèle voit, et on refuse si personne ne sait.
 */
function scaled(
  extracted: Extracted,
  reference: { widthMm: number; depthMm?: number | null },
  problems: Problems,
): Dimensions {
  const { widthMm } = reference;
  /**
   * Une proportion lisible, ou `null`.
   *
   * `report` dit si l'absence mérite un reproche. Pour la hauteur, oui : sans elle il n'y a
   * rien à composer et rien d'autre à proposer. Pour la profondeur, non — l'utilisateur sera
   * invité à la donner, et deux reproches pour un seul défaut égarent celui qui les lit.
   */
  const ratio = (
    field: 'heightRatio' | 'depthRatio',
    report: boolean,
  ): number | null => {
    const value = extracted[field];
    const parsed = typeof value === 'number' ? value : Number(String(value ?? ''));

    if (!Number.isFinite(parsed) || parsed <= 0) {
      if (report) problems[field] = ['Proportion absente ou illisible.'];
      return null;
    }

    if (parsed < MIN_RATIO || parsed > MAX_RATIO) {
      if (report) {
        problems[field] = [
          `Proportion hors de ce qu'un meuble peut avoir : ${parsed}, attendu entre ${MIN_RATIO} et ${MAX_RATIO}.`,
        ];
      }
      return null;
    }

    return parsed;
  };

  const heightRatio = ratio('heightRatio', true);

  /*
   * La profondeur donnée gagne sur celle que le modèle propose.
   *
   * Qui mesure son meuble sait mieux que qui le regarde en photo — et quand les deux
   * manquent, on le dit plutôt que de poser une profondeur « habituelle ».
   */
  const givenDepth = reference.depthMm ?? null;
  const depthRatio = givenDepth === null ? ratio('depthRatio', false) : null;

  if (heightRatio === null) return null;
  if (givenDepth === null && depthRatio === null) {
    problems['depthMm'] = [
      'La photo ne montre pas la profondeur : donnez-la, ou prenez le meuble de trois quarts.',
    ];
    return null;
  }

  /*
   * Arrondi au millimètre, parce que le moteur ne connaît que l'entier.
   *
   * Les bornes de vraisemblance sont vérifiées **après** la mise à l'échelle : c'est là que
   * le facteur mille se verrait, pas dans le rapport.
   */
  const dimensions = {
    widthMm,
    heightMm: Math.round(widthMm * heightRatio),
    depthMm: givenDepth ?? Math.round(widthMm * (depthRatio as number)),
  };

  for (const [field, value] of Object.entries(dimensions)) {
    if (value < MIN_DIMENSION_MM || value > MAX_DIMENSION_MM) {
      problems[field] = [
        `Cote hors de ce qu'un meuble peut mesurer : ${value} mm, attendu entre ${MIN_DIMENSION_MM} et ${MAX_DIMENSION_MM}.`,
      ];
    }
  }

  return Object.keys(problems).length > 0 ? null : dimensions;
}

/** La structure, commune aux deux portes d'entrée : seules les cotes en diffèrent. */
function compose(
  extracted: Extracted,
  dimensions: Dimensions,
  problems: Problems,
): Interpretation {
  const count = (field: string, fallback: number, max: number): number => {
    const value = integer(extracted[field]);
    if (value === null) return fallback;

    // Un nombre négatif ou démesuré n'est pas corrigé en silence : il est signalé. Le
    // ramener à une borne fabriquerait un meuble que personne n'a demandé.
    if (value < 0 || value > max) {
      problems[field] = [`Nombre hors limites : ${value}, attendu entre 0 et ${max}.`];
      return fallback;
    }

    return value;
  };

  /*
   * Au moins un compartiment, et ce n'est pas une correction silencieuse : c'est une vérité
   * de structure. Un meuble a toujours un volume intérieur, et une phrase qui n'en nomme
   * aucun en décrit un. Les cotes, elles, ne sont jamais rattrapées — un millimètre inventé
   * est un plan de découpe faux.
   */
  const compartments = Math.max(1, count('compartments', 1, 20));
  const shelves = count('shelvesPerCompartment', 0, 16);
  const drawers = count('drawersPerCompartment', 0, 16);
  const doors = count('doorsPerCompartment', 0, 2);

  if (dimensions === null || Object.keys(problems).length > 0) {
    return { ok: false, problems };
  }

  const material = extracted['material'];
  const hasBack = boolean(extracted['hasBack']);

  const candidate = {
    dimensions,
    // Uniformes, et c'est assumé : « le premier compartiment en tiroirs » n'est pas
    // exprimable dans une liste de champs plats. L'utilisateur ajuste ensuite au
    // compartiment, là où l'interface sait déjà le faire.
    compartments: Array.from({ length: compartments }, () => ({
      shelves,
      drawers,
      doors,
    })),
    // Laissés au schéma quand le modèle n'a rien rendu d'utilisable : ses défauts sont
    // décidés, les nôtres seraient recopiés.
    ...(typeof material === 'string' && material !== '' ? { material } : {}),
    ...(hasBack === null ? {} : { hasBack }),
  };

  const parsed = furnitureInput.safeParse(candidate);

  if (!parsed.success) {
    // On ne reformule pas : le schéma dit mieux que nous ce qu'il refuse, et le refaire
    // ici produirait deux messages pour une seule règle.
    return { ok: false, problems: flatten(parsed.error.issues) };
  }

  return { ok: true, model: parsed.data };
}

function flatten(
  issues: readonly { path: readonly (string | number | symbol)[]; message: string }[],
): Problems {
  const problems: Problems = {};

  for (const issue of issues) {
    const field = issue.path.map(String).join('.') || 'model';
    problems[field] = [...(problems[field] ?? []), issue.message];
  }

  return problems;
}
