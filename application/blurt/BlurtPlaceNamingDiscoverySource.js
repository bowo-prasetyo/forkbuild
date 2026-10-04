import { derivePlaceNamingDiscoveryTag, describePlaceNamingDiscoveryEnvelope } from '../../core/PlaceNamingDiscoveryEnvelope.js';
import { BlurtDiscoveryReadOutcome } from './BlurtDiscoveryReader.js';

// Place naming claims from Blurt. Every region shares one tag on Blurt, so
// this source keeps only envelopes whose world and region derive the
// requested per-region tag. It returns raw payloads for the query service to
// parse and verify, and rejects when nothing could be read.
export class BlurtPlaceNamingDiscoverySource {
    constructor({ reader } = {}) {
        if (!reader || typeof reader.read !== 'function') throw new TypeError('a Blurt discovery reader is required');
        this._reader = reader;
    }

    async search(discoveryTag) {
        const { outcome, announcements, sourcesUnavailable } = await this._reader.read('place-naming');
        if (outcome === BlurtDiscoveryReadOutcome.UNAVAILABLE) {
            throw new Error(`BlurtPlaceNamingDiscoverySource: Blurt could not be read (${sourcesUnavailable[0]?.reason ?? 'unknown reason'})`);
        }
        return announcements
            .map(({ envelope }) => envelope)
            .filter((envelope) => regionTagOf(envelope) === discoveryTag);
    }
}

function regionTagOf(envelope) {
    const described = describePlaceNamingDiscoveryEnvelope(envelope);
    return described ? derivePlaceNamingDiscoveryTag(described.worldId, described.regionId) : null;
}
