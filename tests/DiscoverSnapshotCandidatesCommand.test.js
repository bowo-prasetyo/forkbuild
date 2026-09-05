import { readFile } from 'node:fs/promises';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';

// 0.9.150 — Snapshot Candidate Discovery Command.
// See docs/Roadmap.md, "0.9.150 — Snapshot Candidate Discovery Command,"
// for the full milestone story, and 0.9.149's own "Recommendation," which
// named this file by its intended shape before it existed.
//
//   Section A: a missing/malformed discoveryQueryService throws
//              synchronously, before search() is ever called
//   Section B: FLAGSHIP — discoveryTag is forwarded to search() verbatim,
//              and its own candidate array is returned unchanged, in the
//              same order, across heterogeneous candidates
//   Section C: ordering is preserved exactly as the query service
//              reported it — no ranking, no sorting
//   Section D: an empty discovery result ([]) is a valid, unmodified
//              result
//   Section E: works with only a discovery query service — no
//              ContentStore is ever required or read
//   Section F: never performs retrieval or verification of any kind
//   Section G: introduces no attribution/trust/ranking vocabulary
//   Section H: a genuine rejection from the query service propagates
//              unchanged — no invented failure taxonomy
//   Section I: architectural regression — no imports of ContentStore,
//              DecentralizedSnapshotResolver, or
//              SnapshotPublicationAttribution; search() called from
//              exactly one place

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — a missing/malformed discoveryQueryService throws
    // synchronously.
    // ---------------------------------------------------------------
    {
        expectThrows(() => executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'tag' }),
            '1. no discoveryQueryService supplied — throws synchronously');
        expectThrows(() => executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'tag', discoveryQueryService: {} }),
            '2. a discoveryQueryService with no search() function — throws synchronously');
        expectThrows(() => executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'tag', discoveryQueryService: { search: 'not-a-function' } }),
            '3. a discoveryQueryService whose search is not a function — throws synchronously');

        console.log('✓ Section A: a missing/malformed discoveryQueryService throws synchronously, never reaching a call');
    }

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: verbatim forwarding, verbatim result, across
    // heterogeneous candidates.
    // ---------------------------------------------------------------
    {
        let receivedTag = null;
        const fakeCandidates = Object.freeze([
            Object.freeze({ contentHash: 'hash-A', locator: 'ar://locator-a', storage: 'ar' }),
            Object.freeze({ contentHash: 'hash-B', locator: 'ipfs://locator-b', storage: 'ipfs' }),
            Object.freeze({ contentHash: 'hash-C', locator: 'ar://locator-c', storage: 'ar' })
        ]);
        const discoveryQueryService = {
            search(discoveryTag) {
                receivedTag = discoveryTag;
                return Promise.resolve(fakeCandidates);
            }
        };

        const result = await executeDiscoverSnapshotCandidatesCommand({
            discoveryTag: 'forkbuild-snapshot',
            discoveryQueryService
        });

        assert(receivedTag === 'forkbuild-snapshot', '4. discoveryTag is forwarded verbatim');
        assert(result === fakeCandidates, '5. the query service\'s own candidate array is returned unchanged — the exact same reference, never re-described or re-wrapped');
        assert(result.length === 3, '6. every candidate is preserved — none dropped');
        assert(result[0].contentHash === 'hash-A' && result[1].contentHash === 'hash-B' && result[2].contentHash === 'hash-C',
            '7. heterogeneous candidates (different contentHash/locator/storage) all survive intact');

        console.log('✓ Section B: FLAGSHIP — discoveryTag is forwarded verbatim, and the full heterogeneous candidate collection is returned unchanged');
    }

    // ---------------------------------------------------------------
    // Section C — ordering is preserved exactly, no ranking/sorting.
    // ---------------------------------------------------------------
    {
        const arrivalOrder = [
            { contentHash: 'hash-third', locator: 'ar://third', storage: 'ar' },
            { contentHash: 'hash-first', locator: 'ar://first', storage: 'ar' },
            { contentHash: 'hash-second', locator: 'ar://second', storage: 'ar' }
        ];
        const discoveryQueryService = { search: async () => arrivalOrder };

        const result = await executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'tag', discoveryQueryService });

        assert(result[0].contentHash === 'hash-third' && result[1].contentHash === 'hash-first' && result[2].contentHash === 'hash-second',
            '8. relay arrival order survives verbatim — no alphabetical, hash, or any other sort is applied');

        console.log('✓ Section C: discovery/relay arrival order is preserved verbatim — no ranking or sorting is introduced');
    }

    // ---------------------------------------------------------------
    // Section D — an empty discovery result is a valid, unmodified
    // result.
    // ---------------------------------------------------------------
    {
        const emptyResult = Object.freeze([]);
        const discoveryQueryService = { search: async () => emptyResult };

        const result = await executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'tag', discoveryQueryService });

        assert(result === emptyResult, '9. an empty candidate array is returned unchanged, never substituted with null/undefined/a fabricated shape');
        assert(result.length === 0, '10. zero candidates is a valid, ordinary result, not a failure');

        console.log('✓ Section D: an empty discovery result ([]) is returned unchanged as a valid result');
    }

    // ---------------------------------------------------------------
    // Section E — works with only a discovery query service; no
    // ContentStore is ever required or read.
    // ---------------------------------------------------------------
    {
        const discoveryQueryService = { search: async () => [{ contentHash: 'hash', locator: 'ar://loc', storage: 'ar' }] };

        const result = await executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'tag', discoveryQueryService });

        assert(Array.isArray(result) && result.length === 1, '11. the command completes fully with only a discoveryQueryService — no contentStore argument exists in its contract');

        console.log('✓ Section E: the command works with only a discovery query service — no ContentStore of any kind is involved');
    }

    // ---------------------------------------------------------------
    // Section F — never performs retrieval or verification of any kind.
    // ---------------------------------------------------------------
    {
        let searchCalls = 0;
        const discoveryQueryService = {
            search: async () => {
                searchCalls += 1;
                return [{ contentHash: 'hash', locator: 'ar://loc', storage: 'ar' }];
            },
            // If the command ever called these, this test would catch it —
            // no production collaborator this command receives exposes a
            // get()/retrieve()/verify() method to call in the first place.
            get: async () => { throw new Error('retrieval must never be invoked by this command'); },
            verify: async () => { throw new Error('verification must never be invoked by this command'); }
        };

        await executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'tag', discoveryQueryService });

        assert(searchCalls === 1, '12. search() is called exactly once, and no retrieval/verification collaborator method is ever reached');

        console.log('✓ Section F: the command never invokes retrieval or verification of any kind — search() alone is called');
    }

    // ---------------------------------------------------------------
    // Section G — no attribution/trust/ranking vocabulary of any kind.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/DiscoverSnapshotCandidatesCommand.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/MATCH|NO_MATCH|MATCHED|ATTRIBUTED|\bOWNED\b|TRUSTED|AUTHENTIC|\bRANK\b|\bSCORE\b|PREFERRED/i.test(codeOnly),
            '13. this file introduces no MATCH/NO_MATCH/attribution/trust/ranking vocabulary of its own');

        console.log('✓ Section G: no MATCH/NO_MATCH or attribution/trust/ranking vocabulary exists in this path');
    }

    // ---------------------------------------------------------------
    // Section H — a genuine rejection propagates unchanged; no invented
    // failure taxonomy.
    // ---------------------------------------------------------------
    {
        const discoveryQueryService = {
            search() {
                return Promise.reject(new Error('the discovery query service genuinely failed'));
            }
        };

        let threw = false;
        let message = null;
        try {
            await executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'tag', discoveryQueryService });
        } catch (error) {
            threw = true;
            message = error.message;
        }
        assert(threw && message === 'the discovery query service genuinely failed',
            '14. a genuine rejection from the query service propagates unchanged, never swallowed or reclassified');

        console.log('✓ Section H: a genuine collaborator rejection propagates unchanged — no new failure taxonomy invented for this command');
    }

    // ---------------------------------------------------------------
    // Section I — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/DiscoverSnapshotCandidatesCommand.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/^import /m.test(codeOnly),
            '15. this file imports nothing — no query service class, no resolver, no content store, no attribution, no composition root');
        assert(!codeOnly.includes('ContentStore'), '16. never imports/references ContentStore');
        assert(!codeOnly.includes('DecentralizedSnapshotResolver'), '17. never imports/references DecentralizedSnapshotResolver');
        assert(!codeOnly.includes('SnapshotPublicationAttribution'), '18. never imports/references SnapshotPublicationAttribution');
        assert(!codeOnly.includes('executeDiscoverSnapshotCommand'), '19. never imports/calls the separate, existing resolution command');
        assert((codeOnly.match(/discoveryQueryService\.search\(/g) || []).length === 1,
            '20. discoveryQueryService.search() is called from exactly one place');
        assert(!/new NostrSnapshotDiscoveryQueryService|new DecentralizedSnapshotResolver|new ArweaveContentStore/.test(codeOnly),
            '21. this file never constructs discovery/resolution infrastructure itself');
        assert(!codeOnly.includes('.sort(') && !codeOnly.includes('.filter(') && !codeOnly.includes('Set('),
            '22. no sorting, filtering, or deduplication of the returned candidate collection');

        console.log('✓ Section I: architectural regression — a pure assembly boundary, no algorithm and no infrastructure of its own, structurally decoupled from resolution/retrieval/attribution');
    }

    console.log('\n✅ All Discover Snapshot Candidates Command tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
