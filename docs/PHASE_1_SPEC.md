# LARUM — PHASE 1

# FROM PROPERTY EXPERIENCE TO LARUM ADMIN

## MASTER DEVELOPMENT INSTRUCTION

### Objective

We are NOT starting a new Larum product.

We are taking the existing **Larum Property Experience** and the existing **Admin Panel** and turning them into the foundation of the Larum operating system.

The immediate objective is:

> **Build a fully operational, visual, intuitive, bilingual Larum Admin from which a non-technical Larum operator can manage clients, properties, audits, Property Experiences, Concierge and analytics without editing code or redeploying the application.**

Do NOT move on to Agent Presence yet.

Agent Presence is the NEXT PHASE, after this phase is fully operational.

---

# 1. CURRENT STATE — THIS IS OUR STARTING POINT

The current Property Experience is already working.

It currently has:

* cinematic property presentation
* bilingual experience
* property-specific content
* Property Concierge
* Anthropic integration
* analytics
* existing admin panel
* Vercel deployment
* Supabase backend
* property data currently stored in JSON
* two demonstration properties

The current Property Experience architecture has already achieved something important:

> A new property can be created by changing property data/assets/configuration rather than rewriting the application code.

The existing property loader and validation system must therefore be considered a valuable asset.

### DO NOT destroy this architecture.

The existing property data contract, validation rules, bilingual structure, provenance model and Concierge architecture should be preserved wherever possible.

---

# 2. CURRENT TECHNICAL REALITY

The architecture audit identified the following:

### Frontend

The current Property Experience is a static HTML/CSS/JavaScript application.

There is currently:

* no React
* no TypeScript
* no bundler
* no traditional framework
* one primary serverless Concierge endpoint

Do NOT rewrite the application into a framework during this phase.

Do NOT introduce React/Next.js/etc. merely for architectural fashion.

The framework question can be revisited later.

---

# 3. CURRENT DATABASE REALITY

Supabase currently contains analytics/lead/session-related tables.

There is currently NO canonical `properties` table.

Property identity is currently represented through repeated slugs/text values.

This must change.

The central architectural entity of Larum is:

# PROPERTY

The existing database must evolve so that:

```text
property
    ↓
analytics
    ↓
sessions
    ↓
leads
    ↓
concierge
```

all reference a real property entity.

---

# 4. TARGET BUSINESS ARCHITECTURE

The immediate Larum product architecture is:

```text
LARUM
│
├── PROPERTY
│     │
│     ├── AUDIT
│     │
│     ├── PROPERTY EXPERIENCE
│     │       │
│     │       ├── Cinematic Presentation
│     │       ├── AI Property Concierge
│     │       └── Analytics
│     │
│     └── LEADS
│
└── AGENT
      │
      └── PROPERTY
```

The second commercial product will eventually be:

```text
AGENT
│
├── AGENT PRESENCE
│
└── PROPERTIES
       ├── Property A
       ├── Property B
       └── Property C
```

BUT:

# AGENT PRESENCE IS NOT PART OF THIS PHASE.

Do not implement Agent Presence now.

Prepare the architecture so it can be added cleanly later.

---

# 5. WHAT LARUM ADMIN SHOULD BECOME

The current admin panel is not yet the Larum operating system.

It is currently primarily a dashboard/visualization layer.

We want to transform it into:

# LARUM ADMIN

A visual operational control center.

The user of Larum Admin is NOT a developer.

The user should be able to manage the business through an intuitive interface.

The core question should always be:

> "What does this client need, and what do I need to produce for them?"

---

# 6. CORE LARUM ADMIN NAVIGATION

The first operational version should contain:

```text
LARUM ADMIN

Dashboard

Clients

Agents

Properties

Audits

Leads

Analytics

Settings
```

Do NOT build a huge SaaS navigation system.

Keep the first version focused.

---

# 7. DASHBOARD

The dashboard should provide a high-level operational overview.

It should eventually answer:

### Business

* active clients
* active agents
* active properties
* published experiences
* pending work
* leads
* recent activity

### Property Experience

* active experiences
* unpublished properties
* properties requiring attention
* recent visitor activity

### Leads

* new leads
* high-intent interactions
* recent Concierge activity

The dashboard should prioritize useful operational information.

Do NOT create decorative charts simply because charts are possible.

---

# 8. CLIENT MODEL

Create the concept of a Client/Organization.

The architecture should support:

```text
ORGANIZATION
    │
    └── AGENTS
          │
          ├── PROPERTY
          ├── PROPERTY
          └── PROPERTY
```

Initially there may only be one Larum organization/client context.

The architecture must nevertheless be designed so additional clients can be added later.

Do not over-engineer multi-tenancy at this stage.

---

# 9. AGENT MODEL

Create the basic Agent entity.

An agent should eventually be able to have:

* name
* photo
* email
* phone
* agency
* role
* status
* profile information
* properties

Do NOT build the Agent Presence website yet.

For this phase, Agent exists primarily as a relationship between the client and their properties.

---

# 10. PROPERTY AS THE CENTRAL ENTITY

Create a canonical `properties` entity.

A property should contain or reference:

```text
PROPERTY

id
organization_id
agent_id

slug
status

title
description

price
currency

location

property_type

content

knowledge

assets

experience_configuration

created_at
updated_at
published_at
```

The exact schema must be based on the existing code and Supabase structure.

Do not blindly copy this list.

Evaluate what should be relational columns versus JSONB.

The existing property data contract should be preserved where practical.

---

# 11. MIGRATE THE EXISTING PROPERTIES

The two existing demonstration properties must continue working after the migration.

Do not break:

* Madrid
* Málaga

The migration must preserve:

* content
* knowledge
* assets
* bilingual content
* Concierge functionality
* analytics
* existing URLs/slugs where possible

The existing JSON property system should become the initial source for populating the new database records.

After migration, the database becomes the canonical source.

---

# 12. PROPERTY EXPERIENCE

The Property Experience must remain visually and functionally intact.

This is NOT a redesign phase.

The current experience is already the foundation of the commercial product.

Do not unnecessarily modify:

* visual design
* cinematic interactions
* Concierge UI
* analytics UX
* navigation
* typography
* animation system

Only change what is necessary to make the experience consume property data from the new architecture.

---

# 13. PROPERTY CREATION

This is one of the most important objectives of this phase.

Today:

```text
New Property
    ↓
edit JSON
    ↓
deploy
```

We need:

```text
New Property
    ↓
Larum Admin
    ↓
Enter property information
    ↓
Upload / configure assets
    ↓
Add bilingual content
    ↓
Configure Concierge
    ↓
Save
    ↓
Preview
    ↓
Publish
```

A non-technical Larum operator should be able to do this.

No code editing.

No Git.

No Vercel CLI.

No redeployment for every property.

---

# 14. PROPERTY ADMIN INTERFACE

The property detail screen should become the main workspace for a property.

Conceptually:

```text
PROPERTY

[Overview]

[Content]

[Assets]

[Audit]

[Experience]

[Concierge]

[Analytics]

[Leads]

[Settings]
```

The exact UI can differ.

The important thing is that everything relating to a property is accessible from one place.

---

# 15. PROPERTY STATUS

Every property should have a clear lifecycle.

For example:

```text
Draft
↓
In Production
↓
Ready
↓
Published
↓
Archived
```

The system should make the current status obvious.

The operator should know immediately:

> What is missing before this property can be published?

---

# 16. PROPERTY CHECKLIST

The property workspace should eventually expose a visual readiness checklist.

For example:

```text
PROPERTY READINESS

✓ Basic information
✓ Bilingual content
✓ Property knowledge
✓ Hero image
✓ Gallery
○ Video
✓ Concierge
✓ Analytics
○ Final review

[ 8 / 10 READY ]
```

This is important operationally.

It turns Larum Admin into a production system rather than merely a database interface.

---

# 17. BILINGUAL ARCHITECTURE

THIS IS A CORE REQUIREMENT.

Everything public-facing must support:

# ESPAÑOL + ENGLISH

This includes:

* Property Experience
* Property content
* property narrative
* property knowledge
* Agent information where applicable
* Admin labels where appropriate
* Concierge responses
* system messages
* validation states
* user-facing errors
* CTAs
* metadata where appropriate

Do NOT build Spanish first and "translate later".

The data model should support bilingual content from the beginning.

Use an explicit language structure rather than duplicated ad-hoc fields wherever appropriate.

For example:

```text
title:
  es: "..."
  en: "..."

description:
  es: "..."
  en: "..."
```

Use the existing Larum content conventions when they are better.

---

# 18. CONCIERGE

The existing Concierge architecture is an important asset.

Preserve:

* Anthropic integration
* property-specific dossier
* strict factual grounding
* bilingual behavior
* language separation from cached property context
* fallback behavior
* current prompt architecture

The Concierge must always know which property it belongs to.

The system should never mix knowledge between properties.

---

# 19. CONCIERGE PERSISTENCE

The current Concierge conversation history is primarily client-side.

This is insufficient for the future Larum system.

Add server-side persistence.

At minimum, the architecture should support:

```text
conversation
    ↓
property
    ↓
session
    ↓
messages
```

The admin should eventually allow the Larum operator to see:

* conversation
* language
* property
* timestamp
* detected intent if available
* lead status

Do not build a sophisticated CRM yet.

We only need reliable conversation persistence and visibility.

---

# 20. CONCIERGE SECURITY

Implement basic protection against uncontrolled API usage.

At minimum evaluate:

* rate limiting
* request validation
* abuse protection
* API key protection
* server-side secret handling

The Anthropic API key must never be exposed client-side.

---

# 21. ANALYTICS

The current analytics system should remain.

Do not rebuild analytics unnecessarily.

But analytics must become properly associated with the canonical property.

Events should reference `property_id`.

Existing analytics should survive migration.

The admin should be able to view analytics in the context of a property.

---

# 22. LEADS

Leads should also become property-centric.

A lead should be associated with:

```text
property_id
session_id
agent_id
organization_id
```

where appropriate.

The immediate goal is visibility and traceability.

Do NOT build:

* automated email sequences
* CRM pipelines
* lead scoring engine
* notifications
* external CRM integrations

Those belong to later phases.

---

# 23. AUDIT

The existing Larum Audit system is strategically important.

Do NOT rebuild it from scratch during this phase.

Instead, establish the correct architectural relationship:

```text
PROPERTY
   ↓
AUDIT
```

A property may have:

* no audit
* one current audit
* multiple historical audits

The audit should eventually be accessible from the Property workspace.

For this phase, prioritize the data relationship and integration point.

Do not spend the entire phase rebuilding the audit engine.

---

# 24. ADMIN UX PRINCIPLES

Larum Admin must be:

* visual
* premium
* simple
* fast
* intuitive
* operational
* bilingual

It should feel like a professional creative/real-estate operating system.

It should NOT look like:

* a generic enterprise CRM
* a generic SaaS template
* a developer dashboard
* a database management interface

---

# 25. VISUAL ADMIN PRINCIPLE

Use visual cues wherever they improve comprehension.

For properties, show:

* cover image
* property name
* location
* price
* status
* agent
* readiness
* experience status
* lead activity

A property should be recognizable visually without opening it.

Example:

```text
┌──────────────────────────────┐
│ PROPERTY IMAGE               │
│                              │
│ Villa Example                │
│ Marbella · €2,450,000        │
│                              │
│ ● Published                  │
│                              │
│ Experience     ✓             │
│ Concierge      ✓             │
│ Analytics      ✓             │
│ Audit          ✓             │
│                              │
│ [Open Property]              │
└──────────────────────────────┘
```

The exact design is yours to implement, but the information hierarchy should be this clear.

---

# 26. PROPERTY LIST

The Properties section should allow:

* search
* filtering
* sorting
* status filtering
* agent filtering
* organization/client filtering

Each property should have:

* visual thumbnail
* name
* location
* price
* agent
* status
* experience status
* last updated

---

# 27. ADMIN PROPERTY CREATION FLOW

The creation process should be wizard-like where appropriate.

Potential structure:

### STEP 1

Basic information

### STEP 2

Content

### STEP 3

Assets

### STEP 4

Knowledge / Concierge

### STEP 5

Audit

### STEP 6

Experience preview

### STEP 7

Publish

The operator should always know:

* current step
* what is complete
* what is missing
* what happens next

---

# 28. PREVIEW

Before publishing, the operator should be able to preview the real Property Experience.

The preview should use the same production components.

Avoid maintaining a separate "preview version" of the experience if possible.

---

# 29. PUBLISHING

The target experience should eventually be:

```text
Save
↓
Preview
↓
Publish
```

Publishing should change database state/configuration.

It should NOT require a code deployment.

The exact implementation must respect the current Vercel architecture.

---

# 30. URL STRUCTURE

Maintain stable, clean property URLs.

Conceptually:

```text
/properties/{slug}
```

or the existing equivalent if it is already commercially useful.

Do not break existing URLs unnecessarily.

---

# 31. ASSETS

The current system uses externally hosted assets.

That is acceptable during the current development stage.

Do NOT build a sophisticated media pipeline yet.

However, architect the property model so assets can later move to Supabase Storage or another CDN without changing the Property Experience contract.

When real client assets are authorized, we can implement the proper asset pipeline.

---

# 32. AUTHENTICATION

Preserve the existing authentication system.

Admin must remain protected.

The public Property Experience remains publicly accessible.

Do not expose admin data through public routes.

---

# 33. AUTHORIZATION

Introduce the foundations for:

```text
Organization
    ↓
Agent
    ↓
Property
```

But do not over-engineer permissions.

Initially the Larum team can operate with broad internal access.

The architecture should make future role-based access possible.

---

# 34. DATABASE MIGRATION

This is a migration.

It is NOT a database replacement.

Existing tables such as:

* leads
* analytics_events
* sessions

must be preserved.

Add `property_id` relationships where appropriate.

Populate them from the existing property slug.

Only deprecate the old text-based property reference after the new relationship has been validated.

---

# 35. GIT / VERSION CONTROL

This is mandatory.

Before significant architectural changes:

1. Initialize or connect the project to Git.
2. Create an initial baseline commit.
3. Document the current working state.
4. Ensure rollback is possible.

Never make major migrations without version control.

---

# 36. DOCUMENTATION

Create and maintain:

```text
docs/
    ARCHITECTURE.md
    DATABASE.md
    ADMIN.md
    PROPERTY_MODEL.md
    CONCIERGE.md
    ANALYTICS.md
    MIGRATION.md
```

Do not create unnecessary documentation.

Documentation must reflect the actual implementation.

---

# 37. TESTING

Do not attempt to create an enormous testing framework.

At minimum establish smoke tests for:

### Property

* property loads
* property data validates
* property publishes
* bilingual content works

### Concierge

* correct property context
* ES response
* EN response
* fallback works
* rate limit works

### Analytics

* events are recorded
* events belong to correct property

### Admin

* login works
* property creation works
* property editing works
* property publishing works

### Migration

* Madrid survives
* Málaga survives

---

# 38. CRITICAL PRESERVATION RULE

The following existing assets are considered valuable and should NOT be casually rewritten:

* property-loader.js
* current property data contract
* validation system
* `{ value, status, source }` information model
* confirmed / pending / requires-advisor states
* Concierge prompt architecture
* bilingual Concierge architecture
* analytics consent-first design
* current fallback mechanisms
* asset provenance rules
* existing cinematic visual system

Before changing any of these, explain:

1. Why the change is necessary.
2. What risk it introduces.
3. What existing behavior could be affected.
4. How it will be preserved.

---

# 39. WHAT WE ARE NOT BUILDING NOW

DO NOT build:

* Agent Presence
* Portfolio/Agency product
* full CRM
* advanced lead scoring
* email automation
* notifications
* external CRM integrations
* RAG
* embeddings
* vector database
* advanced AI agents
* advanced prospecting intelligence
* content agents
* real-time dashboards
* visitor accounts
* complex multi-tenancy
* sophisticated media pipeline
* complete SaaS billing system

These belong to later phases.

---

# 40. IMPORTANT ARCHITECTURAL RULE

Do not optimize for theoretical scale.

Optimize for:

> **A small Larum team being able to manage real clients and real properties efficiently.**

The target is not millions of properties.

The target is a robust system that can comfortably manage the first:

* 10 properties
* 50 properties
* 100 properties

without requiring developers to manually edit property code.

---

# 41. TARGET END STATE OF THIS PHASE

At the end of this phase, I should be able to open Larum Admin and do this:

```text
LOGIN
 ↓
DASHBOARD
 ↓
CLIENT
 ↓
AGENT
 ↓
PROPERTY
```

Then:

```text
PROPERTY
│
├── Overview
├── Audit
├── Content
├── Assets
├── Experience
├── Concierge
├── Analytics
└── Leads
```

I should be able to:

* create a property
* edit a property
* add bilingual content
* configure its knowledge
* add assets
* preview the experience
* publish the experience
* view Concierge conversations
* view analytics
* view leads
* see audit status
* see what is missing before publication

WITHOUT:

* editing source code
* editing JSON files
* running local scripts manually
* redeploying Vercel for every property
* touching Supabase manually for normal operations

That is the definition of:

# LARUM ADMIN — OPERATIONAL

---

# 42. BILINGUAL REQUIREMENT

The entire system must be designed bilingual from the beginning.

Public-facing content:

**Spanish + English**

Admin interface:

**Spanish + English**

The user should be able to switch language.

Do not create separate applications for each language.

Use one system with a language layer.

---

# 43. DEVELOPMENT PROCESS

Work incrementally.

For every major change:

1. Explain what will change.
2. Explain what existing functionality it affects.
3. Implement the smallest safe change.
4. Test it.
5. Report the result.
6. Only then move to the next step.

Do NOT perform a massive rewrite.

---

# 44. MILESTONES

Work in these milestones.

## MILESTONE 1 — VERSION CONTROL

Git + baseline.

---

## MILESTONE 2 — DATABASE FOUNDATION

Create canonical property entity.

Migrate existing properties.

Add relationships.

Preserve existing data.

---

## MILESTONE 3 — PROPERTY DATA LOADING

Make the Property Experience consume canonical property data.

Madrid and Málaga must continue working.

---

## MILESTONE 4 — CONCIERGE FOUNDATION

Persist conversations.

Add rate limiting.

Preserve current Concierge behavior.

---

## MILESTONE 5 — ADMIN PROPERTY MANAGEMENT

Build:

* property list
* property detail
* create
* edit
* status
* readiness
* publish

---

## MILESTONE 6 — PROPERTY OPERATIONS

Integrate:

* Audit
* Experience
* Concierge
* Analytics
* Leads

into the property workspace.

---

## MILESTONE 7 — CLIENT / AGENT FOUNDATION

Introduce:

```text
Organization
    ↓
Agent
    ↓
Property
```

without building Agent Presence.

---

## MILESTONE 8 — BILINGUAL ADMIN

Complete ES/EN interface and content architecture.

---

## MILESTONE 9 — POLISH

Improve:

* UX
* visual hierarchy
* loading states
* empty states
* errors
* confirmations
* mobile responsiveness
* accessibility

---

## MILESTONE 10 — FINAL VALIDATION

Test the complete workflow:

```text
New Client
 ↓
New Agent
 ↓
New Property
 ↓
Add Content
 ↓
Add Assets
 ↓
Configure Knowledge
 ↓
Audit
 ↓
Preview
 ↓
Publish
 ↓
Public Experience
 ↓
Concierge
 ↓
Analytics
 ↓
Lead
 ↓
Admin
```

This workflow must work without manual database manipulation.

---

# 45. DEFINITION OF DONE

Do NOT consider this phase complete because the UI looks finished.

It is complete only when:

### Operational

A non-technical Larum operator can manage a property from Admin.

### Technical

Property is a canonical database entity.

### Public

Property Experience still works correctly.

### AI

Concierge is property-specific, bilingual and persistent.

### Analytics

Analytics are correctly associated with properties.

### Commercial

A new property can be launched without code changes or deployment.

### Visual

Admin is intuitive and visually coherent.

### Bilingual

ES/EN works throughout the system.

### Secure

Admin and API secrets are properly protected.

### Recoverable

The project is under Git/version control.

---

# 46. FINAL RULE

At the end of this phase, STOP.

Do not begin Agent Presence automatically.

The next phase will be:

# PHASE 2

# AGENT → AGENT PRESENCE

We will define that architecture only after Larum Admin is fully operational.

---

# FIRST ACTION

Before writing implementation code:

1. Inspect the current repository.
2. Inspect the current Supabase schema.
3. Inspect the existing Property Experience.
4. Inspect the existing Admin Panel.
5. Confirm the current architecture against this document.
6. Produce a concrete implementation plan for Milestones 1–10.
7. Identify any conflicts between this plan and the current code.
8. Wait for approval before executing destructive or large-scale changes.

Do NOT rewrite the system from scratch.

Do NOT start Agent Presence.

Do NOT introduce unnecessary frameworks.

The objective is to evolve the existing Larum Property Experience into a coherent operational system.

# END OF PHASE 1 SPECIFICATION
