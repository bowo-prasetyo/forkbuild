import { Structure } from './Structure.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.6.5 — Blueprint Identity & Attribution.
//
// 0.4.6 gave a Structure a portable wire form (application/
// BlueprintPackage.js) and 0.4.6's own ImportBlueprintUseCase.js made a
// deliberate, load-bearing choice: every id crossing that boundary
// regenerates. Alice's `Structure.id = "A123"` becomes Bob's
// `Structure.id = "B987"` — exactly right for local independence (see
// docs/Principles.md, "A Blueprint Package Is Portable Data, Never A
// Live Dependency (0.4.6)"), but it leaves a real question with no
// answer: once Bob has "B987," is there any way for him — or anyone —
// to tell it is the SAME DESIGN Alice originally published? Today,
// there is not. tests/BlueprintExchange.test.js has quietly needed this
// exact idea since 0.4.6 (see its own `geometrySnapshot()` helper,
// which ignores instance ids to compare two Structures' geometry) —
// this module is that helper, promoted from a test fixture into a real,
// documented, reusable part of the domain.
//
// A BlueprintFingerprint is a derived, deterministic identity for a
// blueprint's DESIGN CONTENT — never for the local Structure instance
// that happens to hold it right now. Two Structures with different ids,
// different brick ids, extracted on different devices at different
// times, produce the IDENTICAL fingerprint if their design content is
// equivalent:
//
//   local Structure identity  (Structure#id, Brick#id)
//           ≠
//   blueprint design identity (BlueprintFingerprint)
//
// Two intentionally separate identity spaces, the same separation
// core/PlaceFingerprint.js already draws between a WorldRegion's own
// identity and its derived geographic fingerprint — see this module's
// own "Deliberately excluded" section below for exactly where the
// analogy stops.
//
// ---- What participates in the fingerprint, and why -------------------
//
// INCLUDED — a blueprint's own design content:
//   - every brick's `definitionId`, `position` (x/y/z), and `rotation`
//   - the structure's own `name`, `category`, and `description`
//
// EXCLUDED — local Structure/library identity, never design content:
//   - `Structure#id` and every `Brick#id` — exactly the ids 0.4.6's
//     ImportBlueprintUseCase.js already regenerates on every import;
//     fingerprinting them would make every import of the SAME blueprint
//     produce a DIFFERENT fingerprint, defeating the entire point.
//   - `tags` — considered, and left out FOR NOW: 0.6.3's own
//     "Deliberately excluded" list never gave `CreateBlueprintDialog` a
//     tags field at all (`CreateStructureFromSelectionUseCase` always
//     defaults `tags` to `[]`), so there is no real authored content
//     there yet to decide the semantics of. Once a real tags-authoring
//     UI exists, THAT is the moment to decide whether two blueprints
//     that differ only in tags are the same design (presentation
//     metadata) or different ones (design content) — not speculatively
//     here, before either exists.
//   - group structure — moot today: `core/Structure.js` carries no
//     group/membership concept of its own at all (`core/Group.js` is a
//     Document-level selection concept, never serialized onto a
//     Structure). If a Structure ever gains real, semantic group data,
//     THAT milestone is what decides whether it participates.
//   - creation timestamp, library location, usage history, source
//     library, local author identity — none of these are even fields
//     on `core/Structure.js` or `application/BlueprintPackage.js`'s own
//     wire shape; there is nothing here to exclude so much as nothing
//     here to ever have included by accident.
//
// See docs/Principles.md, "A Blueprint Fingerprint Is Derived From
// Design Content, Never From Local Identity (0.6.5)."
//
// ---- Canonicalization rules -------------------------------------------
//
// Brick ORDER never matters: `structure.bricks` is authored/extracted in
// whatever order a selection happened to iterate, and two structures
// built from the same bricks in a different order must fingerprint
// identically — canonicalizeBlueprint() below sorts bricks by their own
// (position, rotation, definitionId) content, not by array position,
// exactly mirroring core/PlaceIdentity.js#groupRegionsByPlaceIdentity()'s
// own "sorted for cross-replica determinism" discipline one domain over.
//
// Numeric noise IS absorbed, exactly like core/PlaceFingerprint.js's own
// quantize() exists to absorb it for geographic coordinates — a
// duplicated/rotated brick's landing coordinate can come out of grid
// math as `1.9999999999999998` rather than `2` (see core/
// SelectionTransformValidator.js's own header on this exact float
// artifact), and two authors' independently-typed geometry should never
// disagree over noise this small. ROUND_PRECISION rounds every
// coordinate/rotation to 6 decimal places before hashing — tight enough
// that no intentionally different geometry ever collapses together, and
// loose enough to swallow ordinary floating-point jitter.
//
// Pure, deterministic, no network, no persistence, no Structure
// mutation — the same "Level 1" discipline core/PlaceFingerprint.js and
// core/PlaceIdentity.js already committed to for geography, applied here
// to a blueprint's own design content instead.
export const BLUEPRINT_FINGERPRINT_PREFIX = 'bp:';
const ROUND_PRECISION = 1e6;

function roundForFingerprint(value) {
    return Math.round((Number(value) || 0) * ROUND_PRECISION) / ROUND_PRECISION + 0; // +0 avoids a stray "-0"
}

// One brick's DESIGN content, `id` deliberately never read.
function canonicalizeBrick(brick) {
    return {
        definitionId: brick.definitionId,
        position: {
            x: roundForFingerprint(brick.position.x),
            y: roundForFingerprint(brick.position.y),
            z: roundForFingerprint(brick.position.z)
        },
        rotation: roundForFingerprint(brick.rotation)
    };
}

// A stable sort key for one canonicalized brick — content-derived, so
// two structures whose bricks were authored/iterated in a different
// order still produce the same sorted sequence, and therefore the same
// fingerprint. Ties (two bricks with identical geometry) are legitimate
// and harmless: their keys are identical strings, so their relative
// order in the sorted output can never affect the resulting JSON.
function brickSortKey(canonicalBrick) {
    const p = canonicalBrick.position;
    return `${p.x}|${p.y}|${p.z}|${canonicalBrick.rotation}|${canonicalBrick.definitionId}`;
}

// Derives the canonical, order-independent, id-independent design
// content of `structure` — a plain, JSON-safe object, never a
// core/Structure.js instance. Returns null for anything that isn't
// actually a Structure, mirroring core/PlaceFingerprint.js#
// deriveFingerprint()'s own "nothing to derive, return null" posture
// rather than throwing on malformed input.
export function canonicalizeBlueprint(structure) {
    if (!structure || !(structure instanceof Structure)) {
        return null;
    }
    const bricks = structure.bricks
        .map((brick) => ({ key: null, value: canonicalizeBrick(brick) }))
        .map((entry) => ({ key: brickSortKey(entry.value), value: entry.value }))
        .sort((a, b) => (a.key < b.key ? -1 : (a.key > b.key ? 1 : 0)))
        .map((entry) => entry.value);
    return {
        name: (structure.name || '').trim(),
        category: structure.category || 'uncategorized',
        description: (structure.description || '').trim(),
        bricks
    };
}

// The fingerprint itself — `"bp:" + computeContentHash(canonical JSON)`,
// the exact same FNV-1a content hash serializer/contentHash.js already
// computes for a published Document's own integrity check
// (core/ContentReference.js), applied here to a blueprint's canonical
// design content instead of a document's full serialization. `"bp:"`
// mirrors core/PlaceFingerprint.js's own bare, un-prefixed convention
// only loosely — a fingerprint here is a single opaque string (suitable
// for direct display and direct equality), not a `{x,z,radius,kind}`
// shape a caller destructures.
export function deriveBlueprintFingerprint(structure) {
    const canonical = canonicalizeBlueprint(structure);
    if (!canonical) {
        return null;
    }
    return BLUEPRINT_FINGERPRINT_PREFIX + computeContentHash(JSON.stringify(canonical));
}

// True iff both fingerprints are non-null strings and identical —
// deliberately this simple, the same "the entire matching rule" posture
// core/PlaceFingerprint.js#fingerprintsEqual() already commits to.
export function blueprintFingerprintsEqual(a, b) {
    return typeof a === 'string' && typeof b === 'string' && a.length > 0 && a === b;
}

// A short, human-readable form for display — e.g. "bp:7f91…" — never a
// stored or signed fact, exactly like core/PlaceFingerprint.js#
// describeFingerprint()'s own presentation-only posture.
export function describeBlueprintFingerprint(fingerprint) {
    if (!fingerprint || typeof fingerprint !== 'string') {
        return '';
    }
    const hash = fingerprint.startsWith(BLUEPRINT_FINGERPRINT_PREFIX)
        ? fingerprint.slice(BLUEPRINT_FINGERPRINT_PREFIX.length)
        : fingerprint;
    return hash.length > 4
        ? `${BLUEPRINT_FINGERPRINT_PREFIX}${hash.slice(0, 4)}…`
        : `${BLUEPRINT_FINGERPRINT_PREFIX}${hash}`;
}
