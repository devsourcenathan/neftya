import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { v7 as uuidv7 } from 'uuid';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import {
  StorageUnavailable,
  type FileStore,
  type StoredFile,
  type UploadRequest,
} from './file-store.js';

/**
 * Les fichiers, sur disque et en base.
 *
 * `{dataDir}/{organizationId}/{fileId}` : les deux segments sont des UUID
 * produits ici, jamais des entrées — aucun `../` ne peut s'y glisser, et le
 * nom d'origine ne sert qu'à l'étiquette de téléchargement. La table porte
 * l'index ; le disque porte les octets ; les deux s'écrivent dans cet ordre —
 * un fichier sans ligne est un orphelin, une ligne sans fichier est un 404.
 *
 * Limite assumée : une seule instance écrit. Derrière plusieurs, un volume
 * partagé ou un objet distant — l'interface ne changera pas.
 */

const UUID_PATTERN = /^[0-9a-f-]{36}$/u;

/** 50 Mo par fichier : un plan PDF n'en fait pas le dixième, et sans borne un appel remplit le disque. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export interface LocalStoreOptions {
  dataDir: string;
  db: Kysely<Database>;
}

export class LocalFileStore implements FileStore {
  constructor(private readonly options: LocalStoreOptions) {}

  async upload(request: UploadRequest & { createdBy?: string }): Promise<string> {
    if (request.bytes.byteLength > MAX_FILE_BYTES) {
      throw new StorageUnavailable(
        `fichier trop volumineux (${request.bytes.byteLength} octets)`,
      );
    }
    if (!UUID_PATTERN.test(request.organizationId)) {
      throw new StorageUnavailable('organisation invalide');
    }

    const id = uuidv7();
    const path = join(this.options.dataDir, request.organizationId, id);
    try {
      await mkdir(join(this.options.dataDir, request.organizationId), {
        recursive: true,
      });
      await writeFile(path, request.bytes);
    } catch (error) {
      throw new StorageUnavailable(
        error instanceof Error ? error.message : 'écriture impossible',
      );
    }

    await this.options.db
      .insertInto('files')
      .values({
        id,
        organization_id: request.organizationId,
        owner_id: request.ownerId,
        name: request.name.slice(0, 255),
        mime_type: request.mimeType,
        size_bytes: request.bytes.byteLength,
        created_by: request.createdBy ?? request.organizationId,
      })
      .execute();

    return id;
  }

  async download(organizationId: string, fileId: string): Promise<StoredFile | null> {
    if (!UUID_PATTERN.test(organizationId) || !UUID_PATTERN.test(fileId)) return null;

    const row = await this.options.db
      .selectFrom('files')
      .select(['name', 'mime_type'])
      .where('id', '=', fileId)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    if (!row) return null;

    try {
      const bytes = await readFile(join(this.options.dataDir, organizationId, fileId));
      return { bytes: new Uint8Array(bytes), name: row.name, mimeType: row.mime_type };
    } catch {
      // Ligne sans fichier : base et disque ont divergé. 404, pas 500 — le
      // fichier n'est pas lisible, et aucun détail interne ne sort.
      return null;
    }
  }
}
