# Larum Admin & Agent Presence — dirección visual

Transcripción de los tres tableros de referencia entregados el 9 ago 2026.
Las imágenes no viven en el repositorio; esto es lo que hay que poder
reconstruir sin ellas. **Referencia de dirección, no maqueta a copiar.**

---

## Estética común

| | |
|---|---|
| Tono | Oscuro. Negro/carbón como fondo, acentos cálidos dorados |
| Paleta | `#0E0E0D` fondo · `#E8E3DA` texto claro · `#FFFFFF` títulos · `#C5AB75` dorado (ya en uso) · `#5A4A38` marrón profundo |
| Tipografía | **Playfair Display** para títulos · **Inter** para interfaz. (Hoy la experiencia usa Georgia + Segoe UI: la dirección pide sustituirlas) |
| Sensación | Editorial, cinematográfica, lujosa, minimalista, fiable, cuidada en el detalle |
| Regla | Mucho aire, jerarquía tipográfica clara, imágenes grandes, estados y badges discretos, sin saturación |
| Idioma | ES / EN nativo en toda la interfaz, conmutador visible arriba a la derecha |

**Principio rector, literal del tablero:** *la propiedad es el activo central; todo gira alrededor de elevar su percepción y su experiencia.*

---

## 1 · Larum Admin

### Navegación lateral fija (una columna estrecha, oscura)
`Dashboard · Clientes · Agentes · Propiedades · Auditorías · Leads · Analytics · Ajustes`
Pie: avatar + nombre + rol («Jen — Administrador»).

### Dashboard
- Saludo editorial: «Bienvenido, Jen» + subtítulo + selector de periodo.
- Fila de 4-5 tarjetas: Propiedades activas · Experiencias publicadas · Visitas totales · Leads nuevos · Conversaciones. Cada una con delta vs periodo anterior (`+12% vs mes anterior`).
- Tres bloques: **Actividad reciente** (lista con icono, texto y «hace 2 minutos»), **Visitas** (línea, 30 días), **Fuentes de tráfico** (donut).
- En otra versión del tablero: **Top performing properties** (miniatura + leads + tiempo medio).

### Propiedades — listado visual
- Rejilla de tarjetas con **imagen de portada grande**, nombre, ubicación, precio y badge de estado (`Publicado` verde · `Borrador` gris · `En producción` ámbar · `Auditoría`).
- Bajo cada tarjeta, métricas en una línea: `23 leads · 1,2K vistas · 4:32 tiempo medio`.
- Filtros: buscador, estado, agente, ubicación. Conmutador rejilla/lista. Paginación.
- Última celda de la rejilla: **+ Nueva propiedad** como tarjeta vacía con borde punteado.

### Workspace de propiedad
- Cabecera: miniatura + nombre + badge de estado + `Madrid · €3.796.000 · M1558`, con acciones `Vista previa` y `Publicar`.
- **Pestañas laterales o superiores:** `Overview · Audit · Contenido · Assets · Experiencia · Concierge · Analytics · Leads · Ajustes`.
- Overview en tres columnas: ficha de datos · **preview de la experiencia real embebida** · resumen de rendimiento con deltas.
- **Checklist de preparación** con marcas: Información básica ✓ · Contenido bilingüe ✓ · Assets principales ✓ · Knowledge/Concierge ✓ · Audit completada ○ · Experiencia revisada ✓ · Analytics ✓ · Revisión final ○ → **`7 / 8 completado`**.

### Pestaña Contenido
Sub-pestañas por bloque (`Hero · Narrativa · Espacios · Alrededores · DNA · Información`) y, dentro, **conmutador ESPAÑOL / ENGLISH**. Campos con contador de caracteres (`92 / 160`), previsualización de la imagen al lado.

### Pestaña Concierge
Sub-pestañas `Información · Intents · Interest Signals · Qualification · Respuestas`. Campos de nombre, rol, estilo de comunicación e idiomas activos. **Previsualización del concierge en vivo** con el saludo real y campo para probar preguntas.

### Wizard de creación
Seis pasos con barra numerada: `Basic info → Content → Assets → Knowledge → Review → Publish`.
Paso 1: nombre ES, nombre EN, ubicación, precio, moneda, referencia, tipo de propiedad, e imagen de portada por arrastrar-y-soltar («recomendado 16:9, alta calidad»). Botones `Cancelar` / `Siguiente paso`.

---

## 2 · Agent Presence *(FASE 2 — no construir todavía)*

Sitio público del agente, mismo lenguaje visual, pensado como **hub**: desde ahí se entra a todas sus Property Experiences.

- Navegación superior: `HOME · ABOUT · PROPERTIES · PHILOSOPHY · INSIGHTS · CONTACT` + `ES | EN`.
- **Home:** titular editorial a toda página («Real estate is not about properties. It's about purpose.»), retrato cinematográfico a sangre, firma manuscrita, y una fila de cifras de autoridad (`€250M+ volumen · 120+ propiedades · 8 años · 97% satisfacción`). Debajo, **Featured properties** en tres tarjetas.
- **About & Philosophy:** retrato grande, texto en primera persona, y la filosofía numerada `01 People first · 02 Curated excellence · 03 Beyond the transaction`.
- **Properties collection:** rejilla con filtros de ubicación, tipo y estado, ordenación.
- Indicador de progreso vertical en el margen izquierdo (`01 ○ ○ ○ ○`).

---

## Qué implica para el sistema actual

1. La tipografía de la dirección (Playfair + Inter) **no** es la que usa hoy la experiencia (Georgia + Segoe UI). Cambiarla afecta al producto público: decisión pendiente.
2. El panel actual es claro sobre fondo hueso; la dirección es oscura. El rediseño del panel es parte de la Fase 1; la experiencia pública **no se toca** (§12 del spec).
3. La rejilla de propiedades exige una **imagen de portada por propiedad**, que hoy es `assets.hero.fallbackImage`.
4. El checklist de preparación puede alimentarse del **validador que ya existe** en `property-loader.js`: sus issues/warnings son exactamente ese semáforo.
