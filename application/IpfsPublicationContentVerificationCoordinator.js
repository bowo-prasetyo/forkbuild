import { IpfsPublicationRecord } from './IpfsPublicationRecord.js';

// 0.8.70 — IPFS Publication & Content Verification UI.
//
// application/IpfsPublicationContentVerifier.js (0.8.69) already carries
// EVERY invariant this milestone exists to expose behind an explicit
// button — a fresh, uncached retrieve-and-compare that never
// distinguishes a thrown ContentUnavailableError from a store resolving
// to null, both reported as UNAVAILABLE. Nothing about that class
// changes here — this coordinator is a deliberately thin wiring on top
// of it, mirroring EXACTLY the shape application/
// BitcoinAnchorConfirmationCoordinator.js (0.8.65) already established
// for a different external boundary:
//
//   IpfsPublicationRecord { contentHash, locator, publishedAt, publicationMethod }
//           │
//           │ explicit "Verify IPFS Content" click
//           ▼
//   IpfsPublicationContentVerificationCoordinator.verify()   (THIS FILE — new)
//           │
//           ▼
//   application/IpfsPublicationContentVerifier.js#verify()   (0.8.69, UNCHANGED)
//           │
//           ▼
//   HASH_MATCH / HASH_MISMATCH / UNAVAILABLE   (0.8.69, carried straight
//                                                through — every one of
//                                                these three values is
//                                                already a valid
//                                                application/
//                                                IpfsPublicationContentVerification
//                                                CoordinatorState.js value,
//                                                so no translation of the
//                                                verifier's own result is
//                                                needed or performed)
//
// NO NEW IPFS OR HASHING LOGIC BELONGS HERE, AND NONE IS ADDED. This
// class picks no gateway, retries nothing, caches nothing, and persists
// nothing. It calls the unchanged 0.8.69 verifier exactly once per
// `verify()` call and returns its result completely unmodified.
//
// THE ONE THING THIS COORDINATOR EXISTS TO REFUSE: verifying an
// arbitrary locator/hash pair merely because it happens to be displayed
// somewhere on a page. `verify()` below requires a genuine application/
// IpfsPublicationRecord.js INSTANCE — never a plain object assembled ad
// hoc from whatever is currently on screen. This is deliberately
// STRICTER than application/IpfsPublicationContentVerifier.js's own
// contract, which duck-types any object carrying contentHash/locator
// strings — the identical narrowing application/
// BitcoinAnchorConfirmationCoordinator.js's own `broadcasted === true`
// check already applies on top of a looser anchoring/
// BitcoinAnchorConfirmationObserver.js, which only cares about txid
// format, not provenance. A caller can only satisfy this check by
// holding on to the exact record a publish attempt produced. This is a
// caller-contract check, thrown before the injected verifier is ever
// consulted — never an observation outcome of its own.
//
// ONE VERIFICATION CALL PER EXPLICIT CLICK — NO RETRY, NO POLLING, NO
// AUTOMATIC FALLBACK. A caller that wants a HISTORY of repeated
// observations keeps that history itself; this class only ever answers
// "what does this one retrieval attempt, right now, say."
//
// VERIFICATION IS NEVER TRIGGERED BY PUBLISHING. Reaching a PUBLISHED
// outcome never calls this coordinator automatically — only an explicit
// "Verify IPFS Content" click, at a UI layer, ever calls `verify()`
// below. See docs/Principles.md, "The UI Displays Observations; It Does
// Not Turn Them Into A Verdict (0.8.57)."
export class IpfsPublicationContentVerificationCoordinator {
    constructor({ ipfsPublicationContentVerifier } = {}) {
        if (!ipfsPublicationContentVerifier || typeof ipfsPublicationContentVerifier.verify !== 'function') {
            throw new Error('IpfsPublicationContentVerificationCoordinator: an IpfsPublicationContentVerifier is required');
        }
        this._verifier = ipfsPublicationContentVerifier;
    }

    // Resolves to exactly what application/IpfsPublicationContentVerifier
    // .js#verify() itself returns — `{ state, contentHash, locator,
    // reason, observedAt }` — never re-derived, re-shaped, or aggregated.
    //
    // Throws only for a caller-contract violation checked BEFORE the
    // verifier is ever consulted — `record` is not a real
    // `IpfsPublicationRecord` instance. Never throws for the verifier's
    // own operational failure — that is always reported via `state`.
    async verify(record) {
        if (!(record instanceof IpfsPublicationRecord)) {
            throw new Error('IpfsPublicationContentVerificationCoordinator: an IpfsPublicationRecord is required — pass the exact record a publish attempt produced, never a value reconstructed from whatever is currently on screen');
        }

        return this._verifier.verify(record);
    }
}
