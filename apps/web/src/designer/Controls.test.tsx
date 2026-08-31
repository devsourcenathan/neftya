// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import '../i18n.js';
import { PreferencesProvider } from '../preferences/PreferencesContext.js';
import { Controls } from './Controls.js';
import { defaultModel } from './model.js';

/**
 * La saisie de cotes : ce qui entre dans le modèle, et surtout ce qui n'y entre pas.
 */

function renderControls(units: 'metric' | 'imperial') {
  const dispatch = vi.fn();

  render(
    <Wrapper units={units}>
      <Controls model={defaultModel()} dispatch={dispatch} />
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
