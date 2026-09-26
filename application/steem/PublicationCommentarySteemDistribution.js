import { SteemDiscoveryReadOutcome } from './SteemDiscoveryThreadReader.js';

// Publication Commentary on Steem, with the publish()/discover() shape the
// Nostr and Arweave distributions have. Envelopes are read back unverified:
// the commentary exchange imports each one through the same verifier as
// every carrier.
export class PublicationCommentarySteemDistribution {
    constructor({ reader, announcer = null } = {}) {
        if (!reader || typeof reader.read !== 'function') throw new TypeError('a Steem discovery thread reader is required');
        this._reader = reader;
        this._announcer = announcer;
    }

    // Rejects with the reason when Steem can't take the comment; the caller
    // has already stored it locally.
    async publish(envelopeJson) {
        if (!this._announcer) throw new Error('PublicationCommentarySteemDistribution: announcing on Steem is not available');
        const announcement = await this._announcer.announce('commentary', JSON.parse(JSON.stringify(envelopeJson)));
        return Object.freeze({ published: true, locator: announcement.id, url: announcement.url });
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
