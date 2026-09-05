// 0.9.181 — World Snapshot Comparison.
//
// 0.9.180's own boundary audit closed the decentralized Snapshot -> World
// participation lifecycle and explicitly recommended AGAINST another
// Snapshot-specific infrastructure milestone. This milestone is
// deliberately not one: it adds no discovery, no retrieval, no
// materialization, and no new World Encounter kind. It answers a
// product-level question the completed lifecycle now makes answerable for
// the first time:
//
//   When a Wanderer already knows two Publications' own already-computed
//   facts, can they tell whether those two Publications carry the SAME
//   content, or DIFFERENT content?
//
//   application/WorldSnapshotInspection.js's own descriptor (0.9.177)
//        │        { kind: 'PUBLICATION', objectId, publicationId,
//        │          contentHash, position }
//        │
//        │  (any second such descriptor, or any other already-known
//        │   { publicationId, contentHash } pair — see "source-family
//        │   agnostic," below)
//        ▼
//   application/WorldSnapshotComparison.js   ★ (THIS milestone)
//        compareSnapshotWorldPublications(a, b)
//                       │
//                       ▼
//   { aPublicationId, bPublicationId, samePublication, contentComparison }
//   null   (either side missing, or lacking a genuine publicationId)
//
// A JOIN OVER TWO ALREADY-KNOWN FACTS, NOTHING MORE. This file performs no
// lookup of its own. It takes two plain descriptors — each already
// carrying a `publicationId` and (when knowable) a `contentHash` — and
// states the relationship between them. Nothing here decides where either
// descriptor came from, resolves a selection, loads material, or verifies
// a signature; every one of those decisions has already happened, upstream,
// by the time either descriptor reaches this function.
//
// SOURCE-FAMILY AGNOSTIC, ON PURPOSE. `describeWorldSnapshotInspection()`
// (0.9.177) only ever produces a `contentHash` for a SNAPSHOT-sourced
// selection — the ONE World Encounter family whose registered `origin`
// string happens to encode it today (see that file's own header). This
// function does not require, check, or even accept a `sourceFamily`/`kind`
// field at all: it reads exactly two fields, `publicationId` and
// `contentHash`, off of whatever descriptor it is handed. A LOCAL or PEER
// descriptor compares exactly as well as a SNAPSHOT one, PROVIDED its
// `contentHash` is genuinely known to the caller — this function neither
// invents one nor refuses to compare merely because the source family
// differs. Two descriptors from different families sharing an identical,
// honestly-known `contentHash` compare as `SAME_CONTENT`, exactly like two
// Snapshots would. This is deliberate: content identity, not provenance,
// is what this milestone was asked to make useful (see this file's own
// commit message and the 0.9.181 brief it implements).
//
// `publicationId` NEVER COLLAPSES INTO `contentHash`, AND NEITHER PRODUCES
// THE OTHER. Two Publications sharing an identical `contentHash` remain
// two independent World objects — `samePublication` and `contentComparison`
// are reported side by side, never merged into one combined verdict, and
// this function never treats `SAME_CONTENT` as a reason to treat `a` and
// `b` as "the same Publication really." Conversely, `a.publicationId ===
// b.publicationId` (the same Publication, described twice) says nothing
// about `contentComparison` on its own — it is still computed the exact
// same way, from whatever `contentHash` each descriptor happens to carry.
//
// UNKNOWN IS A DISTINCT, HONEST OUTCOME — NEVER A GUESS. When either side's
// `contentHash` is not a non-empty string (missing, `null`, or malformed),
// `contentComparison` is `null`: "not knowable from what's already known,"
// never coerced into `DIFFERENT_CONTENT` (content identity absent is not
// evidence of differing content) and never guessed into `SAME_CONTENT`.
// This is the exact same "degrade to `null`, never guess" discipline
// `describeWorldSnapshotInspection()` already applies to a malformed
// origin string.
//
// PURE. NO I/O. NO REGISTRY ACCESS. NO NEW WORLD ENCOUNTER KIND. This file
// never touches `WorldDiscoverySourceRegistry`, never calls any
// discovery/resolution/materialization/registration function, and adds no
// new `WorldEncounterPresentationSourceFamily` value or comparable
// taxonomy. Every value this file returns is `Object.freeze()`'d; nothing
// passed in is ever mutated. Calling this function twice with
// byte-identical arguments returns a byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **"Duplicate detection," deduplication, or any removal/replacement
//   policy.** Per this milestone's own brief: two Publications with
//   identical content may intentionally coexist at different World
//   positions. This file states a fact — "these Publications contain the
//   same verified content" — and never a policy recommendation ("these are
//   duplicates; one should be removed"). It has no opinion on whether
//   either Publication should exist, move, or be unregistered.
// - **Ranking, "best," trust, freshness, or preference between `a` and
//   `b`.** There is no ordering between the two arguments; swapping them
//   only swaps which field is `aPublicationId`/`bPublicationId`, never the
//   comparison's own meaning.
// - **A side-by-side viewer, comparison panel, or any UI at all.** This
//   file returns a plain, frozen, comparison-shaped object; wiring it into
//   any inspection panel is explicitly named as separate, later,
//   not-yet-justified work.
// - **A `locator`/`storage` comparison, or any field beyond
//   `publicationId`/`contentHash`.** Position is deliberately not part of
//   the comparison itself (see "position never affects the verdict" in the
//   accompanying tests) — a caller who wants to also show each
//   Publication's own position already has it on the descriptor it passed
//   in, unchanged, without this function needing to forward it.
// - **A new World Encounter kind, discovery mechanism, or materialization
//   trigger.** This is a read-only comparison of already-known facts,
//   never an action layer.

export const WorldSnapshotContentComparison = Object.freeze({
    SAME_CONTENT: 'SAME_CONTENT',
    DIFFERENT_CONTENT: 'DIFFERENT_CONTENT'
});

function validPublicationId(value) {
    return typeof value === 'string' && value.length > 0;
}

function validContentHash(value) {
    return typeof value === 'string' && value.length > 0;
}

// compareSnapshotWorldPublications(a, b) ->
//   { aPublicationId, bPublicationId, samePublication, contentComparison }
//   null   (either side missing, or lacking a genuine publicationId)
//
// `a`, `b` — each an already-known fact bundle carrying at least
//            `publicationId` (required) and `contentHash` (optional; a
//            missing/`null`/non-string value means "not knowable," never
//            "known to be empty"). `application/WorldSnapshotInspection.js`'s
//            own descriptor shape satisfies this directly, but neither
//            argument needs to carry that descriptor's other fields
//            (`kind`, `objectId`, `position`) — this function reads only
//            the two fields named above.
//
// `contentComparison` is one of `WorldSnapshotContentComparison`'s two
// values when both sides' `contentHash` are genuinely known, or `null`
// when either side's is not — never a third, guessed value.
export function compareSnapshotWorldPublications(a, b) {
    if (!a || !b) {
        return null;
    }
    if (!validPublicationId(a.publicationId) || !validPublicationId(b.publicationId)) {
        return null;
    }

    const aHash = validContentHash(a.contentHash) ? a.contentHash : null;
    const bHash = validContentHash(b.contentHash) ? b.contentHash : null;

    const contentComparison = (aHash !== null && bHash !== null)
        ? (aHash === bHash ? WorldSnapshotContentComparison.SAME_CONTENT : WorldSnapshotContentComparison.DIFFERENT_CONTENT)
        : null;

    return Object.freeze({
        aPublicationId: a.publicationId,
        bPublicationId: b.publicationId,
        samePublication: a.publicationId === b.publicationId,
        contentComparison
    });
}
