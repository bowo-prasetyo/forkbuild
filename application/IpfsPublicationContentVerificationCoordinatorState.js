import { IpfsPublicationContentVerificationState } from './IpfsPublicationContentVerificationState.js';

// 0.8.70 — IPFS Publication & Content Verification UI.
//
// application/IpfsPublicationContentVerificationState.js (0.8.69) names
// only what a single retrieval-and-verify attempt found — HASH_MATCH,
// HASH_MISMATCH, or UNAVAILABLE. It has no notion of "before the first
// attempt" or "an attempt is in flight," because 0.8.69 was deliberately
// built with no UI to ever trigger one. This is that missing UI-facing
// wrapper — the identical extension application/BitcoinAnchorBroadcastState
// .js (0.8.64) already made over anchoring/BitcoinAnchorTransactionBroadcaster
// .js's own pass/fail vocabulary, applied here one domain over:
//
//   IDLE        — no verification attempt has been made yet for the
//                 current publication record. The starting state, and
//                 the state a freshly (re)published record always starts
//                 in again — never inheriting a previous record's own
//                 observation.
//   VERIFYING   — a verification attempt is in flight: application/
//                 IpfsPublicationContentVerifier.js#verify() (0.8.69,
//                 unchanged) has been asked and has not yet answered.
//   HASH_MATCH / HASH_MISMATCH / UNAVAILABLE — application/
//                 IpfsPublicationContentVerificationState.js's own three
//                 values, reused verbatim below, never redefined.
//   FAILED      — the verification could not be completed for a reason
//                 other than the verifier's own honest UNAVAILABLE — a
//                 caller/UI contract problem, never a fact about the
//                 requested content. Distinct from UNAVAILABLE: UNAVAILABLE
//                 means the requested content could not presently be
//                 retrieved; FAILED means something upstream of that
//                 question went wrong. Honestly unreached today —
//                 application/IpfsPublicationContentVerifier.js never
//                 produces anything application/
//                 IpfsPublicationContentVerificationCoordinator.js would
//                 refuse — kept in the vocabulary for the identical
//                 reason application/BitcoinAnchorBroadcastState.js's own
//                 FAILED is kept.
//
// NEVER A SCORE, A CONFIDENCE PERCENTAGE, OR A "TRUSTED"/"VERIFIED"
// LABEL. See application/IpfsPublicationContentVerificationState.js's own
// header, held completely unchanged here.
export const IpfsPublicationContentVerificationCoordinatorState = Object.freeze({
    IDLE: 'idle',
    VERIFYING: 'verifying',
    HASH_MATCH: IpfsPublicationContentVerificationState.HASH_MATCH,
    HASH_MISMATCH: IpfsPublicationContentVerificationState.HASH_MISMATCH,
    UNAVAILABLE: IpfsPublicationContentVerificationState.UNAVAILABLE,
    FAILED: 'failed'
});

export function isValidIpfsPublicationContentVerificationCoordinatorState(value) {
    return Object.values(IpfsPublicationContentVerificationCoordinatorState).includes(value);
}
