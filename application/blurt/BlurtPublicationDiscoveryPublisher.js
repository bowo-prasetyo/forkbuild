import { describeDecentralizedDiscoveryEnvelope } from '../../core/DecentralizedDiscoveryEnvelope.js';
import { BLURT_PUBLICATION_DISCOVERY_TAG } from './BlurtPublicationDiscoveryQueryService.js';

// Announces a Publication's discovery envelope in a Blurt build post, with
// the publish() shape the Nostr, Arweave and Steem publication publishers
// have: a malformed envelope resolves to null, and a refusal (no account, no
// Keychain, a declined signature, too little BLURT for the fee) rejects with
// its reason. `relayUrl` is the family's tag page on Blurt.
export class BlurtPublicationDiscoveryPublisher {
    constructor({ poster, discoveryTag = BLURT_PUBLICATION_DISCOVERY_TAG } = {}) {
        if (!poster || typeof poster.announce !== 'function') throw new TypeError('a Blurt poster is required');
        this._poster = poster;
        this._discoveryTag = discoveryTag;
        this.publish = this.publish.bind(this);
    }

    get discoveryTag() { return this._discoveryTag; }

    async publish(envelope) {
        const described = describeDecentralizedDiscoveryEnvelope(envelope);
        if (described === null) return null;
        const posted = await this._poster.announce('publication', { ...described });
        return Object.freeze({ published: true, relayUrl: posted.threadUrl, id: posted.id, url: posted.url });
    }
}
