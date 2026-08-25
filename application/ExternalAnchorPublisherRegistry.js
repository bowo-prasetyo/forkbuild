// 0.8.10 — External Anchor Creation Orchestration & Publisher Registry.
//
// application/CreateExternalPublicationAnchorUseCase.js needs to pick a
// concrete publisher (anchoring/BitcoinAnchorPublisher.js today) from a
// caller-supplied `anchorType` string, without ever hard-coding which
// publisher that is. This registry IS that lookup step, and nothing
// else — the exact creation-side counterpart of application/
// ExternalProofVerifierRegistry.js (0.8.1), whose own header this one
// mirrors line for line, mapping `anchorType -> publisher` instead of
// `anchorType -> proofVerifier`.
//
// It never itself publishes anything, never imports anchoring/
// BitcoinAnchorPublisher.js or any other concrete adapter, and
// application/CreateExternalPublicationAnchorUseCase.js never imports
// THIS file's own concrete publishers either — a caller wires the two
// together explicitly at a composition root (see application/
// CreateExternalPublicationAnchorOrchestratorUseCase.js), the identical
// "generic pipeline, concrete plugin wired outside it" split every
// registry in this codebase already holds. No anchorType vocabulary
// lives here either — a publisher names its own anchorType; this
// registry only ever reads that name back, never invents or validates
// it against any fixed list. It never ranks publishers, never picks a
// "preferred" anchorType, and never falls back from one anchorType to
// another — see docs/Principles.md, "External Anchor Creation
// Orchestrates; It Does Not Decide (0.8.10)."
export class ExternalAnchorPublisherRegistry {
    constructor() {
        this._publishers = new Map();
    }

    // Keyed by the publisher's OWN `anchorType` — never a second,
    // caller-supplied key that could drift from what the plugin actually
    // publishes. Registering a second publisher for an anchorType
    // already registered REPLACES the first, the same "last write wins,
    // for a purely local lookup table" posture application/
    // ExternalProofVerifierRegistry.js already takes.
    register(publisher) {
        if (!publisher || typeof publisher.anchorType !== 'string' || !publisher.anchorType.trim()) {
            throw new Error('ExternalAnchorPublisherRegistry: a publisher with a non-empty anchorType is required');
        }
        if (typeof publisher.publish !== 'function') {
            throw new Error('ExternalAnchorPublisherRegistry: a publisher must implement publish()');
        }
        this._publishers.set(publisher.anchorType, publisher);
        return this;
    }

    unregister(anchorType) {
        this._publishers.delete(anchorType);
    }

    has(anchorType) {
        return this._publishers.has(anchorType);
    }

    // Returns null for an unregistered anchorType — never throws. Unlike
    // application/ExternalProofVerifierRegistry.js#get(), whose caller
    // (application/ExternalAnchorVerifier.js) has an honest fallback
    // outcome for "no plugin" (VALID_PROOF_UNVERIFIED), a null return
    // here has no such fallback: application/
    // CreateExternalPublicationAnchorUseCase.js treats it as a refusal
    // to proceed, since there is no degraded-but-honest way to create
    // external evidence without a publisher. See that file's own header.
    get(anchorType) {
        return this._publishers.get(anchorType) || null;
    }

    get anchorTypes() {
        return Array.from(this._publishers.keys());
    }
}
