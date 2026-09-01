import { WorldEncounterKind, deriveWorldEncounters } from './WorldEncounter.js';

// 0.9.19 — World Encounter Provenance-Aware Selection.
//
// Since 0.9.4, `ui/components/WorldEncounterCanvas.js` has named a
// selected encounter as exactly `{ kind, objectId }` — enough to look it
// up in a single-source World, because a `kind`+`objectId` pair was
// always unique there. 0.9.7's own `assembleWorldDiscoveryInputs()`
// deliberately ended that guarantee: "Assembly is not reconciliation... if
// peer A and peer B both hand over a publication with the same `id`, the
// assembled `publications` array contains that record twice." Since then,
// a `WorldEncounterKind.PUBLICATION` + `objectId` pair can legitimately
// name TWO OR MORE encounters at once — one per `WorldDiscoverySource`
// that contributed a placement for it. Nothing in this codebase has ever
// named the fact that distinguishes them: WHICH source a particular
// encounter came from. This file is that name, and the one function that
// derives it from what already exists.
//
//   WorldDiscoverySource (0.9.5)          WorldDiscoverySource (0.9.5)
//     origin: 'local'                       origin: 'peer:did:key:...'
//            │                                       │
//            ▼                                       ▼
//   deriveWorldEncounters()              deriveWorldEncounters()   (0.9.0,
//            │            each source's own encounters,  unmodified,
//            │            computed independently          called once
//            │                                            per source)
//            └──────────────────┬────────────────────────┘
//                                ▼
//         core/WorldEncounterSelectionIdentity.js   ★ (THIS milestone)
//              deriveWorldEncounterSelectionIdentities()
//                                │
//                                ▼
//              [{ kind, objectId, origin }, ...]
//                                │
//                                ▼
//         application/WorldEncounterSelectionResolution.js   (THIS
//              milestone — matches an existing { kind, objectId }
//              selection against this list; see that file's own header)
//
// A SELECTION IDENTITY IS `{ kind, objectId, origin }` — NOTHING MORE,
// NOTHING LESS. `kind` and `objectId` are 0.9.0's and 0.9.4's own fields,
// unchanged; `origin` is 0.9.5's own field, unchanged. This file invents
// no fourth field — no `sourceId`, no `connectionId`, no `receivedAt` —
// and no scalar identifier collapsing all three into one string (a
// `"peer:did:key:...|PUBLICATION|pub-1"` composite key). Three separate,
// already-named facts, carried as three separate fields, exactly like
// `core/WorldDiscoverySource.js`'s own `origin` sits alongside
// `publications`/`placements`/etc. rather than being folded into them.
//
// ORIGIN IS ATTACHED TO THE ENCOUNTER, NEVER TO A RECORD. 0.9.7's own
// header drew an explicit line: "Provenance stays at the source
// container — it never leaks into a record... no record assembled here
// ever gains a `sourceOrigin`... This is what lets `deriveWorldEncounters()`
// ...go on knowing nothing about whether a publication came from local
// storage or a remote peer." This file does not contradict that. It never
// modifies `core/WorldEncounter.js`, never adds a field to a `Publication`/
// `WorldPlacement`/`AvatarProfile`/`AvatarPresence` record, and never
// calls `assembleWorldDiscoveryInputs()` at all — mixing sources together
// before deriving encounters is exactly what would make origin
// unrecoverable, so this file never does it. Instead it calls 0.9.0's own
// `deriveWorldEncounters()` ONCE PER SOURCE, on that source's own six
// arrays alone, and attaches `origin` to the ENCOUNTER `deriveWorldEncounters()`
// itself already produced — a new fact about a new (0.9.0-invented) kind
// of value, not a mutation of an old one.
//
// THIS RECOMPUTES NOTHING 0.9.0 DIDN'T ALREADY COMPUTE. Every encounter
// this file names is produced by an unmodified call to
// `deriveWorldEncounters()` — same joins, same "present-tense location
// required" rule, same two kinds. If a publication has no placement in a
// given source, that source contributes no selection identity for it,
// exactly as 0.9.0 already refuses to encounter it at all.
//
// PER-SOURCE DERIVATION, NOT A FILTER OVER AN ALREADY-ASSEMBLED RESULT.
// Calling `deriveWorldEncounters()` once per source (rather than once
// over `assembleWorldDiscoveryInputs()`'s combined six arrays) is the one
// deliberate structural choice this file makes, and it is what makes
// `origin` derivable without guessing: within a single source's own
// arrays, `anchorCount`/`placementCount` on a resulting encounter describe
// only that source's own contribution, never a cross-source total. A
// caller wanting the combined, origin-blind reading this codebase has
// always shown (title, signed status, combined anchor/placement counts)
// still has it, unchanged, via `application/WorldEncounterIntegration.js`
// (0.9.8) — this file is an entirely separate, parallel answer to a
// different question ("which source?"), never a replacement for the
// existing one ("what does the World look like?").
//
// EVERY MATCHING SOURCE PRODUCES ITS OWN IDENTITY — NEVER ONE PICKED FOR
// THE CALLER. If two sources both placed the same publication, this file
// names two selection identities for it, one per origin, in source order.
// It never deduplicates them down to one, never picks "the first," "the
// local one," or "the most recent" — see
// `application/WorldEncounterSelectionResolution.js`'s own header for why
// surfacing every candidate, rather than guessing one, is this milestone's
// entire point.
//
// TWO KINDS, NEVER A THIRD — inherited unchanged from 0.9.0.
// `describeWorldEncounterSelectionIdentity()` validates `kind` against
// `WorldEncounterKind.PUBLICATION`/`WorldEncounterKind.AVATAR` (the same
// enum 0.9.0 already defined, imported rather than retyped) and returns
// `null` for anything else.
//
// NO SCORE, RANK, TRUST, VERIFIED, "PREFERRED," OR COMPARISON VOCABULARY
// OF ANY KIND — inherited unchanged from every file in this chain. This
// file names WHICH sources contributed a matching encounter; it never
// judges between them.
//
// MALFORMED INPUT DEGRADES GRACEFULLY, NEVER THROWS.
// `describeWorldEncounterSelectionIdentity()` returns `null` for a
// missing/invalid `kind`, a missing/empty `objectId`, or a missing/empty
// `origin`. `deriveWorldEncounterSelectionIdentities()` treats a missing,
// non-array, or malformed `sources` argument (or a malformed entry within
// it) exactly as 0.9.7's own `assembleWorldDiscoveryInputs()` already
// does — contributing nothing for that entry, never throwing, never
// discarding the valid entries on either side of it.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK. Every
// value this file returns is `Object.freeze()`'d; nothing passed in is
// ever mutated. Calling either function twice with byte-identical
// arguments returns a byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Fetching, WebRTC requests, peer messaging, or `localStorage`
//   access of any kind.** This file is handed already-described sources;
//   it never obtains one itself.
// - **Signature verification or any trust decision.** See "No score,
//   rank, trust..." above.
// - **Ranking, deduplication, or automatic selection of one origin among
//   several matching candidates.** See "Every matching source produces
//   its own identity," above.
// - **Loading or interpreting the material a selection identity names.**
//   A `WorldEncounterSelectionIdentity` is a name, never the thing named.
// - **Matching an existing `{ kind, objectId }` UI selection against this
//   list.** That is `application/WorldEncounterSelectionResolution.js`'s
//   own job, immediately below this file in the diagram above.

function isDescribedSource(source) {
    return Boolean(source) && typeof source === 'object' && typeof source.origin === 'string' && source.origin.length > 0;
}

// Pure. Validates and names one provenance-qualified selection identity —
// see this file's own header, "A selection identity is
// `{ kind, objectId, origin }`." Returns `null`, never throws, for a
// `kind` outside `WorldEncounterKind`, a missing/empty `objectId`, or a
// missing/empty `origin`.
export function describeWorldEncounterSelectionIdentity(candidate) {
    const { kind, objectId, origin } = candidate && typeof candidate === 'object' ? candidate : {};
    if (kind !== WorldEncounterKind.PUBLICATION && kind !== WorldEncounterKind.AVATAR) {
        return null;
    }
    if (typeof objectId !== 'string' || objectId.length === 0) {
        return null;
    }
    if (typeof origin !== 'string' || origin.length === 0) {
        return null;
    }
    return Object.freeze({ kind, objectId, origin });
}

// Pure. `true` only when `a` and `b` are both well-formed selection
// identities naming the exact same `kind`, `objectId`, AND `origin`.
// Never throws — a missing or malformed argument simply returns `false`.
export function worldEncounterSelectionIdentitiesMatch(a, b) {
    if (!a || typeof a !== 'object' || !b || typeof b !== 'object') {
        return false;
    }
    return a.kind === b.kind && a.objectId === b.objectId && a.origin === b.origin;
}

// The one entry point a caller actually uses — every currently-derivable
// selection identity, across every supplied source, in source order and
// each source's own encounter order. See this file's own header,
// "Per-source derivation" and "Every matching source produces its own
// identity." `sources` is exactly what `assembleWorldDiscoveryInputs()`
// (0.9.7) also takes — an array of already-described `WorldDiscoverySource`
// bundles — but this file never calls that function itself; see "Origin is
// attached to the encounter, never to a record," above.
export function deriveWorldEncounterSelectionIdentities(sources) {
    const list = Array.isArray(sources) ? sources : [];
    const identities = [];

    for (const source of list) {
        if (!isDescribedSource(source)) {
            continue;
        }
        const encounters = deriveWorldEncounters(source);
        for (const row of encounters.publications) {
            const identity = describeWorldEncounterSelectionIdentity({ kind: row.kind, objectId: row.objectId, origin: source.origin });
            if (identity) {
                identities.push(identity);
            }
        }
        for (const row of encounters.avatars) {
            const identity = describeWorldEncounterSelectionIdentity({ kind: row.kind, objectId: row.objectId, origin: source.origin });
            if (identity) {
                identities.push(identity);
            }
        }
    }

    return Object.freeze(identities);
}
