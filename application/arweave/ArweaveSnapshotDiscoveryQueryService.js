import { parseSnapshotDiscoveryEnvelope } from '../../core/SnapshotDiscoveryEnvelope.js';
import { SnapshotCandidateDiscoveryOutcome } from '../snapshot/SnapshotCandidateDiscoveryOutcome.js';

const DEFAULT_GRAPHQL_URL = 'https://arweave.net/graphql';
// Deliberately the same host application/arweave/ArweaveGraphqlDiscoveryQueryService.js's
// own DEFAULT_GATEWAY_URL and application/arweave/ArweaveSnapshotDiscoveryPublisher.js's
// own DEFAULT_GATEWAY_URL already use — duplicated, never imported; the same
// "two independent files" convention this whole family already follows.
const DEFAULT_GATEWAY_URL = 'https://arweave.net';
// Deliberately IDENTICAL to application/arweave/ArweaveSnapshotDiscoveryPublisher.js's
// own DEFAULT_TAG_NAME — a query service that defaulted to a different tag
// name than its own write-side sibling would never find what that sibling
// just published. Duplicated as a literal rather than imported, the same
// "kept deliberately separate" convention every constant in this family
// already holds (see that file's own header for why the STRING itself must
// stay distinct from application/arweave/ArweaveGraphqlDiscoveryQueryService.js's
// own 'ForkBuild-Discovery-Tag').
const DEFAULT_TAG_NAME = 'ForkBuild-Snapshot-Discovery-Tag';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESULTS = 20;
// Deliberately the same magnitude application/
// ArweaveGraphqlDiscoveryQueryService.js's own DEFAULT_MAX_ENVELOPE_BYTES
// already uses — this file's own constant, never imported from that one.
const DEFAULT_MAX_ENVELOPE_BYTES = 48 * 1024;

// 0.9.499 — Arweave Snapshot Discovery Query Service.
//
// The reading counterpart of application/arweave/ArweaveSnapshotDiscoveryPublisher.js
// (0.9.498) — that file writes a `core/SnapshotDiscoveryEnvelope.js` into a
// tagged Arweave transaction; this file queries Arweave's own public GraphQL
// gateway for transactions carrying that tag and reads the same envelope
// back out, so a caller who only holds a `discoveryTag` can learn where an
// Arweave-announced Snapshot's bytes claim to be retrievable from.
//
// 0.9.497's own capability boundary audit (tests/
// ArweaveSnapshotDiscoveryCapabilityBoundaryAudit.test.js, Section H) proved,
// live, that the existing `application/arweave/ArweaveGraphqlDiscoveryQueryService.js`
// is genuinely, structurally incapable of this: it re-decodes every
// candidate through `core/DecentralizedDiscoveryEnvelope.js#parseDecentralizedDiscoveryEnvelope()`,
// which a real Snapshot Discovery Envelope always fails (wrong protocol, no
// `kind`/`objectId`) — a real, well-formed Snapshot announcement fed through
// that class's own gateway step is silently dropped, reporting zero
// candidates, exactly as a real Decentralized envelope is symmetrically
// rejected by `parseSnapshotDiscoveryEnvelope()`. That audit's own verdict
// named this file directly: the GraphQL-tag-search + per-candidate
// gateway-read PATTERN carries over unchanged; only the parse call at the
// end changes vocabulary.
//
//   discoveryTag
//         │
//         ▼
//   POST https://arweave.net/graphql   (the identical primitive application/
//        { transactions(tags: [...]) { edges { node { id } } } }    ArweaveGraphqlDiscoveryQueryService.js
//         │                                                          already ships, duplicated here rather
//         ▼                                                          than imported or subclassed — see
//   [ <announcement-transaction-id>, ... ]                           "a standalone class," below)
//         │
//         │   for each id
//         ▼
//   GET <gatewayUrl>/<announcement-transaction-id>
//         │
//         ▼
//   parseSnapshotDiscoveryEnvelope(rawText)   (core/SnapshotDiscoveryEnvelope.js,
//        │                                     0.9.133, UNMODIFIED)
//         ▼
//   application/arweave/ArweaveSnapshotDiscoveryQueryService.js   ★ (THIS)
//        .search(discoveryTag)
//         │
//         ▼
//   [ { contentHash, locator, storage, publicationId?, claimedPosition? }, ... ]
//
// A STANDALONE CLASS — NEVER A `DecentralizedDiscoveryQueryService`
// (application/discovery/DecentralizedWorldDiscoveryQuery.js), AND NEVER A SUBCLASS OR
// IN-PLACE GENERALIZATION OF `application/arweave/ArweaveGraphqlDiscoveryQueryService.js`.
// The identical restraint `application/nostr/NostrSnapshotDiscoveryQueryService.js`'s
// own header already holds against `application/nostr/NostrDiscoveryQueryService.js`,
// one substrate over: branching that class's own already-proven, production
// Publication/Avatar contract on envelope shape would risk exactly the kind
// of silent regression 0.9.489-0.9.495 spent seven milestones hardening
// against (0.9.497 Section H). This file shares no code, no base class, and
// no runtime import with `ArweaveGraphqlDiscoveryQueryService.js` — only the
// GraphQL query STRING SHAPE and the "gateway GET per transaction id"
// technique are duplicated, matching this whole family's own "two
// independent files" convention already held between, e.g., application/
// ArweaveAnnouncementPublisher.js and application/
// ArweaveSnapshotDiscoveryPublisher.js one direction over.
//
// SIBLING TO `application/arweave/ArweaveSnapshotDiscoveryPublisher.js`, NEVER
// DEPENDENT ON IT. Per this milestone's own requesting brief: "they share
// substrate primitives, but neither should orchestrate the other." This
// file never imports `ArweaveSnapshotDiscoveryPublisher.js`, never
// constructs one, and never calls `publish()` — a caller who wants both
// write and read wires the two together itself. The only primitive
// genuinely shared between them is the Arweave Tag NAME string
// (`ForkBuild-Snapshot-Discovery-Tag`) each defines as its own, separately,
// duplicated literal constant — not a shared import.
//
// THREE DISTINCT IDENTITIES, NEVER COLLAPSED — THE MOST VALUABLE FINDING
// 0.9.497 SECTION E PRODUCED, RESTATED HERE AS THIS FILE'S OWN INVARIANT:
//
//   contentHash     = sha256(bytes)                 (from the envelope)
//   locator         = ar://<CONTENT transaction id>  (from the envelope)
//   announcementId  = <ANNOUNCEMENT transaction id>  (this file's own
//                      GraphQL step; the transaction id THIS file's own
//                      gateway GET was made against)
//
// The GraphQL step's own discovered id identifies the ANNOUNCEMENT
// transaction; `envelope.locator` — decoded from that announcement's own
// body — already identifies a wholly separate CONTENT transaction the
// original publisher placed earlier. This file never reads its own
// announcement id back into a candidate's `locator`, never derives one from
// the other, and — see "no `announcementId` on a reported candidate," below
// — never reports the announcement id on a candidate at all, so no caller
// downstream can accidentally confuse the two the way 0.9.493 already
// proved was possible for the OTHER (Decentralized) vocabulary before
// 0.9.494 fixed it.
//
// NO `announcementId` ON A REPORTED CANDIDATE — A DELIBERATE DEPARTURE FROM
// `ArweaveGraphqlDiscoveryQueryService.js`'s OWN SHAPE, TO MATCH THIS
// VOCABULARY'S OWN SIBLING INSTEAD. `application/
// NostrSnapshotDiscoveryQueryService.js#search()` reports exactly
// `{ contentHash, locator, storage, publicationId?, claimedPosition? }` —
// no Nostr event id rides along. `application/
// LocalSnapshotCandidateDiscoveryQueryService.js#search()` carries no
// provenance field either. This file matches ITS OWN family — the Snapshot
// candidate vocabulary `application/snapshot/SnapshotCandidateDiscoveryQueryService.js`
// composes three sources into — rather than the Decentralized-vocabulary
// shape `ArweaveGraphqlDiscoveryQueryService.js` happens to also read off
// Arweave; carrying an announcement id here would mean this Arweave source
// alone reports an extra key its sibling sources never do, ann it plays no
// role `application/snapshot/SnapshotCandidateDiscoveryQueryService.js`'s own
// dedup key (`storage`+`contentHash`+`locator`), and it plays no role the
// resolver (`application/snapshot/DecentralizedSnapshotResolver.js`) ever reads.
//
// `fetchImpl` IS AN INJECTION POINT, NOT A CONVENIENCE — the identical
// restraint `ArweaveGraphqlDiscoveryQueryService.js`'s own header already
// holds, for the identical reason: this file's own test coverage runs fully
// deterministic and network-free. The SAME injected `fetchImpl` serves both
// the GraphQL POST and every per-candidate gateway GET.
//
// NEVER THROWS FROM `search()` — EVERY FAILURE DEGRADES TO `[]` OR TO FEWER
// CANDIDATES THAN TRANSACTIONS FOUND, PRESERVING THE EXISTING QUERY-SERVICE
// FAILURE CONTRACT RATHER THAN INVENTING A NEW ONE. A GraphQL request that
// fails to send, a non-2xx GraphQL response, and an unparseable GraphQL body
// are indistinguishable to a caller, all degrading to `[]` — exactly
// `ArweaveGraphqlDiscoveryQueryService.js`'s own contract for its own
// identical step. A per-candidate gateway fetch that fails to send, returns
// non-2xx, is oversized, or whose body fails
// `parseSnapshotDiscoveryEnvelope()`'s own well-formedness check is silently
// skipped — never invalidating the batch, and never reported with the
// announcement id substituted as a fallback candidate.
//
// MULTIPLE CANDIDATES, NO DEDUPLICATION, NO RANKING — the identical
// restraint every sibling in this family already holds.
// `application/snapshot/SnapshotCandidateDiscoveryQueryService.js`'s own
// `storage`+`contentHash`+`locator` dedup pass, one layer up, is where
// cross-source (and cross-transaction) collapsing happens; this file
// reports one candidate per transaction it can successfully decode, in the
// order the GraphQL gateway returned them.
//
// A CANDIDATE, NEVER A LEAD, NEVER VERIFICATION. Finding a matching
// transaction means only "someone announced this locator for this
// contentHash on Arweave" — it does NOT mean the locator actually serves
// those bytes, and it does NOT mean the announcer is trusted. Whether the
// bytes at a discovered locator actually hash to the discovered
// `contentHash` stays entirely `application/snapshot/DecentralizedSnapshotResolver.js`'s
// own, later, separate concern — 0.9.497 Section F already proved that
// existing, unmodified resolver already resolves AND verifies an
// Arweave-backed candidate correctly, with zero code change; this file
// produces candidates in exactly the shape that section fed it directly.
//
// 0.9.171 `publicationId`/`claimedPosition` — PRESERVED, NEVER CONSUMED,
// NEVER VALIDATED BY THIS FILE. `core/SnapshotDiscoveryEnvelope.js#parseSnapshotDiscoveryEnvelope()`
// already enforces both-or-neither and shape; when a decoded envelope
// carries them, this file's own `search()` forwards both onto the reported
// candidate unchanged, exactly as `application/
// NostrSnapshotDiscoveryQueryService.js#search()` already does for Nostr;
// when an envelope carries neither, the reported candidate carries exactly
// its original three keys.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Resolving Snapshot material, calculating a hash, uploading content,
//   or publishing an announcement.** This file only ever reads. No import
//   of `content/ArweaveContentStore.js`, `serializer/contentHash.js`, or
//   `application/arweave/ArweaveSnapshotDiscoveryPublisher.js` appears anywhere in
//   this file.
// - **Querying Nostr, or any substrate besides Arweave.** No import of
//   `application/nostr/NostrSnapshotDiscoveryQueryService.js` or any Nostr module.
// - **Walking-distance filtering, candidate ranking, or deduplication
//   across sources.** That stays `application/
//   SnapshotCandidateDiscoveryQueryService.js`'s own, separate, unmodified
//   job (0.9.500, composition only, is the next scheduled step — this
//   milestone does not touch that file, nor
//   `application/snapshot/SnapshotCandidateDiscoveryRuntimeComposition.js`).
// - **Any change to `application/arweave/ArweaveGraphqlDiscoveryQueryService.js`,
//   `application/arweave/ArweaveSnapshotDiscoveryPublisher.js`,
//   `application/arweave/ArweaveTaggedTransactionUpload.js`,
//   `content/ArweaveContentStore.js`, or `core/SnapshotDiscoveryEnvelope.js`.**
//   Every one is consumed only through its own already-public, already-
//   proven contract, or not at all.
// - **Pagination beyond one page of results, caching, batching, or
//   throttling.** See this milestone's own requesting brief: "no caching,
//   batching, throttling, or ranking unless the product audit demonstrates
//   a real need" — that audit (0.9.501) has not yet run.
export class ArweaveSnapshotDiscoveryQueryService {
    // graphqlUrl: which Arweave GraphQL gateway to query — defaults to
    //   Arweave's own `arweave.net/graphql`.
    // gatewayUrl: which Arweave gateway serves raw transaction data at
    //   `<gatewayUrl>/<transaction-id>`, used to fetch and decode each
    //   discovered transaction's own Snapshot Discovery Envelope.
    // tagName: which transaction Tag NAME a discovery tag is matched
    //   against — defaults to `ForkBuild-Snapshot-Discovery-Tag`, matching
    //   `application/arweave/ArweaveSnapshotDiscoveryPublisher.js`'s own default;
    //   see this file's own header, "deliberately IDENTICAL."
    // fetchImpl: see this file's own header, "fetchImpl is an injection
    //   point."
    // maxEnvelopeBytes: the retrieval safety ceiling applied to each
    //   per-candidate envelope fetch.
    constructor({
        graphqlUrl = DEFAULT_GRAPHQL_URL,
        gatewayUrl = DEFAULT_GATEWAY_URL,
        tagName = DEFAULT_TAG_NAME,
        fetchImpl = null,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxResults = DEFAULT_MAX_RESULTS,
        maxEnvelopeBytes = DEFAULT_MAX_ENVELOPE_BYTES
    } = {}) {
        if (typeof graphqlUrl !== 'string' || graphqlUrl.trim().length === 0) {
            throw new Error('ArweaveSnapshotDiscoveryQueryService: a non-empty graphqlUrl is required');
        }
        if (typeof tagName !== 'string' || tagName.length === 0) {
            throw new Error('ArweaveSnapshotDiscoveryQueryService: a non-empty tagName is required');
        }
        this._graphqlUrl = graphqlUrl;
        this._gatewayUrl = (typeof gatewayUrl === 'string' && gatewayUrl.trim().length > 0 ? gatewayUrl : DEFAULT_GATEWAY_URL).replace(/\/+$/, '');
        this._tagName = tagName;
        this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        if (typeof this._fetch !== 'function') {
            throw new Error('ArweaveSnapshotDiscoveryQueryService: no fetch implementation available — pass fetchImpl explicitly');
        }
        this._timeoutMs = timeoutMs;
        this._maxResults = Number.isInteger(maxResults) && maxResults > 0 ? maxResults : DEFAULT_MAX_RESULTS;
        this._maxEnvelopeBytes = Number.isInteger(maxEnvelopeBytes) && maxEnvelopeBytes > 0 ? maxEnvelopeBytes : DEFAULT_MAX_ENVELOPE_BYTES;
    }

    get graphqlUrl() { return this._graphqlUrl; }
    get gatewayUrl() { return this._gatewayUrl; }
    get tagName() { return this._tagName; }

    // search(discoveryTag) -> Promise<[{ contentHash, locator, storage,
    //   publicationId?, claimedPosition? }, ...]>. See this file's own
    //   header for the full contract. Never throws — resolves to `[]` when
    //   the GraphQL step fails or finds nothing, and skips (rather than
    //   failing the batch for) any transaction whose own gateway fetch
    //   fails, is oversized, or whose body is not a well-formed Snapshot
    //   Discovery Envelope.
    async search(discoveryTag) {
        const announcementIds = await this._searchAnnouncementTransactionIds(discoveryTag);

        const candidates = [];
        for (const announcementId of announcementIds) {
            const envelope = await this._fetchAnnouncementEnvelope(announcementId);
            if (envelope === null) {
                continue;
            }
            const candidate = { contentHash: envelope.contentHash, locator: envelope.locator, storage: envelope.storage };
            if (envelope.publicationId !== undefined) {
                candidate.publicationId = envelope.publicationId;
                candidate.claimedPosition = envelope.claimedPosition;
            }
            candidates.push(candidate);
        }
        return candidates;
    }

    // resolveLocator(discoveryTag, contentHash) -> Promise<string|null>. A
    //   thin convenience over `search()`, never a second kind of query —
    //   the identical shape `application/
    //   NostrSnapshotDiscoveryQueryService.js#resolveLocator()` already
    //   holds. Returns the first candidate's own `locator` whose
    //   `contentHash` matches exactly, or `null` when `search()` reports no
    //   such candidate. No ranking, no "best" provider among several
    //   candidates naming the same `contentHash`.
    async resolveLocator(discoveryTag, contentHash) {
        const candidates = await this.search(discoveryTag);
        const match = candidates.find((candidate) => candidate.contentHash === contentHash);
        return match ? match.locator : null;
    }

    // 0.9.591 — searchWithOutcome(discoveryTag) -> Promise<{ outcome,
    // candidates }>.
    //
    // A SIBLING OF `search()`, NEVER A REPLACEMENT — `search()` above is
    // completely unmodified, byte-for-byte, by this addition, and every
    // existing caller of it keeps receiving exactly the same `[]`-on-failure
    // contract described in this file's own header, "never throws." This
    // method exists only to give `application/
    // SnapshotCandidateDiscoveryQueryService.js#searchWithOutcome()` the
    // identical per-source classification it has already had for
    // `application/nostr/NostrSnapshotDiscoveryQueryService.js` since 0.9.589 —
    // see that file's own `searchWithOutcome()` header for the vocabulary
    // this method reuses unchanged.
    //
    // THE GRAPHQL STEP ALONE DECIDES `UNAVAILABLE` VS. `EMPTY`/`FOUND` —
    // a per-candidate gateway read failing, being malformed, or being
    // skipped NEVER turns a result `UNAVAILABLE` by itself, the identical
    // restraint this file's own header already holds for `search()`
    // ("one unreadable announcement never prevents another... graceful
    // degradation"). Concretely:
    //   - the GraphQL POST throws, resolves non-2xx, returns an
    //     unparseable body, or returns a body whose own
    //     `data.transactions.edges` is not an array — `UNAVAILABLE`. The
    //     query could not be completed; this is NEVER treated as "zero
    //     candidates," the identical line `NostrSnapshotDiscoveryQueryService
    //     #searchWithOutcome()` already draws for "the resolved value is
    //     not an array."
    //   - the GraphQL step completes (however many, or few, transaction
    //     ids it names) and zero candidates survive the SAME per-candidate
    //     gateway-read-and-parse `search()` already performs — `EMPTY`.
    //     The query completed; nothing announced under this
    //     `discoveryTag` could be read back as a well-formed candidate, as
    //     far as this gateway reports.
    //   - at least one candidate survives — `FOUND`.
    //
    // REUSES THE EXISTING PRIMITIVES, NEVER A SECOND GATEWAY IMPLEMENTATION.
    // The GraphQL request itself is re-sent through `_searchAnnouncementTransactionIdsWithOutcome()`
    // (sibling, private, below) — the identical query `buildDiscoveryTagQuery()`
    // already builds — and each candidate is still read through
    // `_fetchAnnouncementEnvelope()`, completely unmodified, the SAME method
    // `search()` itself calls. No retry, no fallback, no second graphqlUrl
    // or gatewayUrl, no caching, no ranking — see this file's own header,
    // "deliberately excluded."
    async searchWithOutcome(discoveryTag) {
        const { succeeded, announcementIds } = await this._searchAnnouncementTransactionIdsWithOutcome(discoveryTag);
        if (!succeeded) {
            return { outcome: SnapshotCandidateDiscoveryOutcome.UNAVAILABLE, candidates: [] };
        }

        const candidates = [];
        for (const announcementId of announcementIds) {
            const envelope = await this._fetchAnnouncementEnvelope(announcementId);
            if (envelope === null) {
                continue;
            }
            const candidate = { contentHash: envelope.contentHash, locator: envelope.locator, storage: envelope.storage };
            if (envelope.publicationId !== undefined) {
                candidate.publicationId = envelope.publicationId;
                candidate.claimedPosition = envelope.claimedPosition;
            }
            candidates.push(candidate);
        }

        return {
            outcome: candidates.length > 0 ? SnapshotCandidateDiscoveryOutcome.FOUND : SnapshotCandidateDiscoveryOutcome.EMPTY,
            candidates
        };
    }

    // Pure I/O, private. Duplicated from `application/
    // ArweaveGraphqlDiscoveryQueryService.js`'s own identically-named
    // method rather than shared — see this file's own header, "a
    // standalone class." Resolves to the list of Arweave transaction ids
    // the gateway reports carrying this service's own `tagName` set to
    // `discoveryTag`, or `[]` for any failure — never throws.
    async _searchAnnouncementTransactionIds(discoveryTag) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(this._graphqlUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: buildDiscoveryTagQuery(this._tagName, discoveryTag, this._maxResults) }),
                signal: controller.signal
            });
        } catch {
            return [];
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            return [];
        }

        let body;
        try {
            body = await response.json();
        } catch {
            return [];
        }

        return parseTransactionIds(body);
    }

    // Pure I/O, private. The outcome-aware sibling of
    // `_searchAnnouncementTransactionIds()` immediately above — see this
    // file's own `searchWithOutcome()` header, "the GraphQL step alone
    // decides." Sends the IDENTICAL GraphQL POST that method already
    // sends, but reports whether the GraphQL step itself completed,
    // rather than collapsing every failure to the same `[]` a genuine
    // zero-transaction response also produces. Resolves to
    // `{ succeeded: true, announcementIds }` when the request sent,
    // returned a 2xx response, the body parsed as JSON, and that body's
    // own `data.transactions.edges` was an array (however many entries it
    // held, including zero) — resolves to
    // `{ succeeded: false, announcementIds: [] }` for a throwing fetch, a
    // non-2xx response, an unparseable body, or a body whose own shape
    // does not describe a transactions/edges list at all. Never throws.
    async _searchAnnouncementTransactionIdsWithOutcome(discoveryTag) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(this._graphqlUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: buildDiscoveryTagQuery(this._tagName, discoveryTag, this._maxResults) }),
                signal: controller.signal
            });
        } catch {
            return { succeeded: false, announcementIds: [] };
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            return { succeeded: false, announcementIds: [] };
        }

        let body;
        try {
            body = await response.json();
        } catch {
            return { succeeded: false, announcementIds: [] };
        }

        if (!hasWellFormedTransactionsShape(body)) {
            return { succeeded: false, announcementIds: [] };
        }

        return { succeeded: true, announcementIds: parseTransactionIds(body) };
    }

    // Pure I/O, private. Fetches `<gatewayUrl>/<transactionId>` and decodes
    // it as a Snapshot Discovery Envelope via the existing, unmodified
    // `parseSnapshotDiscoveryEnvelope()`. Resolves to the described
    // envelope, or `null` for a non-2xx response, an oversized response, or
    // a response that fails to describe as a well-formed envelope; never
    // throws — a genuine fetch failure is caught here too, so that one
    // unreachable or malformed announcement never turns this service's own
    // `search()` into a rejection or discards another announcement's own
    // candidate.
    async _fetchAnnouncementEnvelope(transactionId) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        let response;
        try {
            response = await this._fetch(`${this._gatewayUrl}/${transactionId}`, {
                method: 'GET',
                signal: controller.signal
            });
        } catch {
            return null;
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            return null;
        }

        const declaredLength = responseContentLength(response);
        if (declaredLength !== null && declaredLength > this._maxEnvelopeBytes) {
            return null;
        }

        let text;
        try {
            text = await response.text();
        } catch {
            return null;
        }
        if (byteLength(text) > this._maxEnvelopeBytes) {
            return null;
        }

        return parseSnapshotDiscoveryEnvelope(text);
    }
}

ArweaveSnapshotDiscoveryQueryService.DEFAULT_GRAPHQL_URL = DEFAULT_GRAPHQL_URL;
ArweaveSnapshotDiscoveryQueryService.DEFAULT_GATEWAY_URL = DEFAULT_GATEWAY_URL;
ArweaveSnapshotDiscoveryQueryService.DEFAULT_TAG_NAME = DEFAULT_TAG_NAME;

// Pure. Builds the GraphQL query body matching Arweave's own documented
// `transactions(tags: [{ name, values }])` schema — byte-for-byte the same
// private helper `application/arweave/ArweaveGraphqlDiscoveryQueryService.js`
// already defines for itself, duplicated rather than imported; see this
// file's own header, "a standalone class."
function buildDiscoveryTagQuery(tagName, discoveryTag, maxResults) {
    return 'query { transactions(tags: [{ name: ' + JSON.stringify(tagName)
        + ', values: [' + JSON.stringify(discoveryTag) + '] }], first: ' + maxResults + ') '
        + '{ edges { node { id } } } }';
}

// Pure. Extracts transaction ids out of a parsed GraphQL response body.
// Returns `[]`, never throws, for any response that does not carry the
// exact `data.transactions.edges[].node.id` shape this class expects.
function parseTransactionIds(body) {
    const edges = body && body.data && body.data.transactions && Array.isArray(body.data.transactions.edges)
        ? body.data.transactions.edges
        : null;
    if (edges === null) {
        return [];
    }

    const ids = [];
    for (const edge of edges) {
        const id = edge && edge.node && typeof edge.node.id === 'string' ? edge.node.id : null;
        if (id === null || id.length === 0) {
            continue;
        }
        ids.push(id);
    }
    return ids;
}

// Pure. 0.9.591 — the shape check `_searchAnnouncementTransactionIdsWithOutcome()`
// (private, above) uses to tell "the GraphQL step completed, however few
// transactions it named" apart from "the GraphQL step returned something
// this class does not recognize as a transactions/edges list at all." The
// IDENTICAL structural condition `parseTransactionIds()` immediately above
// already tests before falling back to `[]` — duplicated as a standalone
// predicate rather than refactoring that function, so `search()` and its
// own `parseTransactionIds()` call stay completely unmodified, byte for
// byte, by this milestone.
function hasWellFormedTransactionsShape(body) {
    return Boolean(body && body.data && body.data.transactions && Array.isArray(body.data.transactions.edges));
}

// Pure. Byte-for-byte the same private helper `application/
// ArweaveGraphqlDiscoveryQueryService.js` already defines for itself — not
// imported from it; see this file's own header, "a standalone class"
// convention this whole family already follows.
function responseContentLength(response) {
    const headers = response && response.headers;
    if (!headers || typeof headers.get !== 'function') {
        return null;
    }
    const raw = headers.get('content-length');
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

// Pure. The actual decoded byte length of a string.
function byteLength(text) {
    return new TextEncoder().encode(text).byteLength;
}
