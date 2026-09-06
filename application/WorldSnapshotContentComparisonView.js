// 0.9.184 — World Snapshot Content Comparison View.
//
// 0.9.181/0.9.182 answered "are these two Publications the same content?"
// without ever rendering either one's own material. 0.9.183 answered "what
// IS this one Snapshot's content?" for a single selection, without any
// knowledge that comparison exists. Both stopped there, on purpose — see
// 0.9.183's own "Recommendation": combining them was named as the natural
// next seam, not built in advance. This milestone is that seam, and only
// that seam:
//
//   Given a Wanderer who has already compared two Publications AND already
//   has each side's own Content View available, show both materials
//   together, alongside the comparison fact that already exists.
//
//   application/WorldSnapshotComparison.js's own descriptor (0.9.181)
//        │  { aPublicationId, bPublicationId, samePublication,
//        │    contentComparison }
//        │
//        │  application/WorldSnapshotContentView.js's own descriptor
//        │  (0.9.183) — one for "Publication A," one for "Publication B"
//        │  { publicationId, contentHash, material, position }  × 2
//        ▼
//   application/WorldSnapshotContentComparisonView.js   ★ (THIS milestone)
//        describeWorldSnapshotContentComparisonView({
//            comparisonResult, contentViewA, contentViewB
//        })
//                       │
//                       ▼
//   { aPublicationId, bPublicationId, contentComparison, aMaterial, bMaterial }
//   null   (no comparison, or either side's own Content View isn't
//           genuinely available for the Publication the comparison names)
//
// A JOIN OVER TWO ALREADY-COMPUTED FACTS, NOTHING MORE. This file performs
// no lookup, no retrieval, and no I/O of its own. It never calls
// `compareSnapshotWorldPublications()` or `describeWorldSnapshotContentView()`
// itself — a caller already holds all three arguments, each produced by its
// own already-existing, unmodified module, before this function is ever
// invoked.
//
// CRITICAL RULE — THIS FILE NEVER RECOMPUTES CONTENT IDENTITY FROM THE
// MATERIAL. `contentComparison` is `comparisonResult.contentComparison`,
// forwarded verbatim — never re-derived by reading `aMaterial`/`bMaterial`'s
// own `contentHash` and comparing them again. `compareSnapshotWorldPublications()`
// (0.9.181) remains the ONE source of truth for identity; this file is only
// ever a source of truth for what is DISPLAYED. Two independent facts, one
// composition, exactly like the brief that requested this milestone
// insists.
//
// A DESCRIPTOR ONLY WHEN BOTH SIDES HAVE GENUINELY AVAILABLE MATERIAL — AND
// IT IS GENUINELY THEIRS. `contentViewA` must be truthy AND its own
// `publicationId` must equal `comparisonResult.aPublicationId`; the
// identical check runs for `contentViewB` against `comparisonResult.bPublicationId`.
// Both conditions failing to hold collapses this function to `null` — never
// a partial descriptor with one side missing, and never a descriptor built
// from a Content View that happens to be available but names the WRONG
// Publication (the same "two arguments captured at different moments"
// hazard `describeWorldSnapshotContentView()`'s own header already
// describes, one layer up: a caller can hold a stale `contentViewA` for a
// PREVIOUS primary selection while `comparisonResult` already describes a
// freshly-changed one).
//
// MISSING MATERIAL MEANS NO FABRICATED COMPARISON VIEW — NEVER A SILENT
// RETRIEVAL, SUBSTITUTION, OR MATERIALIZATION OF THE MISSING SIDE. If `A`'s
// material is available and `B`'s is not, this function returns `null` —
// the comparison FACT (`comparisonResult`) may still exist and be shown on
// its own, entirely independent of this file, but the content comparison
// VIEW is not available. This file has no means to retrieve, discover, or
// materialize anything in the first place — it only reads whatever
// `contentViewB` it was handed.
//
// `aMaterial`/`bMaterial` REUSE `describeWorldSnapshotContentView()`'s OWN
// REPRESENTATION VERBATIM — NO NEW MATERIAL ABSTRACTION. Each of
// `aMaterial`/`bMaterial` is the exact `{ publicationId, contentHash,
// material, position }` object 0.9.183 already produces for that side,
// forwarded by reference, never re-shaped, never having a field added or
// removed. A caller wanting "just the loaded `Publication` domain object"
// already knows to read `.material` off of either one, exactly as it does
// for a single, non-comparison Content View today.
//
// SAME CONTENT DOES NOT MEAN ONE OBJECT. When `contentComparison` is
// `SAME_CONTENT`, `aPublicationId !== bPublicationId` remains entirely
// possible (indeed, the interesting case) — this file never collapses the
// two into a single combined identity, never omits one side because the
// other "already shows the same thing," and always reports both
// `aMaterial`/`bMaterial` as their own, fully independent objects, even
// when their own `material`/`contentHash` are byte-identical. Two
// Publications at two different World positions remain two World objects;
// this file carries `position` on each side's own `aMaterial`/`bMaterial`
// exactly as 0.9.183 already does, and never compares or merges the two.
//
// PURE. NO I/O. NO REGISTRY ACCESS. NO NEW MATERIAL LOADER. NO HASHING.
// This file never touches `WorldDiscoverySourceRegistry`, never calls
// `inspectWorldEncounterMaterial()`/`loadWorldEncounterMaterial()`, never
// calls `compareSnapshotWorldPublications()` or
// `describeWorldSnapshotContentView()` itself, and never computes a content
// hash of its own. Every value this file returns is `Object.freeze()`'d;
// nothing passed in is ever mutated. Calling this function twice with
// byte-identical arguments returns a byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **"Merge identical Snapshots," "replace this Snapshot with the other,"
//   or any deduplication/removal/replacement action.** Per the brief that
//   requested this milestone: `SAME_CONTENT` is shown as a fact only,
//   exactly like 0.9.181/0.9.182 already insist. This file offers no
//   action of any kind — it is a read-only descriptor.
// - **Side-by-side as a REQUIRED visual layout.** This file returns two
//   independent fields, `aMaterial`/`bMaterial`; whether a caller renders
//   them side by side, stacked, or as two independently-collapsible
//   regions is a UI layout choice made one layer up, not a constraint this
//   descriptor's own shape imposes.
// - **Loading, discovering, resolving, or materializing either side's own
//   material.** This file consumes two already-loaded Content Views; it
//   never triggers loading a new one, and has no means to.
// - **Rendering arbitrary HTML/media/application content, decoding
//   document bytes, or interpreting either `material` field in any way.**
//   Both are forwarded exactly as 0.9.183 already produces them.
// - **Trust, verified, freshness, ranking, or any comparison vocabulary
//   beyond `SAME_CONTENT`/`DIFFERENT_CONTENT`/unknown, all forwarded
//   verbatim from `application/WorldSnapshotComparison.js`.** Inherited
//   unchanged from every file in this chain.
// - **Any UI, panel, template, or rendering technology choice.** This file
//   returns a plain, frozen, comparison-view-SHAPED object; wiring it into
//   `ui/components/WorldEncounterCanvas.js` is this milestone's own
//   separate, smaller UI change, not this file's own concern.

function contentViewMatches(publicationId, contentView) {
    return Boolean(contentView) && contentView.publicationId === publicationId;
}

function validPublicationId(value) {
    return typeof value === 'string' && value.length > 0;
}

// describeWorldSnapshotContentComparisonView({ comparisonResult, contentViewA, contentViewB }) ->
//   { aPublicationId, bPublicationId, contentComparison, aMaterial, bMaterial }
//   null   (no comparison result, or either side's own Content View isn't
//           genuinely available for the Publication the comparison names)
//
// `comparisonResult` — `application/WorldSnapshotComparison.js`'s own
//                        already-computed `compareSnapshotWorldPublications()`
//                        result (0.9.181) — `{ aPublicationId, bPublicationId,
//                        samePublication, contentComparison }`. Required;
//                        `null`/malformed (missing either publicationId)
//                        returns `null`.
// `contentViewA`/`contentViewB` — each `application/WorldSnapshotContentView.js`'s
//                        own already-computed `describeWorldSnapshotContentView()`
//                        result (0.9.183) — `{ publicationId, contentHash,
//                        material, position }` — or `null`. Required to
//                        genuinely name the SAME Publication `comparisonResult`
//                        itself already names on that side; absent, or
//                        naming a different `publicationId`, returns `null`.
export function describeWorldSnapshotContentComparisonView({ comparisonResult, contentViewA, contentViewB } = {}) {
    if (!comparisonResult) {
        return null;
    }
    if (!validPublicationId(comparisonResult.aPublicationId) || !validPublicationId(comparisonResult.bPublicationId)) {
        return null;
    }
    if (!contentViewMatches(comparisonResult.aPublicationId, contentViewA)) {
        return null;
    }
    if (!contentViewMatches(comparisonResult.bPublicationId, contentViewB)) {
        return null;
    }

    return Object.freeze({
        aPublicationId: comparisonResult.aPublicationId,
        bPublicationId: comparisonResult.bPublicationId,
        contentComparison: comparisonResult.contentComparison,
        aMaterial: contentViewA,
        bMaterial: contentViewB
    });
}
