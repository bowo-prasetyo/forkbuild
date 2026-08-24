import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { validatePublicationAnchor } from './PublicationAnchorValidator.js';
import { AnchorVerificationOutcome } from './AnchorVerificationOutcome.js';

// 0.8.0 — Decentralized Publication Anchoring & External Evidence.
// 0.8.1 — External Anchor Proof Adapters & Verification Registry.
//
// The one place this codebase checks a core/PublicationAnchor.js record.
// Mirrors application/PublicationResolver.js's own discipline — validate
// the envelope, construct it, verify its signature, cross-check its
// claims against what the caller already knows, never: retrieve/accept
// → trust — narrowed to what an anchor actually is: evidence ABOUT a
// publication/content hash, never the content itself. This class never
// imports content/ContentStore.js and never fetches anything ITSELF; a
// caller that wants to resolve the CONTENT an anchor names still goes
// through application/PublicationResolver.js, completely separately. A
// supplied `proofVerifier` MAY fetch (see anchoring/
// BitcoinOpReturnProofVerifier.js) — that network access is entirely the
// plugin's own, never this class's.
//
//   1. validate envelope     — is this even a well-formed
//                               PublicationAnchor?
//   2. construct envelope    — a real instance, never trusted as-is
//   3. verify signature      — did the claimed anchorIdentity really
//                               sign exactly this publicationId/
//                               contentHash/anchorType/locator/proof?
//   4. cross-check claims    — OPTIONAL: does this anchor's own
//                               contentHash/publicationId match what the
//                               caller already knows the publication to
//                               be? (never required — a caller with no
//                               local publication yet can still verify
//                               an anchor purely on its own terms)
//   5. verify proof          — OPTIONAL, anchorType-specific: a
//                               `proofVerifier` the CALLER supplies (or
//                               this class looks up in a caller-supplied
//                               `proofVerifierRegistry` — see
//                               application/
//                               ExternalProofVerifierRegistry.js), never
//                               a plugin this class or anything it
//                               imports hard-codes
//
// A `proofVerifier` has exactly the same shape application/
// PublicationResolver.js's own `kindPlugin` already established for a
// different axis:
//
//   { anchorType, verify(proof, { publicationId, contentHash, locator })
//       -> { valid, reason? } | { valid: false, unavailable: true, reason }
//       (sync or async — this method always awaits it) }
//
// Supplying one that matches the anchor's own `anchorType` and reaches a
// definite YES lets this class report the full
// AnchorVerificationOutcome.VALID. Supplying none (or one for a
// different anchorType) never fails verification outright — it reports
// AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED, an HONEST "this is
// genuinely signed evidence; its proof was never independently checked."
// A matching plugin that DID try but could not presently reach a
// definite answer (the external system was unreachable, the record
// wasn't found yet, it isn't confirmed yet — signaled by returning
// `{ valid: false, unavailable: true, reason }`, or simply by throwing,
// which this method treats identically) reports PROOF_UNAVAILABLE — a
// THIRD honest "couldn't confirm," never conflated with either of the
// other two, and never conflated with INVALID_PROOF, which this class
// reserves for a plugin that reached a definite NO. See application/
// AnchorVerificationOutcome.js's own header for why all three of
// VALID_PROOF_UNVERIFIED, PROOF_UNAVAILABLE, and INVALID_PROOF are kept
// permanently distinct, never silently upgraded to VALID and never
// silently collapsed into each other.
//
// What this class NEVER decides, on any outcome: whether the anchored
// content is authentic, whether its author is who they claim, or
// whether the external system named by `locator` is trustworthy at all.
// See docs/Principles.md, "External Anchoring Provides Evidence; It
// Does Not Establish Authority (0.8.0)."
export class ExternalAnchorVerifier {
    constructor(verifier) {
        if (!verifier || typeof verifier.verifyPublicationAnchor !== 'function') {
            throw new Error('ExternalAnchorVerifier: an authorization verifier is required');
        }
        this._verifier = verifier;
    }

    // Resolves to `{ outcome, anchor, reason }` — `outcome` always one
    // of application/AnchorVerificationOutcome.js's own values, `anchor`
    // the constructed PublicationAnchor once the envelope itself parsed
    // (even on later failure, so a caller can log against a specific
    // anchor id), `reason` a human-readable string on any outcome other
    // than VALID/VALID_PROOF_UNVERIFIED. Never throws for a problem with
    // the anchor itself, its proof, or its proofVerifier — only for a
    // contract violation by the caller (see the constructor above). Now
    // async (0.8.1) — a real proofVerifier may need to reach a real
    // external system (see anchoring/BitcoinOpReturnProofVerifier.js);
    // every synchronous 0.8.0 proofVerifier still works unchanged, since
    // `await`ing a plain, already-resolved object is a no-op.
    async verify(anchorJson, {
        expectedContentHash = null, expectedPublicationId = null, proofVerifier = null, proofVerifierRegistry = null
    } = {}) {
        // 1-2. validate + construct the envelope.
        let anchor;
        try {
            validatePublicationAnchor(anchorJson);
            anchor = PublicationAnchor.fromJSON(anchorJson);
        } catch (error) {
            return this._failure(AnchorVerificationOutcome.INVALID_ENVELOPE, error.message);
        }

        // 3. verify the anchor's own signature.
        const signatureResult = this._verifier.verifyPublicationAnchor(anchorJson);
        if (!signatureResult.valid) {
            return this._failure(AnchorVerificationOutcome.INVALID_SIGNATURE, signatureResult.reason, anchor);
        }

        // 4. optional cross-check against what the caller already knows.
        if (expectedContentHash && anchor.contentHash !== expectedContentHash) {
            return this._failure(AnchorVerificationOutcome.CONTENT_MISMATCH, 'anchor contentHash does not match the expected publication', anchor);
        }
        if (expectedPublicationId && anchor.publicationId !== expectedPublicationId) {
            return this._failure(AnchorVerificationOutcome.CONTENT_MISMATCH, 'anchor publicationId does not match the expected publication', anchor);
        }

        // 5. optional, anchorType-specific proof verification. An
        // explicit `proofVerifier` always wins over a lookup in
        // `proofVerifierRegistry` — a caller that passed both meant the
        // explicit one.
        const resolvedProofVerifier = proofVerifier
            || (proofVerifierRegistry ? proofVerifierRegistry.get(anchor.anchorType) : null);

        if (resolvedProofVerifier && resolvedProofVerifier.anchorType === anchor.anchorType) {
            let proofResult;
            try {
                proofResult = await resolvedProofVerifier.verify(anchor.proof, {
                    publicationId: anchor.publicationId,
                    contentHash: anchor.contentHash,
                    locator: anchor.locator
                });
            } catch (error) {
                // A proofVerifier that throws instead of returning
                // `{ valid: false, unavailable: true, ... }` is treated
                // exactly the same as one that returns it — the failure
                // mode (network error, timeout) is identical, and a
                // caller must never see this as "proof is wrong."
                return this._failure(AnchorVerificationOutcome.PROOF_UNAVAILABLE, error.message, anchor);
            }
            if (!proofResult || !proofResult.valid) {
                const outcome = (proofResult && proofResult.unavailable)
                    ? AnchorVerificationOutcome.PROOF_UNAVAILABLE
                    : AnchorVerificationOutcome.INVALID_PROOF;
                return this._failure(outcome, (proofResult && proofResult.reason) || 'proof verification failed', anchor);
            }
            return { outcome: AnchorVerificationOutcome.VALID, anchor, reason: null };
        }

        return { outcome: AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED, anchor, reason: 'no proof verifier available for this anchorType' };
    }

    _failure(outcome, reason, anchor = null) {
        return { outcome, anchor, reason };
    }
}
