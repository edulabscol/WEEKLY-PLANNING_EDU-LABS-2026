# Requerimientos funcionales

Estado: ✅ implementado y probado (prueba automatizada que lo cubre entre paréntesis: **U** unitaria, **I** integración, **E** E2E, **V** visual).

## RF-01 Autenticación y sesiones
- ✅ Inicio de sesión con correo y contraseña; mensaje genérico ante error (I, E).
- ✅ Sesión con cookie `HttpOnly; SameSite=Lax` (y `Secure` en producción), expiración deslizante configurable (12 h por defecto) (I).
- ✅ Cierre de sesión; aviso «Tu sesión expiró» y regreso al inicio de sesión (I, E).
- ✅ Bloqueo temporal de la cuenta tras 5 intentos fallidos (15 min) y límite de intentos por IP+correo (I).
- ✅ Cambio de contraseña con cierre de las demás sesiones (I).

## RF-02 Roles y permisos
| Acción | Colaborador | Coordinación |
|---|:---:|:---:|
| Ver semanas, tareas, carga | ✅ | ✅ |
| Crear y editar tareas, estimados, responsables | ✅ | ✅ |
| Eliminar/restaurar tareas | solo las que creó | todas |
| Registrar tiempo (cronómetro, rápido, manual) | solo el propio | de cualquiera |
| Crear el tablero de una semana | ❌ | ✅ |
| Personas, ajustes, actividad (auditoría) | ❌ | ✅ |

Cubierto por pruebas I y E. La interfaz deshabilita u oculta lo que el rol no permite y la API lo rechaza con 403.

## RF-03 Semanas
- ✅ Semanas ISO-8601 reales («Semana 45 · 2 – 6 nov 2026»), insignia *Esta semana / Cerrada / Próxima* (U, E).
- ✅ Navegación ‹ › y `Alt ← →`, «Ir a esta semana» (E).
- ✅ Estado vacío con pendientes de la semana anterior y horas faltantes (I, E).
- ✅ Crear tablero trayendo pendientes (todas las no completadas, como *Planeadas*, marcadas «↻ Viene de S‹n›», estimado = lo que falta con mínimo 1 h; las originales quedan «→ Pasó a S‹n›») o vacío. Operación atómica (I, E).
- ✅ Regla: solo se crea la semana siguiente a la última o la semana actual (I).
- ✅ Aviso de semana cerrada; las semanas pasadas se pueden consultar y corregir (E).
- ✅ **Sprints (v1.3.0):** cada tablero semanal es un sprint con nombre. Se numeran por orden de creación desde «Sprint 0» (en los datos de ejemplo, Sprint 0 es el tablero de muestra y Sprint 1 el actual). El título muestra el nombre del sprint y, debajo, «Semana N · fechas». Las marcas de tareas dicen «↻ Viene de Sprint N» / «Pasó a Sprint N» (U, I, E).
- ✅ **Renombrar sprint en línea (v1.3.0):** Coordinación hace clic en el nombre, escribe y pulsa Enter (o sale del campo) para guardar; Esc cancela. 1–60 caracteres, queda en auditoría (`week.rename`). Los colaboradores ven el nombre pero no lo editan (`PATCH /api/weeks/:weekId`, 403 para colaboradores) (I, E).

## RF-04 Tareas
- ✅ Crear desde «Nueva tarea» / tecla `N` / «+ Agregar» (borrador que se guarda solo al escribir el nombre; sin nombre se descarta) (E).
- ✅ Alta rápida con Enter en cada sección (E).
- ✅ Editar: tipo, nombre, estado, avance, prioridad, vencimiento, proyecto, solicitado por, descripción; autoguardado con «✓ Guardado» (I, E).
- ✅ Validaciones: nombre obligatorio (máx. 200), longitudes, fechas válidas, enumeraciones; errores por campo (U, I, E).
- ✅ Reglas estado ↔ avance (completar = 100 %, 100 % = completar, reabrir con avance por defecto, avanzar desde «Por hacer» = «En curso») (U, I, E).
- ✅ Eliminar con «Deshacer» (borrado lógico y restauración) (I, E).
- ✅ Justificación de retraso: tarea adicional de la misma semana + nota; visible si está vencida, arrastrada, bloqueada o ya justificada (I, E).

## RF-05 Responsables y tiempo
- ✅ Agregar/quitar responsables (con «Deshacer»), estimado por persona en h + min (I, E).
- ✅ Real por persona: cronómetro ▶/■ (uno activo por usuario, en servidor; iniciar otro detiene el anterior; tope configurable para cronómetros olvidados), sumas rápidas (+15/+30 min, +1/+2 h) y corrección manual (ajuste auditado) (I, E).
- ✅ Iniciar el cronómetro pasa la tarea «Por hacer» a «En curso» (I, E).
- ✅ Reloj en vivo en la cabecera, persistente al recargar (E).

## RF-06 Vistas, búsqueda y filtros
- ✅ Lista con secciones contraíbles, ordenadas por estado y vencimiento (U, E).
- ✅ Tablero con arrastrar y soltar entre estados (E).
- ✅ Carga del equipo: planeado/adicional vs. capacidad, *Excedido / Al límite (≥ 90 %) / Disponible*, detalle por persona y «Ver en la lista» (U, E).
- ✅ Búsqueda por nombre, proyecto o solicitante; filtro por persona; mensaje sin resultados (U, E).
- ✅ Indicadores: cumplimiento ponderado por estimado, adicionales y % de horas, vencidas, personas excedidas (U, E).

## RF-07 Administración
- ✅ Personas: alta (con contraseña inicial), restablecer contraseña (cierra sus sesiones), rol, pertenencia al equipo, desactivar/reactivar (cierra sesiones; conserva historial); protección del último coordinador (I, E).
- ✅ Ajustes: capacidad semanal (20–60 h) y vista inicial (I, E).
- ✅ Actividad: auditoría paginada de operaciones (I, E).

## RF-08 Experiencia
- ✅ Ayuda y atajos (`N`, `Alt ← →`, `Esc`) (E).
- ✅ Estados de carga (spinner/esqueleto), vacíos, éxito y error (toasts con «Deshacer»), errores de API con reversión del cambio optimista (E).
- ✅ Responsive: escritorio, laptop, tablet, móvil (E, V).
- ✅ Accesibilidad básica: etiquetas, roles, foco visible, navegación por teclado a los detalles, `prefers-reduced-motion` (E).

## Requerimientos no funcionales
- ✅ Persistencia real en base de datos con migraciones y datos semilla (I).
- ✅ Seguridad: ver [ARCHITECTURE.md §6](ARCHITECTURE.md#6-seguridad).
- ✅ Salud (`/api/health`), logs JSON sin datos sensibles, respaldos con `pg_dump` (`npm run db:backup`).
