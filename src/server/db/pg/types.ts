// Conversión de valores entre JavaScript y el formato de texto de PostgreSQL.

export type SqlValue = string | number | boolean | null;
export type ColumnValue = string | number | boolean | null;

const INT_OIDS = new Set([20, 21, 23, 26]); // int8, int2, int4, oid
const FLOAT_OIDS = new Set([700, 701, 1700]); // float4, float8, numeric
const BOOL_OID = 16;
const TIMESTAMP_OIDS = new Set([1114, 1184]); // timestamp, timestamptz

/** Convierte el texto de una columna a un valor JS. Las fechas-hora se devuelven en ISO-8601 UTC. */
export function parseValue(typeOid: number, text: string | null): ColumnValue {
  if (text === null) return null;
  if (INT_OIDS.has(typeOid) || FLOAT_OIDS.has(typeOid)) return Number(text);
  if (typeOid === BOOL_OID) return text === 't';
  if (TIMESTAMP_OIDS.has(typeOid)) return toIso(text);
  return text; // text, varchar, uuid, date (YYYY-MM-DD), json/jsonb (texto), etc.
}

/** "2026-11-05 15:00:00.123456+00" → "2026-11-05T15:00:00.123Z" (la sesión usa TimeZone=UTC). */
export function toIso(text: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?([+-]\d{2})(?::?(\d{2}))?$/.exec(text) ?? /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?()()$/.exec(text);
  if (!m) return text;
  const frac = (m[3] ?? '.000').slice(1, 4).padEnd(3, '0');
  const tz = m[4] ? `${m[4]}:${m[5] ?? '00'}` : 'Z';
  const ms = Date.parse(`${m[1]}T${m[2]}.${frac}${tz}`);
  return Number.isNaN(ms) ? text : new Date(ms).toISOString();
}

export function serializeValue(v: SqlValue | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('Número no finito en un parámetro SQL.');
    return String(v);
  }
  return v;
}

export { toPositional } from '../sql.ts';
