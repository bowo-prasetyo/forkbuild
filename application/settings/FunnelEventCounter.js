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

    // A "Walk here with me" link made (application/walkTogether/).
    madeWalkLink() {
        return this.count(FunnelEvent.WALK_LINK);
    }

    // A friend arrived through one.
    joinedWalk() {
        return this.count(FunnelEvent.WALK_JOINED);
    }

    // A "Build with me" link made (application/buildTogether/).
    madeBuildLink() {
        return this.count(FunnelEvent.BUILD_LINK);
    }

    // A friend joined through one.
    joinedBuild() {
        return this.count(FunnelEvent.BUILD_JOINED);
    }

    // A build just published and sent to everyone (core/BuildNote.js).
    publishedFound() {
        return this.count(FunnelEvent.PUBLISH_FOUND);
    }

    // A build just published and kept to its link.
    publishedLinkOnly() {
        return this.count(FunnelEvent.PUBLISH_LINK_ONLY);
    }

    // Counted once per build opened from a link.
    forked(sourceDocumentId) {
        if (!this._openedFromLink.delete(sourceDocumentId)) return false;
        return this.count(FunnelEvent.REMIX_FROM_LINK);
    }

    // A build just published (core/VisitorCount.js, publishedBuildEvents).
    // Returns the events sent.
    // `placedCount`: how many of its bricks its builder placed or changed
    // (application/document/ReadyMadeBricksStore.js), when known.
    publishedBuild(publication, brickCount, placedCount) {
        try {
            const events = publishedBuildEvents({ publication, brickCount, placedCount, ownPublications: this._listOwnPublications() });
            return events.filter((event) => this.count(event));
        } catch {
            return [];
        }
    }
}
