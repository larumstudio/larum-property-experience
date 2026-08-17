'use strict';
/* ── LPE-12 · Axe Accessibility Gate ──────────────────────────────────
   Signed-off threshold (LPE_12_CLAUDE_CODE_INSTRUCTIONS.md §7):
     axe: 0 critical violations + 0 serious violations

   Runs axe-core in the browser via page.addScriptTag().
   Tests main page + menu overlay for marbella (primary fixture).

   HANDOFF §11: "axe: 0 critical/serious on main + overlays"
   ──────────────────────────────────────────────────────────────────── */

const { test, expect } = require('@playwright/test');
const fs   = require('node:fs');
const path = require('node:path');

const CONSENT_KEY  = 'larum_consent_v1';
const MARBELLA_URL = '/?property=marbella&source=pack';

/* Read axe-core browser bundle once at module load */
const axeCorePath = require.resolve('axe-core');
const axeSource   = fs.readFileSync(axeCorePath, 'utf8');

/* Bypass consent for every test */
test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, 'accepted');
  }, CONSENT_KEY);
});

/* Helper: inject axe and run, returns critical+serious violations */
async function runAxe(page, context) {
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async (ctx) => {
    const runOpts = ctx
      ? { include: [ctx] }
      : {};
    const results = await window.axe.run(document, runOpts);
    return results.violations.map(v => ({
      id:          v.id,
      impact:      v.impact,
      description: v.description,
      nodes:       v.nodes.length,
    }));
  }, context || null);

  return violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
}

function assertNoViolations(violations, label) {
  if (violations.length === 0) return;
  const details = violations
    .map(v => `  [${v.impact}] ${v.id}: ${v.description} (${v.nodes} elements)`)
    .join('\n');
  throw new Error(`${label}: ${violations.length} critical/serious violation(s):\n${details}`);
}

/* ── 1. Main page (marbella) ── */
test('axe: marbella main page — 0 critical/serious', async ({ page }) => {
  await page.goto(MARBELLA_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.footer', { timeout: 15_000 });

  const violations = await runAxe(page);
  assertNoViolations(violations, 'marbella main');
});

/* ── 2. Menu overlay (marbella) ── */
test('axe: marbella menu overlay — 0 critical/serious', async ({ page }) => {
  await page.goto(MARBELLA_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.footer', { timeout: 15_000 });

  await page.locator('button.menu').click();
  await page.waitForSelector('#menuOverlay.open', { timeout: 5_000 });

  const violations = await runAxe(page);
  assertNoViolations(violations, 'marbella menu overlay');
});

/* ── 3. Madrid main page ── */
test('axe: madrid main page — 0 critical/serious', async ({ page }) => {
  await page.goto('/?property=madrid&source=pack', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.footer', { timeout: 15_000 });

  const violations = await runAxe(page);
  assertNoViolations(violations, 'madrid main');
});
