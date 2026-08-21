/**
 * Admin-M6.6c · DEPLOY.md refresh + dead sidebar buttons — Test Matrix
 *
 * Dependency-free (node:assert, node:fs). Pure documentation/markup
 * checks — no Supabase, no browser. Confirms DEPLOY.md matches the
 * real post-M6.0–M6.6 architecture instead of the pre-Auth state it
 * described, and that the two undecided "Clientes"/"Ajustes"
 * placeholders (dead since M5.x/M6.2, flagged again in the M6.6
 * discovery) are gone from the sidebar.
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const readFile = f => readFileSync(join(root, f), 'utf8');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.error('  FAIL  ' + name); console.error('        ' + e.message); failed++; }
}

console.log('\n[1] DEPLOY.md reflects the real post-M6.0–M6.6 architecture');

const deploySrc = readFile('docs/DEPLOY.md');

await test('no longer instructs a global vercel install', async () => {
  assert.doesNotMatch(deploySrc, /npm i -g vercel/);
});

await test('deploy command is npx vercel (matches the actual deploy discipline used all through M6.x)', async () => {
  assert.match(deploySrc, /npx vercel deploy --prod --yes/);
});

await test('documents SUPABASE_SERVICE_ROLE_KEY (required for the agent invite endpoint)', async () => {
  assert.match(deploySrc, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(deploySrc, /admin-invite-agent\.mjs/);
});

await test('documents the redirect_to-must-be-a-query-param gotcha (this took real production attempts to get right)', async () => {
  assert.match(deploySrc, /redirect_to/);
  assert.match(deploySrc, /query parameter/i);
});

await test('marks supabase-fix-rls.sql as obsolete instead of instructing readers to run it', async () => {
  assert.match(deploySrc, /supabase-fix-rls\.sql.{0,40}obsolete/is);
  assert.doesNotMatch(deploySrc, /Run `docs\/supabase-fix-rls\.sql` first/);
});

await test('documents the isolated-project-first discipline for applying new migrations', async () => {
  assert.match(deploySrc, /isolated/i);
  assert.match(deploySrc, /SQL Editor/);
});

await test('mentions the RLS/roles architecture (admin vs agent) instead of describing admin.html as behind a single "authenticated" gate', async () => {
  assert.match(deploySrc, /006_authorization_foundation\.sql/);
  assert.match(deploySrc, /\bagent\b/i);
  assert.match(deploySrc, /\badmin\b/i);
});

console.log('\n[2] Dead "Clientes"/"Ajustes" sidebar placeholders removed');

const adminHtmlSrc = readFile('admin.html');

await test('no data-nav="clientes" or data-nav="ajustes" button remains in the sidebar', async () => {
  assert.doesNotMatch(adminHtmlSrc, /data-nav="clientes"/);
  assert.doesNotMatch(adminHtmlSrc, /data-nav="ajustes"/);
});

await test('no register(\'clientes\', null) or register(\'ajustes\', null) call remains', async () => {
  assert.doesNotMatch(adminHtmlSrc, /register\('clientes', null\)/);
  assert.doesNotMatch(adminHtmlSrc, /register\('ajustes', null\)/);
});

await test('every other real nav route is untouched (dashboard, agentes, propiedades, auditorias, leads, analytics, sessions, workspace)', async () => {
  for (const route of ['dashboard', 'agentes', 'propiedades', 'auditorias', 'leads', 'analytics', 'sessions', 'workspace']) {
    assert.match(adminHtmlSrc, new RegExp(`register\\('${route}',`), `register('${route}', ...) must still exist`);
  }
});

console.log('\n══ Admin-M6.6c TEST SUMMARY ═══════════════════════════════════');
console.log(`  ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
