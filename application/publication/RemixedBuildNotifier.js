import { NotificationEvent } from '../../core/NotificationEvent.js';
import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';
import { createVerifiedPublisherResolver } from './FollowingFeed.js';

export const BUILD_REMIXED_EVENT_TYPE = 'publication.remixed';

// Turns a Publication newly admitted on this device into a notification for
// the signed-in identity when it is a remix of one of their own builds: it
// names as its parent (`parentDocumentId`) a build this device has a
// Publication of, verifiably signed by them. The remix must be verifiably
// signed by someone else they haven't blocked. The notification store
// deduplicates by the remix's Publication id
// (core/NotificationDeduplicationPolicy.js).
export class RemixedBuildNotifier {
    // findPublicationsOfDocument(documentId): the Publications of that build
    // this device knows.
    constructor({ identityProvider, findPublicationsOfDocument, isBlocked = () => false, notificationSink, verifier = undefined, now = () => new Date() }) {
        if (!identityProvider) {
            throw new Error('RemixedBuildNotifier: identityProvider is required');
        }
        if (typeof findPublicationsOfDocument !== 'function') {
            throw new Error('RemixedBuildNotifier: findPublicationsOfDocument is required');
        }
        if (typeof notificationSink !== 'function') {
            throw new Error('RemixedBuildNotifier: a notificationSink function is required');
        }
        this._identityProvider = identityProvider;
        this._findPublicationsOfDocument = findPublicationsOfDocument;
        this._isBlocked = isBlocked;
        this._notificationSink = notificationSink;
        this._now = now;
        this._signerOf = createVerifiedPublisherResolver(verifier);
    }

    // Returns the NotificationEvent handed to the sink, or null.
    handlePublicationAdmitted(publication) {
        const parentDocumentId = publication?.parentDocumentId;
        if (typeof parentDocumentId !== 'string' || !parentDocumentId || parentDocumentId === publication.documentId) return null;
        const recipientIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!recipientIdentityId) return null;
        const remixer = this._signerOf(publication);
        if (!remixer || remixer === recipientIdentityId || this._isBlocked(remixer)) return null;
        const own = (this._findPublicationsOfDocument(parentDocumentId) || [])
            .filter((candidate) => candidate && candidate.documentId === parentDocumentId && this._signerOf(candidate) === recipientIdentityId);
        if (own.length === 0) return null;
        const original = own.reduce((newest, candidate) => (time(candidate) > time(newest) ? candidate : newest));
        const event = new NotificationEvent({
            eventType: BUILD_REMIXED_EVENT_TYPE,
            recipientIdentityId,
            createdAt: this._now(),
            payload: {
                publicationId: publication.id,
                title: text(publication.title),
                author: text(publication.author),
                remixedTitle: text(original.title)
            }
        });
        this._notificationSink(event);
        return event;
    }
}

function text(value) {
    return typeof value === 'string' ? value : '';
}

function time(publication) {
    const value = new Date(publication.publishedAt).getTime();
    return Number.isFinite(value) ? value : 0;
}
