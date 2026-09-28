import { NotificationEvent } from '../../core/NotificationEvent.js';
import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';
import { createVerifiedPublisherResolver } from './FollowingFeed.js';

export const FOLLOWED_AUTHOR_PUBLISHED_EVENT_TYPE = 'publication.followed-author-published';

// Turns a Publication newly admitted on this device into a notification for
// the signed-in identity, when its verified signer is someone they follow and
// haven't blocked. The notification store deduplicates by Publication id
// (core/NotificationDeduplicationPolicy.js), so hearing of the same
// Publication again, from another source or another session, adds nothing.
export class FollowedAuthorPublicationNotifier {
    constructor({ identityProvider, isFollowing, isBlocked = () => false, notificationSink, verifier = undefined, now = () => new Date() }) {
        if (!identityProvider) {
            throw new Error('FollowedAuthorPublicationNotifier: identityProvider is required');
        }
        if (typeof isFollowing !== 'function') {
            throw new Error('FollowedAuthorPublicationNotifier: isFollowing is required');
        }
        if (typeof notificationSink !== 'function') {
            throw new Error('FollowedAuthorPublicationNotifier: a notificationSink function is required');
        }
        this._identityProvider = identityProvider;
        this._isFollowing = isFollowing;
        this._isBlocked = isBlocked;
        this._notificationSink = notificationSink;
        this._now = now;
        this._signerOf = createVerifiedPublisherResolver(verifier);
    }

    // Returns the NotificationEvent handed to the sink, or null.
    handlePublicationAdmitted(publication) {
        const recipientIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!recipientIdentityId) return null;
        const signer = this._signerOf(publication);
        if (!signer || signer === recipientIdentityId || !this._isFollowing(signer) || this._isBlocked(signer)) {
            return null;
        }
        const event = new NotificationEvent({
            eventType: FOLLOWED_AUTHOR_PUBLISHED_EVENT_TYPE,
            recipientIdentityId,
            createdAt: this._now(),
            payload: {
                publicationId: publication.id,
                title: typeof publication.title === 'string' ? publication.title : '',
                author: typeof publication.author === 'string' ? publication.author : ''
            }
        });
        this._notificationSink(event);
        return event;
    }
}
