// Utilidades de SQL comunes a PostgreSQL y SQLite.

/**
 * Convierte parámetros con nombre ($nombre) a posicionales ($1, $2…), ignorando literales
 * entre comillas y comentarios. Un mismo nombre reutiliza la misma posición.
 */
export function toPositional(sql: string): { text: string; names: string[] } {
  const names: string[] = [];
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i] ?? '';
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) j += 2;
          else break;
        } else j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === '$' && /[A-Za-z_]/.test(sql[i + 1] ?? '')) {
      const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(i + 1))?.[0] ?? '';
      let idx = names.indexOf(name);
      if (idx === -1) idx = names.push(name) - 1;
      out += `$${idx + 1}`;
      i += 1 + name.length;
      continue;
    }
    out += ch;
    i++;
  }
  return { text: out, names };
}
