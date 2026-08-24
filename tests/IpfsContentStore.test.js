import { IpfsContentStore, ContentUnavailableError } from '../content/IpfsContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.7.1 — IPFS Content Publication & Resolution.
//
// Deterministic, network-free coverage of content/IpfsContentStore.js's
// own wire behavior — every scenario below runs against an injected
// `fetchImpl` standing in for a real Kubo node, never a live daemon.
// tests/IpfsPublicationResolution.test.js builds on top of this same
// fake-network technique for the full two-replica flagship;
// tests/IpfsLiveIntegration.test.js is the one file in this codebase
// that ever talks to a real node, and only when one is actually running.
//
//   Section A: put()/get() round trip; hash identity is OURS, never the
//              CID; uri/storage shape
//   Section B: a reference with no ipfs:// uri is simply not this
//              store's content — get() returns null, never throws
//   Section C: has() — best-effort, never throws
//   Section D: every network-shaped failure (a thrown fetch, a non-2xx
//              response, a response with no CID) becomes a
//              ContentUnavailableError from put()/get(), and a plain
//              `false` from has() — never a generic Error, never a
//              silent success
//
// See docs/Principles.md, "Availability Is Not Validity (0.7.1)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectRejects(promiseFn, message, ErrorType = null) {
    let threw = false;
    let error = null;
    try { await promiseFn(); } catch (e) { threw = true; error = e; }
    assert(threw, message);
    if (ErrorType) {
        assert(error instanceof ErrorType, `${message} (wrong error type: ${error && error.constructor && error.constructor.name})`);
    }
    return error;
}

// A tiny in-memory stand-in for a Kubo node's HTTP RPC API. `network` is
// a Map<cid, text> — the same Map handed to two separate fake fetch
// functions is exactly how tests/IpfsPublicationResolution.test.js
// simulates two nodes that HAVE actually replicated the same content;
// two independent Maps simulate two nodes that have not.
function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

function makeFakeIpfsNode({ network = new Map(), failAdd = false, failCat = false, throwOnRequest = false } = {}) {
    async function fetchImpl(url, options) {
        if (throwOnRequest) {
            throw new Error('simulated connection failure');
        }
        const parsed = new URL(url);
        if (parsed.pathname === '/api/v0/add') {
            if (failAdd) {
                return new Response('internal error', { status: 500 });
            }
            const blob = options.body.get('file');
            const text = await blob.text();
            const cid = fakeCid(text);
            network.set(cid, text);
            return new Response(JSON.stringify({ Hash: cid, Size: String(text.length) }), { status: 200 });
        }
        if (parsed.pathname === '/api/v0/cat') {
            if (failCat) {
                return new Response('internal error', { status: 500 });
            }
            const cid = parsed.searchParams.get('arg');
            if (!network.has(cid)) {
                return new Response('block not found locally', { status: 500 });
            }
            return new Response(network.get(cid), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    return { network, fetchImpl };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — put()/get() round trip
    // ---------------------------------------------------------------
    {
        const { fetchImpl } = makeFakeIpfsNode();
        const store = new IpfsContentStore({ apiUrl: 'http://node-a.test:5001/', fetchImpl });
        assert(store.apiUrl === 'http://node-a.test:5001', '1. trailing slash is stripped from apiUrl');

        const bytes = JSON.stringify({ hello: 'world' });
        const reference = await store.put(bytes);
        assert(reference instanceof ContentReference, '2. put() returns a ContentReference');
        assert(reference.hash === computeContentHash(bytes), '3. hash is OUR OWN local content hash, never the CID');
        assert(reference.uri.startsWith('ipfs://'), '4. uri carries the CID as an ipfs:// locator');
        assert(reference.uri !== 'ipfs://' + reference.hash, '5. the CID and the content hash are two different strings — a locator is never an identity');
        assert(reference.storage === 'ipfs', '6. storage is tagged ipfs');
        assert(reference.size === bytes.length, '7. size is preserved');

        const retrieved = await store.get(reference);
        assert(retrieved === bytes, '8. get() retrieves exactly the bytes that were put');
        assert(reference.verify(retrieved), '9. retrieved bytes verify against their own content reference');
    }
    console.log('✓ Section A: put()/get() round trip — hash identity is ours, CID is only ever a locator');

    // ---------------------------------------------------------------
    // Section B — a reference this store has no business resolving
    // ---------------------------------------------------------------
    {
        const { fetchImpl } = makeFakeIpfsNode();
        const store = new IpfsContentStore({ apiUrl: 'http://node-a.test:5001', fetchImpl });

        const localReference = new ContentReference({ hash: 'abc', storage: 'local', uri: null });
        assert(await store.get(localReference) === null, '1. a reference with no ipfs:// uri resolves to null, never throws');

        const otherStorageReference = new ContentReference({ hash: 'abc', storage: 'https', uri: 'https://example.com/abc' });
        assert(await store.get(otherStorageReference) === null, '2. a reference pointing at a different scheme is also null');
    }
    console.log('✓ Section B: a non-IPFS reference is simply not this store\'s content');

    // ---------------------------------------------------------------
    // Section C — has()
    // ---------------------------------------------------------------
    {
        const { fetchImpl } = makeFakeIpfsNode();
        const store = new IpfsContentStore({ apiUrl: 'http://node-a.test:5001', fetchImpl });

        const bytes = JSON.stringify({ present: true });
        const reference = await store.put(bytes);
        assert(await store.has(reference) === true, '1. has() is true for content this store actually has');

        const unknownReference = new ContentReference({ hash: 'zzz', storage: 'ipfs', uri: 'ipfs://bafyNEVERADDED' });
        assert(await store.has(unknownReference) === false, '2. has() is false, never thrown, for content this node does not have');
    }
    console.log('✓ Section C: has() — best-effort, never throws');

    // ---------------------------------------------------------------
    // Section D — availability failures never masquerade as anything else
    // ---------------------------------------------------------------
    {
        const downNode = makeFakeIpfsNode({ throwOnRequest: true });
        const downStore = new IpfsContentStore({ apiUrl: 'http://unreachable.test:5001', fetchImpl: downNode.fetchImpl });
        await expectRejects(() => downStore.put('{}'), '1. put() rejects with ContentUnavailableError when the node cannot be reached', ContentUnavailableError);
        await expectRejects(() => downStore.get(new ContentReference({ hash: 'x', uri: 'ipfs://bafyX' })),
            '2. get() rejects with ContentUnavailableError when the node cannot be reached', ContentUnavailableError);
        assert(await downStore.has(new ContentReference({ hash: 'x', uri: 'ipfs://bafyX' })) === false,
            '3. has() degrades to false rather than propagating the same failure');

        const addFailingNode = makeFakeIpfsNode({ failAdd: true });
        const addFailingStore = new IpfsContentStore({ apiUrl: 'http://node-a.test:5001', fetchImpl: addFailingNode.fetchImpl });
        await expectRejects(() => addFailingStore.put('{}'), '4. put() rejects with ContentUnavailableError on a non-2xx add response', ContentUnavailableError);

        const catFailingNode = makeFakeIpfsNode({ failCat: true });
        const catFailingStore = new IpfsContentStore({ apiUrl: 'http://node-a.test:5001', fetchImpl: catFailingNode.fetchImpl });
        const catFailingReference = await catFailingStore.put('{}');
        await expectRejects(() => catFailingStore.get(catFailingReference),
            '5. get() rejects with ContentUnavailableError on a non-2xx cat response, even for content this store itself just added', ContentUnavailableError);

        // A node that has never seen this CID at all — the "content is
        // valid but this particular node hasn't replicated it yet"
        // scenario the design conversation named directly.
        const emptyNode = makeFakeIpfsNode();
        const emptyStore = new IpfsContentStore({ apiUrl: 'http://node-b.test:5001', fetchImpl: emptyNode.fetchImpl });
        await expectRejects(() => emptyStore.get(new ContentReference({ hash: 'x', uri: 'ipfs://bafyNeverReplicatedHere' })),
            '6. get() rejects with ContentUnavailableError for a CID this node has never replicated', ContentUnavailableError);
    }
    console.log('✓ Section D: every network-shaped failure surfaces as ContentUnavailableError, never a generic Error or a silent success');

    console.log('\nAll IpfsContentStore tests passed.');
}

run().catch((error) => {
    console.error('IpfsContentStore.test.js FAILED:', error);
    process.exitCode = 1;
});
