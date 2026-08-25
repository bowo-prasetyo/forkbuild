import { AnchorVerificationOutcome } from './AnchorVerificationOutcome.js';
import { AnchorVerificationLifecycleState } from './AnchorVerificationLifecycleState.js';

// 0.8.12 — External Anchor Lifecycle & Stale Evidence Semantics.
//
// application/PublicationEvidenceView.js (0.8.3) turns ONE already-
// computed verification result into a flat display shape. This file
// answers a question that requires more than one: given every
// verification attempt a replica has made for a single anchor so far —
// application/PublicationAnchorVerificationObservation.js records, in
// the order they happened — what should a person be told about it RIGHT
// NOW? This is the derived "lifecycle view" docs/Roadmap.md's own 0.8.11
// "What's left" line asked for, built the same way every other derived
// view in this codebase already is: pure, synchronous, side-effect-free,
// and never itself calling application/ExternalAnchorVerifier.js,
// touching application/LocalPublicationAnchorCatalog.js, or importing
// core/PublicationAnchor.js's own mutating surface. It only ever reshapes
// observations a caller already collected elsewhere (ordinarily ui/
// views/DecentralizedPublicationsView.js's own `entry.
// verificationHistory`).
//
// THE CENTRAL RULE THIS FILE EXISTS TO ENFORCE: `PROOF_UNAVAILABLE` is
// never displayed as "invalid" merely because an earlier attempt reached
// `VALID`, and `VALID` earned once is never treated as permanent — the
// CURRENT state always reflects only the MOST RECENT observation. What a
// history of observations adds is exactly one extra fact,
// `everValid` — whether this anchor was independently confirmed at
// SOME point in this replica's own session — carried alongside the
// current state, never merged into a new state name of its own (there is
// deliberately no `PREVIOUSLY_VALID_NOW_UNAVAILABLE` entry in
// application/AnchorVerificationLifecycleState.js). See docs/
// Principles.md, "A Verification Result Describes What Can Be
// Established Now; It Does Not Rewrite The Historical Claim Being
// Verified (0.8.12)."
export function deriveAnchorVerificationLifecycle(observations = []) {
    const list = Array.isArray(observations) ? observations : [];
    if (list.length === 0) {
        return {
            state: AnchorVerificationLifecycleState.NOT_VERIFIED,
            currentOutcome: null,
            currentReason: null,
            everValid: false,
            observationCount: 0,
            lastObservedAt: null
        };
    }
    const current = list[list.length - 1];
    const everValid = list.some((observation) => observation.outcome === AnchorVerificationOutcome.VALID);
    return {
        state: stateForOutcome(current.outcome),
        currentOutcome: current.outcome,
        currentReason: current.reason,
        everValid,
        observationCount: list.length,
        lastObservedAt: current.observedAt instanceof Date ? current.observedAt.toISOString() : current.observedAt
    };
}

function stateForOutcome(outcome) {
    switch (outcome) {
        case AnchorVerificationOutcome.VALID: return AnchorVerificationLifecycleState.VERIFIED;
        case AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED: return AnchorVerificationLifecycleState.UNVERIFIED_PROOF;
        case AnchorVerificationOutcome.PROOF_UNAVAILABLE: return AnchorVerificationLifecycleState.UNAVAILABLE;
        default: return AnchorVerificationLifecycleState.REJECTED;
    }
}

// A single, optional, presentation-only sentence to show ALONGSIDE
// application/PublicationEvidenceView.js's own existing
// `verificationLabel` — never a replacement for it. `null` in every case
// except the one this milestone was built to surface: the most recent
// attempt is `UNAVAILABLE` and an EARLIER attempt, in this same replica's
// own session, reached `VALID`. Deliberately says "currently
// unavailable," never "invalid," "revoked," or "expired" — see
// application/AnchorVerificationLifecycleState.js's own header on
// `UNAVAILABLE`.
export function describeAnchorVerificationLifecycleNote(lifecycle) {
    if (!lifecycle) return null;
    if (lifecycle.state === AnchorVerificationLifecycleState.UNAVAILABLE && lifecycle.everValid) {
        return 'This evidence was independently verified earlier; verification is currently unavailable.';
    }
    return null;
}
