import { FunnelEvent, funnelEventHitUrl, isFunnelEvent, publishedBuildEvents, shouldCountFunnelEvent } from '../../core/VisitorCount.js';

// Tells the visitor counter about a few moments in sharing a build
// (core/VisitorCount.js, FunnelEvent), under the daily count's own rules and
// setting. Remembers, for this page only, which builds were opened from a
// shared link, so copying one of them into the Editor counts as a remix from
// a link. `listOwnPublications` returns the Publications this device has
// published (LocalDiscoveryProvider#list()), read when a build is published.
// Never throws: a counter must not be able to stop what it counts.
export class FunnelEventCounter {
    constructor({ settingsStore, origin, privacySignals = {}, random = Math.random, sendHit, listOwnPublications = () => [] }) {
        this._settingsStore = settingsStore;
        this._origin = origin;
        this._privacySignals = privacySignals;
        this._random = random;
        this._sendHit = sendHit;
        this._listOwnPublications = listOwnPublications;
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

    joinedChallenge() {
        return this.count(FunnelEvent.CHALLENGE_JOIN);
    }

    visitedPlaza() {
        return this.count(FunnelEvent.PLAZA_VISIT);
    }

    // Counted once per build opened from a link.
    forked(sourceDocumentId) {
        if (!this._openedFromLink.delete(sourceDocumentId)) return false;
        return this.count(FunnelEvent.REMIX_FROM_LINK);
    }

    // A build just published (core/VisitorCount.js, publishedBuildEvents).
    // Returns the events sent.
    publishedBuild(publication, brickCount) {
        try {
            const events = publishedBuildEvents({ publication, brickCount, ownPublications: this._listOwnPublications() });
            return events.filter((event) => this.count(event));
        } catch {
            return [];
        }
    }
}
