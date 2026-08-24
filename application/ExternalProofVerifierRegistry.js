// 0.8.1 — External Anchor Proof Adapters & Verification Registry.
//
// application/ExternalAnchorVerifier.js#verify() has taken a single,
// caller-supplied `proofVerifier` since 0.8.0 — one plugin, matched
// against the anchor's own `anchorType`, per call. That is enough for a
// caller who already knows which anchorType it is about to verify. The
// moment a caller wants to verify anchors of SEVERAL different
// anchorTypes — a Publication Center showing evidence from more than one
// external system, a test flagship exercising two independent anchors —
// without hand-picking the right plugin before every single call, that
// one-plugin-per-call seam needs a lookup step in front of it. This
// registry IS that lookup step, and nothing else.
//
// It never itself verifies anything, never imports anchoring/
// BitcoinOpReturnProofVerifier.js or any other concrete adapter, and
// application/ExternalAnchorVerifier.js never imports THIS file either —
// a caller wires the two together explicitly (see application/
// CreateExternalAnchorVerifierUseCase.js), the identical "generic
// pipeline, concrete plugin wired at the composition root, never inside
// the pipeline itself" split application/PublicationResolver.js's own
// `kindPlugin` already established. No anchorType vocabulary lives here
// either — a proofVerifier names its own anchorType; this registry only
// ever reads that name back, never invents or validates it against any
// fixed list.
export class ExternalProofVerifierRegistry {
    constructor() {
        this._verifiers = new Map();
    }

    // Keyed by the proofVerifier's OWN `anchorType` — never a second,
    // caller-supplied key that could drift from what the plugin actually
    // checks. Registering a second proofVerifier for an anchorType
    // already registered REPLACES the first, the same "last write wins,
    // for a purely local lookup table" posture a caller-side registry
    // (never a shared or synced record) can safely take.
    register(proofVerifier) {
        if (!proofVerifier || typeof proofVerifier.anchorType !== 'string' || !proofVerifier.anchorType.trim()) {
            throw new Error('ExternalProofVerifierRegistry: a proofVerifier with a non-empty anchorType is required');
        }
        if (typeof proofVerifier.verify !== 'function') {
            throw new Error('ExternalProofVerifierRegistry: a proofVerifier must implement verify()');
        }
        this._verifiers.set(proofVerifier.anchorType, proofVerifier);
        return this;
    }

    unregister(anchorType) {
        this._verifiers.delete(anchorType);
    }

    has(anchorType) {
        return this._verifiers.has(anchorType);
    }

    // Returns null for an unregistered anchorType — never throws. A
    // caller that hands this registry straight to application/
    // ExternalAnchorVerifier.js's own `proofVerifierRegistry` option
    // relies on exactly that: an anchorType nobody registered a plugin
    // for falls through to AnchorVerificationOutcome.VALID_PROOF_UNVERIFIED,
    // never an error and never a rejection.
    get(anchorType) {
        return this._verifiers.get(anchorType) || null;
    }

    get anchorTypes() {
        return Array.from(this._verifiers.keys());
    }
}
