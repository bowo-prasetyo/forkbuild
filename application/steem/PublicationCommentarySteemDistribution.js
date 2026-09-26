import { SteemDiscoveryReadOutcome } from './SteemDiscoveryThreadReader.js';

// Reads Publication Commentary envelopes from Steem discovery threads, with
// the discover() shape the Nostr and Arweave distributions have. Publishing
// is not built yet. Envelopes are returned unverified: the commentary
// exchange imports each one through the same verifier as every carrier.
export class PublicationCommentarySteemDistribution {
    constructor({ reader } = {}) {
        if (!reader || typeof reader.read !== 'function') throw new TypeError('a Steem discovery thread reader is required');
        this._reader = reader;
    }

    // Rejects when no thread could be read, so a refresh reports Steem as
    // failed rather than as having no comments.
    async discover() {
        const { outcome, announcements, threadsUnavailable } = await this._reader.read('commentary');
        if (outcome === SteemDiscoveryReadOutcome.UNAVAILABLE) {
            throw new Error(`PublicationCommentarySteemDistribution: no discovery thread could be read (${threadsUnavailable[0]?.reason ?? 'unknown reason'})`);
        }
        return announcements.map(({ envelope }) => envelope);
    }
}
