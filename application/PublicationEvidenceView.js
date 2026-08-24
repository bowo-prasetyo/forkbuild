import { AnchorVerificationOutcome } from './AnchorVerificationOutcome.js';

// 0.8.3 — Publication Center: External Evidence UX.
//
// core/BlueprintAttributionView.js and application/
// PublicationResolutionView.js each derive a plain, ephemeral,
// presentation-only shape from state this replica already holds —
// never persisted, never itself a signed fact. This file is the
// identical idea applied to evidence: it turns a list of already-
// discovered core/PublicationAnchor.js instances (application/
// PublicationEvidenceCoordinator.js#discover(), a synchronous local
// catalog read) plus an OPTIONAL, caller-supplied map of verification
// results (application/PublicationEvidenceCoordinator.js#verify(),
// called separately, per anchor, only when a person asks) into one
// flat, UI-ready shape.
//
// This file is pure and read-only — synchronous, side-effect-free, and
// never imports application/LocalPublicationAnchorCatalog.js,
// application/ExternalAnchorVerifier.js, or core/PublicationAnchor.js's
// own mutating surface. It never modifies a PublicationAnchor, never
// writes to the catalog, and never calls a verifier itself; it only
// ever reshapes values a caller already obtained elsewhere. See
// docs/Principles.md, "Known Evidence Is Not Verified Evidence, And
// Verified Evidence Is Not Authority (0.8.3)."
//
// The central discipline this file exists to enforce in the UI layer:
// a `describeAnchorEvidence()` view never collapses the seven
// application/AnchorVerificationOutcome.js values into a single
// "verified"/"unverified" boolean, and never derives — from however
// many anchors are known or verified — any notion of which one is
// "best," "canonical," or "strongest." `publicationEvidenceView()`
// returns every known anchor, in the same order it was handed, with no
// ranking applied anywhere in this file.
export function publicationEvidenceView(anchors, verifications = {}) {
    if (!Array.isArray(anchors)) {
        throw new Error('publicationEvidenceView: an array of PublicationAnchor instances is required');
    }
    return {
        count: anchors.length,
        anchors: anchors.map((anchor) => describeAnchorEvidence(anchor, verifications[anchor.id]))
    };
}

// One anchor's derived display shape:
//
//   { anchorId, anchorType, locator, anchoredAt, anchorIdentityId,
//     publicationId, contentHash, proof,
//     verified, verificationOutcome, verificationLabel, verificationReason }
//
// `verification` is `undefined`/`null` for an anchor this replica has
// cataloged but never asked application/ExternalAnchorVerifier.js
// about, `{ checking: true }` while a verify() call is in flight, or
// `{ outcome, reason }` — the exact shape application/
// PublicationEvidenceCoordinator.js#verify() resolves to — once one
// has completed. `verified` is `true` only in that last case; a
// verification currently in flight is reported as its own distinct
// state, never folded into either "verified" or "not yet verified."
export function describeAnchorEvidence(anchor, verification = null) {
    if (!anchor) {
        throw new Error('describeAnchorEvidence: a PublicationAnchor is required');
    }
    const checking = Boolean(verification && verification.checking);
    const verified = Boolean(verification && !verification.checking && verification.outcome);
    return {
        anchorId: anchor.id,
        anchorType: anchor.anchorType,
        locator: anchor.locator,
        anchoredAt: anchor.anchoredAt instanceof Date ? anchor.anchoredAt.toISOString() : anchor.anchoredAt,
        anchorIdentityId: anchor.anchorIdentity ? anchor.anchorIdentity.id : null,
        publicationId: anchor.publicationId,
        contentHash: anchor.contentHash,
        proof: anchor.proof,
        checking,
        verified,
        verificationOutcome: verified ? verification.outcome : null,
        verificationLabel: checking ? 'Checking…' : (verified ? describeVerificationOutcome(verification.outcome) : 'Not yet verified'),
        verificationReason: verified ? verification.reason : null
    };
}

// A short, precise, human-readable label for one application/
// AnchorVerificationOutcome.js value — presentation only, mirroring
// application/PublicationResolutionView.js#describePublicationOutcome()'s
// own restraint. Deliberately NEVER collapses the distinct outcomes into
// a shared "unverified" bucket: `PROOF_UNAVAILABLE` ("the external
// system could not presently be reached") and `INVALID_PROOF` ("the
// external system was reached, and definitively rejects this proof")
// describe opposite situations, and a person deciding whether to trust
// a piece of evidence needs to be able to tell them apart. See this
// milestone's own docs/Roadmap.md entry.
export function describeVerificationOutcome(outcome) {
    switch (outcome) {
        case AnchorVerificationOutcome.VALID: return 'Independently verified';
        case AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED: return 'Proof not independently verified';
        case AnchorVerificationOutcome.PROOF_UNAVAILABLE: return 'Verification unavailable';
        case AnchorVerificationOutcome.INVALID_ENVELOPE: return 'Invalid evidence';
        case AnchorVerificationOutcome.INVALID_SIGNATURE: return 'Invalid signature';
        case AnchorVerificationOutcome.CONTENT_MISMATCH: return 'Content mismatch';
        case AnchorVerificationOutcome.INVALID_PROOF: return 'Invalid external proof';
        default: return 'Not yet verified';
    }
}

// A plain, non-judgmental summary of HOW MANY anchors are known —
// never how many are "good." Deliberately never mentions verification
// state at all: knowing about three anchors and having verified one of
// them are two separate facts, and this function only ever reports the
// first. A caller that wants to also say how many are currently VALID
// counts `view.anchors` itself, per outcome, rather than this file
// deciding which outcomes are worth highlighting.
export function describeKnownEvidenceCount(view) {
    const count = view ? view.count : 0;
    if (!count) return 'No external evidence known';
    return `${count} anchor${count === 1 ? '' : 's'} known`;
}
