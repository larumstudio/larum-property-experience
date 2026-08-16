#!/usr/bin/env node
/* ── Larum Property Experience™ — Onboarding validator ──────────────
   Checks every property in properties/index.json against the rules in
   property-loader.js, so a new property can be onboarded without
   opening the browser.

   Issues  = the experience will break or render empty. Must be fixed.
   Warnings = the experience works, but it is not demo-final
              (placeholder assets, unconfirmed facts, missing ES copy).

   Usage: node validate-content.js            → all properties
          node validate-content.js madrid     → one property
          node validate-content.js --strict   → warnings also fail
   ─────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');
const LarumLoader = require('./property-loader.js');
const { adaptProperty, validateNormalized, deriveManifest, validateManifest } = require('./schemas/adapters');

const ROOT = __dirname;
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const only = args.filter(a => !a.startsWith('--'));

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJSONOr(file, fallback) {
  try { return readJSON(file); } catch { return fallback; }
}

let sourcePack = null;

function load() {
  const registry = readJSON(path.join(ROOT, 'properties', 'index.json'));
  const pack = { registry, properties: {}, contact: null, purchase: null };

  for (const slug of registry.order || []) {
    const dir = path.join(ROOT, 'properties', slug);
    if (!fs.existsSync(dir)) {
      console.error(`properties/${slug}/ is listed in index.json but does not exist`);
      process.exit(1);
    }
    pack.properties[slug] = {
      content: readJSON(path.join(dir, 'content.json')),
      knowledge: readJSON(path.join(dir, 'knowledge.json')),
      assets: readJSONOr(path.join(dir, 'assets.json'), {}),
      experience: readJSONOr(path.join(dir, 'experience.json'), null)
    };
  }

  pack.contact = readJSONOr(path.join(ROOT, 'contact-config.json'), null);
  pack.purchase = readJSONOr(path.join(ROOT, 'purchase-config.json'), null);

  sourcePack = pack;
  LarumLoader.loadFromPack(pack);
}

function report() {
  const slugs = LarumLoader.getPropertySlugs().filter(s => !only.length || only.includes(s));
  if (!slugs.length) {
    console.error(only.length ? `No property matches: ${only.join(', ')}` : 'No properties found');
    process.exit(1);
  }

  let issues = 0;
  let warnings = 0;

  for (const slug of slugs) {
    const r = LarumLoader.validate(slug);
    const normalized = validateNormalized(adaptProperty(slug, sourcePack.properties[slug]));
    r.issues.push(...normalized.issues);
    const derived = deriveManifest(slug);
    const fileManifest = sourcePack.properties[slug].experience;
    const resolved = fileManifest || derived;
    const manifestCheck = validateManifest(resolved);
    if (!manifestCheck.valid) {
      r.issues.push(...manifestCheck.issues.map(i => `experience: ${i}`));
    } else if (fileManifest && JSON.stringify(fileManifest) !== JSON.stringify(derived)) {
      r.issues.push('experience: snapshot does not equal deriveManifest()');
    }

    /* LPE-06: asset contract / rights checks — warnings only. Never blocks
       preview. Surfaces only genuinely-new signals (required-missing,
       expired, missing-provenance); placeholder/unauthorised are already
       covered by the loader's existing warnings. */
    try {
      const resolver = require('./schemas/asset-resolver');
      const out = resolver.resolve(resolved, slug, sourcePack.properties[slug].assets || {});
      for (const id of out.requiredMissing) {
        r.warnings.push(`assets: required slot "${id}" has no asset`);
      }
      for (const f of out.flagged) {
        if (f.reason === 'expired') r.warnings.push(`assets: ${f.slotId} rights expired`);
        else if (f.reason === 'missing-provenance') r.warnings.push(`assets: ${f.slotId} has no provenance recorded`);
      }
    } catch (e) { /* resolver must never fail validation */ }

    const s = r.summary;

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`${r.valid ? 'READY  ' : 'BLOCKED'}  ${slug} — ${s.label}`);
    console.log(`${'─'.repeat(64)}`);
    console.log(`  sequences ${s.sequences} · spaces ${s.spaces} · intents ${s.intents} · ` +
                `facts confirmed ${s.confirmedFacts}/${s.totalFacts} · ` +
                `assets ${s.assetState} · space images ${s.spaceImages}/${s.spaces}`);

    if (r.issues.length) {
      console.log(`\n  Issues (${r.issues.length}) — must be fixed:`);
      r.issues.forEach(i => console.log(`    ✗ ${i}`));
      issues += r.issues.length;
    }
    if (r.warnings.length) {
      console.log(`\n  Warnings (${r.warnings.length}) — not demo-final:`);
      r.warnings.forEach(w => console.log(`    ! ${w}`));
      warnings += r.warnings.length;
    }
    if (!r.issues.length && !r.warnings.length) console.log('\n  Nothing to report.');
  }

  console.log(`\n${'═'.repeat(64)}`);
  console.log(`${slugs.length} propert${slugs.length === 1 ? 'y' : 'ies'} · ${issues} issue(s) · ${warnings} warning(s)`);

  if (issues) process.exitCode = 1;
  else if (strict && warnings) process.exitCode = 1;
}

try {
  load();
  report();
} catch (e) {
  console.error(`validate failed: ${e.message}`);
  process.exitCode = 1;
}

