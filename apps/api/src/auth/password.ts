import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

function scrypt(
  password: string,
  salt: string,
  keyLength: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/**
 * Mots de passe : scrypt, sel aléatoire, paramètres OWASP.
 *
 * Aucune dépendance externe : `node:crypto` suffit, et c'est un choix —
 * un condensat ne doit pas dépendre d'une bibliothèque qui change ses
 * valeurs par défaut. Le format porte ses paramètres (`n$r$p$sel$hash`)
 * pour rester vérifiable après un changement éventuel.
 */

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })) as Buffer;

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, salt, expected] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  let derived: Buffer;
  try {
    derived = (await scrypt(password, salt, KEY_LENGTH, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    })) as Buffer;
  } catch {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, 'hex');
  if (expectedBuffer.length !== derived.length) return false;
  return timingSafeEqual(derived, expectedBuffer);
}
