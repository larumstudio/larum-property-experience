/* ── Larum Admin · Property Workspace ──────────────────────────
   The central multi-tab view for a single property. Lazy-loads
   the full property payload (content, knowledge, assets) on
   entry and caches it for instant switching.
   ───────────────────────────────────────────────────────────── */

import { esc, cap } from './admin-core.js';
import { tabs, emptyState, badge, toast } from './admin-ui.js';
import { loadProperty, getCached, getPropertyLabel, savePropertyStatus, savePropertyMeta, loadAgents, loadRevisions, createRevision, publishRevision, rollback } from './admin-property-store.js';
import { resolveCapabilities } from './admin-auth-context.js';
import * as contentEditor from './admin-content-editor.js';
import * as assetsEditor from './admin-assets-editor.js';
import * as experiencePreview from './admin-experience-preview.js';
import * as conciergePanel from './admin-concierge-panel.js';
import * as auditPanel from './admin-audit-panel.js';
import * as readinessPanel from './admin-readiness-panel.js';
import * as propertyAnalytics from './admin-property-analytics.js';
import * as propertyLeads from './admin-property-leads.js';

export const title = 'Property';

const TABS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'audit',      label: 'Audit' },
  { id: 'readiness',  label: 'Readiness' },
  { id: 'content',    label: 'Content' },
  { id: 'assets',     label: 'Assets' },
  { id: 'experience', label: 'Experience' },
  { id: 'concierge',  label: 'Concierge' },
  { id: 'revisions',  label: 'Revisions' },
  { id: 'analytics',  label: 'Analytics' },
  { id: 'leads',      label: 'Leads' }
];

const STATUS_TRANSITIONS = {
  draft:         ['in_production'],
  in_production: ['ready', 'draft'],
  ready:         ['published', 'in_production'],
  published:     ['archived'],
  archived:      ['draft']
};
const CONFIRM_STATUSES = new Set(['published', 'archived']);

let activeTab = 'overview';
let currentSlug = null;
let currentProperty = null;
let containerRef = null;
let agents = [];
let agentsLoaded = false;
let savingMeta = false;
let savingStatus = false;
let pendingStatus = null;
let caps = null; // resolved once per render() — see admin-auth-context.js

export async function render(container, params) {
  containerRef = container;
  currentSlug = params || null;
  activeTab = 'overview';
  currentProperty = null;
  caps = await resolveCapabilities();

  if (!currentSlug) {
    container.innerHTML = emptyState('No property selected', 'Navigate to Propiedades and select a property.');
    return;
  }

  const cached = getCached(currentSlug);
  if (cached) {
    currentProperty = cached;
    draw();
    return;
  }

  container.innerHTML =
    '<div class="page-header">' +
      '<h2>' + esc(slugToName(currentSlug)) + '</h2>' +
      '<span class="mono">' + esc(currentSlug) + '</span>' +
    '</div>' +
    '<div class="property-list-loading">Loading property data...</div>';

  try {
    currentProperty = await loadProperty(currentSlug);
    if (!currentProperty) {
      container.innerHTML =
        '<div class="page-header"><h2>' + esc(slugToName(currentSlug)) + '</h2></div>' +
        emptyState('Property not found', 'The property "' + currentSlug + '" does not exist in the database.');
      return;
    }
    draw();
  } catch (e) {
    container.innerHTML =
      '<div class="page-header"><h2>' + esc(slugToName(currentSlug)) + '</h2></div>' +
      emptyState('Could not load property', e.message);
  }
}

function draw() {
  if (!containerRef || !currentProperty) return;

  const label = getPropertyLabel(currentProperty);
  const status = currentProperty.status || 'draft';

  containerRef.innerHTML =
    '<div class="page-header">' +
      '<h2>' + esc(label) + '</h2>' +
      '<span class="mono">' + esc(currentSlug) + '</span>' +
      ' ' + badge(status) +
    '</div>' +
    tabs(TABS, activeTab, 'onclick="__workspaceTab(this.dataset.tab)"') +
    '<div id="workspaceContent" class="workspace-content">' +
      renderTab(activeTab) +
    '</div>';

  window.__workspaceTab = switchTab;
  window.__wsChangeStatus = handleStatusChange;
  window.__wsConfirmStatus = confirmStatusChange;
  window.__wsCancelStatus = cancelStatusChange;
  window.__wsSaveMeta = handleSaveMeta;

  if (activeTab === 'overview' && currentProperty) {
    ensureAgentsLoaded();
  }

  if (activeTab === 'content' && currentProperty) {
    const mount = document.getElementById('contentEditorMount');
    if (mount) contentEditor.render(mount, currentProperty);
  }

  if (activeTab === 'assets' && currentProperty) {
    const mount = document.getElementById('assetsEditorMount');
    if (mount) assetsEditor.render(mount, currentProperty);
  }

  if (activeTab === 'experience' && currentProperty) {
    const mount = document.getElementById('experiencePreviewMount');
    if (mount) experiencePreview.render(mount, currentProperty);
  }

  if (activeTab === 'audit' && currentProperty) {
    const mount = document.getElementById('auditPanelMount');
    if (mount) auditPanel.render(mount, currentProperty);
  }

  if (activeTab === 'readiness' && currentProperty) {
    const mount = document.getElementById('readinessPanelMount');
    if (mount) readinessPanel.render(mount, currentProperty);
  }

  if (activeTab === 'concierge' && currentProperty) {
    const mount = document.getElementById('conciergePanelMount');
    if (mount) conciergePanel.render(mount, currentProperty);
  }

  if (activeTab === 'revisions' && currentProperty) {
    const mount = document.getElementById('revisionsPanelMount');
    if (mount) renderRevisionsPanel(mount);
  }

  if (activeTab === 'analytics' && currentProperty) {
    const mount = document.getElementById('propertyAnalyticsMount');
    if (mount) propertyAnalytics.render(mount, currentProperty);
  }

  if (activeTab === 'leads' && currentProperty) {
    const mount = document.getElementById('propertyLeadsMount');
    if (mount) propertyLeads.render(mount, currentProperty);
  }
}

function switchTab(tabId) {
  activeTab = tabId;
  draw();
}

function renderTab(id) {
  switch (id) {
    case 'overview':
      return renderOverview();
    case 'audit':
      return '<div id="auditPanelMount"></div>';
    case 'readiness':
      return '<div id="readinessPanelMount"></div>';
    case 'content':
      return '<div id="contentEditorMount"></div>';
    case 'assets':
      return '<div id="assetsEditorMount"></div>';
    case 'experience':
      return '<div id="experiencePreviewMount"></div>';
    case 'concierge':
      return '<div id="conciergePanelMount"></div>';
    case 'revisions':
      return '<div id="revisionsPanelMount"></div>';
    case 'analytics':
      return '<div id="propertyAnalyticsMount"></div>';
    case 'leads':
      return '<div id="propertyLeadsMount"></div>';
    default:
      return emptyState('Unknown tab', '');
  }
}

function renderOverview() {
  if (!currentProperty) {
    return emptyState('Property Overview', 'Loading...');
  }

  const p = currentProperty;
  const c = p.content || {};
  const status = p.status || 'draft';
  const label = getPropertyLabel(p);
  const cover = p.cover_image;
  const completeness = computeCompleteness(c);

  let html = '<div class="overview-grid">';

  html += '<div class="card">' +
    '<div class="card-head"><h3>Property summary</h3></div>' +
    '<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">' +
      '<div class="property-card-cover" style="width:140px;height:96px;border-radius:var(--radius-sm);flex-shrink:0">' +
        (cover
          ? '<img src="' + esc(cover) + '" alt="' + esc(label) + '" loading="lazy" />'
          : '<div class="property-card-noimg">◇</div>') +
      '</div>' +
      '<dl class="kv" style="flex:1;min-width:220px;margin:0">' +
        '<dt>Label</dt><dd>' + esc(label) + '</dd>' +
        '<dt>Slug</dt><dd class="mono">' + esc(currentSlug) + '</dd>' +
        '<dt>Status</dt><dd>' + badge(status) + '</dd>' +
        (p.reference ? '<dt>Reference</dt><dd class="mono">' + esc(p.reference) + '</dd>' : '') +
        (c.brand ? '<dt>Brand</dt><dd>' + esc(c.brand) + '</dd>' : '') +
        (c.shortRef ? '<dt>Short ref</dt><dd class="mono">' + esc(c.shortRef) + '</dd>' : '') +
        (c.referencePrice ? '<dt>Reference price</dt><dd>' + esc(formatPrice(c.referencePrice)) + '</dd>' : '') +
        (c.defaultRegion ? '<dt>Region</dt><dd>' + esc(c.defaultRegion) + '</dd>' : '') +
        (c.defaultPropertyType ? '<dt>Type</dt><dd>' + esc(c.defaultPropertyType) + '</dd>' : '') +
      '</dl>' +
    '</div>' +
  '</div>';

  html += '<div class="card">' +
    '<div class="card-head"><h3>Data completeness</h3></div>' +
    '<dl class="kv">' +
      completeness.map(row =>
        '<dt>' + esc(row.label) + '</dt>' +
        '<dd>' + esc(row.value) +
          (row.hint ? ' <span class="mono" style="color:var(--muted);font-size:11px"> · ' + esc(row.hint) + '</span>' : '') +
        '</dd>'
      ).join('') +
    '</dl>' +
  '</div>';

  html += '</div>';

  html += renderManagementCard(p, status);

  html += '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">' +
    '<button class="btn btn-outline" onclick="__workspaceTab(\'content\')">Edit content →</button>' +
    '<button class="btn btn-outline" onclick="__workspaceTab(\'assets\')">Assets →</button>' +
    '<button class="btn btn-outline" onclick="__workspaceTab(\'concierge\')">Concierge →</button>' +
  '</div>';

  html += '<div class="mono" style="display:flex;gap:20px;flex-wrap:wrap;margin-top:16px;padding-top:12px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)">' +
    (p.created_at   ? '<span>Created ' + esc(formatDate(p.created_at)) + '</span>' : '') +
    (p.updated_at   ? '<span>Updated ' + esc(formatDate(p.updated_at)) + '</span>' : '') +
    (p.published_at ? '<span>Published ' + esc(formatDate(p.published_at)) + '</span>' : '<span>Not published</span>') +
  '</div>';

  return html;
}

/* M6.2: status transitions, "Is default" and the agent-reassignment
   select are UI-conservative — deliberately hidden for the agent role
   even though the underlying RLS UPDATE policy ("properties agent
   updates own") does not itself restrict which columns change, only
   that agent_id/organization_id stay pinned to the caller's own. That
   RLS permissiveness is fine at the data layer; it does not mean the
   UI should offer publish/archive or reassignment as agent actions.
   Display order stays editable for everyone — it only affects sort
   order of the agent's own listing, nothing administrative. */
function renderManagementCard(p, status) {
  const transitions = STATUS_TRANSITIONS[status] || [];
  const canChangeStatus = !!(caps && caps['properties.changeStatus']);
  const canSetDefault   = !!(caps && caps['properties.setDefault']);
  const canAssignAgent  = !!(caps && caps['properties.assignAgent']);

  let html = '<div class="card" style="margin-top:16px">' +
    '<div class="card-head"><h3>Property management</h3></div>' +
    '<div class="ce" style="padding:0">';

  html += '<div class="ce-field">' +
    '<label class="ce-label">Status</label>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
      badge(status);

  if (!canChangeStatus) {
    /* No buttons at all — read-only badge above is the whole story. */
  } else if (pendingStatus && CONFIRM_STATUSES.has(pendingStatus)) {
    const action = pendingStatus === 'published' ? 'Publish' : 'Archive';
    html += '<span style="margin-left:8px;color:var(--orange);font-size:13px">' +
      esc(action) + ' this property?' +
    '</span>' +
    '<button class="btn btn-primary" onclick="__wsConfirmStatus()" ' +
      (savingStatus ? 'disabled' : '') + '>' +
      (savingStatus ? 'Saving...' : 'Confirm ' + action.toLowerCase()) +
    '</button>' +
    '<button class="btn btn-outline" onclick="__wsCancelStatus()">Cancel</button>';
  } else if (transitions.length) {
    transitions.forEach(function(target) {
      const label = statusActionLabel(status, target);
      html += '<button class="btn btn-outline" onclick="__wsChangeStatus(\'' + esc(target) + '\')" ' +
        (savingStatus ? 'disabled' : '') + '>' + esc(label) + '</button>';
    });
  }

  html += '</div></div>';

  html += '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
    '<div class="ce-field" style="flex:1;min-width:120px;max-width:180px">' +
      '<label class="ce-label" for="ws_order">Display order</label>' +
      '<input type="number" class="ce-input" id="ws_order" min="0" step="1" ' +
        'value="' + (p.display_order ?? 0) + '" />' +
    '</div>' +
    (canSetDefault
      ? '<div class="ce-field" style="flex:0;min-width:140px">' +
          '<label class="ce-label" style="display:block;margin-bottom:8px">Default property</label>' +
          '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">' +
            '<input type="checkbox" id="ws_default" ' + (p.is_default ? 'checked' : '') + ' /> ' +
            'Is default' +
          '</label>' +
        '</div>'
      : '') +
  '</div>';

  if (canAssignAgent) {
    const agentOpts = agents.map(function(a) {
      const sel = a.id === p.agent_id ? ' selected' : '';
      return '<option value="' + esc(a.id) + '"' + sel + '>' +
        esc(a.name) + (a.agency ? ' (' + esc(a.agency) + ')' : '') +
      '</option>';
    }).join('');

    html += '<div class="ce-field">' +
      '<label class="ce-label" for="ws_agent">Agent</label>' +
      '<select class="ce-input" id="ws_agent">' +
        '<option value=""' + (!p.agent_id ? ' selected' : '') + '>— None —</option>' +
        agentOpts +
      '</select>' +
    '</div>';
  }

  html += '<div style="margin-top:12px">' +
    '<button class="btn btn-primary" onclick="__wsSaveMeta()" ' +
      (savingMeta ? 'disabled' : '') + '>' +
      (savingMeta ? 'Saving...' : 'Save metadata') +
    '</button>' +
  '</div>';

  html += '</div></div>';
  return html;
}

function statusActionLabel(current, target) {
  if (target === 'draft' && current === 'archived') return 'Reopen as draft';
  if (target === 'draft') return 'Back to draft';
  if (target === 'in_production' && current === 'ready') return 'Back to production';
  if (target === 'in_production') return 'Start production';
  if (target === 'ready') return 'Mark ready';
  if (target === 'published') return 'Publish';
  if (target === 'archived') return 'Archive';
  return cap(target.replace(/_/g, ' '));
}

async function handleStatusChange(target) {
  if (savingStatus || !currentSlug) return;
  if (!caps || !caps['properties.changeStatus']) return; // defense in depth — button isn't rendered either

  if (CONFIRM_STATUSES.has(target)) {
    pendingStatus = target;
    draw();
    return;
  }

  savingStatus = true;
  draw();

  try {
    await savePropertyStatus(currentSlug, target);
    currentProperty.status = target;
    toast('Status changed to ' + target.replace(/_/g, ' '), 'success');
  } catch (e) {
    toast('Status update failed: ' + e.message, 'error');
  } finally {
    savingStatus = false;
    pendingStatus = null;
    draw();
  }
}

async function confirmStatusChange() {
  if (!pendingStatus || savingStatus || !currentSlug) return;

  savingStatus = true;
  draw();

  try {
    await savePropertyStatus(currentSlug, pendingStatus);
    currentProperty.status = pendingStatus;
    toast('Status changed to ' + pendingStatus.replace(/_/g, ' '), 'success');
  } catch (e) {
    toast('Status update failed: ' + e.message, 'error');
  } finally {
    savingStatus = false;
    pendingStatus = null;
    draw();
  }
}

function cancelStatusChange() {
  pendingStatus = null;
  draw();
}

async function handleSaveMeta() {
  if (savingMeta || !currentSlug) return;

  const displayOrder = parseInt(document.getElementById('ws_order')?.value, 10);
  const patch = { display_order: isNaN(displayOrder) ? 0 : displayOrder };

  /* M6.2: only read+send a field if the capability that governs it is
     actually granted — NOT "read the element if present, else default
     to false/null". The role-gated card above may not render
     #ws_default / #ws_agent at all for the agent role; querying a
     missing checkbox's .checked already safely yields undefined, but
     silently defaulting that to `false`/`null` here would have
     force-cleared is_default / agent_id on every single save an agent
     makes — a real correctness bug that has nothing to do with RLS
     (RLS would have accepted that destructive write, per the same
     column-permissiveness noted in renderManagementCard()). Omitting
     the key entirely is what savePropertyMeta()'s own contract expects
     for "leave this field alone" (it only patches keys that are
     `!== undefined`). */
  if (caps && caps['properties.setDefault']) {
    patch.is_default = document.getElementById('ws_default')?.checked || false;
  }
  if (caps && caps['properties.assignAgent']) {
    patch.agent_id = document.getElementById('ws_agent')?.value || null;
  }

  savingMeta = true;
  draw();

  try {
    await savePropertyMeta(currentSlug, patch);
    Object.assign(currentProperty, patch);
    toast('Metadata saved', 'success');
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
  } finally {
    savingMeta = false;
    draw();
  }
}

function ensureAgentsLoaded() {
  if (agentsLoaded) return;
  agentsLoaded = true;
  loadAgents().then(function(a) { agents = a; draw(); }).catch(function() {});
}

/* ── Revisions tab (gated on migration 005) ─────────────── */

let revisions = null;
let revisionsError = null;
let revisionsLoading = false;
let creatingRevision = false;

async function renderRevisionsPanel(mount) {
  window.__wsCreateRevision = handleCreateRevision;
  window.__wsPublishRevision = handlePublishRevision;
  window.__wsRollback = handleRollback;

  if (revisions !== null) {
    mount.innerHTML = buildRevisionsHtml();
    return;
  }

  if (revisionsLoading) {
    mount.innerHTML = '<div class="property-list-loading">Loading revisions...</div>';
    return;
  }

  revisionsLoading = true;
  mount.innerHTML = '<div class="property-list-loading">Loading revisions...</div>';

  try {
    revisions = await loadRevisions(currentSlug);
    revisionsError = null;
  } catch (e) {
    revisionsError = e.message;
    revisions = null;
  } finally {
    revisionsLoading = false;
  }

  mount.innerHTML = buildRevisionsHtml();
}

function buildRevisionsHtml() {
  if (revisionsError) {
    const isMissing = revisionsError.includes('experience_revisions') ||
                      revisionsError.includes('relation') ||
                      revisionsError.includes('does not exist');
    if (isMissing) {
      return '<div class="card">' +
        '<div class="card-head"><h3>Revisions</h3></div>' +
        '<div style="padding:16px;color:var(--muted);font-size:13px">' +
          '<p style="margin:0 0 8px"><strong>Migration 005 not applied.</strong></p>' +
          '<p style="margin:0">The experience_revisions table does not exist yet. ' +
          'Revision tracking will be available after migration 005 is applied to the database.</p>' +
        '</div>' +
      '</div>';
    }
    return emptyState('Could not load revisions', revisionsError);
  }

  const activeRevisionId = currentProperty?.experience_revision_id || null;

  let html = '<div class="card">' +
    '<div class="card-head">' +
      '<h3>Revisions</h3>' +
      '<button class="btn btn-primary" onclick="__wsCreateRevision()" ' +
        (creatingRevision ? 'disabled' : '') + '>' +
        (creatingRevision ? 'Creating...' : '+ Create revision') +
      '</button>' +
    '</div>';

  if (!revisions || !revisions.length) {
    html += '<div style="padding:16px;color:var(--muted);font-size:13px">' +
      'No revisions yet. Create a revision to snapshot the current property state.</div>';
  } else {
    html += '<div class="table-wrap"><table><thead><tr>' +
      '<th>#</th><th>Status</th><th>Created</th><th>Published</th><th>Actions</th>' +
    '</tr></thead><tbody>';

    revisions.forEach(function(rev) {
      const isActive = rev.id === activeRevisionId;
      html += '<tr' + (isActive ? ' style="background:var(--surface-2)"' : '') + '>' +
        '<td class="mono">' + esc(String(rev.revision_number)) + '</td>' +
        '<td>' + badge(rev.status) + (isActive ? ' <span class="badge badge-accent">Active</span>' : '') + '</td>' +
        '<td class="mono" style="font-size:11px">' + esc(formatDate(rev.created_at)) + '</td>' +
        '<td class="mono" style="font-size:11px">' + (rev.published_at ? esc(formatDate(rev.published_at)) : '—') + '</td>' +
        '<td style="display:flex;gap:4px">';

      if (rev.status === 'draft') {
        html += '<button class="btn btn-outline" style="font-size:11px;padding:2px 8px" ' +
          'onclick="__wsPublishRevision(\'' + esc(rev.id) + '\')">Publish</button>';
      }
      if (rev.status === 'published' && !isActive) {
        html += '<button class="btn btn-outline" style="font-size:11px;padding:2px 8px" ' +
          'onclick="__wsRollback(\'' + esc(rev.id) + '\')">Rollback to this</button>';
      }

      html += '</td></tr>';
    });

    html += '</tbody></table></div>';
  }

  html += '</div>';
  return html;
}

async function handleCreateRevision() {
  if (creatingRevision || !currentSlug || !currentProperty) return;

  creatingRevision = true;
  const mount = document.getElementById('revisionsPanelMount');
  if (mount) mount.innerHTML = buildRevisionsHtml();

  try {
    const rev = await createRevision(currentSlug, {
      content: currentProperty.content,
      knowledge: currentProperty.knowledge,
      assets: currentProperty.assets,
      createdBy: 'admin'
    });
    if (revisions) revisions.unshift(rev);
    else revisions = [rev];
    toast('Revision #' + rev.revision_number + ' created', 'success');
  } catch (e) {
    toast('Create revision failed: ' + e.message, 'error');
  } finally {
    creatingRevision = false;
    const m = document.getElementById('revisionsPanelMount');
    if (m) m.innerHTML = buildRevisionsHtml();
  }
}

async function handlePublishRevision(revisionId) {
  if (!currentSlug) return;

  try {
    await publishRevision(currentSlug, revisionId);
    if (currentProperty) currentProperty.experience_revision_id = revisionId;
    revisions = null;
    toast('Revision published', 'success');
    draw();
  } catch (e) {
    toast('Publish revision failed: ' + e.message, 'error');
  }
}

async function handleRollback(revisionId) {
  if (!currentSlug) return;

  try {
    await rollback(currentSlug, revisionId);
    if (currentProperty) currentProperty.experience_revision_id = revisionId;
    revisions = null;
    toast('Rolled back to revision', 'success');
    draw();
  } catch (e) {
    toast('Rollback failed: ' + e.message, 'error');
  }
}

function computeCompleteness(c) {
  const rows = [];

  const identityFields = ['label','brand','title','subtitle','intro','shortRef','referencePrice','defaultRegion','defaultPropertyType','conciergeIntro'];
  const identityFilled = identityFields.filter(k => isFilled(c[k])).length;
  rows.push({
    label: 'Identity',
    value: identityFilled + '/' + identityFields.length + ' primitives',
    hint: countCopyPairs(c.copy) + '/10 copy pairs'
  });

  const seqs = (c.sequences || []).length;
  const seqsWithScenes = (c.sceneSpaces || []).filter(s => Array.isArray(s?.[1]) && s[1].length).length;
  rows.push({
    label: 'Narrative',
    value: seqs + ' ' + pluralize(seqs, 'sequence'),
    hint: seqsWithScenes + ' with scene spaces'
  });

  const zones = (c.spatial || []).length;
  const details = c.spatialNodeDetails || { en: [], es: [] };
  const detailsBoth = Array.from({ length: zones }, (_, i) =>
    isFilled((details.en || [])[i]) && isFilled((details.es || [])[i])
  ).filter(Boolean).length;
  rows.push({
    label: 'Spaces',
    value: zones + ' ' + pluralize(zones, 'zone'),
    hint: detailsBoth + ' with EN+ES details'
  });

  const dims = (c.dna?.dimensions || []).length;
  const dimsBoth = (c.dna?.dimensions || []).filter(d =>
    isFilled(d?.note?.en) && isFilled(d?.note?.es)
  ).length;
  rows.push({
    label: 'DNA',
    value: c.dna ? dims + ' ' + pluralize(dims, 'dimension') : 'Missing',
    hint: c.dna ? dimsBoth + ' with EN+ES notes' : ''
  });

  const facts = (c.facts || []).length;
  const exps = (c.experiences || []).length;
  rows.push({
    label: 'Information',
    value: facts + ' ' + pluralize(facts, 'fact'),
    hint: exps + ' ' + pluralize(exps, 'experience')
  });

  const cards = (c.setting?.cards || []).length;
  rows.push({
    label: 'Surroundings',
    value: c.setting ? cards + ' ' + pluralize(cards, 'card') : 'Missing',
    hint: isFilled(c.setting?.title) ? 'Setting titled' : 'No setting title'
  });

  const arrivalEn = (c.arrival?.en || []).filter(ch =>
    Array.isArray(ch) && ch.length >= 3 && ch.every(isFilled)
  ).length;
  const arrivalEs = (c.arrival?.es || []).filter(ch =>
    Array.isArray(ch) && ch.length >= 3 && ch.every(isFilled)
  ).length;
  rows.push({
    label: 'Arrival',
    value: arrivalEn + '/3 EN chapters',
    hint: arrivalEs + '/3 ES chapters'
  });

  return rows;
}

function isFilled(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

function countCopyPairs(copy) {
  if (!copy) return 0;
  const keys = ['identityNote','bandLabel','sequenceTitle','sequenceIntro','filmLabel','spatialTitle','spatialIntro','spatialDetail','detailsTitle','detailsIntro'];
  return keys.filter(k => isFilled(copy[k]?.en) && isFilled(copy[k]?.es)).length;
}

function pluralize(n, word) {
  return n === 1 ? word : word + 's';
}

function slugToName(slug) {
  return (slug || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatPrice(amount) {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
  } catch (e) {
    return String(amount);
  }
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date(iso));
  } catch (e) {
    return String(iso).slice(0, 10);
  }
}

export function teardown() {
  contentEditor.teardown();
  assetsEditor.teardown();
  experiencePreview.teardown();
  auditPanel.teardown();
  readinessPanel.teardown();
  conciergePanel.teardown();
  propertyAnalytics.teardown();
  propertyLeads.teardown();
  delete window.__workspaceTab;
  delete window.__wsChangeStatus;
  delete window.__wsConfirmStatus;
  delete window.__wsCancelStatus;
  delete window.__wsSaveMeta;
  delete window.__wsCreateRevision;
  delete window.__wsPublishRevision;
  delete window.__wsRollback;
  containerRef = null;
  savingMeta = false;
  savingStatus = false;
  pendingStatus = null;
  revisions = null;
  revisionsError = null;
  revisionsLoading = false;
  creatingRevision = false;
  caps = null;
}
