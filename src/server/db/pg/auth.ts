// Autenticación de PostgreSQL: SCRAM-SHA-256 (por defecto en PostgreSQL 14+) y MD5 (servidores antiguos).
import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

export function md5Password(user: string, password: string, salt: Buffer): string {
  const inner = createHash('md5').update(password + user).digest('hex');
  return 'md5' + createHash('md5').update(Buffer.concat([Buffer.from(inner), salt])).digest('hex');
}

const hmac = (key: Buffer, data: string): Buffer => createHmac('sha256', key).update(data).digest();

/** Sesión SCRAM-SHA-256 sin channel binding (RFC 5802 / RFC 7677). */
export class ScramSession {
  readonly #password: string;
  readonly #clientNonce: string;
  readonly #username: string;
  #clientFirstBare = '';
  #expectedServerSignature: Buffer | null = null;

  /** PostgreSQL ignora el usuario de SCRAM (usa el del inicio de sesión), por eso se envía "*". */
  constructor(password: string, clientNonce = randomBytes(18).toString('base64'), username = '*') {
    this.#password = password;
    this.#clientNonce = clientNonce;
    this.#username = username;
  }

  clientFirst(): string {
    this.#clientFirstBare = `n=${this.#username},r=${this.#clientNonce}`;
    return `n,,${this.#clientFirstBare}`;
  }

  clientFinal(serverFirst: string): string {
    const attrs = parseAttrs(serverFirst);
    const nonce = attrs.r ?? '';
    const salt = attrs.s;
    const iterations = Number(attrs.i);
    if (!nonce.startsWith(this.#clientNonce) || nonce.length === this.#clientNonce.length) throw new Error('SCRAM: nonce del servidor inválido.');
    if (!salt || !Number.isInteger(iterations) || iterations < 1) throw new Error('SCRAM: respuesta del servidor incompleta.');
    const salted = pbkdf2Sync(this.#password.normalize('NFKC'), Buffer.from(salt, 'base64'), iterations, 32, 'sha256');
    const clientKey = hmac(salted, 'Client Key');
    const storedKey = createHash('sha256').update(clientKey).digest();
    const withoutProof = `c=biws,r=${nonce}`;
    const authMessage = `${this.#clientFirstBare},${serverFirst},${withoutProof}`;
    const signature = hmac(storedKey, authMessage);
    const proof = Buffer.from(clientKey.map((b, i) => b ^ (signature[i] ?? 0)));
    this.#expectedServerSignature = hmac(hmac(salted, 'Server Key'), authMessage);
    return `${withoutProof},p=${proof.toString('base64')}`;
  }

  verifyServerFinal(serverFinal: string): void {
    const attrs = parseAttrs(serverFinal);
    if (attrs.e) throw new Error(`SCRAM: el servidor rechazó la autenticación (${attrs.e}).`);
    const v = attrs.v ? Buffer.from(attrs.v, 'base64') : Buffer.alloc(0);
    const expected = this.#expectedServerSignature;
    if (!expected || v.length !== expected.length || !timingSafeEqual(v, expected)) throw new Error('SCRAM: firma del servidor inválida.');
  }
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of s.split(',')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}
