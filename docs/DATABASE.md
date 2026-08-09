# Larum — base de datos

Estado tras el Milestone 2 de la Fase 1. Proyecto Supabase `mtyemgfovvmjrsxevcgh`.

Todo el esquema vive en `docs/migrations/`, en orden. Nada se aplica a mano:
si algo no está en un fichero de migración, no existe.

```
docs/migrations/
├── 001_phase1_schema.sql      entidades nuevas + claves foráneas + RLS
└── 002_seed_properties.sql    GENERADO por tools/generate-seed.js
```

Anteriores, ya aplicadas: `docs/supabase-fix-rls.sql` (políticas de la v2.1).

---

## Modelo

```
organizations ──┐
                └─► agents ──┐
                             └─► properties ◄─── entidad central
                                   │
        ┌──────────────┬───────────┼──────────────┬─────────────┐
        ▼              ▼           ▼              ▼             ▼
     audits         leads      sessions   analytics_events  concierge_
                                                            conversations
                                                                 │
                                                                 ▼
                                                          concierge_messages
```

---

## `properties` — las tres capas

| Capa | Columnas | Quién las escribe |
|---|---|---|
| **Relacional** | `id, organization_id, agent_id, slug, status, display_order, is_default, currency, created_at, updated_at, published_at` | El panel. Datos operativos que no existían en el contrato JSON |
| **JSONB** | `content, knowledge, assets` | El panel. **Forma idéntica** a `properties/{slug}/*.json`. El validador de `property-loader.js` sigue siendo válido sin cambios |
| **Generada** | `name_es, name_en, location, price, reference, cover_image, property_type` | Nadie: son de solo lectura, derivadas del JSONB por Postgres. No pueden desincronizarse del contenido que renderiza la experiencia |

Las columnas generadas usan `coalesce(campo->>'en', campo #>> '{}')`, lo que acepta **tanto el string heredado como el objeto `{es, en}`**. Ese detalle es lo que permite traducir las propiedades uno a uno sin migración de golpe.

### Ciclo de vida

```
draft ──► in_production ──► ready ──► published ──► archived
```

`published` es lo único que la anon key puede leer. Publicar es un `UPDATE`, nunca un despliegue.

---

## Políticas RLS

| Tabla | `anon` | `authenticated` |
|---|---|---|
| `properties` | SELECT solo `status='published'` | todo |
| `organizations`, `agents`, `audits` | nada | todo |
| `leads`, `sessions`, `analytics_events` | INSERT (+ UPDATE en sessions) | SELECT (+ UPDATE en leads) |
| `concierge_conversations` | INSERT, UPDATE | SELECT |
| `concierge_messages` | INSERT | SELECT |

**Esto es más estricto que antes, no menos.** Hoy `property-pack.js` sirve públicamente el `content` y el `knowledge` de **todas** las propiedades, publicadas o no, a cualquiera que abra el código fuente de la página.

**Vista previa de borradores (§28):** el panel abre la experiencia en el mismo origen, así que supabase-js encuentra la sesión del operador en localStorage y la política `authenticated all properties` deja renderizar un borrador con la experiencia real. Sin build de preview, sin tokens firmados.

---

## Compatibilidad hacia atrás

`leads`, `sessions` y `analytics_events` **conservan su columna de texto `property`** y se sigue escribiendo. La nueva `property_id` se rellena desde el slug. La columna de texto solo se retira cuando `property_id` esté verificada en producción — §34 del spec.

`ON DELETE SET NULL` en las tres, nunca CASCADE: borrar una propiedad no puede llevarse por delante un lead, que es una persona que pidió que la llamaran.

---

## Regenerar la semilla

```bash
npm run seed     # properties/ → docs/migrations/002_seed_properties.sql
```

Es idempotente (`ON CONFLICT DO UPDATE`): volver a ejecutarlo resincroniza cada propiedad desde su JSON. Verificado: los seis bloques JSONB embebidos hacen round-trip **idéntico** a los ficheros de origen.

Se genera SQL en vez de escribir directamente porque sembrar `properties` exige permiso de escritura sobre esa tabla, y la única clave que este proyecto tiene es la anon — que jamás debe poder escribir ahí. Emitir SQL deja el paso privilegiado donde corresponde, en el editor del operador, y hace la migración revisable **antes** de ejecutarse en vez de después.

---

## Cómo aplicar

1. Supabase → SQL Editor → pegar `001_phase1_schema.sql` → Run.
   Esperado: 9 filas, `properties` con 22 columnas.
2. Pegar `002_seed_properties.sql` → Run.
   Esperado: 2 propiedades `published`, `madrid` como `is_default`, y el desglose de filas de analítica que no se pudieron enlazar (solo slugs de prueba antiguos).
