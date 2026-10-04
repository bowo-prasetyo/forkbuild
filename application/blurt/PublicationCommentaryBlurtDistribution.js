import { BlurtDiscoveryReadOutcome } from './BlurtDiscoveryReader.js';

// Publication Commentary on Blurt, with the publish()/discover() shape the
// other carriers have. Envelopes are read back unverified: the commentary
// exchange imports each one through the same verifier as every carrier.
export class PublicationCommentaryBlurtDistribution {
    constructor({ reader, poster = null } = {}) {
        if (!reader || typeof reader.read !== 'function') throw new TypeError('a Blurt discovery reader is required');
        this._reader = reader;
        this._poster = poster;
    }

    // Rejects with the reason when Blurt can't take the comment; the caller
    // has already stored it locally.
    async publish(envelopeJson) {
        if (!this._poster) throw new Error('PublicationCommentaryBlurtDistribution: posting on Blurt is not available');
        const posted = await this._poster.announce('commentary', JSON.parse(JSON.stringify(envelopeJson)));
        return Object.freeze({ published: true, locator: posted.id, url: posted.url });
    }

    // Rejects when nothing could be read, so a refresh reports Blurt as
    // failed rather than as having no comments.
    async discover() {
        const { outcome, announcements, sourcesUnavailable } = await this._reader.read('commentary');
        if (outcome === BlurtDiscoveryReadOutcome.UNAVAILABLE) {
            throw new Error(`PublicationCommentaryBlurtDistribution: Blurt could not be read (${sourcesUnavailable[0]?.reason ?? 'unknown reason'})`);
        }
        return announcements.map(({ envelope }) => envelope);
    }
}
