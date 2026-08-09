# Adding a property

One folder, three JSON files, one line in the registry. No code changes.

```bash
cp -r properties/_template properties/my-property
```

1. **Fill the three files** in `properties/my-property/`:
   - `content.json` — everything the visitor reads: identity, the day sequence, spatial zones, DNA, setting, bilingual section copy, arrival chapters.
   - `knowledge.json` — what the concierge knows: facts with their verification status, systems, space descriptions, surroundings, intents, interest signals, qualification triggers.
   - `assets.json` — hero image/video, wide band image, property film, per-space media.

2. **Drop the assets** into `assets/` and point `assets.json` at them.

3. **Register it** in `properties/index.json`:

```json
{ "default": "madrid", "order": ["madrid", "marbella", "my-property"] }
```

4. **Validate before showing it to anyone:**

```bash
node validate-content.js my-property
```

Issues block the experience and must be fixed. Warnings mean it runs but is not demo-final — placeholder assets, unconfirmed facts, missing Spanish copy.

5. **Rebuild the offline pack** so the demo also works from `file://`:

```bash
node build-pack.js
```

## Delivering photography

Drop files into `assets/` using these names. The loader picks them up as soon as `assets.json` points at them — no code changes, no resizing needed on your side.

| Purpose | Filename | Ideal size |
|---|---|---|
| Hero (full screen, first impression) | `hero-{slug}.jpg` | 2400×1600, landscape |
| Wide band (between sections) | `band-{slug}.jpg` | 2400×1600, landscape |
| A space | `space-{slug}-{space-name}.jpg` | 1800×1200, landscape |
| Hero video (optional) | `hero-{slug}.mp4` | 1080p, muted, 10–20s loop |

Space filenames use the space name in lowercase with hyphens, exactly as written in `content.json` → `sceneSpaces`. For Marbella, `Infinity pool` becomes `space-marbella-infinity-pool.jpg`.

Then in `properties/{slug}/assets.json`:

```json
"hero": { "fallbackImage": "assets/hero-marbella.jpg" },
"bandImage": "assets/band-marbella.jpg",
"authorised": true,
"spaces": {
  "Infinity pool": { "image": "assets/space-marbella-infinity-pool.jpg" }
}
```

Set `"authorised": true` only once the agency has given it in writing. Until then leave it `false` and keep a `provenance` block on each stand-in, so nothing untraceable can ship — the validator checks both.

Files or links both work. Files named as above are fastest, since they go straight in. A folder link (Drive, WeTransfer, Dropbox) is fine too — unnamed is fine, they can be sorted on arrival. What matters is knowing which space each photo belongs to.

## The rules that matter

- **`sceneSpaces` and `knowledge.property.spaces` must agree.** Every space named in the day sequence needs a description, or the space overlay opens empty. The validator enforces this.
- **Both languages, always.** `copy`, `spatialNodeDetails`, `arrival` and space `descriptionEs` all need an `en` and an `es`. The validator enforces this.
- **Facts carry their status.** `confirmed` means the agency verified it. `requires-advisor` makes the concierge defer instead of inventing an answer. Never mark something `confirmed` to silence a warning.
- **`referencePrice` and `defaultRegion`** drive the acquisition calculator. The region must exist in `purchase-config.json` or the rates fall back to generic defaults.
- **Third-party assets need written authorisation** before publication, and `noindex/nofollow` stays on while provisional references are in use.
