const DEFAULT_RELAY_URL = 'wss://relay.damus.io';
const DEFAULT_TAG_NAME = 't';
const DEFAULT_KIND = 1;
const DEFAULT_DISCOVERY_TAG = 'forkbuild-commentary';
const DEFAULT_TIMEOUT_MS = 8000;
const EVENT_ID_PATTERN = /^[0-9a-f]{64}$/i;

// 0.9.628 — Publication Commentary Nostr Asynchronous Distribution.
//
// 0.9.627's own audit (tests/PublicationCommentaryNostrRoundTripBoundaryAudit.test.js)
// found this exact seam PREPARED, entirely inside a test file: a plain
// composition of `nostr/NostrInjectedProviderPublisher.js` (publish) and
// `nostr/NostrRelayQueryClient.js` (retrieve) — two already-existing,
// already-production-wired, genuinely substrate-neutral transport
// primitives that never parse or care what a Nostr event's own `content`
// holds — already duck-type-conforms to core/
// PublicationCommentaryAsynchronousDeliveryContract.js's own
// `{ publish, retrieve }` round-trip contract (0.9.626), carrying a real,
// signed application/PublicationCommentaryDistributionEnvelope.js through
// a live NIP-01 exchange, byte for byte. That audit's own verdict named
// the one thing still missing: "a single small production adapter file
// wiring the two raw transport primitives together exactly as this
// test's own ComposedNostrTransportCommentarySubstrate does." This file
// is that adapter, promoted from a test fixture to a real, permanent,
// independently-testable production class — nothing about its own shape
// is new; it is the identical composition, given a name and a home.
//
//   PublicationCommentaryDistributionExchange#exportCommentary()   (0.9.618,
//        │                                                          unmodified
//        │                                                          — signs)
//        ▼
//   PublicationCommentaryNostrDistribution#publish(envelopeJson)   ★ (THIS)
//        │  { kind, tags: [[tagName, discoveryTag]],
//        │    content: JSON.stringify(envelopeJson) }
//        ▼
//   publishImpl(relayUrl, eventTemplate)   (nostr/NostrInjectedProviderPublisher.js,
//        │                                  unmodified — signs + broadcasts)
//        ▼
//   { published: true, locator }   |   null
//
//   PublicationCommentaryNostrDistribution#discover()   ★ (THIS)
//        │  queryImpl(relayUrl, { [`#${tagName}`]: [discoveryTag] })
//        ▼
//   queryImpl   (nostr/NostrRelayQueryClient.js, unmodified — subscribes)
//        ▼
//   envelopeJson[]   (opaque `content` parsed as JSON, malformed entries
//                      silently dropped — never a thrown error for one bad
//                      event on a shared relay)
//
// AN OPAQUE ENVELOPE CARRIER, NEVER A SECOND COMMENTARY AUTHORITY. This
// class never imports core/PublicationCommentary.js, core/
// PublicationCommentaryDistributionEnvelope.js, or application/
// PublicationCommentaryDistributionExchange.js. It knows nothing about
// signatures, authorship, or verification — it treats `envelopeJson` as a
// plain, opaque object to serialize into a Nostr event's own `content`
// and back, the identical restraint `nostr/NostrInjectedProviderPublisher.js`
// and `nostr/NostrRelayQueryClient.js` already hold one layer down (see
// each file's own header, "content is a genuinely opaque application
// payload"). Every question about whether a retrieved envelope is
// genuinely signed by its own claimed author is answered entirely by the
// EXISTING, UNMODIFIED PublicationCommentaryDistributionExchange/
// LocalAuthorizationVerifier — a caller's job, never this file's.
//
// PUBLISH(envelopeJson) TAKES AN ALREADY-SIGNED ENVELOPE — THIS FILE NEVER
// SIGNS ANYTHING ITSELF. The caller is expected to have already called
// `PublicationCommentaryDistributionExchange#exportCommentary(commentary)`
// (0.9.618, unmodified) — exactly the same signed JSON the WebRTC path
// (application/PublicationCommentaryDistributionPeerExchange.js#announce())
// already sends over the wire, unmodified, given a second transport here.
//
// A SINGLE, FIXED CAMPAIGN DISCOVERY TAG, NEVER A PER-PUBLICATION ONE —
// THE SAME "one campaign, filter afterward" SHAPE application/
// NostrPublicationDiscoveryPublisher.js/NostrSnapshotDiscoveryPublisher.js
// ALREADY HOLD FOR THEIR OWN CAMPAIGNS (`'forkbuild-publication'`/
// `'forkbuild-snapshot'`). `discoveryTag` defaults to
// `'forkbuild-commentary'` — its own, separate campaign, never reusing
// either of those two, and never derived from a publicationId or
// commentaryId. "A discovery tag is a query/indexing mechanism, not
// Commentary identity" — `discover()` below returns every envelope
// published under this one campaign; a caller (application/
// DiscoverPublicationCommentaryFromNostrUseCase.js) filters the results by
// `publicationId` itself, exactly as `application/
// NostrDiscoveryQueryService.js`'s own callers already filter candidates
// by `objectId`/`contentHash` after a shared-tag query returns them.
//
// PERSISTENTLY_PUBLISHED, NEVER DELIVERY — the identical restraint core/
// PublicationCommentaryAsynchronousDeliveryContract.js's own header
// already documents, and the SEMANTIC_GAP 0.9.627's own audit named
// explicitly: a successful `publish()` here means only "at least one
// relay accepted this event," never that it is durably retained or ever
// actually retrievable again. This file introduces no confirmation
// step, no re-query-after-publish, and no durability guarantee of any
// kind beyond what `publishImpl` itself already reports.
//
// discover() COLLAPSES DISCOVERABLE AND RETRIEVED INTO ONE EXCHANGE, THE
// SAME SUBSTRATE-SPECIFIC FACT 0.9.627's OWN SECTION J ALREADY FOUND: a
// NIP-01 tag query already returns full event content on a match, so
// there is no separate "look up a locator, then fetch its bytes" round
// trip for Nostr the way a locator-plus-content-store substrate would
// need. `retrieve(locator)` is kept anyway — never removed — because it
// is the exact shape core/PublicationCommentaryAsynchronousDeliveryContract.js's
// own contract names, and because a caller that already holds a locator
// (a publish() result, kept for its own bookkeeping) has no reason to
// re-run a tag query to use it.
//
// MALFORMED/UNRELATED EVENTS ARE SKIPPED, NEVER FATAL — the same "one bad
// candidate never corrupts the others" restraint every discovery-shaped
// class in this codebase already holds. Non-JSON `content`, or JSON that
// is not even a plain object, is simply left out of `discover()`'s own
// result array and returns `null` from `retrieve()` — this file performs
// no PublicationCommentary-shape validation, since it has no such
// vocabulary; a candidate that is JSON but not a well-formed Commentary
// envelope is `application/DiscoverPublicationCommentaryFromNostrUseCase.js`'s
// own `importCommentaryEnvelope()` call's problem to reject, not this
// file's.
//
// ONE RELAY, ONE DISCOVERY TAG, PER INSTANCE — NO FAN-OUT, NO RELAY
// SELECTION, NO RANKING. The identical restraint every sibling in this
// family already holds (see application/NostrPublicationDiscoveryPublisher.js's
// own header, "one relay, one discovery tag, per instance"). 0.9.627's own
// Section I audited the existing relay-SET configuration abstraction and
// multi-relay fan-out orchestrator built for Publication announcement and
// deliberately did not reuse either for Commentary — this file does not
// either. Multi-relay resilience for Commentary remains a
// NEW_SUBSTRATE_BOUNDARY, deliberately unbuilt here.
//
// A GENUINE TRANSPORT FAILURE PROPAGATES, NEVER SWALLOWED — the identical
// line application/NostrPublicationDiscoveryPublisher.js's own header
// already draws: `publishImpl`/`queryImpl` rejecting (no connectivity, no
// signing capability, a relay that never answers before `timeoutMs`
// elapses) propagates out of `publish()`/`retrieve()`/`discover()`
// unmodified — a caller decides for itself whether that failure is worth
// surfacing, retrying, or simply swallowing as "best effort," exactly as
// `ui/main.js`'s own new call sites (below) do for `publish()`.
//
// DELIBERATELY EXCLUDED FROM 0.9.628 — deliberately absent, not merely
// unimplemented: Arweave, multi-relay fan-out, relay ranking/fallback,
// retry queues, background sync, subscriptions, read/delivery receipts,
// global Commentary indexing, any new Commentary identity field (no
// `nostrEventId` on the envelope itself — a `publish()` result's own
// `locator` is a caller-side value, never folded into the envelope), any
// new deduplication service (storage/PublicationCommentaryStore.js's own
// existing commentaryId semantics are reused, unmodified), any change to
// the existing WebRTC path (application/
// PublicationCommentaryDistributionPeerExchange.js, untouched), and any
// change to Publication/Snapshot discovery semantics (application/
// NostrPublicationDiscoveryPublisher.js and application/
// NostrDiscoveryQueryService.js, both untouched, both still mentioning no
// Commentary vocabulary of any kind).
export class PublicationCommentaryNostrDistribution {
    // relayUrl: which Nostr relay this instance targets — defaults to a
    //   well-known public relay, matching application/
    //   NostrPublicationDiscoveryPublisher.js's own default; a caller
    //   normally supplies this device's own configured relay
    //   (storage/NostrRelayConfigurationStore.js).
    // tagName: which Nostr tag NAME the discovery tag is attached under
    //   (and filtered by, for discover()) — defaults to `t`.
    // kind: which Nostr event kind a published event declares — defaults
    //   to `1`, matching every sibling publisher in this family.
    // discoveryTag: this instance's own campaign marker — see this file's
    //   own header, "a single, fixed campaign discovery tag."
    // publishImpl: `(relayUrl, eventTemplate) -> Promise<{ published, id? }>`
    //   — required, no ambient default; see nostr/NostrInjectedProviderPublisher.js.
    // queryImpl: `(relayUrl, filter) -> Promise<Array<event>>` — required,
    //   no ambient default; see nostr/NostrRelayQueryClient.js.
    // timeoutMs: how long to wait for publishImpl/queryImpl to settle
    //   before treating it as a genuine failure.
    constructor({
        relayUrl = DEFAULT_RELAY_URL,
        tagName = DEFAULT_TAG_NAME,
        kind = DEFAULT_KIND,
        discoveryTag = DEFAULT_DISCOVERY_TAG,
        publishImpl = null,
        queryImpl = null,
        timeoutMs = DEFAULT_TIMEOUT_MS
    } = {}) {
        if (typeof relayUrl !== 'string' || relayUrl.trim().length === 0) {
            throw new Error('PublicationCommentaryNostrDistribution: a non-empty relayUrl is required');
        }
        if (typeof discoveryTag !== 'string' || discoveryTag.length === 0) {
            throw new Error('PublicationCommentaryNostrDistribution: a non-empty discoveryTag is required');
        }
        if (typeof publishImpl !== 'function') {
            throw new Error('PublicationCommentaryNostrDistribution: no relay publish implementation available — pass publishImpl explicitly');
        }
        if (typeof queryImpl !== 'function') {
            throw new Error('PublicationCommentaryNostrDistribution: no relay query implementation available — pass queryImpl explicitly');
        }
        this._relayUrl = relayUrl;
        this._tagName = tagName;
        this._kind = Number.isInteger(kind) ? kind : DEFAULT_KIND;
        this._discoveryTag = discoveryTag;
        this._publishImpl = publishImpl;
        this._queryImpl = queryImpl;
        this._timeoutMs = timeoutMs;

        // Bound so a reference survives being passed around, matching
        // every sibling publisher in this family (application/
        // NostrPublicationDiscoveryPublisher.js's own constructor).
        this.publish = this.publish.bind(this);
        this.retrieve = this.retrieve.bind(this);
        this.discover = this.discover.bind(this);
    }

    get relayUrl() { return this._relayUrl; }
    get discoveryTag() { return this._discoveryTag; }

    // publish(envelopeJson) -> Promise<{ published: true, locator } |
    //   null>. See this file's own header for the full contract: `null`
    //   for a `publishImpl` that resolves with `published: false` (the
    //   relay declined); a genuine `publishImpl` failure (including this
    //   instance's own timeout) propagates as a rejection; a `publishImpl`
    //   that resolves with `published: true` but a missing/malformed `id`
    //   throws rather than degrading to `null` — the same "resolved but
    //   broke its own contract is a bug, not a Nostr fact" distinction
    //   application/NostrPublicationDiscoveryPublisher.js's own header
    //   already draws.
    async publish(envelopeJson) {
        const eventTemplate = Object.freeze({
            kind: this._kind,
            tags: [[this._tagName, this._discoveryTag]],
            content: JSON.stringify(envelopeJson)
        });

        const result = await withTimeout(this._publishImpl(this._relayUrl, eventTemplate), this._timeoutMs);

        if (!result || result.published !== true) {
            return null;
        }
        if (typeof result.id !== 'string' || !EVENT_ID_PATTERN.test(result.id)) {
            throw new Error('PublicationCommentaryNostrDistribution: publishImpl resolved with no valid event id');
        }

        return Object.freeze({ published: true, locator: result.id });
    }

    // retrieve(locator) -> Promise<envelopeJson | null>. `locator` is a
    // publish() result's own `locator` (a Nostr event id) — a malformed
    // locator, no matching event, or an event whose own `content` does
    // not parse as JSON all resolve to `null`; a genuine queryImpl
    // failure propagates as a rejection.
    async retrieve(locator) {
        if (typeof locator !== 'string' || !EVENT_ID_PATTERN.test(locator)) {
            return null;
        }
        const events = await withTimeout(this._queryImpl(this._relayUrl, { ids: [locator] }), this._timeoutMs);
        const event = (events || []).find((candidate) => candidate && candidate.id === locator);
        return parseEventContent(event);
    }

    // discover() -> Promise<envelopeJson[]>. Every event on file under
    // this instance's own relay/discoveryTag whose `content` parses as
    // JSON — see this file's own header, "a single, fixed campaign
    // discovery tag." A caller filters the result by whatever field it
    // actually cares about (application/
    // DiscoverPublicationCommentaryFromNostrUseCase.js filters by
    // publicationId). Never throws for a malformed individual event; a
    // genuine queryImpl failure propagates as a rejection.
    async discover() {
        const filter = { [`#${this._tagName}`]: [this._discoveryTag] };
        const events = await withTimeout(this._queryImpl(this._relayUrl, filter), this._timeoutMs);
        const envelopes = [];
        for (const event of (events || [])) {
            const parsed = parseEventContent(event);
            if (parsed !== null) {
                envelopes.push(parsed);
            }
        }
        return envelopes;
    }
}

PublicationCommentaryNostrDistribution.DEFAULT_RELAY_URL = DEFAULT_RELAY_URL;
PublicationCommentaryNostrDistribution.DEFAULT_TAG_NAME = DEFAULT_TAG_NAME;
PublicationCommentaryNostrDistribution.DEFAULT_KIND = DEFAULT_KIND;
PublicationCommentaryNostrDistribution.DEFAULT_DISCOVERY_TAG = DEFAULT_DISCOVERY_TAG;

// Pure. `null` for a missing event, a non-object `content`, or `content`
// that fails to parse as JSON — never throws.
function parseEventContent(event) {
    if (!event || typeof event.content !== 'string') {
        return null;
    }
    try {
        const parsed = JSON.parse(event.content);
        return (parsed && typeof parsed === 'object') ? parsed : null;
    } catch {
        return null;
    }
}

// Races `promise` against `timeoutMs`; rejects if the timer fires first —
// identical to application/NostrPublicationDiscoveryPublisher.js's own
// helper of the same name/shape.
function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('PublicationCommentaryNostrDistribution: relay operation timed out')), timeoutMs);
        Promise.resolve(promise).then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); }
        );
    });
}
