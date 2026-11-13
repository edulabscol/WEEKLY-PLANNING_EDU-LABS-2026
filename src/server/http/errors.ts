import type { FieldErrors } from '../../shared/validation.ts';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: FieldErrors | undefined;

  constructor(status: number, code: string, message: string, fields?: FieldErrors) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message: string, fields?: FieldErrors): HttpError => new HttpError(400, 'bad_request', message, fields);
export const validationError = (fields: FieldErrors): HttpError => new HttpError(422, 'validation_error', 'Revisa los datos ingresados.', fields);
export const unauthorized = (message = 'Inicia sesión para continuar.'): HttpError => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'No tienes permiso para realizar esta acción.'): HttpError => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'No se encontró el recurso.'): HttpError => new HttpError(404, 'not_found', message);
export const conflict = (message: string): HttpError => new HttpError(409, 'conflict', message);
export const unprocessable = (message: string): HttpError => new HttpError(422, 'business_rule', message);
export const tooManyRequests = (message = 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.'): HttpError => new HttpError(429, 'rate_limited', message);
