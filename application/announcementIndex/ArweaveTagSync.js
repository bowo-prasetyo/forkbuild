import { responseContentLength, byteLength } from '../../utils/responseSize.js';

export const DEFAULT_ARWEAVE_SYNC_PAGE_SIZE = 100;
export const DEFAULT_ARWEAVE_SYNC_MAX_PAGES = 5;
const DEFAULT_GRAPHQL_URL = 'https://arweave.net/graphql';
const DEFAULT_GATEWAY_URL = 'https://arweave.net';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_ENVELOPE_BYTES = 48 * 1024;
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
// How many of the newest transaction ids the cursor remembers, to tell
// where the previous run's head was.
const HEAD_IDS_KEPT = 50;

// Reads one gateway's transactions for one sync target until this device has
// seen every one (docs/AnnouncementIndex.md, "Phase 3"). GraphQL pages come
// newest first (HEIGHT_DESC), and each edge's `cursor` continues the next
// page. The cursor keeps:
//
//   headIds       the newest transaction ids already read
//   gap           { after, headIds } while newer transactions are still being
//                 paged down to the previous head
//   backfillAfter the page cursor where reading older transactions resumes
//   backfillDone  true once GraphQL reports no older page
//
// Each run reads at most `maxPages` GraphQL pages, and fetches each new
// transaction's body from the gateway, refusing one over the size cap.
export async function syncArweaveTag({
    fetchImpl = null,
    graphqlUrl = DEFAULT_GRAPHQL_URL,
    gatewayUrl = DEFAULT_GATEWAY_URL,
    target,
    cursorStore,
    pageSize = DEFAULT_ARWEAVE_SYNC_PAGE_SIZE,
    maxPages = DEFAULT_ARWEAVE_SYNC_MAX_PAGES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxEnvelopeBytes = DEFAULT_MAX_ENVELOPE_BYTES
}) {
    const fetchFn = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    if (typeof fetchFn !== 'function') throw new Error('syncArweaveTag: no fetch implementation available');
    const gateway = gatewayUrl.replace(/\/+$/, '');
    const cursorId = `arweave:${graphqlUrl}:${target.id}`;
    const cursor = { headIds: null, gap: null, backfillAfter: null, backfillDone: false, ...(cursorStore.get(cursorId) || {}) };
    let pages = 0;
    let received = 0;

    async function timed(url, init, handle) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await handle(await fetchFn(url, { ...init, signal: controller.signal }));
        } finally {
            clearTimeout(timer);
        }
    }

    async function fetchPage(after) {
        pages += 1;
        const body = await timed(graphqlUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: buildQuery(target.arweave.tagName, target.tag, pageSize, after) })
        }, async (response) => {
            if (!response.ok) throw new Error(`syncArweaveTag: GraphQL search failed (HTTP ${response.status})`);
            return response.json();
        });
        const transactions = body && body.data && body.data.transactions;
        if (!transactions || !Array.isArray(transactions.edges)) throw new Error('syncArweaveTag: GraphQL returned no transactions list');
        const edges = transactions.edges
            .map((edge) => ({ id: edge && edge.node && edge.node.id, cursor: edge && edge.cursor }))
            .filter((edge) => typeof edge.id === 'string' && TRANSACTION_ID_PATTERN.test(edge.id));
        const hasNextPage = Boolean(transactions.pageInfo && transactions.pageInfo.hasNextPage);
        const last = transactions.edges[transactions.edges.length - 1];
        return { edges, hasNextPage, endCursor: last && typeof last.cursor === 'string' ? last.cursor : null };
    }

    async function fetchBody(id) {
        try {
            return await timed(`${gateway}/${id}`, { method: 'GET' }, async (response) => {
                if (!response.ok) return null;
                const declared = responseContentLength(response);
                if (declared !== null && declared > maxEnvelopeBytes) return null;
                const text = await response.text();
                return byteLength(text) > maxEnvelopeBytes ? null : text;
            });
        } catch {
            return null;
        }
    }

    async function consume(edges) {
        const results = [];
        for (const edge of edges) {
            const text = await fetchBody(edge.id);
            const result = text === null ? null : target.arweave.parse(text);
            if (result !== null) results.push(result);
        }
        received += edges.length;
        if (results.length > 0) target.consume(results, 'arweave');
    }

    // Head: from the top (or where an unfinished head left off) down to the
    // previous run's newest ids.
    const known = new Set(cursor.headIds || []);
    while (pages < maxPages) {
        const page = await fetchPage(cursor.gap ? cursor.gap.after : null);
        const topIds = cursor.gap ? cursor.gap.headIds : page.edges.slice(0, HEAD_IDS_KEPT).map((edge) => edge.id);
        const knownAt = page.edges.findIndex((edge) => known.has(edge.id));
        const fresh = knownAt === -1 ? page.edges : page.edges.slice(0, knownAt);
        await consume(fresh);

        if (cursor.headIds === null) {
            // First run: the top page is the head; the rest is backfill.
            cursor.headIds = topIds;
            cursor.backfillAfter = page.endCursor;
            cursor.backfillDone = !page.hasNextPage;
            break;
        }
        if (knownAt !== -1 || !page.hasNextPage) {
            cursor.headIds = topIds.length > 0 ? topIds : cursor.headIds;
            cursor.gap = null;
            break;
        }
        cursor.gap = { after: page.endCursor, headIds: topIds };
    }

    // Backfill: older pages, until GraphQL reports none.
    while (!cursor.backfillDone && cursor.backfillAfter !== null && pages < maxPages) {
        const page = await fetchPage(cursor.backfillAfter);
        await consume(page.edges);
        cursor.backfillAfter = page.endCursor || cursor.backfillAfter;
        cursor.backfillDone = !page.hasNextPage || page.edges.length === 0;
    }

    cursorStore.set(cursorId, cursor);
    return { pages, received, caughtUp: cursor.gap === null && cursor.headIds !== null, backfillDone: cursor.backfillDone };
}

function buildQuery(tagName, tag, first, after) {
    return 'query { transactions(tags: [{ name: ' + JSON.stringify(tagName)
        + ', values: [' + JSON.stringify(tag) + '] }], first: ' + first
        + (after ? ', after: ' + JSON.stringify(after) : '')
        + ', sort: HEIGHT_DESC) { pageInfo { hasNextPage } edges { cursor node { id } } } }';
}
