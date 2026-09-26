import {
    describeSnapshotDiscoveryEnvelope,
    SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
    SNAPSHOT_DISCOVERY_ENVELOPE_VERSION
} from '../../core/SnapshotDiscoveryEnvelope.js';
import { STEEM_SNAPSHOT_DISCOVERY_TAG } from './SteemSnapshotDiscoveryQueryService.js';

// Announces where a Snapshot's bytes are, on Steem, with the publish() shape
// the Nostr and Arweave snapshot publishers have.
export class SteemSnapshotDiscoveryPublisher {
    constructor({ announcer, discoveryTag = STEEM_SNAPSHOT_DISCOVERY_TAG } = {}) {
        if (!announcer || typeof announcer.announce !== 'function') throw new TypeError('a Steem announcer is required');
        this._announcer = announcer;
        this._discoveryTag = discoveryTag;
        this.publish = this.publish.bind(this);
    }

    get discoveryTag() { return this._discoveryTag; }

    async publish({ contentHash, locator, storage, publicationId, claimedPosition } = {}) {
        const described = describeSnapshotDiscoveryEnvelope({
            protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
            version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
            contentHash,
            locator,
            storage,
            publicationId,
            claimedPosition
        });
        if (described === null) return null;
        const announcement = await this._announcer.announce('snapshot', JSON.parse(JSON.stringify(described)));
        return Object.freeze({ published: true, relayUrl: announcement.threadUrl, id: announcement.id, url: announcement.url });
    }
}
