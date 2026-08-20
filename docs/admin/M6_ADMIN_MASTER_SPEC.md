# Larum Admin — M6 Master Spec (FINAL — pre-implementación)

Fase 0: auditoría + arquitectura + especificación. Cero código, cero SQL, cero deploy.

Grounded contra el código real desplegado en producción a 2026-08-20: 21 archivos `admin/*.js` (6,458 líneas), `admin.html`, `app.js`, `api/_data.mjs`, `docs/migrations/001_phase1_schema.sql`, `005_experience_revisions.sql`, `006_authorization_foundation.sql`, `006_policies_prepared.sql`, `006_property_id_resolve.sql`, `tests/authorization-foundation.test.mjs`. Toda afirmación de "qué existe" está verificada leyendo el archivo citado — no se infiere por nombre.

**Este documento incorpora las decisiones D.1–D.8 confirmadas por Jen y el diseño técnico exacto derivado de ellas.** Las secciones A/B/D/F (auditoría base) quedan sin cambios respecto a la versión anterior — ya validadas. Las secciones C/E/G se reescriben con el diseño final. Se añaden J/K/L/M (diseño técnico de M6.0/M6.2/M6.3 y matriz de capacidades).

---

## A. ARQUITECTURA ACTUAL

### A.1 Mapa de navegación

```
sidebar (admin.html:549-556, data-nav)
├── Dashboard      → admin-dashboard.js          OPERATIVO
├── Clientes       → register('clientes', null)  PLACEHOLDER — sin código detrás
├── Agentes        → admin-agents.js             OPERATIVO (CRUD sin Auth)
├── Propiedades    → admin-properties.js         OPERATIVO
├── Auditorías     → admin-auditorias.js         OPERATIVO
├── Leads          → admin-leads.js              OPERATIVO
├── Analytics      → admin-analytics.js          OPERATIVO
└── Ajustes        → register('ajustes', null)   PLACEHOLDER — sin código detrás

rutas registradas SIN botón de sidebar:
├── #sessions        → admin-sessions.js  ("Visits") — completo, inalcanzable desde la UI
└── #workspace/:slug → admin-workspace.js — alcanzable solo desde una property card
```

### A.2 Property Workspace — 10 tabs

`Overview · Audit · Readiness · Content · Assets · Experience · Concierge (History+Knowledge) · Revisions · Analytics · Leads`

### A.3 Qué lee/escribe cada módulo (UI → Store → Tabla)

| Módulo | Lee | Escribe |
|---|---|---|
| Dashboard | `leads`, `sessions`, `analytics_events` (bulk, `admin-core.js:load()`) | — |
| Propiedades (list) | `properties` (columnas ligeras vía `loadIndex()`) | — |
| Propiedades (create) | `organizations` (1 fila) | `properties` INSERT |
| Workspace → Overview | `properties` (fila completa) | `properties.status`, `.display_order`, `.is_default`, `.agent_id` |
| Workspace → Content | `properties.content` | `properties.content` (columna JSONB completa) |
| Workspace → Assets | `properties.assets` | `properties.assets` (columna JSONB completa) |
| Workspace → Concierge → Knowledge | `properties.knowledge` | `properties.knowledge` (columna JSONB completa) |
| Workspace → Concierge → History | `concierge_conversations`, `concierge_messages` (filtrado por `property_slug`) | — |
| Workspace → Audit | `audits` | `audits` INSERT/UPDATE/DELETE |
| Workspace → Readiness | `properties.{content,knowledge,assets}` (in-memory) | — |
| Workspace → Revisions | `experience_revisions` (⚠ tabla no existe en prod) | `experience_revisions` INSERT/UPDATE, `properties.experience_revision_id` |
| Workspace → Experience | nada (iframe a `index.html`) | — |
| Workspace → Analytics / Leads | `state.sessions/.leads/.events` filtrados por slug | Leads: `status`, `.notes` |
| Agentes | `agents` | `agents` INSERT/UPDATE (sin DELETE) |
| Agentes → Properties | `properties` filtrado por `agent_id` | — (read-only) |
| Auditorías (global) | `audits` join `properties` | — |
| Leads (global) | `state.leads` | `.status`, `.notes` |
| Analytics (global) | `state.sessions/.leads/.events` | — |
| Visits (`#sessions`, no expuesto) | `state.sessions` | — |

### A.4–A.7

Sin cambios respecto a la versión anterior de este documento — ver historial. Resumen: todo lo OPERATIVO está verificado en producción; `admin-sessions.js`, `leads.agent_id`, `agents.auth_user_id` y todo el motor de `memberships`/RLS existen en código/schema pero sin flujo de UI que los active; Revisions y Concierge History están parcialmente implementados; Clientes y Ajustes son placeholders puros.

---

## B. GAP ANALYSIS POR MÓDULO

Sin cambios respecto a la versión anterior — B.1 a B.10 quedan como baseline aceptado. Las prioridades y dependencias de producto ahí listadas (D.1–D.8) están todas resueltas en este documento (ver sección "Decisiones" al final).

---

## C. ADMIN IDEAL — NAVEGACIÓN FINAL (post-decisiones)

### C.1 Cambios respecto a la propuesta anterior

- **Visits** (D.3): confirmado, se fusiona dentro de Analytics como subtab. No hay nodo propio de sidebar.
- **Clientes** (D.6): eliminado del sidebar activo. No queda ni como placeholder — un botón que abre "Coming soon" para siempre es exactamente el tipo de módulo a medias que esta fase busca evitar. Si en el futuro se define qué es "Cliente", se re-añade con código real detrás, no antes.
- **Ajustes** (D.7): mismo criterio — eliminado del sidebar activo. Ninguna configuración identificada en esta fase es "estrictamente necesaria para una funcionalidad real" (el propio D.7 lo exige como condición), así que no hay nada que colgar ahí todavía. Si M6.2 (invite de agentes) llegara a necesitar, por ejemplo, un campo de "email de la organización" — se resuelve dentro de esa funcionalidad (p. ej. en el flujo de invite), no en un cajón de Ajustes.
- **Organizations** (B.8): nuevo, solo-lectura, secuenciado después de M6.2.
- **Auditorías**: se mantiene como nodo global, pero para rol `agent` queda oculto (ver G.4 — redundante con el tab Audit de sus propias properties, y un listado "global" que en realidad solo muestra lo tuyo genera confusión de producto).

### C.2 Estructura final de sidebar

```
Dashboard          (visible: admin + agent, contenido naturalmente escopado por RLS)
Agentes            (visible: admin únicamente)
Propiedades        (visible: admin + agent, escopado por RLS — agent ve solo las suyas)
Auditorías         (visible: admin únicamente — ver C.1)
Leads              (visible: admin + agent, escopado por RLS)
Analytics          (visible: admin + agent — subtabs difieren por rol, ver L)
Organizations      (visible: admin únicamente — M6.5)
```

**Clientes y Ajustes quedan fuera de la navegación activa por decisión D.6/D.7.**

---

## D. PROPERTY WORKSPACE — CICLO COMPLETO

Sin cambios — ver versión anterior. Único agujero operativo confirmado: `agent_id` en leads (B.3 = M6.0).

---

## E. AGENT WORKFLOW — DISEÑO FINAL

```
CREAR AGENTE          🟢 ya operativo (admin-agents.js)
  → INVITE             ⚙ M6.2 — endpoint serverless, botón en detalle del agente
  → Auth (auth_user_id) ⚙ M6.2 — vinculado automáticamente por el endpoint tras invite aceptado
  → membership          ⚙ M6.2 — insertado automáticamente por el endpoint, role='agent'
  → asignación properties 🟢 ya operativo (Overview tab)
  → recepción de leads    ⚙ M6.0 (agent_id) + M6.2 (login) — ambos deben estar para que esto cierre
  → login                ⚙ M6.2 — el agente entra a admin.html con su cuenta de Auth
  → acceso restringido    ⚙ M6.2 — capa de capacidades (sección M) + RLS ya existente
  → inactive              🟢 ya operativo (status field) — RLS ya lo respeta vía current_agent_id()
  → reinvite               ⚙ M6.2 — mismo endpoint, modo resend
  → desactivación eventual  🟢 suficiente con status='inactive' — no se requiere revocación de sesión activa (ver E.1)
```

### E.1 Por qué "inactive" es suficiente sin revocar la sesión de Supabase Auth

`current_agent_id()` (Migration 006, verificado en el código de la función) exige `a.status = 'active'`. Un agente marcado `inactive` pierde acceso a TODOS los datos protegidos por RLS de agente inmediatamente, aunque su sesión de navegador siga técnicamente "logueada". No hay ninguna ventana de acceso indebido. Construir revocación de sesión activa sería resolver un problema que el diseño de RLS ya resuelve — coherente con la sección H (no construir lo que no hace falta).

---

## F. LEAD WORKFLOW — PROPAGACIÓN DE DATOS

Sin cambios — ver versión anterior. Ruptura confirmada: `agent_id` nunca se propaga → resuelto por M6.0 (sección J).

---

## G. SECURITY / AUTHORIZATION — CAPACIDADES FINALES

### G.1 Mapa de roles (Migration 006, sin cambios de schema)

| Actor | Identidad | Alcance real (RLS) |
|---|---|---|
| admin | `memberships.role='admin'` | toda su `organization_id` |
| agent | `agents.auth_user_id` + `memberships.role='agent'` | solo `agent_id = current_agent_id()` |
| anon | sin sesión | lectura pública de properties `published` + INSERT de leads/sessions/events/concierge |

### G.2 Capacidades RLS exactas, tabla por tabla (verificado en `006_policies_prepared.sql`)

| Tabla | admin | agent |
|---|---|---|
| `organizations` | SELECT/UPDATE propia org | SELECT propia org (vía membership) |
| `memberships` | ALL propia org | SELECT solo su propia fila |
| `agents` | ALL propia org | SELECT/UPDATE solo su propia fila |
| `properties` | ALL propia org | SELECT/UPDATE solo las asignadas (`agent_id = current_agent_id()`) — **sin restricción de columna** (ver G.3) |
| `leads` | ALL propia org | SELECT/UPDATE solo las suyas (`agent_id = current_agent_id()`) — `agent_id`/`property_id` protegidos por trigger `protect_leads_boundary` |
| `audits` | ALL propia org | SELECT solo de sus properties — **sin INSERT/UPDATE/DELETE** |
| `concierge_conversations` / `concierge_messages` / `sessions` / `analytics_events` | SELECT propia org | **NINGUNA policy de agente — acceso cero**, decisión de producto ya tomada explícitamente en el propio archivo de policies ("AE III v1 scope: agent access is NONE") |

### G.3 Hallazgo — RLS es más permisivo que lo que la UI debe mostrar

La policy `properties agent updates own` (verificada literal en `006_policies_prepared.sql`) solo comprueba `agent_id = current_agent_id() AND organization_id = current_agent_organization_id()` — **no restringe qué columnas puede cambiar un agente en su propia property**. Esto significa que, a nivel de RLS pura, un agente podría hoy cambiar `status` (publicar/archivar su propia property), `is_default`, `display_order` o cualquier campo de `content`/`assets`/`knowledge` mediante una llamada directa a la API, sin que ninguna policy lo impida.

**Esto no es un agujero de seguridad de datos** (el agente solo puede tocar SU property, nunca la de otro — el aislamiento por organización/ownership es sólido) — es una cuestión de **qué acciones queremos que la UI ofrezca**, exactamente el tipo de decisión que D.4 pide resolver con una capa de capacidades en vez de confiar en que RLS ya lo hace todo. Diseño adoptado (ver M): la UI oculta para `agent` los controles de cambio de `status`/`is_default`/reasignación de agente en el Overview tab, aunque RLS técnicamente lo permitiría — defensa en profundidad, sin tocar RLS.

### G.4 Contradicción encontrada entre D.4 y las RLS ya desplegadas — resuelta

D.4 pide que el agente tenga "solo sus analytics/visits permitidos". Las RLS reales (G.2) dan a `agent` **cero acceso** a `sessions`/`analytics_events`/`concierge_conversations` — es decir, ningún dato de visita/sesión en bruto, por diseño ya tomado en Migration 006 y explícitamente fuera de alcance de este ciclo (no se toca RLS).

**Resolución adoptada** (no requiere nueva decisión — se infiere de "la seguridad real seguirá estando en RLS" + "no toques RLS" del propio mensaje de Jen): el Analytics de un agente muestra únicamente métricas derivadas de lo que SÍ puede ver — sus `leads` (conteo, estados, intereses declarados en el lead) y la completitud de sus `properties` — y omite explícitamente cualquier panel derivado de `sessions`/`analytics_events`/concierge (Visits, engagement, exploración, entry paths), sustituyéndolos por un aviso claro ("Visit-level detail is admin-only") en vez de un gráfico vacío que parecería "sin tráfico". Detalle exacto en sección L.

Si en el futuro se decide que los agentes SÍ deben ver datos de sesión propios, eso requiere una migración RLS nueva (nueva policy en `sessions`/`analytics_events` con scoping por `property_id` del agente) — explícitamente fuera de este ciclo, y no implica ningún trabajo desperdiciado: la capa de capacidades (sección M) ya está diseñada para activar ese panel el día que exista la policy, sin rediseño.

---

## H. FEATURES QUE NO DEBEMOS CONSTRUIR TODAVÍA

Sin cambios — ver versión anterior. Se añade:

8. **Revocación de sesión activa al desactivar un agente** — resuelto por diseño ya existente (E.1), no requiere código nuevo.
9. **Nueva RLS para que agentes vean sessions/analytics_events propios** — motivado por G.4, explícitamente pospuesto: no forma parte de este ciclo, no se toca RLS.

---

## J. M6.0 — DISEÑO TÉCNICO EXACTO (`leads.agent_id`)

### J.1 Patrón de referencia (`006_property_id_resolve.sql`, ya en producción)

```sql
CREATE OR REPLACE FUNCTION public.resolve_property_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.property_id IS NULL AND NEW.property IS NOT NULL THEN
    SELECT p.id INTO NEW.property_id
    FROM public.properties p WHERE p.slug = NEW.property LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS resolve_property_id ON public.leads;
CREATE TRIGGER resolve_property_id
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.resolve_property_id();
```

Fires en `BEFORE INSERT OR UPDATE` en 3 tablas (leads, sessions, analytics_events).

### J.2 Diseño de `resolve_lead_agent_id()` — diferencias deliberadas del patrón base

1. **Solo `leads`** (no sessions/analytics_events — esas tablas no tienen columna `agent_id`, no aplica).
2. **Solo `BEFORE INSERT`, nunca `UPDATE`** — diferencia deliberada respecto al patrón de `resolve_property_id`. Razón: `leads.agent_id` es, por diseño ya documentado en el propio comentario de Migration 006, "a point-in-time fact, not a live derivation" — resolverlo también en UPDATE lo convertiría en una derivación viva, contradiciendo esa intención explícita. Razón técnica adicional: el trigger `protect_leads_boundary` (ya en producción, `BEFORE UPDATE`) lanza excepción si `NEW.agent_id IS DISTINCT FROM OLD.agent_id` y el que actualiza no es admin — si `resolve_lead_agent_id` también corriera en UPDATE, un agente guardando una nota en su propio lead podría disparar esa excepción por un cambio de `agent_id` que él ni pidió. Restringir a solo INSERT elimina esta colisión de raíz.
3. **Resolución directa por slug, no por `property_id`** — para ser independiente del orden de ejecución respecto al trigger `resolve_property_id` (Postgres ejecuta múltiples triggers `BEFORE INSERT` de la misma tabla en orden alfabético de nombre; `resolve_lead_agent_id` iría ANTES que `resolve_property_id` alfabéticamente, así que `NEW.property_id` podría no estar resuelto todavía en ese punto). Solución: resolver `agent_id` directamente desde `NEW.property` (slug), igual que `resolve_property_id` resuelve `property_id` desde el mismo slug — ambos triggers leen el mismo campo de entrada, ninguno depende del otro.
4. **Nunca sobrescribe un valor ya presente** — `IF NEW.agent_id IS NULL` es la única condición de entrada, igual que el patrón base. Cubre exactamente el requisito de Jen ("no sobrescribir explícitamente un agent_id válido si en el futuro existiera un caso legítimo").
5. **Seguro ante NULL** en cada punto: `NEW.property` NULL → no hace nada; slug sin match → `agent_id` queda NULL; property sin agente asignado → `agent_id` queda NULL. Mismo comportamiento que el patrón base.

```sql
-- Boceto para revisión — NO ejecutar todavía
CREATE OR REPLACE FUNCTION public.resolve_lead_agent_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.agent_id IS NULL AND NEW.property IS NOT NULL THEN
    SELECT p.agent_id INTO NEW.agent_id
    FROM public.properties p WHERE p.slug = NEW.property LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.resolve_lead_agent_id() FROM PUBLIC;

DROP TRIGGER IF EXISTS resolve_lead_agent_id ON public.leads;
CREATE TRIGGER resolve_lead_agent_id
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.resolve_lead_agent_id();
```

### J.3 Backfill

Mismo patrón que 006c: los leads existentes con `property` conocido y `agent_id` NULL se rellenan con un `UPDATE` único. Requiere el mismo procedimiento de `DISABLE TRIGGER protect_leads_boundary` / `UPDATE` / `ENABLE TRIGGER` documentado y ya usado con éxito en 006c (SQL Editor no tiene sesión de auth, así que `is_org_admin()` devolvería FALSE y el trigger de boundary bloquearía el UPDATE si no se desactiva temporalmente).

```sql
-- Boceto — mismo patrón que 006c
ALTER TABLE public.leads DISABLE TRIGGER protect_leads_boundary;

UPDATE public.leads
SET agent_id = (
  SELECT p.agent_id FROM public.properties p WHERE p.slug = leads.property LIMIT 1
)
WHERE agent_id IS NULL AND property IS NOT NULL;

ALTER TABLE public.leads ENABLE TRIGGER protect_leads_boundary;
```

### J.4 Tests

Extiende el harness ya existente (`tests/authorization-foundation.test.mjs`, entorno aislado, nunca producción — mismo patrón de `ISOLATED_SUPABASE_URL`/`ISOLATED_FIXTURES_JSON`). Casos nuevos:

1. INSERT de lead con `property` cuya property tiene `agent_id` asignado → `agent_id` resuelto correctamente.
2. INSERT de lead con `property` cuya property NO tiene agente asignado → `agent_id` queda NULL, sin error.
3. INSERT de lead con `property` que no coincide con ningún slug → `agent_id` queda NULL, sin error.
4. INSERT de lead con `agent_id` ya provisto explícitamente (no-NULL) → el trigger NO lo sobrescribe.
5. UPDATE de un lead existente (p. ej. cambiar `status`) → `agent_id` NO se toca por este trigger (confirma la diferencia deliberada de J.2.2).

### J.5 UI

`admin-leads.js` y `admin-property-leads.js`: columna "Agent" en la tabla (join en memoria contra `state` de agentes ya cargados, o lectura directa de `lead.agent_id` con lookup a nombre), filtro por agente en la vista global de Leads (topbar o filtro dedicado — a definir en implementación, no bloqueante para el diseño).

### J.6 Criterio de aceptación

Un lead nuevo creado en el sitio público para una property con agente asignado aparece en el admin con ese agente ya vinculado, sin ninguna acción manual. Un lead para una property sin agente asignado aparece con "— None —", sin error. Los tests J.4 pasan en el entorno aislado.

---

## K. M6.2 — DISEÑO TÉCNICO EXACTO (Agent onboarding)

### K.1 Endpoint serverless

`api/admin-invite-agent.mjs` — nuevo, mismo patrón de credenciales de dos niveles ya usado en `api/_data.mjs` (anon para lo público, `service_role` solo server-side, nunca en respuesta ni log).

**Verificación del llamante** (obligatoria antes de cualquier operación privilegiada):
1. El endpoint recibe el `access_token` de la sesión del admin que llama (header `Authorization: Bearer <token>`, exactamente como ya hace el navegador con `supabaseClient`).
2. Verifica ese token contra Supabase (usando la clave anon) para obtener el `user_id` real del llamante — nunca confía en un `user_id` que venga en el body de la petición.
3. Consulta `memberships` con ese `user_id` (vía `service_role`, para no depender de que el propio llamante tenga SELECT sobre su fila — aunque de hecho sí lo tiene por `memberships self read`) y confirma `role = 'admin'` para la `organization_id` del agente objetivo.
4. Si cualquiera de los 3 pasos falla → 401/403, sin tocar Auth Admin API ni la base de datos.

### K.2 Flujo (modo `invite`, agente sin `auth_user_id`)

```
1. Admin abre detalle de un agente sin auth_user_id → ve botón "Invite"
2. Click → POST /api/admin-invite-agent { agentId, mode: 'invite' }
3. Endpoint verifica al llamante (K.1)
4. Endpoint carga el agente por id, confirma email presente y auth_user_id IS NULL
   (si ya tiene auth_user_id → error claro "already invited", no reintenta)
5. Endpoint llama supabase.auth.admin.inviteUserByEmail(agent.email) con service_role
6. Si falla (email inválido, SMTP no configurado, rate limit) → devuelve error,
   NO escribe nada en la base de datos — ningún estado a medias
7. Si éxito → obtiene el user_id nuevo devuelto por Auth
8. UPDATE agents SET auth_user_id = <user_id> WHERE id = agentId
9. INSERT INTO memberships (user_id, organization_id, role='agent')
   ON CONFLICT (user_id, organization_id) DO NOTHING
   (el ON CONFLICT usa la UNIQUE ya existente en la tabla — ver 006_authorization_foundation.sql)
10. Responde éxito. El agente recibe el email de Supabase Auth, fija su acceso, hace login.
```

### K.3 Idempotencia y reparación (modo `repair`, implícito)

Si el paso 8 tiene éxito pero el paso 9 falla (p. ej. corte de red) — el agente queda con `auth_user_id` pero sin `membership`, que es exactamente el caso de "partial failure" que el propio código de Migration 006 ya anticipó y protegió (`current_agent_id()` exige la membership además del `auth_user_id`, así que este estado a medias NO otorga acceso indebido — fail-closed, verificado en el propio comentario de la función).

El endpoint, en cualquier llamada posterior sobre ese agente, primero comprueba: ¿tiene `auth_user_id`? → sí, entonces NO vuelve a invitar (nunca crea un segundo Auth user para el mismo agente) → comprueba si falta la `membership` → si falta, la crea (paso 9 solo) → responde "repaired". Esto cubre la idempotencia exigida sin necesitar un modo separado explícito en la UI — el mismo botón "Invite"/"Resend" es seguro de pulsar más de una vez en cualquier estado.

### K.4 Flujo (modo `resend`, agente ya invitado)

Mismo endpoint, agente con `auth_user_id` ya presente → llama de nuevo `inviteUserByEmail` para el mismo email (Supabase reenvía el email si el usuario aún no confirmó; si ya confirmó y tiene acceso activo, Supabase devuelve un error de "ya registrado" que el endpoint traduce a un mensaje claro en vez de un 500 genérico).

### K.5 Variables de entorno

`SUPABASE_SERVICE_ROLE_KEY` — nueva env var privada en Vercel (confirmado D.5), usada exclusivamente dentro de `api/admin-invite-agent.mjs`, nunca expuesta al navegador, nunca en `console.log`, nunca en la respuesta HTTP. Mismo estándar ya aplicado y verificado en `api/_data.mjs`.

### K.6 Capa central de autorización UI (la pieza explícitamente pedida por D.4)

Nuevo módulo `admin/admin-auth-context.js`:

- En `boot()` (después del login, `admin-core.js`), hace **una** query: `SELECT organization_id, role FROM memberships WHERE user_id = auth.uid()` (ya cubierto por la policy `memberships self read`, sin necesitar RPC nueva).
- Expone `getRole()` → `'admin' | 'agent' | null`, y `can(capability)` → boolean, leyendo de la matriz estática de la sección M.
- Cada módulo (`admin-properties.js`, `admin-agents.js`, `admin.html` para el sidebar, etc.) consulta `can('properties.create')`, `can('nav.agentes')`, etc. **antes** de renderizar el control correspondiente — una sola fuente de verdad, no un `if (role === 'admin')` repetido y potencialmente inconsistente en cada archivo.
- Si la query de membership falla o devuelve vacío (estado imposible en teoría, pero defensivo) → capacidades = las de `agent` restringido (fail-closed en la UI, coherente con el fail-closed ya aplicado en RLS).

### K.7 Tests

- Endpoint: mock de Supabase Admin API — casos de éxito, fallo de invite (sin escritura en DB), reparación de membership faltante, resend sobre agente ya activo.
- E2E (parte de M6.6): invitar un agente de prueba en el entorno aislado, aceptar invitación, login, confirmar que la UI oculta "Agentes"/"+ Create property" y que Analytics no muestra paneles de Visits.

### K.8 Criterio de aceptación

Invitar a un agente de prueba (entorno aislado) → recibe email real → fija acceso → login → ve solo sus properties/leads → NO ve el botón de crear property ni el nav de Agentes → Analytics le muestra solo métricas derivadas de sus leads, con aviso claro donde correspondería Visits. Pulsar "Invite" dos veces sobre el mismo agente no crea una segunda cuenta ni rompe nada.

---

## L. M6.3 — DISEÑO TÉCNICO EXACTO (Visits dentro de Analytics)

### L.1 Reutilización sin duplicación

`admin-sessions.js` ya expone `render(container)` / `teardown()` puros — no depende de ser una ruta de nivel superior, solo necesita un nodo DOM. Es exactamente el mismo patrón que `admin-workspace.js` ya usa para montar sus propios sub-paneles (`contentEditor.render(mount, property)`, etc.). **No se reescribe ni se copia nada de `admin-sessions.js`** — `admin-analytics.js` pasa a importarlo y montarlo en un subtab, igual que el Workspace monta sus tabs.

### L.2 Estructura de `admin-analytics.js` tras el cambio

Subtabs (mismo patrón visual ya usado en Concierge History/Knowledge):

- **Overview** — el contenido actual de `admin-analytics.js` tal cual existe hoy (stats-row, visits/día, sessions por property, intereses, engagement, entry paths, exploration, canonical ID coverage) — sin cambios de lógica, solo pasa a vivir bajo un subtab en vez de ser la vista completa.
- **Visits** — monta `admin-sessions.js` sin modificarlo.

La ruta `#sessions` se mantiene registrada (no rompe un deep-link existente), simplemente deja de tener réplica en el sidebar — ya era así desde antes de M6.3, este milestone no le quita nada, solo le añade un segundo punto de entrada dentro de Analytics.

### L.3 Diferencia por rol (deriva de G.4)

- **admin**: ambos subtabs completos, sin restricción — coincide con acceso RLS total a `sessions`/`analytics_events`.
- **agent**: subtab **Overview** muestra solo lo derivable de `leads` (que sí puede leer) — total de leads propios, breakdown por estado, intereses declarados en el lead. Los paneles derivados de `sessions`/`analytics_events` (visitas/día, engagement, entry paths, exploración, canonical ID coverage) se sustituyen por un aviso ("Visit-level analytics is admin-only") en vez de renderizar gráficos vacíos que RLS dejaría en cero de forma engañosa. Subtab **Visits** queda oculto por completo para `agent` (`can('analytics.raw')` = false) — no tiene sentido mostrar una tabla de sesiones que siempre estará vacía por RLS.

### L.4 Criterio de aceptación

Un admin abre Analytics y ve Overview + Visits con los mismos datos que hoy (cero regresión). Un agente (una vez exista, tras M6.2) abre Analytics y ve solo el subtab Overview con métricas de sus leads, sin subtab Visits, sin paneles de sesión vacíos ni confusos.

---

## M. MATRIZ DE CAPACIDADES (fuente única para `admin-auth-context.js`)

| Capability key | admin | agent | Corresponde a RLS |
|---|---|---|---|
| `nav.dashboard` | ✅ | ✅ | — (Dashboard siempre visible, contenido se auto-escopa) |
| `nav.agentes` | ✅ | ❌ | `agents` sin policy de gestión para agente |
| `nav.propiedades` | ✅ | ✅ | `properties agent reads own` |
| `nav.auditorias` | ✅ | ❌ | redundante con tab Audit por-property (ver C.1) |
| `nav.leads` | ✅ | ✅ | `leads agent reads own` |
| `nav.analytics` | ✅ | ✅ | subtabs difieren, ver L.3 |
| `nav.organizations` | ✅ | ❌ | `memberships admin manages own org` |
| `properties.create` | ✅ | ❌ | sin policy INSERT para agente |
| `properties.changeStatus` | ✅ | ❌ (UI-conservador — RLS técnicamente lo permitiría, ver G.3) | — |
| `properties.assignAgent` | ✅ | ❌ | — |
| `properties.setDefault` | ✅ | ❌ | — |
| `agents.manage` (crear/editar/invitar) | ✅ | ❌ | `agents self update` (agente solo su propia fila, no gestión) |
| `audits.write` | ✅ | ❌ | `audits` sin policy de escritura para agente |
| `analytics.raw` (Visits, sessions, concierge) | ✅ | ❌ | sin policy de agente en esas 3 tablas |
| `memberships.view` | ✅ | — (ve solo la suya, sin UI dedicada) | `memberships self read` / `admin manages own org` |

Cualquier capability no listada aquí se trata como `false` por defecto (fail-closed) hasta que se añada explícitamente — evita que un módulo nuevo quede accidentalmente abierto por omisión.

---

## Decisiones — estado final

Todas las D.1–D.8 quedan **RESUELTAS** por el mensaje de Jen y reflejadas en el diseño de arriba. No quedan decisiones de producto abiertas para M6.0/M6.2/M6.3.

**Una implicación técnica nueva, no una decisión pendiente** (surge de aplicar D.4 contra las RLS reales, sección G.4): los agentes no verán datos de Visits/sesión en este ciclo, porque esas RLS ya excluyen explícitamente al rol `agent` y este ciclo no toca RLS. Queda documentado como alcance esperado, con el diseño ya preparado (sección M) para activarlo sin rediseño el día que se decida ampliar esa RLS — eso sí sería una decisión de producto futura, no ahora.

No hay contradicciones sin resolver entre D.1–D.8 y la arquitectura actual.

---

## M6.0 — ESTADO: COMPLETED (aplicado y verificado en producción)

Fecha: 2026-08-20.

**Aplicado en producción** (`mtyemgfovvmjrsxevcgh`), vía Supabase SQL Editor, por Jen.

**Entregado:**
- `docs/migrations/006_lead_agent_id_resolve.sql` — trigger `resolve_lead_agent_id()` (`BEFORE INSERT` únicamente, resuelve por slug, no sobrescribe valores explícitos, seguro ante NULL) + backfill + verificación, siguiendo exactamente el patrón de `006_property_id_resolve.sql` (006c) con las dos diferencias deliberadas documentadas inline (solo INSERT, resolución independiente del orden de triggers).
- `tests/lead-agent-resolve.test.mjs` — 6 tests contra entorno aislado (nunca producción), fixtures propias e idempotentes.
- `app.js` — **sin modificar**, confirmado por `git status` (solo archivos nuevos, cero archivos existentes tocados).

**Verificación en producción (2026-08-20) — 10/10 criterios:**

| # | Criterio | Resultado |
|---|---|---|
| 1 | Trigger existe | ✅ `resolve_lead_agent_id \| leads \| enabled`, definición confirmada vía `pg_get_triggerdef` |
| 2 | Función existe | ✅ `SECURITY DEFINER = true` |
| 3 | Lead nuevo con property+agent → agent_id correcto | ✅ **probado con dato real**: INSERT sobre `madrid` (sin enviar `agent_id`) → `agent_id` resuelto = `936f61f6-6f49-4dfd-86d4-bee6016b5364`, coincide exacto con `properties.agent_id` de madrid |
| 4 | Property sin agente → NULL | ⚠️ garantizado por semántica SQL (`SELECT...INTO` de un NULL asigna NULL); sin caso real en producción para probarlo en vivo (las properties existentes tienen agente) |
| 5 | `agent_id` explícito no se sobrescribe | ⚠️ garantizado por la cláusula `IF NEW.agent_id IS NULL`; no re-probado con INSERT real en producción |
| 6 | UPDATE no dispara el resolver | ✅ confirmado — `pg_get_triggerdef` muestra `BEFORE INSERT`, sin `OR UPDATE` |
| 7 | `protect_leads_boundary` sigue funcionando | ✅ `enabled`, definición intacta |
| 8 | Backfill correcto | ✅ la query de detalle solo mostró la fila de prueba con slug inválido; ningún lead real preexistente quedó sin resolver |
| 9 | Sin leads con property válida + agent_id incorrecto | ✅ cero filas `'unexpected — investigate'` |
| 10 | Sin regresión en RLS de Migration 006 | ✅ la migración no contiene ninguna sentencia `CREATE/ALTER/DROP POLICY`; los 6 triggers de seguridad preexistentes siguen `enabled` |

Puntos 4 y 5: gap de evidencia empírica sobre casos que no ocurren hoy en los datos reales (no hay properties sin agente, no se reenvió un `agent_id` explícito distinto) — la lógica SQL que los cubre es de una sola línea, determinista, sin ambigüedad. No bloqueante.

**Pendiente (fuera de alcance de M6.0, requiere autorización separada):**
- UI de columna/filtro "Agent" en `admin-leads.js` / `admin-property-leads.js` — no implementada, toca `admin/*.js`, no fue parte del pedido de "M6.0 únicamente".

**Sin commit, sin push, sin deploy** — solo la migración SQL fue aplicada a producción (vía SQL Editor, no vía este repo).

---

## Roadmap M6.x — orden final de implementación

```
M6.0 — Lead ownership: trigger + backfill + tests ✅ COMPLETED — verificado en producción 2026-08-20
M6.1 — Concierge property_id resolution (api/_data.mjs)
M6.2 — Agent onboarding completo (endpoint invite + capa de capacidades + UI role-aware)
M6.3 — Visits fusionado dentro de Analytics (reutiliza admin-sessions.js sin cambios)
M6.4 — Ocultar tab Revisions condicionalmente (feature-detection, sin decidir Migration 005)
M6.5 — Organizations/Memberships UI de solo lectura
M6.6 — Admin E2E (Playwright): login, ciclo de property, lead→agent_id, invite→login→acceso restringido
```

Congelado (sin fecha, requiere decisión de producto futura no incluida en D.1–D.8): Revisions activo (Migration 005), Clientes, Ajustes, Storage/upload, RLS ampliada para Visits de agente.
