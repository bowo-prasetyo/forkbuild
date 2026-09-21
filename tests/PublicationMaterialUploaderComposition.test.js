import { readFile } from 'node:fs/promises';
import { composePublicationMaterialUploader } from '../application/PublicationMaterialUploaderComposition.js';
import { ArweavePublicationMaterialUploader } from '../application/ArweavePublicationMaterialUploader.js';
import { ContentStorePublicationMaterialUploader } from '../application/ContentStorePublicationMaterialUploader.js';

// 0.9.670 — Publication Material Uploader Composition.
// See application/PublicationMaterialUploaderComposition.js's own header
// for the full report this closes: "Distribute Publication" always
// uploaded a Publication's material to Arweave, unconditionally, even when
// Nostr was the chosen Announcement/Discovery substrate — this file is the
// one place that is no longer true.
//
//   Section A: 'ar' (the default) builds a real, working ArweavePublicationMaterialUploader
//   Section B: 'ipfs' builds a real, working IPFS (local Kubo) uploader
//   Section C: 'remote-pinning' builds a real, working IPFS remote pinning uploader
//   Section D: an unrecognized materialStorage throws synchronously, before
//              any collaborator is constructed
//   Section E: each option bag is forwarded verbatim, never reinterpreted
//   Section F: selection, never fan-out — exactly one uploader per call
//   Section G: no I/O at construction time
//   Section H: architectural regression

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

function gatewayResponse(body, { status = 200 } = {}) {
    return new Response(body, { status });
}

function makeFakeSigner({ transactionId = 'FakeTransactionId0000000000000000' } = {}) {
    return { async sign(material) { return { id: transactionId, transaction: { data: material } }; } };
}

function makeFakeGateway({ handler } = {}) {
    const requests = [];
    async function fetchImpl(url, options) {
        requests.push({ url, options });
        return handler ? handler(url, options) : gatewayResponse('accepted');
    }
    return { requests, fetchImpl };
}

function makeFakeIpfsNode({ cid = 'QmFakeCid00000000000000000000000000000001' } = {}) {
    const requests = [];
    async function fetchImpl(url, options) {
        requests.push({ url, options });
        if (url.includes('/api/v0/add')) {
            return gatewayResponse(JSON.stringify({ Hash: cid }));
        }
        return gatewayResponse('not found', { status: 404 });
    }
    return { requests, fetchImpl };
}

function makeFakeRemotePinningService({ cid = 'QmFakePinnedCid000000000000000000000001' } = {}) {
    const requests = [];
    async function fetchImpl(url, options) {
        requests.push({ url, options });
        return gatewayResponse(JSON.stringify({ cid }));
    }
    return { requests, fetchImpl };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — 'ar' (the default) builds a real Arweave uploader.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway();
        const signer = makeFakeSigner({ transactionId: 'FlagshipArweaveTransactionId1234567' });

        const uploaderDefault = composePublicationMaterialUploader({
            arweaveUploaderOptions: { signer, fetchImpl: gateway.fetchImpl }
        });
        assert(uploaderDefault instanceof ArweavePublicationMaterialUploader, '1. an omitted materialStorage builds an ArweavePublicationMaterialUploader — the historical default, unchanged');
        assert(uploaderDefault.storage === 'ar', '2. its storage label is "ar"');

        const uploaderExplicit = composePublicationMaterialUploader({
            materialStorage: 'ar',
            arweaveUploaderOptions: { signer, fetchImpl: gateway.fetchImpl }
        });
        const uri = await uploaderExplicit.upload('serialized material');
        assert(uri === 'ar://FlagshipArweaveTransactionId1234567', '3. an explicit "ar" selection produces a real, working uploader — real upload() round-trip');

        console.log('✓ Section A: \'ar\' (the default) builds a real, working ArweavePublicationMaterialUploader');
    }

    // ---------------------------------------------------------------
    // Section B — 'ipfs' builds a real local-Kubo-backed uploader.
    // ---------------------------------------------------------------
    {
        const node = makeFakeIpfsNode({ cid: 'QmLocalKuboFlagshipCid0000000000000001' });

        const uploader = composePublicationMaterialUploader({
            materialStorage: 'ipfs',
            ipfsNodeOptions: { apiUrl: 'http://127.0.0.1:5001', fetchImpl: node.fetchImpl }
        });
        assert(uploader instanceof ContentStorePublicationMaterialUploader, '4. an "ipfs" selection builds a ContentStorePublicationMaterialUploader — never ArweavePublicationMaterialUploader');
        assert(uploader.storage === 'ipfs', '5. its storage label is "ipfs"');

        const uri = await uploader.upload('serialized material');
        assert(uri === 'ipfs://QmLocalKuboFlagshipCid0000000000000001', '6. a real upload() round-trip against the injected local Kubo node produces the real returned CID, wrapped as ipfs://');
        assert(node.requests.some((r) => r.url.includes('/api/v0/add')), '7. the local Kubo node\'s own /api/v0/add endpoint was genuinely contacted');

        console.log('✓ Section B: \'ipfs\' builds a real, working IPFS (local Kubo) uploader — never Arweave');
    }

    // ---------------------------------------------------------------
    // Section C — 'remote-pinning' builds a real HTTP-pinning-backed
    // uploader — the substrate that closes the real reported bug: no
    // wallet, no signer, needed at all.
    // ---------------------------------------------------------------
    {
        const service = makeFakeRemotePinningService({ cid: 'QmRemotePinningFlagshipCid00000000001' });

        const uploader = composePublicationMaterialUploader({
            materialStorage: 'remote-pinning',
            remotePinningProviderOptions: { endpoint: 'https://api.pinata.cloud/pinning/pinFileToIPFS', fetchImpl: service.fetchImpl }
        });
        assert(uploader instanceof ContentStorePublicationMaterialUploader, '8. a "remote-pinning" selection builds a ContentStorePublicationMaterialUploader — never ArweavePublicationMaterialUploader');
        assert(uploader.storage === 'ipfs', '9. its storage label is "ipfs" — remote pinning is a MECHANISM choice, the resulting locator is still an ipfs:// scheme, exactly like ui/views/WorldView.js\'s own pre-existing Snapshot Remote Pinning path already reports');

        const uri = await uploader.upload('serialized material');
        assert(uri === 'ipfs://QmRemotePinningFlagshipCid00000000001', '10. a real upload() round-trip against the injected remote pinning service produces the real returned CID, wrapped as ipfs://');
        assert(service.requests.length === 1, '11. the remote pinning endpoint was contacted exactly once');
        assert(!('signer' in (service.requests[0].options || {})), '12. no signer/wallet field of any kind is ever involved in this path');

        console.log('✓ Section C: \'remote-pinning\' builds a real, working IPFS remote-pinning uploader — no wallet or signer required, closing the real reported bug');
    }

    // ---------------------------------------------------------------
    // Section D — an unrecognized materialStorage throws synchronously.
    // ---------------------------------------------------------------
    {
        expectThrows(() => composePublicationMaterialUploader({ materialStorage: 'bitcoin' }),
            '13. an unrecognized materialStorage throws synchronously, before any collaborator is constructed');
        expectThrows(() => composePublicationMaterialUploader({ materialStorage: '' }),
            '14. an empty-string materialStorage throws synchronously — never silently degrades to a default');

        console.log('✓ Section D: an unrecognized materialStorage throws synchronously, before any collaborator is ever constructed');
    }

    // ---------------------------------------------------------------
    // Section E — each option bag is forwarded verbatim.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway();
        const signer = makeFakeSigner();
        const arUploader = composePublicationMaterialUploader({
            materialStorage: 'ar',
            arweaveUploaderOptions: { signer, fetchImpl: gateway.fetchImpl, gatewayUrl: 'https://custom-gateway.example' }
        });
        assert(arUploader.gatewayUrl === 'https://custom-gateway.example', '15. a custom gatewayUrl reaches the composed Arweave uploader unmodified');

        const node = makeFakeIpfsNode();
        const ipfsUploader = composePublicationMaterialUploader({
            materialStorage: 'ipfs',
            ipfsNodeOptions: { apiUrl: 'http://custom-kubo.example:5001', fetchImpl: node.fetchImpl }
        });
        assert(ipfsUploader.storage === 'ipfs', '16. a custom apiUrl still reaches a real, working IPFS uploader');
        await ipfsUploader.upload('x');
        assert(node.requests[0].url.startsWith('http://custom-kubo.example:5001'), '17. the custom apiUrl reaches the composed local Kubo uploader unmodified, never a hardcoded default');

        console.log('✓ Section E: each option bag (arweaveUploaderOptions/ipfsNodeOptions/remotePinningProviderOptions) is forwarded verbatim to its own collaborator\'s constructor, never reinterpreted');
    }

    // ---------------------------------------------------------------
    // Section F — selection, never fan-out.
    // ---------------------------------------------------------------
    {
        const gateway = makeFakeGateway();
        const signer = makeFakeSigner();
        const node = makeFakeIpfsNode();
        const service = makeFakeRemotePinningService();

        const uploader = composePublicationMaterialUploader({
            materialStorage: 'ipfs',
            arweaveUploaderOptions: { signer, fetchImpl: gateway.fetchImpl },
            ipfsNodeOptions: { fetchImpl: node.fetchImpl },
            remotePinningProviderOptions: { endpoint: 'https://pin.example/pin', fetchImpl: service.fetchImpl }
        });
        await uploader.upload('material');
        assert(node.requests.length === 1, '18. the selected substrate (ipfs) is genuinely contacted');
        assert(gateway.requests.length === 0, '19. the non-selected Arweave option bag is never consulted — no fan-out, no accidental dual-upload');
        assert(service.requests.length === 0, '20. the non-selected remote-pinning option bag is never consulted either');

        console.log('✓ Section F: selection, never fan-out — exactly one uploader is built and used per call, the other option bags are never read');
    }

    // ---------------------------------------------------------------
    // Section G — no I/O at construction time.
    // ---------------------------------------------------------------
    {
        let contacted = false;
        const neverCalledFetch = async () => { contacted = true; return gatewayResponse('should never be reached'); };

        composePublicationMaterialUploader({ materialStorage: 'ar', arweaveUploaderOptions: { signer: makeFakeSigner(), fetchImpl: neverCalledFetch } });
        composePublicationMaterialUploader({ materialStorage: 'ipfs', ipfsNodeOptions: { fetchImpl: neverCalledFetch } });
        composePublicationMaterialUploader({ materialStorage: 'remote-pinning', remotePinningProviderOptions: { endpoint: 'https://pin.example/pin', fetchImpl: neverCalledFetch } });

        assert(contacted === false, '21. constructing any of the three uploaders performs no I/O of its own — construction only');

        console.log('✓ Section G: composePublicationMaterialUploader() performs no I/O — construction only, for every materialStorage choice');
    }

    // ---------------------------------------------------------------
    // Section H — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/PublicationMaterialUploaderComposition.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert((codeOnly.match(/\bexport\s+function\b/g) || []).length === 1, '22. exports exactly one function — no second entry point');
        assert(!/\btry\s*{/.test(codeOnly), '23. no try/catch anywhere — a genuine construction failure is never caught here, only forwarded');
        assert(!/\bfetch\(/.test(codeOnly), '24. never calls fetch(...) directly — no network access of its own, only through a composed collaborator');

        const forbiddenTerms = ['retry', 'cache', 'dedup', 'queue', 'schedule', 'fallback', 'failover'];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `25. code must never use "${term}" — selection, never fan-out or fallback, at this boundary`);
        }

        console.log('✓ Section H: architectural regression — exactly one export, no try/catch, no direct fetch, no forbidden vocabulary');
    }

    console.log('\nAll PublicationMaterialUploaderComposition tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
