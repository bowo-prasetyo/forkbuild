import { buildPlaceNamingDiscoveryEnvelope, derivePlaceNamingDiscoveryTag } from '../../core/PlaceNamingDiscoveryEnvelope.js';

// Announces a signed Place Naming claim in a Blurt build post, with the
// publish(claim) shape the other place naming publishers have. Every region
// shares the place naming tag on Blurt; readers filter by the envelope's
// world and region, so the per-region tag is only reported back.
export class BlurtPlaceNamingDiscoveryPublisher {
    constructor({ poster } = {}) {
        if (!poster || typeof poster.announce !== 'function') throw new TypeError('a Blurt poster is required');
        this._poster = poster;
        this.publish = this.publish.bind(this);
    }

    async publish(claim) {
        const envelope = buildPlaceNamingDiscoveryEnvelope(claim);
        const discoveryTag = derivePlaceNamingDiscoveryTag(claim.worldId, claim.regionId);
        const posted = await this._poster.announce('place-naming', JSON.parse(JSON.stringify(envelope)));
        return Object.freeze({ published: true, relayUrl: posted.threadUrl, id: posted.id, url: posted.url, discoveryTag });
    }
}
