import { buildPlaceNamingDiscoveryEnvelope, derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';

const DEFAULT_GATEWAY_URL = 'https://arweave.net';
// Deliberately distinct from every other Arweave Tag NAME this codebase
// already uses (application/ArweaveAnnouncementPublisher.js's own
// 'ForkBuild-Discovery-Tag', application/ArweaveSnapshotDiscoveryPublisher.js's
// own 'ForkBuild-Snapshot-Discovery-Tag') — the same "one Arweave Tag NAME
// per vocabulary" separation held one domain over, so a GraphQL tag search
// for one domain's announcements never picks up another domain's.
const DEFAULT_TAG_NAME = 'ForkBuild-PlaceNaming-Discovery-Tag';
const DEFAULT_TIMEOUT_MS = 15000;
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// The Arweave-substrate sibling of application/NostrPlaceNamingDiscoveryPublisher.js —
// same claim -> envelope -> discovery-tag shape, published as a tagged
// Arweave transaction instead of a Nostr event, mirroring
// application/ArweaveAnnouncementPublisher.js's and application/
// ArweaveSnapshotDiscoveryPublisher.js's own uploadTaggedTransaction
// contract one domain over. Like its Nostr sibling, the discovery tag is
// always derived from the claim itself (derivePlaceNamingDiscoveryTag) —
// never supplied by a caller — so every reader and writer of this domain,
// on either substrate, agrees on one tagging scheme.
export class ArweavePlaceNamingDiscoveryPublisher {
    // gatewayUrl: which Arweave gateway this instance identifies itself as
    //   having announced through — never itself contacted by this class.
    // tagName: which Arweave Tag NAME the discovery tag is attached under.
    // uploadTaggedTransaction: (material: string, tag: { name, value }) ->
    //   Promise<{ id } | null> — signing, tagging, and broadcast; never
    //   performed by this file itself. Required — there is no ambient
    //   default. The identical contract application/ArweaveAnnouncementPublisher.js
    //   and application/ArweaveSnapshotDiscoveryPublisher.js already consume.
    // timeoutMs: how long to wait for uploadTaggedTransaction to settle
    //   before treating it as a genuine failure.
    constructor({
        gatewayUrl = DEFAULT_GATEWAY_URL,
        tagName = DEFAULT_TAG_NAME,
        uploadTaggedTransaction = null,
        timeoutMs = DEFAULT_TIMEOUT_MS
    } = {}) {
        if (typeof gatewayUrl !== 'string' || gatewayUrl.trim().length === 0) {
            throw new Error('ArweavePlaceNamingDiscoveryPublisher: a non-empty gatewayUrl is required');
        }
        if (typeof tagName !== 'string' || tagName.length === 0) {
            throw new Error('ArweavePlaceNamingDiscoveryPublisher: a non-empty tagName is required');
        }
        if (typeof uploadTaggedTransaction !== 'function') {
            throw new Error('ArweavePlaceNamingDiscoveryPublisher: no uploadTaggedTransaction implementation available — pass one explicitly');
        }
        this._gatewayUrl = gatewayUrl.replace(/\/+$/, '');
        this._tagName = tagName;
        this._uploadTaggedTransaction = uploadTaggedTransaction;
        this._timeoutMs = timeoutMs;

        // Bound so `publisher.publish` survives being passed around as a
        // bare function reference — the same reason every sibling in this
        // family already binds its own equivalent method.
        this.publish = this.publish.bind(this);
    }

    get gatewayUrl() { return this._gatewayUrl; }
    get tagName() { return this._tagName; }

    // publish(claim) -> Promise<{ published: true, relayUrl, id,
    //   discoveryTag } | null>. Throws synchronously — via
    //   buildPlaceNamingDiscoveryEnvelope() — for a missing/non-PlaceNamingClaim
    //   or unsigned `claim`, the identical restraint
    //   NostrPlaceNamingDiscoveryPublisher#publish() already holds (a claim
    //   is never raw external data here — see that file's own header). A
    //   uploadTaggedTransaction that resolves null/undefined (a definite
    //   decline) resolves to `null`; a genuine failure (including this
    //   class's own timeout) propagates as a rejection; a resolved value
    //   with a missing/malformed transaction id throws rather than
    //   degrading to `null` — the same three-way contract every sibling
    //   Arweave publisher in this codebase already documents in full.
    async publish(claim) {
        const envelope = buildPlaceNamingDiscoveryEnvelope(claim);
        const discoveryTag = derivePlaceNamingDiscoveryTag(claim.worldId, claim.regionId);

        const material = JSON.stringify(envelope);
        const tag = Object.freeze({ name: this._tagName, value: discoveryTag });

        const result = await withTimeout(this._uploadTaggedTransaction(material, tag), this._timeoutMs);

        if (result === null || result === undefined) {
            return null;
        }
        if (typeof result.id !== 'string' || !TRANSACTION_ID_PATTERN.test(result.id)) {
            throw new Error('ArweavePlaceNamingDiscoveryPublisher: uploadTaggedTransaction resolved with no valid transaction id');
        }

        return Object.freeze({ published: true, relayUrl: this._gatewayUrl, id: result.id, discoveryTag });
    }
}

ArweavePlaceNamingDiscoveryPublisher.DEFAULT_GATEWAY_URL = DEFAULT_GATEWAY_URL;
ArweavePlaceNamingDiscoveryPublisher.DEFAULT_TAG_NAME = DEFAULT_TAG_NAME;

// Races `promise` against `timeoutMs`; rejects if the timer fires first — a
// timeout is a genuine failure here, never collapsed to `null`. The timer
// is always cleared, whichever settles first. Mirrors every sibling
// publisher's own identically-named helper, deliberately not imported from
// any of them — the same "kept deliberately separate" convention this
// whole family already holds for itself.
function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('ArweavePlaceNamingDiscoveryPublisher: uploadTaggedTransaction timed out')), timeoutMs);
        Promise.resolve(promise).then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); }
        );
    });
}
