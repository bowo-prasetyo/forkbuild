import { SnapshotCandidateDiscoveryOutcome } from '../snapshot/SnapshotCandidateDiscoveryOutcome.js';

// Connects the Announcement Index to the discovery code that already exists
// (docs/AnnouncementIndex.md, "Phase 1"). Recording never changes what a
// search returns or how it fails, and a failure to record is swallowed: the
// index is a convenience, never a reason a search goes wrong.

function recordQuietly(index, kind, tag, results, origin) {
    try {
        index.record(kind, tag, results, origin);
    } catch {
        // Storage full or unavailable: the search result is still good.
    }
}

// A network source whose successful results are recorded under `origin`.
export class RecordingDiscoverySource {
    constructor(source, { index, kind, origin }) {
        if (!source || typeof source.search !== 'function') {
            throw new Error('RecordingDiscoverySource: a source with search() is required');
        }
        this._source = source;
        this._index = index;
        this._kind = kind;
        this._origin = origin;
        // Only offered when the source offers it, so aggregators that check
        // for it keep treating this source exactly as before.
        if (typeof source.searchWithOutcome === 'function') {
            this.searchWithOutcome = async (discoveryTag) => {
                const result = await this._source.searchWithOutcome(discoveryTag);
                if (result && result.outcome !== SnapshotCandidateDiscoveryOutcome.UNAVAILABLE && Array.isArray(result.candidates)) {
                    recordQuietly(this._index, this._kind, discoveryTag, result.candidates, this._origin);
                }
                return result;
            };
        }
    }

    async search(discoveryTag) {
        const results = await this._source.search(discoveryTag);
        if (Array.isArray(results)) recordQuietly(this._index, this._kind, discoveryTag, results, this._origin);
        return results;
    }
}

// Answers from the index alone, as one more source beside the network ones.
// With searchWithOutcome(), an empty index reports UNAVAILABLE rather than
// EMPTY: it never saw the network, so it must not turn "every substrate
// failed" into "nothing was announced".
export class IndexedAnnouncementSource {
    constructor({ index, kind }) {
        this._index = index;
        this._kind = kind;
    }

    async search(discoveryTag) {
        return this._index.list(this._kind, discoveryTag);
    }

    async searchWithOutcome(discoveryTag) {
        const candidates = this._index.list(this._kind, discoveryTag);
        return {
            outcome: candidates.length > 0 ? SnapshotCandidateDiscoveryOutcome.FOUND : SnapshotCandidateDiscoveryOutcome.UNAVAILABLE,
            candidates
        };
    }
}

// A Publication discovery service (one origin) that records what it finds and
// also returns what the index already holds for that origin and tag, so a
// lead keeps the origin that decides how its material is fetched. A failed
// network search still returns the indexed leads.
export class IndexBackedPublicationDiscoveryService {
    constructor(service, { index, kind }) {
        if (!service || typeof service.search !== 'function') {
            throw new Error('IndexBackedPublicationDiscoveryService: a discovery service with search() is required');
        }
        this._service = service;
        this._index = index;
        this._kind = kind;
    }

    get origin() { return this._service.origin; }

    async search(discoveryTag) {
        const origin = this.origin;
        let found = [];
        try {
            const results = await this._service.search(discoveryTag);
            if (Array.isArray(results)) {
                found = results;
                recordQuietly(this._index, this._kind, discoveryTag, results, origin);
            }
        } catch {
            // Fall back to what was seen before.
        }
        const uris = new Set(found.map((candidate) => candidate && candidate.uri));
        const indexed = this._index.list(this._kind, discoveryTag, { origin }).filter((lead) => !uris.has(lead.uri));
        return [...found, ...indexed];
    }
}
