import { FunnelEvent, funnelEventHitUrl, isFunnelEvent, shouldCountFunnelEvent } from '../../core/VisitorCount.js';

// Tells the visitor counter about a few moments in sharing a build
// (core/VisitorCount.js, FunnelEvent), under the daily count's own rules and
// setting. Remembers, for this page only, which builds were opened from a
// shared link, so copying one of them into the Editor counts as a remix from
// a link. Never throws: a counter must not be able to stop what it counts.
export class FunnelEventCounter {
    constructor({ settingsStore, origin, privacySignals = {}, random = Math.random, sendHit }) {
        this._settingsStore = settingsStore;
        this._origin = origin;
        this._privacySignals = privacySignals;
        this._random = random;
        this._sendHit = sendHit;
        this._openedFromLink = new Set();
    }

    // Returns true when a hit was sent.
    count(event) {
        try {
            if (!isFunnelEvent(event)) return false;
            if (!shouldCountFunnelEvent({ settings: this._settingsStore.get(), origin: this._origin, privacySignals: this._privacySignals })) {
                return false;
            }
            this._sendHit(funnelEventHitUrl(event, String(this._random()).slice(2)));
            return true;
        } catch {
            return false;
        }
    }

    sharedLink() {
        return this.count(FunnelEvent.SHARE_LINK);
    }

    openedSharedLink(documentId) {
        if (typeof documentId === 'string' && documentId) this._openedFromLink.add(documentId);
        return this.count(FunnelEvent.OPENED_SHARED_LINK);
    }

    installed() {
        return this.count(FunnelEvent.INSTALLED);
    }

    copiedEmbedCode() {
        return this.count(FunnelEvent.EMBED_CODE);
    }

    embedViewed() {
        return this.count(FunnelEvent.EMBED_VIEW);
    }

    openedFromEmbed() {
        return this.count(FunnelEvent.EMBED_OPEN);
    }

    // Counted once per build opened from a link.
    forked(sourceDocumentId) {
        if (!this._openedFromLink.delete(sourceDocumentId)) return false;
        return this.count(FunnelEvent.REMIX_FROM_LINK);
    }
}
