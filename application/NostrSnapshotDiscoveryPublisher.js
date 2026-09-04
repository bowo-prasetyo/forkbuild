import { describeSnapshotDiscoveryEnvelope, SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, SNAPSHOT_DISCOVERY_ENVELOPE_VERSION } from '../core/SnapshotDiscoveryEnvelope.js';

const DEFAULT_RELAY_URL = 'wss://relay.damus.io';
const DEFAULT_TAG_NAME = 't';
const DEFAULT_KIND = 1;
const DEFAULT_TIMEOUT_MS = 8000;
const EVENT_ID_PATTERN = /^[0-9a-f]{64}$/i;

// 0.9.133 — Nostr Snapshot Discovery Publisher.
//
// content/ArweaveContentStore.js (0.9.132) can place a Snapshot's bytes on
// Arweave and hand back a real `ContentReference{ hash, uri, storage }` —
// but nothing announces that fact anywhere. This is the publishing half of
// this milestone's own discovery path: given exactly the three fields a
// caller already has after a successful `ArweaveContentStore#put()` —
// `contentHash`, `locator`, `storage` — it announces a `core/
// SnapshotDiscoveryEnvelope.js` on Nostr, so a second replica who was never
// handed that `ContentReference` directly can still learn where the bytes
// for a given `contentHash` claim to be retrievable from.
//
//   ArweaveContentStore#put(bytes) -> ContentReference{ hash, uri, storage }
//        │
//        │   { contentHash: reference.hash, locator: reference.uri,
//        │     storage: reference.storage }
//        ▼
//   application/NostrSnapshotDiscoveryPublisher.js   ★ (THIS)
//        NostrSnapshotDiscoveryPublisher#publish({ contentHash, locator, storage })
//        │
//        │   { kind, tags: [[tagName, discoveryTag]],
//        │     content: JSON.stringify(describedEnvelope) }
//        ▼
//   injected publishImpl(relayUrl, eventTemplate)   (signing + broadcast —
//        never performed by this file itself; see "no wallet management,"
//        below)
//        │
//        ▼
//   { published: true, relayUrl, id } | null
//
// EXPLICITLY NOT A REUSE OF application/NostrPublicationDiscoveryPublisher.js
// (0.9.46) — A DIFFERENT SEMANTIC CONTRACT, PER tests/
// SnapshotDistributionBoundary.test.js's OWN POINT 4. That file announces a
// `core/DecentralizedDiscoveryEnvelope.js` — a claim about which OBJECT
// (a signed Publication, keyed by `objectId`) a uri is for. This file
// announces a `core/SnapshotDiscoveryEnvelope.js` — a claim about which
// LOCATOR a `contentHash` is retrievable from, the identical
// `contentHash`/`storage`/`locator` vocabulary `core/
// PublicationSnapshotPlacement.js` (0.8.18) already uses for its own,
// peer-based discovery. The two publishers share a SHAPE of collaboration
// (both take `discoveryTag`/`relayUrl`/`publishImpl` and build a
// `{ kind, tags, content }` template) but never a code path, never an
// import, and never an event content shape — exactly as 0.9.131's own
// point 4 already requires for the Snapshot Placement family generally,
// held here for its new Nostr-facing sibling too.
//
// REUSES THE EXISTING INJECTED-PUBLISHER CONTRACT, NEVER A SECOND NIP-07
// ADAPTER. `publishImpl` here is the identical
// `(relayUrl, eventTemplate) -> Promise<{ published, id? }>` shape
// `application/NostrPublicationDiscoveryPublisher.js`'s own `publishImpl`
// already requires, and `nostr/NostrInjectedProviderPublisher.js`'s own
// `createNostrInjectedProviderPublisher()` (0.9.121, unmodified) already
// produces exactly that shape from a real, browser-injected NIP-07
// extension. This file never imports that adapter, never opens a
// WebSocket, and never signs anything — a caller wires a concrete
// `publishImpl` in from outside, the same restraint every file in this
// whole Nostr-facing family already holds.
//
// A DISCOVERY TAG, NEVER AN ENVELOPE FIELD — held here for the identical
// reason `application/NostrPublicationDiscoveryPublisher.js`'s own header
// already draws it. Exactly one Nostr tag is ever attached —
// `[tagName, discoveryTag]` — carrying only the free-form search
// accelerator a caller supplies; the envelope itself lives whole, as JSON,
// in `content`.
//
// `publish()` STAMPS `protocol`/`version` ITSELF, NEVER REQUIRES A CALLER
// TO KNOW THEM. Unlike `application/NostrPublicationDiscoveryPublisher.js`,
// which is handed an already-described envelope by `application/
// PublicationDistributionDescriptor.js`, no equivalent descriptor exists
// for a Snapshot's own placement — a caller only ever has the three raw
// fields a `ContentReference` already carries. `publish({ contentHash,
// locator, storage })` folds in `SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL`/
// `SNAPSHOT_DISCOVERY_ENVELOPE_VERSION` itself, then validates the whole
// candidate through `describeSnapshotDiscoveryEnvelope()` — the same
// "describe before you trust it" discipline every producer in this family
// already holds, just performed one step earlier because there is no
// upstream descriptor to have already performed it.
//
// MALFORMED INPUT DEGRADES TO `null` BEFORE `publishImpl` IS EVER
// CONSULTED; A RELAY'S OWN DEFINITE DECLINE ALSO DEGRADES TO `null`; A
// GENUINE TRANSPORT/SIGNING FAILURE PROPAGATES; A `publishImpl` THAT
// RESOLVES `published: true` BUT WITH NO VALID EVENT ID THROWS. The
// identical four-way contract `application/
// NostrPublicationDiscoveryPublisher.js`'s own header already documents in
// full, held here unchanged — see that file for the complete rationale.
//
// A SIMPLE PUBLICATION RESULT, NEVER TRUST OR VERIFICATION SEMANTICS. A
// successful `publish()` means only "the relay accepted this announcement"
// — never that the announced locator actually serves the announced
// content, never that whoever published it is trusted. See `core/
// SnapshotDiscoveryEnvelope.js`'s own header, "a self-declared claim,
// never evidence, never verification."
//
// NO COUPLING TO SIGNED CLAIM DISTRIBUTION OR SNAPSHOT PLACEMENT'S OWN
// SIGNING/CATALOG MACHINERY. This file never imports `application/
// PublicationDistribution*.js`, `application/
// NostrPublicationDiscoveryPublisher.js`, `core/
// PublicationSnapshotPlacement.js`, `application/SnapshotPlacementResolver.js`,
// or `application/SnapshotPlacementStoreRegistry.js` — publishing a
// discovery announcement is never itself a placement, a resolution, or a
// distribution of anything.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A concrete `publishImpl` implementation.** See "reuses the existing
//   injected-publisher contract," above — `nostr/
//   NostrInjectedProviderPublisher.js` already exists for that.
// - **Publishing to more than one relay, or any relay-selection,
//   preference, or fallback policy.** One relay, one discovery tag, per
//   instance — the identical restraint every sibling in this family holds.
// - **A runtime composition wiring this class together with
//   `content/ArweaveContentStore.js` at a real composition root, or
//   automatic publication of every locally-created snapshot.** A caller —
//   unbuilt this milestone — decides WHEN a placed snapshot is intended for
//   decentralized discovery; this class never decides that on its own.
// - **Verifying that a published event later confirms on a relay, or that
//   the announced locator actually resolves.** A successful `publish()`
//   means only "the relay accepted this event."
// - **Any signature, trust, ranking, or provider-selection semantics.**
export class NostrSnapshotDiscoveryPublisher {
    // relayUrl: which Nostr relay a published event is sent to.
    // tagName: which Nostr tag NAME the discovery tag is attached under —
    //   defaults to `t`, matching every sibling in this family.
    // kind: which Nostr event kind a published event declares — defaults
    //   to `1` (a short text note).
    // discoveryTag: the free-form tag value attached to every event this
    //   instance publishes — required; see this file's own header, "a
    //   discovery tag, never an envelope field."
    // publishImpl: see this file's own header, "reuses the existing
    //   injected-publisher contract." Required — there is no ambient
    //   default.
    // timeoutMs: how long to wait for `publishImpl` to settle before
    //   treating it as a genuine failure.
    constructor({
        relayUrl = DEFAULT_RELAY_URL,
        tagName = DEFAULT_TAG_NAME,
        kind = DEFAULT_KIND,
        discoveryTag,
        publishImpl = null,
        timeoutMs = DEFAULT_TIMEOUT_MS
    } = {}) {
        if (typeof relayUrl !== 'string' || relayUrl.trim().length === 0) {
            throw new Error('NostrSnapshotDiscoveryPublisher: a non-empty relayUrl is required');
        }
        if (typeof discoveryTag !== 'string' || discoveryTag.length === 0) {
            throw new Error('NostrSnapshotDiscoveryPublisher: a non-empty discoveryTag is required');
        }
        if (typeof publishImpl !== 'function') {
            throw new Error('NostrSnapshotDiscoveryPublisher: no relay publish implementation available — pass publishImpl explicitly');
        }
        this._relayUrl = relayUrl;
        this._tagName = tagName;
        this._kind = Number.isInteger(kind) ? kind : DEFAULT_KIND;
        this._discoveryTag = discoveryTag;
        this._publishImpl = publishImpl;
        this._timeoutMs = timeoutMs;

        // Bound so `publisher.publish` survives being passed around as a
        // bare function reference — the identical reason every sibling in
        // this family already binds its own equivalent method.
        this.publish = this.publish.bind(this);
    }

    get relayUrl() { return this._relayUrl; }
    get discoveryTag() { return this._discoveryTag; }

    // publish({ contentHash, locator, storage }) -> Promise<
    //   { published: true, relayUrl, id } | null>. See this file's own
    //   header for the full contract: `null` for a candidate that fails
    //   `describeSnapshotDiscoveryEnvelope()`'s own validation, and `null`
    //   for a `publishImpl` that resolves with `published: false`; a
    //   genuine `publishImpl` failure (including this class's own timeout)
    //   propagates as a rejection; a `publishImpl` that resolves with
    //   `published: true` but a missing/malformed `id` throws rather than
    //   degrading to `null`.
    async publish({ contentHash, locator, storage } = {}) {
        const described = describeSnapshotDiscoveryEnvelope({
            protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
            version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
            contentHash,
            locator,
            storage
        });
        if (described === null) {
            return null;
        }

        const eventTemplate = Object.freeze({
            kind: this._kind,
            tags: [[this._tagName, this._discoveryTag]],
            content: JSON.stringify(described)
        });

        const result = await withTimeout(this._publishImpl(this._relayUrl, eventTemplate), this._timeoutMs);

        if (!result || result.published !== true) {
            return null;
        }
        if (typeof result.id !== 'string' || !EVENT_ID_PATTERN.test(result.id)) {
            throw new Error('NostrSnapshotDiscoveryPublisher: publishImpl resolved with no valid event id');
        }

        return Object.freeze({ published: true, relayUrl: this._relayUrl, id: result.id });
    }
}

NostrSnapshotDiscoveryPublisher.DEFAULT_RELAY_URL = DEFAULT_RELAY_URL;
NostrSnapshotDiscoveryPublisher.DEFAULT_TAG_NAME = DEFAULT_TAG_NAME;
NostrSnapshotDiscoveryPublisher.DEFAULT_KIND = DEFAULT_KIND;

// Races `promise` against `timeoutMs`; rejects if the timer fires first —
// a timeout is a genuine failure here, never collapsed to `null`. The
// timer is always cleared, whichever settles first. Mirrors application/
// NostrPublicationDiscoveryPublisher.js's own identically-named helper,
// deliberately not imported from it — see this file's own header, "a
// different semantic contract," held here for its small private plumbing
// too, the same "kept deliberately separate rather than cross-imported"
// restraint content/ArweaveContentStore.js's own header already holds for
// its own byte-length helpers.
function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('NostrSnapshotDiscoveryPublisher: publishImpl timed out')), timeoutMs);
        Promise.resolve(promise).then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); }
        );
    });
}
