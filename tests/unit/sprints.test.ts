import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sprintLabel } from '../../src/client/lib/sprints.ts';

describe('sprintLabel', () => {
  const ids = ['2026-W44', '2026-W45'];
  const names = { '2026-W44': 'Sprint 0', '2026-W45': 'Lanzamiento' };

  it('usa el nombre guardado del sprint', () => {
    assert.equal(sprintLabel('2026-W44', names, ids), 'Sprint 0');
    assert.equal(sprintLabel('2026-W45', names, ids), 'Lanzamiento');
  });

  it('anticipa el número del siguiente sprint para semanas posteriores', () => {
    assert.equal(sprintLabel('2026-W46', names, ids), 'Sprint 2');
    assert.equal(sprintLabel('2026-W46', {}, []), 'Sprint 0', 'sin tableros, el primero es el 0');
  });

  it('una semana intermedia sin tablero se muestra como semana', () => {
    assert.equal(sprintLabel('2026-W40', names, ids), 'Semana 40');
  });
});
