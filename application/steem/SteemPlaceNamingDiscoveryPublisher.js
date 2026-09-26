import { buildPlaceNamingDiscoveryEnvelope, derivePlaceNamingDiscoveryTag } from '../../core/PlaceNamingDiscoveryEnvelope.js';

// Announces a signed Place Naming claim on Steem, with the publish(claim)
// shape the Nostr and Arweave place naming publishers have. Steem has one
// thread for every region; readers filter by the envelope's world and
// region, so the per-region tag is only reported back, never posted.
export class SteemPlaceNamingDiscoveryPublisher {
    constructor({ announcer } = {}) {
        if (!announcer || typeof announcer.announce !== 'function') throw new TypeError('a Steem announcer is required');
        this._announcer = announcer;
        this.publish = this.publish.bind(this);
    }

    async publish(claim) {
        const envelope = buildPlaceNamingDiscoveryEnvelope(claim);
        const discoveryTag = derivePlaceNamingDiscoveryTag(claim.worldId, claim.regionId);
        const announcement = await this._announcer.announce('place-naming', JSON.parse(JSON.stringify(envelope)));
        return Object.freeze({ published: true, relayUrl: announcement.threadUrl, id: announcement.id, url: announcement.url, discoveryTag });
    }
}
