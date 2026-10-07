export const OWN_COMMENTARY_DISTRIBUTIONS_KEY = 'own-commentary-distributions';
const MAX_ENTRIES = 2000;

// Which networks this device has sent each of its comments to, when posting
// or later with Distribute. A network's publish() reports nothing back to
// posting, and nothing else keeps the results past a reload, so this is what
// a comment's "Sent to …" line and Distribute's "already sent" check read.
// It knows only what this device sent: a comment sent from another device,
// or before this log existed, has no entry here.
//
// One entry per comment and network, newest last:
// { commentaryId, publicationId, substrate, locator, url, at }.
export class PublicationCommentaryDistributionLog {
    constructor(storageProvider, { now = () => new Date() } = {}) {
        if (!storageProvider || typeof storageProvider.load !== 'function' || typeof storageProvider.save !== 'function') {
            throw new Error('PublicationCommentaryDistributionLog requires a storage provider');
        }
        this._storage = storageProvider;
        this._now = now;
        this._listeners = new Set();
    }

    // `result` is a distribution's publish() result: { published: true, locator, url? }.
    // Anything else (null, a declined publish) records nothing.
    record({ commentary, substrate, result }) {
        if (!commentary || typeof commentary.commentaryId !== 'string' || typeof substrate !== 'string') return null;
        if (!result || result.published !== true) return null;
        const entry = {
            commentaryId: commentary.commentaryId,
            publicationId: typeof commentary.publicationId === 'string' ? commentary.publicationId : null,
            substrate,
            locator: result.locator == null ? null : String(result.locator),
            url: typeof result.url === 'string' ? result.url : null,
            at: this._now().toISOString()
        };
        const kept = this.list().filter((e) => !(e.commentaryId === entry.commentaryId && e.substrate === entry.substrate));
        kept.push(entry);
        this._storage.save(OWN_COMMENTARY_DISTRIBUTIONS_KEY, kept.slice(-MAX_ENTRIES));
        for (const listener of this._listeners) {
            try {
                listener(entry);
            } catch {
            }
        }
        return entry;
    }

    list() {
        const stored = this._storage.load(OWN_COMMENTARY_DISTRIBUTIONS_KEY);
        return Array.isArray(stored)
            ? stored.filter((e) => e && typeof e.commentaryId === 'string' && typeof e.substrate === 'string')
            : [];
    }

    findByCommentaryId(commentaryId) {
        return this.list().filter((e) => e.commentaryId === commentaryId);
    }

    // `listener(entry)` after each record(); returns the unsubscribe function.
    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }
}
