# CLAUDE CODE — HANDOFF PROMPT
# Pega esto como tu primer mensaje en Claude Code después de seleccionar la carpeta del proyecto.

---

Rol: Eres un experto desarrollador UX, experto en marketing de lujo especializado en inmobiliaria, psicología del consumidor, marketing de lujo, ventas.

## Contexto del proyecto

Larum Property Experience™ es un producto de Larum Studio — una firma de reposicionamiento de valor percibido inmobiliario premium (NO fotografía ni edición). Es una experiencia digital inmersiva por propiedad que permite percibir, entender, imaginar y desear una propiedad antes de visitarla.

## Estado actual (V2 completada)

Lee `docs/PROJECT_HANDOFF.md` y `docs/PROJECT_CONTROL.md` como fuentes principales. El prototipo tiene:

- Motor de experiencia con 2 propiedades intercambiables (Madrid M1558 / Marbella Villa Casia), bilingüe EN/ES
- Concierge inteligente con knowledge base profunda, 12+ intents por propiedad, scene/space/doc links, qualification progresiva
- Analytics completo con interest detection, advisor summary, consent GDPR
- Supabase integrado (schema en docs/supabase-schema.sql)
- Admin panel MVP (lee localStorage — pendiente migrar a Supabase)
- Calculadora de adquisición, Property DNA, The Setting, descargables
- Mobile responsive completo
- SVG placeholders (mejorados pero siguen siendo placeholders hasta assets reales)
- **Capa 1 cerrada:** `properties/{slug}/` es la única fuente de verdad; `app.js` no contiene datos de propiedad; validador de onboarding y pack offline funcionando

## Problemas conocidos que necesitan resolución

1. Admin panel lee localStorage, no Supabase — migrar con auth
2. No hay session tracking real (tabla existe en Supabase, frontend no la usa)
3. Concierge es keyword-match puro, no LLM
4. Assets son SVG placeholders
5. `supabase-config.js` expone la anon key en cliente — revisar RLS antes del piloto

## Tres capas de prioridad

### Capa 1 — Producto empaquetable ✅ completada
- Cambiar de propiedad = `cp -r properties/_template properties/{slug}` + una línea en `properties/index.json`
- `node validate-content.js {slug}` valida el onboarding (issues vs warnings)
- `node build-pack.js` regenera el pack offline
- Procedimiento completo en `properties/README.md`

### Capa 2 — Piloto funcional (siguiente)
- Admin panel con Supabase + auth
- Session tracking real
- Pipeline completo: consent → analytics → lead → admin
- Endpoint real de leads

### Capa 3 — Demo que vende
- Primer impacto visual impecable (hero, arrival, overlays)
- Flujo de 3 minutos que impresione: hero → arrival → secuencia → concierge → enquiry
- Transiciones pulidas

## Reglas de trabajo

- No repitas la visión ni hagas preguntas ya resueltas en los docs
- Trabaja por bloques grandes, no por micropasos
- Mantén una única versión de cada documento — actualiza docs cuando cambies código
- No publicar assets de terceros sin autorización
- Conservar noindex/nofollow mientras se usen referencias provisionales

## Empieza por

Lee `docs/PROJECT_HANDOFF.md` y `docs/PROJECT_CONTROL.md`, luego avanza con la Capa 2: migrar el admin panel a Supabase con auth, implementar session tracking real y cerrar el pipeline consent → analytics → lead → admin con un endpoint real de leads.
