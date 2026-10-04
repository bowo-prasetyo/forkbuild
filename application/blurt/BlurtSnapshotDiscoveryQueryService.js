import { parseSnapshotDiscoveryEnvelope, snapshotCandidateFromEnvelope } from '../../core/SnapshotDiscoveryEnvelope.js';
import { SnapshotCandidateDiscoveryOutcome } from '../snapshot/SnapshotCandidateDiscoveryOutcome.js';
import { BlurtDiscoveryReadOutcome } from './BlurtDiscoveryReader.js';

// Snapshot candidates from Blurt build posts, with the same
// search()/searchWithOutcome() shape as the other services. A candidate
// says where bytes claim to be; resolving it checks them against
// `contentHash`.

export const BLURT_SNAPSHOT_DISCOVERY_TAG = 'forkbuild-snapshot';

export class BlurtSnapshotDiscoveryQueryService {
    constructor({ reader, discoveryTag = BLURT_SNAPSHOT_DISCOVERY_TAG } = {}) {
        if (!reader || typeof reader.read !== 'function') throw new TypeError('a Blurt discovery reader is required');
        this._reader = reader;
        this._discoveryTag = discoveryTag;
    }

    async search(discoveryTag) {
        return (await this.searchWithOutcome(discoveryTag)).candidates;
    }

    async searchWithOutcome(discoveryTag) {
        if (discoveryTag !== this._discoveryTag) return { outcome: SnapshotCandidateDiscoveryOutcome.EMPTY, candidates: [] };
        const { outcome, announcements } = await this._reader.read('snapshot');
        if (outcome === BlurtDiscoveryReadOutcome.UNAVAILABLE) return { outcome: SnapshotCandidateDiscoveryOutcome.UNAVAILABLE, candidates: [] };
        const candidates = [];
        for (const { envelope } of announcements) {
            const parsed = parseSnapshotDiscoveryEnvelope(envelope);
            if (parsed !== null) candidates.push(snapshotCandidateFromEnvelope(parsed));
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
