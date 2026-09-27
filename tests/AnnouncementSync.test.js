import { AnnouncementIndex } from '../application/announcementIndex/AnnouncementIndex.js';
import { AnnouncementKind } from '../application/announcementIndex/AnnouncementKinds.js';
import { AnnouncementSyncCursorStore } from '../application/announcementIndex/AnnouncementSyncCursorStore.js';
import { AnnouncementSync } from '../application/announcementIndex/AnnouncementSync.js';
import { syncNostrTag } from '../application/announcementIndex/NostrTagSync.js';
import { syncArweaveTag } from '../application/announcementIndex/ArweaveTagSync.js';
import { snapshotSyncTarget, commentarySyncTarget, placeNamingSyncTarget, SNAPSHOT_DISCOVERY_TAG } from '../application/announcementIndex/AnnouncementSyncTargets.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Announcement Index, Phase 3 (docs/AnnouncementIndex.md): sync cursors page
// each substrate until every announcement under a tag has been read, however
// far past a single page the backlog goes, and across runs.

function snapshotEnvelope(n) {
    return JSON.stringify({ protocol: 'forkbuild-snapshot-discovery', version: 1, contentHash: `hash-${n}`, locator: `ar://tx-${n}`, storage: 'ar' });
}

// A relay that pages like a real one: newest first, `since`/`until`
// inclusive, and a server-side cap that may be below the requested limit.
function makeRelay({ cap = Infinity } = {}) {
    const events = [];
    const filters = [];
    let failing = false;
    return {
        filters,
        add(created_at, content, tag = SNAPSHOT_DISCOVERY_TAG) {
            events.push({ id: `e${events.length}`, kind: 1, created_at, content, tags: [['t', tag]] });
        },
        fail(value = true) { failing = value; },
        queryImpl: async (_relayUrl, filter) => {
            if (failing) throw new Error('relay down');
            filters.push(filter);
            const tag = filter['#t'][0];
            return events
                .filter((e) => filter.kinds.includes(e.kind) && e.tags.some(([n, v]) => n === 't' && v === tag))
                .filter((e) => filter.since === undefined || e.created_at >= filter.since)
                .filter((e) => filter.until === undefined || e.created_at <= filter.until)
                .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))
                .slice(0, Math.min(filter.limit, cap));
        }
    };
}

// A GraphQL gateway sorted HEIGHT_DESC with opaque edge cursors.
function makeGateway() {
    const transactions = []; // newest first
    const queries = [];
    const bodies = new Map();
    function respond(status, body) {
        const text = typeof body === 'string' ? body : JSON.stringify(body);
        return { ok: status < 300, status, headers: { get: () => null }, json: async () => JSON.parse(text), text: async () => text };
    }
    return {
        queries,
        add(id, body) { transactions.unshift(id); bodies.set(id, body); },
        fetchImpl: async (url, init) => {
            if (url.endsWith('/graphql')) {
                const query = JSON.parse(init.body).query;
                queries.push(query);
                const first = Number(/first: (\d+)/.exec(query)[1]);
                const afterMatch = /after: "([^"]+)"/.exec(query);
                const start = afterMatch ? transactions.indexOf(afterMatch[1].slice('c-'.length)) + 1 : 0;
                const slice = transactions.slice(start, start + first);
                return respond(200, { data: { transactions: {
                    pageInfo: { hasNextPage: start + first < transactions.length },
                    edges: slice.map((id) => ({ cursor: `c-${id}`, node: { id } }))
                } } });
            }
            const id = url.slice(url.lastIndexOf('/') + 1);
            return bodies.has(id) ? respond(200, bodies.get(id)) : respond(404, '');
        }
    };
}

function fresh() {
    const storage = new InMemoryStorageProvider();
    const index = new AnnouncementIndex({ storage, maxRecordsPerTag: 10000 });
    const cursorStore = new AnnouncementSyncCursorStore({ storage });
    return { index, cursorStore, target: snapshotSyncTarget({ index }) };
}

const hashes = (index) => new Set(index.list(AnnouncementKind.SNAPSHOT, SNAPSHOT_DISCOVERY_TAG).map((c) => c.contentHash));

async function syncUntilDone(run, maxRuns = 50) {
    let result;
    for (let i = 0; i < maxRuns; i++) {
        result = await run();
        if (result.caughtUp && result.backfillDone) return { result, runs: i + 1 };
    }
    throw new Error('sync never finished');
}

async function run() {
    // Section A: Nostr backfill reaches every event, across runs.
    {
        const relay = makeRelay();
        for (let n = 0; n < 250; n++) relay.add(1000 + n, snapshotEnvelope(n));
        const { index, cursorStore, target } = fresh();
        const sync = () => syncNostrTag({ queryImpl: relay.queryImpl, relayUrl: 'wss://r', target, cursorStore, pageSize: 50, maxPages: 2 });

        const first = await sync();
        // The second page starts at the first page's oldest second, so one event is read twice.
        assert(first.pages === 2 && hashes(index).size === 99, 'A1. one run reads at most maxPages pages, past the newest one');
        const { runs } = await syncUntilDone(sync);
        assert(hashes(index).size === 250, 'A2. repeated runs read every event, not just the newest page');
        assert(runs >= 2, 'A3. the backlog was read over several runs');
        console.log('✓ Section A: Nostr backfill reads the whole history');
    }

    // Section B: a relay capping pages below the limit is still read to the end.
    {
        const relay = makeRelay({ cap: 7 });
        for (let n = 0; n < 60; n++) relay.add(2000 + n, snapshotEnvelope(n));
        const { index, cursorStore, target } = fresh();
        await syncUntilDone(() => syncNostrTag({ queryImpl: relay.queryImpl, relayUrl: 'wss://r', target, cursorStore, pageSize: 50, maxPages: 5 }));
        assert(hashes(index).size === 60, 'B1. short pages are never mistaken for the end');
        console.log('✓ Section B: relay page caps below the limit are handled');
    }

    // Section C: new events after a sync are picked up, including more than
    // one run's budget of them, with nothing skipped in between.
    {
        const relay = makeRelay();
        for (let n = 0; n < 20; n++) relay.add(3000 + n, snapshotEnvelope(n));
        const { index, cursorStore, target } = fresh();
        const sync = () => syncNostrTag({ queryImpl: relay.queryImpl, relayUrl: 'wss://r', target, cursorStore, pageSize: 10, maxPages: 3 });
        await syncUntilDone(sync);
        for (let n = 20; n < 120; n++) relay.add(3000 + n, snapshotEnvelope(n));
        const next = await sync();
        assert(!next.caughtUp, 'C1. a burst larger than one run\'s budget leaves the head unfinished');
        await syncUntilDone(sync);
        assert(hashes(index).size === 120, 'C2. the next runs close the gap without skipping anything');

        const settledFilters = relay.filters.length;
        await sync();
        assert(relay.filters.length - settledFilters === 1, 'C3. once caught up, a run costs one query');
        console.log('✓ Section C: new events are read, and a large burst over several runs');
    }

    // Section D: many events in one second across page boundaries.
    {
        const relay = makeRelay();
        for (let n = 0; n < 15; n++) relay.add(5000, snapshotEnvelope(n));
        for (let n = 15; n < 30; n++) relay.add(4000 + n, snapshotEnvelope(n));
        const { index, cursorStore, target } = fresh();
        await syncUntilDone(() => syncNostrTag({ queryImpl: relay.queryImpl, relayUrl: 'wss://r', target, cursorStore, pageSize: 20, maxPages: 5 }));
        assert(hashes(index).size === 30, 'D1. events sharing a boundary second are all read when they fit one page');
        console.log('✓ Section D: page boundaries inside one second');
    }

    // Section E: Arweave pages with GraphQL cursors, backfill and head.
    {
        const gateway = makeGateway();
        for (let n = 0; n < 45; n++) gateway.add(`tx${n}`, snapshotEnvelope(n));
        const { index, cursorStore, target } = fresh();
        const sync = () => syncArweaveTag({ fetchImpl: gateway.fetchImpl, graphqlUrl: 'https://gw/graphql', gatewayUrl: 'https://gw', target, cursorStore, pageSize: 10, maxPages: 2 });
        await syncUntilDone(sync);
        assert(hashes(index).size === 45, 'E1. every transaction is read, page after page');
        assert(gateway.queries.every((q) => q.includes('sort: HEIGHT_DESC') && q.includes('"ForkBuild-Snapshot-Discovery-Tag"')), 'E2. queries are newest first, under the Snapshot tag name');

        for (let n = 45; n < 80; n++) gateway.add(`tx${n}`, snapshotEnvelope(n));
        await syncUntilDone(sync);
        assert(hashes(index).size === 80, 'E3. new transactions, more than one run\'s budget, are all read');
        const before = gateway.queries.length;
        await sync();
        assert(gateway.queries.length - before === 1, 'E4. once caught up, a run costs one GraphQL query');
        console.log('✓ Section E: Arweave head and backfill with GraphQL cursors');
    }

    // Section F: AnnouncementSync runs every substrate; one failing never stops the others.
    {
        const good = makeRelay();
        good.add(10, snapshotEnvelope('nostr'));
        const down = makeRelay();
        down.fail();
        const gateway = makeGateway();
        gateway.add('txA', snapshotEnvelope('arweave'));
        const { index, cursorStore } = fresh();
        const target = snapshotSyncTarget({ index, steemSource: { search: async () => [{ contentHash: 'hash-steem', locator: 'steem://x', storage: 'steem' }] } });
        const relays = { 'wss://good': good, 'wss://down': down };
        const sync = new AnnouncementSync({
            cursorStore,
            nostr: { queryImpl: (url, filter) => relays[url].queryImpl(url, filter), relayUrls: Object.keys(relays) },
            arweave: { fetchImpl: gateway.fetchImpl, graphqlUrl: 'https://gw/graphql', gatewayUrl: 'https://gw' }
        });
        const outcome = await sync.sync(target);
        assert(JSON.stringify([...hashes(index)].sort()) === JSON.stringify(['hash-arweave', 'hash-nostr', 'hash-steem']), 'F1. Nostr, Arweave and Steem results are all recorded');
        const failed = outcome.substrates.filter((s) => !s.ok);
        assert(failed.length === 1 && failed[0].endpoint === 'wss://down', 'F2. the failing relay is reported, and only it');
        const origins = index.list(AnnouncementKind.SNAPSHOT, SNAPSHOT_DISCOVERY_TAG).length;
        assert(origins === 3, 'F3. each record came from its own substrate');
        console.log('✓ Section F: every substrate syncs independently');
    }

    // Section G: Place Naming and Commentary targets.
    {
        const tag = derivePlaceNamingDiscoveryTag('world-1', 'region-1');
        const claimEnvelope = (id, regionId = 'region-1') => JSON.stringify({
            protocol: 'forkbuild-place-naming-discovery', version: 1, worldId: 'world-1', regionId,
            claim: { id, worldId: 'world-1', regionId, name: 'Old Oak', authorIdentityId: 'did:key:zA', createdAt: '2026-01-01T00:00:00.000Z',
                signature: { algorithm: 'ed25519', signer: 'did:key:zA', signature: `sig-${id}`, signedHash: 'h', domain: 'forkbuild.place-naming-claim' } }
        });
        const relay = makeRelay();
        relay.add(1, claimEnvelope('c1'), tag);
        relay.add(2, claimEnvelope('c2', 'region-2'), tag);
        const { index, cursorStore } = fresh();
        await syncNostrTag({ queryImpl: relay.queryImpl, relayUrl: 'wss://r', target: placeNamingSyncTarget({ index, tag }), cursorStore });
        const claims = index.list(AnnouncementKind.PLACE_NAMING, tag);
        assert(claims.length === 1 && claims[0].claim.id === 'c1', 'G1. Place Naming sync records claims for its region only');

        const imported = [];
        const commentary = commentarySyncTarget({
            importCommentaryEnvelope: (envelope) => {
                if (envelope.bad) throw new Error('unverifiable');
                imported.push(envelope.id);
            }
        });
        const commentRelay = makeRelay();
        commentRelay.add(1, JSON.stringify({ id: 'good' }), 'forkbuild-commentary');
        commentRelay.add(2, JSON.stringify({ id: 'forged', bad: true }), 'forkbuild-commentary');
        commentRelay.add(3, 'not json', 'forkbuild-commentary');
        await syncNostrTag({ queryImpl: commentRelay.queryImpl, relayUrl: 'wss://r', target: commentary, cursorStore });
        // A boundary event can be read twice; the Commentary store's save() is idempotent.
        assert(JSON.stringify([...new Set(imported)]) === JSON.stringify(['good']), 'G2. Commentary sync imports verified envelopes and skips the rest');
        console.log('✓ Section G: Place Naming and Commentary targets');
    }

    console.log('\nAll AnnouncementSync tests passed.');
}

run().catch((error) => {
    console.error('AnnouncementSync.test.js FAILED:', error);
    process.exitCode = 1;
});
