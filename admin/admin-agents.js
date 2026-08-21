/* ── Larum Admin · Agentes ──────────────────────────────────────
   Admin Hardening Pass — fills the "Agentes" nav placeholder with a
   real module. No new entity: backed entirely by the existing
   `agents` table (migration 001 §2) and by `properties.agent_id`
   (already used for the assignment dropdown in admin-properties.js
   / admin-workspace.js, untouched by this file).

   List → Create → Detail (view/edit) → its assigned Properties.
   Same interaction pattern as admin-properties.js (inline create
   toggle, card grid) so an operator already familiar with Propiedades
   needs no new mental model here.
   ───────────────────────────────────────────────────────────── */

import { esc, cap } from './admin-core.js';
import { badge, emptyState, toast } from './admin-ui.js';
import {
  loadAllAgents, loadAgent, createAgent, updateAgent, loadPropertiesByAgent, inviteAgent, ConflictError
} from './admin-property-store.js';
import { navigate } from './admin-router.js';
import { resolveCapabilities } from './admin-auth-context.js';

export const title = 'Agentes';

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const STATUS_OPTS = ['active', 'inactive'];

let containerRef = null;
let mode = 'list';           // 'list' | 'create' | 'detail'
let agents = [];
let listError = null;
let saving = false;

let detailId = null;
let detailAgent = null;      // full row once loaded
let detailProperties = null; // null = loading, [] = loaded empty
let detailPropertiesError = null;
let editDraft = null;        // non-null while editing the open agent

let caps = null;             // resolved once per render() — see admin-auth-context.js
let inviting = false;

/* Every typed error code api/admin-invite-agent.mjs can return, mapped
   to something an admin can act on. Never echoes e.message raw — the
   endpoint's codes are deliberately terse identifiers, not sentences,
   and it never returns anything sensitive (no privileged credentials,
   no Auth internals) for this map to accidentally surface either way. */
const INVITE_ERROR_MESSAGES = {
  'Not authenticated': 'Your session has expired — sign in again and retry.',
  unauthenticated: 'Your session has expired — sign in again and retry.',
  method_not_allowed: 'Something went wrong sending this request. Reload the page and try again.',
  missing_agent_id: 'No agent selected. Reload the page and try again.',
  agent_not_found: 'This agent no longer exists.',
  not_org_admin: 'You do not have permission to manage this agent.',
  agent_missing_email: 'Add an email address above before inviting this agent.',
  invite_unconfigured: 'Invitations are not configured on this server yet.',
  already_registered_but_not_found: 'An account already exists for this email but could not be located automatically — check Supabase Auth directly.',
  invite_failed: 'Supabase could not send the invitation. Try again shortly.',
  auth_user_lookup_failed: 'Could not check this agent\'s account status. Try again shortly.',
  recovery_failed: 'Supabase could not send the password reset link. Try again shortly.',
  invite_processing_failed: 'Something went wrong processing this request. Try again shortly.'
};

export async function render(container) {
  containerRef = container;
  mode = 'list';
  caps = await resolveCapabilities();

  /* Agent management has no RLS policy for the agent role beyond
     reading/editing their own single row (agents self read/update) —
     loadAllAgents() would silently return just that one row rather
     than the intended management list. Refuse to even attempt it for
     a non-admin, matching "ocultar acciones que RLS no permite" rather
     than showing a misleadingly thin list. Direct-hash-nav guard: the
     sidebar already hides this item for agent, this is the second layer. */
  if (!caps['agents.manage']) {
    containerRef.innerHTML =
      '<div class="page-header"><h2>Agentes</h2></div>' +
      emptyState('Not available', 'Agent management is admin-only.');
    return;
  }

  await loadList();
}

export function teardown() {
  containerRef = null;
  mode = 'list';
  agents = [];
  listError = null;
  detailId = null;
  detailAgent = null;
  detailProperties = null;
  detailPropertiesError = null;
  editDraft = null;
  saving = false;
  caps = null;
  inviting = false;
  delete window.__agToggleCreate;
  delete window.__agCancelCreate;
  delete window.__agCreateSubmit;
  delete window.__agSlugify;
  delete window.__agOpenDetail;
  delete window.__agBackToList;
  delete window.__agEditToggle;
  delete window.__agInput;
  delete window.__agSaveEdit;
  delete window.__agCancelEdit;
  delete window.__agOpenPropertyWorkspace;
  delete window.__agInvite;
}

async function loadList() {
  containerRef.innerHTML = '<div class="page-header"><h2>Agentes</h2></div>' +
    '<div class="property-list-loading">Loading agents...</div>';
  try {
    agents = await loadAllAgents();
    listError = null;
  } catch (e) {
    listError = e.message;
    agents = [];
  }
  draw();
}

function draw() {
  if (!containerRef) return;
  if (mode === 'detail') { drawDetail(); return; }

  let html = '<div class="page-header">' +
    '<h2>Agentes</h2>' +
    '<div style="display:flex;gap:8px;align-items:center">' +
      '<span class="mono">' + agents.length + ' agents</span>' +
      '<button class="btn btn-primary" onclick="__agToggleCreate()">+ Create agent</button>' +
    '</div>' +
  '</div>';

  if (mode === 'create') html += renderCreateForm();

  if (listError) {
    html += emptyState('Could not load agents', listError);
  } else if (!agents.length && mode !== 'create') {
    html += emptyState('No agents yet', 'Click "+ Create agent" to add the first one.');
  } else if (agents.length) {
    html += '<div class="property-grid">' + agents.map(renderAgentCard).join('') + '</div>';
  }

  containerRef.innerHTML = html;
  bindGlobals();
}

function renderAgentCard(a) {
  const bio = a.bio || {};
  const hasBio = !!(bio.en || bio.es);
  return (
    '<div class="property-card" onclick="__agOpenDetail(\'' + esc(a.id) + '\')">' +
      '<div class="property-card-cover">' +
        (a.photo_url
          ? '<img src="' + esc(a.photo_url) + '" alt="' + esc(a.name) + '" loading="lazy" />'
          : '<div class="property-card-noimg">◈</div>') +
      '</div>' +
      '<div class="property-card-body">' +
        '<div class="property-card-top">' + badge(a.status || 'active') + '</div>' +
        '<div class="property-card-title">' + esc(a.name) + '</div>' +
        (a.agency ? '<div class="property-card-location">' + esc(a.agency) + '</div>' : '') +
        '<div class="property-card-meta">' +
          (a.role ? '<span>' + esc(a.role) + '</span>' : '') +
          (a.email ? '<span>' + esc(a.email) + '</span>' : '') +
        '</div>' +
        (!hasBio ? '<div class="mono" style="font-size:10px;color:var(--muted);margin-top:6px">No bio yet</div>' : '') +
      '</div>' +
    '</div>'
  );
}

/* ── Create ────────────────────────────────────────────────── */

function toggleCreate() {
  mode = mode === 'create' ? 'list' : 'create';
  draw();
}

function cancelCreate() {
  mode = 'list';
  draw();
}

function slugifyFromName() {
  const nameEl = document.getElementById('ag_name');
  const slugEl = document.getElementById('ag_slug');
  if (!nameEl || !slugEl || slugEl.dataset.touched === '1') return;
  slugEl.value = nameEl.value.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function renderCreateForm() {
  return (
    '<div class="card" style="margin-bottom:16px">' +
      '<div class="card-head"><h3>Create new agent</h3></div>' +
      '<div class="ce" style="padding:0">' +
        '<div class="ce-field">' +
          '<label class="ce-label" for="ag_name">Name *</label>' +
          '<input type="text" class="ce-input" id="ag_name" placeholder="Jane Smith" oninput="__agSlugify()" />' +
        '</div>' +
        '<div class="ce-field">' +
          '<label class="ce-label" for="ag_slug">Slug</label>' +
          '<input type="text" class="ce-input" id="ag_slug" placeholder="jane-smith" ' +
            'pattern="[a-z0-9]+(-[a-z0-9]+)*" oninput="this.dataset.touched=\'1\'" />' +
          '<div class="mono" style="font-size:10px;color:var(--muted);margin-top:2px">' +
            'Auto-filled from name — reserved for a future Agent page URL.</div>' +
        '</div>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
          '<div class="ce-field" style="flex:1;min-width:160px">' +
            '<label class="ce-label" for="ag_agency">Agency</label>' +
            '<input type="text" class="ce-input" id="ag_agency" placeholder="Christie&#39;s" />' +
          '</div>' +
          '<div class="ce-field" style="flex:1;min-width:160px">' +
            '<label class="ce-label" for="ag_role">Role</label>' +
            '<input type="text" class="ce-input" id="ag_role" placeholder="Senior Advisor" />' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
          '<div class="ce-field" style="flex:1;min-width:160px">' +
            '<label class="ce-label" for="ag_email">Email</label>' +
            '<input type="email" class="ce-input" id="ag_email" />' +
          '</div>' +
          '<div class="ce-field" style="flex:1;min-width:160px">' +
            '<label class="ce-label" for="ag_phone">Phone</label>' +
            '<input type="text" class="ce-input" id="ag_phone" />' +
          '</div>' +
        '</div>' +
        '<div class="ce-field">' +
          '<label class="ce-label" for="ag_photo">Photo URL</label>' +
          '<input type="url" class="ce-input" id="ag_photo" />' +
        '</div>' +
        '<div class="ce-field">' +
          '<label class="ce-label" for="ag_bio_en">Bio (EN)</label>' +
          '<textarea class="ce-textarea" id="ag_bio_en"></textarea>' +
        '</div>' +
        '<div class="ce-field">' +
          '<label class="ce-label" for="ag_bio_es">Bio (ES)</label>' +
          '<textarea class="ce-textarea" id="ag_bio_es"></textarea>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px">' +
          '<button class="btn btn-primary" id="ag_submit" onclick="__agCreateSubmit()"' +
            (saving ? ' disabled' : '') + '>' +
            (saving ? 'Creating...' : 'Create agent') +
          '</button>' +
          '<button class="btn btn-outline" onclick="__agCancelCreate()">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

async function handleCreateSubmit() {
  if (saving) return;

  const name = (document.getElementById('ag_name')?.value || '').trim();
  const slug = (document.getElementById('ag_slug')?.value || '').trim();

  if (!name) { toast('Name is required', 'error'); return; }
  if (slug && !SLUG_RE.test(slug)) { toast('Invalid slug: lowercase letters, numbers and hyphens only', 'error'); return; }
  if (slug && agents.find(a => a.slug === slug)) { toast('An agent with slug "' + slug + '" already exists', 'error'); return; }

  saving = true;
  const btn = document.getElementById('ag_submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

  try {
    const created = await createAgent({
      name,
      slug: slug || null,
      agency: (document.getElementById('ag_agency')?.value || '').trim(),
      role: (document.getElementById('ag_role')?.value || '').trim(),
      photoUrl: (document.getElementById('ag_photo')?.value || '').trim(),
      bioEn: (document.getElementById('ag_bio_en')?.value || '').trim(),
      bioEs: (document.getElementById('ag_bio_es')?.value || '').trim(),
      email: (document.getElementById('ag_email')?.value || '').trim(),
      phone: (document.getElementById('ag_phone')?.value || '').trim(),
      status: 'active'
    });

    toast('Agent "' + name + '" created', 'success');
    saving = false;
    mode = 'list';
    await loadList();
    openDetail(created.id);
  } catch (e) {
    saving = false;
    toast('Create failed: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Create agent'; }
  }
}

/* ── Detail (view / edit / properties) ────────────────────── */

async function openDetail(id) {
  mode = 'detail';
  detailId = id;
  detailAgent = agents.find(a => a.id === id) || null;
  detailProperties = null;
  detailPropertiesError = null;
  editDraft = null;
  draw();

  if (!detailAgent) {
    try { detailAgent = await loadAgent(id); } catch (e) { toast('Could not load agent: ' + e.message, 'error'); }
    draw();
  }

  try {
    detailProperties = await loadPropertiesByAgent(id);
  } catch (e) {
    detailPropertiesError = e.message;
  }
  draw();
}

function backToList() {
  mode = 'list';
  detailId = null;
  detailAgent = null;
  editDraft = null;
  draw();
}

function drawDetail() {
  if (!containerRef) return;

  if (!detailAgent) {
    containerRef.innerHTML = '<div class="page-header">' +
      '<button class="btn btn-outline" onclick="__agBackToList()">← Agentes</button>' +
    '</div>' + '<div class="property-list-loading">Loading agent...</div>';
    bindGlobals();
    return;
  }

  const a = detailAgent;
  const editing = !!editDraft;

  let html = '<div class="page-header">' +
    '<button class="btn btn-outline" onclick="__agBackToList()">← Agentes</button>' +
    '<h2>' + esc(a.name) + '</h2>' +
    ' ' + badge(a.status || 'active') +
  '</div>';

  html += '<div class="card">' +
    '<div class="card-head"><h3>Ficha del agente</h3>' +
    (!editing ? '<button class="btn btn-outline" onclick="__agEditToggle()">Edit</button>' : '') +
    '</div>';

  html += editing ? renderEditForm() : renderReadOnly(a);
  html += '</div>';

  html += renderAccessCard(a);
  html += renderPropertiesCard();

  containerRef.innerHTML = html;
  bindGlobals();
}

/* ── Access (M6.2 — invite / connection status) ──────────────────
   Reflects agents.auth_user_id directly (already loaded with the
   agent row) — no separate round-trip just to show status. The same
   button covers first invite AND repair: the server-side endpoint is
   idempotent and decides what actually needs to happen. */
function renderAccessCard(a) {
  const connected = !!a.auth_user_id;
  const inactive = a.status === 'inactive';

  let html = '<div class="card" style="margin-top:16px">' +
    '<div class="card-head"><h3>Access</h3></div>' +
    '<dl class="kv">' +
      '<dt>Status</dt><dd>' +
        (connected
          ? '<span class="badge badge-green">Connected</span>'
          : '<span class="badge badge-muted">No account yet</span>') +
      '</dd>' +
    '</dl>';

  /* An account existing is not the same as being able to use it —
     current_agent_id() in Migration 006 already fails closed on
     status='inactive' (RLS is the real boundary, unchanged here),
     so this is display-only: make sure "Connected" is never read as
     "this agent can currently do anything". */
  if (connected && inactive) {
    html += '<div class="mono" style="font-size:11px;color:var(--muted);margin-top:8px">' +
      'This agent is inactive — even though an account exists, they cannot access ' +
      'Larum Admin until reactivated (set Status to Active above).</div>';
  }

  if (!a.email) {
    html += '<div class="mono" style="font-size:11px;color:var(--muted);margin-top:8px">' +
      'Add an email address above before inviting this agent.</div>';
  } else {
    html += '<div style="margin-top:10px">' +
      '<button class="btn ' + (connected ? 'btn-outline' : 'btn-primary') + '" ' +
        'onclick="__agInvite()"' + (inviting ? ' disabled' : '') + '>' +
        (inviting ? 'Working…' : (connected ? 'Resend / repair access' : 'Invite to Larum Admin')) +
      '</button>' +
    '</div>';
  }

  html += '</div>';
  return html;
}

async function handleInvite() {
  if (inviting || !detailAgent) return;
  inviting = true;
  draw();

  try {
    const result = await inviteAgent(detailAgent.id);
    const messages = {
      invited: 'Invitation sent — the agent will receive an email.',
      repaired: 'An account already existed for this email — linked it.',
      resent: 'Invitation resent — the agent will receive a fresh email.',
      recovery_sent: 'Account already confirmed — sent a password reset link instead.'
    };
    toast(messages[result.outcome] || 'Done.', 'success');

    /* Refresh the row so the Access card reflects the real state —
       auth_user_id may have just been set for the first time. */
    const fresh = await loadAgent(detailAgent.id);
    if (fresh) {
      detailAgent = fresh;
      const idx = agents.findIndex(x => x.id === fresh.id);
      if (idx >= 0) agents[idx] = fresh;
    }
  } catch (e) {
    toast(INVITE_ERROR_MESSAGES[e.message] || ('Invite failed: ' + e.message), 'error');
  } finally {
    inviting = false;
    draw();
  }
}

function renderReadOnly(a) {
  const bio = a.bio || {};
  return (
    '<div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">' +
      '<div class="property-card-cover" style="width:120px;height:120px;border-radius:var(--radius-sm);flex-shrink:0">' +
        (a.photo_url
          ? '<img src="' + esc(a.photo_url) + '" alt="' + esc(a.name) + '" loading="lazy" />'
          : '<div class="property-card-noimg">◈</div>') +
      '</div>' +
      '<dl class="kv" style="flex:1;min-width:220px;margin:0">' +
        '<dt>Slug</dt><dd class="mono">' + esc(a.slug || '—') + '</dd>' +
        '<dt>Agency</dt><dd>' + esc(a.agency || '—') + '</dd>' +
        '<dt>Role</dt><dd>' + esc(a.role || '—') + '</dd>' +
        '<dt>Email</dt><dd>' + esc(a.email || '—') + '</dd>' +
        '<dt>Phone</dt><dd>' + esc(a.phone || '—') + '</dd>' +
      '</dl>' +
    '</div>' +
    '<div class="ce-subsec" style="margin-top:14px"><div class="ce-subsec-label mono">Bio (EN)</div></div>' +
    '<div class="ce-readonly" style="white-space:pre-wrap">' + esc(bio.en || '—') + '</div>' +
    '<div class="ce-subsec" style="margin-top:10px"><div class="ce-subsec-label mono">Bio (ES)</div></div>' +
    '<div class="ce-readonly" style="white-space:pre-wrap">' + esc(bio.es || '—') + '</div>'
  );
}

function toggleEdit() {
  editDraft = JSON.parse(JSON.stringify(detailAgent));
  if (!editDraft.bio) editDraft.bio = { en: '', es: '' };
  draw();
}

function cancelEdit() {
  editDraft = null;
  draw();
}

function handleEditInput(path, value) {
  if (!editDraft) return;
  const parts = path.split('.');
  let cur = editDraft;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function renderEditForm() {
  const a = editDraft;
  const bio = a.bio || {};
  return (
    '<div class="ce" style="padding:0">' +
      efield('name', 'Name', a.name || '') +
      efield('slug', 'Slug', a.slug || '') +
      efield('agency', 'Agency', a.agency || '') +
      efield('role', 'Role', a.role || '') +
      efield('email', 'Email', a.email || '') +
      efield('phone', 'Phone', a.phone || '') +
      efield('photo_url', 'Photo URL', a.photo_url || '') +
      eselect('status', 'Status', a.status || 'active') +
      etextarea('bio.en', 'Bio (EN)', bio.en || '') +
      etextarea('bio.es', 'Bio (ES)', bio.es || '') +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
        '<button class="btn btn-primary" onclick="__agSaveEdit()"' + (saving ? ' disabled' : '') + '>' +
          (saving ? 'Saving...' : 'Save changes') +
        '</button>' +
        '<button class="btn btn-outline" onclick="__agCancelEdit()">Cancel</button>' +
      '</div>' +
    '</div>'
  );
}

function efield(path, label, value) {
  const id = 'agf_' + path.replace(/\./g, '_');
  return '<div class="ce-field">' +
    '<label class="ce-label" for="' + id + '">' + esc(label) + '</label>' +
    '<input type="text" class="ce-input" id="' + id + '" value="' + esc(value) + '"' +
    ' oninput="__agInput(\'' + path.replace(/'/g, "\\'") + '\',this.value)" />' +
  '</div>';
}

function etextarea(path, label, value) {
  const id = 'agf_' + path.replace(/\./g, '_');
  return '<div class="ce-field">' +
    '<label class="ce-label" for="' + id + '">' + esc(label) + '</label>' +
    '<textarea class="ce-textarea" id="' + id + '"' +
    ' oninput="__agInput(\'' + path.replace(/'/g, "\\'") + '\',this.value)">' + esc(value) + '</textarea>' +
  '</div>';
}

function eselect(path, label, value) {
  const id = 'agf_' + path.replace(/\./g, '_');
  return '<div class="ce-field">' +
    '<label class="ce-label" for="' + id + '">' + esc(label) + '</label>' +
    '<select class="ce-input" id="' + id + '" onchange="__agInput(\'' + path + '\',this.value)">' +
      STATUS_OPTS.map(o => '<option value="' + o + '"' + (o === value ? ' selected' : '') + '>' + cap(o) + '</option>').join('') +
    '</select>' +
  '</div>';
}

async function saveEdit() {
  if (!editDraft || saving) return;

  const name = (editDraft.name || '').trim();
  if (!name) { toast('Name is required', 'error'); return; }
  const slug = (editDraft.slug || '').trim();
  if (slug && !SLUG_RE.test(slug)) { toast('Invalid slug: lowercase letters, numbers and hyphens only', 'error'); return; }
  if (slug && agents.find(a => a.slug === slug && a.id !== editDraft.id)) {
    toast('An agent with that slug already exists', 'error');
    return;
  }

  saving = true;
  draw();

  try {
    const patch = {
      name,
      slug: slug || null,
      agency: (editDraft.agency || '').trim() || null,
      role: (editDraft.role || '').trim() || null,
      email: (editDraft.email || '').trim() || null,
      phone: (editDraft.phone || '').trim() || null,
      photo_url: (editDraft.photo_url || '').trim() || null,
      bio: { en: editDraft.bio?.en || '', es: editDraft.bio?.es || '' },
      status: editDraft.status || 'active'
    };
    /* M6.6b — same reasoning as M6.5a: read updated_at fresh from
       detailAgent (the shared loaded row) right at save time. */
    const newUpdatedAt = await updateAgent(editDraft.id, patch, detailAgent?.updated_at);

    Object.assign(detailAgent, patch);
    detailAgent.updated_at = newUpdatedAt;
    const idxA = agents.findIndex(x => x.id === detailAgent.id);
    if (idxA >= 0) { Object.assign(agents[idxA], patch); agents[idxA].updated_at = newUpdatedAt; }

    toast('Agent saved', 'success');
    editDraft = null;
  } catch (e) {
    toast(e instanceof ConflictError ? e.message : 'Save failed: ' + e.message, 'error');
  } finally {
    saving = false;
    draw();
  }
}

/* ── Agent → Properties (Phase C, read-only) ─────────────── */

function renderPropertiesCard() {
  let html = '<div class="card" style="margin-top:16px">' +
    '<div class="card-head"><h3>Properties</h3>' +
    (Array.isArray(detailProperties) ? '<span class="mono">' + detailProperties.length + '</span>' : '') +
    '</div>';

  if (detailPropertiesError) {
    html += emptyState('Could not load properties', detailPropertiesError);
  } else if (detailProperties === null) {
    html += '<div class="property-list-loading">Loading properties...</div>';
  } else if (!detailProperties.length) {
    html += emptyState('No properties assigned', 'Assign this agent from a property\'s Workspace → Overview tab.');
  } else {
    html += '<div class="table-wrap"><table><thead><tr>' +
      '<th>Property</th><th>Location</th><th>Status</th><th></th>' +
    '</tr></thead><tbody>' +
      detailProperties.map(p => {
        const label = p.name_es || p.name_en || p.slug;
        return '<tr>' +
          '<td>' + esc(label) + '</td>' +
          '<td>' + esc(p.location || '—') + '</td>' +
          '<td>' + badge(p.status || 'draft') + '</td>' +
          '<td><button class="btn btn-outline" style="font-size:11px;padding:2px 8px" ' +
            'onclick="__agOpenPropertyWorkspace(\'' + esc(p.slug) + '\')">Open workspace →</button></td>' +
        '</tr>';
      }).join('') +
    '</tbody></table></div>';
  }

  html += '</div>';
  return html;
}

function openPropertyWorkspace(slug) {
  navigate('workspace', slug);
}

/* ── Bind window handlers (this module follows the older,
   window-global event pattern already used by admin-properties.js /
   admin-workspace.js — not the newer local-delegation pattern used by
   admin-knowledge-editor.js. Consistent with its closest sibling. */
function bindGlobals() {
  window.__agToggleCreate = toggleCreate;
  window.__agCancelCreate = cancelCreate;
  window.__agCreateSubmit = handleCreateSubmit;
  window.__agSlugify = slugifyFromName;
  window.__agOpenDetail = openDetail;
  window.__agBackToList = backToList;
  window.__agEditToggle = toggleEdit;
  window.__agInput = handleEditInput;
  window.__agSaveEdit = saveEdit;
  window.__agCancelEdit = cancelEdit;
  window.__agOpenPropertyWorkspace = openPropertyWorkspace;
  window.__agInvite = handleInvite;
}
