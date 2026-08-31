/**
 * Dépôt d'un fichier chez Sekuu Storage.
 *
 * Trois appels, dans cet ordre, et aucun n'est facultatif :
 *
 *  1. `POST /api/v1/files` déclare le fichier et rend une URL de dépôt ;
 *  2. `PUT` vers cette URL écrit les octets — **sans passer par la plateforme** ;
 *  3. `POST /api/v1/files/{id}/confirm` : la déclaration ne fait jamais foi, Storage
 *     interroge le magasin.
 *
 * L'authentification est une **clé d'API**, pas le jeton de l'utilisateur : le serveur
 * dépose de sa propre initiative, au moment où il produit le PDF. Elle porte
 * `storage.write.delegated` et la liste blanche des `owner_type` de Neftya — un scope dit
 * que la clé peut agir, le périmètre dit sur quoi, et sans le second le premier est le
 * plus large possible.
 *
 * @see Sekuu-Platform/docs/03-services/storage/07-external-api.md §3
 * @see docs/SEKUU.md §8
 */

export const NEFTYA_OWNER_TYPE = 'neftya.export';

export class StorageUnavailable extends Error {
  constructor(reason: string) {
    super(`Dépôt Sekuu Storage impossible : ${reason}`);
    this.name = 'StorageUnavailable';
  }
}

export interface StorageOptions {
  baseUrl: string;
  apiKey: string;
  /** Injectable : les tests n'appellent pas la plateforme. */
  fetch?: typeof globalThis.fetch;
}

export interface UploadRequest {
  /** L'organisation pour laquelle on dépose — vérifiée par la plateforme, pas par nous. */
  organizationId: string;
  ownerId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export class SekuuStorage {
  private readonly fetch: typeof globalThis.fetch;

  constructor(private readonly options: StorageOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  /** Rend l'identifiant du fichier chez Storage. @throws {StorageUnavailable} */
  async upload(request: UploadRequest): Promise<string> {
    const declared = await this.call('/api/v1/files', {
      owner_type: NEFTYA_OWNER_TYPE,
      owner_id: request.ownerId,
      organization_id: request.organizationId,
      name: request.name,
      mime_type: request.mimeType,
      size: request.bytes.byteLength,
    });

    const fileId = String(declared['id'] ?? '');
    const uploadUrl = String(declared['upload_url'] ?? '');

    if (!fileId || !uploadUrl) {
      throw new StorageUnavailable('réponse de déclaration incomplète');
    }

    const put = await this.fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': request.mimeType },
      // `Uint8Array` est un corps valide pour `fetch` ; les types de Node ne le disent
      // pas encore.
      body: request.bytes as unknown as string,
    });

    if (!put.ok) throw new StorageUnavailable(`dépôt refusé (${put.status})`);

    // Sans cet appel, le fichier existe dans le magasin et n'existe pas pour la
    // plateforme : il ne compte pas au quota, et personne ne peut le relire.
    await this.call(`/api/v1/files/${fileId}/confirm`, {});

    return fileId;
  }

  private async call(path: string, body: unknown): Promise<Record<string, unknown>> {
    const response = await this.fetch(`${this.options.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new StorageUnavailable(`${path} a répondu ${response.status}`);
    }

    const payload = (await response.json()) as { data?: Record<string, unknown> };
    return payload.data ?? {};
  }
}
