import { IpfsGatewayContentStore } from '../content/IpfsGatewayContentStore.js';
import { IpfsContentStore, ContentUnavailableError } from '../content/IpfsContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.8.66 — IPFS Remote Gateway Resolution.
//
// Deterministic, network-free coverage of content/IpfsGatewayContentStore
// .js's own wire behavior — every scenario below runs against an injected
// `fetchImpl` standing in for a real HTTPS gateway, never a live one.
// Mirrors tests/IpfsContentStore.test.js's own structure exactly, section
// for section, so the two adapters' behavior at the content/ContentStore
// .js boundary can be compared directly.
//
//   Section A: same CID, two acquisition environments (a Kubo node and a
//              gateway) — same bytes in, same contentHash out, neither
//              backend distinguishable from the other by a caller
//   Section B: a reference with no ipfs:// uri is simply not this
//              store's content — get() returns null, never throws
//   Section C: has() — best-effort, never throws
//   Section D: every network-shaped failure (a thrown fetch, a 404, a
//              response body that cannot be read) becomes a
//              ContentUnavailableError — the SAME class content/
//              IpfsContentStore.js already throws, never a second,
//              gateway-specific concept
//   Section E: a gateway returning bytes that do not match the expected
//              content hash is never silently accepted — the CID stays a
//              locator, the content hash stays the identity
//   Section F: read-only — put() is not supported; no pin, no publish
//   Section G: no caching, no mutation, no network call during
//              construction
//   Section H: gateway configuration validation
//
// See docs/Principles.md, "A Locator Is Not The Content; A Gateway Is Not
// A Verdict (0.8.66)."

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

function fakeCid(text) {
    return 'bafyFAKE' + computeContentHash(text);
}

// A tiny in-memory stand-in for a Kubo node's HTTP RPC API — identical to
// tests/IpfsContentStore.test.js's own helper, reused here so Section A
// can populate a "network" with content/IpfsContentStore.js's own put().
function makeFakeIpfsNode({ network = new Map() } = {}) {
    async function fetchImpl(url, options) {
        const parsed = new URL(url);
        if (parsed.pathname === '/api/v0/add') {
            const blob = options.body.get('file');
            const text = await blob.text();
            const cid = fakeCid(text);
            network.set(cid, text);
            return new Response(JSON.stringify({ Hash: cid, Size: String(text.length) }), { status: 200 });
        }
        if (parsed.pathname === '/api/v0/cat') {
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

// A tiny in-memory stand-in for a public HTTPS IPFS gateway. `network` is
// a Map<cid, text> — sharing the SAME Map a fake Kubo node above just
// populated is exactly how Section A simulates a gateway that has
// genuinely replicated what a local node published, without either fake
// knowing the other exists.
function makeFakeGateway({
    network = new Map(),
    notFoundCids = new Set(),
    throwOnRequest = false,
    unreadableBody = false,
    tamperedCids = new Map()
} = {}) {
    async function fetchImpl(url) {
        if (throwOnRequest) {
            throw new Error('simulated connection failure');
        }
        const parsed = new URL(url);
        const match = parsed.pathname.match(/^\/ipfs\/(.+)$/);
        if (!match) {
            return new Response('not found', { status: 404 });
        }
        const cid = decodeURIComponent(match[1]);
        if (notFoundCids.has(cid) || !network.has(cid)) {
            return new Response('not found', { status: 404 });
        }
        if (tamperedCids.has(cid)) {
            return new Response(tamperedCids.get(cid), { status: 200 });
        }
        const text = network.get(cid);
        if (unreadableBody) {
            return {
                ok: true,
                status: 200,
                text: async () => { throw new Error('simulated body read failure'); }
            };
        }
        return new Response(text, { status: 200 });
    }
    return { network, fetchImpl };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — same CID, two acquisition environments
    // ---------------------------------------------------------------
    {
        const sharedNetwork = new Map();
        const kuboNode = makeFakeIpfsNode({ network: sharedNetwork });
        const kuboStore = new IpfsContentStore({ apiUrl: 'http://node-a.test:5001', fetchImpl: kuboNode.fetchImpl });

        const bytes = JSON.stringify({ hello: 'world' });
        const reference = await kuboStore.put(bytes);

        // The gateway is a SEPARATE fake, over the SAME underlying
        // network map — nothing here lets the gateway know it is
        // resolving content a Kubo node just published.
        const gateway = makeFakeGateway({ network: sharedNetwork });
        const gatewayStore = new IpfsGatewayContentStore({ gatewayUrl: 'https://gateway.test', fetchImpl: gateway.fetchImpl });
        assert(gatewayStore.gatewayUrl === 'https://gateway.test', '1. trailing slash handling — no slash to strip here, sanity check');

        const retrieved = await gatewayStore.get(reference);
        assert(retrieved === bytes, '2. gateway retrieves exactly the bytes Kubo published, given the same reference');
        assert(reference.verify(retrieved), '3. bytes retrieved via the gateway verify against the SAME content reference Kubo\'s own put() produced');
        assert(computeContentHash(retrieved) === reference.hash, '4. same content -> same ForkBuild content hash, regardless of acquisition backend');
        assert(reference.storage === 'ipfs', '5. the reference itself still names the ipfs scheme, not a specific backend');
        assert(gatewayStore.storage === 'ipfs', '6. the gateway store self-identifies under the same storage name as Kubo\'s own store');

        // Trailing slash on gatewayUrl is stripped, exactly like
        // content/IpfsContentStore.js#apiUrl.
        const slashedStore = new IpfsGatewayContentStore({ gatewayUrl: 'https://gateway.test/', fetchImpl: gateway.fetchImpl });
        assert(slashedStore.gatewayUrl === 'https://gateway.test', '7. trailing slash is stripped from gatewayUrl');
    }
    console.log('✓ Section A: same ipfs:// CID resolves identically through a local Kubo node and a remote gateway');

    // ---------------------------------------------------------------
    // Section B — a reference this store has no business resolving
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway();
        const store = new IpfsGatewayContentStore({ gatewayUrl: 'https://gateway.test', fetchImpl: gateway.fetchImpl });

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
        const network = new Map();
        const bytes = JSON.stringify({ present: true });
        const cid = fakeCid(bytes);
        network.set(cid, bytes);
        const gateway = makeFakeGateway({ network });
        const store = new IpfsGatewayContentStore({ gatewayUrl: 'https://gateway.test', fetchImpl: gateway.fetchImpl });

        const reference = new ContentReference({ hash: computeContentHash(bytes), storage: 'ipfs', uri: `ipfs://${cid}` });
        assert(await store.has(reference) === true, '1. has() is true for content this gateway actually serves');

        const unknownReference = new ContentReference({ hash: 'zzz', storage: 'ipfs', uri: 'ipfs://bafyNEVERSERVED' });
        assert(await store.has(unknownReference) === false, '2. has() is false, never thrown, for content this gateway does not have');
    }
    console.log('✓ Section C: has() — best-effort, never throws');

    // ---------------------------------------------------------------
    // Section D — availability failures never masquerade as anything else
    // ---------------------------------------------------------------
    {
        const downGateway = makeFakeGateway({ throwOnRequest: true });
        const downStore = new IpfsGatewayContentStore({ gatewayUrl: 'https://unreachable.test', fetchImpl: downGateway.fetchImpl });
        const reference = new ContentReference({ hash: 'x', uri: 'ipfs://bafyX' });
        await expectRejects(() => downStore.get(reference),
            '1. get() rejects with ContentUnavailableError when the gateway cannot be reached at all (timeout/network failure)', ContentUnavailableError);
        assert(await downStore.has(reference) === false, '2. has() degrades to false rather than propagating the same failure');

        const network = new Map();
        const notFoundGateway = makeFakeGateway({ network, notFoundCids: new Set(['bafyMISSING']) });
        const notFoundStore = new IpfsGatewayContentStore({ gatewayUrl: 'https://gateway.test', fetchImpl: notFoundGateway.fetchImpl });
        await expectRejects(() => notFoundStore.get(new ContentReference({ hash: 'x', uri: 'ipfs://bafyMISSING' })),
            '3. get() rejects with ContentUnavailableError on a gateway 404', ContentUnavailableError);

        const unreadableGateway = makeFakeGateway({ network: new Map([['bafyBROKEN', 'irrelevant']]), unreadableBody: true });
        const unreadableStore = new IpfsGatewayContentStore({ gatewayUrl: 'https://gateway.test', fetchImpl: unreadableGateway.fetchImpl });
        await expectRejects(() => unreadableStore.get(new ContentReference({ hash: 'x', uri: 'ipfs://bafyBROKEN' })),
            '4. get() rejects with ContentUnavailableError when the response body cannot be read (malformed response)', ContentUnavailableError);
    }
    console.log('✓ Section D: every network-shaped failure surfaces as the SAME ContentUnavailableError content/IpfsContentStore.js already throws');

    // ---------------------------------------------------------------
    // Section E — a gateway is not a verdict
    // ---------------------------------------------------------------
    {
        const expectedBytes = JSON.stringify({ authentic: true });
        const expectedHash = computeContentHash(expectedBytes);
        const cid = fakeCid(expectedBytes);
        const tamperedBytes = JSON.stringify({ authentic: false, injected: 'by a misbehaving or compromised gateway' });

        const tamperingGateway = makeFakeGateway({
            network: new Map([[cid, expectedBytes]]),
            tamperedCids: new Map([[cid, tamperedBytes]])
        });
        const store = new IpfsGatewayContentStore({ gatewayUrl: 'https://gateway.test', fetchImpl: tamperingGateway.fetchImpl });

        const reference = new ContentReference({ hash: expectedHash, algorithm: 'fnv1a-32', storage: 'ipfs', uri: `ipfs://${cid}` });
        const retrieved = await store.get(reference);

        assert(retrieved === tamperedBytes, '1. the store hands back exactly what the gateway returned — it never fabricates or corrects bytes');
        assert(retrieved !== expectedBytes, '2. sanity: the gateway really did return different bytes than what was originally published');
        assert(!reference.verify(retrieved), '3. the retrieved bytes do NOT verify against the expected content hash');
        assert(computeContentHash(retrieved) !== expectedHash, '4. the CID resolved successfully, but the content hash still disagrees — a locator is never accepted as identity');

        // Empty content is passed through exactly as received — never
        // special-cased, never treated as "no content" by this class.
        const emptyCid = 'bafyEMPTY';
        const emptyGateway = makeFakeGateway({ network: new Map([[emptyCid, '']]) });
        const emptyStore = new IpfsGatewayContentStore({ gatewayUrl: 'https://gateway.test', fetchImpl: emptyGateway.fetchImpl });
        const emptyResult = await emptyStore.get(new ContentReference({ hash: computeContentHash(''), uri: `ipfs://${emptyCid}` }));
        assert(emptyResult === '', '5. an empty body is returned as an empty string, not null and not an error');
    }
    console.log('✓ Section E: the CID stays a locator — a gateway serving different (or empty) bytes is never silently accepted as a verdict');

    // ---------------------------------------------------------------
    // Section F — read-only: no publishing, no pinning
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway();
        const store = new IpfsGatewayContentStore({ gatewayUrl: 'https://gateway.test', fetchImpl: gateway.fetchImpl });

        assert(typeof store.put === 'function', '1. put() still exists structurally (satisfies the ContentStore/registry interface)');
        await expectRejects(() => store.put('{"anything":true}'),
            '2. put() rejects — a read-only gateway cannot accept content for publishing');
        assert(typeof store.pin === 'undefined', '3. no pin() method exists');
        assert(typeof store.unpin === 'undefined', '4. no unpin() method exists');
        assert(typeof store.publish === 'undefined', '5. no publish() method exists');
    }
    console.log('✓ Section F: resolution only — put()/pin()/unpin()/publish() are not offered');

    // ---------------------------------------------------------------
    // Section G — no caching, no mutation, no network call at construction
    // ---------------------------------------------------------------
    {
        let requestCount = 0;
        const bytes = JSON.stringify({ counted: true });
        const cid = fakeCid(bytes);
        const network = new Map([[cid, bytes]]);
        async function countingFetch(url) {
            requestCount++;
            return makeFakeGateway({ network }).fetchImpl(url);
        }

        const store = new IpfsGatewayContentStore({ gatewayUrl: 'https://gateway.test', fetchImpl: countingFetch });
        assert(requestCount === 0, '1. constructing the store makes no network call at all');

        const reference = new ContentReference({ hash: computeContentHash(bytes), uri: `ipfs://${cid}` });
        const referenceUriBefore = reference.uri;
        await store.get(reference);
        await store.get(reference);
        assert(requestCount === 2, '2. get() is called against the network every time — no caching of any kind');
        assert(reference.uri === referenceUriBefore, '3. the reference handed in is never mutated');
    }
    console.log('✓ Section G: no caching, no mutation, no network call during construction');

    // ---------------------------------------------------------------
    // Section H — gateway configuration validation
    // ---------------------------------------------------------------
    {
        let threw = false;
        try { new IpfsGatewayContentStore({ gatewayUrl: '' }); } catch { threw = true; }
        assert(threw, '1. an empty gatewayUrl is rejected at construction');

        threw = false;
        try { new IpfsGatewayContentStore({ gatewayUrl: '   ' }); } catch { threw = true; }
        assert(threw, '2. a blank gatewayUrl is rejected at construction');

        threw = false;
        try { new IpfsGatewayContentStore({ gatewayUrl: undefined }); } catch { threw = true; }
        assert(threw === false, '3. omitting gatewayUrl falls back to the default gateway, never throws');

        const defaultStore = new IpfsGatewayContentStore({ fetchImpl: async () => new Response('', { status: 200 }) });
        assert(typeof defaultStore.gatewayUrl === 'string' && defaultStore.gatewayUrl.length > 0, '4. a default gatewayUrl is used when none is supplied');
    }
    console.log('✓ Section H: gateway configuration is validated explicitly, with an honest default');

    console.log('\nAll IpfsGatewayContentStore tests passed.');
}

run().catch((error) => {
    console.error('IpfsGatewayContentStore.test.js FAILED:', error);
    process.exitCode = 1;
});
