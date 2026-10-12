// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { build, type ParsedFurnitureInput } from '@neftya/engine';
import '../i18n.js';
import { PreferencesProvider } from '../preferences/PreferencesContext.js';
import { Controls } from './Controls.js';
import { defaultModel } from './model.js';

/**
 * La saisie de cotes : ce qui entre dans le modèle, et surtout ce qui n'y entre pas.
 */

function renderControls(
  units: 'metric' | 'imperial',
  model: ParsedFurnitureInput = defaultModel(),
) {
  const dispatch = vi.fn();

  /*
   * Les nombres du moteur, et non des valeurs écrites pour le test.
   *
   * Ce sont eux que le panneau affiche en filigrane sous un champ souple. Les inventer
   * ici vérifierait que le composant sait afficher un nombre, pas qu'il affiche **le**
   * nombre — et c'est ce second point qui décide si un menuisier corrige à partir du bon.
   */
  const furniture = build(model);

  render(
    <Wrapper units={units}>
      <Controls
        model={model}
        dispatch={dispatch}
        resolved={{
          compartmentWidths: furniture.compartmentWidths,
          shelfSpaces: furniture.compartmentShelfSpaces,
        }}
      />
    </Wrapper>,
  );

  return dispatch;
}

function Wrapper({
  children,
  units,
}: {
  children: ReactNode;
  units: 'metric' | 'imperial';
}) {
  return (
    <PreferencesProvider language="fr" initialUnitSystem={units}>
      {children}
    </PreferencesProvider>
  );
}

beforeEach(() => {
  cleanup();
});

describe('saisie des cotes', () => {
  it('affiche la largeur en fractions quand l’impérial est choisi', () => {
    renderControls('imperial');

    // 1800 mm = 70,866" → 70 7/8" sur un mètre de menuisier.
    expect(screen.getByRole('textbox', { name: 'Largeur' })).toHaveProperty(
      'value',
      '70 7/8"',
    );
  });

  it('accepte une fraction saisie et la rend en millimètres entiers', () => {
    const dispatch = renderControls('imperial');
    const field = screen.getByRole('textbox', { name: 'Largeur' });

    fireEvent.change(field, { target: { value: '86 5/8' } });
    fireEvent.blur(field);

    expect(dispatch).toHaveBeenCalledWith({
      type: 'dimension',
      axis: 'widthMm',
      valueMm: 2200,
    });
  });

  it('respecte une unité écrite explicitement', () => {
    const dispatch = renderControls('imperial');
    const field = screen.getByRole('textbox', { name: 'Largeur' });

    fireEvent.change(field, { target: { value: '2200mm' } });
    fireEvent.blur(field);

    expect(dispatch).toHaveBeenCalledWith({
      type: 'dimension',
      axis: 'widthMm',
      valueMm: 2200,
    });
  });

  it('refuse une saisie incomprise au lieu de deviner une cote', () => {
    const dispatch = renderControls('metric');
    const field = screen.getByRole('textbox', { name: 'Largeur' });

    fireEvent.change(field, { target: { value: 'deux mètres' } });
    fireEvent.blur(field);

    // Rien n'entre dans le modèle, et l'utilisateur le voit.
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByText(/Cote non comprise/)).toBeTruthy();
    // Le champ est revenu à la valeur du modèle. L'espace des milliers est celui
    // qu'Intl choisit pour la locale — une espace fine insécable en français, pas une
    // espace ordinaire écrite en dur.
    expect((field as HTMLInputElement).value).toMatch(/^1\s800 mm$/u);
  });
});

describe('la largeur d’un compartiment', () => {
  it('montre en filigrane ce que le partage donne', () => {
    /*
     * **Sans ce nombre, le champ ne sert à rien.** Laissé souple, il serait vide : le
     * menuisier saurait qu'il n'a rien imposé, pas ce qu'il obtient. Il saisirait une
     * correction sans savoir à partir de quoi.
     *
     * 1800 mm de caisson, 18 mm de côté, deux séparateurs de 18 : trois compartiments de
     * 576 mm.
     */
    renderControls('metric');

    const field = screen.getAllByRole('textbox', { name: 'Largeur imposée' })[0];

    expect((field as HTMLInputElement).value).toBe('');
    expect((field as HTMLInputElement).placeholder).toMatch(/576/u);
  });

  it('n’impose que le compartiment visé', () => {
    /*
     * La raison d'être du champ : tirer un séparateur impose les **deux** largeurs qu'il
     * sépare, alors qu'un socle de tiroirs de 400 mm doit laisser la penderie d'à côté
     * prendre ce qui reste.
     */
    const dispatch = renderControls('metric');
    const field = screen.getAllByRole('textbox', { name: 'Largeur imposée' })[1];

    fireEvent.change(field as Element, { target: { value: '400' } });
    fireEvent.blur(field as Element);

    expect(dispatch).toHaveBeenCalledWith({
      type: 'compartmentWidth',
      index: 1,
      widthMm: 400,
    });
  });

  it('rend la main quand on vide le champ', () => {
    // Le chemin qu'on trouve sans y penser : effacer. Le bouton « Libre » est l'autre, et
    // les deux doivent mener au même endroit.
    const dispatch = renderControls('metric');
    const field = screen.getAllByRole('textbox', { name: 'Largeur imposée' })[0];

    fireEvent.change(field as Element, { target: { value: '' } });
    fireEvent.blur(field as Element);

    expect(dispatch).toHaveBeenCalledWith({
      type: 'compartmentWidth',
      index: 0,
      widthMm: undefined,
    });
  });
});

describe('les hauteurs entre étagères', () => {
  const withShelfSpace = () => {
    const model = defaultModel();

    return {
      ...model,
      compartments: model.compartments.map((compartment, index) =>
        index === 0 ? { ...compartment, shelfSpacesMm: [400] } : compartment,
      ),
    };
  };

  it('ouvre un champ par espace, et non par étagère', () => {
    /*
     * `n` étagères découpent un compartiment en `n + 1` espaces. Compter les étagères
     * laisserait le dernier espace — celui du haut — sans aucun champ, et c'est souvent
     * celui qu'on veut régler.
     */
    renderControls('metric');

    fireEvent.click(screen.getAllByRole('button', { name: /Hauteurs/u })[0] as Element);

    // Le premier compartiment du modèle de départ porte trois étagères.
    expect(screen.getAllByRole('textbox', { name: /^Espace / })).toHaveLength(4);
  });

  it('pose la cote au rang visé, du bas vers le haut', () => {
    const dispatch = renderControls('metric');

    fireEvent.click(screen.getAllByRole('button', { name: /Hauteurs/u })[0] as Element);

    const third = screen.getByRole('textbox', { name: 'Espace 3' });
    fireEvent.change(third, { target: { value: '400' } });
    fireEvent.blur(third);

    // Le troisième espace porte le rang 2 : l'écran compte à partir de un, le modèle de
    // zéro, et confondre les deux applique la cote un étage trop bas.
    expect(dispatch).toHaveBeenCalledWith({
      type: 'shelfSpace',
      index: 0,
      space: 2,
      heightMm: 400,
    });
  });

  it('annonce les cotes posées sans qu’on ait à déplier', () => {
    /*
     * Sans ce compte, une hauteur imposée se cache derrière un bouton fermé : on cherche
     * ensuite pourquoi une étagère ne se place pas là où la division égale la mettrait.
     */
    renderControls('metric', withShelfSpace());

    const first = screen.getAllByRole('button', {
      name: /Hauteurs/u,
    })[0] as HTMLElement;

    expect(within(first).getByText(/1/u)).toBeTruthy();
  });
});
