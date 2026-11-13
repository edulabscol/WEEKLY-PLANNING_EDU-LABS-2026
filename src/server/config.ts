import path from 'node:path';
import { isValidDate, todayInZone } from '../shared/weeks.ts';

export type Env = 'development' | 'test' | 'production';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface Config {
  env: Env;
  host: string;
  port: number;
  database: {
    url: string;
    poolMax: number;
    statementTimeoutMs: number;
    connectTimeoutMs: number;
    /** Aplicar migraciones al iniciar. En producción con roles separados, false (las aplica el rol propietario). */
    autoMigrate: boolean;
  };
  publicDir: string;
  timeZone: string;
  /** Fecha fija para desarrollo/pruebas (YYYY-MM-DD). Ignorada en producción. */
  fixedToday: string | null;
  sessionTtlHours: number;
  cookieSecure: boolean;
  trustProxy: boolean;
  corsOrigins: string[];
  logLevel: LogLevel;
  loginRateLimit: { max: number; windowMs: number };
  apiRateLimit: { max: number; windowMs: number };
  /** Duración máxima registrada por un cronómetro olvidado (segundos). */
  timerMaxSeconds: number;
}

export class ConfigError extends Error {}

function num(env: NodeJS.ProcessEnv, key: string, def: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) throw new ConfigError(`${key} debe ser un número entre ${min} y ${max}.`);
  return n;
}

function flag(env: NodeJS.ProcessEnv, key: string, def: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

/** Base de datos local por defecto en desarrollo (SQLite). En producción DATABASE_URL es obligatoria. */
export const DEFAULT_DEV_DATABASE_URL = 'sqlite:./data/planeacion.db';

function databaseUrl(env: NodeJS.ProcessEnv): string {
  const isProd = (env.NODE_ENV ?? 'development') === 'production';
  const url = env.DATABASE_URL || (isProd ? '' : DEFAULT_DEV_DATABASE_URL);
  if (!url) throw new ConfigError('Defina DATABASE_URL (postgres://usuario:clave@host:5432/base?sslmode=require).');
  if (!/^(postgres(ql)?:\/\/|sqlite:)/i.test(url)) throw new ConfigError('DATABASE_URL debe comenzar con postgres://, postgresql:// o sqlite:');
  return url;
}

/** Indica si la conexión a la base de datos no está cifrada hacia un servidor remoto. */
export function insecureRemoteDb(url: string): boolean {
  if (/^sqlite:/i.test(url)) return false;
  try {
    const u = new URL(url);
    const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname);
    const mode = u.searchParams.get('sslmode') ?? 'prefer';
    return !local && (mode === 'disable' || mode === 'prefer');
  } catch {
    return false;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = (env.NODE_ENV ?? 'development') as Env;
  if (!['development', 'test', 'production'].includes(nodeEnv)) throw new ConfigError('NODE_ENV debe ser development, test o production.');
  const isProd = nodeEnv === 'production';
  const timeZone = env.APP_TIMEZONE ?? 'America/Bogota';
  try {
    todayInZone(timeZone);
  } catch {
    throw new ConfigError(`APP_TIMEZONE no es una zona horaria válida: ${timeZone}`);
  }
  const fixedToday = !isProd && env.APP_TODAY ? env.APP_TODAY : null;
  if (fixedToday && !isValidDate(fixedToday)) throw new ConfigError('APP_TODAY debe tener el formato YYYY-MM-DD.');
  const logLevel = (env.LOG_LEVEL ?? (nodeEnv === 'test' ? 'silent' : 'info')) as LogLevel;
  if (!['debug', 'info', 'warn', 'error', 'silent'].includes(logLevel)) throw new ConfigError('LOG_LEVEL inválido.');
  return {
    env: nodeEnv,
    host: env.HOST ?? (isProd ? '0.0.0.0' : '127.0.0.1'),
    port: num(env, 'PORT', 3000, 0, 65535),
    database: {
      url: databaseUrl(env),
      poolMax: num(env, 'DB_POOL_MAX', 10, 1, 200),
      statementTimeoutMs: num(env, 'DB_STATEMENT_TIMEOUT_MS', 15_000, 100, 600_000),
      connectTimeoutMs: num(env, 'DB_CONNECT_TIMEOUT_MS', 10_000, 100, 120_000),
      autoMigrate: flag(env, 'DB_AUTO_MIGRATE', true),
    },
    publicDir: path.resolve(env.PUBLIC_DIR ?? './dist/public'),
    timeZone,
    fixedToday,
    sessionTtlHours: num(env, 'SESSION_TTL_HOURS', 12, 1, 24 * 30),
    cookieSecure: flag(env, 'COOKIE_SECURE', isProd),
    trustProxy: flag(env, 'TRUST_PROXY', false),
    corsOrigins: (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    logLevel,
    loginRateLimit: { max: num(env, 'LOGIN_RATE_LIMIT', 10, 1, 10_000), windowMs: 15 * 60_000 },
    apiRateLimit: { max: num(env, 'API_RATE_LIMIT', 600, 10, 100_000), windowMs: 60_000 },
    timerMaxSeconds: num(env, 'TIMER_MAX_HOURS', 12, 1, 24) * 3600,
  };
}

export function today(config: Config, now: Date = new Date()): string {
  return config.fixedToday ?? todayInZone(config.timeZone, now);
}
