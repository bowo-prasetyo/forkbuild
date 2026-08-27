import { IpfsRemotePinningContentStore } from '../content/IpfsRemotePinningContentStore.js';
import { IpfsGatewayContentStore } from '../content/IpfsGatewayContentStore.js';
import { HttpPinningProvider, PinningRejectedError } from '../content/HttpPinningProvider.js';
import { ContentUnavailableError } from '../content/IpfsContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.8.67 — Explicit Remote IPFS Publishing via a Pinning Provider.
//
// Deterministic, network-free coverage of content/
// IpfsRemotePinningContentStore.js's own contract — every scenario below
// runs against an injected content/PinningProvider.js, never a live
// commercial service.
//
//   Section A: put() delegates to the provider, computes its own local
//              content hash independently of the CID, and produces a
//              ContentReference indistinguishable from content/
//              IpfsContentStore.js's own put()
//   Section B: creation-only — get()/has() are NOT implemented, the
//              exact mirror image of content/IpfsGatewayContentStore
//              .js's own resolution-only restriction
//   Section C: a provider's failure (either kind) propagates through
//              put() completely unchanged — no catching, no
//              reclassification, no retry
//   Section D: construction validation
//   Section E: end-to-end interop — content this class publishes is
//              retrievable, unmodified, through content/
//              IpfsGatewayContentStore.js against the SAME underlying
//              network, and verifies against the SAME ContentReference
//              this class's own put() returned — proving "gateway solves
//              reading, remote pinning solves creation" actually
//              composes into one working pipeline

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

// A tiny fake content/PinningProvider.js — pins into a shared `network`
// Map<cid, text>, exactly like tests/IpfsGatewayContentStore.test.js's
// own fake Kubo node does for content/IpfsContentStore.js's put().
function makeFakeProvider({ network = new Map(), name = 'fake-provider', shouldReject = false, shouldBeUnavailable = false } = {}) {
    let callCount = 0;
    return {
        name,
        network,
        async put(bytes) {
            callCount++;
            if (shouldReject) throw new PinningRejectedError('fake-provider: refused (simulated invalid credential)');
            if (shouldBeUnavailable) throw new ContentUnavailableError('fake-provider: unreachable (simulated)');
            const cid = 'bafyPIN' + computeContentHash(bytes);
            network.set(cid, bytes);
            return { cid };
        },
        get callCount() { return callCount; }
    };
}

// Reused from tests/IpfsGatewayContentStore.test.js's own helper shape —
// a tiny stand-in for a public HTTPS gateway, serving from whatever
// `network` map it is given.
function makeFakeGateway({ network = new Map() } = {}) {
    async function fetchImpl(url) {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/^\/ipfs\/(.+)$/);
        if (!match) return new Response('not found', { status: 404 });
        const cid = decodeURIComponent(match[1]);
        if (!network.has(cid)) return new Response('not found', { status: 404 });
        return new Response(network.get(cid), { status: 200 });
    }
    return { fetchImpl };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — a successful put()
    // ---------------------------------------------------------------
    {
        const provider = makeFakeProvider();
        const store = new IpfsRemotePinningContentStore({ provider });

        assert(store.storage === 'ipfs', '1. self-identifies under the shared ipfs scheme, same as Kubo and the gateway');
        assert(store.provider === provider, '2. the injected provider is exposed');

        const bytes = JSON.stringify({ hello: 'world' });
        const reference = await store.put(bytes);

        assert(reference instanceof ContentReference, '3. put() resolves with a real ContentReference');
        assert(reference.hash === computeContentHash(bytes), '4. the content hash is computed LOCALLY, from the bytes — not supplied by the provider');
        assert(reference.uri === `ipfs://bafyPIN${computeContentHash(bytes)}`, '5. the uri wraps the provider-returned CID with the ipfs:// scheme');
        assert(reference.storage === 'ipfs', '6. storage is stamped as ipfs, indistinguishable from a Kubo-created reference');
        assert(reference.verify(bytes), '7. the reference verifies against the exact bytes that were pinned');
    }
    console.log('✓ Section A: put() delegates to the provider and produces a reference indistinguishable from a local Kubo store\'s own');

    // ---------------------------------------------------------------
    // Section B — creation only, never resolution
    // ---------------------------------------------------------------
    {
        const store = new IpfsRemotePinningContentStore({ provider: makeFakeProvider() });
        const reference = new ContentReference({ hash: 'x', uri: 'ipfs://bafyX', storage: 'ipfs' });

        await expectRejects(() => Promise.resolve(store.get(reference)),
            '1. get() is not implemented — it inherits ContentStore\'s own unimplemented throw');
        await expectRejects(() => Promise.resolve(store.has(reference)),
            '2. has() is not implemented either — this store never claims to resolve anything');
        assert(typeof store.put === 'function', '3. put() is the one real capability this store offers');
    }
    console.log('✓ Section B: creation-only — the exact mirror image of content/IpfsGatewayContentStore.js\'s resolution-only restriction');

    // ---------------------------------------------------------------
    // Section C — provider failures propagate unchanged
    // ---------------------------------------------------------------
    {
        const rejectingStore = new IpfsRemotePinningContentStore({ provider: makeFakeProvider({ shouldReject: true }) });
        await expectRejects(() => rejectingStore.put('{}'),
            '1. a provider\'s definitive refusal propagates as PinningRejectedError, uncaught and unreclassified', PinningRejectedError);

        const unavailableStore = new IpfsRemotePinningContentStore({ provider: makeFakeProvider({ shouldBeUnavailable: true }) });
        await expectRejects(() => unavailableStore.put('{}'),
            '2. a provider\'s transient failure propagates as ContentUnavailableError, uncaught and unreclassified', ContentUnavailableError);

        const provider = makeFakeProvider();
        const store = new IpfsRemotePinningContentStore({ provider });
        await store.put('{}');
        assert(provider.callCount === 1, '3. put() calls the provider exactly once — no automatic retry');
    }
    console.log('✓ Section C: whatever the provider throws reaches the caller exactly as thrown — no catching, no retry, no fallback');

    // ---------------------------------------------------------------
    // Section D — construction validation
    // ---------------------------------------------------------------
    {
        let threw = false;
        try { new IpfsRemotePinningContentStore({}); } catch { threw = true; }
        assert(threw, '1. a missing provider is rejected at construction');

        threw = false;
        try { new IpfsRemotePinningContentStore({ provider: { notPut: true } }); } catch { threw = true; }
        assert(threw, '2. a provider with no put() method is rejected at construction');
    }
    console.log('✓ Section D: a real PinningProvider is required at construction — there is no default provider');

    // ---------------------------------------------------------------
    // Section E — end-to-end interop with the gateway
    // ---------------------------------------------------------------
    {
        const sharedNetwork = new Map();
        const pinningStore = new IpfsRemotePinningContentStore({ provider: makeFakeProvider({ network: sharedNetwork }) });

        const bytes = JSON.stringify({ published: 'via remote pinning' });
        const reference = await pinningStore.put(bytes);

        // The gateway is a completely separate class, over the SAME
        // underlying network — nothing here lets it know the content it
        // is resolving was ever pinned remotely rather than added by a
        // local Kubo node.
        const gateway = new IpfsGatewayContentStore({
            gatewayUrl: 'https://gateway.test',
            fetchImpl: makeFakeGateway({ network: sharedNetwork }).fetchImpl
        });

        const retrieved = await gateway.get(reference);
        assert(retrieved === bytes, '1. content published via remote pinning resolves, byte-for-byte, through the gateway');
        assert(reference.verify(retrieved), '2. the gateway-retrieved bytes verify against the SAME reference put() returned');
        assert(computeContentHash(retrieved) === reference.hash, '3. same content -> same ForkBuild content hash, regardless of which half of the pipeline touched it');
    }
    console.log('✓ Section E: "gateway solves reading, remote pinning solves creation" composes into one working, verifiable pipeline');

    console.log('\nAll IpfsRemotePinningContentStore tests passed.');
}

run().catch((error) => {
    console.error('IpfsRemotePinningContentStore.test.js FAILED:', error);
    process.exitCode = 1;
});
