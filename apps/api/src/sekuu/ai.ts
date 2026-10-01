/**
 * Sekuu AI — exécuter une tâche, et lire son issue.
 *
 * ## On nomme une tâche, jamais un modèle
 *
 * L'API n'a aucun champ `model` : il est **refusé**, pas ignoré. La plateforme nomme le
 * modèle, tient le plafond de dépense, le quota et le registre. Conséquence agréable : le
 * jour où un modèle meilleur ou moins cher arrive, Neftya n'a rien à déployer.
 *
 * ## Deux temps, parce qu'`extract` n'est pas synchrone
 *
 * On soumet, la plateforme répond `202` et un identifiant, le navigateur revient. Attendre
 * dans la requête tiendrait un processus pendant que le modèle réfléchit — quelques
 * secondes multipliées par le nombre de gens qui cliquent ensemble, et l'API ne répond plus
 * à rien d'autre.
 *
 * ## La clé est déléguée, et elle dépense
 *
 * Elle porte `ai.run.delegated` et nomme Neftya ; l'organisation est nommée à chaque appel,
 * et c'est elle qui paie et qui est comptée. Distincte de celle de Storage, délibérément :
 * une clé d'IA **dépense**, sa fuite coûte de l'argent à chaque appel, et la séparer limite
 * ce qu'une seule fuite ouvre.
 *
 * Elle porte aussi la liste blanche des tâches autorisées — `--types=extract`. Un scope dit
 * que la clé peut agir, la liste dit sur quoi, et sans la seconde le premier est le plus
 * large possible.
 *
 * @see Sekuu-Platform/docs/03-services/ai/06-integration.md
 * @see Sekuu-Platform/docs/04-decisions/adr-0015-ai-task-not-model.md
 */

/** Ce que la plateforme peut refuser, et que l'appelant doit distinguer. */
export type AiRefusal =
  /** Le quota du plan est épuisé. Se résout en changeant de plan. */
  | 'quota'
  /**
   * La plateforme a atteint son propre plafond de dépense.
   *
   * **À ne jamais confondre avec `quota`** : inviter le client à payer plus serait
   * mensonger, puisque ce n'est pas son plan qui borne.
   */
  | 'spend_cap'
  /** La tâche n'est pas dans la liste blanche de la clé, ou la clé est refusée. */
  | 'denied'
  /** La plateforme n'a pas répondu, ou a répondu ce qu'on ne sait pas lire. */
  | 'unavailable';

export class AiUnavailable extends Error {
  constructor(
    readonly refusal: AiRefusal,
    reason: string,
  ) {
    super(`Sekuu AI : ${reason}`);
    this.name = 'AiUnavailable';
  }
}

/** L'état d'une génération, tel que la plateforme le nomme. */
export type GenerationStatus =
  'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface Generation {
  id: string;
  status: GenerationStatus;
  /** Lu **uniquement** en cas de succès : voir `read`. */
  output: Record<string, unknown> | null;
}

export interface AiOptions {
  baseUrl: string;
  apiKey: string;
  /** Injectable : les tests n'appellent pas la plateforme. */
  fetch?: typeof globalThis.fetch;
  /** Une génération qui tarde ne doit pas tenir la requête qui l'a soumise. */
  timeoutMs?: number;
}

export interface ExtractRequest {
  organizationId: string;
  input: string;
  fields: readonly string[];
  /**
   * Portée par l'événement métier, pas tirée au hasard.
   *
   * Un double-clic, un réessai, un navigateur qui renvoie : sans clé, chacun est une
   * génération de plus, **facturée**. Une valeur aléatoire rendrait l'en-tête décoratif.
   */
  idempotencyKey: string;
}

export class SekuuAI {
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: AiOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  /** Soumet une extraction. @throws {AiUnavailable} */
  async extract(request: ExtractRequest): Promise<Generation> {
    return read(
      await this.call('POST', '/api/v1/ai/tasks', request.idempotencyKey, {
        task: 'extract',
        // L'organisation au nom de laquelle on exécute : c'est elle qui paie, qui est
        // comptée, et la seule qui pourra relire.
        organization_id: request.organizationId,
        inputs: { input: request.input, fields: request.fields },
      }),
    );
  }

  /**
   * Où en est une génération. @throws {AiUnavailable}
   *
   * L'organisation est nommée en chaîne de requête : une lecture est un `GET` et n'a pas de
   * corps. La plateforme vérifie qu'on a le droit de la nommer, **puis** que la génération
   * lui appartient — sans quoi la même clé lirait chez une organisation ce qu'elle a produit
   * chez une autre.
   */
  async read(organizationId: string, generationId: string): Promise<Generation> {
    const query = new URLSearchParams({ organization_id: organizationId });

    return read(
      await this.call('GET', `/api/v1/ai/tasks/${generationId}?${query.toString()}`),
    );
  }

  private async call(
    method: 'GET' | 'POST',
    path: string,
    idempotencyKey?: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let response: Response;

    try {
      response = await this.fetch(`${this.options.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new AiUnavailable(
        'unavailable',
        `injoignable (${error instanceof Error ? error.message : 'raison inconnue'})`,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as {
      data?: Record<string, unknown>;
      error?: { code?: string; message?: string };
    };

    if (!response.ok) throw refusalOf(response.status, payload.error);

    return payload.data ?? {};
  }
}

/**
 * Traduit le refus de la plateforme en quelque chose dont l'appelant peut faire quelque
 * chose.
 *
 * Le code fait foi avant le statut : `AI_QUOTA_EXCEEDED` et `AI_SPEND_CAP_REACHED` partagent
 * le même `429`, et c'est précisément la distinction que l'intégration demande de ne pas
 * perdre.
 */
function refusalOf(
  status: number,
  error?: { code?: string; message?: string },
): AiUnavailable {
  const code = error?.code ?? '';
  const message = error?.message ?? `réponse ${status}`;

  if (code === 'AI_SPEND_CAP_REACHED') return new AiUnavailable('spend_cap', message);
  if (code === 'AI_QUOTA_EXCEEDED' || code === 'QUOTA_EXCEEDED') {
    return new AiUnavailable('quota', message);
  }
  if (status === 401 || status === 403) return new AiUnavailable('denied', message);

  return new AiUnavailable('unavailable', message);
}

function read(body: Record<string, unknown>): Generation {
  const status = String(body['status'] ?? 'failed') as GenerationStatus;

  return {
    id: String(body['id'] ?? ''),
    status,
    /*
     * La sortie n'est lue qu'en cas de succès.
     *
     * Une génération échouée porte quand même sa consommation — le modèle a brûlé des
     * jetons — mais rien qu'on puisse proposer à quelqu'un. Lire `output` sans regarder
     * `status` afficherait un résultat partiel comme s'il était complet.
     */
    output: status === 'succeeded' ? object(body['output']) : null,
  };
}

/**
 * `extract` promet un objet, et la plateforme le valide avant de le rendre. On le décode
 * donc sans filet — mais on refuse ce qui n'est pas un objet, plutôt que de laisser une
 * chaîne se propager là où un enregistrement est attendu.
 */
function object(output: unknown): Record<string, unknown> | null {
  if (output !== null && typeof output === 'object' && !Array.isArray(output)) {
    return output as Record<string, unknown>;
  }

  if (typeof output === 'string') {
    try {
      return object(JSON.parse(output));
    } catch {
      return null;
    }
  }

  return null;
}
