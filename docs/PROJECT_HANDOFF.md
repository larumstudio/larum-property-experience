# LARUM PROPERTY EXPERIENCE™
## Project handoff / single source of truth

**Fecha:** 9 de agosto de 2026
**Estado:** desplegado en producción. El código de session tracking y del panel de admin está terminado, y **no guardará nada hasta que se ejecute un SQL en Supabase**.

---

## 0. Empieza por aquí

### ⚠️ Lo único que bloquea todo ahora mismo

Ejecutar **`docs/supabase-fix-rls.sql`** en Supabase → SQL Editor. Es idempotente; se puede volver a ejecutar sin riesgo.

El handoff anterior daba por hecho que ya se había ejecutado y verificado. No era cierto. Comprobado otra vez contra la base de datos en vivo con la anon key:

```text
INSERT public.leads            → 42501 row-level security
INSERT public.sessions         → 42501 row-level security
INSERT public.analytics_events → 42501 row-level security
```

Es decir: **hoy no se está guardando nada**, ni siquiera los leads — cada consulta cae al mailto y cada visita muere con la pestaña. Las columnas están bien (el error es de política, no de columna). El script arregla las políticas y añade `leads.session_id`.

Después, crear la cuenta del panel: Authentication → Users → Add user (`contactolarum@gmail.com`, Auto Confirm **on**), y desactivar el alta de nuevos usuarios en Providers → Email.

**En producción:** https://larum-property-experience.vercel.app
Panel de admin: `/admin.html` — noindex, y sin sesión iniciada no es más que una caja de login.
Proyecto Vercel `larum-property-experience` (equipo `larum-studio-s-projects`), enlazado desde `prototype/`. El CLI ya está autenticado en la máquina.

### Cómo trabajar

```bash
cd prototype
node build-pack.js && node validate-content.js   # tras cualquier cambio de contenido
vercel deploy --prod --yes                       # publica el código local
```

`vercel deploy --prod` funciona desde aquí (verificado el 9 ago 2026); la nota anterior que decía lo contrario era errónea. **No usar `vercel redeploy`**: reconstruye un despliegue anterior a partir de *su* código fuente, así que los cambios locales no llegarían a producción — parecería que se ha desplegado y no habría cambiado nada.

Para desarrollo local: `python -m http.server 4173`. El concierge LLM no existe en local (no hay `/api`), así que cae al motor de palabras clave — que es el comportamiento correcto y conviene probarlo.

Al tocar `index.html`, `app.js`, `analytics.js`, `styles.css` o `admin.html`: subir el `?v=` de los `<script>`/`<link>`, o el navegador servirá la versión anterior en la demo. Van por `v=6`.

### Qué está hecho

| | |
|---|---|
| Capa 1 — producto empaquetable | ✅ una propiedad = una carpeta en `properties/` + `assets.json`. Cero datos por-propiedad en el código. Validador: `node validate-content.js` |
| Concierge LLM anclado | ✅ `api/concierge.mjs`, Claude Opus 5, structured outputs, caché de prompt. El dossier es la única fuente de verdad; se niega a inventar. Cae al motor de palabras clave ante cualquier fallo |
| Enlaces compartibles | ✅ `?property=marbella&lang=es&chapter=concierge` |
| Fotografía | ✅ sustituta con licencia, desde CDN de Unsplash. `authorised: false` + `provenance` en cada `assets.json` |
| Session tracking | ✅ `analytics.js` escribe `sessions` (upsert) y `analytics_events` (por lotes), con `session_id` común, y hace flush al cerrar la pestaña. Solo con consentimiento |
| Panel de admin | ✅ `admin.html` contra Supabase con login de Supabase Auth. Vistas *Leads* y *Visits*, resumen del asesor completo, timeline y marcar como contactado. Ya se despliega |
| Supabase | ⚠️ el esquema es correcto; **las políticas RLS siguen sin aplicar** — ver arriba |
| Destino de leads | ✅ `contactolarum@gmail.com` (mailto como red de seguridad) + fila en Supabase |

### Cómo funciona el tracking (para no romperlo)

- **Nada sale del navegador antes del consentimiento.** Si el visitante elige "Experience only" no se registra nada, ni siquiera en local.
- **Una sesión = una pestaña.** El id vive en `sessionStorage`: recargar continúa la misma visita, una segunda pestaña es otro visitante. Cambiar de propiedad abre sesión nueva.
- **La duración se mide, no se deduce.** Un latido de 10 s solo cuenta si la pestaña está visible y hubo actividad en los últimos 90 s: una pestaña abierta toda la noche no se convierte en una visita de nueve horas.
- **Se escribe también al salir**, con `fetch(..., {keepalive:true})` en `pagehide`. Por eso analytics habla con PostgREST directamente y no por supabase-js, que no expone esa opción.
- Si la base de datos rechaza la escritura, avisa **una vez** en consola con la causa y deja de intentarlo. Un `42501` en consola significa que falta ejecutar el SQL.

### Qué falta — en este orden

**1 · Ejecutar el SQL y verificar de punta a punta** *(hacer primero)*
Ejecutar `docs/supabase-fix-rls.sql`, crear el usuario, y entonces: abrir la experiencia, aceptar el banner, explorar un minuto, cerrar la pestaña y comprobar que la fila está en `sessions`. Después entrar en `/admin.html` y ver esa visita.

**2 · Autorización de las agencias** *(bloquea lo visual, no el código)*
Emails redactados y **sin enviar** en `docs/ASSET_PERMISSION_EMAILS.md`. Mandar primero el de NVOGA. Desbloquea fotos reales, el film, planos, y convertir en `confirmed` los datos que hoy salen como pendientes.

### Trampas que ya costaron caro — no repetir

- **Nunca** `filter` ni `backdrop-filter` sobre algo que cubra el viewport. Pintó la página entera en negro y costó horas encontrarlo.
- **Nunca** animar opacidad sobre `#app`: promueve el documento entero a una capa de composición y produce el mismo negro.
- El contenido es **visible por defecto**; la animación de entrada solo suma. No volver a ocultar y confiar en JS para revelar.
- `overflow-x: hidden` en `body` convierte el body en contenedor de scroll y mata todo scroll suave. Usar `clip`.
- Los umbrales por ratio en `IntersectionObserver` fallan con secciones más altas que el viewport. Usar `threshold: 0` + `rootMargin`.
- **No dar por aplicado un cambio en Supabase porque lo diga un documento.** Un `INSERT` con la anon key contra `/rest/v1/<tabla>` lo confirma en diez segundos; este handoff daba por ejecutado un script que nunca se ejecutó, y con él se perdieron todos los leads.

Detalle completo de cada uno en `PROJECT_CONTROL.md`, bloques 9 a 13.

---

## 1. Visión aprobada

Larum no está creando una web inmobiliaria bonita. Está creando una **Property Experience**: una experiencia digital que permite percibir, entender, imaginar y desear una propiedad antes de visitarla.

La propiedad es la protagonista. Larum, la interfaz y la tecnología deben quedar en segundo plano.

La experiencia debe sentirse como:

```text
Entrar → percibir → descubrir → recorrer → imaginar → preguntar → solicitar una conversación privada
```

No se debe reducir a:

```text
Hero → galería → datos → formulario
```

---

## 2. Propiedades piloto provisionales

### Madrid

**M1558 — Goya / Salamanca — Christie's International Real Estate Madrid**  
Tesis: **The Light of Goya** — A private residence shaped by light, silence and intelligent comfort.

### Marbella

**Villa Casia — Nueva Andalucía — NVOGA**  
Tesis: **The Private Resort** — A residence designed for the art of living outdoors.

---

## 3. Qué existe actualmente (V2)

### Estructura de archivos

```text
prototype/
├── index.html              (orquesta: datos → experiencia → consent)
├── styles.css              (V1 + V2 styles, mobile refinado)
├── app.js                  (motor de experiencia — sin datos de propiedad)
├── property-loader.js      (carga, registro y validación de propiedades)
├── analytics.js            (analytics & interest engine — local + sesiones en Supabase)
├── consent.js              (banner GDPR)
├── admin.html              (panel — Supabase con login de Supabase Auth)
├── build-pack.js           (genera property-pack.js para modo offline)
├── property-pack.js        (GENERADO — no editar)
├── validate-content.js     (validador de onboarding)
├── contact-config.json     (configuración de leads)
├── purchase-config.json    (tipos por comunidad autónoma)
├── supabase-config.js
├── properties/
│   ├── README.md           (cómo añadir una propiedad)
│   ├── index.json          (registro: default, orden, reglas)
│   ├── _template/          (plantilla: content + knowledge + assets)
│   ├── madrid/
│   └── marbella/
├── assets/
└── docs/
    ├── PROJECT_HANDOFF.md
    ├── PROJECT_CONTROL.md
    ├── AI_CONCIERGE_SPEC.md
    ├── TECH_SPEC.md
    ├── V2_SCOPE.md
    ├── V1_GAP_ANALYSIS.md
    ├── supabase-schema.sql      (referencia: forma de las tablas)
    └── supabase-fix-rls.sql     (EJECUTAR: políticas RLS + leads.session_id)
```

### Funcionalidades V1 implementadas

- dos propiedades intercambiables;
- EN/ES;
- hero editorial;
- Arrival inmersivo de tres capítulos;
- "A day here" con momentos del día;
- espacios relacionados con cada momento;
- microescenas a pantalla completa;
- Spatial Intelligence;
- Property Film overlay;
- Property Concierge de texto;
- menú de navegación por capítulos;
- consulta privada con formulario;
- memoria de espacios/momentos explorados;
- noindex/nofollow;
- fallback de media;
- contenido externalizado;
- assets externalizados;
- Property DNA;
- The Setting;
- Descargables;
- Calculadora de adquisición.

### Funcionalidades V2 añadidas

**Knowledge Base avanzada:**
- `property-knowledge.json` reescrito con datos profundos.
- `property.facts` con estado (confirmed/pending/requires-advisor) y fuente.
- `property.systems` con descripciones y scene links.
- `property.spaces` con tipo, secuencia y zona.
- `surroundings` completo: barrio, distancias, lifestyle, escuelas, golf, restaurantes, playas, transporte, cultura, shopping, parques, estacionalidad.
- 12 intents por propiedad (eran 4) con confidence, scene/space/doc links y follow-up.
- `interestSignals` por propiedad para detección automática.
- `qualification` con triggers progresivos.

**Analytics & Interest Engine (`analytics.js`):**
- Tracking de capítulos, escenas, espacios, concierge, docs, calculadora, film, enquiry.
- Detección de intereses acumulativa desde chat.
- Cualificación automática (3 preguntas / 2+ intereses / alta intención).
- `buildAdvisorSummary()` para handoff completo.
- `buildContextualEnquiry()` para texto contextual.
- Persistencia localStorage, sin llamadas externas.

**Concierge inteligente:**
- Respuestas enlazadas a escenas (clic → navega a la secuencia).
- Respuestas enlazadas a espacios (clic → abre overlay).
- Respuestas enlazadas a documentos (calculadora, docs).
- Badges de confianza para datos requires-advisor.
- Follow-up prompts por intent.
- Cualificación progresiva automática.
- Interest tags visibles en tiempo real.
- Descripciones de espacios desde knowledge base.

**Advisor Summary & Enquiry:**
- Resumen completo del visitante en el overlay de enquiry.
- Envío JSON estructurado si hay endpoint configurado.
- Fallback a mailto enriquecido.
- Payload con: propiedad, idioma, contacto, escenas, espacios, intereses, preguntas, calculadora, film, duración, cualificación.

**Mejoras visuales y mobile (V2.1):**
- Transiciones más suaves (cubic-bezier) en todos los overlays.
- Entrada escalonada de DNA bars.
- Space panel con animación de entrada independiente.
- Enquiry box con animación de entrada.
- Scrollbar estilizada en chat.
- Mobile completamente refinado: hero, sections, concierge, chat, overlays, enquiry, switcher.

---

## 4. Qué falta para la versión final

- fotografía y vídeo autorizados;
- Property Film final;
- microvídeos por espacio;
- motion design con assets reales;
- plano real interactivo;
- Property Concierge conectado a LLM (opcional, manteniendo knowledge pack como fuente de verdad);
- integración real de leads (endpoint);
- QA final con assets reales;
- dirección visual final.

---

## 5. Arquitectura narrativa

### M1558 Madrid

```text
The threshold → The light → The way you live
Morning light → The threshold → Golden hour → After dark
Private core → Living axis → City edge
```

### Villa Casia

```text
The arrival → The water → Your private retreat
First light → Gather → Golden hour → Night garden
Private retreat → Social heart → Open landscape
```

---

## 6. Property Concierge (V2)

El concierge es ahora una capa inteligente con:
- conocimiento profundo de propiedad y entorno;
- respuestas enlazadas a escenas, espacios y documentos;
- detección de intereses;
- cualificación progresiva;
- resumen automático para el asesor;
- envío estructurado de leads.

Fuera del piloto:
- avatar;
- voz;
- CRM;
- automatización total;
- lead scoring avanzado;
- cuentas de usuario;
- buyer rooms.

---

## 7. Modelo de sustitución de propiedad

Una propiedad = una carpeta + una línea en el registro. Sin tocar código.

```bash
cp -r properties/_template properties/mi-propiedad
# rellenar content.json, knowledge.json, assets.json
# añadir "mi-propiedad" a properties/index.json → order
node validate-content.js mi-propiedad
node build-pack.js
```

`app.js` no contiene ningún dato de una residencia concreta: ni copy, ni precios, ni nombres de espacios, ni capítulos de arrival. Todo llega por `property-loader.js` desde `properties/{slug}/`.

El validador distingue **issues** (rompen la experiencia) de **warnings** (funciona, pero no es final de demo: assets placeholder, datos sin confirmar por la agencia, copy en español ausente).

Detalle completo del procedimiento y de las reglas: `properties/README.md`.

No crear una aplicación nueva por propiedad.

---

## 8. Próximos bloques de trabajo

### Bloque A — Contenido y QA
- verificar todos los datos con agencias;
- añadir más intents (FAQ, uso estacional, transporte específico);
- test end-to-end del flujo concierge + qualification + summary;
- QA mobile final.

### Bloque B — Assets y experiencia visual
- integrar assets reales cuando se obtengan permisos;
- mejorar transiciones con assets reales;
- integrar plano real;
- refinar dirección visual final.

### Bloque C — Comercial
- conectar endpoint real para leads;
- preparar demo para agencias;
- definir dominio/subdominio de publicación;
- gestión de consentimiento para analytics.

---

## 9. Servidor

```bash
python -m http.server 4173
```

Sobre `http://` el loader lee los JSON de `properties/` directamente. Para compartir el prototipo como archivos sueltos (`file://`), ejecutar antes `node build-pack.js`: genera `property-pack.js`, que el loader usa como fallback offline y produce un render byte-idéntico.

---

## 10. Prompt para continuar

> Continúa el proyecto Larum Property Experience desde V2. Usa `PROJECT_HANDOFF.md` y `PROJECT_CONTROL.md` como fuentes principales. No repitas la visión ni hagas preguntas ya resueltas. El prototipo está en `prototype/` corriendo en puerto 4173. V2 tiene implementado: knowledge base avanzada, analytics, concierge inteligente con scene/space/doc links, interest detection, qualification progresiva, advisor summary, y mobile refinado. La prioridad ahora es verificar datos con agencias, obtener assets autorizados y preparar la demo comercial.
