import { compareWeekIds, weekNumber } from '../../shared/weeks.ts';

/**
 * Nombre visible de una semana: el de su sprint si ya tiene tablero; si es posterior a la
 * última, el que recibirá al crearse ("Sprint N", N = tableros existentes); si no, "Semana N".
 */
export function sprintLabel(weekId: string, names: Readonly<Record<string, string>>, weekIds: readonly string[]): string {
  const named = names[weekId];
  if (named) return named;
  const last = weekIds[weekIds.length - 1];
  if (!last || compareWeekIds(weekId, last) > 0) return `Sprint ${weekIds.length}`;
  return `Semana ${weekNumber(weekId)}`;
}
