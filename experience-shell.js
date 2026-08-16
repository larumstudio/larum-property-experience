'use strict';

/* LPE-03 Runtime Shell. The ONLY place that turns a manifest + slices into a page.
   It does not call html* functions, does not touch the DOM, does not read
   family/theme/navigation. The 9-id composition policy lives in the registry. */

function _registry() {
  if (typeof LarumModuleRegistry !== 'undefined') return LarumModuleRegistry;
  if (typeof require === 'function') {
    try { return require('./schemas/module-registry'); } catch (e) { return null; }
  }
  return null;
}

/* manifest  — the resolved experience manifest (LarumLoader.getManifest)
   providers — map of slice-key → rendered HTML string (built by app.js)     */
function compose(manifest, providers) {
  providers = providers || {};
  const reg = _registry();

  /* Fail-safe only. The shell never invents a second compose policy; if the
     registry is absent it returns an empty main rather than restating the
     9-id plan. app.js already falls back to legacyManifest() upstream. */
  if (!reg) {
    return {
      plan: [],
      railIds: [],
      menuIds: [],
      showArrival: false,
      showEnquiry: false,
      mainHtml: ''
    };
  }

  const plan = reg.composePlan(manifest);
  return {
    plan,
    railIds: reg.railChapterIds(manifest),
    menuIds: reg.menuTargets(manifest).map(t => t.id),
    showArrival: reg.moduleVisible(manifest, 'arrival'),
    showEnquiry: reg.moduleVisible(manifest, 'enquiry-handoff'),
    mainHtml: plan.map(step => providers[step.id] || '').join('')
  };
}

const LarumExperienceShell = { compose };

if (typeof window !== 'undefined') window.LarumExperienceShell = LarumExperienceShell;
if (typeof module !== 'undefined' && module.exports) module.exports = LarumExperienceShell;
