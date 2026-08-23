import { Structure } from '../core/Structure.js';

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
export const CURRENT_SCHEMA_VERSION = 1;
export const BLUEPRINT_KIND = 'forkbuild.blueprint';

// Builds the plain, JSON-safe export package for one Structure. Pure —
// knows nothing about StorageProvider, files, or downloads; those are
// application/ExportBlueprintUseCase.js's and the UI's own concerns.
// Deterministic: the same Structure produces byte-identical JSON on every
// call, because Structure#toJSON() itself already emits fields and bricks
// in a fixed order — see tests/BlueprintExchange.test.js, Phase F.
export function buildBlueprintPackage(structure) {
    if (!structure || !(structure instanceof Structure)) {
        throw new Error('BlueprintPackage: a Structure instance is required');
    }
    return {
        kind: BLUEPRINT_KIND,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        structure: structure.toJSON()
    };
}
