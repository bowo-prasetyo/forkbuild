// 0.8.14 — External Evidence Inspection & Locator UX.
//
// application/PublicationAnchorDetailView.js (this milestone) derives the
// generic detail every anchor carries, deliberately WITHOUT interpreting
// anything only one anchorType's own adapter could make sense of (see
// that file's own header on why `proof` is returned opaque). Turning a
// Bitcoin anchor's `proof.txid`/`network` into a human-readable summary
// and a followable block-explorer destination is exactly that kind of
// anchorType-specific interpretation, and this registry is the SAME
// `anchorType -> plugin` lookup seam application/
// ExternalAnchorPublisherRegistry.js (0.8.10, creation) and application/
// ExternalProofVerifierRegistry.js (0.8.1, verification) already
// established, applied here to a third, independent axis: presentation.
//
// It never itself describes anything, never imports anchoring/
// BitcoinAnchorEvidenceView.js or any other concrete adapter, and
// application/PublicationAnchorDetailView.js never imports THIS file
// either — a caller (ordinarily ui/views/DecentralizedPublicationsView.js)
// looks an anchor's own `anchorType` up here, entirely separately from
// calling publicationAnchorDetailView() itself. No anchorType vocabulary
// lives here — an evidenceView names its own anchorType; this registry
// only ever reads that name back, never invents or validates it against
// any fixed list.
//
// An evidenceView's own `describe(anchor)` MUST stay exactly as pure and
// side-effect-free as application/PublicationAnchorDetailView.js itself:
// no network request, no verification, no mutation. See anchoring/
// BitcoinAnchorEvidenceView.js's own header for the shape it returns and
// everything it deliberately never decides.
export class ExternalAnchorEvidenceViewRegistry {
    constructor() {
        this._evidenceViews = new Map();
    }

    // Keyed by the plugin's OWN `anchorType` — never a second,
    // caller-supplied key that could drift from what the plugin actually
    // describes. Registering a second evidenceView for an anchorType
    // already registered REPLACES the first, the same "last write wins,
    // for a purely local lookup table" posture every sibling registry in
    // this codebase already takes.
    register(evidenceView) {
        if (!evidenceView || typeof evidenceView.anchorType !== 'string' || !evidenceView.anchorType.trim()) {
            throw new Error('ExternalAnchorEvidenceViewRegistry: an evidenceView with a non-empty anchorType is required');
        }
        if (typeof evidenceView.describe !== 'function') {
            throw new Error('ExternalAnchorEvidenceViewRegistry: an evidenceView must implement describe()');
        }
        this._evidenceViews.set(evidenceView.anchorType, evidenceView);
        return this;
    }

    unregister(anchorType) {
        this._evidenceViews.delete(anchorType);
    }

    has(anchorType) {
        return this._evidenceViews.has(anchorType);
    }

    // Returns null for an unregistered anchorType — never throws. A
    // caller with no plugin for this anchor's type simply shows the
    // generic application/PublicationAnchorDetailView.js shape alone,
    // exactly as honestly as application/ExternalProofVerifierRegistry.js's
    // own null falls through to an honest "not independently verified"
    // outcome one layer over.
    get(anchorType) {
        return this._evidenceViews.get(anchorType) || null;
    }

    get anchorTypes() {
        return Array.from(this._evidenceViews.keys());
    }
}
