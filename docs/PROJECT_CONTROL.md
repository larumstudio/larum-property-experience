# LARUM PROPERTY EXPERIENCE™
## Project control

**Current status:** V2 complete + Layer 1 packageable product (unified property loader)  
**Document policy:** only approved/final documents are retained; drafts are replaced, not duplicated.

## Approved direction

- Build two property experiences in parallel on one reusable system.
- Use one real villa in Marbella/Benahavís and one real penthouse/apartment in Madrid.
- Bilingual EN/ES from the beginning.
- Property is the protagonist; modules serve the property rather than define it.
- Existing agency assets may be used only after permission; public showcase requires written authorization.
- The first AI layer will be a bounded Property Concierge, not an unrestricted chatbot.
- The pilot can be demonstrated within 14 days if scope, assets and permissions are controlled.

## V2 implementation progress

### ✅ Block 1 — Advanced Knowledge Base (completed)
- `property-knowledge.json` completely rewritten with deep property data.
- Each property now has: `property.facts` (with status: confirmed/pending/requires-advisor), `property.systems`, `property.spaces` (with scene links and zone mapping).
- `surroundings` section per property: neighborhood, distances, lifestyle, schools, golf, restaurants, beaches.
- Intent system expanded: each intent has `keywords`, `en`, `es`, `confidence`, `sceneLinks`, `spaceLinks`, `docLinks`, `followUp`.
- `interestSignals` per property: maps interests to keyword sets for detection.
- `qualification` questions: progressive qualification triggers.

### ✅ Block 2 — Analytics & Interest Engine (completed)
- `analytics.js` created: standalone module, privacy-first, no external calls.
- Tracks: chapter entry, scene open, space open, concierge questions, document requests, calculator use, film watch, enquiry, entry path, interest signals.
- LocalStorage persistence per property.
- Interest scoring: cumulative detection from chat messages.
- Qualification detection: triggers at 3 questions, 2+ interests, or high intent.
- `buildAdvisorSummary()`: complete payload for the agent.
- `buildContextualEnquiry()`: contextual text for enquiry overlay.
- `debug()` method for development inspection.

### ✅ Block 3 — Intelligent Concierge (completed)
- `chat()` function rewritten with `buildConciergeResponse()`.
- Responses include: scene links (clickable → navigate to sequence), space links (clickable → open space overlay), doc links (calculator, documents).
- Confidence badges for requires-advisor answers.
- Follow-up prompts per intent.
- Progressive qualification messages injected automatically.
- Interest tags displayed in concierge status area after detection.
- Space descriptions now pulled from knowledge base first, fallback to hardcoded.

### ✅ Block 4 — Advisor Summary & Enquiry Intelligence (completed)
- Enquiry overlay now shows full advisor summary when visitor is qualified.
- Summary includes: scenes, spaces, interests, questions, calculator, film, duration, qualified status.
- Form submission sends structured JSON payload (when endpoint configured) or enriched mailto.
- `contact-config.json` supports `endpoint` field for secure form handler.

### ✅ Block 5 — V2 Styles (completed)
- Interest tags, response links, confidence notes, follow-up prompts, qualification bubbles.
- Advisor summary box in enquiry overlay.
- Responsive adjustments for mobile.

### ✅ Block 6 — Consent Banner (completed)
- `consent.js` created: GDPR-compliant consent banner.
- Blocks analytics until visitor opts in.
- Detailed explanation of what is collected and why.
- Remembers choice in localStorage.
- Respects `prefers-reduced-motion`.
- Mobile responsive.
- Analytics.js updated to buffer events before consent and flush when accepted.

### ✅ Block 7 — Admin Panel MVP (completed)
- `admin.html` created: simple dashboard to view analytics data.
- Shows: total visits, questions, calculator use, enquiries.
- Interest detection visualization with bar charts.
- Chapter engagement table.
- Spaces explored table.
- Recent events log (last 30 events).
- Export to CSV functionality.
- Filter by property (all, Madrid, Marbella).
- Reset data option.
- Reads from localStorage (will migrate to Supabase later).

### ✅ Block 8 — Packageable product: unified property loader (completed)

The goal of this block was Layer 1: *changing property must be one JSON folder plus assets, without touching code.*

- `properties/` introduced as the single source of truth: `index.json` registry (default, order, publication rules) plus one folder per property containing `content.json`, `knowledge.json`, `assets.json`.
- `property-loader.js` rewritten: registry-driven auto-load, ordered slugs, flat maps for the engine, offline pack fallback, and a full validation model.
- The five `embedded-*.js` files deleted, together with `property-content.json`, `property-knowledge.json` and `assets-manifest.json`. They were byte-identical duplicates of the JSON — verified before removal.
- **All property-specific data removed from `app.js`.** Section headlines, band labels, film labels, spatial zone descriptions, the three arrival chapters, space descriptions, experiences, the concierge intro, the calculator price and region — all of it now lives in `content.json`, bilingual where it was bilingual before.
- `index.html` now orchestrates explicitly: load data → boot experience → open consent gate. `app.js` exposes `LarumApp.boot()` and renders a clear failure state instead of a blank page when data is missing.
- `build-pack.js` added: generates `property-pack.js` so the prototype still runs from `file://`. Verified to produce byte-identical render to the served JSON.
- `validate-content.js` rewritten as an onboarding validator: separates **issues** (breaks the experience) from **warnings** (runs, but not demo-final). Non-zero exit on issues; `--strict` also fails on warnings.
- `properties/_template/` + `properties/README.md` added. A property created from the template renders the complete experience — hero, sequence, spatial, arrival, spaces, calculator — with zero code changes. Verified end to end.

Fixed along the way, all previously broken:

- **Hero and band images were dead.** Both properties rendered the same generic base64 SVG embedded in `property-content.json`, because the assets manifest was only honoured for `http` URLs. The per-property artwork in `assets/` now renders.
- **The autonomous community selector did nothing.** `purchase-config.json` was loaded but never read. Region now drives ITP/AJD, each property starts on its own region, and manual entry stays available.
- **Spanish visitors got English space descriptions.** The knowledge base is now bilingual (`descriptionEs` on every space).
- **The calculator total reset to "—"** when switching property or language.

### ✅ Block 9 — Transition and scroll choreography (completed)

Switching property left sections blank and the prototype felt sluggish after a few interactions. Four separate causes, all fixed:

- **`* { scroll-behavior: smooth }` in `index.html`** applied smooth scrolling to *every element*, so every programmatic scroll animated — including the ones that must land instantly. Now scoped to `html`, with a `prefers-reduced-motion` opt-out.
- **Listener and observer leak.** `initExperience()` ran on every property switch without tearing down the previous `IntersectionObserver` and scroll listener. One extra set accumulated per switch, all writing to the hero transform on every scroll event, most pointing at detached nodes. Now torn down explicitly; verified net zero listeners across repeated switches.
- **`threshold: .3` on the reveal observer.** A section taller than ~3.3× the viewport can never reach a 30% intersection ratio, so it would stay at `opacity: 0` permanently on short windows — this is the black block. Replaced with `threshold: 0` plus a `-12%` bottom margin, which cannot fail by geometry. A `resize` handler now re-checks, since the observer does not re-evaluate on its own.
- **The entrance animation replayed on every switch**, combined with a 500ms smooth scroll to the top: the visitor flew through the outgoing property and then watched everything fade in. The swap is now a cut — 190ms fade out, instant reposition, arrive already composed.

Also fixed: `setLang()` re-rendered the shell but never re-attached the choreography, so after one language change the chapter rail stopped tracking scroll entirely. Language now switches in place, anchored to the section in view (measured by layout position, not `getBoundingClientRect`, which includes the reveal transform and caused drift).

**A fifth cause, self-inflicted:** the first version of the swap faded `#app`, which promoted the entire ~9,600px document to a single composited layer that the compositor could not rasterise — painting the page black below the first tile. Replaced with a fixed, viewport-sized veil. Never transition opacity or transform on the element that wraps the whole document.

**The reveal system was then redesigned so the failure cannot happen at all.** Safety nets were not enough: hiding content and relying on JavaScript to bring it back means any bug anywhere shows the visitor a black page. Now the content is visible by default and the entrance is an *additive* CSS animation that only plays when a section is revealed. Verified by stripping every `is-visible` class from a live page: all sections stayed at `opacity: 1`.

Two further faults found while chasing it:

- **The Property DNA grid had been invisible since it was built.** `.dna-item` sits at `opacity: 0` until `.dna-section.is-visible` applies, but `.dna-section` was never in the observed set — only the five chapter ids were. The stagger delays were also `transition-delay` on rules that are now animations. The DNA section is observed as a non-chapter target (it must not drive the chapter rail or fire `chapter_enter`).
- **Stale caching.** The prototype served cached JS/CSS, so fixes did not reach the browser. `index.html` now sends no-cache headers and versions every asset URL, and `app.js` carries a `LARUM_BUILD` stamp.

Added `?debug`: a fixed panel printing build id, viewport, scroll, per-section opacity and on-screen state, DNA opacity, veil state and loader errors — enough to tell a stale cache from a real rendering fault from a single screenshot.

**The actual cause of the black page: `backdrop-filter`.** The debug panel settled it — every section reported `opacity: 1`, no veil, no errors, correct build, and the page was still black. `.consent-backdrop` covers the whole viewport with `backdrop-filter: blur(6px)`; on the reporter's Chromium build that rasterises as opaque black instead of blurring what is behind it, hiding the entire experience while the modal and the debug panel (both above it) drew normally. It also explains why an earlier diagnostic — setting the page background red — appeared to prove the screenshot channel was broken: the red was simply behind the opaque backdrop.

All three GPU filter effects were removed and replaced with solid values: `.consent-backdrop` and `.switcher` (`backdrop-filter: blur`) and `.arrival-backdrop` (`filter: saturate`). A note in `styles.css` records the rule: **never apply `filter` or `backdrop-filter` to anything covering the viewport in this document.**

### ✅ Block 11 — Grounded LLM concierge (completed, needs an API key to run)

The concierge was keyword matching: it answered only questions phrased close to a stored intent, and anything else got the fallback line. It now understands the question while the knowledge pack keeps owning every fact.

- `api/concierge.mjs` — a Vercel serverless function calling **Claude Opus 5**. The property dossier is the model's only source of truth about the residence; the system prompt forbids estimating, inferring or filling gaps, and requires it to say when the advisor confirms a fact.
- **Structured outputs** return a fixed shape — answer, confidence, spaces, scenes, documents, interests, follow-up — so the reply still drives scene links, space overlays and the calculator. Space and scene names are re-checked against the property before rendering: the model is told the valid names, but the experience does not trust that blindly.
- **Interest detection is now the model's job**, not keyword sets, which feeds a better advisor summary.
- **Prompt caching** on the dossier turns the dominant cost into a cache read — roughly a cent a question.
- `effort: "low"` with thinking on: a visitor mid-conversation will not wait, and the reasoning here is "find it in the dossier and say it well".
- The dossier sent to the model is trimmed to what the prompt reads (23 KB, down from 64 KB) — intents, interest signals and qualification triggers belong to the browser-side keyword engine.

**It degrades silently and always.** No API key, a cold start, a timeout, a refusal, malformed JSON — every path falls back to the keyword engine, and the visitor sees a typing indicator and then an answer. `404`/`501`/`503` mark the endpoint down for the session so it stops retrying. The demo works with no key at all.

Model output is escaped before it reaches the DOM.

### ✅ Block 12 — Deployment (prepared, not executed)

`vercel.json`, `.vercelignore`, `package.json` and `docs/DEPLOY.md` are in place for a project named **larum-property-experience**. `noindex, nofollow` is enforced in the page and as an `X-Robots-Tag` header. `docs/`, `admin.html` and the local JPGs stay off the public URL.

Photography now loads from the Unsplash CDN rather than shipping as binary — faster, and the deployment carries no image files. The Marbella crop is reproduced with CDN parameters (`w=2400&h=960&crop=top`).

**Not deployed yet:** the payload is ~324 KB of source, which is the wrong shape to push through an inline tool call. Two CLI commands do it — see `docs/DEPLOY.md`.

**Blocking before the link goes to anyone real:** `docs/supabase-fix-rls.sql` must be run. The anon key ships in the page source by design, and the live database currently allows it to read the `leads` table.

### ✅ Block 10 — Stand-in photography + asset pipeline (completed)

The generated SVG placeholders were the main reason the prototype did not read as premium. Replaced with licence-cleared photography chosen to match each property's art direction:

- **Madrid — *The Light of Goya*:** light as the organising subject. Hero: a shaft of warm light across concrete and wood (Stephen Pontes). Band: window light falling in a grid across a warm floor (Sou Jest).
- **Marbella — *The Private Resort*:** water and golden hour. Hero: an infinity pool holding the last light (Ken Oyama). Band: Mediterranean pines against a gold sea (Quick PS).

All four are Unsplash License, 2400×1600, and feed the hero, the wide band, the arrival backdrop and the space overlays.

**These are stand-ins, not the properties.** Each carries a `provenance` block and `"authorised": false` in its `assets.json`. The validator reports asset state as `placeholder` / `stand-in` / `authorised`, and refuses to let an unauthorised asset ship without recorded provenance. `noindex/nofollow` stays on.

Per-space photography is now wired: an entry under `assets.spaces` overrides the band image in the space overlay. Naming convention and hand-off procedure documented in `properties/README.md`.

Authorisation emails for Christie's Madrid and NVOGA drafted in `docs/ASSET_PERMISSION_EMAILS.md` — not sent.

### Current file structure

```
prototype/
├── index.html              (data → experience → consent)
├── styles.css              (V1 + V2 styles, mobile refined, consent banner)
├── app.js                  (experience engine — no property data)
├── property-loader.js      (property registry, loading, validation)
├── analytics.js            (analytics & interest engine — local + Supabase sessions)
├── consent.js              (GDPR consent banner)
├── admin.html              (admin panel — Supabase behind Supabase Auth)
├── build-pack.js           (generates the offline pack)
├── property-pack.js        (GENERATED — do not edit)
├── validate-content.js     (onboarding validator)
├── contact-config.json     (lead destination config)
├── purchase-config.json    (acquisition calculator rates)
├── supabase-config.js
├── properties/
│   ├── README.md           (how to add a property)
│   ├── index.json          (default, order, publication rules)
│   ├── _template/
│   ├── madrid/             (content.json · knowledge.json · assets.json)
│   └── marbella/
├── assets/                 (SVG placeholders for demo)
└── docs/
    ├── PROJECT_HANDOFF.md
    ├── PROJECT_CONTROL.md   (this file)
    ├── AI_CONCIERGE_SPEC.md
    ├── TECH_SPEC.md
    ├── START_V2.md
    ├── V2_SCOPE.md
    ├── V1_GAP_ANALYSIS.md
    └── supabase-schema.sql
```

### ✅ Block 11 — Property DNA disclosure + The Setting detail (completed)

Two modules were showing a number or a label with nothing behind them. Both now open.

**Property DNA.** Each score is a disclosure: clicking it reveals the sentence that earns the number, written in the property's own voice and specific to it — not a feature list. Twenty notes authored (5 dimensions × 2 properties × EN/ES). Accordion behaviour: opening one closes the previous. Tracked as `dna_open`.

`dna.dimensions` migrated from `["Light","94"]` to `{ label, score, note: { en, es } }`. Legacy tuples still load, so an older pack does not break, but the validator now rejects them for new work.

**The Setting.** Each card opens a panel built from `knowledge.surroundings`, which held a full block of researched data — neighbourhood, distances, lifestyle, schools, golf, beaches, restaurants, transport, culture, shopping, parks — that nothing rendered until now.

`setting.cards` migrated to `{ title, line, source }`, where `source` names a `surroundings` key or one of two special renderers:

- **`distances`** — the answer to "put a map here". A map pin would say less and commit to precision the agency has not confirmed. Instead: a quiet readout of place and distance, with anything unverified labelled *to confirm* in the same breath as the number.
- **`verification`** — turns the project's own discipline into a selling point: how many facts the agency has confirmed out of the total, how many distances are still pending, and exactly which. In a market full of unverifiable claims, showing the seams is the differentiator.

The validator now checks that every DNA score has a bilingual note and that every setting card points at a `surroundings` key that actually exists — a card wired to a missing block is an issue, not a silent blank.

### ✅ Block 12 — Shareable links, lead delivery, and a data audit (completed)

**Shareable link per property.** The URL is now the deliverable: `?property=marbella&lang=es` opens that property in that language, and `&chapter=concierge` lands the visitor in a specific chapter. The address bar stays in sync as the agent switches property or language, so they copy it and send it to their client. `chapter` and `debug` are stripped from the synced URL — they are arrival instructions, not state to pass on.

**All in-page navigation was dead.** `jumpTo` used `scrollIntoView({behavior:'smooth'})`, and smooth scrolling silently does nothing in some browsers and settings — verified here: `behavior:'instant'` moved the page, `'smooth'` did not, at all. That meant the chapter rail, every entry in the Menu overlay, "Understand the space", the arrival exit and the space overlay's "Ask the advisor" were all dead controls. `jumpTo` now requests smooth, then verifies and lands the scroll if nothing moved; every navigation call routes through it. Also `body { overflow-x: hidden }` → `clip`, which contains overflow without turning body into a scroll container.

**Leads were never being stored.** Verified against the live database with the anon key: `INSERT` into `public.leads` fails with `42501` (row-level security), while `SELECT` succeeds. So every enquiry was silently discarded, and anyone with the anon key — which ships in the page source by design — could read every lead. `docs/supabase-schema.sql` has the correct policies but was never applied. `docs/supabase-fix-rls.sql` added: creates the missing `analytics_events` table, drops all current policies and grants anon insert-only, authenticated read. **Jen must run it in the Supabase SQL editor.** Until then the app falls back to mailto.

The failure is no longer silent: `sendLeadToSupabase` returns whether the row was actually written, names the RLS cause, and the visitor only sees "sent" if it was stored — otherwise mailto opens. Lead destination set to `contactolarum@gmail.com` while the pilot runs.

**Data audit against the agencies' own listings.** Both properties were checked against the agency websites (9 Aug 2026):

- **Madrid M1558** — our figures were correct. Added from the listing: 6th floor penthouse, west orientation, General Pardiñas 20 with communal pool, EPC in progress. 8/13 facts now confirmed.
- **Villa Casia NVG-H11** — **two facts were wrong and marked `confirmed`**: the knowledge base said 5 bedrooms and 7 bathrooms; NVOGA's own listing says **4 and 5**. The hero facts strip, the concierge answers and four intent responses all repeated the wrong figures. Corrected everywhere. Added: 710 m² built, 980 m² plot, 151 m² terrace, 2025 new build, ready to move in and furnished. 9/12 facts now confirmed.

**The calculator was taxing a new build as a resale.** Villa Casia is new build, so it attracts VAT + AJD, not ITP. `defaultPropertyType` added per property and wired into the calculator: Marbella now opens on new build (€458,850 in tax) instead of resale (€279,300) — a €179,550 understatement, on the one number a buyer checks hardest.

### ✅ Block 13 — Session tracking and the admin panel (completed, waiting on one SQL run)

**The RLS script had never been run.** The handoff recorded it as applied and verified; it was not. Probed again on 9 Aug 2026 with the anon key, straight at PostgREST:

```text
INSERT public.leads            → 42501 row-level security
INSERT public.sessions         → 42501 row-level security
INSERT public.analytics_events → 42501 row-level security
```

So nothing has been reaching the database at all — every enquiry has been falling through to mailto, and every visit has died with the tab. The columns are fine and match `supabase-schema.sql`, which is why the error is a policy error and not a column error. `docs/supabase-fix-rls.sql` is now the single script to run; it is idempotent and also adds `leads.session_id`. **Until it is run, none of this block's work stores anything.**

**Session tracking (`analytics.js`).** The visit is mirrored to Supabase as it happens: one row in `sessions`, upserted on its primary key as the visit grows, plus one row per interaction in `analytics_events`, tied together by `session_id`.

- **Consent first.** Nothing is transmitted before the visitor accepts. Declining now reaches analytics — `denyConsent()` drops the buffer and stops recording entirely, locally as well. Before, a declined visit sat in a queue waiting for a consent that never came.
- **A session is a tab.** The id lives in `sessionStorage`, so a reload continues the same visit and a second tab is a second visitor. Switching property closes the previous session and opens a new one.
- **Duration is measured, not inferred.** A 10 s heartbeat counts only while the tab is visible and something happened in the last 90 s, so a tab left open overnight does not report as a nine-hour visit.
- **It writes on the way out.** `pagehide` and `visibilitychange` flush with `fetch(..., {keepalive:true})` — which is why analytics talks to PostgREST directly instead of through supabase-js, which does not expose that option. An analytics write that dies with the tab is the exact failure this block exists to remove.
- **Events go in batches** (every 5 s, or 20 events, immediately on `enquiry`). A blocked or misconfigured database logs one warning naming the fix and then stops trying, rather than flooding the console on every scroll.
- `leads.session_id` links the form to everything the visitor did before filling it. If the column is missing the lead is stored without it — the enquiry matters more than the link.

**Admin panel (`admin.html`).** Rewritten against Supabase behind Supabase Auth (email + password, no sign-up — the account is created by hand). It ships now: it is out of `.vercelignore`, and the read policies are scoped to `authenticated`, so signed out it is an inert login box.

Two views. **Leads** is the advisor summary in full — entry path, chapters, scenes, spaces, detected interests, every question asked to the concierge, calculator, film, measured time, qualification — plus the session's event timeline with offsets from arrival, and *Mark as contacted* with advisor notes. **Visits** is the reason session tracking came first: the visitor who spent eight minutes, asked five questions and never left a name shows up as *Qualified, no form*.

The old panel's fabricated charts are gone — random traffic, invented device and source splits. Visits per day and detected interests are computed from real rows; nothing is drawn that is not measured. Chart.js is dropped with them. Every string rendered comes from a visitor, so all of it is escaped.

## Immediate next actions

### Priority A — Run the SQL *(blocks everything else)*
1. Run `docs/supabase-fix-rls.sql` in the Supabase SQL editor.
2. Create the admin user: Authentication → Users → Add user, Auto Confirm on; then turn sign-ups off.
3. Confirm: accept the consent banner, explore a minute, close the tab, and check `sessions` has the row.

### Priority B — Real Endpoint for Leads
1. Connect `contact-config.endpoint` to Supabase webhook or Formspree.
2. Test lead capture end-to-end.
3. Add email notifications to agency.

### Priority C — Assets & Permissions
1. Get permission from Christie's (Madrid) and NVOGA (Marbella).
2. Replace placeholder SVGs with real images.
3. Add floor plans to documents section.
4. Integrate energy certificate and brochure.

### Priority D — QA & Polish
1. Test consent flow on mobile.
2. Verify all analytics events fire correctly.
3. Test admin panel with real data.
4. Cross-browser testing (Chrome, Safari, Firefox, Edge).
5. Performance audit with Lighthouse.

## Server

```
python3 -m http.server 4173 --bind 0.0.0.0
```

Running on port 4173.

## Demo URLs

- **Property Experience**: http://localhost:4173/
- **Admin Panel**: http://localhost:4173/admin.html
