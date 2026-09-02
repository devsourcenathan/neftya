/**
 * Un écrivain DXF minimal, au format R12 ASCII.
 *
 * Pourquoi R12 et pas plus récent : c'est la version que **tout** lit — une commande
 * numérique de 1998, une perceuse à commande, AutoCAD, LibreCAD, un logiciel de nesting
 * d'atelier. Les versions suivantes apportent des entités dont un plan de perçage n'a
 * aucun besoin : il ne contient que des traits, des cercles et du texte.
 *
 * Pourquoi pas une bibliothèque : les mêmes raisons que l'écrivain PDF. Il faut que deux
 * exports du même projet donnent **le même fichier, octet pour octet** — sinon
 * l'instantané figé n'a plus de sens. Aucune date, aucune poignée générée, aucun
 * identifiant tiré au hasard n'entre ici.
 *
 * **Limite assumée** : le texte est en ASCII. R12 ne dit pas quel encodage il utilise, et
 * un accent y devient ce que le lecteur veut bien en faire. Les libellés partent à
 * l'atelier tels quels ; un plan lisible partout vaut mieux qu'un plan joli ici.
 *
 * @see docs/MANUFACTURING.md §7
 */

export interface DxfLayer {
  name: string;
  /** Couleur ACI, l'index de couleur historique. 1 rouge, 3 vert, 5 bleu, 7 noir. */
  colour: number;
}

export type DxfEntity =
  | { kind: 'line'; layer: string; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'circle'; layer: string; xMm: number; yMm: number; radiusMm: number }
  | { kind: 'text'; layer: string; xMm: number; yMm: number; heightMm: number; value: string };

export interface DxfDocument {
  layers: DxfLayer[];
  entities: DxfEntity[];
}

/**
 * Les millimètres, déclarés dans l'en-tête.
 *
 * Sans `$INSUNITS`, un lecteur suppose ce qu'il veut — souvent le pouce. Un plan de
 * perçage lu en pouces place le premier trou à 940 mm du bord, et rien ne le signale.
 */
const MILLIMETRES = 4;

export function renderDxf(document: DxfDocument): string {
  const out: string[] = [];
  const pair = (code: number, value: string | number) => out.push(String(code), String(value));

  pair(0, 'SECTION');
  pair(2, 'HEADER');
  pair(9, '$INSUNITS');
  pair(70, MILLIMETRES);
  pair(0, 'ENDSEC');

  pair(0, 'SECTION');
  pair(2, 'TABLES');
  pair(0, 'TABLE');
  pair(2, 'LAYER');
  pair(70, document.layers.length);
  for (const layer of document.layers) {
    pair(0, 'LAYER');
    pair(2, layer.name);
    // 70/0 : le calque est visible et modifiable. Un calque gelé n'apparaîtrait pas à
    // l'impression, et c'est le perçage qu'on perdrait.
    pair(70, 0);
    pair(62, layer.colour);
    pair(6, 'CONTINUOUS');
  }
  pair(0, 'ENDTAB');
  pair(0, 'ENDSEC');

  pair(0, 'SECTION');
  pair(2, 'ENTITIES');
  for (const entity of document.entities) {
    switch (entity.kind) {
      case 'line':
        pair(0, 'LINE');
        pair(8, entity.layer);
        pair(10, number(entity.x1));
        pair(20, number(entity.y1));
        pair(11, number(entity.x2));
        pair(21, number(entity.y2));
        break;
      case 'circle':
        pair(0, 'CIRCLE');
        pair(8, entity.layer);
        pair(10, number(entity.xMm));
        pair(20, number(entity.yMm));
        pair(40, number(entity.radiusMm));
        break;
      case 'text':
        pair(0, 'TEXT');
        pair(8, entity.layer);
        pair(10, number(entity.xMm));
        pair(20, number(entity.yMm));
        pair(40, number(entity.heightMm));
        pair(1, ascii(entity.value));
        break;
    }
  }
  pair(0, 'ENDSEC');
  pair(0, 'EOF');

  // Fins de ligne DOS : c'est ce qu'attendent les lecteurs les plus anciens, et les autres
  // s'en accommodent.
  return `${out.join('\r\n')}\r\n`;
}

/**
 * Trois décimales, toujours, et jamais de notation exponentielle.
 *
 * `1e-7` est un nombre valide en JavaScript et une erreur de syntaxe dans un DXF. Le
 * millième de millimètre est très en deçà de ce qu'une scie sait faire ; il est là pour
 * que deux exports identiques le soient octet pour octet.
 */
function number(value: number): string {
  return value.toFixed(3);
}

/** Sans accent, et sans les caractères qui coupent une ligne de DXF en deux. */
export function ascii(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .replace(/[^\x20-\x7e]/gu, ' ')
    .trim();
}

/** Le rectangle d'un contour, en quatre traits. Un DXF R12 n'a pas de polyligne légère. */
export function rectangle(
  layer: string,
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
): DxfEntity[] {
  const corners: [number, number][] = [
    [xMm, yMm],
    [xMm + widthMm, yMm],
    [xMm + widthMm, yMm + heightMm],
    [xMm, yMm + heightMm],
  ];

  return corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length] as [number, number];

    return {
      kind: 'line' as const,
      layer,
      x1: corner[0],
      y1: corner[1],
      x2: next[0],
      y2: next[1],
    };
  });
}
