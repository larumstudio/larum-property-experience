/* ── Larum Admin · Authorization UI Context (M6.2) ─────────────────
   Single source of truth for "what can the current role do in this
   UI". Modules call resolveCapabilities() ONCE in their own async
   render() (same pattern already established by M6.1's admin-analytics.js
   for its `role` variable), cache the returned object in a module-level
   variable, and read it synchronously from every subsequent draw()/
   toggle() — no repeated awaiting needed after the first resolve.

   This is UI-only. It exists so the interface never shows a control
   that RLS would reject — it grants no access itself. The real
   boundary stays entirely in Postgres RLS (Migration 006, unchanged by
   this file). Every key below has a direct RLS counterpart; see the
   comment on each.

   role comes from admin-core.js:getRole(), which fails OPEN to 'admin'
   on any query error (documented there — a display-only gate must
   never lock the one real admin out of their own dashboard over a
   transient hiccup). capabilitiesFor() itself fails CLOSED for any
   role not in the table below (null/unknown → the 'agent' row, the
   more restrictive one) — the two defaults serve different purposes
   and are not a contradiction: getRole()'s fail-open only protects the
   already-established single admin account from a network blip;
   capabilitiesFor()'s fail-closed protects against ANY future
   unrecognized role value being silently treated as fully privileged.
   ───────────────────────────────────────────────────────────────── */

import { getRole } from './admin-core.js';

const CAPABILITIES = {
  admin: {
    'nav.dashboard':   true,
    'nav.agentes':     true,   // agents table: no agent-role management policy
    'nav.propiedades': true,
    'nav.auditorias':  true,   // global audits list — admin-scoped by RLS anyway
    'nav.leads':       true,
    'nav.analytics':   true,

    'properties.create':       true,   // properties: no agent INSERT policy
    'properties.changeStatus': true,   // UI-conservative: RLS permits column-wise, gated anyway (see G.3)
    'properties.assignAgent':  true,   // UI-conservative, same reasoning
    'properties.setDefault':   true,   // UI-conservative, same reasoning

    'agents.manage': true,   // agents self-update only for agent role, no list/create
    'audits.write':  true,   // audits: no agent INSERT/UPDATE/DELETE policy

    'analytics.raw':     true,   // sessions / analytics_events: no agent SELECT policy (AE III v1 scope)
    'concierge.history': true    // concierge_conversations / concierge_messages: same scope decision
  },
  agent: {
    'nav.dashboard':   true,
    'nav.agentes':     false,
    'nav.propiedades': true,
    'nav.auditorias':  false,
    'nav.leads':       true,
    'nav.analytics':   true,

    'properties.create':       false,
    'properties.changeStatus': false,
    'properties.assignAgent':  false,
    'properties.setDefault':   false,

    'agents.manage': false,
    'audits.write':  false,

    'analytics.raw':     false,
    'concierge.history': false
  }
};

/* Plain object, not a Promise-returning per-check function — resolve
   once, read many times synchronously. */
export function capabilitiesFor(role) {
  return CAPABILITIES[role] || CAPABILITIES.agent;
}

export async function resolveCapabilities() {
  const role = await getRole();
  return capabilitiesFor(role);
}
