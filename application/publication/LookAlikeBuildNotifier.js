import { NotificationEvent } from '../../core/NotificationEvent.js';
import { currentIdentityId } from '../../identity/SigningReadiness.js';
import { createVerifiedPublisherResolver } from './FollowingFeed.js';

export const BUILD_LOOKS_LIKE_YOURS_EVENT_TYPE = 'publication.looks-like-yours';
// Builds admitted before their bytes, kept for when the bytes arrive; the
// oldest is let go first.
export const MAX_BUILDS_WAITING_FOR_BYTES = 500;

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
//
// A build can be admitted before its bytes reach this device (Explore lists a
// signed record and fetches the build later). Such a build waits, in memory,
// by its content hash, and is compared when handleContentStored() hears that
// those bytes were stored (StoreSnapshotContentUseCase#onStored(),
// PeerContentExchange#onContentReceived()).
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
        // Content hash -> the Publication admitted before its bytes.
        this._waiting = new Map();
    }

    // Resolves to the NotificationEvent handed to the sink, or null. Never
    // rejects.
    handlePublicationAdmitted(publication) {
        return this._enqueue(() => this._check(publication, { waitForBytes: true }));
    }

    // The bytes for `contentHash` were stored: a build waiting for them is
    // compared now (and, if they still can't be read, let go). Looked up in
    // the same queue, so a check of that build still running when the bytes
    // land has already put it here. Resolves as handlePublicationAdmitted()
    // does.
    handleContentStored(contentHash) {
        return this._enqueue(() => {
            const publication = this._waiting.get(contentHash);
            if (!publication) return null;
            this._waiting.delete(contentHash);
            return this._check(publication, { waitForBytes: false });
        });
    }

    // How many builds are waiting for their bytes.
    get waitingCount() {
        return this._waiting.size;
    }

    _enqueue(work) {
        const result = this._queue.then(work).catch(() => null);
        this._queue = result;
        return result;
    }

    _wait(publication) {
        const hash = publication.contentReference?.hash ?? publication.contentHash;
        if (!hash) return;
        this._waiting.delete(hash);
        this._waiting.set(hash, publication);
        while (this._waiting.size > MAX_BUILDS_WAITING_FOR_BYTES) {
            this._waiting.delete(this._waiting.keys().next().value);
        }
    }

    async _check(publication, { waitForBytes }) {
        const recipientIdentityId = currentIdentityId(this._identityProvider);
        if (!recipientIdentityId || !publication) return null;
        const builder = this._signerOf(publication);
        if (!builder || builder === recipientIdentityId || this._isBlocked(builder)) return null;
        if ((publication.builtWith || []).some((entry) => entry?.identityId === recipientIdentityId)) return null;
        if (typeof this._finder.canCompare === 'function' && !(await this._finder.canCompare(publication))) {
            if (waitForBytes) this._wait(publication);
            return null;
        }
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
