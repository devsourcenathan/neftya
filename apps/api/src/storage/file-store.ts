/**
 * Le dépôt de fichiers, en interface.
 *
 * `SekuuStorage` (distant, trois appels) et `LocalFileStore` (disque, un
 * appel) parlent tous deux ainsi : les routes de fabrication ne savent pas
 * où les octets dorment, elles savent seulement déposer et relire.
 */

export class StorageUnavailable extends Error {
  constructor(reason: string) {
    super(`Dépôt impossible : ${reason}`);
    this.name = 'StorageUnavailable';
  }
}

export interface UploadRequest {
  /** L'organisation pour laquelle on dépose — borne l'écriture comme la relecture. */
  organizationId: string;
  ownerId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface StoredFile {
  bytes: Uint8Array;
  name: string;
  mimeType: string;
}

/** Déposer, seulement. C'est tout ce que la fabrication exige pour figer un export. */
export interface Uploader {
  /** Dépose et rend l'identifiant du fichier. @throws {StorageUnavailable} */
  upload(request: UploadRequest): Promise<string>;
}

export interface FileStore extends Uploader {
  /**
   * Relit les octets d'un fichier de l'organisation.
   * `null` quand il n'existe pas — ou qu'il est à une autre organisation :
   * même réponse, même oracle fermé que partout ailleurs.
   */
  download(organizationId: string, fileId: string): Promise<StoredFile | null>;
}
