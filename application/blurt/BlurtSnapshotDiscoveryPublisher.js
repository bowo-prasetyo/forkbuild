import {
    describeSnapshotDiscoveryEnvelope,
    SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
    SNAPSHOT_DISCOVERY_ENVELOPE_VERSION
} from '../../core/SnapshotDiscoveryEnvelope.js';
import { BLURT_SNAPSHOT_DISCOVERY_TAG } from './BlurtSnapshotDiscoveryQueryService.js';

// Announces where a Snapshot's bytes are, in a Blurt build post, with the
// publish() shape the other snapshot publishers have. Its contentHash in the
// build post also makes that post an anchor for it (docs/Protocol.md,
// "Proposed: Blurt Substrate", "Anchoring").
export class BlurtSnapshotDiscoveryPublisher {
    constructor({ poster, discoveryTag = BLURT_SNAPSHOT_DISCOVERY_TAG } = {}) {
        if (!poster || typeof poster.announce !== 'function') throw new TypeError('a Blurt poster is required');
        this._poster = poster;
        this._discoveryTag = discoveryTag;
        this.publish = this.publish.bind(this);
    }

    get discoveryTag() { return this._discoveryTag; }

    async publish({ contentHash, locator, storage, publicationId, claimedPosition, placementRecord } = {}) {
        const described = describeSnapshotDiscoveryEnvelope({
            protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
            version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
            contentHash,
            locator,
            storage,
            publicationId,
            claimedPosition,
            placementRecord
        });
        if (described === null) return null;
        const posted = await this._poster.announce('snapshot', JSON.parse(JSON.stringify(described)));
        return Object.freeze({ published: true, relayUrl: posted.threadUrl, id: posted.id, url: posted.url });
    }
}
