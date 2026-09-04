import { readFile } from 'node:fs/promises';
import { executeDiscoverSnapshotCommand } from '../application/DiscoverSnapshotCommand.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';

// 0.9.142 — World View Snapshot Discovery Command.
// See docs/Roadmap.md, "0.9.142 — World View Snapshot Discovery Command,"
// for the full milestone story.
//
//   Section A: a missing/malformed resolver throws synchronously, before
//              the resolver is ever called
//   Section B: FLAGSHIP — discoveryTag/contentHash/contentStore/
//              storeRegistry are forwarded to resolver.resolve() verbatim,
//              and its own result is returned unchanged, not re-described
//   Section C: a genuine rejection from the resolver propagates unchanged
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
    // Section A — a missing/malformed resolver throws synchronously.
    // ---------------------------------------------------------------
    {
        expectThrows(() => executeDiscoverSnapshotCommand({ discoveryTag: 'tag', contentHash: 'hash' }),
            '1. no resolver supplied — throws synchronously');
        expectThrows(() => executeDiscoverSnapshotCommand({ discoveryTag: 'tag', contentHash: 'hash', resolver: {} }),
            '2. a resolver with no resolve() function — throws synchronously');
        expectThrows(() => executeDiscoverSnapshotCommand({ discoveryTag: 'tag', contentHash: 'hash', resolver: { resolve: 'not-a-function' } }),
            '3. a resolver whose resolve is not a function — throws synchronously');

        console.log('✓ Section A: a missing/malformed resolver throws synchronously, never reaching a call');
    }

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: verbatim forwarding, verbatim result.
    // ---------------------------------------------------------------
    {
        let receivedTag = null;
        let receivedHash = null;
        let receivedOptions = null;
        const fakeResult = Object.freeze({
            outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED,
            bytes: 'the-bytes',
            candidates: Object.freeze([]),
            locator: 'ar://fake',
            storage: 'ar',
            reason: null
        });
        const resolver = {
            resolve(discoveryTag, contentHash, options) {
                receivedTag = discoveryTag;
                receivedHash = contentHash;
                receivedOptions = options;
                return Promise.resolve(fakeResult);
            }
        };

        const contentStore = { storage: 'ar' };
        const storeRegistry = { get() { return null; } };
        const result = await executeDiscoverSnapshotCommand({
            discoveryTag: 'forkbuild-snapshot',
            contentHash: 'abc123',
            resolver,
            contentStore,
            storeRegistry
        });

        assert(receivedTag === 'forkbuild-snapshot', '4. discoveryTag is forwarded verbatim');
        assert(receivedHash === 'abc123', '5. contentHash is forwarded verbatim');
        assert(receivedOptions.contentStore === contentStore, '6. contentStore is forwarded verbatim — the exact same reference');
        assert(receivedOptions.storeRegistry === storeRegistry, '7. storeRegistry is forwarded verbatim — the exact same reference');
        assert(result === fakeResult, '8. the resolver\'s own result is returned unchanged — the exact same reference, never re-described or re-wrapped');

        console.log('✓ Section B: discoveryTag/contentHash/contentStore/storeRegistry are forwarded verbatim, and the resolver\'s own result is returned unchanged');
    }

    // ---------------------------------------------------------------
    // Section B2 — contentStore/storeRegistry default to null when
    // omitted, never undefined.
    // ---------------------------------------------------------------
    {
        let receivedOptions = null;
        const resolver = {
            resolve(discoveryTag, contentHash, options) {
                receivedOptions = options;
                return Promise.resolve(null);
            }
        };
        await executeDiscoverSnapshotCommand({ discoveryTag: 'tag', contentHash: 'hash', resolver });
        assert(receivedOptions.contentStore === null && receivedOptions.storeRegistry === null,
            '9. contentStore/storeRegistry default to null when the caller supplies neither');

        console.log('✓ Section B2: omitted contentStore/storeRegistry default to null');
    }

    // ---------------------------------------------------------------
    // Section C — a genuine rejection propagates unchanged.
    // ---------------------------------------------------------------
    {
        const resolver = {
            resolve() {
                return Promise.reject(new Error('the resolver genuinely failed'));
            }
        };

        let threw = false;
        let message = null;
        try {
            await executeDiscoverSnapshotCommand({ discoveryTag: 'tag', contentHash: 'hash', resolver });
        } catch (error) {
            threw = true;
            message = error.message;
        }
        assert(threw && message === 'the resolver genuinely failed',
            '10. a genuine rejection from the resolver propagates unchanged, never swallowed or reclassified');

        console.log('✓ Section C: a genuine collaborator rejection propagates unchanged');
    }

    // ---------------------------------------------------------------
    // Section D — architectural regression.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../application/DiscoverSnapshotCommand.js', import.meta.url);
        const source = await readFile(sourceUrl, 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/^import /m.test(codeOnly),
            '11. this file imports nothing — no query service, no resolver class, no content store, no Publication, no composition root');
        assert(!/MATCHED|ATTRIBUTED|\bOWNED\b|TRUSTED|AUTHENTIC|\bRANK\b|\bSCORE\b|PREFERRED/i.test(codeOnly),
            '12. this file introduces no attribution/trust/ranking vocabulary of its own');
        assert((codeOnly.match(/resolver\.resolve\(/g) || []).length === 1,
            '13. the resolver is called from exactly one place');
        assert(!/new DecentralizedSnapshotResolver|new NostrSnapshotDiscoveryQueryService|new ArweaveContentStore|new SnapshotPlacementStoreRegistry/.test(codeOnly),
            '14. this file never constructs discovery/resolution infrastructure itself');
        assert(!codeOnly.includes('contentReference') && !codeOnly.includes('Publication'),
            '15. this file never reads a Publication\'s own contentReference — contentHash is always an explicit caller input');

        console.log('✓ Section D: architectural regression — a pure assembly boundary, no algorithm and no infrastructure of its own');
    }

    console.log('\n✅ All Discover Snapshot Command tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
