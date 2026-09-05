import { StoreSnapshotContentOutcome } from './StoreSnapshotContentOutcome.js';
import { SnapshotWorldPlacementOutcome } from './SnapshotWorldPlacementOutcome.js';

// 0.9.159 — Snapshot World Placement.
//
// 0.9.150 through 0.9.158 built DISCOVER -> SELECT -> RESOLVE -> VERIFY ->
// ATTRIBUTE -> MATERIALIZE, each stage a separate, independently-tested
// seam over the last. Every one of those stages answers a question about
// BYTES: can they be found, retrieved, verified, attributed to a
// Publication, possessed locally? None of them ever answers a question
// about SPACE: once this replica genuinely possesses a Snapshot's bytes,
// WHERE does it belong in the World? This file is that seam, and nothing
// more:
//
//   DISCOVER -> SELECT -> RESOLVE -> VERIFY -> ATTRIBUTE -> MATERIALIZE -> PLACE
//
// THE ONE QUESTION THIS MILESTONE REFUSED TO ANSWER WITH A NEW ALGORITHM.
// A materialized Snapshot carries a `contentHash`, and — for PLACEMENT/PEER
// sources — a `publicationId`; a Nostr-discovered CANDIDATE (0.9.158)
// carries neither a signature nor even a `publicationId` on its own
// materialization result (see application/
// MaterializeSnapshotFromSelectedCandidateUseCase.js's own header, "no
// publicationId, no publicationKnown — deliberately"). NONE of that is a
// spatial coordinate. Rather than invent one — from a locator, from
// discovery order, from whichever avatar happens to be nearby — this file
// asks a narrower, prior question: does an AUTHORITATIVE World position for
// the relevant Publication already exist? core/WorldPlacement.js already
// answers exactly that question, for exactly this reason (see its own
// header: "a lightweight spatial reference to a Publication... coordinates
// belong to shared world space"), and core/WorldEncounter.js (0.9.0)
// already builds World View's entire notion of "what, in the World, is
// findable" by joining a Publication to its own WorldPlacement, never any
// other way. This file reuses that SAME existing authority, one layer
// over, for a Snapshot's bytes rather than a Publication's document.
//
//   materialization result   (0.8.35/0.8.37/0.9.158 — ALREADY COMPUTED;
//        │                    { outcome, contentHash, contentReference,
//        │                      reason, source })
//        │
//        │           placementInfo   (WorldNavigationSession#getPlacementInfo(),
//        │                │           0.2.10-era, UNCHANGED — the SAME
//        │                │           read this replica's own Placement Info
//        │                │           panel already shows for the ACTIVE
//        │                │           document's own Publication; `null`
//        │                │           when that Publication has never been
//        │                │           placed)
//        ▼                ▼
//   resolveSnapshotWorldPlacement(materialization, placementInfo)   ★ (THIS)
//        │
//        ▼
//   { outcome: PLACED | UNPLACED | <materialization's own failure,
//              verbatim>, contentHash, publicationId, placementId,
//     position, reason }
//
// A PURE FUNCTION — NO I/O, NO KNOWLEDGE OF DISCOVERY, RETRIEVAL, OR
// RENDERING INFRASTRUCTURE. `resolveSnapshotWorldPlacement()` performs no
// network access, no storage access, no query of a PlacementRegistry, and
// no rendering of any kind. It never imports Nostr, Arweave, a content
// store, a PlacementRegistry, a spatial index, World View, or any UI
// state — exactly the restraint application/SnapshotPublicationAttribution.js's
// own resolveSnapshotPublicationAttribution() already holds one seam over,
// applied here to composing two already-computed facts instead of comparing
// two already-computed hashes. Given the same two inputs, it always returns
// the same result; neither input is ever mutated.
//
// PLACEMENT REQUIRES AN ALREADY-SUCCEEDED MATERIALIZATION — THE IDENTICAL
// RESTRAINT MATERIALIZATION ITSELF ALREADY HOLDS ONE SEAM UNDER RESOLUTION.
// When `materialization.outcome` is anything other than
// `StoreSnapshotContentOutcome.STORED`/`.ALREADY_AVAILABLE` — a resolver
// failure passed through from a PLACEMENT/PEER/CANDIDATE materialization
// attempt, a HASH_MISMATCH, an INVALID_PLACEMENT, an UNAVAILABLE — this
// function NEVER reports `UNPLACED`. It passes that SAME outcome (and its
// own `reason`) through unchanged. A Snapshot whose bytes were never
// actually retrieved has no more claim to a World position than a
// Publication that was never placed; possessing bytes is what this
// question is ASKED about, never assumed.
//
// `placementInfo` IS DUCK-TYPED TO WorldNavigationSession#getPlacementInfo()'S
// OWN RETURN SHAPE, NEVER A BARE PublicationSnapshotPlacement/WorldPlacement
// THIS FILE LOOKS UP ITSELF. `null` is a legitimate, expected input — "this
// Publication has never been placed" — not a caller error; anything else
// must expose `placementId`/`publicationId` (strings) and a `position` with
// finite `x`/`y`/`z`, or this function treats the call as a caller contract
// violation and throws, the same restraint every required-shape argument in
// this codebase already holds. This file never calls `getPlacementInfo()`
// itself, never imports application/WorldNavigationSession.js, and never
// looks up a PlacementRegistry/spatial index on its own — the identical
// "never rediscovers" restraint application/SnapshotPublicationAttribution.js's
// own header already holds, applied here to a placement lookup instead of a
// resolver call.
//
// THE RETURNED POSITION IS BORROWED, NEVER RECOMPUTED. On `PLACED`,
// `position` is `placementInfo.position` — the EXACT `{x,y,z}` the existing
// Placement Info panel already shows for that Publication — copied field by
// field into a newly frozen object, never transformed, offset, or averaged
// with anything else. `placementId`/`publicationId` on the same result name
// WHICH existing WorldPlacement this position was borrowed from, purely for
// traceability — neither is ever treated as the Snapshot's OWN identity.
//
// THREE IDENTITIES, DELIBERATELY NEVER MERGED — core/ContentReference.js's
// own `hash` (a Snapshot's content identity), core/
// PublicationSnapshotPlacement.js's own `locator`/`storage` (WHERE bytes can
// be RETRIEVED from — a placement in the retrieval sense), and this file's
// own `position` (WHERE a Snapshot belongs in shared World SPACE — a
// placement in the spatial sense) answer three entirely different
// questions. `contentHash` on this file's own result is `materialization.
// contentHash`, carried forward verbatim — never replaced by a locator, a
// storage backend name, an Arweave transaction id, a Nostr event id, or a
// relay URL, none of which this function ever reads in the first place.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Looking up a PlacementRegistry, a spatial index, or a WorldPlacement
//   of any kind.** See "never rediscovers," above — a caller already holds
//   `placementInfo` before calling this function.
// - **Choosing AMONG several WorldPlacements for the same Publication.**
//   `placementInfo` already IS that choice — `WorldNavigationSession#
//   getPlacementInfo()`'s own header documents picking the most recently
//   updated one as "a deliberate simplification... browsing/choosing among
//   several is future scope." This file inherits that choice unchanged,
//   rather than re-deciding it.
// - **Visibility, viewport, camera distance, or "nearest" of any kind.**
//   Whether a placed Snapshot is CURRENTLY on screen is a separate, later,
//   downstream question for World View's own runtime/rendering state to
//   answer — the identical restraint core/WorldEncounter.js's own header
//   already holds ("camera position, distance, nearest object, visibility...
//   require relating the World to a Wanderer's own position — a different
//   projection than 'what is encounterable'"). This file never reads a
//   camera, a Wanderer's position, or any notion of "on screen."
// - **Rendering of any kind.** This file produces a plain, frozen fact —
//   never a marker, a mesh, a scene graph node, or any World View component.
// - **Retry, caching, ranking, or automatic invocation of any kind.** A
//   caller decides WHEN to call this function; it never decides for itself.

// resolveSnapshotWorldPlacement(materialization, placementInfo = null) ->
//   { outcome, contentHash, publicationId, placementId, position, reason }
//
// `materialization` — the ALREADY-COMPUTED result of any explicit
//                      materialization source (application/
//                      MaterializeSnapshotFromPlacementUseCase.js,
//                      application/MaterializeSnapshotFromPeerUseCase.js,
//                      application/
//                      MaterializeSnapshotFromSelectedCandidateUseCase.js —
//                      duck-typed to `{ outcome, contentHash }`). Required.
// `placementInfo`   — `WorldNavigationSession#getPlacementInfo()`'s own
//                      already-computed `{ placementId, publicationId,
//                      position: {x,y,z}, ... }`, or `null` when the
//                      relevant Publication has never been placed. Optional,
//                      defaults to `null`.
//
// When `materialization.outcome` is not STORED/ALREADY_AVAILABLE: returns
// `{ outcome: materialization.outcome, contentHash, publicationId: null,
// placementId: null, position: null, reason: materialization.reason }` —
// materialization's own failure, unchanged, never UNPLACED.
//
// When STORED/ALREADY_AVAILABLE and `placementInfo` is `null`: returns
// `SnapshotWorldPlacementOutcome.UNPLACED`, with `publicationId`/
// `placementId`/`position` all `null`.
//
// When STORED/ALREADY_AVAILABLE and `placementInfo` is supplied: returns
// `SnapshotWorldPlacementOutcome.PLACED`, with `placementInfo`'s own
// `publicationId`/`placementId`/`position` carried forward verbatim.
export function resolveSnapshotWorldPlacement(materialization, placementInfo = null) {
    if (!materialization || typeof materialization.outcome !== 'string') {
        throw new Error('resolveSnapshotWorldPlacement: a materialization result with an outcome is required');
    }
    if (placementInfo !== null && placementInfo !== undefined) {
        const position = placementInfo.position;
        if (typeof placementInfo !== 'object'
            || typeof placementInfo.placementId !== 'string'
            || typeof placementInfo.publicationId !== 'string'
            || !position
            || !Number.isFinite(position.x)
            || !Number.isFinite(position.y)
            || !Number.isFinite(position.z)) {
            throw new Error('resolveSnapshotWorldPlacement: placementInfo, when supplied, must be a WorldNavigationSession#getPlacementInfo()-shaped object');
        }
    }

    const contentHash = materialization.contentHash || null;

    if (materialization.outcome !== StoreSnapshotContentOutcome.STORED
        && materialization.outcome !== StoreSnapshotContentOutcome.ALREADY_AVAILABLE) {
        return {
            outcome: materialization.outcome,
            contentHash,
            publicationId: null,
            placementId: null,
            position: null,
            reason: materialization.reason || null
        };
    }

    if (!placementInfo) {
        return {
            outcome: SnapshotWorldPlacementOutcome.UNPLACED,
            contentHash,
            publicationId: null,
            placementId: null,
            position: null,
            reason: null
        };
    }

    return {
        outcome: SnapshotWorldPlacementOutcome.PLACED,
        contentHash,
        publicationId: placementInfo.publicationId,
        placementId: placementInfo.placementId,
        position: Object.freeze({ x: placementInfo.position.x, y: placementInfo.position.y, z: placementInfo.position.z }),
        reason: null
    };
}
