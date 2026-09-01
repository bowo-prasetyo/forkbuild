import { DecentralizedDiscoveryQueryService } from './DecentralizedWorldDiscoveryQuery.js';
import { parseDecentralizedDiscoveryEnvelope } from '../core/DecentralizedDiscoveryEnvelope.js';

const DEFAULT_RELAY_URL = 'wss://relay.damus.io';
const DEFAULT_TAG_NAME = 't';
const DEFAULT_KINDS = Object.freeze([1]);
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESULTS = 20;
const URI_SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//;

// 0.9.31 — Nostr Decentralized Discovery Adapter.
//
// `application/ArweaveGraphqlDiscoveryQueryService.js` (0.9.25) was the
// first concrete `DecentralizedDiscoveryQueryService` — but Arweave's own
// tags carry no `kind`/`objectId` of their own, which is exactly the gap
// `core/DecentralizedDiscoveryEnvelope.js` (0.9.30) named and closed with
// a substrate-neutral JSON shape a publisher can attach to whatever
// payload field their own substrate already offers. This milestone is
// the first adapter that actually reads one: a `DecentralizedDiscoveryQueryService`
// for Nostr, a substrate whose own tag/filter mechanism is different
// enough from Arweave's to be a real test of whether 0.9.24-0.9.30's own
// abstractions are genuinely substrate-neutral.
//
//   Nostr relay
//         │
//         │   REQ { kinds: [...], "#t": [discoveryTag], limit }
//         ▼
//   application/NostrDiscoveryQueryService.js   ★ (THIS)
//        .search(discoveryTag)
//         │
//         │   events, each carrying its own `.content`
//         ▼
//   core/DecentralizedDiscoveryEnvelope.js   (0.9.30, unmodified)
//        parseDecentralizedDiscoveryEnvelope(event.content)
//         │
//         ▼
//   [ { uri: envelope.uri, storage: <scheme of envelope.uri> }, ... ]
//         │
//         ▼
//   application/DecentralizedWorldDiscoveryQuery.js   (0.9.25, unmodified)
//        queryDecentralizedWorldDiscovery()
//         │
//         ▼
//   DecentralizedWorldDiscoveryLead[]
//
// A DISCOVERY TAG, NEVER AN ENVELOPE FIELD, IS WHAT THE NOSTR FILTER
// MATCHES ON — THE ENVELOPE LIVES IN `content`, NOT IN `tags`. Two shapes
// were possible for a Nostr event carrying a ForkBuild declaration: fold
// the envelope's own fields (`kind`, `objectId`, `uri`) into individual
// Nostr tags, or keep the envelope whole, as JSON, in the event's own
// `content`, with only the cheap, free-form discovery tag — 0.9.24's own
// field, unrelated to any Nostr-protocol tag despite the name collision —
// living in a Nostr `t` tag for relays to index and filter on. This class
// takes the second shape. The `t` tag answers "can I find ForkBuild-
// related material on this relay at all" — a search accelerator, matched
// by the relay's own indexing, proving nothing. `content`, once fetched,
// answers the different question `core/DecentralizedDiscoveryEnvelope.js`
// already exists to answer: what does the tagged event actually claim?
// Folding `kind`/`objectId`/`uri` into individual Nostr tags instead would
// have leaked ForkBuild's own internal envelope shape into a Nostr-
// specific indexing mechanism, and made a Nostr declaration structurally
// different from an Arweave one for no reason — the whole point of 0.9.30's
// envelope is that the SAME JSON shape rides in an Arweave transaction's
// data, a Nostr event's `content`, an AT Protocol record's fields, or a
// Hive `custom_json`'s body, unmodified. This class's own `search()` never
// reads any Nostr tag other than the one it uses to build its own outgoing
// filter; it never inspects an event's `tags` array when turning events
// into candidates.
//
// `queryImpl` IS AN INJECTION POINT, NOT A CONVENIENCE, AND — UNLIKE
// `ArweaveGraphqlDiscoveryQueryService`'s OWN `fetchImpl` — IT HAS NO
// GLOBAL DEFAULT. Arweave's adapter falls back to `fetch.bind(globalThis)`
// because HTTP already has a universal, ambient primitive this runtime
// provides. Querying a Nostr relay is a stateful exchange over a
// WebSocket — send a `REQ`, collect `EVENT` messages, stop at `EOSE` — and
// no such ambient primitive exists here; building one would mean this
// file taking on WebSocket subscription/framing/reconnection logic that
// belongs to a relay client library, not to this orchestration-adjacent
// adapter. So `queryImpl` is REQUIRED: a `(relayUrl, filter) => Promise<events>`
// collaborator that already knows how to open a subscription against one
// relay, collect whatever events match the filter, and resolve with them
// — the same "one relay per call, no fan-out" restraint `application/
// DecentralizedWorldDiscoveryQuery.js`'s own header already holds for
// "exactly one service per call," held here one layer earlier, for
// exactly one relay. The constructor throws if `queryImpl` is missing or
// not a function, exactly mirroring the Arweave adapter's own
// constructor-time throw when no `fetchImpl` is available, for the
// identical reason: fail loudly at construction, never silently report
// zero leads because nobody wired a real collaborator in.
//
// NEVER THROWS FROM `search()` — EVERY FAILURE DEGRADES TO `[]`, THE
// IDENTICAL CONTRACT `ArweaveGraphqlDiscoveryQueryService`'s OWN HEADER
// ALREADY HOLDS. A `queryImpl` that rejects, a `queryImpl` that never
// settles (guarded by this class's own `timeoutMs`), a resolved value
// that is not an array, an event whose `content` is missing, unparseable,
// or not a recognized ForkBuild envelope — none of these distinguish
// themselves to a caller. Each event is independently handed to
// `parseDecentralizedDiscoveryEnvelope()`; an event that fails is silently
// skipped rather than invalidating the whole batch, exactly 0.9.25's own
// "one bad candidate never corrupts the others."
//
// `storage` IS READ OFF THE ENVELOPE'S OWN `uri` SCHEME, NEVER HARD-CODED
// — THE ONE REAL DIFFERENCE FROM THE ARWEAVE ADAPTER'S OWN CANDIDATES.
// `ArweaveGraphqlDiscoveryQueryService` can hard-code `storage: 'ar'`
// because every candidate it reports is, by construction, an Arweave
// transaction. A Nostr event's own envelope carries no such guarantee —
// `core/DecentralizedDiscoveryEnvelope.js`'s own `uri` field is exactly as
// substrate-neutral as the envelope itself, and the whole reason 0.9.30's
// own header drew a line between "where ForkBuild discovered the
// declaration" (this relay) and "where the declared material claims to
// reside" (whatever `uri` says) is that those can differ. This file reads
// that difference off the `uri` string's own scheme — `ar://…` implies
// `"ar"`, `ipfs://…` implies `"ipfs"` — the same open, free-form
// inference `core/ContentReference.js`'s own header already draws between
// a uri and the backend it names, never a closed list of recognized
// schemes. A `uri` with no recognizable `scheme://` prefix reports
// `storage: null`, exactly as `core/DecentralizedWorldDiscoveryLead.js`'s
// own `describeDecentralizedWorldDiscoveryLead()` already treats a missing
// `storage` as an optional field, never a reason to reject the candidate.
//
// `origin` NAMES THIS RELAY, NEVER AN EVENT'S OWN `id`, `pubkey`, OR THE
// ENVELOPE'S `uri` — THE SAME RULE `ArweaveGraphqlDiscoveryQueryService`'s
// OWN HEADER ALREADY HOLDS FOR A GATEWAY URL. Two instances pointed at two
// different relays report two different origins for the identical
// `discoveryTag`; the events a relay reports never influence what this
// class calls itself.
//
// NO SIGNATURE, NO PUBKEY, NO NIP-01 `id`/`sig` VERIFICATION OF ANY KIND.
// A Nostr event's own `sig` field is a real, checkable cryptographic
// signature — this class never checks it, never reads `event.pubkey`, and
// never imports anything that would. `core/DecentralizedDiscoveryEnvelope.js`'s
// own header already drew this line for the envelope itself: "an envelope
// carries no signature field for this file to even look for." Whether a
// Nostr event's own `sig` should ever gate anything — turning an unsigned
// envelope claim into something closer to evidence — is exactly the
// question 0.9.30's own header left for a future, unscheduled milestone
// (see the roadmap's own "0.9.32" entry); this file does not answer it
// early by quietly checking a signature nobody asked it to.
//
// A LEAD, NEVER ASSOCIATION EVIDENCE — THIS FILE PRODUCES CANDIDATES FOR
// `application/DecentralizedWorldDiscoveryQuery.js`'s OWN
// `queryDecentralizedWorldDiscovery()` TO TURN INTO LEADS, AND STOPS
// THERE. A candidate this class reports carries only `{ uri, storage }` —
// never the envelope's own `kind` or `objectId`, both of which this class
// reads only long enough to confirm `parseDecentralizedDiscoveryEnvelope()`
// accepted the event's `content` at all. Once `queryDecentralizedWorldDiscovery()`
// stamps a candidate with this service's own `origin` and the
// `discoveryTag` that was searched for, the result is exactly a
// `DecentralizedWorldDiscoveryLead` — a rumor about a location, never
// proof that a specific object lives there. Wiring an accepted Nostr
// envelope into `application/DecentralizedWorldEncounterLeadAssociationEvidenceIngress.js`
// as a second evidence producer remains exactly what 0.9.30's own header
// already left unscheduled — see "Deliberately excluded," below.
//
// EXACTLY ONE RELAY PER INSTANCE — NO FAN-OUT, NO RACE, NO AGGREGATION.
// A second relay is a second instance of this same class, one call at a
// time, exactly how `ArweaveGraphqlDiscoveryQueryService`'s own header
// already frames a second gateway. Querying several relays and combining
// what they each report is deliberately not this milestone; a future,
// unscheduled composition layer over several `DecentralizedDiscoveryQueryService`
// instances — Nostr relays, Arweave gateways, or a mix — is where that
// belongs.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Implementing the Nostr wire protocol itself** — opening a
//   WebSocket, sending `REQ`, collecting `EVENT`/`EOSE` messages, closing
//   the subscription. See "queryImpl is an injection point," above; that
//   is `queryImpl`'s own job, supplied by whoever constructs this class.
// - **Publishing or tagging a Nostr event.** This class only ever reads.
// - **Querying more than one relay, or combining/ranking/deduplicating
//   what several relays (or two calls to the same one) report.** See
//   "Exactly one relay per instance," above.
// - **Any signature or NIP verification of an event's `id`/`sig`/`pubkey`.**
//   See "No signature, no pubkey," above.
// - **Wiring an accepted Nostr envelope into association evidence.** See
//   "A lead, never association evidence," above — unscheduled, later work.
// - **Retrieving a candidate's own content from wherever its `uri`
//   points.** A lead is a rumor, not a retrieval — unchanged since 0.9.24.
// - **Folding envelope fields into individual Nostr tags as an
//   alternative payload shape.** See "A discovery tag, never an envelope
//   field," above — deliberately rejected, not merely unscheduled.
export class NostrDiscoveryQueryService extends DecentralizedDiscoveryQueryService {
    // relayUrl: which Nostr relay to query — defaults to a well-known
    //   public relay, but any relay speaking NIP-01 works.
    // tagName: which Nostr filter tag NAME a discovery tag is matched
    //   against — defaults to `t`, Nostr's own conventional single-letter
    //   tag for a topic/hashtag-style filter (`"#t": [value]`).
    // kinds: which Nostr event kind(s) this service's own filter matches
    //   — defaults to `[1]` (a short text note), the most broadly relayed
    //   kind; any event kind whose `content` a publisher chooses to attach
    //   an envelope to works equally well.
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
        super();
        this._relayUrl = relayUrl;
        this._tagName = tagName;
        this._kinds = Array.isArray(kinds) && kinds.length > 0 ? [...kinds] : [...DEFAULT_KINDS];
        if (typeof queryImpl !== 'function') {
            throw new Error('NostrDiscoveryQueryService: no relay query implementation available — pass queryImpl explicitly');
        }
        this._queryImpl = queryImpl;
        this._timeoutMs = timeoutMs;
        this._maxResults = Number.isInteger(maxResults) && maxResults > 0 ? maxResults : DEFAULT_MAX_RESULTS;
    }

    get origin() {
        return `dweb:nostr:${this._relayUrl}`;
    }

    get relayUrl() { return this._relayUrl; }

    // Resolves to `[{ uri, storage }, ...]` — one candidate for every
    // event `queryImpl` reports whose own `content` describes a well-formed
    // ForkBuild discovery envelope (see `core/DecentralizedDiscoveryEnvelope.js`).
    // Resolves to `[]`, never throws — see this file's own header, "never
    // throws."
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
}

NostrDiscoveryQueryService.DEFAULT_RELAY_URL = DEFAULT_RELAY_URL;
NostrDiscoveryQueryService.DEFAULT_TAG_NAME = DEFAULT_TAG_NAME;
NostrDiscoveryQueryService.DEFAULT_KINDS = DEFAULT_KINDS;

// Pure. Builds the NIP-01 `REQ` filter object matching this class's own
// documented shape — see this file's own header for why the discovery tag
// is matched via a Nostr `#<tagName>` filter, never an individual envelope
// field.
function buildDiscoveryFilter(tagName, kinds, discoveryTag, maxResults) {
    return {
        kinds: [...kinds],
        [`#${tagName}`]: [discoveryTag],
        limit: maxResults
    };
}

// Pure. Extracts `{ uri, storage }` candidates out of a raw array of Nostr
// events — every event whose own `content` fails
// `parseDecentralizedDiscoveryEnvelope()` is silently skipped, never a
// reason to fail the whole batch.
function parseEnvelopeCandidates(events) {
    const candidates = [];
    for (const event of events) {
        const envelope = parseDecentralizedDiscoveryEnvelope(event && event.content);
        if (envelope === null) {
            continue;
        }
        candidates.push({ uri: envelope.uri, storage: extractUriScheme(envelope.uri) });
    }
    return candidates;
}

// Pure. Reads the `scheme` a `scheme://...` uri names — see this file's
// own header, "storage is read off the envelope's own uri scheme." Returns
// `null` for a uri with no recognizable `scheme://` prefix.
function extractUriScheme(uri) {
    const match = URI_SCHEME_PATTERN.exec(uri);
    return match ? match[1] : null;
}

// Races `promise` against `timeoutMs`; rejects if the timer fires first.
// The timer is always cleared, whichever settles first — no dangling
// handle survives a call.
function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('NostrDiscoveryQueryService: queryImpl timed out')), timeoutMs);
        Promise.resolve(promise).then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); }
        );
    });
}
