import { SnapshotWorldPositionClaimOutcome } from './SnapshotWorldPositionClaimOutcome.js';

// 0.9.172 — Decentralized Snapshot Position Claim Consumption.
//
// 0.9.171 taught `core/SnapshotDiscoveryEnvelope.js` (and, downstream,
// `application/NostrSnapshotDiscoveryQueryService.js#search()`) to carry an
// OPTIONAL publisher claim — `publicationId` + `claimedPosition` — on a
// Snapshot discovery candidate, then deliberately stopped: nothing in that
// milestone ever turned a `claimedPosition` into a `WorldPlacement`, a
// registry entry, or anything rendered (see that file's own header, "a
// claim, never a commitment to place"). `application/SnapshotWorldPlacement.js`
// (0.9.159) was, and remains, completely unaware Nostr or a position claim
// exist at all — it only ever composes an already-materialized Snapshot
// with a `placementInfo` a caller already holds. This file is the missing
// seam between those two: a small, pure decision over WHICH `placementInfo`
// a caller should hand `resolveSnapshotWorldPlacement()` — the SELECTED
// candidate's own claim, or the receiver's own pre-existing local
// placement.
//
//   selectedSnapshotCandidate   (application/NostrSnapshotDiscoveryQueryService.js,
//        │                       0.9.171 — { contentHash, locator, storage,
//        │                       publicationId?, claimedPosition? })
//        │
//        │           target Publication's own `id`   (the SAME Publication
//        │                │                            application/SnapshotWorldPlacement.js's
//        │                │                            own `placementInfo`
//        │                │                            argument is already
//        │                │                            keyed to)
//        ▼                ▼
//   resolveSnapshotWorldPositionClaim(candidate, publicationId)   ★ (THIS)
//        │
//        ▼
//   { outcome: CLAIMED | ABSENT | MISMATCHED, position }
//
// THE ONE IDENTITY RULE THIS FILE EXISTS TO ENFORCE. A claim is considered
// — never verified, never trusted, merely CONSIDERED — only when
// `candidate.publicationId === publicationId`, the target Publication being
// placed. This is a much stronger boundary than "the content hash matches,
// therefore use this position": `tests/SnapshotWorldOriginCollision.test.js`
// (0.9.163) already proved two entirely different Publications can share
// one `contentHash`, so a position claim bound only to a hash could belong
// to either. Binding the comparison to `publicationId` instead means "this
// selected discovery candidate explicitly claims this position for THIS
// Publication," never "the bytes match, so the position must too."
//
// A PURE FUNCTION — NO I/O, NO CRYPTOGRAPHIC RE-VERIFICATION OF ANY KIND.
// This file performs no network access, no storage access, no signature
// check, and no re-validation of `candidate.contentHash`/`locator`/
// `storage` against anything. Whether a `claimedPosition` is itself
// well-shaped was already `core/SnapshotDiscoveryEnvelope.js`'s own job
// (0.9.171) — a real candidate reaching this function already carries a
// valid `{x,y,z}` or carries no claim at all. This function decides only
// the ONE remaining question: does the claim, if any, belong to the
// Publication being placed?
//
// ABSENCE IS NEVER AN ERROR, AND NEVER BECOMES A FABRICATED POSITION. A
// `candidate` naming neither `publicationId` nor `claimedPosition` —
// every announcement made before 0.9.171, and every one that still omits a
// position claim — resolves to `ABSENT`, with `position: null`. This is
// NOT "the claim was tried and failed"; it means only "no decentralized
// position was supplied," precisely mirroring `core/
// SnapshotDiscoveryEnvelope.js`'s own header, "both fields are omitted
// entirely when absent." A caller who reads `ABSENT` and falls back to
// whatever `placementInfo` this replica's own existing local placement
// already provides has not lost anything a mismatched or absent claim
// could ever have supplied.
//
// A MISMATCH IS NEVER SILENTLY UPGRADED TO ABSENT, EVEN THOUGH BOTH REPORT
// `position: null`. `MISMATCHED` names, structurally, the specific case a
// caller may someday want to surface to a person ("this candidate's own
// claim names a different Publication") rather than the ordinary,
// unremarkable case of an old announcement carrying no claim at all. See
// `application/SnapshotWorldPositionClaimOutcome.js`'s own header for why
// these stay two distinct values rather than one.
//
// THIS FUNCTION NEVER DECIDES WHETHER A CLAIM IS TRUTHFUL — ONLY WHETHER IT
// IS ADDRESSED TO THE RIGHT PUBLICATION. `CLAIMED` means only "this
// candidate explicitly claims this position for this Publication, and may
// therefore be CONSIDERED" — it is not a verification outcome, and does
// not belong to, or extend, `core/SnapshotVerification.js`'s own
// vocabulary. See "deliberately excluded," below.
//
// NEVER A DOMAIN OBJECT — `position` ON A `CLAIMED` RESULT IS A FRESH,
// FROZEN, PLAIN `{x,y,z}`, copied field by field from `candidate.claimedPosition`,
// never the input reference and never a `core/Position.js`/`core/
// WorldPlacement.js` instance. Mirrors `core/SnapshotDiscoveryEnvelope.js`'s
// own "never a domain object" restraint, held here for the identical
// reason one seam downstream.
//
// NO MUTATION OF ANY KIND. Neither `candidate` nor `candidate.claimedPosition`
// is ever written to.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Signature verification of a position claim, timestamp freshness, or
//   any staleness/currency judgment.** `claimedPosition` remains
//   permanently distinct, in this codebase's own vocabulary, from a
//   Publication's CURRENT position — decentralized storage can be stale,
//   and consuming a claim once says nothing about whether a LATER
//   announcement superseded it. That distinction is preserved by simply
//   never collapsing the two names into one; nothing further is built here.
// - **Reconciling, ranking, or choosing among several candidates naming
//   the same Publication with different claimed positions.** A caller
//   handing this function more than one candidate, one at a time, gets
//   back independent, unranked answers for each.
// - **Trust scores, publisher reputation, or geospatial/collision
//   validation of any kind.**
// - **Automatic invocation.** A caller decides WHEN to call this function
//   — see `ui/components/OwnPublicationPanel.js`'s own
//   `useClaimedSnapshotPosition()`, the one explicit, person-initiated
//   call site this milestone adds. Selecting a candidate, resolving it, or
//   materializing it never calls this function on its own.
// - **Modifying `application/SnapshotWorldPlacement.js` or `core/
//   SnapshotDiscoveryEnvelope.js` in any way.** Both remain byte-for-byte
//   as 0.9.159/0.9.171 left them; this file only decides which
//   `placementInfo`-shaped object a caller ends up handing the former.
// - **A new `VERIFIED_POSITION`, `TRUSTED`, or similar state.** A
//   candidate's own claimed position remains untrusted metadata until
//   explicitly consumed via `CLAIMED` — consuming it is not verifying it.

// resolveSnapshotWorldPositionClaim(candidate, publicationId) ->
//   { outcome, position }
//
// `candidate`     — the SELECTED discovery candidate (application/
//                    NostrSnapshotDiscoveryQueryService.js's own `{
//                    contentHash, locator, storage, publicationId?,
//                    claimedPosition? }`, 0.9.171). Required — a caller
//                    with no selected candidate at all has nothing to ask
//                    this question about.
// `publicationId` — the target Publication's own `id`, the SAME identity
//                    `resolveSnapshotWorldPlacement()`'s own `placementInfo`
//                    argument is already keyed to. Required, non-empty
//                    string.
//
// Returns `{ outcome: SnapshotWorldPositionClaimOutcome.ABSENT, position:
// null }` when `candidate` carries neither `publicationId` nor
// `claimedPosition`.
//
// Returns `{ outcome: SnapshotWorldPositionClaimOutcome.MISMATCHED,
// position: null }` when `candidate` carries both, but
// `candidate.publicationId !== publicationId`.
//
// Returns `{ outcome: SnapshotWorldPositionClaimOutcome.CLAIMED, position:
// { x, y, z } }` — `candidate.claimedPosition`'s own values, copied into a
// freshly frozen object — when `candidate.publicationId === publicationId`.
export function resolveSnapshotWorldPositionClaim(candidate, publicationId) {
    if (!candidate || typeof candidate !== 'object') {
        throw new Error('resolveSnapshotWorldPositionClaim: a selected discovery candidate is required');
    }
    if (typeof publicationId !== 'string' || publicationId.length === 0) {
        throw new Error('resolveSnapshotWorldPositionClaim: the target Publication\'s own id is required');
    }

    const hasClaim = candidate.publicationId !== undefined && candidate.claimedPosition !== undefined;
    if (!hasClaim) {
        return Object.freeze({ outcome: SnapshotWorldPositionClaimOutcome.ABSENT, position: null });
    }

    if (candidate.publicationId !== publicationId) {
        return Object.freeze({ outcome: SnapshotWorldPositionClaimOutcome.MISMATCHED, position: null });
    }

    const claimed = candidate.claimedPosition;
    if (!claimed
        || typeof claimed !== 'object'
        || !Number.isFinite(claimed.x)
        || !Number.isFinite(claimed.y)
        || !Number.isFinite(claimed.z)) {
        throw new Error('resolveSnapshotWorldPositionClaim: candidate.claimedPosition, when present, must carry three finite x/y/z coordinates');
    }

    return Object.freeze({
        outcome: SnapshotWorldPositionClaimOutcome.CLAIMED,
        position: Object.freeze({ x: claimed.x, y: claimed.y, z: claimed.z })
    });
}
