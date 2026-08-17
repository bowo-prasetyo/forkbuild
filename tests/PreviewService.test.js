import { PreviewService } from '../application/PreviewService.js';
import { PreviewType } from '../core/DocumentPreview.js';

// 0.2.32 — PreviewService's queue/cache/cancellation logic, tested
// with a FAKE renderer and a FAKE document loader — no real Three.js,
// no real WebGL. That path (renderer/DocumentThumbnailRenderer.js
// actually turning a Document into pixels) is verified visually via
// Playwright screenshots instead, the same line this project has drawn
// for every renderer-touching concern all session (WorldNavigationSession's
// stubbed renderer sessions, WorldLocationBrowser's host-resolves-
// component-renders convention, etc.) — this file proves the SERVICE
// behaves correctly regardless of what the renderer actually draws.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// A fake document loader: documentId -> a trivial "document" object
// (PreviewService never inspects its shape beyond handing it to the
// renderer) — or throws for ids registered as "missing".
function makeFakeLoader(documents, missingIds = new Set()) {
    return {
        execute(documentId) {
            if (missingIds.has(documentId)) {
                throw new Error(`fake loader: no document "${documentId}"`);
            }
            if (!documents.has(documentId)) {
                throw new Error(`fake loader: unregistered id "${documentId}"`);
            }
            return documents.get(documentId);
        }
    };
}

// A fake renderer: records every document it was asked to render (in
// order) and returns a deterministic "image" string derived from the
// document's own marker — never from anything publication-shaped.
function makeFakeRenderer(calls) {
    return {
        renderDocument(document) {
            calls.push(document);
            return `fake-image:${document.marker}`;
        }
    };
}

function makePublication({ documentId, contentHash, title = 'Untitled', author = 'anon' }) {
    return { documentId, contentHash, title, author };
}

async function runTests() {
    // -------------------------------------------------------------
    // 1-3. Basic generation, from actual document content — and nothing
    //      else. Two publications sharing a documentId/contentHash but
    //      carrying DIFFERENT titles/authors produce the identical
    //      cached preview: the renderer only ever sees the loaded
    //      Document, never publication metadata.
    // -------------------------------------------------------------
    {
        const calls = [];
        const documents = new Map([['doc-1', { marker: 'doc-1-content' }]]);
        const service = new PreviewService({
            loadPublicationDocumentUseCase: makeFakeLoader(documents),
            createRenderer: () => makeFakeRenderer(calls)
        });

        const pubA = makePublication({ documentId: 'doc-1', contentHash: 'hash-1', title: 'Castle', author: 'alice' });
        const pubB = makePublication({ documentId: 'doc-1', contentHash: 'hash-1', title: 'Totally Different Name', author: 'bob' });

        assert(service.getCached('hash-1') === null, '1. nothing cached before any request');

        const resultA = await service.request(pubA).promise;
        assert(resultA.type === PreviewType.THUMBNAIL && resultA.image === 'fake-image:doc-1-content',
            '2. request() resolves with a THUMBNAIL rendered from the actual document content');

        const resultB = await service.request(pubB).promise;
        assert(resultB.image === resultA.image,
            '3. a publication with a DIFFERENT title/author but the SAME contentHash gets the identical cached preview — user metadata cannot determine the preview');
        assert(calls.length === 1, '3b. and the renderer was invoked only ONCE — the second request was a pure cache hit');
    }

    // -------------------------------------------------------------
    // 4-5. Different contentHash values never share a cache entry —
    //      a genuinely different revision gets its own render.
    // -------------------------------------------------------------
    {
        const calls = [];
        const documents = new Map([
            ['doc-a', { marker: 'content-a' }],
            ['doc-b', { marker: 'content-b' }]
        ]);
        const service = new PreviewService({
            loadPublicationDocumentUseCase: makeFakeLoader(documents),
            createRenderer: () => makeFakeRenderer(calls)
        });

        const resultA = await service.request(makePublication({ documentId: 'doc-a', contentHash: 'hash-a' })).promise;
        const resultB = await service.request(makePublication({ documentId: 'doc-b', contentHash: 'hash-b' })).promise;
        assert(resultA.image !== resultB.image, '4. two different contentHash values produce two different rendered images');
        assert(calls.length === 2, '5. and the renderer really was invoked twice — no accidental sharing');
    }

    // -------------------------------------------------------------
    // 6. Cache hit avoids re-rendering even across many repeated
    //    requests for the same contentHash.
    // -------------------------------------------------------------
    {
        const calls = [];
        const documents = new Map([['doc-1', { marker: 'x' }]]);
        const service = new PreviewService({
            loadPublicationDocumentUseCase: makeFakeLoader(documents),
            createRenderer: () => makeFakeRenderer(calls)
        });
        const pub = makePublication({ documentId: 'doc-1', contentHash: 'hash-1' });
        await service.request(pub).promise;
        await service.request(pub).promise;
        await service.request(pub).promise;
        assert(calls.length === 1, '6. three requests for the same contentHash render exactly once');
    }

    // -------------------------------------------------------------
    // 7-8. Cancellation actually prevents work, not just the promise
    //      resolving late: a fully-cancelled job (its only waiter
    //      cancels before the queue reaches it) never invokes the
    //      renderer at all.
    // -------------------------------------------------------------
    {
        const calls = [];
        const documents = new Map([
            ['doc-cancel', { marker: 'cancel-me' }],
            ['doc-sentinel', { marker: 'sentinel' }]
        ]);
        const service = new PreviewService({
            loadPublicationDocumentUseCase: makeFakeLoader(documents),
            createRenderer: () => makeFakeRenderer(calls)
        });

        const { cancel } = service.request(makePublication({ documentId: 'doc-cancel', contentHash: 'hash-cancel' }));
        cancel();

        // A sentinel request submitted right after: since the queue
        // drains one job at a time in order, once the sentinel's own
        // promise resolves, the cancelled job (if it had still been in
        // the queue) would already have been reached and skipped.
        await service.request(makePublication({ documentId: 'doc-sentinel', contentHash: 'hash-sentinel' })).promise;

        assert(calls.length === 1 && calls[0].marker === 'sentinel',
            '7. the cancelled job\'s document was never loaded/rendered — only the sentinel was');
        assert(service.getCached('hash-cancel') === null,
            '8. and nothing was ever cached for the cancelled request');
    }

    // -------------------------------------------------------------
    // 9. Cancelling ONE waiter of a job that still has other waiters
    //    does not cancel the job itself — the remaining waiter still
    //    gets its result.
    // -------------------------------------------------------------
    {
        const calls = [];
        const documents = new Map([['doc-shared', { marker: 'shared' }]]);
        const service = new PreviewService({
            loadPublicationDocumentUseCase: makeFakeLoader(documents),
            createRenderer: () => makeFakeRenderer(calls)
        });
        const pub = makePublication({ documentId: 'doc-shared', contentHash: 'hash-shared' });

        const first = service.request(pub);
        const second = service.request(pub);
        first.cancel();
        const result = await second.promise;
        assert(result !== null && result.image === 'fake-image:shared',
            '9. the surviving waiter still receives its result after a sibling waiter cancels');
    }

    // -------------------------------------------------------------
    // 10-11. Priority: a request marked priority runs before
    //        earlier-queued, non-priority requests.
    // -------------------------------------------------------------
    {
        const calls = [];
        const documents = new Map([
            ['doc-1', { marker: 'one' }],
            ['doc-2', { marker: 'two' }],
            ['doc-3', { marker: 'three-urgent' }]
        ]);
        const service = new PreviewService({
            loadPublicationDocumentUseCase: makeFakeLoader(documents),
            createRenderer: () => makeFakeRenderer(calls)
        });

        // Queue two ordinary requests, THEN one priority request —
        // without awaiting in between, so all three are queued before
        // any of them runs.
        const p1 = service.request(makePublication({ documentId: 'doc-1', contentHash: 'h1' })).promise;
        const p2 = service.request(makePublication({ documentId: 'doc-2', contentHash: 'h2' })).promise;
        const p3 = service.request(makePublication({ documentId: 'doc-3', contentHash: 'h3' }), { priority: true }).promise;

        await Promise.all([p1, p2, p3]);
        assert(calls[0].marker === 'three-urgent',
            '10. the priority request was rendered FIRST, despite being queued last');
        assert(calls.length === 3, '11. all three still eventually ran');
    }

    // -------------------------------------------------------------
    // 12-13. Failure isolation: a document that fails to load resolves
    //        with null (never throws, never rejects), and the queue
    //        keeps running afterward.
    // -------------------------------------------------------------
    {
        const calls = [];
        const documents = new Map([['doc-good', { marker: 'good' }]]);
        const service = new PreviewService({
            loadPublicationDocumentUseCase: makeFakeLoader(documents, new Set(['doc-missing'])),
            createRenderer: () => makeFakeRenderer(calls)
        });

        const failedResult = await service.request(makePublication({ documentId: 'doc-missing', contentHash: 'hash-missing' })).promise;
        assert(failedResult === null, '12. a missing document resolves with null, not a thrown/rejected error');

        const goodResult = await service.request(makePublication({ documentId: 'doc-good', contentHash: 'hash-good' })).promise;
        assert(goodResult !== null && goodResult.image === 'fake-image:good',
            '13. a later, valid request still succeeds — one failure never breaks the queue');
    }

    // -------------------------------------------------------------
    // 14-15. LRU eviction: once the cache exceeds maxCacheEntries, the
    //        least-recently-used entry is evicted, not an arbitrary one.
    // -------------------------------------------------------------
    {
        const calls = [];
        const documents = new Map([
            ['doc-1', { marker: '1' }], ['doc-2', { marker: '2' }], ['doc-3', { marker: '3' }]
        ]);
        const service = new PreviewService({
            loadPublicationDocumentUseCase: makeFakeLoader(documents),
            createRenderer: () => makeFakeRenderer(calls),
            maxCacheEntries: 2
        });

        await service.request(makePublication({ documentId: 'doc-1', contentHash: 'hash-1' })).promise;
        await service.request(makePublication({ documentId: 'doc-2', contentHash: 'hash-2' })).promise;
        await service.request(makePublication({ documentId: 'doc-3', contentHash: 'hash-3' })).promise;

        assert(service.getCached('hash-1') === null, '14. the oldest entry (hash-1) was evicted once the cache exceeded its 2-entry limit');
        assert(service.getCached('hash-2') !== null && service.getCached('hash-3') !== null,
            '15. the two more recent entries both remain cached');
    }

    // -------------------------------------------------------------
    // 16-17. Lazy, at-most-once renderer construction: the thunk is
    //        never called at PreviewService construction time, and a
    //        thunk that throws is never retried on a later request.
    // -------------------------------------------------------------
    {
        let constructCalls = 0;
        const documents = new Map([['doc-1', { marker: 'x' }], ['doc-2', { marker: 'y' }]]);
        const service = new PreviewService({
            loadPublicationDocumentUseCase: makeFakeLoader(documents),
            createRenderer: () => {
                constructCalls++;
                throw new Error('WebGL unavailable (simulated)');
            }
        });
        assert(constructCalls === 0, '16. the renderer thunk is not invoked merely by constructing PreviewService');

        const r1 = await service.request(makePublication({ documentId: 'doc-1', contentHash: 'h1' })).promise;
        const r2 = await service.request(makePublication({ documentId: 'doc-2', contentHash: 'h2' })).promise;
        assert(r1 === null && r2 === null, '16b. both requests degrade to null when the renderer cannot be constructed');
        assert(constructCalls === 1, '17. the thunk was invoked exactly once — a failed construction is never retried');
    }

    // -------------------------------------------------------------
    // 18. Nothing renders synchronously: calling request() several
    //     times in a row, without awaiting, triggers zero renderer
    //     calls until control is actually yielded back to the queue —
    //     proving generation is genuinely deferred/lazy, not merely
    //     wrapped in a Promise around synchronous work.
    // -------------------------------------------------------------
    {
        const calls = [];
        const documents = new Map([
            ['doc-1', { marker: '1' }], ['doc-2', { marker: '2' }], ['doc-3', { marker: '3' }],
            ['doc-4', { marker: '4' }], ['doc-5', { marker: '5' }]
        ]);
        const service = new PreviewService({
            loadPublicationDocumentUseCase: makeFakeLoader(documents),
            createRenderer: () => makeFakeRenderer(calls)
        });

        const promises = [1, 2, 3, 4, 5].map((i) =>
            service.request(makePublication({ documentId: `doc-${i}`, contentHash: `hash-${i}` })).promise);
        assert(calls.length === 0, '18. no rendering has happened synchronously right after five request() calls');

        await Promise.all(promises);
        assert(calls.length === 5, '18b. but all five eventually complete once the queue actually drains');
    }

    console.log('✅ All Preview Service tests passed.');
}

// Top-level await, not the fire-and-forget `runTests().catch(...)`
// every other test file in this suite uses: this file is the first in
// the suite whose async work involves REAL macrotask scheduling
// (requestIdleCallback/setTimeout inside PreviewService's queue, not
// just chained microtasks) — dynamic import() only waits for a
// module's SYNCHRONOUS top-level evaluation to finish, so the
// fire-and-forget pattern would let the test runner's harness (see
// tests.html) mark this file "Passed" and move on to the next one
// before runTests() has actually finished running, silently
// under-reporting any failure that occurs after that point. Top-level
// await makes import() itself wait for runTests() to settle, so a
// rejection here correctly fails THIS file in the harness's own
// try/catch, not some later, unrelated file's.
await runTests();
