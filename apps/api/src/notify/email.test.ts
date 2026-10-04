import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHarness, type Harness } from '../test-support/harness.js';
import type { Mailer, OutgoingEmail } from './mailer.js';
import { MailerUnavailable } from './mailer.js';

/**
 * L'envoi du devis : qui peut, ce qui part, ce qui s'enregistre.
 *
 * Le devis porte les prix : seuls ceux qui les voient (`costs.read`)
 * l'envoient. Chaque tentative laisse une ligne d'outbox — y compris
 * l'échec, qui se renvoie au lieu de se perdre.
 */

/** Un mailer en mémoire : ni réseau, ni SMTP, et tout est relisible. */
class MemoryMailer implements Mailer {
  readonly sent: OutgoingEmail[] = [];
  failNext: string | null = null;

  async send(email: OutgoingEmail): Promise<void> {
    if (this.failNext) {
      const reason = this.failNext;
      this.failNext = null;
      throw new MailerUnavailable(reason);
    }
    this.sent.push(email);
  }
}

let harness: Harness;
let mailer: MemoryMailer;

const MODEL = {
  dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
  compartments: [
    { shelves: 1, drawers: 0 },
    { shelves: 1, drawers: 0 },
  ],
  material: 'mdf',
  hasBack: true,
};

beforeAll(async () => {
  mailer = new MemoryMailer();
  harness = await createHarness('test_envoi_devis', { mailer });
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.truncate();
  mailer.sent.length = 0;
  mailer.failNext = null;
});

async function createProject(): Promise<string> {
  const response = await harness.app.inject({
    method: 'POST',
    url: '/v1/projects',
    headers: await harness.authorization(),
    payload: { name: 'Bibliothèque', model: MODEL },
  });
  expect(response.statusCode).toBe(201);
  return response.json().data.id as string;
}

describe('envoyer un devis', () => {
  it('envoie le devis avec le plan joint, et l’enregistre', async () => {
    const id = await createProject();

    const response = await harness.app.inject({
      method: 'POST',
      url: `/v1/projects/${id}/quotation/email`,
      headers: await harness.authorization(),
      payload: { to: 'cliente@example.test', message: 'Voici votre devis.' },
    });

    expect(response.statusCode).toBe(201);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe('cliente@example.test');
    expect(mailer.sent[0]?.subject).toContain('Bibliothèque');
    expect(mailer.sent[0]?.text).toContain('Voici votre devis.');
    expect(mailer.sent[0]?.attachments).toHaveLength(1);
    expect(mailer.sent[0]?.attachments?.[0]?.contentType).toBe('application/pdf');

    const rows = await harness.db
      .selectFrom('notifications_outbox')
      .select(['to_email', 'status', 'sent_at'])
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ to_email: 'cliente@example.test', status: 'sent' });
    expect(rows[0]?.sent_at).not.toBeNull();
  });

  it('refuse au membre : qui ne voit pas les coûts ne les envoie pas', async () => {
    const id = await createProject();

    const response = await harness.app.inject({
      method: 'POST',
      url: `/v1/projects/${id}/quotation/email`,
      headers: await harness.authorization({ roles: ['member'] }),
      payload: { to: 'cliente@example.test' },
    });

    expect(response.statusCode).toBe(403);
    expect(mailer.sent).toHaveLength(0);
  });

  it('refuse un destinataire invalide', async () => {
    const id = await createProject();

    const response = await harness.app.inject({
      method: 'POST',
      url: `/v1/projects/${id}/quotation/email`,
      headers: await harness.authorization(),
      payload: { to: 'pas-un-email' },
    });

    expect(response.statusCode).toBe(422);
    expect(mailer.sent).toHaveLength(0);
  });

  it('enregistre l’échec et rend 503 quand l’envoi casse', async () => {
    const id = await createProject();
    mailer.failNext = 'connexion refusée';

    const response = await harness.app.inject({
      method: 'POST',
      url: `/v1/projects/${id}/quotation/email`,
      headers: await harness.authorization(),
      payload: { to: 'cliente@example.test' },
    });

    expect(response.statusCode).toBe(503);
    const rows = await harness.db
      .selectFrom('notifications_outbox')
      .select(['status', 'error'])
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('failed');
    expect(rows[0]?.error).toContain('connexion refusée');
  });

  it('rend 503 sans mailer configuré, comme l’assistant sans modèle', async () => {
    const bare = await createHarness('test_envoi_sans_mailer');
    try {
      const created = await bare.app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: await bare.authorization(),
        payload: { name: 'Bibliothèque', model: MODEL },
      });
      expect(created.statusCode).toBe(201);

      const response = await bare.app.inject({
        method: 'POST',
        url: `/v1/projects/${created.json().data.id}/quotation/email`,
        headers: await bare.authorization(),
        payload: { to: 'cliente@example.test' },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe('SERVICE_UNAVAILABLE');
    } finally {
      await bare.close();
    }
  });
});
