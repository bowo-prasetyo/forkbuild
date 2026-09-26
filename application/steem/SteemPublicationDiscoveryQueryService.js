import { DecentralizedDiscoveryQueryService } from '../discovery/DecentralizedWorldDiscoveryQuery.js';
import { parseDecentralizedDiscoveryEnvelope } from '../../core/DecentralizedDiscoveryEnvelope.js';

// Publication leads from Steem discovery threads, for the same registry the
// Nostr and Arweave services feed. Only the publication family's tag is
// answered; any other tag finds nothing, as it would on a relay.

export const STEEM_PUBLICATION_DISCOVERY_TAG = 'forkbuild-publication';
const URI_SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):\/\//i;

export class SteemPublicationDiscoveryQueryService extends DecentralizedDiscoveryQueryService {
    constructor({ reader, discoveryTag = STEEM_PUBLICATION_DISCOVERY_TAG } = {}) {
        super();
        if (!reader || typeof reader.read !== 'function') throw new TypeError('a Steem discovery thread reader is required');
        this._reader = reader;
        this._discoveryTag = discoveryTag;
    }

    get origin() {
        return `dweb:steem:${this._reader.threadAccounts.join(',')}`;
    }

    // Resolves to `[{ uri, storage }]`, and to [] when nothing is readable:
    // the lead registry treats an unreachable source as one with no leads.
    async search(discoveryTag) {
        if (discoveryTag !== this._discoveryTag) return [];
        const { announcements } = await this._reader.read('publication');
        const candidates = [];
        for (const { envelope } of announcements) {
            const parsed = parseDecentralizedDiscoveryEnvelope(envelope);
            if (parsed === null) continue;
            candidates.push({ uri: parsed.uri, storage: URI_SCHEME_PATTERN.exec(parsed.uri)?.[1] ?? null });
        }
        return candidates;
    }
}
