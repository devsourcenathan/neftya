import { v7 as uuidv7 } from 'uuid';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../db/schema.js';
import { AiUnavailable, type ExtractRequest, type Generation } from '../sekuu/ai.js';
import { AI_QUOTA_KEY, LocalQuotas } from '../sekuu/quota.js';

/**
 * L'IA locale : la tâche `extract`, exécutée ici.
 *
 * Même interface que `SekuuAI` — `extract` puis `read` — pour que les routes
 * de l'assistant ne sachent pas qui répond. Trois différences assumées,
 * écrites dans `docs/AI_LOCAL.md` :
 *
 * - on nomme un **modèle**, pas une tâche : il n'y a plus de plateforme pour
 *   tenir le registre et le plafond de dépense ;
 * - l'extraction est **synchrone** : quelques secondes, pas quelques minutes,
 *   et le contrat à deux temps reste valable (la première lecture répond
 *   `succeeded`) ;
 * - le quota est **compté en lignes**, pas publié en claims : même clé
 *   d'idempotence = même ligne, donc un double-clic ne paie pas deux fois.
 */

export interface LocalAiOptions {
  db: Kysely<Database>;
  /** Compatible OpenAI (`/chat/completions`) : OpenAI, ou tout relais local. */
  baseUrl: string;
  apiKey: string;
  model: string;
  /**
   * Profondeur de raisonnement (`minimal`…`xhigh`).
   *
   * Les modèles à raisonnement brûlent des jetons avant de répondre : sans
   * borne, une extraction triviale consomme 700 jetons de réflexion et, pire,
   * peut ne plus avoir de budget pour la réponse (`finish_reason: length`,
   * contenu nul). `minimal` divise par quatre. Absent : champ omis — les
   * relais qui rejetteraient un paramètre inconnu restent utilisables.
   */
  reasoningEffort?: string;
  /** Injectable : les tests n'appellent pas de modèle. */
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

const SYSTEM_PROMPT = [
  'Tu extrais les faits mesurables d\u2019une description de meuble en un objet JSON.',
  'R\u00e8gles : cotes en millim\u00e8tres entiers (un meuble mesure 100 \u00e0 4000 mm ;',
  '\u00ab 1,80 m \u00bb vaut 1800, jamais 1,8), nombres de compartiments, \u00e9tag\u00e8res,',
  'tiroirs et portes en entiers, mati\u00e8re en un mot (mdf, contreplaqu\u00e9, ch\u00eane),',
  'hasBack en bool\u00e9en. Champs inconnus : null, jamais invent\u00e9s. Rien que le JSON.',
].join(' ');

export class LocalAI {
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: LocalAiOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  /** Soumet une extraction — et l'exécute. @throws {AiUnavailable} */
  async extract(request: ExtractRequest): Promise<Generation> {
    const existing = await this.options.db
      .selectFrom('ai_generations')
      .select(['id', 'status', 'output'])
      .where('organization_id', '=', request.organizationId)
      .where('idempotency_key', '=', request.idempotencyKey)
      .executeTakeFirst();
    if (existing) {
      return {
        id: existing.id,
        status: existing.status,
        output: asRecord(existing.output),
      };
    }

    await this.enforceQuota(request.organizationId);

    const { output, raw } = await this.complete(request.input, request.fields);
    const id = uuidv7();
    const status = output ? 'succeeded' : 'failed';

    await this.options.db
      .insertInto('ai_generations')
      .values({
        id,
        organization_id: request.organizationId,
        idempotency_key: request.idempotencyKey,
        status,
        input: request.input,
        output,
        raw_output: raw,
      })
      .onConflict((conflict) => conflict.doNothing())
      .execute();

    // Course perdue sur la clé : relire la ligne du gagnant plutôt que rendre
    // un doublon. Deux soumissions du même texte restent une seule facture.
    const stored = await this.options.db
      .selectFrom('ai_generations')
      .select(['id', 'status', 'output'])
      .where('organization_id', '=', request.organizationId)
      .where('idempotency_key', '=', request.idempotencyKey)
      .executeTakeFirstOrThrow();

    return { id: stored.id, status: stored.status, output: asRecord(stored.output) };
  }

  /** Où en est une génération. Toujours terminée : l'exécution est synchrone. */
  async read(organizationId: string, generationId: string): Promise<Generation> {
    const row = await this.options.db
      .selectFrom('ai_generations')
      .select(['id', 'status', 'output'])
      .where('id', '=', generationId)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();

    if (!row) throw new AiUnavailable('not_found', 'génération introuvable');
    return { id: row.id, status: row.status, output: asRecord(row.output) };
  }

  /**
   * Le plafond se lit **par le même résolveur que celui des projets**.
   *
   * Il y avait ici une lecture de `organization_quotas` écrite à la main, et une autre
   * dans les routes de projets qui lisait les revendications du jeton. Deux chemins pour
   * la même famille de règle, dont l'un mordait tout de suite et l'autre au bout de
   * quinze minutes.
   */
  private async enforceQuota(organizationId: string): Promise<void> {
    const max = await new LocalQuotas(this.options.db).limit(
      organizationId,
      AI_QUOTA_KEY,
    );
    // Non couvert comme explicitement illimité : on ne plafonne pas.
    if (max === undefined || max === null) return;

    const { count } = await this.options.db
      .selectFrom('ai_generations')
      .select(sql<number>`count(*)::int`.as('count'))
      .where('organization_id', '=', organizationId)
      .where('created_at', '>=', sql<Date>`date_trunc('month', now())`)
      .executeTakeFirstOrThrow();

    if (count >= max) {
      throw new AiUnavailable(
        'quota',
        'Le quota d\u2019IA de votre organisation est épuisé.',
      );
    }
  }

  private async complete(
    input: string,
    fields: readonly string[],
  ): Promise<{ output: Record<string, unknown> | null; raw: string | null }> {
    let response: Response;
    try {
      response = await this.fetch(`${this.options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          model: this.options.model,
          temperature: 0,
          // Réflexion comprise : un modèle à raisonnement dépense des centaines
          // de jetons avant d'écrire, et un budget trop court rend `length`
          // avec un contenu nul. 500 a déjà fait perdre une réponse.
          max_tokens: 2000,
          ...(this.options.reasoningEffort
            ? { reasoning_effort: this.options.reasoningEffort }
            : {}),
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Champs attendus : ${fields.join(', ')}.\nDescription : ${input}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new AiUnavailable(
        'unavailable',
        `modèle injoignable (${error instanceof Error ? error.message : 'raison inconnue'})`,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new AiUnavailable('denied', 'la clé d\u2019IA est refusée');
    }
    if (!response.ok) {
      throw new AiUnavailable('unavailable', `le modèle a répondu ${response.status}`);
    }

    const payload = (await response.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
    } | null;
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return { output: null, raw: null };

    return { output: parseJsonObject(content), raw: content.slice(0, 4000) };
  }
}

/** L'objet promis, ou `null` : une chaîne n'est pas un enregistrement. */
function parseJsonObject(content: string): Record<string, unknown> | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/u);
  const text = (fenced?.[1] ?? content).trim();
  try {
    const parsed: unknown = JSON.parse(text);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
