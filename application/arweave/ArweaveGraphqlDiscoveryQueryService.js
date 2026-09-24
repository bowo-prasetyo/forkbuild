import { DecentralizedDiscoveryQueryService } from '../discovery/DecentralizedWorldDiscoveryQuery.js';
import { parseDecentralizedDiscoveryEnvelope } from '../../core/DecentralizedDiscoveryEnvelope.js';
import { responseContentLength, byteLength } from '../../utils/responseSize.js';

const DEFAULT_GRAPHQL_URL = 'https://arweave.net/graphql';
// Deliberately the same host ArweaveWorldEncounterMaterialResolver.js's own
// DEFAULT_GATEWAY_URL already uses — duplicated, never imported; see this
// file's own 0.9.494 header, "one additional gateway fetch."
const DEFAULT_GATEWAY_URL = 'https://arweave.net';
const DEFAULT_TAG_NAME = 'ForkBuild-Discovery-Tag';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESULTS = 20;
// Deliberately the same magnitude ArweaveWorldEncounterMaterialResolver.js's
// own DEFAULT_MAX_RESPONSE_BYTES already uses — this file's own constant,
// never imported from that one; an announcement envelope is small JSON, but
// the ceiling exists for the identical reason that file's own header gives.
const DEFAULT_MAX_ENVELOPE_BYTES = 48 * 1024;
const URI_SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//;

// 0.9.25 — Decentralized Discovery Query Adapter (concrete service).
//
// `application/discovery/DecentralizedWorldDiscoveryQuery.js` named the seam a
// concrete `DecentralizedDiscoveryQueryService` plugs into; this is the
// first one. Arweave's own GraphQL gateway (`arweave.net/graphql`) is a
// free, public, no-API-key endpoint that already indexes every
// transaction's arbitrary key/value Tags — exactly the primitive a
// ForkBuild discovery tag needs, with nothing to stand up or pay for.
//
// A ForkBuild publisher wanting to be found this way tags their own
// Arweave transaction with `{ name: "ForkBuild-Discovery-Tag",
// value: "<discoveryTag>" }` at upload time — this class never writes a
// transaction or a tag of any kind; it only ever reads what one already
// carries.
//
// AMENDED BY 0.9.494 — ARWEAVE ENVELOPE-AWARE DISCOVERY URI RESOLUTION.
// `tests/ArweaveDiscoveryUriIdentityBoundaryAudit.test.js` (0.9.493) proved,
// live, that `search()` reporting an ANNOUNCEMENT transaction's own id as a
// candidate's `uri` is a real identity violation: `core/
// DecentralizedWorldDiscoveryLead.js`'s own contract requires a candidate's
// `uri` to already be the announced MATERIAL's own retrieval location (that
// audit's own Section A), exactly what `NostrDiscoveryQueryService.js`
// already reports for Nostr (Section B) and what this class, until now,
// never did for Arweave (Section F). This class's own GraphQL step is
// UNCHANGED — it still finds every transaction tagged with this service's
// own `tagName`/`discoveryTag` pair, and the GraphQL response still carries
// no transaction data of its own (that audit's own Section C). What
// changes is what happens next: for each transaction the GraphQL step
// finds, this class now performs one additional raw gateway fetch — the
// exact `GET <gatewayUrl>/<transaction-id>` primitive `application/
// ArweaveWorldEncounterMaterialResolver.js` already ships and this codebase
// has already proven correct for content retrieval — decodes the signed
// publication envelope it returns via the existing, unmodified
// `core/DecentralizedDiscoveryEnvelope.js#parseDecentralizedDiscoveryEnvelope()`,
// and reports THAT envelope's own claimed `uri`, never the announcement
// transaction's id, as the candidate's `uri`:
//
//   discoveryTag
//         │
//         ▼
//   POST https://arweave.net/graphql   (UNCHANGED — this class's own
//        { transactions(tags: [...]) { edges { node { id } } } }    original step)
//         │
//         ▼
//   [ <announcement-transaction-id>, ... ]
//         │
//         │   for each id — NEW, 0.9.494
//         ▼
//   GET <gatewayUrl>/<announcement-transaction-id>
//         │
//         ▼
//   parseDecentralizedDiscoveryEnvelope(rawText)   (core/
//        DecentralizedDiscoveryEnvelope.js, 0.9.30, unmodified)
//         │
//         ▼
//   { uri: envelope.uri, storage: <scheme of envelope.uri>,
//     announcementId: <announcement-transaction-id> }
//
// THE ANNOUNCEMENT TRANSACTION ID IS NEVER DISCARDED — IT RIDES ALONGSIDE
// THE MATERIAL URI, NEVER IN PLACE OF IT. That audit's own Section D proved
// this is possible with zero schema change: `core/
// DecentralizedWorldDiscoveryLead.js`'s own `describeDecentralizedWorldDiscoveryLead()`
// already tolerates, and silently drops, an unrecognized extra field, so a
// raw candidate carrying `announcementId` alongside the correct material
// `uri` breaks nothing downstream today and is available to any future
// caller that wants it.
//
// A TRANSACTION WHOSE ENVELOPE IS UNAVAILABLE OR MALFORMED IS SKIPPED,
// NEVER REPORTED WITH ITS OWN ID SUBSTITUTED AS A FALLBACK URI. Recreating
// that fallback is exactly the identity violation 0.9.493 identified in the
// first place. A non-2xx gateway response, an oversized response, a
// response that is not valid JSON, and a response that fails
// `parseDecentralizedDiscoveryEnvelope()`'s own well-formedness check are
// all "this transaction cannot establish a material uri" — indistinguishable
// from each other, and from the transaction never having been found at all;
// this class carries no `retry`/`unavailable` distinction of its own for a
// per-candidate envelope fetch, the identical "no finer-grained split"
// restraint this file's own pre-0.9.494 header already held for the
// GraphQL step. One bad candidate is silently skipped, never invalidating
// the batch — the same restraint `NostrDiscoveryQueryService.js`'s own
// `search()` already holds for an event whose `content` fails to parse.
//
// STILL NEVER THROWS — EVERY FAILURE, AT EITHER STEP, DEGRADES TO `[]` OR TO
// FEWER CANDIDATES THAN TRANSACTIONS FOUND. A network failure, a timeout, a
// non-2xx response, and an unparseable body remain indistinguishable to a
// caller at the GraphQL step exactly as before 0.9.494; the new per-
// candidate gateway fetch holds the identical contract for itself, one
// transaction at a time, so that a single unreachable or malformed
// announcement never turns an otherwise-successful search into a rejection.
//
// `gatewayUrl` IS A NEW, SEPARATE CONSTRUCTOR OPTION — NEVER DERIVED FROM
// `graphqlUrl`. `ArweaveWorldEncounterMaterialResolver.js`, `application/
// ArweaveAnnouncementPublisher.js`, and `application/
// ArweaveTaggedTransactionUpload.js` each already accept their own
// independent `gatewayUrl`, defaulting to the same `https://arweave.net`
// host their own callers already agree on by default — this class follows
// that exact precedent rather than string-parsing `graphqlUrl` (stripping
// a `/graphql` suffix that is not guaranteed to be there for a
// differently-shaped self-hosted gateway) to guess at one.
//
// `fetchImpl` IS AN INJECTION POINT, NOT A CONVENIENCE — the same
// `content/IpfsContentStore.js` / `anchoring/
// BitcoinEsploraTransactionBroadcaster.js` pattern this codebase already
// runs its other real-network adapters through, for the identical
// reason: `tests/ArweaveGraphqlDiscoveryQueryService.test.js` supplies a
// fake one, so this file's own wire behavior is fully covered without
// ever making a real network call, and without this codebase's own test
// suite ever depending on `arweave.net` being reachable or the free
// service's own uptime. The SAME injected `fetchImpl` now serves both the
// GraphQL POST and the per-candidate gateway GET — one transport
// collaborator, exactly the shape `ArweaveWorldEncounterMaterialResolver.js`
// and `application/arweave/ArweaveTaggedTransactionUpload.js` already expect for
// their own gateway calls.
//
// `origin` NAMES THE GATEWAY URL, NEVER A RESULT'S OWN `id`. Two
// instances pointed at two different Esplora-style gateways (Arweave has
// several public, independently-run ones) report two different
// `origin`s even for the identical `discoveryTag` — exactly 0.9.25's own
// orchestration-layer rule that `origin` names the service, never
// anything the service returns. `origin` still names only `graphqlUrl` —
// unchanged by 0.9.494; the new `gatewayUrl` is a second collaborator this
// service reads from, never a second identity it reports itself as.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Publishing or tagging an Arweave transaction.** This class only
//   ever reads; see "A ForkBuild publisher... this class never writes,"
//   above. `application/arweave/ArweaveAnnouncementPublisher.js` and `application/
//   ArweaveTaggedTransactionUpload.js` are untouched by 0.9.494.
// - **Any change to `core/DecentralizedWorldDiscoveryLead.js`'s own
//   schema.** 0.9.493 Section D already proved none is required for
//   `announcementId` to ride alongside a candidate's `uri`.
// - **Any change to `application/worldEncounter/ArweaveWorldEncounterMaterialResolver.js`
//   or `application/worldEncounter/DecentralizedWorldEncounterMaterialSource.js`.** 0.9.493
//   Section E already proved both already do the right thing, unmodified,
//   the instant a candidate names the right location.
// - **Any change to `application/nostr/NostrDiscoveryQueryService.js`.** Nostr
//   already satisfies the discovery contract this milestone brings Arweave
//   into line with; see 0.9.493 Section B.
// - **Retries, fallback gateways, or caching for the new per-candidate
//   envelope fetch.** See "no caching, no retry, no fallback between
//   gateways," below — held here for the new fetch exactly as it already
//   was for the GraphQL step.
// - **Pagination beyond one page of results.** `first: maxResults` caps
//   a single request; a `discoveryTag` matching more transactions than
//   that simply reports the first page, never a second request chained
//   automatically.
export class ArweaveGraphqlDiscoveryQueryService extends DecentralizedDiscoveryQueryService {
    // graphqlUrl: which Arweave GraphQL gateway to query — defaults to
    //   Arweave's own `arweave.net/graphql`, but any Esplora-style public
    //   or self-hosted gateway speaking the identical schema works.
    // gatewayUrl: which Arweave gateway serves raw transaction data at
    //   `<gatewayUrl>/<transaction-id>`, used to fetch and decode each
    //   discovered transaction's own signed publication envelope — see
    //   this file's own 0.9.494 header, "gatewayUrl is a new, separate
    //   constructor option." Defaults to the same `arweave.net` host
    //   `application/worldEncounter/ArweaveWorldEncounterMaterialResolver.js` already
    //   defaults to.
    // tagName: which transaction Tag NAME a discovery tag is matched
    //   against — defaults to a ForkBuild-specific tag name so this
    //   class never matches an unrelated application's own tagging
    //   convention by accident.
    // fetchImpl: see this file's own header, "fetchImpl is an injection
    //   point."
    // maxEnvelopeBytes: the retrieval safety ceiling applied to each
    //   per-candidate envelope fetch; see this file's own 0.9.494 header.
    constructor({
        graphqlUrl = DEFAULT_GRAPHQL_URL,
        gatewayUrl = DEFAULT_GATEWAY_URL,
        tagName = DEFAULT_TAG_NAME,
        fetchImpl = null,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxResults = DEFAULT_MAX_RESULTS,
        maxEnvelopeBytes = DEFAULT_MAX_ENVELOPE_BYTES
    } = {}) {
        super();
        this._graphqlUrl = graphqlUrl;
        this._gatewayUrl = (typeof gatewayUrl === 'string' && gatewayUrl.trim().length > 0 ? gatewayUrl : DEFAULT_GATEWAY_URL).replace(/\/+$/, '');
        this._tagName = tagName;
        this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        if (typeof this._fetch !== 'function') {
            throw new Error('ArweaveGraphqlDiscoveryQueryService: no fetch implementation available — pass fetchImpl explicitly');
        }
        this._timeoutMs = timeoutMs;
        this._maxResults = Number.isInteger(maxResults) && maxResults > 0 ? maxResults : DEFAULT_MAX_RESULTS;
        this._maxEnvelopeBytes = Number.isInteger(maxEnvelopeBytes) && maxEnvelopeBytes > 0 ? maxEnvelopeBytes : DEFAULT_MAX_ENVELOPE_BYTES;
    }

    get origin() {
        return `dweb:arweave-graphql:${this._graphqlUrl}`;
    }

    get graphqlUrl() { return this._graphqlUrl; }
    get gatewayUrl() { return this._gatewayUrl; }

    // Resolves to `[{ uri, storage, announcementId }, ...]` — `uri` is the
    // announced MATERIAL's own claimed location (the discovered
    // transaction's own signed envelope's own `uri`), `storage` is read off
    // that same uri's own scheme, and `announcementId` is the Arweave
    // announcement transaction id that carried the claim, preserved
    // alongside it. A transaction the GraphQL step finds whose envelope is
    // unavailable or malformed is silently skipped — never reported with
    // its own id substituted as a fallback uri; see this file's own 0.9.494
    // header. Resolves to `[]`, never throws — see this file's own header,
    // "never throws."
    async search(discoveryTag) {
        const announcementIds = await this._searchAnnouncementTransactionIds(discoveryTag);

        const candidates = [];
        for (const announcementId of announcementIds) {
            const envelope = await this._fetchAnnouncementEnvelope(announcementId);
            if (envelope === null) {
                continue;
            }
            candidates.push({
                uri: envelope.uri,
                storage: extractUriScheme(envelope.uri),
                announcementId
            });
        }
        return candidates;
    }

    // Pure I/O, private. The original 0.9.25 GraphQL step, unchanged in
    // behavior: resolves to the list of Arweave transaction ids the
    // gateway reports carrying this service's own `tagName` set to
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

    // Pure I/O, private. Fetches `<gatewayUrl>/<transactionId>` — the same
    // primitive `ArweaveWorldEncounterMaterialResolver.js` already ships —
    // and decodes it as a ForkBuild discovery envelope via the existing,
    // unmodified `parseDecentralizedDiscoveryEnvelope()`. Resolves to the
    // described envelope, or `null` for a non-2xx response, an oversized
    // response, or a response that fails to describe as a well-formed
    // envelope; never throws — a genuine fetch failure is caught here too,
    // so that one unreachable announcement never turns this service's own
    // `search()` into a rejection (see this file's own 0.9.494 header,
    // "still never throws").
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

        return parseDecentralizedDiscoveryEnvelope(text);
    }
}

ArweaveGraphqlDiscoveryQueryService.DEFAULT_GRAPHQL_URL = DEFAULT_GRAPHQL_URL;
ArweaveGraphqlDiscoveryQueryService.DEFAULT_GATEWAY_URL = DEFAULT_GATEWAY_URL;
ArweaveGraphqlDiscoveryQueryService.DEFAULT_TAG_NAME = DEFAULT_TAG_NAME;

// Pure. Builds the GraphQL query body matching Arweave's own documented
// `transactions(tags: [{ name, values }])` schema — see this file's own
// header for the request/response shape.
function buildDiscoveryTagQuery(tagName, discoveryTag, maxResults) {
    return 'query { transactions(tags: [{ name: ' + JSON.stringify(tagName)
        + ', values: [' + JSON.stringify(discoveryTag) + '] }], first: ' + maxResults + ') '
        + '{ edges { node { id } } } }';
}

// Pure. Extracts transaction ids out of a parsed GraphQL response body.
// Returns `[]`, never throws, for any response that does not carry the
// exact `data.transactions.edges[].node.id` shape this class expects — a
// malformed or unexpected gateway response degrades to "nothing found,"
// never a crash.
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

// Pure. Reads the `scheme` a `scheme://...` uri names — byte-for-byte the
// same private helper `application/nostr/NostrDiscoveryQueryService.js` already
// defines for itself, duplicated rather than imported per this whole
// family's own "two independent files" convention. Returns `null` for a
// uri with no recognizable `scheme://` prefix.
function extractUriScheme(uri) {
    const match = URI_SCHEME_PATTERN.exec(uri);
    return match ? match[1] : null;
}
