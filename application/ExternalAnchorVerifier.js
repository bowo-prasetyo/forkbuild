import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { validatePublicationAnchor } from './PublicationAnchorValidator.js';
import { AnchorVerificationOutcome } from './AnchorVerificationOutcome.js';

// 0.8.0 — Decentralized Publication Anchoring & External Evidence.
//
// The one place this codebase checks a core/PublicationAnchor.js record.
// Mirrors application/PublicationResolver.js's own discipline — validate
// the envelope, construct it, verify its signature, cross-check its
// claims against what the caller already knows, never: retrieve/accept
// → trust — narrowed to what an anchor actually is: evidence ABOUT a
// publication/content hash, never the content itself. This class never
// imports content/ContentStore.js and never fetches anything; a caller
// that wants to resolve the CONTENT an anchor names still goes through
// application/PublicationResolver.js, completely separately.
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
//                               `proofVerifier` the CALLER supplies,
//                               never this class or anything it imports
//
// Step 5 is deliberately never hard-coded to a real chain, ledger, or
// timestamping service — 0.8.0 ships no anchorType this codebase can
// independently check a proof against (see docs/Roadmap.md; a concrete
// backend is its own future milestone). A `proofVerifier` has exactly
// the same shape application/PublicationResolver.js's own `kindPlugin`
// already established for a different axis:
//
//   { anchorType, verify(proof, { publicationId, contentHash }) ->
//       { valid, reason } }
//
// Supplying one that matches the anchor's own `anchorType` lets this
// class report the full AnchorVerificationOutcome.VALID; supplying none
// (or one for a different anchorType) never fails verification outright
// — it reports AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED, an
// HONEST "this is genuinely signed evidence; its proof was never
// independently checked," never silently upgraded to VALID and never
// silently downgraded to a rejection. See application/
// AnchorVerificationOutcome.js's own header for why those two are kept
// permanently distinct.
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
    // the anchor itself — only for a contract violation by the caller
    // (see the constructor above).
    verify(anchorJson, {
        expectedContentHash = null, expectedPublicationId = null, proofVerifier = null
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

        // 5. optional, anchorType-specific proof verification.
        if (proofVerifier && proofVerifier.anchorType === anchor.anchorType) {
            const proofResult = proofVerifier.verify(anchor.proof, {
                publicationId: anchor.publicationId,
                contentHash: anchor.contentHash
            });
            if (!proofResult || !proofResult.valid) {
                return this._failure(AnchorVerificationOutcome.INVALID_PROOF, (proofResult && proofResult.reason) || 'proof verification failed', anchor);
            }
            return { outcome: AnchorVerificationOutcome.VALID, anchor, reason: null };
        }

        return { outcome: AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED, anchor, reason: 'no proof verifier available for this anchorType' };
    }

    _failure(outcome, reason, anchor = null) {
        return { outcome, anchor, reason };
    }
}
