import { withTimeout } from '../../utils/withTimeout.js';
import { heartPublicationTag } from '../../core/NarrowDiscoveryTags.js';
import { normalizeRelayUrls } from './NostrRelayUrls.js';

// Hearts on Nostr, as the reactions other Nostr apps already show
// (docs/Protocol.md, "Publication Hearts"): a heart is a kind-7 reaction
// whose content is "❤️"; taking it back is a kind-5 deletion request for the
// reactions this device sent for it, which relays may honour or not. Either
// way the signed ForkBuild record rides in a `forkbuild` tag, and ForkBuild
// goes by that record alone (each person's latest), never by whether a relay
// deleted anything. Both are tagged with the global 'forkbuild-heart' tag and
// the build's own narrow tag, so one build's hearts can be asked for alone.
//
// An opaque carrier like PublicationCommentaryNostrDistribution: it never
// verifies anything (PublicationHeartExchange does), and it fans out across
// the one configured relay set, the first relay that accepts giving the
// locator.
export const HEART_DISCOVERY_TAG = 'forkbuild-heart';
export const HEART_REACTION_KIND = 7;
export const DELETION_KIND = 5;
export const HEART_REACTION_CONTENT = '❤️';
const RECORD_TAG = 'forkbuild';
const DEFAULT_TIMEOUT_MS = 8000;
const EVENT_ID_PATTERN = /^[0-9a-f]{64}$/i;

export class NostrPublicationHeartDistribution {
    constructor({ relayUrls, publishImpl, queryImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
        const urls = normalizeRelayUrls(Array.isArray(relayUrls) ? relayUrls : []);
        if (urls.length === 0) {
            throw new Error('NostrPublicationHeartDistribution: at least one relay URL is required');
        }
        if (typeof publishImpl !== 'function' || typeof queryImpl !== 'function') {
            throw new Error('NostrPublicationHeartDistribution: publishImpl and queryImpl are required');
        }
        this._relayUrls = urls;
        this._publishImpl = publishImpl;
        this._queryImpl = queryImpl;
        this._timeoutMs = timeoutMs;
        this.publish = this.publish.bind(this);
        this.discover = this.discover.bind(this);
    }

    // The event a heart envelope becomes. `replaces`: the event ids of this
    // device's earlier reactions for the build, which a heart taken back
    // asks relays to delete.
    static eventFor(envelopeJson, { replaces = [] } = {}) {
        const tags = [['t', HEART_DISCOVERY_TAG]];
        const narrow = heartPublicationTag(envelopeJson && envelopeJson.publicationId);
        if (narrow) tags.push(['t', narrow]);
        if (envelopeJson && envelopeJson.hearted) {
            tags.push([RECORD_TAG, JSON.stringify(envelopeJson)]);
            return Object.freeze({ kind: HEART_REACTION_KIND, tags, content: HEART_REACTION_CONTENT });
        }
        for (const id of replaces) {
            if (typeof id === 'string' && EVENT_ID_PATTERN.test(id)) tags.push(['e', id]);
        }
        tags.push(['k', String(HEART_REACTION_KIND)], [RECORD_TAG, JSON.stringify(envelopeJson)]);
        return Object.freeze({ kind: DELETION_KIND, tags, content: '' });
    }

    // `{ published: true, locator }` from the first relay that accepts, null
    // when every relay that answered declined; throws when none answered.
    async publish(envelopeJson, options = {}) {
        const event = NostrPublicationHeartDistribution.eventFor(envelopeJson, options);
        const settled = await Promise.allSettled(this._relayUrls.map((relayUrl) => withTimeout(
            this._publishImpl(relayUrl, event),
            this._timeoutMs,
            'NostrPublicationHeartDistribution: relay operation timed out'
        )));
        for (const outcome of settled) {
            const result = outcome.status === 'fulfilled' ? outcome.value : null;
            if (result && result.published === true && typeof result.id === 'string' && EVENT_ID_PATTERN.test(result.id)) {
                return Object.freeze({ published: true, locator: result.id });
            }
        }
        if (settled.some((outcome) => outcome.status === 'fulfilled')) {
            return null;
        }
        throw settled[0].reason;
    }

    // Every heart record on the relays under the global tag and, with a
    // publicationId, that build's own tag: plain objects, unverified, each
    // event once. Throws only when no relay answered.
    async discover(publicationId = null) {
        const tags = [HEART_DISCOVERY_TAG, heartPublicationTag(publicationId)].filter(Boolean);
        const queries = this._relayUrls.flatMap((relayUrl) => tags.map((tag) => withTimeout(
            this._queryImpl(relayUrl, { kinds: [HEART_REACTION_KIND, DELETION_KIND], '#t': [tag] }),
            this._timeoutMs,
            'NostrPublicationHeartDistribution: relay operation timed out'
        )));
        const settled = await Promise.allSettled(queries);
        if (!settled.some((outcome) => outcome.status === 'fulfilled')) {
            throw settled[0].reason;
        }
        const seen = new Set();
        const records = [];
        for (const event of settled.flatMap((outcome) => (outcome.status === 'fulfilled' && Array.isArray(outcome.value) ? outcome.value : []))) {
            if (!event || seen.has(event.id)) continue;
            seen.add(event.id);
            const record = recordOf(event);
            if (record) records.push(record);
        }
        return records;
    }
}

// The ForkBuild record an event carries, or null.
function recordOf(event) {
    const tag = Array.isArray(event.tags) ? event.tags.find((entry) => Array.isArray(entry) && entry[0] === RECORD_TAG) : null;
    if (!tag || typeof tag[1] !== 'string') return null;
    try {
        const parsed = JSON.parse(tag[1]);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}
