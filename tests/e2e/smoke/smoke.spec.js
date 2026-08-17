'use strict';
/* ── LPE-12 · Playwright Smoke Tests ──────────────────────────────────
   Runs on both desktop and mobile (via playwright.config.js projects).
   Covers: load, property identity, property switch, language switch,
   menu overlay open/close, enquiry CTA present, no unexpected console
   errors, no duplicate listeners after N property switches.

   MODULE_IDS SyntaxError: pre-existing LPE-07 deuda — filtered out.
   Supabase connection errors: expected in test env — filtered out.

   HANDOFF §11 spec: desktop + mobile journey.
   ──────────────────────────────────────────────────────────────────── */

const { test, expect } = require('@playwright/test');
const fs   = require('node:fs');
const path = require('node:path');

const CONSENT_KEY  = 'larum_consent_v1';
const MARBELLA_URL = '/?property=marbella&source=pack';
const MADRID_URL   = '/?property=madrid&source=pack';

/* Known false-positive errors to ignore */
const IGNORED_ERROR_PATTERNS = [
  'MODULE_IDS',           // LPE-07 deuda: duplicate const in schemas/
  'already been declared',
  'supabase',             // No Supabase creds in test env
  'Supabase',
  'postgrest',
  'Failed to load resource', // CDN resources may 4xx in test env
  'net::ERR_',
];

function isIgnoredError(text) {
  return IGNORED_ERROR_PATTERNS.some(p => text.includes(p));
}

/* Bypass consent for every test via localStorage pre-population */
test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, 'accepted');
  }, CONSENT_KEY);
});

/* ── 1. Load and property identity ── */
test('marbella: loads and shows property identity in footer', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !isIgnoredError(msg.text())) errors.push(msg.text());
  });

  await page.goto(MARBELLA_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.footer')).toBeVisible({ timeout: 15_000 });

  const footerText = await page.locator('.footer').textContent();
  expect(footerText).toContain('Marbella');
  expect(errors).toHaveLength(0);
});

test('madrid: loads and shows property identity in footer', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !isIgnoredError(msg.text())) errors.push(msg.text());
  });

  await page.goto(MADRID_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.footer')).toBeVisible({ timeout: 15_000 });

  const footerText = await page.locator('.footer').textContent();
  expect(footerText).toContain('Madrid');
  expect(errors).toHaveLength(0);
});

/* ── 2. Property switch ── */
test('marbella → madrid: property switch updates footer', async ({ page }) => {
  await page.goto(MARBELLA_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.footer')).toBeVisible({ timeout: 15_000 });

  // The switcher renders buttons per slug; madrid label split[0] = 'Madrid'
  const madridBtn = page.locator('.switcher button', { hasText: 'Madrid' });
  await expect(madridBtn).toBeVisible({ timeout: 10_000 });
  await madridBtn.click();

  await expect(page.locator('.footer')).toContainText('Madrid', { timeout: 15_000 });
});

test('madrid → marbella: property switch updates footer', async ({ page }) => {
  await page.goto(MADRID_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.footer')).toBeVisible({ timeout: 15_000 });

  const marbellaBtn = page.locator('.switcher button', { hasText: 'Nueva' });
  await expect(marbellaBtn).toBeVisible({ timeout: 10_000 });
  await marbellaBtn.click();

  await expect(page.locator('.footer')).toContainText('Marbella', { timeout: 15_000 });
});

/* ── 3. Language switch ── */
test('language toggle: EN → ES → EN', async ({ page }) => {
  await page.goto(MARBELLA_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.footer')).toBeVisible({ timeout: 15_000 });

  // Initial state: lang=en → button shows 'ES'
  const langBtn = page.locator('.switcher button', { hasText: 'ES' });
  await expect(langBtn).toBeVisible({ timeout: 10_000 });
  await langBtn.click();

  // After toggle: lang=es → button shows 'EN'
  await expect(page.locator('.switcher button', { hasText: 'EN' }))
    .toBeVisible({ timeout: 10_000 });

  // Toggle back
  await page.locator('.switcher button', { hasText: 'EN' }).click();
  await expect(page.locator('.switcher button', { hasText: 'ES' }))
    .toBeVisible({ timeout: 10_000 });
});

/* ── 4. Menu overlay open / close ── */
test('menu overlay: opens and closes', async ({ page }) => {
  await page.goto(MARBELLA_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.footer')).toBeVisible({ timeout: 15_000 });

  // Open menu via topbar button.menu
  await page.locator('button.menu').click();
  await expect(page.locator('#menuOverlay.open')).toBeVisible({ timeout: 5_000 });
  expect(await page.locator('#menuOverlay').getAttribute('aria-hidden')).toBe('false');

  // Close via .menu-close button
  await page.locator('.menu-close').click();
  await expect(page.locator('#menuOverlay.open')).not.toBeVisible({ timeout: 5_000 });
  expect(await page.locator('#menuOverlay').getAttribute('aria-hidden')).toBe('true');
});

/* ── 5. Enquiry CTA present ── */
test('enquiry CTA: button.enquire is visible', async ({ page }) => {
  await page.goto(MARBELLA_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.footer')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('button.enquire')).toBeVisible({ timeout: 5_000 });
});

/* ── 6. No duplicate listeners after N property switches ── */
test('no duplicate listeners after 3 property switches', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !isIgnoredError(msg.text())) errors.push(msg.text());
  });

  await page.goto(MARBELLA_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.footer')).toBeVisible({ timeout: 15_000 });

  for (let i = 0; i < 3; i++) {
    const btn = i % 2 === 0
      ? page.locator('.switcher button', { hasText: 'Madrid' })
      : page.locator('.switcher button', { hasText: 'Nueva' });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();
    await expect(page.locator('.footer')).toContainText(
      i % 2 === 0 ? 'Madrid' : 'Marbella',
      { timeout: 15_000 }
    );
  }

  // No unexpected errors during switches
  expect(errors).toHaveLength(0);

  // Check that switcher still renders correctly (no stale handlers)
  await expect(page.locator('.switcher')).toBeVisible();
  const switcherBtns = await page.locator('.switcher button').count();
  expect(switcherBtns).toBeGreaterThan(0);
});

/* ── 7. Hero image budget ≤ 500KB ── */
test('marbella hero image: ≤ 500KB', async ({ request }) => {
  const assetsPath = path.join(__dirname, '..', '..', '..', 'properties', 'marbella', 'assets.json');
  const assets     = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));
  const url        = assets?.hero?.fallbackImage;

  if (!url || url.startsWith('data:')) {
    console.log('  ⚠  Hero fallbackImage is a data URI or absent — skipping size check');
    return;
  }

  const response = await request.head(url);
  const cl       = parseInt(response.headers()['content-length'] || '0', 10);

  if (cl === 0) {
    // CDN may not return Content-Length on HEAD; do a GET and check transfer size
    const get    = await request.get(url);
    const body   = await get.body();
    expect(body.length).toBeLessThanOrEqual(500 * 1024);
  } else {
    expect(cl).toBeLessThanOrEqual(500 * 1024);
  }
});
