// Which of this device's own published Worlds a catalog entry shares, when
// the entry can't be resolved: one shared before content hashes became
// SHA-256, whose old hash can't vouch for its bytes (see
// PublicationResolver), so the Publications page can't read which World it
// is and can only say "publish it again".
//
// The entry's wrapped bytes, read from this device's content store, are
// never trusted here: they only name a Publication id and snapshot hash to
// look for. The answer comes from this device's own record of a
// Publication with exactly that id and hash
// (LocalPublisherProvider#findOwnPublication()), so bytes from anyone else
// can at most point at one of this device's own Worlds. No content kind is
// checked: bytes of another kind name no such record.
export class FindOwnSharedPublicationUseCase {
    constructor({ contentStore, publisherProvider } = {}) {
        if (!contentStore || typeof contentStore.get !== 'function') {
            throw new Error('FindOwnSharedPublicationUseCase: a content store is required');
        }
        if (!publisherProvider || typeof publisherProvider.findOwnPublication !== 'function') {
            throw new Error('FindOwnSharedPublicationUseCase: a publisher provider with findOwnPublication() is required');
        }
        this._contentStore = contentStore;
        this._publisherProvider = publisherProvider;
    }

    // Resolves to { publicationId, documentId, title } from this device's own
    // record, or null when the bytes aren't here, aren't a Publication's
    // JSON, or match none of this device's own records. Never throws for a
    // well-formed envelope.
    async find(envelope) {
        const reference = envelope && envelope.contentReference;
        if (!reference) return null;
        let claimed;
        try {
            const bytes = await this._contentStore.get(reference);
            if (typeof bytes !== 'string') return null;
            claimed = JSON.parse(bytes);
        } catch {
            return null;
        }
        if (!claimed || typeof claimed.id !== 'string' || typeof claimed.contentHash !== 'string') return null;
        const own = this._publisherProvider.findOwnPublication({ id: claimed.id, contentHash: claimed.contentHash });
        if (!own || !own.documentId) return null;
        return { publicationId: own.id, documentId: own.documentId, title: own.title || null };
    }
}
