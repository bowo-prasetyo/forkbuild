const DEFAULT_GRAPHQL_URL = 'https://arweave.net/graphql';
const DEFAULT_TAG_NAME = 'ForkBuild-Discovery-Tag';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESULTS = 20;

// 0.9.631 — Arweave Tagged Transaction Search.
//
// tests/PublicationCommentaryArweaveDistributionBoundaryAudit.test.js
// (0.9.630) Section F named this exact gap: the GraphQL tag-search step
// `application/ArweaveGraphqlDiscoveryQueryService.js` already implements
// (its own private `_searchAnnouncementTransactionIds()`) is real and
// content-agnostic in principle, but is locked inside that class as a
// private INSTANCE method — requiring a fully constructed, LOCATOR-envelope
// -decoding service to reach it — unlike `nostr/NostrRelayQueryClient.js`'s
// own `createNostrRelayQueryClient()`, which is a standalone, importable
// function nothing else needs to be constructed around. That audit's own
// verdict: CONCRETE_PRODUCT_GAP, "small, but currently missing." This file
// is that missing standalone primitive — the Arweave counterpart, one layer
// below any envelope vocabulary, to Nostr's own raw query client.
//
//   discoveryTag
//        │
//        ▼
//   application/ArweaveTaggedTransactionSearch.js   ★ (THIS)
//        createArweaveTaggedTransactionSearch({ graphqlUrl, tagName, fetchImpl })
//             -> searchTaggedTransactionIds(discoveryTag)
//        │
//        ▼
//   POST <graphqlUrl>   { query: transactions(tags: [...]) { edges { node { id } } } }
//        │
//        ▼
//   string[]   (every matching transaction's own id, in the order the
//                gateway returned them)
//
// THE IDENTICAL GRAPHQL QUERY `application/ArweaveGraphqlDiscoveryQueryService.js`
// OWN `_searchAnnouncementTransactionIds()` ALREADY SENDS — duplicated here,
// never imported from it, the same "two independent files" convention this
// whole Arweave family already follows (see `application/
// ArweaveTaggedTransactionUpload.js`'s own header, "a new adapter, never a
// shared base class"). Neither file is widened to serve the other's own
// role; `ArweaveGraphqlDiscoveryQueryService` is untouched by this file.
//
// A TRANSACTION-ID PRODUCER, NEVER A CANDIDATE OR ENVELOPE OF ANY KIND. This
// file has no idea a `DecentralizedDiscoveryEnvelope`, a Commentary, a
// Publication, or a discovery lead exists — it imports nothing from
// `application/` or `core/` beyond its own scope, and returns bare
// transaction id strings only. Every semantic question — what a matching
// transaction's own bytes mean, whether they parse as anything at all, and
// what a caller should do about a candidate — stays entirely a caller's own
// job, exactly the restraint `nostr/NostrRelayQueryClient.js`'s own header
// already holds for a raw Nostr event.
//
// A GENUINE TRANSPORT FAILURE REJECTS — A MALFORMED-BUT-REACHABLE RESPONSE
// RESOLVES TO `[]`. This is a deliberate departure from
// `ArweaveGraphqlDiscoveryQueryService#_searchAnnouncementTransactionIds()`'s
// own "still never throws" restraint, chosen so this standalone primitive
// mirrors `nostr/NostrRelayQueryClient.js`'s own layer precisely: a socket
// (there) or a fetch (here) that never reaches the gateway at all — a
// network failure, or this file's own `timeoutMs` elapsing — rejects, never
// silently resolves `[]`, so "nothing matched" and "could not find out" stay
// distinguishable AT THIS LAYER, exactly as that file's own header already
// draws the same line one substrate over. A gateway that DID answer, but
// with a non-2xx status or a body that does not carry the expected
// `data.transactions.edges` shape, resolves to `[]` — an ordinary "no
// results this call could recognize," never a rejection, matching how a
// well-behaved, reachable relay's own zero-event `EOSE` is not a failure
// either. A caller one layer up (a future `discover()`) decides for itself
// whether a rejection here is worth surfacing, retrying, or swallowing —
// this file forms no opinion of its own.
//
// EVERY MATCHING ID IS RETURNED, NEVER DEDUPLICATED, NEVER VALIDATED BEYOND
// "a non-empty string." A malformed individual edge (a missing or empty
// `node.id`) is silently skipped — the same "one bad entry never corrupts
// the others" restraint every discovery-shaped class in this codebase
// already holds — never a thrown error for one malformed edge alongside
// otherwise-valid ones.
//
// EXACTLY ONE GRAPHQL ENDPOINT, ONE TAG NAME, PER INSTANCE — NO FAN-OUT, NO
// PAGINATION BEYOND ONE PAGE, NO RANKING. `maxResults` caps a single
// request exactly as `ArweaveGraphqlDiscoveryQueryService`'s own constructor
// option already does; a `discoveryTag` matching more transactions than
// that reports only the first page, never a second request chained
// automatically. The identical "one relay/gateway, one campaign, per
// instance" restraint every sibling in this family already holds.
//
// `fetchImpl` IS AN INJECTION POINT, NOT A CONVENIENCE — the same pattern
// every other real-network Arweave adapter in this codebase already uses,
// so this file's own tests never depend on `arweave.net`'s own uptime.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Publishing or tagging an Arweave transaction.** This file only ever
//   reads; see `application/ArweaveTaggedTransactionUpload.js` for the
//   write-side counterpart, untouched by this file.
// - **Fetching a matching transaction's own bytes.** This file returns ids
//   only; `content/ArweaveContentStore.js#get()` (unmodified) remains the
//   one place a caller fetches a transaction's own content, exactly as
//   `application/PublicationCommentaryArweaveDistribution.js` (this same
//   milestone) composes the two together.
// - **Any change to `application/ArweaveGraphqlDiscoveryQueryService.js`.**
//   That class's own envelope-decoding `search()` is untouched — this file
//   satisfies a new, narrower contract alongside it, never in place of it.
// - **Retries, fallback gateways, or caching.**
export function createArweaveTaggedTransactionSearch({
    graphqlUrl = DEFAULT_GRAPHQL_URL,
    tagName = DEFAULT_TAG_NAME,
    fetchImpl = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResults = DEFAULT_MAX_RESULTS
} = {}) {
    if (typeof graphqlUrl !== 'string' || graphqlUrl.trim().length === 0) {
        throw new Error('createArweaveTaggedTransactionSearch: a non-empty graphqlUrl is required');
    }
    if (typeof tagName !== 'string' || tagName.length === 0) {
        throw new Error('createArweaveTaggedTransactionSearch: a non-empty tagName is required');
    }
    const fetchFn = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    if (typeof fetchFn !== 'function') {
        throw new Error('createArweaveTaggedTransactionSearch: no fetch implementation available — pass fetchImpl explicitly');
    }
    const resolvedMaxResults = Number.isInteger(maxResults) && maxResults > 0 ? maxResults : DEFAULT_MAX_RESULTS;

    // searchTaggedTransactionIds(discoveryTag) -> Promise<string[]>. See
    // this file's own header for the complete contract: resolves with every
    // transaction id the gateway reports carrying `tagName` set to
    // `discoveryTag`, in the order returned, `[]` for a reachable gateway
    // that answered with nothing usable; rejects for a genuine transport
    // failure (including this instance's own timeout) — never silently `[]`.
    async function searchTaggedTransactionIds(discoveryTag) {
        if (typeof discoveryTag !== 'string' || discoveryTag.length === 0) {
            return [];
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
            response = await fetchFn(graphqlUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: buildDiscoveryTagQuery(tagName, discoveryTag, resolvedMaxResults) }),
                signal: controller.signal
            });
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

    return searchTaggedTransactionIds;
}

createArweaveTaggedTransactionSearch.DEFAULT_GRAPHQL_URL = DEFAULT_GRAPHQL_URL;
createArweaveTaggedTransactionSearch.DEFAULT_TAG_NAME = DEFAULT_TAG_NAME;
createArweaveTaggedTransactionSearch.DEFAULT_MAX_RESULTS = DEFAULT_MAX_RESULTS;

// Pure. Byte-for-byte the same query shape
// `ArweaveGraphqlDiscoveryQueryService.js`'s own private
// `buildDiscoveryTagQuery()` already builds — duplicated, never imported;
// see this file's own header, "a new adapter, never a shared base class."
function buildDiscoveryTagQuery(tagName, discoveryTag, maxResults) {
    return 'query { transactions(tags: [{ name: ' + JSON.stringify(tagName)
        + ', values: [' + JSON.stringify(discoveryTag) + '] }], first: ' + maxResults + ') '
        + '{ edges { node { id } } } }';
}

// Pure. Extracts transaction ids out of a parsed GraphQL response body.
// Returns `[]`, never throws, for any response that does not carry the
// exact `data.transactions.edges[].node.id` shape this file expects.
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
