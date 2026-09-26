import { parseSnapshotDiscoveryEnvelope } from '../../core/SnapshotDiscoveryEnvelope.js';
import { SnapshotCandidateDiscoveryOutcome } from '../snapshot/SnapshotCandidateDiscoveryOutcome.js';
import { SteemDiscoveryReadOutcome } from './SteemDiscoveryThreadReader.js';

// Snapshot candidates from Steem discovery threads, with the same
// search()/searchWithOutcome() shape as the Nostr and Arweave services.
// A candidate says where bytes claim to be; resolving it checks them
// against `contentHash`.

export const STEEM_SNAPSHOT_DISCOVERY_TAG = 'forkbuild-snapshot';

export class SteemSnapshotDiscoveryQueryService {
    constructor({ reader, discoveryTag = STEEM_SNAPSHOT_DISCOVERY_TAG } = {}) {
        if (!reader || typeof reader.read !== 'function') throw new TypeError('a Steem discovery thread reader is required');
        this._reader = reader;
        this._discoveryTag = discoveryTag;
    }

    async search(discoveryTag) {
        return (await this.searchWithOutcome(discoveryTag)).candidates;
    }

    async searchWithOutcome(discoveryTag) {
        if (discoveryTag !== this._discoveryTag) return { outcome: SnapshotCandidateDiscoveryOutcome.EMPTY, candidates: [] };
        const { outcome, announcements } = await this._reader.read('snapshot');
        if (outcome === SteemDiscoveryReadOutcome.UNAVAILABLE) return { outcome: SnapshotCandidateDiscoveryOutcome.UNAVAILABLE, candidates: [] };
        const candidates = [];
        for (const { envelope } of announcements) {
            const parsed = parseSnapshotDiscoveryEnvelope(envelope);
            if (parsed === null) continue;
            const candidate = { contentHash: parsed.contentHash, locator: parsed.locator, storage: parsed.storage };
            if (parsed.publicationId !== undefined) {
                candidate.publicationId = parsed.publicationId;
                candidate.claimedPosition = parsed.claimedPosition;
            }
            candidates.push(candidate);
        }
        return {
            outcome: candidates.length > 0 ? SnapshotCandidateDiscoveryOutcome.FOUND : SnapshotCandidateDiscoveryOutcome.EMPTY,
            candidates
        };
    }

    async resolveLocator(discoveryTag, contentHash) {
        const match = (await this.search(discoveryTag)).find((candidate) => candidate.contentHash === contentHash);
        return match ? match.locator : null;
    }
}
