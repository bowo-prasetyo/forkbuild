import { Structure } from '../core/Structure.js';
import { BlueprintAttribution } from '../core/BlueprintAttribution.js';

// 0.4.6 — Blueprint Sharing & Exchange.
//
// The portable package format for moving a core/Structure.js between
// installations/devices — the exact same shape identity/IdentityExport.js
// already established one domain over for a LocalIdentity (0.2.48):
// a small, versioned, JSON-safe envelope around the one thing that needs
// to survive the trip. Unlike an identity package, there is no secret to
// protect and no passphrase — a Structure is reusable geometry, not key
// material, so this is deliberately plaintext, human-readable JSON.
//
// The central invariant mirrors application/Structure.js's own: a
// blueprint package carries a Structure's full VALUE (id, name, category,
// tags, description, every brick), never a reference to the library or
// device it was exported from. See docs/Principles.md, "A Blueprint
// Package Is Portable Data, Never A Live Dependency (0.4.6)" — deleting
// the original Structure, or the device that exported it, has zero effect
// on a package already written to disk.
//
// `kind` is a plain discriminator (not a security boundary) so a
// malformed or unrelated JSON file — an exported identity, a saved
// Document, random JSON — fails BlueprintImportValidator's very first
// check with a specific message, rather than an obscure one three fields
// deep. `schemaVersion` is the number IdentityExport.js's own header
// calls "room for future additive evolution" — this milestone's own
// design conversation named `tags`/`author`/`thumbnail`/`description` as
// exactly the kind of field a later schema version could add without
// breaking a v1 package's own importability.
//
// 0.6.6 — Decentralized Blueprint Exchange. `attributions` is exactly
// that kind of additive field, arriving without a schema-version bump:
// an OPTIONAL array of portable BlueprintAttribution publications (see
// application/BlueprintAttributionPublicationValidator.js — each entry is
// simply `attribution.toJSON()`, already self-describing) traveling
// alongside the design they're about. Deliberately NOT a new "shared
// blueprint" domain object and NOT a second package `kind` — this
// milestone's own design conversation was explicit that a Blueprint
// Package and a BlueprintAttributionPublication stay two independent
// portable things, and this field is only ever the CONVENIENCE of moving
// both in one file at once, never a merger of the two:
//
//   Blueprint Share Package
//   ├── structure     — the actual reusable design (unchanged, 0.4.6)
//   └── attributions   — zero or more signed, independently-verifiable
//                        assertions ABOUT that design (0.6.6, optional)
//
// A Structure imported from a package with no `attributions` at all (or
// from a package built before this field existed) is exactly as usable
// as one that arrived with several — see docs/Principles.md, "Attribution
// Travels With A Blueprint, But Never Becomes Part Of It (0.6.6)."
export const CURRENT_SCHEMA_VERSION = 1;
export const BLUEPRINT_KIND = 'forkbuild.blueprint';

// Builds the plain, JSON-safe export package for one Structure. Pure —
// knows nothing about StorageProvider, files, or downloads; those are
// application/ExportBlueprintUseCase.js's and the UI's own concerns.
// Deterministic: the same Structure (and the same attributions) produces
// byte-identical JSON on every call, because Structure#toJSON() itself
// already emits fields and bricks in a fixed order — see
// tests/BlueprintExchange.test.js, Phase F.
//
// `attributions` (0.6.6): an array of signed BlueprintAttribution
// instances — never raw JSON, the same "only ever accept the real
// domain object, never a caller's plain object" discipline every other
// build*Package()/build*Publication() function in this codebase already
// holds. Omitted (or empty) entirely from the resulting package rather
// than written out as `attributions: []` — a plain Structure-only export
// stays byte-for-byte what it always was before this milestone, so
// nothing downstream needs a version bump to keep parsing it.
export function buildBlueprintPackage(structure, { attributions = [] } = {}) {
    if (!structure || !(structure instanceof Structure)) {
        throw new Error('BlueprintPackage: a Structure instance is required');
    }
    if (!Array.isArray(attributions) || attributions.some((a) => !(a instanceof BlueprintAttribution))) {
        throw new Error('BlueprintPackage: attributions must be an array of BlueprintAttribution instances');
    }
    const pkg = {
        kind: BLUEPRINT_KIND,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        structure: structure.toJSON()
    };
    if (attributions.length > 0) {
        pkg.attributions = attributions.map((attribution) => attribution.toJSON());
    }
    return pkg;
}
