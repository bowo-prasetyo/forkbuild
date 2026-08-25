// 0.8.26 — Snapshot Placement Lifecycle & Stale Availability Semantics.
//
// Names every state application/SnapshotPlacementLifecycleView.js#
// deriveSnapshotPlacementLifecycle() can return, the placement-side
// sibling of application/AnchorVerificationLifecycleState.js (0.8.12).
// This is deliberately a narrower, DIFFERENT axis than application/
// SnapshotPlacementResolutionOutcome.js (0.8.18): not "what did this ONE
// resolve() call conclude," but "given every resolution attempt this
// replica has made for one placement so far, what should a person be
// told RIGHT NOW about whether its bytes can be retrieved." This value is
// never stored on core/PublicationSnapshotPlacement.js, never persisted,
// and never treated as a new kind of domain truth — see this file's own
// deliberately un-domain-sounding names below, and docs/Principles.md, "A
// Resolution Result Describes Whether Bytes Can Be Retrieved Now; It Does
// Not Rewrite The Placement Claim (0.8.26)."
//
//   NOT_RESOLVED       — no resolution has ever been attempted for this
//                        placement, in this replica's own session.
//                        Identical to application/SnapshotPlacementView.js's
//                        own existing "Not yet resolved" case — this file
//                        adds no new meaning here, only a shared name for
//                        it.
//   RESOLVED           — the MOST RECENT attempt reached
//                        SnapshotPlacementResolutionOutcome.RESOLVED.
//   UNAVAILABLE        — the MOST RECENT attempt reached
//                        STORE_UNAVAILABLE or CONTENT_UNAVAILABLE — either
//                        no content store was registered for this
//                        placement's own `storage`, or one WAS consulted
//                        and simply could not presently produce the
//                        bytes. Deliberately the SAME lifecycle state
//                        regardless of which of those two it was (the
//                        UNCHANGED, per-attempt `resolutionLabel` already
//                        tells the two apart on screen — see application/
//                        SnapshotPlacementView.js#describeResolutionOutcome()
//                        — this file only ever answers the coarser
//                        "should this read as ok, inconclusive, or wrong"
//                        question), and regardless of what any EARLIER
//                        attempt concluded — see this file's own
//                        `everResolved` field on application/
//                        SnapshotPlacementLifecycleView.js for why "was
//                        once RESOLVED" is carried as a separate fact,
//                        never folded into a different state name of its
//                        own. "Currently unavailable" must never read as
//                        "invalid," "corrupted," or "removed," no matter
//                        how it got there — the identical restraint 0.8.12
//                        already established for anchors.
//   HASH_MISMATCH      — the MOST RECENT attempt reached
//                        CONTENT_HASH_MISMATCH: a store answered, with
//                        bytes that do NOT hash to this placement's own
//                        `contentHash`. Deliberately its OWN state, never
//                        folded into UNAVAILABLE — a store that cannot
//                        presently be reached says nothing negative about
//                        the placement's own claim, while a store that
//                        answers with the WRONG bytes is a genuinely
//                        different, more concerning finding. Collapsing
//                        the two would hide exactly the distinction this
//                        milestone exists to preserve; see docs/
//                        Principles.md's own 0.8.26 entry, "Case 3."
//   INVALID_PLACEMENT  — the MOST RECENT attempt reached a DEFINITE
//                        structural negative: INVALID_ENVELOPE or
//                        INVALID_SIGNATURE — the record itself is not
//                        even a validly signed placement. These two
//                        remain individually distinguishable through the
//                        untouched `outcome` this state is always paired
//                        with (see application/
//                        SnapshotPlacementLifecycleView.js) —
//                        INVALID_PLACEMENT groups them only for the
//                        purpose of choosing a lifecycle state, never for
//                        display.
export const SnapshotPlacementLifecycleState = Object.freeze({
    NOT_RESOLVED: 'not-resolved',
    RESOLVED: 'resolved',
    UNAVAILABLE: 'unavailable',
    HASH_MISMATCH: 'hash-mismatch',
    INVALID_PLACEMENT: 'invalid-placement'
});
