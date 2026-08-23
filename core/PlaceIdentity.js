import { deriveFingerprint, fingerprintKey, fingerprintsEqual } from './PlaceFingerprint.js';

// 0.5.4 — Place Identity & Geographic Claim Resolution.
//
// The "Level 1 — Local equivalence" half of this milestone's own design
// conversation:
//
//   Given several regions already available to one client, determine
//   whether they are geographically equivalent. This should be pure,
//   deterministic, no network, no persistence, no World mutation.
//
// This module answers exactly that, and nothing more. It NEVER merges
// two regions, NEVER mutates a WorldRegion, NEVER touches a Command or
// `World#toJSON()`, and NEVER reads a claim, a store, or a network of
// any kind — see core/WorldRegion.js's own header on why a region's
// CENTER and identity are treated as immutable everywhere else in this
// codebase; this module extends that same restraint to the new question
// "might two regions be the same place," rather than relaxing it.
//
// The one thing every function here refuses to say is "yes." A matching
// core/PlaceFingerprint.js#fingerprintKey() means "these two regions are
// CANDIDATES for describing the same place" — never proof, never an
// assertion strong enough to justify merging their naming claims into
// one without a human ever having said so. See docs/Principles.md,
// "Geographic Similarity Suggests Identity; It Never Mutates Identity
// (0.5.4)."
export class PlaceIdentity {
    // A named, immutable pairing of two regions' own fingerprints and
    // the single boolean verdict this milestone commits to: are they
    // CANDIDATES for the same geographic place? `candidate` is
    // deliberately the only word used anywhere in this codebase for
    // that verdict — never "same," never "matched," never "identical" —
    // because none of those words are true. This class exists mostly so
    // a caller (a test, a future UI) has one stable shape to destructure
    // rather than a bare object whose fields might drift.
    constructor({ candidate, fingerprintA, fingerprintB }) {
        this.candidate = candidate;
        this.fingerprintA = fingerprintA;
        this.fingerprintB = fingerprintB;
    }
}

// derivePlaceIdentity(regionA, regionB) — the exact function name the
// design conversation itself proposed. Pure: derives both regions' own
// PlaceFingerprint (core/PlaceFingerprint.js#deriveFingerprint()) and
// reports whether they match. Neither region is read a second time,
// mutated, or looked up anywhere — everything this function needs is
// whatever the caller already passed in.
export function derivePlaceIdentity(regionA, regionB, options = {}) {
    const fingerprintA = deriveFingerprint(regionA, options);
    const fingerprintB = deriveFingerprint(regionB, options);
    return new PlaceIdentity({
        candidate: fingerprintsEqual(fingerprintA, fingerprintB),
        fingerprintA,
        fingerprintB
    });
}

// Partitions `regions` into equivalence classes by fingerprint —
// deliberately an exact-key partition, not a similarity threshold or
// any kind of pairwise "close enough" chaining: two regions are grouped
// together iff their quantized fingerprints are byte-identical, full
// stop. This is what keeps the whole operation an honest EQUIVALENCE
// relation (reflexive, symmetric, and transitive by construction — see
// this module's own tests for the direct proof) rather than a fuzzy
// clustering algorithm whose result could depend on which regions
// happened to be compared in which order. A region with unusable
// geometry (core/PlaceFingerprint.js#deriveFingerprint() returning null)
// is simply omitted, never thrown for.
//
// Returns `[{ fingerprint, regions }]`, sorted by fingerprint key for
// deterministic ordering across replicas that discovered these same
// regions in a different order — the same "ties broken for cross-
// replica determinism" discipline core/PlaceNamingView.js#namingView()
// already established one milestone over.
export function groupRegionsByPlaceIdentity(regions = [], options = {}) {
    const groups = new Map();
    for (const region of regions) {
        const fingerprint = deriveFingerprint(region, options);
        if (!fingerprint) {
            continue;
        }
        const key = fingerprintKey(fingerprint);
        if (!groups.has(key)) {
            groups.set(key, { fingerprint, regions: [] });
        }
        groups.get(key).regions.push(region);
    }
    return Array.from(groups.values())
        .sort((a, b) => fingerprintKey(a.fingerprint).localeCompare(fingerprintKey(b.fingerprint)));
}
