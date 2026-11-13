import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDays,
  addWeeks,
  compareWeekIds,
  dayOfWeek,
  diffDays,
  formatShortDate,
  formatWeekId,
  formatWeekRange,
  isoWeekParts,
  isValidDate,
  isValidWeekId,
  mondayOf,
  parseWeekId,
  todayInZone,
  weekIdOf,
  weekNumber,
} from '../../src/shared/weeks.ts';

describe('semanas ISO', () => {
  it('calcula la semana ISO de fechas normales y de borde de año', () => {
    assert.deepEqual(isoWeekParts('2026-11-05'), { year: 2026, week: 45 });
    assert.deepEqual(isoWeekParts('2026-01-01'), { year: 2026, week: 1 });
    assert.deepEqual(isoWeekParts('2021-01-03'), { year: 2020, week: 53 });
    assert.deepEqual(isoWeekParts('2024-12-30'), { year: 2025, week: 1 });
    assert.equal(weekIdOf('2026-11-11'), '2026-W46');
  });

  it('obtiene el lunes de una semana', () => {
    assert.equal(mondayOf('2026-W45'), '2026-11-02');
    assert.equal(mondayOf('2026-W44'), '2026-10-26');
    assert.equal(mondayOf('2020-W53'), '2020-12-28');
    assert.equal(mondayOf('2025-W01'), '2024-12-30');
  });

  it('suma semanas cruzando el año y compara', () => {
    assert.equal(addWeeks('2025-W52', 1), '2026-W01');
    assert.equal(addWeeks('2026-W52', 1), '2026-W53');
    assert.equal(addWeeks('2026-W53', 1), '2027-W01');
    assert.equal(addWeeks('2021-W01', -1), '2020-W53');
    assert.equal(addWeeks('2026-W45', 0), '2026-W45');
    assert.equal(compareWeekIds('2026-W46', '2026-W45'), 1);
    assert.equal(compareWeekIds('2026-W01', '2025-W52'), 1);
    assert.equal(compareWeekIds('2026-W45', '2026-W47'), -2);
  });

  it('valida identificadores de semana', () => {
    assert.equal(isValidWeekId('2026-W45'), true);
    assert.equal(isValidWeekId('2020-W53'), true);
    assert.equal(isValidWeekId('2026-W53'), true, '2026 empieza en jueves: tiene 53 semanas');
    assert.equal(isValidWeekId('2025-W53'), false);
    assert.equal(isValidWeekId('2026-W00'), false);
    assert.equal(isValidWeekId('2026-45'), false);
    assert.equal(isValidWeekId('1999-W10'), false);
    assert.throws(() => parseWeekId('x'), /Semana inválida/);
    assert.equal(formatWeekId(2026, 5), '2026-W05');
    assert.equal(weekNumber('2026-W05'), 5);
  });

  it('opera con fechas de calendario y rechaza fechas imposibles', () => {
    assert.equal(addDays('2026-02-28', 1), '2026-03-01');
    assert.equal(addDays('2024-02-28', 1), '2024-02-29');
    assert.equal(diffDays('2026-11-09', '2026-11-02'), 7);
    assert.equal(dayOfWeek('2026-11-05'), 4);
    assert.equal(isValidDate('2026-02-30'), false);
    assert.equal(isValidDate('2026-13-01'), false);
    assert.equal(isValidDate('2026-1-01'), false);
    assert.equal(isValidDate('2026-11-05'), true);
    assert.throws(() => addDays('nope', 1), /Fecha inválida/);
  });

  it('formatea rangos y fechas cortas como el prototipo', () => {
    assert.equal(formatWeekRange('2026-W45'), '2 – 6 nov 2026');
    assert.equal(formatWeekRange('2026-W44'), '26 – 30 oct 2026');
    assert.equal(formatWeekRange('2026-W40'), '28 sep – 2 oct 2026');
    assert.equal(formatShortDate('2026-11-05'), 'Jue 5 nov');
    assert.equal(formatShortDate(null), 'Sin fecha');
  });

  it('obtiene la fecha actual en una zona horaria', () => {
    const instant = new Date('2026-11-12T03:00:00Z');
    assert.equal(todayInZone('America/Bogota', instant), '2026-11-11');
    assert.equal(todayInZone('UTC', instant), '2026-11-12');
  });
});
