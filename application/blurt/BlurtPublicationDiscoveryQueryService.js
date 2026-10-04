import { DecentralizedDiscoveryQueryService } from '../discovery/DecentralizedWorldDiscoveryQuery.js';
import { parseDecentralizedDiscoveryEnvelope } from '../../core/DecentralizedDiscoveryEnvelope.js';

// Publication leads from Blurt build posts, for the same registry the Nostr,
// Arweave and Steem services feed. Only the publication family's tag is
// answered; any other tag finds nothing, as it would on a relay.

export const BLURT_PUBLICATION_DISCOVERY_TAG = 'forkbuild-publication';
export const BLURT_DISCOVERY_ORIGIN = 'dweb:blurt';
const URI_SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):\/\//i;

export class BlurtPublicationDiscoveryQueryService extends DecentralizedDiscoveryQueryService {
    constructor({ reader, discoveryTag = BLURT_PUBLICATION_DISCOVERY_TAG } = {}) {
        super();
        if (!reader || typeof reader.read !== 'function') throw new TypeError('a Blurt discovery reader is required');
        this._reader = reader;
        this._discoveryTag = discoveryTag;
    }

    get origin() {
        return BLURT_DISCOVERY_ORIGIN;
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

    // Like search(), but each result is the whole announcement envelope
    // ({ kind, objectId, uri }) plus `origin`. `objectId` is only what the
    // announcer claimed.
    async searchEnvelopes(discoveryTag) {
        if (discoveryTag !== this._discoveryTag) return [];
        let announcements;
        try {
            ({ announcements } = await this._reader.read('publication'));
        } catch {
            return [];
        }
        const envelopes = [];
        for (const { envelope } of announcements) {
            const parsed = parseDecentralizedDiscoveryEnvelope(envelope);
            if (parsed === null) continue;
            envelopes.push({ origin: this.origin, kind: parsed.kind, objectId: parsed.objectId, uri: parsed.uri });
        }
        return envelopes;
    }
}
