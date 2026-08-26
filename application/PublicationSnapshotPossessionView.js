import { LocalSnapshotContentAvailabilityOutcome } from './LocalSnapshotContentAvailabilityOutcome.js';

// 0.8.39 — Local Snapshot Possession & Replica Content Knowledge.
//
// 0.8.33 built `application/CheckLocalSnapshotContentAvailabilityUseCase.js`
// to answer one question — "does this replica's own local `content/
// ContentStore.js` currently hold bytes matching a publication's claimed
// hash?" — and `application/LocalSnapshotContentAvailabilityView.js` to
// turn that question's resolved result into a UI-ready shape: a button
// label, a badge class, a human sentence. 0.8.38 then built an entire
// HISTORY of attempts sitting alongside that single, present-tense fact,
// and its own header draws the line this file exists to make explicit
// one more time, in the opposite direction: history narrates WHAT
// HAPPENED; this file narrates WHAT IS TRUE RIGHT NOW, stripped down to
// nothing but the fact itself:
//
//   CheckLocalSnapshotContentAvailabilityUseCase.js#execute()   (0.8.33, UNCHANGED)
//              │
//              ▼
//   describePublicationSnapshotPossession()                     (THIS FILE)
//              │
//              ▼
//     { publicationId, contentHash,
//       possession: { state } }
//
// Deliberately reuses `application/LocalSnapshotContentAvailabilityOutcome.js`'s
// own three values for `possession.state` — NOT_AVAILABLE, AVAILABLE,
// CONTENT_HASH_MISMATCH — rather than inventing a second, parallel enum
// that would mean the identical thing under different names. This file
// introduces NO new content checker, no new hashing, no new storage read:
// it is a pure, synchronous reshaping of a result its caller already
// computed, mirroring `application/LocalSnapshotContentAvailabilityView.js`'s
// own restraint (never importing `CheckLocalSnapshotContentAvailabilityUseCase.js`
// itself, never touching a `content/ContentStore.js`) — the two files are
// SIBLINGS over the identical input, one shaped for a button/badge/
// sentence, this one shaped for composition into `application/
// PublicationReplicaContentKnowledgeView.js` and any other caller that
// wants the bare fact without a single UI-specific field mixed in.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: possession is an OBSERVATION,
// never a CLAIM. `possession.state` says only what THIS replica's own
// storage presently contains, recomputed fresh every time the underlying
// check runs — it is not persisted here, not compared across replicas,
// not attached to a placement, and not treated as evidence toward
// decentralization, trust, or preference. A caller holding a `AVAILABLE`
// possession for a publication with zero known placements and zero known
// anchors is not thereby "more decentralized," and a caller holding
// `NOT_AVAILABLE` for a publication with three known placements has lost
// nothing about those placements' own validity — `application/
// PublicationDecentralizationView.js` (0.8.27) already describes
// DISTRIBUTED claims; this file describes a fact about ONE replica's own
// present bytes, and the two dimensions never merge into one score. See
// `docs/Principles.md`, "Current Snapshot Possession Is A Local
// Observation, Not A Distributed Claim (0.8.39)."
//
// `attempt`: `null`/absent (no check has completed for this publication,
// in this browsing session) or `application/
// CheckLocalSnapshotContentAvailabilityUseCase.js#execute()`'s own
// resolved shape, `{ publicationId, contentHash, contentReference,
// outcome }` — never the `{ checking: true }` in-flight marker `application/
// LocalSnapshotContentAvailabilityView.js` also has to handle, since this
// file is never itself responsible for rendering an in-flight state; a
// caller simply does not call this function until a check has resolved.
// `possession.state` is `null` when no resolved attempt has been supplied
// — an entirely ordinary, non-alarming result meaning only "not yet
// observed," never "known to be missing," exactly the same distinction
// `application/PublicationAnchorKnowledgeView.js`'s own `null`
// `acquisitionKind` already draws for "no local knowledge record at all."
//
// Pure and stateless: no constructor, no injected dependency, no
// caching. Calling this twice with a byte-identical `attempt` returns a
// byte-identical result.
export function describePublicationSnapshotPossession(attempt = null) {
    const resolved = Boolean(attempt && !attempt.checking && attempt.outcome);
    return Object.freeze({
        publicationId: (attempt && attempt.publicationId) || null,
        contentHash: (attempt && attempt.contentHash) || null,
        possession: Object.freeze({
            state: resolved ? attempt.outcome : null
        })
    });
}

// A single, honest boolean carved out of `possession.state` — TRUE only
// for `LocalSnapshotContentAvailabilityOutcome.AVAILABLE`, the SAME
// outcome `application/LocalSnapshotContentAvailabilityView.js`'s own
// "Available" badge already reflects. `NOT_AVAILABLE`, `CONTENT_HASH_MISMATCH`,
// and "not yet observed" (`state: null`) all report `false` here — this
// function deliberately never distinguishes among the three ways a
// replica does not presently possess usable bytes, because `application/
// PublicationReplicaContentKnowledgeView.js`'s own `hasValidSnapshot`
// needs exactly one bit, never three. A caller that needs to tell
// "corrupted" apart from "absent" still reads `possession.state` itself,
// unchanged, from the object above.
export function isSnapshotPossessed(possessionView) {
    return Boolean(possessionView && possessionView.possession && possessionView.possession.state === LocalSnapshotContentAvailabilityOutcome.AVAILABLE);
}
