const DEFAULT_RELAY_URL = 'wss://relay.damus.io';
const DEFAULT_TAG_NAME = 't';
const DEFAULT_KINDS = Object.freeze([1]);
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESULTS = 20;

// 0.9.254 — Nostr Place Naming Discovery Source.
//
// `application/PlaceNamingDiscoveryQueryService.js` (0.9.253) named the
// contract every discovery source must satisfy — `{ search(discoveryTag)
// -> Promise<rawPayload[]> }`, duck-typed, deliberately transport-agnostic
// — but left `sources` an honest empty roster: no concrete transport
// existed yet. This file is the first one: a Nostr relay reading counterpart
// wired against the SAME shared NIP-01 transport
// `application/NostrSnapshotDiscoveryQueryService.js` (0.9.133) already
// uses, applied to Place Naming's own discovery tag/envelope vocabulary
// instead of Snapshot's.
//
//   Nostr relay
//        │
//        │   REQ { kinds: [...], "#t": [discoveryTag], limit }
//        ▼
//   application/NostrPlaceNamingDiscoverySource.js   ★ (THIS)
//        .search(discoveryTag)
//        │
//        │   events, each carrying its own `.content`
//        ▼
//   [ event.content, event.content, ... ]   (raw payload strings, exactly
//        as `application/PlaceNamingDiscoveryQueryService.js`'s own
//        `source.search()` contract names them — UNPARSED)
//        │
//        │   a caller's own, already-existing collaborator:
//        ▼
//   application/PlaceNamingDiscoveryQueryService.js   (0.9.253, unmodified)
//        parses each raw payload via core/PlaceNamingDiscoveryEnvelope.js
//        #parsePlaceNamingDiscoveryEnvelope(), discards what fails to
//        parse, deduplicates by claim.id
//
// A TRANSPORT SHIM, NEVER A SECOND PARSER — THE ONE DELIBERATE DEPARTURE
// FROM `application/NostrSnapshotDiscoveryQueryService.js`'S OWN PATTERN,
// AND WHY. That file calls `parseSnapshotDiscoveryEnvelope()` itself and
// returns already-validated candidates, because nothing else in the
// Snapshot discovery family was ever going to re-parse an event's content
// a second time. Place Naming's own aggregator already does — `
// PlaceNamingDiscoveryQueryService.search()` was built, unmodified, to
// accept exactly `rawPayload[]` (a JSON string OR an already-parsed plain
// object) and run `parsePlaceNamingDiscoveryEnvelope()` over every one
// itself. Having this file parse first, only for the aggregator to parse
// again, would duplicate one algorithm across two files for no reason and
// hand each one an independent (and inevitably driftable) copy of the same
// shape rules. So this file does the ONE thing only it can do — run the
// relay exchange and hand back whatever a matching event's own `.content`
// was — and stops there. It never imports `core/
// PlaceNamingDiscoveryEnvelope.js`, never calls
// `parsePlaceNamingDiscoveryEnvelope()`, and has no idea what a well-formed
// envelope even looks like. `tests/NostrPlaceNamingDiscoverySource.test.js`
// proves this structurally, the same way this codebase's own regression
// suites already prove a file's restraint by what it never imports.
//
// `queryImpl` IS AN INJECTION POINT, NOT A CONVENIENCE, WITH NO AMBIENT
// DEFAULT — the identical restraint every sibling in this family
// (`application/NostrDiscoveryQueryService.js`,
// `application/NostrSnapshotDiscoveryQueryService.js`) already holds. A
// caller supplies a `(relayUrl, filter) => Promise<events>` collaborator —
// in practice, `nostr/NostrRelayQueryClient.js#createNostrRelayQueryClient()`'s
// own return value, unmodified, exactly as already reused for Snapshot
// discovery. The constructor throws synchronously if `queryImpl` is
// missing or not a function.
//
// A RELAY/TRANSPORT FAILURE REJECTS `search()` — THE SECOND DELIBERATE
// DEPARTURE FROM `NostrSnapshotDiscoveryQueryService`'S OWN "NEVER THROWS"
// CONVENTION, AND WHY. That file swallows every `queryImpl` failure into
// `[]` because nothing calls it except a UI composition root that has no
// better use for a distinction between "the relay had nothing to say" and
// "the relay was unreachable." This file's own, and only, caller —
// `application/PlaceNamingDiscoveryQueryService.js#search()` — ALREADY
// isolates a rejecting/throwing source via `Promise.allSettled()`,
// treating it as "this source contributed nothing" without needing this
// file to also collapse a genuine transport failure into an
// indistinguishable empty array first. Swallowing the error here a second
// time would only discard information the layer above already handles
// correctly — the identical "isolation is the aggregator's job, honesty is
// the transport's job" split `nostr/NostrRelayQueryClient.js`'s own header
// already draws one layer further down, held here one layer up instead. So
// `queryImpl` rejecting, `queryImpl` never settling before `timeoutMs`
// elapses, and `queryImpl` resolving to something that is not an array of
// events, all reject `search()`'s own promise — never `[]`.
//
// A MALFORMED OR CONTENT-LESS EVENT IS SKIPPED, NEVER A REASON TO REJECT
// THE WHOLE QUERY. This is a STRUCTURAL check only — does this event even
// carry a non-empty string `.content` to hand onward — never a semantic
// one; this file forms no opinion on whether that string happens to
// describe a well-formed Place Naming Discovery Envelope. An event with no
// `.content`, a non-string `.content`, or that is not itself a plain
// object is silently excluded from the returned array; every other event's
// own `.content` still comes through.
//
// EVENTS ARE COLLECTED, AND THEIR PAYLOADS RETURNED, IN THE ORDER THE
// RELAY SENT THEM — NEVER REORDERED, NEVER DEDUPLICATED. Two Nostr events
// announcing the SAME `claim.id` (an author re-broadcasting, or two relays'
// worth of events surfaced through the same `queryImpl`) both come through
// as two independent entries in the returned array — deduplication is
// `PlaceNamingDiscoveryQueryService.search()`'s own, already-established,
// first-occurrence-wins job (0.9.253), never duplicated here. This file
// would otherwise be inventing a second, competing deduplication policy
// for the exact case docs/Roadmap.md's own 0.9.254 entry names as
// deliberately avoided.
//
// EXACTLY ONE RELAY PER INSTANCE — NO FAN-OUT, NO RACE, NO AGGREGATION
// ACROSS RELAYS. The identical restraint every sibling in this family
// already holds; querying several relays and combining what they each
// report is a future, unscheduled composition layer over several instances
// of this same class (or several `sources` entries), never this file's own
// concern.
//
// NO SIGNATURE, NO PUBKEY, NO NIP-01 `id`/`sig` VERIFICATION OF ANY KIND,
// AND NO SPATIAL, TRUST, RANKING, ADOPTION, OR PRESENTATION DECISION OF ANY
// KIND. This file never imports `identity/LocalAuthorizationVerifier.js`,
// `application/LocalPlaceNamingClaimStore.js`, `core/PlaceNamingView.js`,
// or anything World/spatial-shaped — whether a discovered claim is
// spatially relevant, whether its publisher is trustworthy, which claim
// among several is "better," whether two claims conflict, whether a claim
// should ever be displayed, and whether a claim should ever rename
// anything, all remain entirely downstream questions this file never asks.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Publishing, tagging, or signing a Nostr event.** This class only
//   ever reads; a future `NostrPlaceNamingDiscoveryPublisher` (mirroring
//   `application/NostrSnapshotDiscoveryPublisher.js`) is a separate,
//   unscheduled write-side counterpart this milestone does not build.
// - **Wiring this source into `application/
//   PlaceNamingDiscoveryRuntimeComposition.js`'s `sources` roster, or into
//   `ui/main.js`.** A caller composes this class with a real `queryImpl`
//   and hands the result into `sources` entirely on its own, later, terms —
//   this file does not import either one, and never constructs itself.
// - **Any concrete Arweave source, WebRTC peer-exchange source, or
//   file-import bridge.** Only the Nostr transport, already proven out for
//   Snapshot discovery, is in scope here.
// - **Envelope parsing, shape validation, or anything from `core/
//   PlaceNamingDiscoveryEnvelope.js`.** See "a transport shim, never a
//   second parser," above.
// - **Proximity/radius selection, ranking, trust scoring, or any
//   presentation decision.** See docs/Roadmap.md's own 0.9.254 entry,
//   "what comes after" — a later, separate spatial-relevance seam.
export class NostrPlaceNamingDiscoverySource {
    // relayUrl: which Nostr relay to query.
    // tagName: which Nostr filter tag NAME a discovery tag is matched
    //   against — defaults to `t`, matching every sibling in this family.
    // kinds: which Nostr event kind(s) this source's own filter matches —
    //   defaults to `[1]` (a short text note).
    // queryImpl: see this file's own header, "queryImpl is an injection
    //   point." Required — there is no ambient default.
    // timeoutMs: how long to wait for `queryImpl` to settle before
    //   `search()` itself rejects — see "a relay/transport failure rejects
    //   search()," above.
    // maxResults: the NIP-01 filter's own `limit`.
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
            throw new Error('NostrPlaceNamingDiscoverySource: no relay query implementation available — pass queryImpl explicitly');
        }
        this._queryImpl = queryImpl;
        this._timeoutMs = timeoutMs;
        this._maxResults = Number.isInteger(maxResults) && maxResults > 0 ? maxResults : DEFAULT_MAX_RESULTS;
    }

    get relayUrl() { return this._relayUrl; }

    // search(discoveryTag) -> Promise<Array<rawPayload>>. Queries this
    // source's own relay for events tagged with `discoveryTag` and resolves
    // with every matching event's own `.content`, in the order the relay
    // sent them — see this file's own header for the complete contract.
    // Rejects — never resolves to `[]` — when `queryImpl` rejects, when
    // `queryImpl` does not settle before `timeoutMs` elapses, or when
    // `queryImpl` resolves to something that is not an array of events.
    async search(discoveryTag) {
        const filter = buildDiscoveryFilter(this._tagName, this._kinds, discoveryTag, this._maxResults);

        const events = await withTimeout(this._queryImpl(this._relayUrl, filter), this._timeoutMs);
        if (!Array.isArray(events)) {
            throw new Error('NostrPlaceNamingDiscoverySource: relay query did not resolve to an array of events');
        }

        return extractRawPayloads(events);
    }
}

NostrPlaceNamingDiscoverySource.DEFAULT_RELAY_URL = DEFAULT_RELAY_URL;
NostrPlaceNamingDiscoverySource.DEFAULT_TAG_NAME = DEFAULT_TAG_NAME;
NostrPlaceNamingDiscoverySource.DEFAULT_KINDS = DEFAULT_KINDS;

// Pure. Builds the NIP-01 `REQ` filter object matching this class's own
// documented shape — byte-for-byte the same shape `application/
// NostrSnapshotDiscoveryQueryService.js`'s own `buildDiscoveryFilter()`
// already builds, held here unchanged, one discovery family over.
function buildDiscoveryFilter(tagName, kinds, discoveryTag, maxResults) {
    return {
        kinds: [...kinds],
        [`#${tagName}`]: [discoveryTag],
        limit: maxResults
    };
}

// Pure. Extracts every event's own raw `.content` string out of a raw
// array of Nostr events — see this file's own header, "a malformed or
// content-less event is skipped." An event that is not a plain object, or
// whose own `.content` is missing, not a string, or empty, contributes
// nothing; every other event's own `.content` is returned exactly as
// received, in order, never deduplicated.
function extractRawPayloads(events) {
    const payloads = [];
    for (const event of events) {
        if (!event || typeof event !== 'object') {
            continue;
        }
        if (typeof event.content !== 'string' || event.content.length === 0) {
            continue;
        }
        payloads.push(event.content);
    }
    return payloads;
}

// Races `promise` against `timeoutMs`; rejects if the timer fires first.
// The timer is always cleared, whichever settles first. A small,
// self-contained helper, not imported from `application/
// NostrSnapshotDiscoveryQueryService.js`'s own identical-looking one —
// this file imports nothing from any sibling discovery family.
function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('NostrPlaceNamingDiscoverySource: queryImpl timed out')), timeoutMs);
        Promise.resolve(promise).then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); }
        );
    });
}
