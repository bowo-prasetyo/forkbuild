import { isSnapshotPossessed } from './PublicationSnapshotPossessionView.js';

// 0.8.39 — Local Snapshot Possession & Replica Content Knowledge.
//
// `application/PublicationReplicaKnowledgeView.js` (0.8.28) answered
// "what does this replica know about a publication?" with `hasPublication`
// plus the two DISTRIBUTED-claim dimensions, evidence and placements — and
// its own header named directly what it never touches: `content/
// ContentStore.js`. `application/
// CheckLocalSnapshotContentAvailabilityUseCase.js` (0.8.33) closed that
// gap for a SINGLE present-tense fact, and `application/
// PublicationSnapshotPossessionView.js` (0.8.39, immediately above this
// file in the same milestone) just gave that fact its own small, pure
// shape. This file is the smallest possible THIRD knowledge dimension,
// sitting beside the first two rather than folding into either of them:
//
//   describePublicationReplicaKnowledge()        (0.8.28, UNCHANGED)
//        hasPublication, evidence, placements
//
//   describePublicationSnapshotPossession()       (0.8.39, UNCHANGED)
//        possession.state
//              │
//              ▼
//   describePublicationReplicaContentKnowledge()  (THIS FILE)
//              │
//              ▼
//     { publicationId, hasPublication, hasValidSnapshot }
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE, restated directly from this
// milestone's own design conversation: replica knowledge, materialization
// history, and current content possession are THREE INDEPENDENT FACTS,
// and this file is deliberately too small to let any of them leak into
// another. It is NOT a replacement for, or a superset of, `application/
// PublicationReplicaKnowledgeView.js` — it carries no `evidence`, no
// `placements`, and no anchor/placement counts of its own; a caller that
// wants those still reads that file, unchanged, side by side with this
// one. Resist the temptation to rename this object "complete replica
// knowledge" or "full replica state": a replica can perfectly ordinarily
// report `hasPublication: true` alongside `hasValidSnapshot: false` (the
// publication's own envelope is known, but no bytes have ever been
// materialized), or `hasPublication: true` alongside `hasValidSnapshot: true`
// and zero known anchors and zero known placements (bytes arrived through
// an offline transfer package that carried no evidence or placement
// claims at all) — every combination of these three dimensions is an
// entirely ordinary, non-contradictory state, and none of the four
// possible `hasPublication`/`hasValidSnapshot` pairings is ever treated as
// more "complete" than another. See `docs/Principles.md`, "Current
// Snapshot Possession Is A Local Observation, Not A Distributed Claim
// (0.8.39)."
//
// `hasPublication`: a plain boolean the CALLER already knows — ordinarily
// `publicationCatalog.has(publicationId)` — mirroring `application/
// PublicationReplicaKnowledgeView.js`'s own parameter of the identical
// name exactly; this file never looks it up itself. `possession`: the
// result of `application/PublicationSnapshotPossessionView.js#
// describePublicationSnapshotPossession()` (or null/absent, meaning no
// local availability check has ever completed for this publication in
// this browsing session — an entirely ordinary state reported here as
// `hasValidSnapshot: false`, never as an error).
//
// Pure and stateless, exactly like every other file in this lineage: no
// constructor, no injected dependency, no caching, no catalog, no store,
// no network. Calling this twice with byte-identical arguments returns a
// byte-identical result.
export function describePublicationReplicaContentKnowledge({
    publicationId,
    hasPublication = false,
    possession = null
} = {}) {
    return Object.freeze({
        publicationId,
        hasPublication: Boolean(hasPublication),
        hasValidSnapshot: isSnapshotPossessed(possession)
    });
}
