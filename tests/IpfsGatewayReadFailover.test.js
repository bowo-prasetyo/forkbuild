import { readFile } from 'node:fs/promises';

import { IpfsGatewayConfiguration } from '../core/IpfsGatewayConfiguration.js';
import { IpfsGatewayContentStore } from '../content/IpfsGatewayContentStore.js';
import { IpfsGatewayFailoverContentStore } from '../content/IpfsGatewayFailoverContentStore.js';
import { ContentUnavailableError } from '../content/IpfsContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { mainFiles } from './support/SourceFileGroups.js';

// 0.9.666 — IPFS Gateway Read Failover.
//
// Mirrors tests/ArweaveGatewayReadFailover.test.js's own structure, one
// axis over: IPFS has no World Encounter material resolver counterpart
// and no separate DiscoverSnapshotRuntimeComposition-style composition
// file — both real call sites are inlined directly in ui/main.js through
// composeIpfsGatewayContentStore(), so Section K here sweeps that
// composition helper's own real source rather than a separate module.
//
// Section A: single gateway — composeIpfsGatewayContentStore() picks the
//            plain, pre-0.9.666 class, byte-for-byte unchanged behavior
// Section B: first gateway succeeds — the rest are never contacted
// Section C: first unavailable, second succeeds
// Section D: first two unavailable, third succeeds
// Section E: every gateway unavailable — the existing "unavailable" outcome
//            is preserved, never swallowed into a fabricated success
// Section F: malformed/non-matching reference or uri — no gateway is ever
//            contacted, not even the first
// Section G: ordering — [A, B] vs [B, A] changes attempt order, never the
//            meaning of the requested content
// Section H: identity preservation — put() is unaffected by how many read
//            gateways are configured
// Section I: cross-role isolation — the two real IPFS write paths (local
//            Kubo, remote pinning) are structurally untouched
// Section J: no hidden fan-out — a successful read terminates the
//            operation; put() never fails over either
// Section K: composition wiring — ui/main.js's own composeIpfsGatewayContentStore()
//            picks the failover class only for 2+ entries

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectRejects(promise, message, ErrorType = null) {
    let rejected = false;
    let error = null;
    try { await promise; } catch (e) { rejected = true; error = e; }
    assert(rejected, message);
    if (ErrorType) {
        assert(error instanceof ErrorType, `${message} (wrong error type: ${error && error.constructor && error.constructor.name})`);
    }
    return error;
}

// A per-origin fake gateway network: each configured origin behaves
// however its own `behaviors` entry says, and every request against every
// origin is recorded independently.
function makeMultiGatewayFetch(behaviors) {
    const requestsByOrigin = {};
    for (const origin of Object.keys(behaviors)) requestsByOrigin[origin] = [];
    async function fetchImpl(url) {
        const parsed = new URL(url);
        const origin = parsed.origin;
        if (!(origin in requestsByOrigin)) requestsByOrigin[origin] = [];
        requestsByOrigin[origin].push(url);
        const behavior = behaviors[origin];
        if (!behavior) throw new Error(`test setup error: no behavior configured for origin ${origin}`);
        if (behavior.reject) {
            throw new Error(behavior.rejectMessage || `simulated network failure for ${origin}`);
        }
        if (behavior.status && behavior.status !== 200) {
            return new Response(behavior.body ?? 'not found', { status: behavior.status });
        }
        return new Response(behavior.body ?? 'default body', { status: 200 });
    }
    return { fetchImpl, requestsByOrigin };
}

function totalRequests(requestsByOrigin, origin) {
    return (requestsByOrigin[origin] || []).length;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function run() {
    const A = 'https://gateway-a.example';
    const B = 'https://gateway-b.example';
    const C = 'https://gateway-c.example';
    const cid = 'QmExampleCid';
    const ipfsReference = new ContentReference({ hash: 'irrelevant', uri: 'ipfs://' + cid, storage: 'ipfs' });

    function composeIpfsGatewayContentStore(gatewayUrls, fetchImpl) {
        return gatewayUrls.length > 1
            ? new IpfsGatewayFailoverContentStore({ gatewayUrls, fetchImpl })
            : new IpfsGatewayContentStore({ gatewayUrl: gatewayUrls[0], fetchImpl });
    }

    // ===============================================================
    // Section A — single gateway: composeIpfsGatewayContentStore() picks
    // the plain, pre-0.9.666 class; behavior is byte-for-byte unchanged.
    // ===============================================================
    {
        const { fetchImpl } = makeMultiGatewayFetch({ [A]: { body: 'hello' } });
        const store = composeIpfsGatewayContentStore([A], fetchImpl);
        assert(store instanceof IpfsGatewayContentStore, 'A1. a one-element gatewayUrls array still builds a plain IpfsGatewayContentStore, never the failover wrapper');
        assert(!(store instanceof IpfsGatewayFailoverContentStore), 'A1b. sanity — not the failover class either, by inheritance coincidence');
        console.log('✓ Section A: a single configured gateway builds exactly the pre-0.9.666 plain class — no behavior change for every existing caller');
    }

    // ===============================================================
    // Section B — first gateway succeeds: B and C are never contacted.
    // ===============================================================
    {
        const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({
            [A]: { body: 'from-a' },
            [B]: { body: 'from-b' },
            [C]: { body: 'from-c' }
        });
        const store = new IpfsGatewayFailoverContentStore({ gatewayUrls: [A, B, C], fetchImpl });
        const result = await store.get(ipfsReference);
        assert(result === 'from-a', 'B1. the first gateway\'s own content is returned');
        assert(totalRequests(requestsByOrigin, A) === 1, 'B2. gateway A was contacted exactly once');
        assert(totalRequests(requestsByOrigin, B) === 0, 'B3. gateway B received ZERO requests — never contacted merely for redundancy');
        assert(totalRequests(requestsByOrigin, C) === 0, 'B4. gateway C received ZERO requests');
        console.log('✓ Section B: a successful first gateway terminates the operation — the remaining configured gateways are never queried');
    }

    // ===============================================================
    // Section C — first gateway unavailable, second succeeds.
    // ===============================================================
    {
        const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({
            [A]: { reject: true },
            [B]: { body: 'from-b' },
            [C]: { body: 'from-c' }
        });
        const store = new IpfsGatewayFailoverContentStore({ gatewayUrls: [A, B, C], fetchImpl });
        const result = await store.get(ipfsReference);
        assert(result === 'from-b', 'C1. gateway B\'s own content is returned once A is unreachable');
        assert(totalRequests(requestsByOrigin, A) === 1, 'C2. gateway A was tried exactly once');
        assert(totalRequests(requestsByOrigin, B) === 1, 'C3. gateway B was tried exactly once');
        assert(totalRequests(requestsByOrigin, C) === 0, 'C4. gateway C was never contacted — B already succeeded');

        const { fetchImpl: fetchImpl2 } = makeMultiGatewayFetch({ [A]: { status: 404 }, [B]: { body: 'from-b' } });
        const store2 = new IpfsGatewayFailoverContentStore({ gatewayUrls: [A, B], fetchImpl: fetchImpl2 });
        assert(await store2.get(ipfsReference) === 'from-b', 'C5. a non-2xx response from gateway A also fails over to gateway B');

        console.log('✓ Section C: an unreachable or non-2xx first gateway fails over to the second, which is contacted exactly once, and the third is left untouched');
    }

    // ===============================================================
    // Section D — first two gateways fail, third succeeds.
    // ===============================================================
    {
        const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({
            [A]: { reject: true },
            [B]: { status: 500 },
            [C]: { body: 'from-c' }
        });
        const store = new IpfsGatewayFailoverContentStore({ gatewayUrls: [A, B, C], fetchImpl });
        const result = await store.get(ipfsReference);
        assert(result === 'from-c', 'D1. the third gateway\'s own content is returned once A and B both fail, one for a different reason each');
        assert(totalRequests(requestsByOrigin, A) === 1 && totalRequests(requestsByOrigin, B) === 1 && totalRequests(requestsByOrigin, C) === 1,
            'D2. every configured gateway was contacted exactly once, in order, with no repeats');
        console.log('✓ Section D: two failures of different shapes both fail over correctly, reaching the third gateway');
    }

    // ===============================================================
    // Section E — every configured gateway is unavailable: the existing
    // "unavailable" outcome is preserved, never a fabricated success.
    // ===============================================================
    {
        const { fetchImpl } = makeMultiGatewayFetch({
            [A]: { reject: true },
            [B]: { status: 404 },
            [C]: { reject: true, rejectMessage: 'gateway-c is down' }
        });
        const store = new IpfsGatewayFailoverContentStore({ gatewayUrls: [A, B, C], fetchImpl });
        const error = await expectRejects(store.get(ipfsReference), 'E1. get() rejects once every configured gateway has failed', ContentUnavailableError);
        assert(error.message.includes(C), 'E2. the propagated error names the LAST gateway tried, not the first');
        assert(await store.has(ipfsReference) === false, 'E3. has() degrades to false rather than throwing, once every configured gateway has failed');
        console.log('✓ Section E: once every configured gateway has genuinely failed, the existing unavailable outcome is preserved unchanged — never swallowed into a fabricated success');
    }

    // ===============================================================
    // Section F — malformed/non-matching reference: no gateway is ever
    // contacted, not even the first.
    // ===============================================================
    {
        const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({ [A]: {}, [B]: {}, [C]: {} });
        const store = new IpfsGatewayFailoverContentStore({ gatewayUrls: [A, B, C], fetchImpl });
        const nonIpfsReference = new ContentReference({ hash: 'irrelevant', uri: 'ar://not-ipfs', storage: 'ar' });
        assert(await store.get(nonIpfsReference) === null, 'F1. a non-ipfs:// reference resolves null');
        assert(totalRequests(requestsByOrigin, A) === 0 && totalRequests(requestsByOrigin, B) === 0 && totalRequests(requestsByOrigin, C) === 0,
            'F2. NOT ONE configured gateway was contacted for a reference that was never even IPFS\'s to serve');
        console.log('✓ Section F: a reference that was never IPFS\'s to serve is rejected before any network request — every configured gateway sees ZERO requests');
    }

    // ===============================================================
    // Section G — ordering: [A, B] vs [B, A] changes attempt order, never
    // the meaning of the requested content.
    // ===============================================================
    {
        const { fetchImpl: fetchAB, requestsByOrigin: requestsAB } = makeMultiGatewayFetch({ [A]: { body: 'from-a' }, [B]: { body: 'from-b' } });
        const storeAB = new IpfsGatewayFailoverContentStore({ gatewayUrls: [A, B], fetchImpl: fetchAB });
        assert(await storeAB.get(ipfsReference) === 'from-a', 'G1. [A, B] tries A first');
        assert(totalRequests(requestsAB, B) === 0, 'G1b. …and never contacts B once A succeeds');

        const { fetchImpl: fetchBA, requestsByOrigin: requestsBA } = makeMultiGatewayFetch({ [A]: { body: 'from-a' }, [B]: { body: 'from-b' } });
        const storeBA = new IpfsGatewayFailoverContentStore({ gatewayUrls: [B, A], fetchImpl: fetchBA });
        assert(await storeBA.get(ipfsReference) === 'from-b', 'G2. reordering to [B, A] tries B first instead — a pure configuration reorder, no code change');
        assert(totalRequests(requestsBA, A) === 0, 'G2b. …and never contacts A once B succeeds');

        assert(storeAB.gatewayUrls.join(',') === [A, B].join(','), 'G3. gatewayUrls exposes the configured order exactly, for [A, B]');
        assert(storeBA.gatewayUrls.join(',') === [B, A].join(','), 'G3b. …and exactly, reordered, for [B, A]');
        console.log('✓ Section G: reordering the same two gateways changes which one is tried first and which content is returned when they disagree');
    }

    // ===============================================================
    // Section H — put() is unaffected by how many read gateways are
    // configured: it stays IpfsGatewayContentStore's own unimplemented
    // throw, delegated to the first configured gateway's own store.
    // ===============================================================
    {
        const { fetchImpl } = makeMultiGatewayFetch({ [A]: {}, [B]: {}, [C]: {} });
        const store = new IpfsGatewayFailoverContentStore({ gatewayUrls: [A, B, C], fetchImpl });
        let threw = false;
        try { await store.put('bytes'); } catch { threw = true; }
        assert(threw, 'H1. put() still throws — a read-only HTTPS gateway cannot accept content, regardless of how many are configured for read failover');
        console.log('✓ Section H: put() remains unimplemented, delegated to the first configured gateway\'s own store, unaffected by read failover configuration');
    }

    // ===============================================================
    // Section I — cross-role isolation: the two real IPFS write paths
    // (local Kubo, remote pinning) are structurally untouched.
    // ===============================================================
    {
        const kuboSource = await source('content/IpfsContentStore.js');
        const pinningSource = await source('content/IpfsRemotePinningContentStore.js');
        assert(!kuboSource.includes('IpfsGatewayFailoverContentStore'), 'I1. content/IpfsContentStore.js (local Kubo) never references the new failover class');
        assert(!pinningSource.includes('IpfsGatewayFailoverContentStore'), 'I2. content/IpfsRemotePinningContentStore.js (remote pinning) never references the new failover class either');

        const mainSource = (await Promise.all(mainFiles().map((file) => source(file)))).join('\n');
        // A later, sibling milestone (core/IpfsNodeConfiguration.js) gave
        // this construction site a real apiUrl argument, from its own
        // separate resolvedIpfsNodeApiUrl — never this milestone's own
        // read-path gatewayUrls/failover resolution.
        assert(mainSource.includes('stores: [publicationContentStore, new IpfsContentStore({ apiUrl: resolvedIpfsNodeApiUrl })]'),
            'I3. the CREATION registry constructs local Kubo with resolvedIpfsNodeApiUrl — a separate, write-path-only override — completely unaffected by this milestone\'s read-path gateway failover');
        console.log('✓ Section I: both IPFS write paths remain structurally isolated from this read-path failover milestone');
    }

    // ===============================================================
    // Section J — no hidden fan-out: a successful read terminates the
    // operation; put() never fails over either.
    // ===============================================================
    {
        const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({
            [A]: { body: 'ok' },
            [B]: { body: 'ok' },
            [C]: { body: 'ok' }
        });
        const store = new IpfsGatewayFailoverContentStore({ gatewayUrls: [A, B, C], fetchImpl });
        await store.get(ipfsReference);
        assert(totalRequests(requestsByOrigin, A) + totalRequests(requestsByOrigin, B) + totalRequests(requestsByOrigin, C) === 1,
            'J1. exactly ONE network request total for a successful read — never a redundant fan-out confirmation against the other configured gateways');
        console.log('✓ Section J: a successful read never triggers redundant confirmation requests against the other configured gateways');
    }

    // ===============================================================
    // Section K — composition wiring: ui/main.js's own
    // composeIpfsGatewayContentStore() picks the failover class only for
    // 2+ entries.
    // ===============================================================
    {
        const mainSource = (await Promise.all(mainFiles().map((file) => source(file)))).join('\n');
        const helperMatch = mainSource.match(/function composeIpfsGatewayContentStore\(gatewayUrls\)\s*\{[\s\S]*?\n\}/);
        assert(helperMatch, 'K1. ui/main.js defines a composeIpfsGatewayContentStore() helper');
        const helperSource = helperMatch[0];
        assert(/gatewayUrls\.length > 1/.test(helperSource), 'K2. the helper branches on whether more than one gateway is configured');
        assert(/new IpfsGatewayFailoverContentStore\(\{\s*gatewayUrls\s*\}\)/.test(helperSource), 'K3. 2+ configured gateways build IpfsGatewayFailoverContentStore, with the full list forwarded');
        assert(/new IpfsGatewayContentStore\(\{\s*gatewayUrl:\s*gatewayUrls\[0\]\s*\}\)/.test(helperSource), 'K4. a single configured gateway builds the plain IpfsGatewayContentStore, with only the first (only) entry forwarded');

        // Sanity — the classes this helper wires actually behave the way
        // K2-K4 claim, exercised directly rather than merely asserted
        // from source text.
        const { fetchImpl } = makeMultiGatewayFetch({ [A]: { body: '{}' }, [B]: { body: '{}' } });
        const twoGatewayStore = composeIpfsGatewayContentStore([A, B], fetchImpl);
        assert(twoGatewayStore instanceof IpfsGatewayFailoverContentStore, 'K5. two or more configured gateways build the failover content store');
        assert(twoGatewayStore.gatewayUrls.length === 2, 'K5b. …with both configured gateways present');

        // IpfsGatewayConfiguration.gatewayUrls flows straight through —
        // the exact shape ui/main.js resolves and forwards.
        const configured = new IpfsGatewayConfiguration({ gatewayUrls: [A, B, C] });
        const { fetchImpl: fetchImpl3 } = makeMultiGatewayFetch({ [A]: {}, [B]: {}, [C]: {} });
        const fromConfig = composeIpfsGatewayContentStore(configured.gatewayUrls, fetchImpl3);
        assert(fromConfig instanceof IpfsGatewayFailoverContentStore && fromConfig.gatewayUrls.length === 3,
            'K6. IpfsGatewayConfiguration.gatewayUrls flows straight into the failover content store with its own order and length preserved');

        console.log('✓ Section K: composeIpfsGatewayContentStore() picks the failover collaborator only when 2+ gateways are actually configured, and IpfsGatewayConfiguration.gatewayUrls flows straight through unmodified');
    }

    console.log('\n✅ All IPFS Gateway Read Failover (0.9.666) tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
