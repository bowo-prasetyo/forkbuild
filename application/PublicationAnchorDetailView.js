// 0.8.14 — External Evidence Inspection & Locator UX.
//
// application/PublicationEvidenceView.js (0.8.3) turns a PublicationAnchor
// plus an OPTIONAL, already-computed verification result into a flat,
// UI-ready shape, but only ever surfaces the fields that view needs —
// never everything ONE anchor itself carries. Nothing in this codebase
// has ever let a person look at the evidence itself: the raw `proof`,
// the full `anchoredAt` claim, and the exact publicationId/contentHash
// pair the anchor's own signature binds together. This file is that
// missing "look at the evidence" view, built with the identical
// restraint every derived view in this codebase already holds (see
// application/PublicationResolutionView.js's own header): pure,
// synchronous, side-effect-free, and it never imports application/
// LocalPublicationAnchorCatalog.js or application/ExternalAnchorVerifier.js.
// Calling this twice for the same anchor always returns a byte-identical
// result, and calling it at all never changes the anchor, the catalog,
// or anything else this replica holds. See docs/Principles.md,
// "Inspection Is Observation; Verification Is An Explicit Operation
// (0.8.14)."
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: `proof` is returned exactly
// as the anchor itself carries it — an opaque, anchorType-defined value
// this file never reaches into. There is no `proof.txid`, no
// `proof.confirmations`, no `proof.blockHeight` read anywhere below. See
// anchoring/BitcoinAnchorEvidenceView.js for the one place a
// Bitcoin-shaped `proof` is ever interpreted, and application/
// ExternalAnchorEvidenceViewRegistry.js for why that interpretation
// lives behind its own anchorType-keyed seam rather than an
// `if (anchorType === 'bitcoin-op-return')` branch here.
//
// `anchoredAtLabel` exists so a caller never has to invent its own
// wording for the restraint core/PublicationAnchor.js's own header
// already states: `anchoredAt` is the EXTERNAL system's own reported
// timestamp, never something this replica independently established.
// "Claimed external recording time" — never "Verified at," "Confirmed
// at," or "Recorded at" — is the one sentence this file writes for it.
export function publicationAnchorDetailView(anchor) {
    if (!anchor || typeof anchor.toJSON !== 'function') {
        throw new Error('publicationAnchorDetailView: a PublicationAnchor instance is required');
    }
    return {
        anchorId: anchor.id,
        anchorType: anchor.anchorType,
        publicationId: anchor.publicationId,
        contentHash: anchor.contentHash,
        locator: anchor.locator,
        proof: anchor.proof,
        anchoredAt: anchor.anchoredAt instanceof Date ? anchor.anchoredAt.toISOString() : anchor.anchoredAt,
        anchoredAtLabel: 'Claimed external recording time',
        anchorIdentityId: anchor.anchorIdentity ? anchor.anchorIdentity.id : null,
        bindingDescription: describeAnchorBinding(anchor.publicationId, anchor.contentHash)
    };
}

// The one sentence naming the relationship a PublicationAnchor's own
// signature binds together — never repaired, cross-checked, or compared
// against a locally known publication's own `contentReference.hash`
// here. That cross-check is application/ExternalAnchorVerifier.js's own
// job, a SEPARATE, explicit "Verify Evidence" step (0.8.3) — 0.8.7's own
// header already established that a bundled anchor's claim is preserved
// unchanged, never silently repaired, and this sentence extends that
// restraint to the screen: it says exactly what the anchor CLAIMS,
// worded as a claim ("claims... was externally recorded with"), never
// as an established fact ("is," "matches," "belongs to").
export function describeAnchorBinding(publicationId, contentHash) {
    return `This anchor claims that publication ${publicationId} was externally recorded with content hash ${contentHash}.`;
}
