import { parseSnapshotDiscoveryEnvelope } from '../core/SnapshotDiscoveryEnvelope.js';

const DEFAULT_RELAY_URL = 'wss://relay.damus.io';
const DEFAULT_TAG_NAME = 't';
const DEFAULT_KINDS = Object.freeze([1]);
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESULTS = 20;

// 0.9.133 — Nostr Snapshot Discovery Query Service.
//
// The reading counterpart of application/NostrSnapshotDiscoveryPublisher.js
// — that file writes a `core/SnapshotDiscoveryEnvelope.js` into a Nostr
// event's own `content`; this file queries a relay for events carrying a
// given discovery tag and reads that same envelope back out, so a caller
// who only holds a `discoveryTag` and, optionally, a `contentReference.hash`
// can learn where a Snapshot's bytes claim to be retrievable from.
//
//   Nostr relay
//        │
//        │   REQ { kinds: [...], "#t": [discoveryTag], limit }
//        ▼
//   application/NostrSnapshotDiscoveryQueryService.js   ★ (THIS)
//        .search(discoveryTag)
//        │
//        │   events, each carrying its own `.content`
//        ▼
//   core/SnapshotDiscoveryEnvelope.js   (0.9.133, unmodified)
//        parseSnapshotDiscoveryEnvelope(event.content)
//        │
//        ▼
//   [ { contentHash, locator, storage }, ... ]
//        │
//        │   .resolveLocator(discoveryTag, contentHash)
//        ▼
//   locator | null
//
// A STANDALONE CLASS — DELIBERATELY NOT A `DecentralizedDiscoveryQueryService`
// (application/DecentralizedWorldDiscoveryQuery.js), AND NEVER WIRED INTO
// `application/DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js`.
// That base class, and everything built on top of it (`application/
// NostrDiscoveryQueryService.js`, `application/
// ArweaveGraphqlDiscoveryQueryService.js`), exists to turn a candidate
// location into a `DecentralizedWorldDiscoveryLead` for a Publication or
// Avatar — vocabulary keyed by `objectId`, never by a raw content hash.
// A Snapshot's own discovery, per this file's own sibling `core/
// SnapshotDiscoveryEnvelope.js` and `tests/
// SnapshotDistributionBoundary.test.js`'s own point 4, is a completely
// separate, narrower path: it answers "what locator was announced for this
// contentHash," and stops there — it never becomes a lead, never feeds
// association evidence, and never gains a `origin`/`search()` shape merely
// because one already exists nearby. See this file's own header, "a
// candidate, never a lead," below.
//
// `queryImpl` IS AN INJECTION POINT, NOT A CONVENIENCE, WITH NO AMBIENT
// DEFAULT — THE IDENTICAL RESTRAINT `application/
// NostrDiscoveryQueryService.js`'s OWN HEADER ALREADY HOLDS. Querying a
// Nostr relay is a stateful exchange over a WebSocket — send a `REQ`,
// collect `EVENT` messages, stop at `EOSE` — with no ambient primitive this
// runtime provides; a caller supplies a `(relayUrl, filter) =>
// Promise<events>` collaborator that already knows how to run that
// exchange against one relay. The constructor throws if `queryImpl` is
// missing or not a function.
//
// NEVER THROWS FROM `search()` — EVERY FAILURE DEGRADES TO `[]`. A
// `queryImpl` that rejects, a `queryImpl` that never settles (guarded by
// this class's own `timeoutMs`), a resolved value that is not an array, an
// event whose `content` is missing, unparseable, or not a recognized
// Snapshot Discovery Envelope — none of these distinguish themselves to a
// caller. Each event is independently handed to
// `parseSnapshotDiscoveryEnvelope()`; an event that fails is silently
// skipped rather than invalidating the whole batch.
//
// A DISCOVERY TAG, NEVER AN ENVELOPE FIELD, IS WHAT THE NOSTR FILTER
// MATCHES ON — the identical line `application/
// NostrDiscoveryQueryService.js`'s own header already draws, held here
// unchanged. This class never inspects an event's `tags` array when
// turning events into candidates; the envelope lives whole, as JSON, in
// `content`.
//
// A CANDIDATE, NEVER A LEAD, NEVER ASSOCIATION EVIDENCE, NEVER
// VERIFICATION. `search()` reports `{ contentHash, locator, storage }` —
// exactly what the announcing event's own envelope claimed, nothing more.
// Finding a matching event means only "someone announced this locator for
// this contentHash" — it does NOT mean the locator actually serves those
// bytes, and it does NOT mean the announcer is trusted. Whether the bytes
// at a discovered locator actually hash to the discovered `contentHash` is
// a question this file never asks — resolving that requires actually
// retrieving the bytes (a `content/ContentStore.js#get()` call, e.g.
// against `content/ArweaveContentStore.js`), which stays entirely a
// caller's own, later concern; see docs/Roadmap.md, 0.9.134, "Snapshot
// Retrieval Integration." `discoverability is not availability, and
// discovery is not verification` — the flagship distinction this
// milestone's own tests/NostrSnapshotDiscovery.test.js exists to prove.
//
// `resolveLocator()` IS A THIN CONVENIENCE OVER `search()`, NEVER A SECOND
// KIND OF QUERY. It runs the identical `search()` this class already
// performs and returns the first candidate's own `locator` whose
// `contentHash` matches exactly — no ranking, no "best" provider, no
// preference among several candidates naming the same `contentHash` (see
// "deliberately excluded," below). A caller wanting to see every
// announcement for a `contentHash`, not merely the first, calls `search()`
// directly and filters for themselves.
//
// MULTIPLE DISCOVERY RECORDS DO NOT AUTOMATICALLY BECOME RANKING. Several
// events can announce the same `contentHash` with different locators, or
// different storage backends — `search()` reports every one it can parse,
// in the order the relay/`queryImpl` returned them, and forms no opinion
// about which is "best." That remains entirely unscheduled, later work.
//
// EXACTLY ONE RELAY PER INSTANCE — NO FAN-OUT, NO RACE, NO AGGREGATION.
// The identical restraint every sibling in this family already holds.
//
// NO SIGNATURE, NO PUBKEY, NO NIP-01 `id`/`sig` VERIFICATION OF ANY KIND.
// See `core/SnapshotDiscoveryEnvelope.js`'s own header, "a self-declared
// claim, never evidence" — this class never checks a Nostr event's own
// `sig`, and never imports anything that would.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Implementing the Nostr wire protocol itself.** See "queryImpl is an
//   injection point," above.
// - **Publishing or tagging a Nostr event.** This class only ever reads.
// - **Querying more than one relay, or combining/ranking/deduplicating
//   what several relays report.** See "exactly one relay per instance."
// - **Retrieving a candidate's own content from wherever its `locator`
//   points, or verifying that retrieved bytes hash to the announced
//   `contentHash`.** See "a candidate, never a lead... never
//   verification," above — discovery evidence is not verification.
// - **Any signature or NIP verification, trust scoring, or provider
//   selection.**
// - **Wiring a discovered envelope into `application/
//   SnapshotPlacementResolver.js`, `application/
//   SnapshotPlacementStoreRegistry.js`, or `core/
//   PublicationSnapshotPlacement.js`'s own catalog.** A Snapshot's own
//   placement/resolution family stays peer-based and never references
//   Nostr — tests/SnapshotDistributionBoundary.test.js's own point 4.
export class NostrSnapshotDiscoveryQueryService {
    // relayUrl: which Nostr relay to query.
    // tagName: which Nostr filter tag NAME a discovery tag is matched
    //   against — defaults to `t`, matching every sibling in this family.
    // kinds: which Nostr event kind(s) this service's own filter matches —
    //   defaults to `[1]` (a short text note).
    // queryImpl: see this file's own header, "queryImpl is an injection
    //   point." Required — there is no ambient default.
    constructor({
        relayUrl = DEFAULT_RELAY_URL,
        tagName = DEFAULT_TAG_NAME,
        kinds = DEFAULT_KINDS,
        queryImpl = null,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxResults = DEFAULT_MAX_RESULTS
    } = {}) {
        this._relayUrl = relayUrl;
        this._tagName = tagName;
        this._kinds = Array.isArray(kinds) && kinds.length > 0 ? [...kinds] : [...DEFAULT_KINDS];
        if (typeof queryImpl !== 'function') {
            throw new Error('NostrSnapshotDiscoveryQueryService: no relay query implementation available — pass queryImpl explicitly');
        }
        this._queryImpl = queryImpl;
        this._timeoutMs = timeoutMs;
        this._maxResults = Number.isInteger(maxResults) && maxResults > 0 ? maxResults : DEFAULT_MAX_RESULTS;
    }

    get relayUrl() { return this._relayUrl; }

    // Resolves to `[{ contentHash, locator, storage }, ...]` — one
    // candidate for every event `queryImpl` reports whose own `content`
    // describes a well-formed Snapshot Discovery Envelope. Resolves to
    // `[]`, never throws — see this file's own header, "never throws."
    async search(discoveryTag) {
        const filter = buildDiscoveryFilter(this._tagName, this._kinds, discoveryTag, this._maxResults);

        let events;
        try {
            events = await withTimeout(this._queryImpl(this._relayUrl, filter), this._timeoutMs);
        } catch {
            return [];
        }
        if (!Array.isArray(events)) {
            return [];
        }

        return parseEnvelopeCandidates(events);
    }

    // resolveLocator(discoveryTag, contentHash) -> Promise<string|null>.
    // See this file's own header, "resolveLocator() is a thin convenience."
    // Returns the first candidate's own `locator` whose `contentHash`
    // matches exactly, or `null` when `search()` reports no such
    // candidate.
    async resolveLocator(discoveryTag, contentHash) {
        const candidates = await this.search(discoveryTag);
        const match = candidates.find((candidate) => candidate.contentHash === contentHash);
        return match ? match.locator : null;
    }
}

NostrSnapshotDiscoveryQueryService.DEFAULT_RELAY_URL = DEFAULT_RELAY_URL;
NostrSnapshotDiscoveryQueryService.DEFAULT_TAG_NAME = DEFAULT_TAG_NAME;
NostrSnapshotDiscoveryQueryService.DEFAULT_KINDS = DEFAULT_KINDS;

// Pure. Builds the NIP-01 `REQ` filter object matching this class's own
// documented shape.
function buildDiscoveryFilter(tagName, kinds, discoveryTag, maxResults) {
    return {
        kinds: [...kinds],
        [`#${tagName}`]: [discoveryTag],
        limit: maxResults
    };
}

// Pure. Extracts `{ contentHash, locator, storage }` candidates out of a
// raw array of Nostr events — every event whose own `content` fails
// `parseSnapshotDiscoveryEnvelope()` is silently skipped, never a reason
// to fail the whole batch.
function parseEnvelopeCandidates(events) {
    const candidates = [];
    for (const event of events) {
        const envelope = parseSnapshotDiscoveryEnvelope(event && event.content);
        if (envelope === null) {
            continue;
        }
        candidates.push({ contentHash: envelope.contentHash, locator: envelope.locator, storage: envelope.storage });
    }
    return candidates;
}

// Races `promise` against `timeoutMs`; rejects if the timer fires first.
// The timer is always cleared, whichever settles first.
function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('NostrSnapshotDiscoveryQueryService: queryImpl timed out')), timeoutMs);
        Promise.resolve(promise).then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); }
        );
    });
}
