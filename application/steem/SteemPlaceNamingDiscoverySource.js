import { derivePlaceNamingDiscoveryTag, describePlaceNamingDiscoveryEnvelope } from '../../core/PlaceNamingDiscoveryEnvelope.js';
import { SteemDiscoveryReadOutcome } from './SteemDiscoveryThreadReader.js';

// Place naming claims from Steem. Steem has one thread per month for every
// region, so this source keeps only envelopes whose world and region derive
// the requested per-region tag. Like the Nostr source, it returns raw
// payloads for the query service to parse and verify, and rejects when
// nothing could be read.
export class SteemPlaceNamingDiscoverySource {
    constructor({ reader } = {}) {
        if (!reader || typeof reader.read !== 'function') throw new TypeError('a Steem discovery thread reader is required');
        this._reader = reader;
    }

    async search(discoveryTag) {
        const { outcome, announcements, threadsUnavailable } = await this._reader.read('place-naming');
        if (outcome === SteemDiscoveryReadOutcome.UNAVAILABLE) {
            throw new Error(`SteemPlaceNamingDiscoverySource: no discovery thread could be read (${threadsUnavailable[0]?.reason ?? 'unknown reason'})`);
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
