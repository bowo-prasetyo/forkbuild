import { NotificationEvent } from '../../core/social/NotificationEvent.js';
import { currentIdentityId } from '../../identity/SigningReadiness.js';
import { createVerifiedPublisherResolver } from './FollowingFeed.js';

export const BUILD_LOOKS_LIKE_YOURS_EVENT_TYPE = 'publication.looks-like-yours';
// Builds admitted before their bytes, kept for when the bytes arrive; the
// oldest is let go first.
export const MAX_BUILDS_WAITING_FOR_BYTES = 500;
// A build still waiting this long after it was admitted is let go.
export const MAX_WAITING_FOR_BYTES_MS = 30 * 24 * 60 * 60 * 1000;

// Turns a Publication newly admitted on this device into a notification for
// the signed-in identity when it looks a lot like one of their own builds
// published before it (application/publication/SimilarBuildFinder.js
// #findEarlier()), so a builder learns of a possible copy without having to
// come across it. A build dated before theirs that this device only sees now
// (the finder's 'seenBefore') is told of too, as dated before theirs: a copy
// can't stay hidden by signing an earlier date. Like the build page's list it
// is a hint, never a finding: the notification says the build looks like
// theirs, and opens its page,
// where they can weigh it. The build must be verifiably signed by someone
// else they haven't blocked, who didn't build it with them; their own build
// must be verifiably signed by them; remixes of theirs are left out (the
// finder leaves out the remix family, and RemixedBuildNotifier tells of
// those). The notification store deduplicates by the new build's
// Publication id (core/social/NotificationDeduplicationPolicy.js).
//
// A build can be admitted before its bytes reach this device (Explore lists a
// signed record and fetches the build later). Such a build waits by its
// content hash, and is compared when handleContentStored() hears that those
// bytes were stored (StoreSnapshotContentUseCase#onStored(),
// PeerContentExchange#onContentReceived()). With a `waitingStore`
// (application/publication/LookAlikeWaitingStore.js) the list outlives the
// visit: restoreWaiting() takes it back at startup.
export class LookAlikeBuildNotifier {
    constructor({ identityProvider, similarBuildFinder, isBlocked = () => false, notificationSink, verifier = undefined, now = () => new Date(), waitingStore = null }) {
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
        // Content hash -> { publication, since }: admitted before its bytes,
        // waiting since `since` (ms).
        this._waiting = new Map();
        this._waitingStore = waitingStore;
    }

    // Takes back the builds a past visit left waiting: each whose Publication
    // `findPublication(id)` still knows, and that hasn't waited longer than
    // MAX_WAITING_FOR_BYTES_MS, is checked now (its bytes may have arrived
    // since) and otherwise waits on, keeping when it started. Resolves once
    // they are checked. Never rejects.
    restoreWaiting(findPublication) {
        return this._enqueue(() => {
            const nowMs = this._nowMs();
            const restored = [];
            for (const entry of this._waitingStore ? this._waitingStore.load() : []) {
                if (nowMs - entry.since > MAX_WAITING_FOR_BYTES_MS) continue;
                let publication = null;
                try {
                    publication = findPublication(entry.publicationId);
                } catch {
                    publication = null;
                }
                if (!publication || hashOf(publication) !== entry.contentHash) continue;
                restored.push({ publication, since: entry.since });
            }
            // What is saved is what waits now: the restored builds wait again,
            // with their first `since`, as each check below finds its bytes
            // still missing.
            this._saveWaiting();
            return restored;
        }).then((restored) => Promise.all((restored || []).map(({ publication, since }) =>
            this._enqueue(() => this._check(publication, { waitForBytes: true, since })))));
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
            const waiting = this._waiting.get(contentHash);
            if (!waiting) return null;
            this._waiting.delete(contentHash);
            this._saveWaiting();
            return this._check(waiting.publication, { waitForBytes: false });
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

    _wait(publication, since = null) {
        const hash = hashOf(publication);
        if (!hash) return;
        const startedAt = this._waiting.get(hash)?.since ?? since ?? this._nowMs();
        this._waiting.delete(hash);
        this._waiting.set(hash, { publication, since: startedAt });
        while (this._waiting.size > MAX_BUILDS_WAITING_FOR_BYTES) {
            this._waiting.delete(this._waiting.keys().next().value);
        }
        this._saveWaiting();
    }

    _saveWaiting() {
        if (!this._waitingStore) return;
        this._waitingStore.save([...this._waiting.entries()].map(([contentHash, { publication, since }]) => ({ publicationId: publication.id, contentHash, since })));
    }

    _nowMs() {
        const now = this._now();
        return now instanceof Date ? now.getTime() : Number(now);
    }

    async _check(publication, { waitForBytes, since = null }) {
        if (!publication) return null;
        const recipientIdentityId = currentIdentityId(this._identityProvider);
        // Nobody to tell yet: it waits, to be compared once someone is signed
        // in (when its bytes are heard of, or at the next start).
        if (!recipientIdentityId) {
            if (waitForBytes) this._wait(publication, since);
            return null;
        }
        const builder = this._signerOf(publication);
        if (!builder || builder === recipientIdentityId || this._isBlocked(builder)) return null;
        if ((publication.builtWith || []).some((entry) => entry?.identityId === recipientIdentityId)) return null;
        if (typeof this._finder.canCompare === 'function' && !(await this._finder.canCompare(publication))) {
            if (waitForBytes) this._wait(publication, since);
            return null;
        }
        const matches = await this._finder.findEarlier(publication, { by: [recipientIdentityId] });
        const yours = (matches || []).find((match) => this._signerOf(match.publication) === recipientIdentityId);
        if (!yours) return null;
        // The finder says how alike (its `share`), so this file, which the
        // 🔔's text loads at startup, needn't load the comparison itself.
        const share = yours.share || { kind: 'same', percent: Math.round((yours.evidence?.similarity || 0) * 100) };
        const event = new NotificationEvent({
            eventType: BUILD_LOOKS_LIKE_YOURS_EVENT_TYPE,
            recipientIdentityId,
            createdAt: this._now(),
            payload: {
                publicationId: publication.id,
                title: text(publication.title),
                author: text(publication.author),
                yourTitle: text(yours.publication.title),
                // How alike (core/catalog/BuildSimilarity.js#lookAlikeShare()):
                // 'theirsInMine' is how much of yours stands in the new build.
                percent: share.percent,
                share: share.kind,
                datedBefore: yours.order === 'seenBefore'
            }
        });
        this._notificationSink(event);
        return event;
    }
}

function hashOf(publication) {
    return publication?.contentReference?.hash ?? publication?.contentHash ?? null;
}

function text(value) {
    return typeof value === 'string' ? value : '';
}
