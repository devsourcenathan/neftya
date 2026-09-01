// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { build, cutList, nest, type FurnitureInput } from '@neftya/engine';
import { renderWithProviders } from '../test-support/render.js';
import { visibleParts } from '../viewer/Scene.js';
import { Layers } from './Layers.js';

/**
 * Le panneau de calques.
 *
 * Le test qui compte n'est pas « le bouton bascule » : c'est que **masquer ne retire rien
 * de la fabrication**. Une pièce invisible qui disparaîtrait de la liste de découpe
 * produirait un plan amputé d'une pièce que personne n'aurait décidé de retirer.
 */

const DRESSING: FurnitureInput = {
  dimensions: { widthMm: 1000, heightMm: 2000, depthMm: 600 },
  compartments: [{ shelves: 2, drawers: 0, doors: 2 }],
};

const furniture = build(DRESSING);

beforeEach(cleanup);

function renderLayers(hidden: string[] = []) {
  const onToggle = vi.fn();
  const onShowAll = vi.fn();

  renderWithProviders(
    <Layers
      parts={furniture.parts}
      hidden={new Set(hidden)}
      onToggle={onToggle}
      onShowAll={onShowAll}
      selectedPartId={null}
      onSelect={vi.fn()}
    />,
  );

  return { onToggle, onShowAll };
}

describe('calques', () => {
  it('liste chaque pièce du meuble', () => {
    renderLayers();

    for (const part of furniture.parts) {
      expect(screen.getByText(part.id)).toBeTruthy();
    }
  });

  it('bascule la visibilité d’une pièce', () => {
    const door = furniture.parts.find((part) => part.role === 'door');
    const { onToggle } = renderLayers();

    fireEvent.click(screen.getByLabelText(new RegExp(`Masquer ${door?.id}`, 'u')));

    expect(onToggle).toHaveBeenCalledWith(door?.id);
  });

  it('propose de tout réafficher, et seulement quand il y a de quoi', () => {
    const door = furniture.parts.find((part) => part.role === 'door');

    renderLayers();
    expect(screen.queryByText(/Tout afficher/u)).toBeNull();

    cleanup();
    const { onShowAll } = renderLayers([door?.id ?? '']);

    fireEvent.click(screen.getByText(/Tout afficher/u));
    expect(onShowAll).toHaveBeenCalled();
  });

  it('annonce le bon libellé selon l’état', () => {
    const door = furniture.parts.find((part) => part.role === 'door');
    renderLayers([door?.id ?? '']);

    // Masquée, l'action proposée est de l'afficher : un bouton qui dit l'état plutôt que
    // l'action laisse l'utilisateur deviner ce qu'un clic va faire.
    expect(screen.getByLabelText(new RegExp(`Afficher ${door?.id}`, 'u'))).toBeTruthy();
  });
});

describe('masquer est une affaire de vue', () => {
  it('ne retire rien de la liste de découpe', () => {
    const door = furniture.parts.find((part) => part.role === 'door');

    // La liste de découpe ne connaît pas la visibilité : elle est calculée du meuble, et
    // le meuble ne change pas parce qu'on regarde derrière une porte.
    const rows = cutList(furniture);

    expect(rows.some((row) => row.id === door?.id)).toBe(true);
    expect(rows).toHaveLength(furniture.parts.length);
  });

  it('ne retire rien du placement sur panneau', () => {
    const door = furniture.parts.find((part) => part.role === 'door');
    const placed = nest(furniture)
      .panels.flatMap((panel) => panel.placements)
      .map((placement) => placement.partId);

    expect(placed).toContain(door?.id);
  });

  it('retire la pièce de ce qui est dessiné, et elle seule', () => {
    const door = furniture.parts.find((part) => part.role === 'door');
    const drawn = visibleParts(furniture, new Set([door?.id ?? '']));

    expect(drawn).toHaveLength(furniture.parts.length - 1);
    expect(drawn.some((part) => part.id === door?.id)).toBe(false);
  });

  it('dessine tout quand rien n’est masqué', () => {
    expect(visibleParts(furniture)).toHaveLength(furniture.parts.length);
    expect(visibleParts(furniture, new Set())).toHaveLength(furniture.parts.length);
  });

  it('ne modifie pas le modèle', () => {
    // Le panneau ne reçoit aucun moyen de toucher au modèle : il ne prend que des pièces
    // déjà calculées et deux fonctions de rappel.
    const before = JSON.stringify(furniture.input);
    renderLayers([furniture.parts[0]?.id ?? '']);

    expect(JSON.stringify(furniture.input)).toBe(before);
  });
});
