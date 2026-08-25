// 0.8.12 — External Anchor Lifecycle & Stale Evidence Semantics.
//
// application/AnchorVerificationOutcome.js names what one application/
// ExternalAnchorVerifier.js#verify() call concluded. This file names the
// FACT that a call happened at all, at a particular time, for a
// particular anchor — the missing piece that let 0.8.3 through 0.8.11
// get away with treating "the most recent verification result" as the
// only one worth keeping. It is not: a caller that overwrites its own
// prior result the moment a new one arrives can no longer tell "this
// anchor was never confirmable" apart from "this anchor WAS confirmed,
// and the external system is merely unreachable right now" — exactly the
// distinction docs/Roadmap.md's own 0.8.11 "What's left" line named as
// unfinished ("hardening the external-anchor lifecycle... stale
// evidence").
//
// A `PublicationAnchorVerificationObservation` is a plain, frozen record
// of ONE such call:
//
//   { anchorId, outcome, reason, observedAt }
//
// `outcome`/`reason` are copied verbatim from whatever application/
// ExternalAnchorVerifier.js#verify() resolved to — this file never
// re-derives or re-checks either. `observedAt` is THIS REPLICA's own
// local clock at the moment the observation was created, never the
// external system's own reported timestamp (that is core/
// PublicationAnchor.js's own `anchoredAt`, a completely different axis —
// see that file's own header on why an external system's claimed record
// time is a report, never a fact this replica independently establishes;
// `observedAt` makes the identical restraint explicit for THIS replica's
// own act of checking, not the external system's own history).
//
// NEVER PERSISTED, NEVER SHARED. This class is created and consumed
// entirely within one replica's own ephemeral UI/session state (see
// ui/views/DecentralizedPublicationsView.js's own `entry.
// verificationHistory`) — it is never written to application/
// LocalPublicationAnchorCatalog.js, never attached to a core/
// PublicationAnchor.js instance, never carried over application/
// PublicationAnchorPeerExchange.js, and never imported into a
// publication package (application/ImportPackageAnchorsUseCase.js). Two
// replicas that verify the identical anchor at the identical moment, and
// even reach the identical outcome, each hold their own, entirely
// separate observation — this file has no notion of "whose" observation
// is authoritative, because none of them ever is. See docs/
// Principles.md, "A Verification Result Describes What Can Be
// Established Now; It Does Not Rewrite The Historical Claim Being
// Verified (0.8.12)."
export function createVerificationObservation({ anchorId, outcome, reason = null, observedAt = new Date() } = {}) {
    if (!anchorId || typeof anchorId !== 'string' || !anchorId.trim()) {
        throw new Error('createVerificationObservation: an anchorId is required');
    }
    if (!outcome || typeof outcome !== 'string') {
        throw new Error('createVerificationObservation: an outcome is required');
    }
    const observedAtDate = observedAt instanceof Date ? observedAt : new Date(observedAt);
    if (Number.isNaN(observedAtDate.getTime())) {
        throw new Error('createVerificationObservation: observedAt must be a valid date');
    }
    return Object.freeze({ anchorId, outcome, reason: reason || null, observedAt: observedAtDate });
}
