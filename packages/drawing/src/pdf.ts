/**
 * Un écrivain PDF minimal.
 *
 * Pourquoi pas une bibliothèque : un plan de découpe n'a besoin que de rectangles, de
 * traits et de texte. Les bibliothèques du domaine embarquent la police, le SVG, les
 * images et le chiffrement — pour un export qui tient en deux cents lignes et qui doit
 * rester **déterministe** : deux exports du même projet doivent donner le même fichier,
 * octet pour octet, sinon l'instantané figé de Storage n'a plus de sens.
 *
 * Les polices utilisées sont les quatorze polices standard, présentes dans tout lecteur :
 * rien n'est embarqué, donc rien ne pèse.
 *
 * **Limite assumée** : le texte est encodé en WinAnsi (Latin-1). Les accents français
 * passent ; un alphabet non latin ne passerait pas, et il faudrait alors embarquer une
 * police. Ce n'est pas nécessaire pour le français et l'anglais, seules langues de la V1.
 *
 * @see docs/MANUFACTURING.md §6
 */

export type Shape =
  | {
      kind: 'rect';
      xPt: number;
      yPt: number;
      widthPt: number;
      heightPt: number;
      /** Gris de remplissage, de 0 (noir) à 1 (blanc). Absent : pas de remplissage. */
      fill?: number;
      stroke?: number;
      lineWidthPt?: number;
    }
  | {
      kind: 'line';
      x1Pt: number;
      y1Pt: number;
      x2Pt: number;
      y2Pt: number;
      stroke?: number;
    }
  | {
      kind: 'text';
      xPt: number;
      yPt: number;
      sizePt: number;
      text: string;
      bold?: boolean;
      grey?: number;
    };

export interface Page {
  widthPt: number;
  heightPt: number;
  shapes: Shape[];
}

export interface PdfDocument {
  title: string;
  pages: Page[];
}

export function renderPdf(document: PdfDocument): Uint8Array {
  const objects: string[] = [];
  const add = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  // Les numéros d'objets sont réservés avant l'écriture : un /Kids doit citer les pages
  // qui ne sont pas encore construites.
  const catalogId = 1;
  const pagesId = 2;
  const regularId = 3;
  const boldId = 4;
  const firstPageId = 5;

  const pageIds = document.pages.map((_, index) => firstPageId + index * 2);

  objects.push(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  objects.push(
    `<< /Type /Pages /Count ${document.pages.length} /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(' ')}] >>`,
  );
  objects.push(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  objects.push(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );

  for (const [index, page] of document.pages.entries()) {
    const contentId = pageIds[index]! + 1;
    const stream = contentOf(page);

    objects.push(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${round(page.widthPt)} ${round(
        page.heightPt,
      )}] /Resources << /Font << /F1 ${regularId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.push(`<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }

  const info = add(`<< /Title (${escapeText(document.title)}) /Producer (Neftya) >>`);

  return assemble(objects, catalogId, info);
}

function contentOf(page: Page): string {
  const lines: string[] = [];

  for (const shape of page.shapes) {
    if (shape.kind === 'rect') {
      if (shape.fill !== undefined) lines.push(`${round(shape.fill)} g`);
      lines.push(`${round(shape.stroke ?? 0)} G`);
      lines.push(`${round(shape.lineWidthPt ?? 0.5)} w`);
      lines.push(
        `${round(shape.xPt)} ${round(shape.yPt)} ${round(shape.widthPt)} ${round(
          shape.heightPt,
        )} re`,
      );
      // `B` remplit puis trace ; `S` trace seulement.
      lines.push(shape.fill === undefined ? 'S' : 'B');
      continue;
    }

    if (shape.kind === 'line') {
      lines.push(`${round(shape.stroke ?? 0)} G`);
      lines.push(`${round(shape.x1Pt)} ${round(shape.y1Pt)} m`);
      lines.push(`${round(shape.x2Pt)} ${round(shape.y2Pt)} l`);
      lines.push('S');
      continue;
    }

    lines.push('BT');
    lines.push(`/${shape.bold ? 'F2' : 'F1'} ${round(shape.sizePt)} Tf`);
    lines.push(`${round(shape.grey ?? 0)} g`);
    lines.push(`${round(shape.xPt)} ${round(shape.yPt)} Td`);
    lines.push(`(${escapeText(shape.text)}) Tj`);
    lines.push('ET');
  }

  return lines.join('\n');
}

/**
 * Les parenthèses et la barre oblique inverse délimitent les chaînes PDF : les laisser
 * passer produit un fichier qu'aucun lecteur n'ouvre. Les caractères hors Latin-1
 * deviennent `?` plutôt que de casser l'encodage.
 */
function escapeText(text: string): string {
  return [...text]
    .map((character) => {
      const code = character.codePointAt(0) ?? 63;
      if (character === '(' || character === ')' || character === '\\')
        return `\\${character}`;
      if (code < 32) return ' ';
      return code > 255 ? '?' : character;
    })
    .join('');
}

/**
 * Latin-1 : un caractère, un octet.
 *
 * Écrit à la main plutôt qu'avec `Buffer`, qui n'existe que sous Node : ce paquet doit
 * pouvoir tourner dans le navigateur aussi, et `TextEncoder` n'encode qu'en UTF-8 — où
 * « é » fait deux octets, ce qui fausserait `/Length`.
 */
function toLatin1(text: string): number[] {
  return [...text].map((character) => (character.codePointAt(0) ?? 63) & 0xff);
}

/** Les octets, pas les caractères : `/Length` compte des octets, et « é » en fait un. */
function byteLength(stream: string): number {
  return toLatin1(stream).length;
}

function assemble(objects: string[], catalogId: number, infoId: number): Uint8Array {
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  for (const [index, body] of objects.entries()) {
    offsets.push(byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }

  const xrefOffset = byteLength(pdf);

  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Uint8Array.from(toLatin1(pdf));
}

/** Deux décimales suffisent au point PostScript, et rendent le fichier reproductible. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
