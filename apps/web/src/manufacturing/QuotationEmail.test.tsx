// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-support/render.js';
import { QuotationEmail } from './QuotationEmail.js';
import { ApiRequestError } from '../api/client.js';

/**
 * L'envoi du devis : ce qui part vers le serveur.
 *
 * Le serveur décide (permission, validité, envoi) ; l'interface envoie
 * l'adresse et le message, puis montre ce que l'API a répondu — sans le
 * réécrire, sauf quand elle n'a rien répondu du tout.
 */

beforeEach(cleanup);

function fill(to: string, message: string): void {
  fireEvent.change(screen.getByLabelText(/client/i), { target: { value: to } });
  fireEvent.change(screen.getByLabelText(/message/i), { target: { value: message } });
}

describe('envoi du devis', () => {
  it('envoie l’adresse et le message au projet courant', async () => {
    const { calls } = renderWithProviders(<QuotationEmail projectId="projet-1" />);

    fill('cliente@example.test', 'Voici votre devis.');
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.path).toBe('/v1/projects/projet-1/quotation/email');
    expect(calls[0]?.options).toMatchObject({
      method: 'POST',
      body: { to: 'cliente@example.test', message: 'Voici votre devis.' },
    });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('cliente@example.test'),
    );
  });

  it('omet le message vide plutôt que d’envoyer du vide', async () => {
    const { calls } = renderWithProviders(<QuotationEmail projectId="projet-1" />);

    fill('cliente@example.test', '   ');
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.options).toMatchObject({ body: { to: 'cliente@example.test' } });
  });

  it('montre le refus de l’API sans le réécrire', async () => {
    renderWithProviders(<QuotationEmail projectId="projet-1" />, {
      api: (async () => {
        throw new ApiRequestError(
          403,
          {
            code: 'FORBIDDEN',
            message: 'Votre rôle ne permet pas cette action.',
          },
          null,
        );
      }) as never,
    });

    fill('cliente@example.test', '');
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Votre rôle ne permet pas cette action.',
      ),
    );
  });
});
