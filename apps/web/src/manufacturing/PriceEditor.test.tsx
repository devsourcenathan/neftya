// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-support/render.js';
import { PriceEditor } from './PriceEditor.js';
import type { QuotationLine } from '../api/projects.js';

/**
 * La saisie des prix, et le piège des unités mineures.
 *
 * Le stockage est en unités mineures — 1250 pour 12,50 €. La première version affichait
 * 1250 dans un champ que la lecture réinterprète en euros : chaque aller-retour
 * multipliait le prix par cent.
 */

const LINES: QuotationLine[] = [
  {
    reference: 'panel:mdf:18',
    unit: 'panel',
    quantity: 1,
    unitPrice: null,
    total: null,
  },
  {
    reference: 'edge_banding',
    unit: 'metre',
    quantity: 7.04,
    unitPrice: { amount: 199, currency: 'EUR' },
    total: { amount: 1401, currency: 'EUR' },
  },
];

beforeEach(cleanup);

function field(reference: string): HTMLInputElement {
  return screen.getByLabelText(new RegExp(reference, 'u')) as HTMLInputElement;
}

describe('saisie des prix', () => {
  it('affiche un prix enregistré en unités majeures', () => {
    renderWithProviders(<PriceEditor lines={LINES} currency="EUR" projectId="p1" />);

    // 199 centimes se lisent 1,99 € — pas 199.
    expect(field('edge_banding').value).toBe('1.99');
  });

  it('enregistre en unités mineures', async () => {
    const { calls } = renderWithProviders(
      <PriceEditor lines={LINES} currency="EUR" projectId="p1" />,
    );

    fireEvent.change(field('panel:mdf:18'), { target: { value: '12,50' } });
    fireEvent.blur(field('panel:mdf:18'));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.options).toMatchObject({
      body: { reference: 'panel:mdf:18', amountMinor: 1250, currency: 'EUR' },
    });
  });

  it('n’ajoute pas de décimale au franc CFA', async () => {
    const { calls } = renderWithProviders(
      <PriceEditor
        lines={[{ ...LINES[0]!, unitPrice: { amount: 15_000, currency: 'XAF' } }]}
        currency="XAF"
        projectId="p1"
      />,
    );

    expect(field('panel:mdf:18').value).toBe('15000');

    fireEvent.change(field('panel:mdf:18'), { target: { value: '18000' } });
    fireEvent.blur(field('panel:mdf:18'));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.options).toMatchObject({ body: { amountMinor: 18_000 } });
  });

  it('refuse un prix incompris au lieu de l’enregistrer à zéro', async () => {
    const { calls } = renderWithProviders(
      <PriceEditor lines={LINES} currency="EUR" projectId="p1" />,
    );

    fireEvent.change(field('panel:mdf:18'), { target: { value: 'gratuit' } });
    fireEvent.blur(field('panel:mdf:18'));

    expect(await screen.findByText(/Prix non compris/u)).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('un champ vidé n’efface pas le prix enregistré', async () => {
    // Effacer par mégarde un prix saisi serait une mauvaise surprise, et l'API n'a pas de
    // route pour le remettre.
    const { calls } = renderWithProviders(
      <PriceEditor lines={LINES} currency="EUR" projectId="p1" />,
    );

    fireEvent.change(field('edge_banding'), { target: { value: '   ' } });
    fireEvent.blur(field('edge_banding'));

    expect(calls).toHaveLength(0);
  });

  it('montre la référence, qui est ce qui fait foi', () => {
    renderWithProviders(<PriceEditor lines={LINES} currency="EUR" projectId="p1" />);

    // Le libellé est traduit, la référence ne l'est pas : un prix accroché à un libellé
    // se perdrait au changement de langue.
    expect(screen.getByText('panel:mdf:18')).toBeTruthy();
    expect(screen.getByText(/Panneau MDF 18/u)).toBeTruthy();
  });
});
