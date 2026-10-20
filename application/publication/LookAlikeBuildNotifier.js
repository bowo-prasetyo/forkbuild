import { NotificationEvent } from '../../core/NotificationEvent.js';
import { currentIdentityId } from '../../identity/SigningReadiness.js';
import { createVerifiedPublisherResolver } from './FollowingFeed.js';

export const BUILD_LOOKS_LIKE_YOURS_EVENT_TYPE = 'publication.looks-like-yours';

// Turns a Publication newly admitted on this device into a notification for
// the signed-in identity when it looks a lot like one of their own builds
// published before it (application/publication/SimilarBuildFinder.js
// #findEarlier()), so a builder learns of a possible copy without having to
// come across it. Like the build page's list it is a hint, never a finding:
// the notification says the build looks like theirs, and opens its page,
// where they can weigh it. The build must be verifiably signed by someone
// else they haven't blocked, who didn't build it with them; their own build
// must be verifiably signed by them; remixes of theirs are left out (the
// finder leaves out the remix family, and RemixedBuildNotifier tells of
// those). The notification store deduplicates by the new build's
// Publication id (core/NotificationDeduplicationPolicy.js).
export class LookAlikeBuildNotifier {
    constructor({ identityProvider, similarBuildFinder, isBlocked = () => false, notificationSink, verifier = undefined, now = () => new Date() }) {
        if (!identityProvider) {
            throw new Error('LookAlikeBuildNotifier: identityProvider is required');
        }
        if (!similarBuildFinder || typeof similarBuildFinder.findEarlier !== 'function') {
            throw new Error('LookAlikeBuildNotifier: similarBuildFinder is required');
        }
        if (typeof notificationSink !== 'function') {
            throw new Error('LookAlikeBuildNotifier: a notificationSink function is required');
        }
        this._identityProvider = identityProvider;
        this._finder = similarBuildFinder;
        this._isBlocked = isBlocked;
        this._notificationSink = notificationSink;
        this._now = now;
        this._signerOf = createVerifiedPublisherResolver(verifier);
        // One comparison at a time, so a burst of admissions (a sync) never
        // reads and compares many builds at once.
        this._queue = Promise.resolve();
    }

    // Resolves to the NotificationEvent handed to the sink, or null. Never
    // rejects.
    handlePublicationAdmitted(publication) {
        const result = this._queue.then(() => this._check(publication)).catch(() => null);
        this._queue = result;
        return result;
    }

    async _check(publication) {
        const recipientIdentityId = currentIdentityId(this._identityProvider);
        if (!recipientIdentityId || !publication) return null;
        const builder = this._signerOf(publication);
        if (!builder || builder === recipientIdentityId || this._isBlocked(builder)) return null;
        if ((publication.builtWith || []).some((entry) => entry?.identityId === recipientIdentityId)) return null;
        const matches = await this._finder.findEarlier(publication, { by: [recipientIdentityId] });
        const yours = (matches || []).find((match) => this._signerOf(match.publication) === recipientIdentityId);
        if (!yours) return null;
        const event = new NotificationEvent({
            eventType: BUILD_LOOKS_LIKE_YOURS_EVENT_TYPE,
            recipientIdentityId,
            createdAt: this._now(),
            payload: {
                publicationId: publication.id,
                title: text(publication.title),
                author: text(publication.author),
                yourTitle: text(yours.publication.title),
                percent: Math.round(yours.evidence.similarity * 100)
            }
        });
        this._notificationSink(event);
        return event;
    }
}

function text(value) {
    return typeof value === 'string' ? value : '';
}
