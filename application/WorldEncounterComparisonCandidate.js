import { describeWorldSnapshotInspection } from './WorldSnapshotInspection.js';

// 0.9.182 — World Snapshot Comparison UI.
//
// 0.9.181 built `application/WorldSnapshotComparison.js#compareSnapshotWorldPublications(a, b)`
// — a pure join over two already-known `{ publicationId, contentHash }`
// fact bundles, deliberately source-family agnostic (see that file's own
// header) — and stopped there on purpose: "no UI wiring in this
// milestone... giving a Wanderer a genuine second, independently-held
// 'compare with' selection... is left for a later, separate milestone."
// This is that milestone. Before `WorldEncounterCanvas.js` can hand two
// resolved Publication descriptors to `compareSnapshotWorldPublications()`,
// it needs a way to turn EITHER of its two selections (the existing
// `selectedEncounter`, or a new, second "compare with" selection) into
// exactly the descriptor shape that function reads.
//
//   presentation           (WorldEncounterPresentation.js, 0.9.176 —
//        │                  { kind, objectId, ..., sourceFamily })
//        │
//        │      resolvedSelection   (WorldEncounterCanvas's own
//        │           │               { kind, objectId, origin }, 0.9.20)
//        ▼           ▼
//   application/WorldEncounterComparisonCandidate.js   ★ (THIS milestone)
//        describeWorldEncounterComparisonCandidate()
//                       │
//                       ▼
//        { publicationId, contentHash }
//        null   (not a resolved PUBLICATION encounter)
//
// GENERALIZES `describeWorldSnapshotInspection()`'S OWN GATE — DELIBERATELY,
// NOT ACCIDENTALLY. `WorldSnapshotInspection.js` (0.9.177) only ever
// reports a descriptor for a SNAPSHOT-sourced encounter; that restriction
// is that file's own, unrevisited here (see `tests/WorldSnapshotInspection.test.js`
// — LOCAL/PEER/`null` `sourceFamily` all still return `null` from THAT
// function, exactly as before). This file answers a different, narrower
// question: "what is the smallest fact bundle `compareSnapshotWorldPublications()`
// can use, for ANY resolved PUBLICATION encounter, regardless of source
// family?" A SNAPSHOT-sourced encounter's `contentHash` comes from
// `describeWorldSnapshotInspection()`, reused UNMODIFIED; a LOCAL- or
// PEER-sourced encounter's `contentHash` stays honestly `null` — this file
// invents no new plumbing to make it reachable where 0.9.177's own audit
// already found it was not (see that file's own "not reachable here, yet,
// honestly"). `publicationId`, unlike `contentHash`, needs no such
// reachability audit: it is always `presentation.objectId` for a resolved
// `'PUBLICATION'` encounter, regardless of which family served it.
//
// SOURCE-FAMILY AGNOSTIC ON THE WAY IN, EXACTLY LIKE `compareSnapshotWorldPublications()`
// ITSELF IS ON THE WAY OUT. This file never reads, branches on, or reports
// `presentation.sourceFamily` — a LOCAL, PEER, or SNAPSHOT resolved
// selection all reach the same two lines below. Two Publications from
// different families sharing a genuinely-known `contentHash` therefore
// still compare as `SAME_CONTENT`, one layer up, in
// `compareSnapshotWorldPublications()` — this file adds no family gate of
// its own that would prevent that.
//
// PURE. NO I/O. NO REGISTRY ACCESS. NO HASHING OF ITS OWN. This file never
// touches a `WorldDiscoverySourceRegistry`, never computes a hash, and
// never decides where either argument came from — every one of those
// decisions already belongs to whatever computed `presentation`/
// `resolvedSelection` before this function was ever called. Every value
// this file returns is `Object.freeze()`'d; nothing passed in is ever
// mutated. Calling this function twice with byte-identical arguments
// returns a byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS FILE'S CONCERN.
// - **Calling `compareSnapshotWorldPublications()` itself.** This file
//   produces exactly one side of a comparison; `ui/components/
//   WorldEncounterCanvas.js` is the one place that calls both sides'
//   descriptors into that function — see this milestone's own UI wiring.
// - **Any UI, panel, template, or comparison-triggering action.** This file
//   returns a plain, frozen descriptor; nothing here renders anything.
// - **Populating `contentHash` for LOCAL/PEER descriptors where it is not
//   already known.** See "generalizes describeWorldSnapshotInspection()'s
//   own gate," above.

function sameEncounter(presentation, resolvedSelection) {
    return Boolean(resolvedSelection)
        && resolvedSelection.kind === presentation.kind
        && resolvedSelection.objectId === presentation.objectId;
}

// describeWorldEncounterComparisonCandidate({ presentation, resolvedSelection }) ->
//   { publicationId, contentHash }
//   null   (not a resolved PUBLICATION encounter)
//
// `presentation`       — `application/WorldEncounterPresentation.js`'s own
//                          already-computed `describeWorldEncounterPresentation()`
//                          result (0.9.176). Required; `null`/malformed, or
//                          a non-`'PUBLICATION'` `kind`, returns `null`.
// `resolvedSelection`  — the SAME `{ kind, objectId, origin }` (or `null`)
//                          this codebase already resolves selection with
//                          (0.9.20). Required to confirm `presentation` and
//                          `resolvedSelection` name the SAME encounter — a
//                          caller may hand this function values captured at
//                          two different moments, exactly the same defense
//                          `describeWorldSnapshotInspection()` already
//                          holds one layer down.
export function describeWorldEncounterComparisonCandidate({ presentation, resolvedSelection } = {}) {
    if (!presentation || typeof presentation.objectId === 'undefined' || presentation.objectId === null) {
        return null;
    }
    if (presentation.kind !== 'PUBLICATION') {
        return null;
    }
    if (!sameEncounter(presentation, resolvedSelection)) {
        return null;
    }

    const snapshotInspection = describeWorldSnapshotInspection({ presentation, resolvedSelection });

    return Object.freeze({
        publicationId: presentation.objectId,
        contentHash: snapshotInspection ? snapshotInspection.contentHash : null
    });
}
