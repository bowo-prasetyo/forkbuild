import { describeDecentralizedDiscoveryEnvelope } from '../../core/DecentralizedDiscoveryEnvelope.js';
import { STEEM_PUBLICATION_DISCOVERY_TAG } from './SteemPublicationDiscoveryQueryService.js';
import { normalizeBuildTags } from '../../core/BuildTags.js';

// Announces a Publication's discovery envelope on Steem, with the publish()
// shape the Nostr and Arweave publication publishers have: a malformed
// envelope resolves to null, and a refusal (no account, no Keychain, no
// thread, a declined signature) rejects with its reason.
export class SteemPublicationDiscoveryPublisher {
    // `buildTagsFor(publicationId)`: the build's own tags, announced with it
    // so the builds with one tag (a week's challenge entries) can be found.
    constructor({ announcer, discoveryTag = STEEM_PUBLICATION_DISCOVERY_TAG, buildTagsFor = null } = {}) {
        if (!announcer || typeof announcer.announce !== 'function') throw new TypeError('a Steem announcer is required');
        this._announcer = announcer;
        this._discoveryTag = discoveryTag;
        this._buildTagsFor = typeof buildTagsFor === 'function' ? buildTagsFor : null;
        this.publish = this.publish.bind(this);
    }

    get discoveryTag() { return this._discoveryTag; }

    async publish(envelope) {
        const described = describeDecentralizedDiscoveryEnvelope(envelope);
        if (described === null) return null;
        const announcement = await this._announcer.announce('publication', { ...described }, { tags: this._tagsOf(described.objectId) });
        return Object.freeze({ published: true, relayUrl: announcement.threadUrl, id: announcement.id, url: announcement.url });
    }

    // A build whose tags can't be read is announced without them, never refused.
    _tagsOf(publicationId) {
        if (!this._buildTagsFor) return [];
        try {
            return normalizeBuildTags(this._buildTagsFor(publicationId));
        } catch {
            return [];
        }
    }
}
