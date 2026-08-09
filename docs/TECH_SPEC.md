# LARUM PROPERTY EXPERIENCE™
## Technical specification — Pilot V1

**Estado:** Base técnica del prototipo  
**Prioridad:** velocidad, experiencia, sustitución de contenidos y publicación privada

## 1. Arquitectura del piloto

El piloto funciona como una aplicación web estática con componentes reutilizables.

```text
HTML / CSS / JavaScript
        ↓
Property Experience Engine
        ↓
JSON de contenidos y conocimiento
        ↓
Assets externos/CDN
```

La decisión evita bloquear el prototipo en WordPress y permite desplegarlo rápidamente en Vercel o hosting estático equivalente.

## 2. Separación de responsabilidades

### Código

- `index.html`
- `app.js` — motor de experiencia, sin datos de propiedad
- `styles.css`
- `property-loader.js` — carga y valida los datos de propiedad

### Contenido

- `properties/index.json` — registro: propiedad por defecto, orden, reglas de publicación
- `properties/{slug}/content.json` — lo que lee el visitante
- `properties/{slug}/knowledge.json` — lo que sabe el concierge
- `properties/_template/` — punto de partida para una propiedad nueva

### Assets

- `properties/{slug}/assets.json`
- imágenes y vídeo en CDN/hosting de media

### Validación y build

- `validate-content.js` — validador de onboarding (issues vs warnings)
- `build-pack.js` — genera `property-pack.js` para el modo offline (`file://`)

## 3. Requisitos de publicación

- HTTPS;
- dominio/subdominio configurable;
- noindex mientras se usen referencias no autorizadas;
- compresión de imágenes;
- vídeo con poster, autoplay muted, poster y fallback;
- hero video soportado mediante URL directa MP4; YouTube/Vimeo se trata como Property Film bajo demanda;
- reveal transitions respetando `prefers-reduced-motion`;
- lazy loading;
- responsive;
- formulario conectado a destino aprobado; en el prototipo usa `contact-config.json` y modo `mailto`; en producción debe migrar a endpoint seguro;
- documentos y calculator configurables por propiedad mediante JSON;
- analítica posterior con consentimiento adecuado.

## 4. WordPress

WordPress puede seguir siendo la web corporativa de Larum.

La Property Experience debe poder publicarse:

- en una ruta independiente;
- en un subdominio de Larum;
- en un dominio/subdominio de cliente.

No se recomienda forzar esta experiencia dentro de un tema WordPress si perjudica rendimiento, interacción o libertad visual.

## 5. Validación local

Antes de cargar una propiedad nueva:

```bash
node validate-content.js
node validate-assets.js
```

## 6. Evolución posterior

Cuando exista más de una propiedad autorizada, se puede migrar el motor a Next.js o CMS headless sin cambiar el modelo de contenido.

La migración no debe comenzar hasta validar la experiencia y el proceso comercial.
