import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Sauvegarde et restauration.
 *
 * **Une sauvegarde qu'on n'a jamais restaurée n'est pas une sauvegarde.** C'est la seule
 * raison pour laquelle ce module existe au lieu d'une ligne de documentation : le
 * va-et-vient complet est joué par un test, contre un vrai PostgreSQL, à chaque exécution
 * de la suite.
 *
 * Le format `custom` de `pg_dump` plutôt que du SQL brut : il est compressé, il permet une
 * restauration sélective, et `pg_restore` refuse un fichier tronqué au lieu de rejouer la
 * moitié d'une base.
 *
 * @see docs/OPERATIONS.md §5
 */

const run = promisify(execFile);

export class BackupFailed extends Error {
  constructor(step: string, reason: string) {
    super(`Sauvegarde impossible (${step}) : ${reason}`);
    this.name = 'BackupFailed';
  }
}

export interface BackupOptions {
  connectionString: string;
  /** Fichier de destination. */
  file: string;
  /** Limite la sauvegarde à un schéma. Absent : la base entière. */
  schema?: string;
}

export async function backup(options: BackupOptions): Promise<void> {
  const args = [
    '--format=custom',
    // Sans compression, un instantané de projets fait dix fois sa taille utile.
    '--compress=6',
    // La restauration doit pouvoir écraser : sans `--clean`, restaurer sur une base non
    // vide échoue objet par objet, et l'on croit avoir restauré.
    '--file',
    options.file,
    options.connectionString,
  ];

  if (options.schema) args.unshift(`--schema=${options.schema}`);

  await execute('pg_dump', args);
}

export interface RestoreOptions {
  connectionString: string;
  file: string;
  /**
   * Efface ce qui existe avant de restaurer.
   *
   * Vaut `false` par défaut : une restauration destructive lancée par erreur sur la
   * production est le genre d'accident qu'un défaut ne doit pas rendre facile.
   */
  clean?: boolean;
}

export async function restore(options: RestoreOptions): Promise<void> {
  const args = ['--no-owner', '--no-privileges', '--dbname', options.connectionString];

  if (options.clean) args.unshift('--clean', '--if-exists');

  args.push(options.file);

  await execute('pg_restore', args);
}

/** Les outils sont-ils là ? La réponse conditionne la procédure d'exploitation. */
export async function toolsAvailable(): Promise<boolean> {
  try {
    await run('pg_dump', ['--version']);
    await run('pg_restore', ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function execute(command: string, args: string[]): Promise<void> {
  try {
    const { stderr } = await run(command, args, { maxBuffer: 64 * 1024 * 1024 });

    // `pg_restore` écrit ses avertissements sur la sortie d'erreur sans échouer : les
    // taire ferait passer « restauré avec des objets manquants » pour « restauré ».
    if (stderr.trim().length > 0 && /error|erreur|FATAL/iu.test(stderr)) {
      throw new BackupFailed(command, stderr.trim());
    }
  } catch (error) {
    if (error instanceof BackupFailed) throw error;

    const reason =
      error instanceof Error && 'stderr' in error && typeof error.stderr === 'string'
        ? error.stderr.trim()
        : error instanceof Error
          ? error.message
          : String(error);

    throw new BackupFailed(command, reason);
  }
}
