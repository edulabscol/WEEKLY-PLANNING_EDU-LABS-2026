# Auditoría del prototipo

**Origen:** artifact «Gestión de tareas personalizada» (tipo *Migrated Design*), archivo `project/Planeacion Semanal.dc.html` (720 líneas, 75 KB). Se conserva una copia sin modificar en [`docs/prototype-original.html`](prototype-original.html).

## 1. Inventario técnico

| Elemento | Hallazgo |
|---|---|
| HTML principal | Un único archivo con plantilla declarativa propia del editor de diseño (`<x-dc>`, `<sc-if>`, `<sc-for>`, `{{ }}`) y un `support.js` del entorno de diseño. No es ejecutable fuera de ese entorno. |
| CSS | Estilos en línea en cada elemento + bloque `<style>` con 3 animaciones (`elpulse`, `elin`, `elslide`). Hover mediante atributos `style-hover` propios del editor. |
| JavaScript | Clase `Component extends DCLogic` (~250 líneas) con estado, cálculos y manejadores. |
| Tipografías | Google Fonts: **Lexend** (títulos) y **Nunito Sans** (texto). |
| Recursos gráficos | Logo remoto `https://moodle.com/wp-content/uploads/2019/03/edulabs.png`. Iconografía con caracteres Unicode (‹ › ▼ ▶ ■ ✓ × ↻ → ⚑ ⌕). |
| Paleta | Morado `#5E1A8C`, rosa `#E6195F`, amarillo `#FFC20E`, azul `#22A7E8`, verde `#7DBA1F`; neutros `#1E1A24`, `#4A4752`, `#6B6B73`, `#E7E4EC`, `#F7F6F9`. Franja de marca de 5 colores bajo la cabecera. |
| Propiedades configurables | `capacity` (20–60 h, por defecto 40) y `defaultView` (`lista` / `tablero` / `carga`). |
| Datos de ejemplo | 3 personas (Yerson, Rubén, Wilson), 5 estados, 3 prioridades, semanas 44 y 45 de 2026 (9 + 19 tareas) con horas normalizadas por persona. |
| Persistencia | `localStorage` (clave `edulabs-planner-v4`) en el navegador. |
| Dependencias | Ninguna más allá del entorno del editor y Google Fonts. |

## 2. Experiencia de usuario: pantallas, componentes y estados

1. **Cabecera fija**: logo, título, píldora del cronómetro activo (reloj, persona, tarea, «■ Detener»), buscador, botón de ayuda «?», botón «+ Nueva tarea», franja de colores.
2. **Barra de semana**: flechas ‹ ›, «Semana N», insignia (*Esta semana* / *Cerrada* / *Próxima*), rango de fechas, enlace «Ir a esta semana», pestañas *Lista · Tablero · Carga del equipo*.
3. **Filtro de equipo**: chip «Todos» + chip por persona (avatar con iniciales).
4. **Aviso de semana cerrada** con número de tareas que pasaron a la semana siguiente.
5. **Estado vacío de semana** («Semana N aún no tiene tablero»), lista de pendientes de la semana anterior con horas faltantes, botones «Crear tablero y traer N pendientes» y «Crear tablero vacío».
6. **Indicadores** (4 tarjetas): Cumplimiento del sprint (con barra), Tareas adicionales, Vencidas sin completar, Personas excedidas.
7. **Vista Lista**: secciones *Planeación* y *Tareas adicionales* (contraíbles, contador, avance, estimado/real, «+ Agregar»). Fila de escritorio con 9 columnas (casilla, tarea + etiquetas, responsables, estado editable, prioridad, vence, avance editable, estimado/real con barra, cronómetro). Tarjeta móvil por debajo de 1180 px. Campo de alta rápida con Enter.
8. **Vista Tablero**: 5 columnas por estado con arrastrar y soltar.
9. **Vista Carga del equipo**: barra por persona (planeado/adicional) frente a la línea de capacidad, estado *Excedido / Al límite / Disponible*, detalle desplegable de tareas y «Ver en la lista».
10. **Panel de detalle (drawer)**: tipo (Planeada/Adicional), «Viene de semana», «✓ Guardado», nombre, estado, avance (deslizador), prioridad, vencimiento («Vencida»), proyecto, solicitado por (solo adicionales), responsables con estimado/real en h + min, cronómetro por persona, «Sumar a real» (+15 min, +30 min, +1 h, +2 h), agregar/quitar responsables, justificación de retraso, descripción, «Eliminar», «Listo».
11. **Modal de ayuda** con atajos `N`, `Alt ← →`, `Esc`.
12. **Toast** con «Deshacer».

## 3. Funcionalidad: real, simulada y faltante

| Funcionalidad | En el prototipo | Necesidad para producto real |
|---|---|---|
| CRUD de tareas, estados, avance, prioridades | Funciona en memoria + `localStorage` | Persistencia en servidor, validación, concurrencia |
| Reglas estado ↔ avance | Implementadas en el cliente | Aplicarlas también en el servidor (fuente de verdad) |
| Semanas y arrastre de pendientes | Numeración fija (`BASE_WEEK=45`) | Semanas ISO reales, transacción atómica |
| «Hoy» | **Simulado**: fecha fija `2026-11-05` | Fecha real en la zona horaria del equipo |
| Cronómetro | Uno por navegador, se pierde al cambiar de equipo | Uno por usuario, en servidor, con tope ante olvidos |
| Personas | Arreglo fijo en el código | Usuarios reales con alta/baja |
| Autenticación y roles | **No existe** | Inicio de sesión, sesiones, roles, permisos |
| Capacidad y vista por defecto | Propiedades del editor | Ajustes persistentes administrables |
| Deshacer | Instantánea de todo el estado local | Operaciones inversas en la API (restaurar, revertir) |
| Auditoría, salud, respaldos | No existen | Necesarias para operar |

## 4. Arquitectura requerida

- **Frontend**: SPA que reproduzca las 3 vistas, el panel de detalle y los modales.
- **Backend**: API REST con autenticación por sesión, control de acceso por rol y lógica de negocio centralizada.
- **Base de datos**: entidades usuarios, sesiones, semanas, tareas, responsables, registros de tiempo, cronómetros, ajustes y auditoría, con restricciones de integridad.
- **Procesos asíncronos**: no se requieren colas; limpieza de sesiones y respaldos programados.
- **Servicios externos**: ninguno obligatorio (solo fuentes y logo remotos, opcionales).

## 5. Decisiones de preservación

Se mantuvieron distribución, colores, tipografías, jerarquías, espaciados, iconografía y umbrales responsive (1180 px para filas de escritorio, 760 px para el panel a pantalla completa). Se **agregaron** elementos necesarios que el prototipo no tenía, con el mismo lenguaje visual: pantalla de inicio de sesión, menú de usuario, panel «Equipo y ajustes» (personas, ajustes, actividad paginada) y cambio de contraseña. No se eliminó ningún elemento del diseño. Única diferencia deliberada: «Crear tablero vacío» solo aparece cuando hay pendientes (sin pendientes ambas acciones eran idénticas).
