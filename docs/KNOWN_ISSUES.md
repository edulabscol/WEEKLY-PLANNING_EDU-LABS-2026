# Limitaciones conocidas y pendientes

No hay errores críticos conocidos sin documentar. Lo siguiente son limitaciones o tareas pendientes, con su impacto y la acción recomendada.

## Bloqueado por el entorno de construcción (sin red)

| # | Pendiente | Impacto | Cómo resolver |
|---|---|---|---|
| K-01 | **No existe `package-lock.json`** (no se pudo ejecutar `npm install`) | Instalaciones no reproducibles al byte | En una máquina con red: `npm install` y versionar el `package-lock.json` generado. El Dockerfile usa `npm ci` si existe |
| K-02 | **`npm audit` no ejecutado** | Vulnerabilidades de dependencias no verificadas | `npm run audit:deps`. Superficie mínima: en ejecución solo `react`/`react-dom` (el servidor no usa paquetes npm) |
| K-03 | **Docker y Caddy no probados** (sin daemon de Docker en el entorno; el resto sí se probó contra PostgreSQL 16 real) | Posibles ajustes menores en la imagen | `docker compose up --build`; revisar `/api/health` |
| K-04 | **Tipos de React propios** (`src/client/types/react-shim.d.ts`) en lugar de `@types/react` | El chequeo de tipos de JSX es menos exhaustivo | `npm i -D @types/react @types/react-dom`, borrar el shim y ejecutar `npm run typecheck` |
| K-05 | **Lint propio** en lugar de ESLint | Menos reglas que ESLint + plugins de React/a11y | Opcional: agregar ESLint con `typescript-eslint`, `eslint-plugin-react-hooks` y `jsx-a11y` |

## Decisiones con impacto

| # | Limitación | Impacto | Mitigación / evolución |
|---|---|---|---|
| K-06 | **Cliente PostgreSQL propio** en lugar de `pg` | No incluye funciones avanzadas de `pg` (LISTEN/NOTIFY, COPY, cancelación de consultas desde el cliente, autenticación Kerberos/GSS o por certificado de cliente) que la aplicación no usa | Si su política exige `pg`, cámbielo en `src/server/db/database.ts` |
| K-07 | **Limitador de solicitudes en memoria** | Por instancia; se reinicia al reiniciar | Con varias instancias, límite en el proxy (Caddy/Nginx) o en una tabla de PostgreSQL |
| K-08 | **Respaldo lógico diario** (`pg_dump`) | Puede perder hasta 24 h de datos | Si su servidor ya tiene PITR (WAL archiving, pgBackRest, Barman), úselo y desactive el servicio `backup` |
| K-09 | **Logo y fuentes se cargan de servidores externos** (moodle.com, Google Fonts), como en el prototipo | Si no cargan, se muestra el logo textual «Edu Labs» y fuentes del sistema; el logo es un recurso de marca de terceros | Alojar el logo oficial (con autorización) y las fuentes en `public/`, y ajustar la CSP |
| K-10 | **Sin sincronización en tiempo real** | Cambios de otras personas se ven al recargar o al volver a la pestaña | Polling o Server-Sent Events si se requiere |
| K-11 | **Recuperación de contraseña por correo** no implementada | Coordinación la restablece desde «Equipo y ajustes → Contraseña» | Integrar un servicio SMTP para autoservicio |
| K-12 | **Cobertura de la interfaz** no medida con instrumentación | El porcentaje reportado corresponde a servidor + lógica compartida | La interfaz se valida con 38 pruebas de navegador; opcional: cobertura V8 de Playwright |
| K-13 | **Fecha del selector «Vence»** con el formato del navegador (p. ej. `mm/dd/aaaa` en navegadores en inglés) | Cosmético | Selector de fecha propio si se requiere formato fijo |
| K-15 | **Arrastrar y soltar** en el tablero no tiene alternativa de teclado dentro del tablero | Accesibilidad parcial | El estado se puede cambiar con teclado desde el detalle de la tarea o la lista |
| K-17 | **SQLite solo para desarrollo** | Una conexión, sin roles ni SSL; no apto para varios servidores | Use PostgreSQL en el servidor (ya preparado) |
| K-18 | **Instaladores no ejecutados en Windows/macOS** (construidos y probados en Linux) | Posibles diferencias menores de entorno | Los comandos manuales del README funcionan en cualquier sistema |
| K-16 | Solo se probó en **Chromium** | Diferencias menores posibles en Firefox/Safari | Agregar proyectos de Playwright |
