// Utilidades de semanas ISO-8601 y fechas de calendario (YYYY-MM-DD) sin zona horaria.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEK_RE = /^(\d{4})-W(\d{2})$/;
const DAY_MS = 86_400_000;

export const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;
export const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

function toUtc(date: string): Date {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Fecha inválida: ${date}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (fromUtc(d) !== date) throw new Error(`Fecha inválida: ${date}`);
  return d;
}

function fromUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function isValidDate(date: string): boolean {
  try {
    toUtc(date);
    return true;
  } catch {
    return false;
  }
}

export function addDays(date: string, n: number): string {
  return fromUtc(new Date(toUtc(date).getTime() + n * DAY_MS));
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(a).getTime() - toUtc(b).getTime()) / DAY_MS);
}

export function dayOfWeek(date: string): number {
  return toUtc(date).getUTCDay();
}

function isoWeeksInYear(year: number): number {
  // Un año tiene 53 semanas ISO si el 28 de diciembre cae en la semana 53.
  return isoWeekParts(`${year}-12-28`).week;
}

export function isoWeekParts(date: string): { year: number; week: number } {
  const d = toUtc(date);
  const dow = d.getUTCDay() || 7;
  const thursday = new Date(d.getTime() + (4 - dow) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / DAY_MS / 7) + 1;
  return { year, week };
}

export function formatWeekId(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function weekIdOf(date: string): string {
  const { year, week } = isoWeekParts(date);
  return formatWeekId(year, week);
}

export function parseWeekId(id: string): { year: number; week: number } {
  const m = WEEK_RE.exec(id);
  if (!m) throw new Error(`Semana inválida: ${id}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (year < 2000 || year > 2100 || week < 1 || week > isoWeeksInYear(year)) {
    throw new Error(`Semana inválida: ${id}`);
  }
  return { year, week };
}

export function isValidWeekId(id: string): boolean {
  try {
    parseWeekId(id);
    return true;
  } catch {
    return false;
  }
}

/** Lunes (YYYY-MM-DD) de una semana ISO. */
export function mondayOf(id: string): string {
  const { year, week } = parseWeekId(id);
  const jan4 = fromUtc(new Date(Date.UTC(year, 0, 4)));
  const jan4Dow = dayOfWeek(jan4) || 7;
  const week1Monday = addDays(jan4, 1 - jan4Dow);
  return addDays(week1Monday, (week - 1) * 7);
}

export function addWeeks(id: string, n: number): string {
  return weekIdOf(addDays(mondayOf(id), n * 7));
}

export function compareWeekIds(a: string, b: string): number {
  return diffDays(mondayOf(a), mondayOf(b)) / 7;
}

export function weekNumber(id: string): number {
  return parseWeekId(id).week;
}

/** "2 – 6 nov 2026" o "26 oct – 30 oct 2026" (lunes a viernes). */
export function formatWeekRange(id: string): string {
  const mon = toUtc(mondayOf(id));
  const fri = new Date(mon.getTime() + 4 * DAY_MS);
  const fm = MONTHS[fri.getUTCMonth()] ?? '';
  if (mon.getUTCMonth() === fri.getUTCMonth()) {
    return `${mon.getUTCDate()} – ${fri.getUTCDate()} ${fm} ${fri.getUTCFullYear()}`;
  }
  return `${mon.getUTCDate()} ${MONTHS[mon.getUTCMonth()] ?? ''} – ${fri.getUTCDate()} ${fm} ${fri.getUTCFullYear()}`;
}

/** "Jue 5 nov" o "Sin fecha". */
export function formatShortDate(date: string | null): string {
  if (!date) return 'Sin fecha';
  const d = toUtc(date);
  return `${DOW[d.getUTCDay()] ?? ''} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ''}`;
}

/** Fecha de calendario actual en una zona horaria IANA. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
