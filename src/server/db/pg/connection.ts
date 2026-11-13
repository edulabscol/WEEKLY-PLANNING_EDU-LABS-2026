// Conexión nativa a PostgreSQL (protocolo v3) sobre node:net / node:tls, sin dependencias externas.
import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import { DatabaseError, DatabaseUnavailableError } from '../errors.ts';
import { md5Password, ScramSession } from './auth.ts';
import {
  type BackendMessage,
  extendedQuery,
  type FieldInfo,
  MessageSplitter,
  parseDataRow,
  parseErrorFields,
  parseRowDescription,
  passwordMessage,
  type PgErrorFields,
  Reader,
  rowCountFromTag,
  saslInitialResponse,
  saslResponse,
  simpleQuery,
  sslRequest,
  startupMessage,
  terminate,
} from './messages.ts';
import { type ColumnValue, parseValue } from './types.ts';

export type SslMode = 'disable' | 'prefer' | 'require' | 'verify-full';

export interface PgConnectOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  sslMode: SslMode;
  /** Ruta a un certificado CA (PEM) para verify-full. */
  sslRootCert?: string;
  connectTimeoutMs: number;
  statementTimeoutMs: number;
  applicationName: string;
}

export class PgError extends DatabaseError {
  constructor(fields: PgErrorFields) {
    super(fields);
    this.name = 'PgError';
  }
}

export class PgConnectionError extends DatabaseUnavailableError {
  constructor(message: string) {
    super(message);
    this.name = 'PgConnectionError';
  }
}

export type Row = Record<string, ColumnValue>;

export interface QueryResult {
  rows: Row[];
  rowCount: number;
  command: string;
}

interface Pending {
  fields: FieldInfo[];
  rows: Row[];
  rowCount: number;
  command: string;
  error: PgError | null;
  resolve: (r: QueryResult) => void;
  reject: (e: Error) => void;
}

type Socket = net.Socket | tls.TLSSocket;

const isIp = (h: string): boolean => net.isIP(h) !== 0;

function rawConnect(opts: PgConnectOptions): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: opts.host, port: opts.port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new PgConnectionError(`Tiempo de espera agotado al conectar con PostgreSQL en ${opts.host}:${opts.port}.`));
    }, opts.connectTimeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 30_000);
      resolve(socket);
    });
    socket.once('error', (e) => {
      clearTimeout(timer);
      reject(new PgConnectionError(`No se pudo conectar con PostgreSQL en ${opts.host}:${opts.port}: ${e.message}`));
    });
  });
}

async function negotiateSsl(socket: net.Socket, opts: PgConnectOptions): Promise<Socket> {
  if (opts.sslMode === 'disable') return socket;
  socket.write(sslRequest());
  const answer = await new Promise<string>((resolve, reject) => {
    socket.once('data', (d: Buffer) => resolve(String.fromCharCode(d[0] ?? 0)));
    socket.once('error', reject);
  });
  if (answer !== 'S') {
    if (opts.sslMode === 'prefer') return socket;
    socket.destroy();
    throw new PgConnectionError('El servidor PostgreSQL no acepta conexiones SSL y sslmode lo exige.');
  }
  const verify = opts.sslMode === 'verify-full';
  return new Promise((resolve, reject) => {
    const secure = tls.connect({
      socket,
      host: opts.host,
      servername: isIp(opts.host) ? undefined : opts.host,
      rejectUnauthorized: verify,
      ca: opts.sslRootCert ? fs.readFileSync(opts.sslRootCert) : undefined,
      // Se verifica siempre contra el host configurado (también si es una IP); sin esto Node usaría "localhost".
      checkServerIdentity: verify ? (_name, cert) => tls.checkServerIdentity(opts.host, cert) : () => undefined,
    });
    secure.once('secureConnect', () => resolve(secure));
    secure.once('error', (e) => reject(new PgConnectionError(`Fallo en la negociación SSL con PostgreSQL: ${e.message}`)));
  });
}

export class PgConnection {
  readonly #socket: Socket;
  readonly #splitter = new MessageSplitter();
  readonly #queue: Array<{ payload: Buffer; pending: Pending }> = [];
  #current: Pending | null = null;
  #closed = false;
  /** Estado de transacción informado por el servidor: I (inactiva), T (en transacción), E (transacción fallida). */
  txStatus: 'I' | 'T' | 'E' = 'I';
  lastUsed = Date.now();

  private constructor(socket: Socket) {
    this.#socket = socket;
  }

  get alive(): boolean {
    return !this.#closed;
  }

  static async connect(opts: PgConnectOptions): Promise<PgConnection> {
    const raw = await rawConnect(opts);
    let socket: Socket;
    try {
      socket = await negotiateSsl(raw, opts);
    } catch (e) {
      raw.destroy();
      throw e;
    }
    const conn = new PgConnection(socket);
    await conn.#startup(opts);
    socket.on('data', (d: Buffer) => conn.#onData(d));
    socket.on('error', (e) => conn.#fail(new PgConnectionError(`Conexión con PostgreSQL interrumpida: ${e.message}`)));
    socket.on('close', () => conn.#fail(new PgConnectionError('La conexión con PostgreSQL se cerró.')));
    return conn;
  }

  #startup(opts: PgConnectOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      let scram: ScramSession | null = null;
      const timer = setTimeout(() => {
        cleanup();
        this.#socket.destroy();
        reject(new PgConnectionError('Tiempo de espera agotado durante la autenticación con PostgreSQL.'));
      }, opts.connectTimeoutMs);
      const fail = (e: Error): void => {
        cleanup();
        this.#socket.destroy();
        reject(e);
      };
      const onMessage = (m: BackendMessage): void => {
        if (m.type === 'E') return fail(new PgError(parseErrorFields(m.body)));
        if (m.type === 'Z') {
          cleanup();
          this.txStatus = String.fromCharCode(m.body[0] ?? 73) as 'I';
          return resolve();
        }
        if (m.type !== 'R') return; // ParameterStatus (S), BackendKeyData (K), avisos (N)
        const r = new Reader(m.body);
        const kind = r.int32();
        switch (kind) {
          case 0: // AuthenticationOk
            return;
          case 3: // contraseña en claro (solo si el servidor lo exige)
            this.#socket.write(passwordMessage(opts.password));
            return;
          case 5: // MD5
            this.#socket.write(passwordMessage(md5Password(opts.user, opts.password, r.bytes(4))));
            return;
          case 10: {
            const mechanisms = r.rest().toString('utf8').split('\0').filter(Boolean);
            if (!mechanisms.includes('SCRAM-SHA-256')) return fail(new PgConnectionError(`Mecanismo de autenticación no soportado: ${mechanisms.join(', ')}`));
            scram = new ScramSession(opts.password);
            this.#socket.write(saslInitialResponse('SCRAM-SHA-256', scram.clientFirst()));
            return;
          }
          case 11:
            if (!scram) return fail(new PgConnectionError('SCRAM: mensaje inesperado.'));
            try {
              this.#socket.write(saslResponse(scram.clientFinal(r.rest().toString('utf8'))));
            } catch (e) {
              fail(e as Error);
            }
            return;
          case 12:
            try {
              scram?.verifyServerFinal(r.rest().toString('utf8'));
            } catch (e) {
              fail(e as Error);
            }
            return;
          default:
            return fail(new PgConnectionError(`Método de autenticación de PostgreSQL no soportado (código ${kind}).`));
        }
      };
      const onData = (d: Buffer): void => {
        for (const m of this.#splitter.push(d)) onMessage(m);
      };
      const onError = (e: Error): void => fail(new PgConnectionError(`Error de conexión con PostgreSQL: ${e.message}`));
      const onClose = (): void => fail(new PgConnectionError('PostgreSQL cerró la conexión durante el inicio.'));
      const cleanup = (): void => {
        clearTimeout(timer);
        this.#socket.off('data', onData);
        this.#socket.off('error', onError);
        this.#socket.off('close', onClose);
      };
      this.#socket.on('data', onData);
      this.#socket.on('error', onError);
      this.#socket.on('close', onClose);
      this.#socket.write(
        startupMessage({
          user: opts.user,
          database: opts.database,
          application_name: opts.applicationName,
          client_encoding: 'UTF8',
          DateStyle: 'ISO',
          TimeZone: 'UTC',
          statement_timeout: String(opts.statementTimeoutMs),
        }),
      );
    });
  }

  /** Consulta con parámetros posicionales ($1…) mediante el protocolo extendido. */
  query(sql: string, values: ReadonlyArray<string | null> = []): Promise<QueryResult> {
    return this.#enqueue(extendedQuery(sql, values));
  }

  /** Consulta simple (admite varias sentencias, sin parámetros). Para migraciones y control de transacciones. */
  simple(sql: string): Promise<QueryResult> {
    return this.#enqueue(simpleQuery(sql));
  }

  #enqueue(payload: Buffer): Promise<QueryResult> {
    if (this.#closed) return Promise.reject(new PgConnectionError('La conexión con PostgreSQL está cerrada.'));
    return new Promise((resolve, reject) => {
      const pending: Pending = { fields: [], rows: [], rowCount: 0, command: '', error: null, resolve, reject };
      this.#queue.push({ payload, pending });
      this.#pump();
    });
  }

  #pump(): void {
    if (this.#current || !this.#queue.length) return;
    const next = this.#queue.shift();
    if (!next) return;
    this.#current = next.pending;
    this.lastUsed = Date.now();
    this.#socket.write(next.payload);
  }

  #onData(d: Buffer): void {
    for (const m of this.#splitter.push(d)) this.#onMessage(m);
  }

  #onMessage(m: BackendMessage): void {
    const p = this.#current;
    switch (m.type) {
      case 'T':
        if (p) p.fields = parseRowDescription(m.body);
        return;
      case 'D':
        if (p) {
          const cells = parseDataRow(m.body);
          const row: Row = {};
          p.fields.forEach((f, i) => {
            row[f.name] = parseValue(f.typeOid, cells[i] ?? null);
          });
          p.rows.push(row);
        }
        return;
      case 'C':
        if (p) {
          const tag = new Reader(m.body).cstring();
          p.command = tag.split(' ')[0] ?? '';
          p.rowCount += rowCountFromTag(tag);
        }
        return;
      case 'E':
        if (p && !p.error) p.error = new PgError(parseErrorFields(m.body));
        return;
      case 'Z':
        this.txStatus = String.fromCharCode(m.body[0] ?? 73) as 'I' | 'T' | 'E';
        this.#current = null;
        if (p) {
          if (p.error) p.reject(p.error);
          else p.resolve({ rows: p.rows, rowCount: p.rowCount, command: p.command });
        }
        this.#pump();
        return;
      default:
        // ParseComplete (1), BindComplete (2), NoData (n), EmptyQuery (I), avisos (N), ParameterStatus (S), notificaciones (A)
        return;
    }
  }

  #fail(e: Error): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#current?.reject(e);
    this.#current = null;
    for (const q of this.#queue.splice(0)) q.pending.reject(e);
    this.#socket.destroy();
  }

  close(): Promise<void> {
    if (this.#closed) return Promise.resolve();
    this.#closed = true;
    return new Promise((resolve) => {
      this.#socket.end(terminate(), () => resolve());
      setTimeout(() => {
        this.#socket.destroy();
        resolve();
      }, 1000).unref();
    });
  }
}
