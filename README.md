# Larum Property Experience — Prototype

Private, non-indexed prototype for the M1558 Madrid residence and Villa Casia in Nueva Andalucía.

## Important

The current visual references are temporary public references for a private concept demonstration. Do not publish or distribute until the relevant agency authorises the use of the property identity and assets. `noindex/nofollow` stays on while provisional references are in use.

## Run locally

```bash
python -m http.server 4173
```

Then open http://localhost:4173/ — the experience — or http://localhost:4173/admin.html for the analytics panel, which asks for a Supabase Auth sign-in.

To share the prototype as loose files (no server), run `node build-pack.js` first so it also works from `file://`.

## How a property is defined

Everything about a specific residence lives in `properties/{slug}/`. Nothing property-specific is hardcoded in `app.js`.

```text
properties/
├── index.json          registry: default property, display order, publication rules
├── _template/          copy this to start a new property
├── madrid/
│   ├── content.json    what the visitor reads
│   ├── knowledge.json  what the concierge knows
│   └── assets.json     hero, band, film, per-space media
└── marbella/
```

Adding a property is a folder plus one line in `index.json`. See `properties/README.md` for the full procedure and the rules the validator enforces.

## Working on content

```bash
node validate-content.js            # all properties
node validate-content.js madrid     # one property
node validate-content.js --strict   # warnings fail too
node build-pack.js                  # regenerate the offline pack
```

The validator separates **issues** (the experience breaks — must be fixed) from **warnings** (it runs, but is not demo-final: placeholder assets, facts the agency has not confirmed, missing Spanish copy).

Run `build-pack.js` after any content change if you intend to share the prototype offline. Served over http:// the JSON files are read directly and the pack is ignored.

## Assets

Point `properties/{slug}/assets.json` at authorised media:

- `hero.video`, `hero.poster`, `hero.fallbackImage`
- `bandImage`
- `propertyFilm`
- `spaces[*].image`, `spaces[*].video`

The interface falls back from video to poster/image when needed. Assets take precedence over any image referenced in `content.json`.

## Leads and rates

Set the enquiry destination in `contact-config.json`. The prototype uses `mailto`; replace it with a secure endpoint before public production.

Acquisition calculator rates live in `purchase-config.json`. Each property picks its starting region through `content.defaultRegion`; every field stays editable by the visitor.
