// Codificación y decodificación de mensajes del protocolo PostgreSQL v3.
// Referencia: https://www.postgresql.org/docs/16/protocol-message-formats.html

export const PROTOCOL_VERSION = 196608; // 3.0
export const SSL_REQUEST_CODE = 80877103;

/** Construye un mensaje del cliente: tipo (1 byte, opcional) + longitud (int32) + cuerpo. */
export class Writer {
  #parts: Buffer[] = [];
  #size = 0;

  int8(n: number): this {
    return this.#push(Buffer.from([n & 0xff]));
  }
  int16(n: number): this {
    const b = Buffer.alloc(2);
    b.writeInt16BE(n);
    return this.#push(b);
  }
  int32(n: number): this {
    const b = Buffer.alloc(4);
    b.writeInt32BE(n);
    return this.#push(b);
  }
  cstring(s: string): this {
    return this.#push(Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])]));
  }
  bytes(b: Buffer): this {
    return this.#push(b);
  }
  #push(b: Buffer): this {
    this.#parts.push(b);
    this.#size += b.length;
    return this;
  }

  /** Mensaje con código de tipo (todos excepto Startup/SSLRequest). */
  message(type: string): Buffer {
    const head = Buffer.alloc(5);
    head.write(type, 0, 'ascii');
    head.writeInt32BE(this.#size + 4, 1);
    return Buffer.concat([head, ...this.#parts]);
  }

  /** Mensaje sin código de tipo (Startup, SSLRequest). */
  untyped(): Buffer {
    const head = Buffer.alloc(4);
    head.writeInt32BE(this.#size + 4);
    return Buffer.concat([head, ...this.#parts]);
  }
}

/** Lector secuencial del cuerpo de un mensaje del servidor. */
export class Reader {
  readonly buf: Buffer;
  pos = 0;
  constructor(buf: Buffer) {
    this.buf = buf;
  }
  int8(): number {
    return this.buf.readUInt8(this.pos++);
  }
  int16(): number {
    const v = this.buf.readInt16BE(this.pos);
    this.pos += 2;
    return v;
  }
  int32(): number {
    const v = this.buf.readInt32BE(this.pos);
    this.pos += 4;
    return v;
  }
  cstring(): string {
    const end = this.buf.indexOf(0, this.pos);
    const s = this.buf.toString('utf8', this.pos, end);
    this.pos = end + 1;
    return s;
  }
  bytes(n: number): Buffer {
    const b = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return b;
  }
  rest(): Buffer {
    return this.bytes(this.buf.length - this.pos);
  }
}

export interface BackendMessage {
  type: string;
  body: Buffer;
}

/** Divide el flujo TCP en mensajes completos. */
export class MessageSplitter {
  #buf: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): BackendMessage[] {
    this.#buf = this.#buf.length ? Buffer.concat([this.#buf, chunk]) : chunk;
    const out: BackendMessage[] = [];
    let off = 0;
    while (this.#buf.length - off >= 5) {
      const len = this.#buf.readInt32BE(off + 1);
      if (this.#buf.length - off < len + 1) break;
      out.push({ type: String.fromCharCode(this.#buf[off] ?? 0), body: this.#buf.subarray(off + 5, off + 1 + len) });
      off += len + 1;
    }
    this.#buf = this.#buf.subarray(off);
    return out;
  }
}

// ------------------------------------------------------------------ mensajes del cliente

export function startupMessage(params: Record<string, string>): Buffer {
  const w = new Writer().int32(PROTOCOL_VERSION);
  for (const [k, v] of Object.entries(params)) w.cstring(k).cstring(v);
  return w.cstring('').untyped();
}

export const sslRequest = (): Buffer => new Writer().int32(SSL_REQUEST_CODE).untyped();
export const passwordMessage = (password: string): Buffer => new Writer().cstring(password).message('p');
export const saslInitialResponse = (mechanism: string, data: string): Buffer => {
  const d = Buffer.from(data, 'utf8');
  return new Writer().cstring(mechanism).int32(d.length).bytes(d).message('p');
};
export const saslResponse = (data: string): Buffer => new Writer().bytes(Buffer.from(data, 'utf8')).message('p');
export const simpleQuery = (sql: string): Buffer => new Writer().cstring(sql).message('Q');
export const terminate = (): Buffer => new Writer().message('X');

/** Parse + Bind + Describe + Execute + Sync con sentencia y portal sin nombre; parámetros y resultados en texto. */
export function extendedQuery(sql: string, values: ReadonlyArray<string | null>): Buffer {
  const parse = new Writer().cstring('').cstring(sql).int16(0).message('P');
  const bind = new Writer().cstring('').cstring('').int16(0).int16(values.length);
  for (const v of values) {
    if (v === null) bind.int32(-1);
    else {
      const b = Buffer.from(v, 'utf8');
      bind.int32(b.length).bytes(b);
    }
  }
  bind.int16(0);
  return Buffer.concat([parse, bind.message('B'), new Writer().int8('P'.charCodeAt(0)).cstring('').message('D'), new Writer().cstring('').int32(0).message('E'), new Writer().message('S')]);
}

// ------------------------------------------------------------------ mensajes del servidor

export interface PgErrorFields {
  severity: string;
  code: string;
  message: string;
  detail?: string;
  hint?: string;
  constraint?: string;
  table?: string;
  column?: string;
}

const ERROR_FIELDS: Record<string, keyof PgErrorFields> = { V: 'severity', C: 'code', M: 'message', D: 'detail', H: 'hint', n: 'constraint', t: 'table', c: 'column' };

export function parseErrorFields(body: Buffer): PgErrorFields {
  const r = new Reader(body);
  const out: PgErrorFields = { severity: 'ERROR', code: 'XX000', message: 'Error de PostgreSQL' };
  for (;;) {
    const code = r.int8();
    if (code === 0) break;
    const value = r.cstring();
    const key = ERROR_FIELDS[String.fromCharCode(code)];
    if (key) out[key] = value;
  }
  return out;
}

export interface FieldInfo {
  name: string;
  typeOid: number;
}

export function parseRowDescription(body: Buffer): FieldInfo[] {
  const r = new Reader(body);
  const n = r.int16();
  const fields: FieldInfo[] = [];
  for (let i = 0; i < n; i++) {
    const name = r.cstring();
    r.int32(); // oid de la tabla
    r.int16(); // número de columna
    const typeOid = r.int32();
    r.int16(); // tamaño del tipo
    r.int32(); // modificador
    r.int16(); // formato
    fields.push({ name, typeOid });
  }
  return fields;
}

export function parseDataRow(body: Buffer): Array<string | null> {
  const r = new Reader(body);
  const n = r.int16();
  const out: Array<string | null> = [];
  for (let i = 0; i < n; i++) {
    const len = r.int32();
    out.push(len === -1 ? null : r.bytes(len).toString('utf8'));
  }
  return out;
}

/** "UPDATE 3" → 3; "INSERT 0 1" → 1; "SELECT 5" → 5. */
export function rowCountFromTag(tag: string): number {
  const last = tag.split(' ').pop() ?? '';
  const n = Number(last);
  return Number.isFinite(n) ? n : 0;
}
