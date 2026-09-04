import { readFile } from 'node:fs/promises';

import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { ContentUnavailableError } from '../content/IpfsContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.132 — Arweave Snapshot Content Store.
// See docs/Roadmap.md, "0.9.132 — Arweave Snapshot Content Store."
//
// Deterministic, network-free coverage of content/ArweaveContentStore.js's
// own wire behavior — every scenario below runs against an injected
// `signer` and an injected `fetchImpl` standing in for a real wallet and
// a real Arweave gateway, never either live one, the identical technique
// tests/ArweavePublicationMaterialUploader.test.js and tests/
// IpfsContentStore.test.js already established for this exact family.
//
//   Section A: flagship — put()/get() round trip; hash is OURS, the
//              transaction id is only ever a locator
//   Section B: no caching/dedup — identical content placed twice yields
//              two independent transactions, one stable hash
//   Section C: signer delegation — the signed transaction, never raw
//              bytes, is POSTed; the store never touches key material
//   Section D: locator semantics — a non-ar:// reference is simply not
//              this store's content, never an error
//   Section E: failure propagation — a signer failure and a genuine
//              transport failure both propagate/throw; a non-2xx gateway
//              response throws ContentUnavailableError from put() AND
//              get(); has() degrades to false
//   Section F: a signer that resolves but violates its own {id,
//              transaction} contract throws — never a fake ContentReference
//   Section G: an oversized get() response is rejected, by Content-Length
//              and by actual decoded body size, independently
//   Section H: no coupling — this file never imports the Signed Claim
//              distribution family, Nostr, or the Snapshot Placement
//              orchestration layer; it plugs into
//              SnapshotPlacementStoreRegistry exactly like content/
//              IpfsContentStore.js already does, with zero special-casing
//   Section SEQUENCE: one continuous flagship placement/retrieval, plus
//              failure independence — a failed second put() never
//              disturbs the first, already-resolvable placement

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

function makeFakeSigner({ handler } = {}) {
    const calls = [];
    async function sign(material) {
        calls.push(material);
        return handler ? handler(material) : { id: 'fake-tx-id', transaction: { data: material } };
    }
    return { calls, signer: { sign } };
}

function makeFakeGateway({ handler }) {
    const requests = [];
    async function fetchImpl(url, options) {
        requests.push({ url, options });
        return handler(url, options);
    }
    return { requests, fetchImpl };
}

function gatewayResponse(body, { status = 200, headers = {} } = {}) {
    return new Response(body, { status, headers });
}

// A tiny in-memory stand-in for an Arweave gateway that actually stores
// what it's POSTed and serves it back on GET — enough to round-trip
// put()/get() deterministically, without a live network. Mirrors tests/
// SnapshotDistributionBoundary.test.js's own makeFakeIpfsNode() one
// substrate over.
function makeFakeArweaveGateway() {
    const network = new Map();
    const requests = [];
    async function fetchImpl(url, options = {}) {
        requests.push({ url, options });
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, transaction.data);
            return gatewayResponse('OK', { status: 200 });
        }
        const id = parsed.pathname.slice(1);
        if (!network.has(id)) {
            return gatewayResponse('not found', { status: 404 });
        }
        return gatewayResponse(network.get(id));
    }
    return { network, requests, fetchImpl };
}

function makeFakeArweaveSigner() {
    let counter = 0;
    const calls = [];
    async function sign(material) {
        calls.push(material);
        counter += 1;
        return { id: `fake-arweave-tx-${counter}`, transaction: { id: `fake-arweave-tx-${counter}`, data: material } };
    }
    return { calls, signer: { sign } };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — flagship: put()/get() round trip; hash is ours, the
    // transaction id is only ever a locator.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();
        const { signer } = makeFakeArweaveSigner();
        const store = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });
        assert(store.storage === 'ar', '1. storage is always "ar"');

        const bytes = JSON.stringify({ hello: 'decentralized world' });
        const reference = await store.put(bytes);
        assert(reference instanceof ContentReference, '2. put() returns a ContentReference');
        assert(reference.hash === computeContentHash(bytes), '3. hash is OUR OWN local content hash, never the Arweave transaction id');
        assert(reference.uri.startsWith('ar://'), '4. uri carries the transaction id as an ar:// locator');
        assert(reference.uri !== 'ar://' + reference.hash, '5. the transaction id and the content hash are two different strings — a locator is never an identity');
        assert(reference.storage === 'ar', '6. storage is tagged ar');
        assert(reference.size === bytes.length, '7. size is preserved');

        const retrieved = await store.get(reference);
        assert(retrieved === bytes, '8. get() retrieves exactly the bytes that were put');
        assert(reference.verify(retrieved), '9. retrieved bytes verify against their own content reference');
    }
    console.log('✓ Section A: put()/get() round trip — hash identity is ours, the transaction id is only ever a locator');

    // ---------------------------------------------------------------
    // Section B — no caching, no dedup: identical content placed twice
    // yields two independent transactions, one stable hash.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();
        const { signer, calls } = makeFakeArweaveSigner();
        const store = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });

        const bytes = JSON.stringify({ same: 'content' });
        const first = await store.put(bytes);
        const second = await store.put(bytes);
        assert(calls.length === 2, '10. two independent sign() calls were made — no dedup/caching');
        assert(first.uri !== second.uri, '11. two independent uploads of identical content produce two independent locators');
        assert(first.hash === second.hash, '12. ...but the content hash is stable, computed only from the bytes, never from the transaction id');
    }
    console.log('✓ Section B: no caching or dedup — content hash is stable, the locator is not');

    // ---------------------------------------------------------------
    // Section C — signer delegation: the signed transaction (never raw
    // bytes directly) is POSTed; the store never touches key material.
    // ---------------------------------------------------------------
    {
        expectThrowsSync(() => new ArweaveContentStore({ fetchImpl: async () => gatewayResponse('OK') }),
            '13. construction without a signer throws — this store never generates or holds a key of its own');
        expectThrowsSync(() => new ArweaveContentStore({ signer: {}, fetchImpl: async () => gatewayResponse('OK') }),
            '14. a signer with no sign() method is rejected identically');

        const { signer } = makeFakeSigner({ handler: (material) => ({ id: 'tx-posted', transaction: { data: material, wrapped: true } }) });
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('OK') });
        const store = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl, gatewayUrl: 'https://custom-gateway.example' });

        await store.put('raw-snapshot-bytes');
        assert(gateway.requests.length === 1, '15. exactly one request is made per put() call');
        assert(gateway.requests[0].url === 'https://custom-gateway.example/tx', '16. the request targets <gatewayUrl>/tx');
        assert(gateway.requests[0].options.method === 'POST', '17. the request uses POST');
        const postedBody = JSON.parse(gateway.requests[0].options.body);
        assert(postedBody.wrapped === true && postedBody.data === 'raw-snapshot-bytes', '18. the POST body is the signer\'s own transaction, never the raw bytes directly');
    }
    console.log('✓ Section C: signing is entirely delegated to the injected signer — the store never touches key material');

    // ---------------------------------------------------------------
    // Section D — locator semantics: a reference this store has no
    // business resolving is simply not its content, never an error.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeArweaveGateway();
        const { signer } = makeFakeArweaveSigner();
        const store = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });

        const ipfsReference = new ContentReference({ hash: 'abc', storage: 'ipfs', uri: 'ipfs://bafyNotArweave' });
        assert(await store.get(ipfsReference) === null, '19. a reference with no ar:// uri resolves to null, never throws');

        const noUriReference = new ContentReference({ hash: 'abc', storage: null, uri: null });
        assert(await store.get(noUriReference) === null, '20. a reference with no uri at all is also null');
    }
    console.log('✓ Section D: a non-Arweave reference is simply not this store\'s content');

    // ---------------------------------------------------------------
    // Section E — failure propagation: a signer failure and a genuine
    // transport failure both propagate; a non-2xx gateway response
    // throws ContentUnavailableError from put() AND get(); has()
    // degrades to false.
    // ---------------------------------------------------------------
    {
        const failingSigner = { sign: async () => { throw new Error('simulated locked keystore'); } };
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('OK') });
        const store = new ArweaveContentStore({ signer: failingSigner, fetchImpl: gateway.fetchImpl });
        await expectRejects(store.put('material'), '21. a genuine signer failure propagates, never swallowed into a fake success');
        assert(gateway.requests.length === 0, '22. the gateway is never reached once signing itself failed');
    }
    {
        const { signer } = makeFakeSigner();
        const downGateway = makeFakeGateway({ handler: () => { throw new Error('simulated connection failure'); } });
        const downStore = new ArweaveContentStore({ signer, fetchImpl: downGateway.fetchImpl });
        await expectRejects(downStore.put('material'), '23. put() rejects with a genuine failure, never silently succeeds, when the gateway cannot be reached', ContentUnavailableError);
        await expectRejects(downStore.get(new ContentReference({ hash: 'x', uri: 'ar://someTx' })),
            '24. get() rejects the same way when the gateway cannot be reached', ContentUnavailableError);
        assert(await downStore.has(new ContentReference({ hash: 'x', uri: 'ar://someTx' })) === false,
            '25. has() degrades to false rather than propagating the same failure');
    }
    {
        const { signer } = makeFakeSigner();
        const rejectingGateway = makeFakeGateway({ handler: () => gatewayResponse('quota exceeded', { status: 429 }) });
        const store = new ArweaveContentStore({ signer, fetchImpl: rejectingGateway.fetchImpl });
        await expectRejects(store.put('material'), '26. a non-2xx gateway response throws ContentUnavailableError from put(), never a fake ContentReference', ContentUnavailableError);
    }
    {
        const { signer } = makeFakeArweaveSigner();
        const gateway = makeFakeArweaveGateway();
        const store = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });
        const reference = await store.put('some snapshot bytes');

        const brokenGateway = makeFakeGateway({ handler: () => gatewayResponse('gone', { status: 410 }) });
        const brokenStore = new ArweaveContentStore({ signer, fetchImpl: brokenGateway.fetchImpl });
        await expectRejects(brokenStore.get(reference), '27. get() throws ContentUnavailableError for a non-2xx gateway response, even for a validly-formed ar:// reference', ContentUnavailableError);
    }
    console.log('✓ Section E: signer/transport failures propagate; a non-2xx response is always ContentUnavailableError, never a fake success');

    // ---------------------------------------------------------------
    // Section F — a signer that resolves but violates its own contract
    // throws, never degrades to a fake ContentReference.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway({ handler: () => gatewayResponse('OK') });

        const noId = { sign: async () => ({ transaction: { data: 'x' } }) };
        await expectRejects(new ArweaveContentStore({ signer: noId, fetchImpl: gateway.fetchImpl }).put('material'),
            '28. a signer resolving with no id throws rather than returning a fake ContentReference');

        const badId = { sign: async () => ({ id: 'not a valid id!!', transaction: { data: 'x' } }) };
        await expectRejects(new ArweaveContentStore({ signer: badId, fetchImpl: gateway.fetchImpl }).put('material'),
            '29. a signer resolving with a malformed id throws too');

        const noTransaction = { sign: async () => ({ id: 'validTxId123' }) };
        await expectRejects(new ArweaveContentStore({ signer: noTransaction, fetchImpl: gateway.fetchImpl }).put('material'),
            '30. a signer resolving with no transaction at all throws');
    }
    console.log('✓ Section F: a signer violating its own {id, transaction} contract throws, never degrades to a fake success');

    // ---------------------------------------------------------------
    // Section G — an oversized get() response is rejected, by
    // Content-Length and by actual decoded body size, independently.
    // ---------------------------------------------------------------
    {
        const { signer } = makeFakeSigner();
        const declaredOversized = makeFakeGateway({ handler: () => gatewayResponse('short body', { status: 200, headers: { 'content-length': '999999' } }) });
        const store = new ArweaveContentStore({ signer, fetchImpl: declaredOversized.fetchImpl, maxResponseBytes: 1024 });
        await expectRejects(store.get(new ContentReference({ hash: 'x', uri: 'ar://someTx' })),
            '31. a declared Content-Length exceeding maxResponseBytes is rejected before the body is trusted', ContentUnavailableError);

        const actuallyOversized = makeFakeGateway({ handler: () => gatewayResponse('x'.repeat(2048), { status: 200 }) });
        const store2 = new ArweaveContentStore({ signer, fetchImpl: actuallyOversized.fetchImpl, maxResponseBytes: 1024 });
        await expectRejects(store2.get(new ContentReference({ hash: 'x', uri: 'ar://someTx' })),
            '32. an actually oversized body is rejected even with no honest Content-Length header', ContentUnavailableError);
    }
    console.log('✓ Section G: an oversized response is rejected, both by declared and by actual size');

    // ---------------------------------------------------------------
    // Section H — no coupling: this file never references the Signed
    // Claim distribution family, Nostr, or the snapshot orchestration
    // layer; it plugs into SnapshotPlacementStoreRegistry exactly like
    // content/IpfsContentStore.js already does.
    // ---------------------------------------------------------------
    {
        const code = await codeOnlySource('content/ArweaveContentStore.js');
        assert(!code.includes('PublicationDistribution'), '33. content/ArweaveContentStore.js never references the PublicationDistribution family');
        assert(!code.includes('ArweavePublicationMaterialUploader'), '34. ...nor ArweavePublicationMaterialUploader');
        assert(!code.includes('NostrPublicationDiscoveryPublisher'), '35. ...nor NostrPublicationDiscoveryPublisher');
        assert(!/nostr/i.test(code), '36. ...nor Nostr in any form');
        assert(!code.includes('PublicationSnapshotPlacement'), '37. ...nor the PublicationSnapshotPlacement envelope/catalog/resolver — a plain ContentStore, never a mutator of claim lifecycle');
        assert(!code.includes('CreateSnapshotPlacementOrchestratorUseCase'), '38. ...nor the orchestrator that wires stores together — this file is a plugin, never its own composition root');

        const registry = new SnapshotPlacementStoreRegistry();
        const { signer } = makeFakeArweaveSigner();
        const store = new ArweaveContentStore({ signer, fetchImpl: makeFakeArweaveGateway().fetchImpl });
        registry.register(store);
        assert(registry.get('ar') === store, '39. this store registers into SnapshotPlacementStoreRegistry exactly like content/IpfsContentStore.js already does, with zero special-casing');
    }
    console.log('✓ Section H: no coupling to Signed Claim distribution, Nostr, or the placement orchestration layer — a plain, pluggable ContentStore');

    // ===============================================================
    // Section SEQUENCE — one continuous flagship placement/retrieval,
    // plus failure independence within this one store.
    // ===============================================================
    {
        const gateway = makeFakeArweaveGateway();
        const { signer } = makeFakeArweaveSigner();
        const store = new ArweaveContentStore({ signer, fetchImpl: gateway.fetchImpl });

        // Create a snapshot's bytes and compute its content identity
        // exactly the way a real caller would, before any placement.
        const snapshotBytes = JSON.stringify({ world: { buildings: [{ id: 'b1', bricks: 3 }] } });
        const expectedHash = computeContentHash(snapshotBytes);

        // Place it.
        const reference = await store.put(snapshotBytes);
        assert(reference.hash === expectedHash, 'SEQ. 1. the placed reference\'s hash matches the hash computed BEFORE placement — placement never alters content identity');
        assert(reference.uri.startsWith('ar://'), 'SEQ. 2. a successful placement returns an Arweave-specific locator');

        // Retrieve it back using nothing but the locator.
        const retrieved = await store.get(reference);
        assert(retrieved === snapshotBytes, 'SEQ. 3. retrieval via the locator returns exactly the original bytes');
        assert(computeContentHash(retrieved) === expectedHash, 'SEQ. 4. the retrieved bytes still hash to the SAME original value — the round trip through Arweave never mutated content identity');
        assert(reference.verify(retrieved), 'SEQ. 5. the reference\'s own verify() confirms the retrieved bytes independently');

        // Failure independence: a second, unrelated put() that fails
        // (gateway now rejects everything) never disturbs the first,
        // already-successful placement — it still resolves, byte-for-byte,
        // from the SAME store instance.
        const failingGateway = makeFakeGateway({ handler: () => gatewayResponse('gateway overloaded', { status: 503 }) });
        const partiallyBrokenStore = new ArweaveContentStore({ signer, fetchImpl: async (url, options) => {
            // Route GETs (retrieval of the already-placed content) to the
            // real in-memory gateway; route the new POST to the failing one.
            if (options && options.method === 'POST') return failingGateway.fetchImpl(url, options);
            return gateway.fetchImpl(url, options);
        } });

        await expectRejects(partiallyBrokenStore.put('a second, doomed snapshot'),
            'SEQ. 6. independence 1: a second placement genuinely fails against the now-overloaded gateway', ContentUnavailableError);

        const stillResolved = await partiallyBrokenStore.get(reference);
        assert(stillResolved === snapshotBytes, 'SEQ. 7. independence 1: the FIRST snapshot still resolves perfectly — a failed second placement never touched it');
        assert(computeContentHash(stillResolved) === expectedHash, 'SEQ. 8. independence 1: ...with byte-identical content hash to before');

        console.log('✓ SEQUENCE: a snapshot is placed on Arweave, retrieved by its own locator with content identity unchanged throughout, and a later unrelated placement failure never disturbs it');
    }

    console.log('\nAll ArweaveContentStore tests passed.');
}

function expectThrowsSync(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

run().catch((error) => {
    console.error('ArweaveContentStore.test.js FAILED:', error);
    process.exitCode = 1;
});
