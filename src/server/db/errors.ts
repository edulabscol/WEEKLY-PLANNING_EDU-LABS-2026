// Errores de base de datos independientes del motor (PostgreSQL o SQLite).
// Los códigos siguen SQLSTATE de PostgreSQL; el adaptador de SQLite traduce sus errores a estos códigos.

export class DatabaseError extends Error {
  readonly code: string;
  readonly detail: string | undefined;
  readonly constraint: string | undefined;
  constructor(fields: { code: string; message: string; detail?: string | undefined; constraint?: string | undefined }) {
    super(fields.message);
    this.name = 'DatabaseError';
    this.code = fields.code;
    this.detail = fields.detail;
    this.constraint = fields.constraint;
  }
}

/** La base de datos no está disponible (conexión rechazada, caída, sin conexiones libres). */
export class DatabaseUnavailableError extends Error {
  readonly code: string = 'connection_failure';
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseUnavailableError';
  }
}
