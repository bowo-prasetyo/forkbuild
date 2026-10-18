import { NotificationEvent } from '../../../core/NotificationEvent.js';
import { isLaterHeart } from '../../../core/PublicationHeart.js';
import { resolveSigningIdentityId } from '../../../identity/resolveSigningIdentityId.js';

export const PUBLICATION_HEARTED_EVENT_TYPE = 'publication.hearted';

// Tells a builder someone hearted their build: for a heart accepted from
// elsewhere that is new here, still that person's latest word on the build,
// someone else's, and on a Publication this identity published. A heart
// taken back tells no one.
export class PublicationHeartNotificationBridge {
    constructor(discoveryProvider, identityProvider, heartStore, notificationSink) {
        if (!discoveryProvider || typeof discoveryProvider.findById !== 'function') {
            throw new Error('PublicationHeartNotificationBridge: a discoveryProvider is required');
        }
        if (!heartStore || typeof heartStore.latestFor !== 'function') {
            throw new Error('PublicationHeartNotificationBridge: a PublicationHeartStore is required');
        }
        if (typeof notificationSink !== 'function') {
            throw new Error('PublicationHeartNotificationBridge: a notificationSink function is required');
        }
        this._discoveryProvider = discoveryProvider;
        this._identityProvider = identityProvider;
        this._heartStore = heartStore;
        this._notificationSink = notificationSink;
    }

    handleHeartReceived({ heart, isNew } = {}) {
        if (!isNew || !heart || !heart.hearted) {
            return;
        }
        const latest = this._heartStore.latestFor(heart.publicationId, heart.authorIdentityId);
        if (latest && latest.heartId !== heart.heartId && isLaterHeart(latest, heart)) {
            return;
        }
        const me = resolveSigningIdentityId(this._identityProvider);
        if (!me || me === heart.authorIdentityId) {
            return;
        }
        const publication = this._discoveryProvider.findById(heart.publicationId);
        if (!publication || !publication.publisherIdentity || publication.publisherIdentity.id !== me) {
            return;
        }
        this._notificationSink(buildPublicationHeartedNotificationEvent(heart, publication));
    }
}

export function buildPublicationHeartedNotificationEvent(heart, publication) {
    return new NotificationEvent({
        eventType: PUBLICATION_HEARTED_EVENT_TYPE,
        recipientIdentityId: publication.publisherIdentity.id,
        createdAt: heart.createdAt,
        payload: {
            publicationId: heart.publicationId,
            heartId: heart.heartId,
            authorIdentityId: heart.authorIdentityId,
            author: heart.authorName || '',
            title: typeof publication.title === 'string' ? publication.title : ''
        }
    });
}
