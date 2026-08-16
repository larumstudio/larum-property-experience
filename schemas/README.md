# LPE-01 / LPE-02 schemas

Versioned domain contracts and read-only adapters for the legacy property packs.
The current runtime continues to consume the legacy JSON shape. These schemas are
used by the onboarding validator and future implementation waves.

## LPE-02 consume

`deriveManifest(slug)` in `adapters/index.js` is the canonical Experience Manifest V1 deriver.
`properties/{slug}/experience.json` is a derived snapshot and must deep-equal `deriveManifest(slug)`.
The runtime consumes only `modules[].order` and `modules[].visible`.
`module-registry.js` is validation/compose bindings for the same 9 `MODULE_IDS`. It is not a new id list.

