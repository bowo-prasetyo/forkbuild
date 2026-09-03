import { readFile } from 'node:fs/promises';
import { executeDiscoverWorldEncounterPublicationCommand } from '../application/DiscoverWorldEncounterPublicationCommand.js';

// 0.9.111 — World View Decentralized Publication Retrieval.
// See docs/Roadmap.md, "0.9.111 — World View Decentralized Publication
// Retrieval," for the full milestone story.
//
//   Section A: a missing/malformed runtime throws synchronously, before the
//              runtime is ever called
//   Section B: FLAGSHIP — objectId/discoveryTag/publications are forwarded
//              to runtime.discoverWorldEncounterPublication() verbatim, and
//              its own result is returned unchanged, not re-described
//   Section C: a genuine rejection from the runtime propagates unchanged
//   Section D: architectural regression

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
    // Section A — a missing/malformed runtime throws synchronously.
    // ---------------------------------------------------------------
    {
        expectThrows(() => executeDiscoverWorldEncounterPublicationCommand({ objectId: 'pub-1', discoveryTag: 'tag' }),
            '1. no runtime supplied — throws synchronously');
        expectThrows(() => executeDiscoverWorldEncounterPublicationCommand({ objectId: 'pub-1', discoveryTag: 'tag', runtime: {} }),
            '2. a runtime with no discoverWorldEncounterPublication() function — throws synchronously');
        expectThrows(() => executeDiscoverWorldEncounterPublicationCommand({ objectId: 'pub-1', discoveryTag: 'tag', runtime: { discoverWorldEncounterPublication: 'not-a-function' } }),
            '3. a runtime whose discoverWorldEncounterPublication is not a function — throws synchronously');

        console.log('✓ Section A: a missing/malformed runtime throws synchronously, never reaching a call');
    }

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: verbatim forwarding, verbatim result.
    // ---------------------------------------------------------------
    {
        let receivedArgs = null;
        const fakeResult = Object.freeze({
            discovery: Object.freeze({ arweave: [] }),
            resolution: Object.freeze({ status: 'RESOLVED' }),
            inspection: Object.freeze({ loading: { status: 'AVAILABLE' }, verification: { status: 'VERIFIED' } })
        });
        const runtime = {
            discoverWorldEncounterPublication(args) {
                receivedArgs = args;
                return Promise.resolve(fakeResult);
            }
        };

        const publications = [{ id: 'local-pub-1' }];
        const result = await executeDiscoverWorldEncounterPublicationCommand({
            objectId: 'pub-1',
            discoveryTag: 'forkbuild-tag',
            publications,
            runtime
        });

        assert(receivedArgs.objectId === 'pub-1', '4. objectId is forwarded verbatim');
        assert(receivedArgs.discoveryTag === 'forkbuild-tag', '5. discoveryTag is forwarded verbatim');
        assert(receivedArgs.publications === publications, '6. publications is forwarded verbatim — the exact same reference, never copied or re-derived');
        assert(result === fakeResult, '7. the runtime\'s own result is returned unchanged — the exact same reference, never re-described or re-wrapped');

        console.log('✓ Section B: objectId/discoveryTag/publications are forwarded verbatim, and the runtime\'s own result is returned unchanged');
    }

    // ---------------------------------------------------------------
    // Section C — a genuine rejection propagates unchanged.
    // ---------------------------------------------------------------
    {
        const runtime = {
            discoverWorldEncounterPublication() {
                return Promise.reject(new Error('the discovery service genuinely failed'));
            }
        };

        let threw = false;
        let message = null;
        try {
            await executeDiscoverWorldEncounterPublicationCommand({ objectId: 'pub-1', discoveryTag: 'tag', runtime });
        } catch (error) {
            threw = true;
            message = error.message;
        }
        assert(threw && message === 'the discovery service genuinely failed',
            '8. a genuine rejection from the runtime propagates unchanged, never swallowed or reclassified');

        console.log('✓ Section C: a genuine collaborator rejection propagates unchanged');
    }

    // ---------------------------------------------------------------
    // Section D — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/DiscoverWorldEncounterPublicationCommand.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/^import /m.test(codeOnly),
            '9. this file imports nothing — no discovery service, no lead registry, no material source, no verifier, no composition root');
        assert(!/TRUSTED|UNTRUSTED|\bSAFE\b|UNSAFE|AUTHENTIC|SUSPICIOUS|\bRANK\b|\bSCORE\b|PREFERRED/i.test(codeOnly),
            '10. this file introduces no trust/ranking vocabulary of its own');
        assert((codeOnly.match(/runtime\.discoverWorldEncounterPublication\(/g) || []).length === 1,
            '11. the runtime is called from exactly one place');
        assert(!/new ArweaveGraphqlDiscoveryQueryService|new NostrDiscoveryQueryService|new DecentralizedWorldDiscoveryLeadRegistry/.test(codeOnly),
            '12. this file never constructs discovery infrastructure itself');

        console.log('✓ Section D: architectural regression — a pure assembly boundary, no algorithm and no infrastructure of its own');
    }

    console.log('\n✅ All Discover World Encounter Publication Command tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
