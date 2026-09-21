import { readFile } from 'node:fs/promises';
import { ContentStorePublicationMaterialUploader } from '../application/ContentStorePublicationMaterialUploader.js';

// 0.9.670 — Content-Store-Backed Publication Material Uploader.
// See application/ContentStorePublicationMaterialUploader.js's own header
// for the full report this closes.
//
//   Section A: flagship — material uploads through an injected contentStore
//              and resolves to its own reference uri
//   Section B: malformed material (missing/non-string/empty) resolves to
//              null, the contentStore is never consulted
//   Section C: a genuine contentStore.put() rejection propagates, never
//              swallowed as null
//   Section D: a contentStore that resolves but names no uri throws —
//              never degrades to null
//   Section E: storage getter mirrors the injected contentStore's own
//              storage label
//   Section F: constructor validation — a contentStore without put()/
//              storage throws synchronously
//   Section G: no caching — two calls issue two fresh put() calls
//   Section H: architectural regression — duck-typed, no content/ import

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectRejects(promise, message) {
    let rejected = false;
    try { await promise; } catch { rejected = true; }
    assert(rejected, message);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

function makeFakeContentStore({ storage = 'ipfs', handler } = {}) {
    const calls = [];
    async function put(bytes) {
        calls.push(bytes);
        return handler ? handler(bytes) : { uri: `ipfs://fake-cid-${calls.length}`, hash: 'fake-hash', storage };
    }
    return { storage, put, calls };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — flagship.
    // ---------------------------------------------------------------
    {
        const store = makeFakeContentStore({ handler: () => ({ uri: 'ipfs://QmFlagship', hash: 'h', storage: 'ipfs' }) });
        const uploader = new ContentStorePublicationMaterialUploader({ contentStore: store });

        const uri = await uploader.upload('serialized material');
        assert(uri === 'ipfs://QmFlagship', '1. FLAGSHIP — upload() resolves to exactly the contentStore\'s own reference uri');
        assert(store.calls.length === 1 && store.calls[0] === 'serialized material', '2. FLAGSHIP — the contentStore\'s own put() was called exactly once, with the material verbatim');

        console.log('✓ Section A: material uploads through an injected contentStore and resolves to its own reference uri');
    }

    // ---------------------------------------------------------------
    // Section B — malformed material degrades to null.
    // ---------------------------------------------------------------
    {
        const store = makeFakeContentStore();
        const uploader = new ContentStorePublicationMaterialUploader({ contentStore: store });

        assert(await uploader.upload(undefined) === null, '3. undefined material resolves to null');
        assert(await uploader.upload(null) === null, '4. null material resolves to null');
        assert(await uploader.upload(42) === null, '5. non-string material resolves to null');
        assert(await uploader.upload('') === null, '6. empty string material resolves to null');
        assert(store.calls.length === 0, '7. the contentStore is never consulted for malformed material');

        console.log('✓ Section B: malformed material (missing/non-string/empty) resolves to null, the contentStore is never consulted');
    }

    // ---------------------------------------------------------------
    // Section C — a genuine contentStore rejection propagates.
    // ---------------------------------------------------------------
    {
        const store = {
            storage: 'ipfs',
            async put() { throw new Error('pinning service unreachable'); }
        };
        const uploader = new ContentStorePublicationMaterialUploader({ contentStore: store });

        await expectRejects(uploader.upload('material'), '8. a genuine contentStore.put() rejection propagates rather than degrading to null');

        console.log('✓ Section C: a genuine contentStore.put() rejection propagates, never swallowed as null');
    }

    // ---------------------------------------------------------------
    // Section D — a contentStore resolving with no usable uri throws.
    // ---------------------------------------------------------------
    {
        const noUriStore = makeFakeContentStore({ handler: () => ({ hash: 'h', storage: 'ipfs' }) });
        const uploader1 = new ContentStorePublicationMaterialUploader({ contentStore: noUriStore });
        let threw1 = false;
        try { await uploader1.upload('material'); } catch { threw1 = true; }
        assert(threw1, '9. a contentStore resolving with no uri field throws rather than resolving null');

        const emptyUriStore = makeFakeContentStore({ handler: () => ({ uri: '', hash: 'h', storage: 'ipfs' }) });
        const uploader2 = new ContentStorePublicationMaterialUploader({ contentStore: emptyUriStore });
        let threw2 = false;
        try { await uploader2.upload('material'); } catch { threw2 = true; }
        assert(threw2, '10. a contentStore resolving with an empty-string uri throws rather than resolving null');

        const nullResultStore = makeFakeContentStore({ handler: () => null });
        const uploader3 = new ContentStorePublicationMaterialUploader({ contentStore: nullResultStore });
        let threw3 = false;
        try { await uploader3.upload('material'); } catch { threw3 = true; }
        assert(threw3, '11. a contentStore resolving null entirely throws rather than resolving null');

        console.log('✓ Section D: a contentStore that resolves but names no usable uri throws — never degrades to null');
    }

    // ---------------------------------------------------------------
    // Section E — storage getter mirrors the injected contentStore.
    // ---------------------------------------------------------------
    {
        const ipfsStore = makeFakeContentStore({ storage: 'ipfs' });
        const ipfsUploader = new ContentStorePublicationMaterialUploader({ contentStore: ipfsStore });
        assert(ipfsUploader.storage === 'ipfs', '12. storage getter mirrors an ipfs-labeled contentStore');

        const customStore = makeFakeContentStore({ storage: 'custom-substrate' });
        const customUploader = new ContentStorePublicationMaterialUploader({ contentStore: customStore });
        assert(customUploader.storage === 'custom-substrate', '13. storage getter mirrors whatever label the injected contentStore self-identifies with, never hardcoded');

        console.log('✓ Section E: storage getter mirrors the injected contentStore\'s own storage label, never a hardcoded value');
    }

    // ---------------------------------------------------------------
    // Section F — constructor validation.
    // ---------------------------------------------------------------
    {
        expectThrows(() => new ContentStorePublicationMaterialUploader({}), '14. a missing contentStore throws synchronously at construction');
        expectThrows(() => new ContentStorePublicationMaterialUploader({ contentStore: {} }), '15. a contentStore with no put() function throws synchronously');
        expectThrows(() => new ContentStorePublicationMaterialUploader({ contentStore: { put: async () => {} } }), '16. a contentStore with no non-empty storage label throws synchronously');
        expectThrows(() => new ContentStorePublicationMaterialUploader({ contentStore: { put: async () => {}, storage: '' } }), '17. a contentStore with an empty-string storage label throws synchronously');

        console.log('✓ Section F: constructor validation — a contentStore without put()/a non-empty storage throws synchronously, before any upload is ever attempted');
    }

    // ---------------------------------------------------------------
    // Section G — no caching.
    // ---------------------------------------------------------------
    {
        const store = makeFakeContentStore();
        const uploader = new ContentStorePublicationMaterialUploader({ contentStore: store });

        const first = await uploader.upload('same material');
        const second = await uploader.upload('same material');
        assert(store.calls.length === 2, '18. two calls to upload() issue two fresh contentStore.put() calls — no caching, no deduplication');
        assert(first !== second, '19. two fresh calls produce two independently-resolved uris, exactly as the fake contentStore itself produces');

        console.log('✓ Section G: no caching or deduplication — every call to upload() consults the contentStore fresh');
    }

    // ---------------------------------------------------------------
    // Section H — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/ContentStorePublicationMaterialUploader.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/^import/m.test(codeOnly), '20. no imports at all — contentStore is duck-typed, never a concrete content/ class');
        assert(!codeOnly.includes('fetch('), '21. never calls fetch() directly — all I/O stays entirely the injected contentStore\'s own');
        assert((codeOnly.match(/\bexport\s+class\b/g) || []).length === 1, '22. exports exactly one class — no second entry point');

        const forbiddenTerms = ['retry', 'cache', 'dedup', 'queue', 'schedule'];
        for (const term of forbiddenTerms) {
            assert(!codeOnly.toLowerCase().includes(term.toLowerCase()), `23. code must never use "${term}" — no retry/caching/scheduling vocabulary at this boundary`);
        }

        console.log('✓ Section H: architectural regression — no imports, duck-typed only, exactly one export, no forbidden vocabulary');
    }

    console.log('\nAll ContentStorePublicationMaterialUploader tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
