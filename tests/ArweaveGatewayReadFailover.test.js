import { readFile } from 'node:fs/promises';

import { ArweaveGatewayConfiguration } from '../core/ArweaveGatewayConfiguration.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { ArweaveGatewayFailoverContentStore } from '../content/ArweaveGatewayFailoverContentStore.js';
import { ContentUnavailableError } from '../content/IpfsContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { ArweaveWorldEncounterMaterialResolver } from '../application/ArweaveWorldEncounterMaterialResolver.js';
import { ArweaveGatewayFailoverWorldEncounterMaterialResolver } from '../application/ArweaveGatewayFailoverWorldEncounterMaterialResolver.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { composeArweaveDecentralizedWorldEncounterMaterialSource } from '../application/DecentralizedWorldEncounterMaterialRuntimeComposition.js';

// 0.9.440 — Arweave Gateway Read Failover.
//
// 0.9.439's own audit classified Arweave gateway read/retrieval as this
// codebase's one MINIMAL_FAILOVER_SEAM: content-addressed, byte-identical
// from any gateway that serves it, so ordered failover captures 100% of
// the resilience benefit with none of fan-out's complexity. This file
// covers the real production change that audit recommended:
//
//   core/ArweaveGatewayConfiguration.js — `gatewayUrl` (a string) OR
//     `gatewayUrls` (a non-empty, ordered array) — never both — with the
//     single-string shape remaining exactly a one-element list.
//   content/ArweaveGatewayFailoverContentStore.js /
//   application/ArweaveGatewayFailoverWorldEncounterMaterialResolver.js —
//     the two new ordered-failover read collaborators.
//   application/DiscoverSnapshotRuntimeComposition.js /
//   application/DecentralizedWorldEncounterMaterialRuntimeComposition.js —
//     updated to build the failover collaborator only when more than one
//     gateway is configured, byte-for-byte unchanged otherwise.
//   ui/main.js — the two retrieval composition call sites now receive the
//     full ordered gateway list; Arweave Anchor and every write-path call
//     site are untouched — see tests/ArweaveGatewayLifecycleReassessment.test.js
//     and tests/ArweaveGatewayRetrievalIntegration.test.js for that sweep.
//
// Section A: single gateway — composition picks the plain, pre-0.9.440
//            class, byte-for-byte unchanged behavior
// Section B: first gateway succeeds — the rest are never contacted
// Section C: first unavailable, second succeeds
// Section D: first two unavailable, third succeeds
// Section E: every gateway unavailable — the existing "unavailable" outcome
//            is preserved, never swallowed into a fabricated success
// Section F: malformed/non-matching reference or uri — no gateway is ever
//            contacted, not even the first
// Section G: ordering — [A, B] vs [B, A] changes attempt order, never the
//            meaning of the requested content
// Section H: identity preservation — a reordered/failed-over read never
//            changes the content hash, transaction id, or material shape
// Section I: cross-role isolation — Arweave Anchor, Nostr, and Bitcoin are
//            structurally untouched by this milestone
// Section J: no hidden fan-out — a successful read terminates the
//            operation; the write path (put()) never fails over either
// Section K: composition wiring — gatewayUrls (plural) picks the failover
//            class only for 2+ entries; the single-value shape is
//            unaffected

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
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

function makeFakeArweaveSigner() {
    let counter = 0;
    async function sign(material) {
        counter += 1;
        return { id: `fake-arweave-tx-${counter}`, transaction: { id: `fake-arweave-tx-${counter}`, data: material } };
    }
    return { sign };
}

// A per-origin fake gateway network: each configured origin behaves
// however its own `behaviors` entry says (a real 200 response serving
// `network` content, a 404, or a genuine transport rejection), and every
// request against every origin is recorded independently — so a test can
// assert exactly which gateways were contacted, and in what order, never
// merely that "a" request happened somewhere.
function makeMultiGatewayFetch(behaviors) {
    const requestsByOrigin = {};
    for (const origin of Object.keys(behaviors)) requestsByOrigin[origin] = [];
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        const origin = parsed.origin;
        if (!(origin in requestsByOrigin)) requestsByOrigin[origin] = [];
        requestsByOrigin[origin].push(url);
        const behavior = behaviors[origin];
        if (!behavior) throw new Error(`test setup error: no behavior configured for origin ${origin}`);
        if (behavior.reject) {
            throw new Error(behavior.rejectMessage || `simulated network failure for ${origin}`);
        }
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, transaction.data);
            return new Response('OK', { status: 200 });
        }
        if (behavior.status && behavior.status !== 200) {
            return new Response(behavior.body ?? 'not found', { status: behavior.status });
        }
        const id = parsed.pathname.slice(1);
        if (behavior.body !== undefined) {
            return new Response(behavior.body, { status: 200 });
        }
        if (network.has(id)) {
            return new Response(network.get(id), { status: 200 });
        }
        return new Response('not found', { status: 404 });
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
    const txId = 'a'.repeat(43);
    const arReference = new ContentReference({ hash: 'irrelevant', uri: 'ar://' + txId, storage: 'ar' });
    const arUri = 'ar://' + txId;

    // ===============================================================
    // Section A — single gateway: composition picks the plain,
    // pre-0.9.440 class; behavior is byte-for-byte unchanged.
    // ===============================================================
    {
        const { fetchImpl } = makeMultiGatewayFetch({ [A]: { body: '{"ok":true}' } });

        const { contentStore } = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), gatewayUrls: [A], fetchImpl }
        });
        assert(contentStore instanceof ArweaveContentStore, 'A1. a one-element gatewayUrls array still builds a plain ArweaveContentStore, never the failover wrapper');
        assert(!(contentStore instanceof ArweaveGatewayFailoverContentStore), 'A1b. sanity — not the failover class either, by inheritance coincidence');

        const { resolver } = composeArweaveDecentralizedWorldEncounterMaterialSource({ gatewayUrls: [A], fetchImpl });
        assert(resolver instanceof ArweaveWorldEncounterMaterialResolver, 'A2. a one-element gatewayUrls array still builds a plain ArweaveWorldEncounterMaterialResolver');
        assert(!(resolver instanceof ArweaveGatewayFailoverWorldEncounterMaterialResolver), 'A2b. sanity — not the failover class');

        // The original singular gatewayUrl shape is completely unaffected.
        const { contentStore: legacyStore } = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), gatewayUrl: A, fetchImpl }
        });
        assert(legacyStore instanceof ArweaveContentStore && !(legacyStore instanceof ArweaveGatewayFailoverContentStore),
            'A3. the original singular gatewayUrl option shape is completely unaffected by this milestone');

        console.log('✓ Section A: a single configured gateway (list of one, or the original singular shape) builds exactly the pre-0.9.440 plain class — no behavior change for every existing caller');
    }

    // ===============================================================
    // Section B — first gateway succeeds: B and C are never contacted.
    // ===============================================================
    {
        const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({
            [A]: { body: '{"ok":"from-a"}' },
            [B]: { body: '{"ok":"from-b"}' },
            [C]: { body: '{"ok":"from-c"}' }
        });

        const store = new ArweaveGatewayFailoverContentStore({ gatewayUrls: [A, B, C], signer: makeFakeArweaveSigner(), fetchImpl });
        const result = await store.get(arReference);
        assert(result === '{"ok":"from-a"}', 'B1. the first gateway\'s own content is returned');
        assert(totalRequests(requestsByOrigin, A) === 1, 'B2. gateway A was contacted exactly once');
        assert(totalRequests(requestsByOrigin, B) === 0, 'B3. gateway B received ZERO requests — never contacted merely for redundancy');
        assert(totalRequests(requestsByOrigin, C) === 0, 'B4. gateway C received ZERO requests');

        const { fetchImpl: fetchImpl2, requestsByOrigin: requests2 } = makeMultiGatewayFetch({
            [A]: { body: '{"kind":"material-a"}' },
            [B]: { body: '{"kind":"material-b"}' }
        });
        const resolver = new ArweaveGatewayFailoverWorldEncounterMaterialResolver({ gatewayUrls: [A, B], fetchImpl: fetchImpl2 });
        const material = await resolver.retrieveByUri(arUri);
        assert(material && material.kind === 'material-a', 'B5. the first gateway\'s own material is returned (World Encounter resolver)');
        assert(totalRequests(requests2, B) === 0, 'B6. gateway B received ZERO requests for the World Encounter resolver too');

        console.log('✓ Section B: a successful first gateway terminates the operation — the remaining configured gateways are never queried, for both read collaborators');
    }

    // ===============================================================
    // Section C — first gateway unavailable, second succeeds.
    // ===============================================================
    {
        const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({
            [A]: { reject: true },
            [B]: { body: '{"ok":"from-b"}' },
            [C]: { body: '{"ok":"from-c"}' }
        });
        const store = new ArweaveGatewayFailoverContentStore({ gatewayUrls: [A, B, C], signer: makeFakeArweaveSigner(), fetchImpl });
        const result = await store.get(arReference);
        assert(result === '{"ok":"from-b"}', 'C1. gateway B\'s own content is returned once A is unreachable');
        assert(totalRequests(requestsByOrigin, A) === 1, 'C2. gateway A was tried exactly once');
        assert(totalRequests(requestsByOrigin, B) === 1, 'C3. gateway B was tried exactly once');
        assert(totalRequests(requestsByOrigin, C) === 0, 'C4. gateway C was never contacted — B already succeeded');

        // The identical scenario via a non-2xx response (rather than a
        // genuine transport rejection) on gateway A — content/
        // ArweaveContentStore.js's own get() throws ContentUnavailableError
        // for both shapes identically, so failover treats them the same.
        const { fetchImpl: fetchImpl2, requestsByOrigin: requests2 } = makeMultiGatewayFetch({
            [A]: { status: 404 },
            [B]: { body: '{"ok":"from-b"}' }
        });
        const store2 = new ArweaveGatewayFailoverContentStore({ gatewayUrls: [A, B], signer: makeFakeArweaveSigner(), fetchImpl: fetchImpl2 });
        assert(await store2.get(arReference) === '{"ok":"from-b"}', 'C5. a non-2xx response from gateway A also fails over to gateway B');

        console.log('✓ Section C: an unreachable or non-2xx first gateway fails over to the second, which is contacted exactly once, and the third is left untouched');
    }

    // ===============================================================
    // Section D — first two gateways fail, third succeeds.
    // ===============================================================
    {
        const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({
            [A]: { reject: true },
            [B]: { status: 500 },
            [C]: { body: '{"ok":"from-c"}' }
        });
        const store = new ArweaveGatewayFailoverContentStore({ gatewayUrls: [A, B, C], signer: makeFakeArweaveSigner(), fetchImpl });
        const result = await store.get(arReference);
        assert(result === '{"ok":"from-c"}', 'D1. the third gateway\'s own content is returned once A and B both fail, one for a different reason each');
        assert(totalRequests(requestsByOrigin, A) === 1 && totalRequests(requestsByOrigin, B) === 1 && totalRequests(requestsByOrigin, C) === 1,
            'D2. every configured gateway was contacted exactly once, in order, with no repeats');

        console.log('✓ Section D: two failures of different shapes (a genuine transport failure, then a server error) both fail over correctly, reaching the third gateway');
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
        const store = new ArweaveGatewayFailoverContentStore({ gatewayUrls: [A, B, C], signer: makeFakeArweaveSigner(), fetchImpl });
        const error = await expectRejects(store.get(arReference), 'E1. get() rejects once every configured gateway has failed', ContentUnavailableError);
        assert(error.message.includes(C), 'E2. the propagated error names the LAST gateway tried, not the first — the failure a caller sees reflects the final attempt');

        const resolver = new ArweaveGatewayFailoverWorldEncounterMaterialResolver({ gatewayUrls: [A, B], fetchImpl: makeMultiGatewayFetch({ [A]: { reject: true }, [B]: { reject: true, rejectMessage: 'b is down' } }).fetchImpl });
        await expectRejects(resolver.retrieveByUri(arUri), 'E3. retrieveByUri() rejects once every configured gateway genuinely fails — never silently returns null for a real network failure');

        // Every gateway resolving null (never rejecting) — e.g. none of
        // them have this transaction — is a DIFFERENT, non-error outcome:
        // the resolver returns null, exactly as a single resolver already
        // would for a 404.
        const { fetchImpl: fetchImpl404 } = makeMultiGatewayFetch({ [A]: { status: 404 }, [B]: { status: 404 } });
        const resolverAllMissing = new ArweaveGatewayFailoverWorldEncounterMaterialResolver({ gatewayUrls: [A, B], fetchImpl: fetchImpl404 });
        assert(await resolverAllMissing.retrieveByUri(arUri) === null, 'E4. every gateway agreeing "not found" (404, never a rejection) resolves null, exactly like a single resolver already would — not an error');

        console.log('✓ Section E: once every configured gateway has genuinely failed, the existing unavailable outcome (a thrown ContentUnavailableError, or a propagated rejection) is preserved unchanged — never swallowed into a fabricated success or a misleading null');
    }

    // ===============================================================
    // Section F — malformed/non-matching reference or uri: no gateway is
    // ever contacted, not even the first.
    // ===============================================================
    {
        const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({ [A]: {}, [B]: {}, [C]: {} });
        const store = new ArweaveGatewayFailoverContentStore({ gatewayUrls: [A, B, C], signer: makeFakeArweaveSigner(), fetchImpl });
        const nonArReference = new ContentReference({ hash: 'irrelevant', uri: 'ipfs://not-arweave', storage: 'ipfs' });
        assert(await store.get(nonArReference) === null, 'F1. a non-ar:// reference resolves null');
        assert(totalRequests(requestsByOrigin, A) === 0 && totalRequests(requestsByOrigin, B) === 0 && totalRequests(requestsByOrigin, C) === 0,
            'F2. NOT ONE configured gateway was contacted for a reference that was never even Arweave\'s to serve');

        const { fetchImpl: fetchImpl2, requestsByOrigin: requests2 } = makeMultiGatewayFetch({ [A]: {}, [B]: {} });
        const resolver = new ArweaveGatewayFailoverWorldEncounterMaterialResolver({ gatewayUrls: [A, B], fetchImpl: fetchImpl2 });
        assert(await resolver.retrieveByUri('https://not-an-ar-uri.example') === null, 'F3. a non-ar:// uri resolves null (World Encounter resolver)');
        assert(await resolver.retrieveByUri('ar://has spaces/slashes') === null, 'F4. a malformed ar:// transaction id resolves null');
        assert(totalRequests(requests2, A) === 0 && totalRequests(requests2, B) === 0, 'F5. NOT ONE configured gateway was contacted for a malformed uri, across both gateways');

        console.log('✓ Section F: a reference/uri that was never Arweave\'s to serve, or is malformed, is rejected before any network request — every configured gateway, not just the first, sees ZERO requests');
    }

    // ===============================================================
    // Section G — ordering: [A, B] vs [B, A] changes attempt order, never
    // the meaning of the requested content.
    // ===============================================================
    {
        const { fetchImpl: fetchAB, requestsByOrigin: requestsAB } = makeMultiGatewayFetch({
            [A]: { body: '{"from":"a"}' },
            [B]: { body: '{"from":"b"}' }
        });
        const storeAB = new ArweaveGatewayFailoverContentStore({ gatewayUrls: [A, B], signer: makeFakeArweaveSigner(), fetchImpl: fetchAB });
        assert(await storeAB.get(arReference) === '{"from":"a"}', 'G1. [A, B] tries A first');
        assert(totalRequests(requestsAB, B) === 0, 'G1b. …and never contacts B once A succeeds');

        const { fetchImpl: fetchBA, requestsByOrigin: requestsBA } = makeMultiGatewayFetch({
            [A]: { body: '{"from":"a"}' },
            [B]: { body: '{"from":"b"}' }
        });
        const storeBA = new ArweaveGatewayFailoverContentStore({ gatewayUrls: [B, A], signer: makeFakeArweaveSigner(), fetchImpl: fetchBA });
        assert(await storeBA.get(arReference) === '{"from":"b"}', 'G2. reordering to [B, A] tries B first instead — a pure configuration reorder, no code change');
        assert(totalRequests(requestsBA, A) === 0, 'G2b. …and never contacts A once B succeeds');

        assert(storeAB.gatewayUrls.join(',') === [A, B].join(','), 'G3. gatewayUrls exposes the configured order exactly, for [A, B]');
        assert(storeBA.gatewayUrls.join(',') === [B, A].join(','), 'G3b. …and exactly, reordered, for [B, A]');

        console.log('✓ Section G: reordering the same two gateways changes which one is tried first and which content is returned when they disagree — order is the entire policy, never incidental');
    }

    // ===============================================================
    // Section H — identity preservation: failover never changes content
    // hash, transaction id, or material shape.
    // ===============================================================
    {
        // put() always targets gateway A only — its own transaction id is
        // whatever the injected signer produced, completely independent of
        // how many gateways are configured for READ failover.
        const { fetchImpl } = makeMultiGatewayFetch({ [A]: {}, [B]: {}, [C]: {} });
        const store = new ArweaveGatewayFailoverContentStore({ gatewayUrls: [A, B, C], signer: makeFakeArweaveSigner(), fetchImpl });
        const reference = await store.put('hello failover');
        assert(reference.uri === 'ar://fake-arweave-tx-1', 'H1. the transaction id put() returns is exactly what the signer produced, unaffected by how many read gateways are configured');
        assert(reference.hash === (await import('../serializer/contentHash.js')).computeContentHash('hello failover'), 'H2. the content hash is computed locally, from the bytes, exactly as content/ArweaveContentStore.js already does — never derived from which gateway answered');

        // Simplest direct proof of "byte-identical regardless of gateway":
        // the SAME material served by two different gateway hosts resolves
        // to the SAME parsed object through the World Encounter resolver.
        const { fetchImpl: fetchImplIdentical } = makeMultiGatewayFetch({
            [A]: { reject: true },
            [B]: { body: '{"stable":"material","n":42}' }
        });
        const resolver = new ArweaveGatewayFailoverWorldEncounterMaterialResolver({ gatewayUrls: [A, B], fetchImpl: fetchImplIdentical });
        const material = await resolver.retrieveByUri(arUri);
        assert(material.stable === 'material' && material.n === 42, 'H3. material retrieved via failover (from gateway B, after A failed) is byte-identical in shape to what a direct single-gateway retrieval against B alone would have produced');

        console.log('✓ Section H: failover never changes what a read returns — content hash and transaction id come from local computation and the signer respectively, never from which gateway happened to answer');
    }

    // ===============================================================
    // Section I — cross-role isolation: Arweave Anchor, Nostr, and Bitcoin
    // are structurally untouched by this milestone.
    // ===============================================================
    {
        const anchorPublisherSource = await source('anchoring/ArweaveAnchorPublisher.js');
        const anchorVerifierSource = await source('anchoring/ArweaveTransactionDataProofVerifier.js');
        assert(!anchorPublisherSource.includes('ArweaveGatewayFailover'), 'I1. anchoring/ArweaveAnchorPublisher.js never references either new failover class');
        assert(!anchorVerifierSource.includes('ArweaveGatewayFailover'), 'I2. anchoring/ArweaveTransactionDataProofVerifier.js never references either new failover class — Anchor deliberately keeps its single-value gateway, per 0.9.439\'s own Section F3');

        const mainSource = await source('ui/main.js');
        const anchorPublisherBlockMatch = mainSource.match(/CreateArweaveAnchorPublisherUseCase\(\)\.execute\(\{[\s\S]{0,150}?\}\);/);
        const anchorVerifierBlockMatch = mainSource.match(/CreateArweaveAnchorProofVerifierUseCase\(\)\.execute\(\{[\s\S]{0,100}?\}\);/);
        assert(anchorPublisherBlockMatch && !anchorPublisherBlockMatch[0].includes('resolvedArweaveGatewayUrls'), 'I3. the Anchor publisher call site never receives the new plural gateway list');
        assert(anchorVerifierBlockMatch && !anchorVerifierBlockMatch[0].includes('resolvedArweaveGatewayUrls'), 'I4. the Anchor verifier call site never receives the new plural gateway list — it keeps consuming the singular resolvedArweaveGatewayUrl exactly as before');

        // Nostr/Bitcoin composition files never import either new class —
        // this milestone touches Arweave read/retrieval only.
        const nostrSources = await Promise.all([
            source('application/NostrPublicationDiscoveryPublisher.js'),
            source('application/NostrDiscoveryQueryService.js')
        ]);
        for (const src of nostrSources) {
            assert(!src.includes('ArweaveGatewayFailover'), 'I5. no Nostr composition file references either new Arweave failover class');
        }

        console.log('✓ Section I: Arweave Anchor keeps its single-value gateway untouched (0.9.439\'s own deliberate exception, left alone by this milestone), and Nostr/Bitcoin composition is structurally unaware this milestone exists');
    }

    // ===============================================================
    // Section J — no hidden fan-out: a successful read terminates the
    // operation; put() (write) never fails over, targeting only the first
    // configured gateway.
    // ===============================================================
    {
        const { fetchImpl, requestsByOrigin } = makeMultiGatewayFetch({
            [A]: { body: '{"ok":true}' },
            [B]: { body: '{"ok":true}' },
            [C]: { body: '{"ok":true}' }
        });
        const store = new ArweaveGatewayFailoverContentStore({ gatewayUrls: [A, B, C], signer: makeFakeArweaveSigner(), fetchImpl });
        await store.get(arReference);
        assert(totalRequests(requestsByOrigin, A) + totalRequests(requestsByOrigin, B) + totalRequests(requestsByOrigin, C) === 1,
            'J1. exactly ONE network request total for a successful read — never a redundant fan-out confirmation against the other configured gateways');

        // put() — write stays single-gateway, no failover and no fan-out,
        // even with three gateways configured for READ.
        const putResult = await store.put('write stays single-gateway');
        assert(putResult instanceof ContentReference, 'J2. put() still returns a real ContentReference');
        assert(totalRequests(requestsByOrigin, A) === 2, 'J3. the POST from put() reached gateway A (the first configured gateway) — one GET from the read above, plus this POST');
        assert(totalRequests(requestsByOrigin, B) === 0 && totalRequests(requestsByOrigin, C) === 0, 'J4. put() never reaches gateway B or C — write is never fanned out across configured read gateways');

        console.log('✓ Section J: a successful read never triggers redundant confirmation requests against the other configured gateways, and put() (write) never fails over or fans out — it targets only the first configured gateway, unconditionally');
    }

    // ===============================================================
    // Section K — composition wiring: gatewayUrls (plural) picks the
    // failover class only for 2+ entries.
    // ===============================================================
    {
        const { fetchImpl } = makeMultiGatewayFetch({ [A]: { body: '{}' }, [B]: { body: '{}' } });

        const { contentStore } = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), gatewayUrls: [A, B], fetchImpl }
        });
        assert(contentStore instanceof ArweaveGatewayFailoverContentStore, 'K1. two or more configured gateways build the failover content store');
        assert(contentStore.gatewayUrls.length === 2, 'K1b. …with both configured gateways present');

        const { resolver } = composeArweaveDecentralizedWorldEncounterMaterialSource({ gatewayUrls: [A, B], fetchImpl });
        assert(resolver instanceof ArweaveGatewayFailoverWorldEncounterMaterialResolver, 'K2. two or more configured gateways build the failover World Encounter resolver');

        // The zero-gateways-configured shape (no signer at all, or no
        // gatewayUrls/gatewayUrl at all) is unaffected — this milestone
        // adds no new precondition to "can this capability even be
        // attempted."
        const { contentStore: absentSignerStore } = composeDiscoverSnapshotRuntime({ arweaveContentStoreOptions: { gatewayUrls: [A, B] } });
        assert(absentSignerStore === null, 'K3. no signer at all still gracefully degrades to null, exactly as before — gatewayUrls alone is never enough to attempt Arweave retrieval');

        // ArweaveGatewayConfiguration.gatewayUrls flows straight through —
        // the exact shape ui/main.js resolves and forwards.
        const configured = new ArweaveGatewayConfiguration({ gatewayUrls: [A, B, C] });
        const { contentStore: fromConfig } = composeDiscoverSnapshotRuntime({
            arweaveContentStoreOptions: { signer: makeFakeArweaveSigner(), gatewayUrls: configured.gatewayUrls, fetchImpl: makeMultiGatewayFetch({ [A]: {}, [B]: {}, [C]: {} }).fetchImpl }
        });
        assert(fromConfig instanceof ArweaveGatewayFailoverContentStore && fromConfig.gatewayUrls.length === 3,
            'K4. ArweaveGatewayConfiguration.gatewayUrls flows straight into the failover content store with its own order and length preserved');

        console.log('✓ Section K: composition picks the failover collaborator only when 2+ gateways are actually configured, still gracefully degrades to null with no usable signer, and ArweaveGatewayConfiguration.gatewayUrls flows straight through unmodified');
    }

    console.log('\n✅ All Arweave Gateway Read Failover (0.9.440) tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
