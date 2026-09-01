import { DecentralizedDiscoveryQueryService } from './DecentralizedWorldDiscoveryQuery.js';

const DEFAULT_GRAPHQL_URL = 'https://arweave.net/graphql';
const DEFAULT_TAG_NAME = 'ForkBuild-Discovery-Tag';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESULTS = 20;

// 0.9.25 — Decentralized Discovery Query Adapter (concrete service).
//
// `application/DecentralizedWorldDiscoveryQuery.js` named the seam a
// concrete `DecentralizedDiscoveryQueryService` plugs into; this is the
// first one. Arweave's own GraphQL gateway (`arweave.net/graphql`) is a
// free, public, no-API-key endpoint that already indexes every
// transaction's arbitrary key/value Tags — exactly the primitive a
// ForkBuild discovery tag needs, with nothing to stand up or pay for.
// core/DecentralizedWorldDiscoveryLead.js's own header already used
// `ar://transaction-id` as its example uri; this class is what actually
// produces one.
//
//   discoveryTag
//         │
//         ▼
//   POST https://arweave.net/graphql
//        { query: transactions(tags: [{ name: "ForkBuild-Discovery-Tag",
//                                        values: [discoveryTag] }]) {
//                    edges { node { id } } } }
//         │
//         ▼
//   { data: { transactions: { edges: [ { node: { id } }, ... ] } } }
//         │
//         ▼
//   [ { uri: "ar://<id>", storage: "ar" }, ... ]
//
// A ForkBuild publisher wanting to be found this way tags their own
// Arweave transaction with `{ name: "ForkBuild-Discovery-Tag",
// value: "<discoveryTag>" }` at upload time — this class never writes a
// transaction or a tag of any kind; it only ever reads what one already
// carries.
//
// `fetchImpl` IS AN INJECTION POINT, NOT A CONVENIENCE — the same
// `content/IpfsContentStore.js` / `anchoring/
// BitcoinEsploraTransactionBroadcaster.js` pattern this codebase already
// runs its other real-network adapters through, for the identical
// reason: `tests/ArweaveGraphqlDiscoveryQueryService.test.js` supplies a
// fake one, so this file's own wire behavior is fully covered without
// ever making a real network call, and without this codebase's own test
// suite ever depending on `arweave.net` being reachable or the free
// service's own uptime.
//
// NEVER THROWS — EVERY FAILURE DEGRADES TO `[]`. A network failure, a
// timeout, a non-2xx response, an unparseable body, and a well-formed but
// empty result set are all indistinguishable to a caller: "this service
// currently has nothing to report." This class carries no
// `retry`/`unavailable` distinction of its own — that finer-grained
// split (`anchoring/BitcoinEsploraTransactionBroadcaster.js`'s own
// rejected-vs-unavailable shape) belongs to a write path reporting
// whether ONE specific operation succeeded; a discovery search asking
// "what's out there" has no such per-attempt verdict to preserve, so it
// collapses every failure the same way `application/
// DecentralizedWorldDiscoveryQuery.js` already treats a failed `search()`
// call: as zero leads, never as an error a caller must handle specially.
//
// `origin` NAMES THE GATEWAY URL, NEVER A RESULT'S OWN `id`. Two
// instances pointed at two different Esplora-style gateways (Arweave has
// several public, independently-run ones) report two different
// `origin`s even for the identical `discoveryTag` — exactly 0.9.25's own
// orchestration-layer rule that `origin` names the service, never
// anything the service returns.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Publishing or tagging an Arweave transaction.** This class only
//   ever reads; see "A ForkBuild publisher... this class never writes,"
//   above.
// - **Retrieving a candidate's own content from `arweave.net/<id>` or
//   anywhere else.** 0.9.27+, unscheduled — a lead is a rumor, not a
//   retrieval; see `core/DecentralizedWorldDiscoveryLead.js`'s own
//   header.
// - **Querying more than one Arweave gateway, or any non-Arweave
//   service.** `application/DecentralizedWorldDiscoveryQuery.js`'s own
//   "exactly one service per call" already forbids fan-out at the
//   orchestration layer; a second, differently-configured instance of
//   this same class is how a caller would try a different gateway, one
//   call at a time.
// - **Pagination beyond one page of results.** `first: maxResults` caps
//   a single request; a `discoveryTag` matching more transactions than
//   that simply reports the first page, never a second request chained
//   automatically.
export class ArweaveGraphqlDiscoveryQueryService extends DecentralizedDiscoveryQueryService {
    // graphqlUrl: which Arweave GraphQL gateway to query — defaults to
    //   Arweave's own `arweave.net/graphql`, but any Esplora-style public
    //   or self-hosted gateway speaking the identical schema works.
    // tagName: which transaction Tag NAME a discovery tag is matched
    //   against — defaults to a ForkBuild-specific tag name so this
    //   class never matches an unrelated application's own tagging
    //   convention by accident.
    // fetchImpl: see this file's own header, "fetchImpl is an injection
    //   point."
    constructor({
        graphqlUrl = DEFAULT_GRAPHQL_URL,
        tagName = DEFAULT_TAG_NAME,
        fetchImpl = null,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxResults = DEFAULT_MAX_RESULTS
    } = {}) {
        super();
        this._graphqlUrl = graphqlUrl;
        this._tagName = tagName;
        this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        if (typeof this._fetch !== 'function') {
            throw new Error('ArweaveGraphqlDiscoveryQueryService: no fetch implementation available — pass fetchImpl explicitly');
        }
        this._timeoutMs = timeoutMs;
        this._maxResults = Number.isInteger(maxResults) && maxResults > 0 ? maxResults : DEFAULT_MAX_RESULTS;
    }

    get origin() {
        return `dweb:arweave-graphql:${this._graphqlUrl}`;
    }

    get graphqlUrl() { return this._graphqlUrl; }

    // Resolves to `[{ uri: "ar://<id>", storage: "ar" }, ...]` for every
    // transaction the gateway reports carrying this service's own
    // `tagName` set to `discoveryTag`. Resolves to `[]`, never throws —
    // see this file's own header, "never throws."
    async search(discoveryTag) {
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

        return parseTransactionCandidates(body);
    }
}

ArweaveGraphqlDiscoveryQueryService.DEFAULT_GRAPHQL_URL = DEFAULT_GRAPHQL_URL;
ArweaveGraphqlDiscoveryQueryService.DEFAULT_TAG_NAME = DEFAULT_TAG_NAME;

// Pure. Builds the GraphQL query body matching Arweave's own documented
// `transactions(tags: [{ name, values }])` schema — see this file's own
// header for the request/response shape.
function buildDiscoveryTagQuery(tagName, discoveryTag, maxResults) {
    return 'query { transactions(tags: [{ name: ' + JSON.stringify(tagName)
        + ', values: [' + JSON.stringify(discoveryTag) + '] }], first: ' + maxResults + ') '
        + '{ edges { node { id } } } }';
}

// Pure. Extracts `{ uri, storage }` candidates out of a parsed GraphQL
// response body. Returns `[]`, never throws, for any response that does
// not carry the exact `data.transactions.edges[].node.id` shape this
// class expects — a malformed or unexpected gateway response degrades to
// "nothing found," never a crash.
function parseTransactionCandidates(body) {
    const edges = body && body.data && body.data.transactions && Array.isArray(body.data.transactions.edges)
        ? body.data.transactions.edges
        : null;
    if (edges === null) {
        return [];
    }

    const candidates = [];
    for (const edge of edges) {
        const id = edge && edge.node && typeof edge.node.id === 'string' ? edge.node.id : null;
        if (id === null || id.length === 0) {
            continue;
        }
        candidates.push({ uri: `ar://${id}`, storage: 'ar' });
    }
    return candidates;
}
