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

/**
 * L'ordre des gardes **est** le message d'erreur.
 *
 * Le refus « l'envoi n'est pas configuré » venait en premier : une faute de frappe dans
 * l'adresse recevait cette réponse-là, et le projet d'un autre atelier aussi. C'est vrai,
 * et cela envoie chercher une configuration là où il y a une faute de frappe.
 */
describe('ce qui est signalé en premier, sans mailer', () => {
  let bare: Harness;
  let projectId: string;

  beforeAll(async () => {
    bare = await createHarness('test_envoi_ordre');
    const created = await bare.app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: await bare.authorization(),
      payload: { name: 'Bibliothèque', model: MODEL },
    });
    projectId = created.json().data.id as string;
  });

  afterAll(async () => {
    await bare.close();
  });

  it('une adresse malformée est une faute de l’appelant, pas une panne', async () => {
    const response = await bare.app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/quotation/email`,
      headers: await bare.authorization(),
      payload: { to: 'pas-une-adresse' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('un projet qu’on ne possède pas reste introuvable', async () => {
    const response = await bare.app.inject({
      method: 'POST',
      url: '/v1/projects/01924f00-0000-7000-8000-00000000dead/quotation/email',
      headers: await bare.authorization(),
      payload: { to: 'cliente@example.test' },
    });

    // Et toujours `404`, jamais `403` : un refus qui distingue confirmerait l'existence.
    expect(response.statusCode).toBe(404);
  });

  it('le 503 ne vient qu’en dernier', async () => {
    const response = await bare.app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/quotation/email`,
      headers: await bare.authorization(),
      payload: { to: 'cliente@example.test' },
    });

    expect(response.statusCode).toBe(503);
  });
});
