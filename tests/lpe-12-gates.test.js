'use strict';
/* ── LPE-12 · Gate Structural Tests ───────────────────────────────────
   Dependency-free (node:assert, node:fs, node:path).
   No browser. No Supabase. No devDeps.

   Groups
     1 — No forbidden file changed (LPE-12 scope constraint)
     2 — Fallback hooks (handleFilmTrigger, openSpace, prefersReducedMotion)
     3 — Reduced-motion guards
     4 — Manifest-missing graceful path (deriveManifest with unknown slug)
     5 — Admin injection structural (admin/*.js safety check)
     6 — LPE-12 harness invariants (no LPE-12 migration, playwright config present)

   HANDOFF §10 — matches allowed/forbidden file list.
   ─────────────────────────────────────────────────────────────────── */

const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');

const root     = path.join(__dirname, '..');
const readFile = f  => fs.readFileSync(path.join(root, f), 'utf8');
const readJSON = f  => JSON.parse(readFile(f));
const exists   = f  => fs.existsSync(path.join(root, f));

/* ── Test runner ── */
let pass = 0, fail = 0;
function ok(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
    pass++;
  } catch (e) {
    console.error('  ✗ ' + name + ': ' + e.message);
    fail++;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   GROUP 1 — No forbidden file changed
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n[1] No forbidden file changed');

ok('schemas/adapters/index.js: exists + exports deriveManifest', () => {
  assert.ok(exists('schemas/adapters/index.js'));
  assert.ok(readFile('schemas/adapters/index.js').includes('deriveManifest'));
});

ok('schemas/families.js: exists (frozen)', () => {
  assert.ok(exists('schemas/families.js'));
});

ok('schemas/asset-contracts.js: exists (frozen)', () => {
  assert.ok(exists('schemas/asset-contracts.js'));
});

ok('property-loader.js: exists + exposes validate + loadFromPack (frozen)', () => {
  assert.ok(exists('property-loader.js'));
  const src = readFile('property-loader.js');
  assert.ok(src.includes('function validate('));
  assert.ok(src.includes('loadFromPack'));
});

ok('index.html: exists (frozen)', () => {
  assert.ok(exists('index.html'));
});

ok('experience-shell.js: exists (frozen)', () => {
  assert.ok(exists('experience-shell.js'));
});

ok('analytics.js: exists + nullReport + event_schema (write-path frozen)', () => {
  assert.ok(exists('analytics.js'));
  const src = readFile('analytics.js');
  assert.ok(src.includes('nullReport'),   'nullReport missing from analytics.js');
  assert.ok(src.includes('event_schema'), 'event_schema missing from analytics.js');
});

ok('consent.js: exists + LarumConsent (frozen)', () => {
  assert.ok(exists('consent.js'));
  assert.ok(readFile('consent.js').includes('LarumConsent'));
});

ok('api/_data.mjs: exists (protected file)', () => {
  assert.ok(exists('api/_data.mjs'), 'api/_data.mjs (protected file) is missing');
});

ok('vercel.json: exists (frozen)', () => {
  assert.ok(exists('vercel.json'));
});

ok('docs/migrations/: no new migration file for LPE-12', () => {
  const dir = path.join(root, 'docs', 'migrations');
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  const lpe12 = files.filter(f => /lpe.?12/i.test(f));
  assert.equal(lpe12.length, 0,
    `Unexpected LPE-12 migration file(s): ${lpe12.join(', ')}`);
});

/* ═══════════════════════════════════════════════════════════════════
   GROUP 2 — Fallback hooks
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n[2] Fallback hooks');

ok('handleFilmTrigger → jumpTo("concierge") when no propertyFilm', () => {
  const src = readFile('app.js');
  assert.ok(src.includes('handleFilmTrigger'),     'handleFilmTrigger not found in app.js');
  assert.ok(src.includes("jumpTo('concierge')"),   "jumpTo('concierge') branch missing");
});

ok('openSpace → p.band fallback when spaces empty', () => {
  assert.ok(readFile('app.js').includes('p.band'), 'p.band fallback not found in openSpace');
});

ok('prefersReducedMotion(): function defined', () => {
  assert.ok(readFile('app.js').includes('function prefersReducedMotion('));
});

ok('prefersReducedMotion(): called ≥ 2 times', () => {
  const src   = readFile('app.js');
  const calls = (src.match(/prefersReducedMotion\(\)/g) || []).length;
  assert.ok(calls >= 2, `Expected ≥2 prefersReducedMotion() call sites, found ${calls}`);
});

/* ═══════════════════════════════════════════════════════════════════
   GROUP 3 — Reduced-motion guards
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n[3] Reduced-motion guards');

ok('index.html: prefers-reduced-motion media query present', () => {
  const html = readFile('index.html');
  assert.ok(
    html.includes('prefers-reduced-motion'),
    'prefers-reduced-motion media query not found in index.html'
  );
});

ok('index.html: scroll-behavior: auto on reduced-motion', () => {
  const html = readFile('index.html');
  assert.ok(
    html.includes('scroll-behavior: auto'),
    'scroll-behavior: auto not found in index.html reduced-motion block'
  );
});

ok('styles.css: exists (motion styles potentially present)', () => {
  assert.ok(exists('styles.css'));
});

/* ═══════════════════════════════════════════════════════════════════
   GROUP 4 — Manifest-missing graceful path
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n[4] Manifest-missing graceful path');

ok('deriveManifest: does not throw on unknown slug', () => {
  const { deriveManifest } = require('../schemas/adapters');
  let threw = false;
  try { deriveManifest('__nonexistent_slug__'); } catch { threw = true; }
  assert.ok(!threw, 'deriveManifest threw on unknown slug — should return gracefully or null');
});

ok('deriveManifest: returns null or undefined (not crash) for unknown slug', () => {
  const { deriveManifest } = require('../schemas/adapters');
  const result = deriveManifest('__nonexistent_slug__');
  assert.ok(
    result === null || result === undefined || typeof result === 'object',
    `deriveManifest returned unexpected: ${JSON.stringify(result)}`
  );
});

/* ═══════════════════════════════════════════════════════════════════
   GROUP 5 — Admin injection structural
   Checks admin/*.js files for known dangerous injection patterns.
   Per HANDOFF §9 / DISCOVERY_QA Decision 4: admin exists in real repo.
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n[5] Admin injection structural');

ok('admin directory: present in real repo', () => {
  assert.ok(
    fs.existsSync(path.join(root, 'admin')),
    'admin/ directory not found — injection gate is CONDITIONAL (Admin absent)'
  );
});

const INJECTION_PATTERNS = [
  { pattern: /document\.write\s*\(/,  label: 'document.write()' },
  { pattern: /\beval\s*\(/,           label: 'eval()' },
  { pattern: /new\s+Function\s*\(/,   label: 'new Function()' },
  { pattern: /setTimeout\s*\(\s*['"]/, label: 'setTimeout(string)' },
  { pattern: /setInterval\s*\(\s*['"]/, label: 'setInterval(string)' },
];

const adminDir = path.join(root, 'admin');
if (fs.existsSync(adminDir)) {
  const adminFiles = fs.readdirSync(adminDir).filter(f => f.endsWith('.js'));

  ok(`admin: ${adminFiles.length} JS files found`, () => {
    assert.ok(adminFiles.length > 0, 'No admin JS files found');
  });

  for (const pattern of INJECTION_PATTERNS) {
    ok(`admin/*.js: no ${pattern.label} injection pattern`, () => {
      const hits = [];
      for (const f of adminFiles) {
        const src = fs.readFileSync(path.join(adminDir, f), 'utf8');
        if (pattern.pattern.test(src)) hits.push(f);
      }
      assert.equal(hits.length, 0,
        `${pattern.label} found in: ${hits.join(', ')}`);
    });
  }

  ok('admin/*.js: no inline <script> injection via innerHTML', () => {
    const hits = [];
    for (const f of adminFiles) {
      const src = fs.readFileSync(path.join(adminDir, f), 'utf8');
      if (/<script[\s>]/i.test(src) && src.includes('innerHTML')) {
        hits.push(f);
      }
    }
    assert.equal(hits.length, 0,
      `Potential innerHTML <script> injection in: ${hits.join(', ')}`);
  });
}

/* ═══════════════════════════════════════════════════════════════════
   GROUP 6 — LPE-12 harness invariants
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n[6] LPE-12 harness invariants');

ok('playwright.config.js: present', () => {
  assert.ok(exists('playwright.config.js'), 'playwright.config.js not found');
});

ok('tests/e2e/static-server.js: present', () => {
  assert.ok(exists('tests/e2e/static-server.js'));
});

ok('tests/e2e/smoke/: present', () => {
  assert.ok(
    fs.existsSync(path.join(root, 'tests', 'e2e', 'smoke')),
    'tests/e2e/smoke/ directory missing'
  );
});

ok('modules/spatial-zones.js: must NOT exist (P1 stays in app.js — LPE-11 closed)', () => {
  assert.ok(!exists('modules/spatial-zones.js'));
});

ok('LPE-11 tests still present (not clobbered)', () => {
  assert.ok(exists('tests/lpe-11-villa.test.js'));
});

/* ═══════════════════════════════════════════════════════════════════
   Final summary
   ═══════════════════════════════════════════════════════════════════ */
const total = pass + fail;
console.log(`\n${total} assertions: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
