import { readFile } from 'node:fs/promises';
import { compareSnapshotWorldPublications, WorldSnapshotContentComparison } from '../application/WorldSnapshotComparison.js';

// 0.9.181 — World Snapshot Comparison.
//
// Unit coverage for the one new pure module this milestone introduces:
// `application/WorldSnapshotComparison.js`. See that file's own header for
// the full rationale — in particular why this comparison is deliberately
// source-family agnostic (it reads only `publicationId`/`contentHash`, off
// of whatever descriptor it's handed, never a `sourceFamily`/`kind`), and
// why it is never called "duplicate detection" (two Publications sharing a
// `contentHash` remain two independent World objects; this file states a
// fact, never a removal recommendation).
//
//   Section A: same Publication compared against itself — same identity,
//              and (when contentHash is known) same content.
//   Section B: different Publications, same contentHash -> SAME_CONTENT.
//   Section C: different Publications, different contentHash ->
//              DIFFERENT_CONTENT.
//   Section D: position never affects the verdict, in either direction.
//   Section E: locator/storage fields, if present on either descriptor,
//              never affect the verdict.
//   Section F: source-family agnosticism — SNAPSHOT vs LOCAL, and SNAPSHOT
//              vs PEER, comparisons with a shared contentHash.
//   Section G: differing source/origin fields never alter the result.
//   Section H: a missing/ambiguous side produces no comparison.
//   Section I: malformed input degrades honestly, never guesses.
//   Section J: purity — frozen results, no mutation of inputs, repeatable.
//   Section K: structural audit — no discovery/retrieval/materialization/
//              registry calls, no new World Encounter kind, no ranking/
//              trust/duplicate-detection vocabulary.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function descriptor(overrides = {}) {
    return Object.freeze({
        kind: 'PUBLICATION',
        objectId: 'pub-a',
        publicationId: 'pub-a',
        contentHash: 'hash-1',
        position: Object.freeze({ x: 0, y: 0, z: 0 }),
        ...overrides
    });
}

function run() {
    // ---------------------------------------------------------------
    // Section A — same Publication compared against itself.
    // ---------------------------------------------------------------
    {
        const a = descriptor();
        const b = descriptor();
        const result = compareSnapshotWorldPublications(a, b);
        assert(result !== null, '1. comparing a Publication against an identical descriptor produces a result');
        assert(result.samePublication === true, '2. identical publicationId -> samePublication true');
        assert(result.aPublicationId === 'pub-a' && result.bPublicationId === 'pub-a', '3. both publicationIds are reported, verbatim');
        assert(result.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT, '4. identical contentHash -> SAME_CONTENT, even for the same Publication');

        console.log('✓ Section A: comparing a Publication against itself reports same identity and same content');
    }

    // ---------------------------------------------------------------
    // Section B — different Publications, same contentHash.
    // ---------------------------------------------------------------
    {
        const a = descriptor({ objectId: 'pub-a', publicationId: 'pub-a', contentHash: 'hash-shared' });
        const b = descriptor({ objectId: 'pub-b', publicationId: 'pub-b', contentHash: 'hash-shared' });
        const result = compareSnapshotWorldPublications(a, b);
        assert(result.samePublication === false, '1. distinct publicationIds -> samePublication false');
        assert(result.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT, '2. identical contentHash -> SAME_CONTENT');
        assert(result.aPublicationId === 'pub-a' && result.bPublicationId === 'pub-b', '3. both distinct publicationIds remain independently visible — never collapsed by the shared contentHash');

        console.log('✓ Section B: two distinct Publications sharing an identical contentHash compare as SAME_CONTENT, while remaining two distinct Publications');
    }

    // ---------------------------------------------------------------
    // Section C — different Publications, different contentHash.
    // ---------------------------------------------------------------
    {
        const a = descriptor({ publicationId: 'pub-a', contentHash: 'hash-1' });
        const b = descriptor({ publicationId: 'pub-b', contentHash: 'hash-2' });
        const result = compareSnapshotWorldPublications(a, b);
        assert(result.samePublication === false, '1. distinct publicationIds -> samePublication false');
        assert(result.contentComparison === WorldSnapshotContentComparison.DIFFERENT_CONTENT, '2. distinct contentHash -> DIFFERENT_CONTENT');

        console.log('✓ Section C: two Publications with different contentHash compare as DIFFERENT_CONTENT');
    }

    // ---------------------------------------------------------------
    // Section D — position never affects the verdict.
    // ---------------------------------------------------------------
    {
        const a = descriptor({ publicationId: 'pub-a', contentHash: 'hash-shared', position: { x: 10, y: 20, z: 30 } });
        const b = descriptor({ publicationId: 'pub-b', contentHash: 'hash-shared', position: { x: -5, y: -5, z: -5 } });
        const result = compareSnapshotWorldPublications(a, b);
        assert(result.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT, '1. wildly different positions never change a SAME_CONTENT verdict');

        console.log('✓ Section D: position never affects the comparison verdict');
    }

    // ---------------------------------------------------------------
    // Section E — locator/storage fields never affect the verdict.
    // ---------------------------------------------------------------
    {
        const a = descriptor({ publicationId: 'pub-a', contentHash: 'hash-shared', locator: 'ar://tx-a', storage: 'arweave' });
        const b = descriptor({ publicationId: 'pub-b', contentHash: 'hash-shared', locator: 'ar://tx-b', storage: 'ipfs' });
        const result = compareSnapshotWorldPublications(a, b);
        assert(result.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT, '1. differing locator/storage fields never change a SAME_CONTENT verdict');

        console.log('✓ Section E: differing locator/storage fields never affect the comparison verdict');
    }

    // ---------------------------------------------------------------
    // Section F — source-family agnosticism.
    // ---------------------------------------------------------------
    {
        const snapshotDescriptor = descriptor({ publicationId: 'pub-snap', contentHash: 'hash-shared', sourceFamily: 'SNAPSHOT' });
        const localDescriptor = descriptor({ publicationId: 'pub-local', contentHash: 'hash-shared', sourceFamily: 'LOCAL' });
        const peerDescriptor = descriptor({ publicationId: 'pub-peer', contentHash: 'hash-shared', sourceFamily: 'PEER' });

        const snapshotVsLocal = compareSnapshotWorldPublications(snapshotDescriptor, localDescriptor);
        assert(snapshotVsLocal.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT, '1. SNAPSHOT vs LOCAL, same contentHash -> SAME_CONTENT');

        const snapshotVsPeer = compareSnapshotWorldPublications(snapshotDescriptor, peerDescriptor);
        assert(snapshotVsPeer.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT, '2. SNAPSHOT vs PEER, same contentHash -> SAME_CONTENT');

        console.log('✓ Section F: the comparison is source-family agnostic — SNAPSHOT/LOCAL/PEER combinations compare purely on contentHash');
    }

    // ---------------------------------------------------------------
    // Section G — differing source/origin fields never alter the result.
    // ---------------------------------------------------------------
    {
        const a = descriptor({ publicationId: 'pub-a', contentHash: 'hash-1', origin: 'snapshot:hash-1:pub-a' });
        const b = descriptor({ publicationId: 'pub-b', contentHash: 'hash-2', origin: 'peer:did:key:zPeer' });
        const result = compareSnapshotWorldPublications(a, b);
        assert(result.contentComparison === WorldSnapshotContentComparison.DIFFERENT_CONTENT, '1. differing origin strings never change the contentHash-driven verdict');
        assert(!('origin' in result), '2. origin is never forwarded onto the comparison result itself');

        console.log('✓ Section G: differing source/origin fields cannot alter the comparison result');
    }

    // ---------------------------------------------------------------
    // Section H — a missing/ambiguous side produces no comparison.
    // ---------------------------------------------------------------
    {
        assert(compareSnapshotWorldPublications(null, descriptor()) === null, '1. a null first argument -> null');
        assert(compareSnapshotWorldPublications(descriptor(), null) === null, '2. a null second argument -> null');
        assert(compareSnapshotWorldPublications(undefined, undefined) === null, '3. both sides missing -> null');
        assert(compareSnapshotWorldPublications() === null, '4. no arguments at all -> null, never throws');

        console.log('✓ Section H: a missing/ambiguous selection on either side produces no comparison');
    }

    // ---------------------------------------------------------------
    // Section I — malformed input degrades honestly, never guesses.
    // ---------------------------------------------------------------
    {
        assert(compareSnapshotWorldPublications({}, descriptor()) === null, '1. a descriptor with no publicationId at all -> null');
        assert(compareSnapshotWorldPublications({ publicationId: '' }, descriptor()) === null, '2. an empty-string publicationId -> null, never treated as a genuine identity');
        assert(compareSnapshotWorldPublications({ publicationId: 42 }, descriptor()) === null, '3. a non-string publicationId -> null');

        const missingHashOnOneSide = compareSnapshotWorldPublications(
            { publicationId: 'pub-a', contentHash: 'hash-1' },
            { publicationId: 'pub-b' }
        );
        assert(missingHashOnOneSide !== null, '4. identity is still comparable even when one side lacks contentHash');
        assert(missingHashOnOneSide.samePublication === false, '5. ...and samePublication is still correctly reported');
        assert(missingHashOnOneSide.contentComparison === null, '6. ...but contentComparison degrades to null rather than guessing DIFFERENT_CONTENT merely from absence');

        const nonStringHash = compareSnapshotWorldPublications(
            { publicationId: 'pub-a', contentHash: 'hash-1' },
            { publicationId: 'pub-b', contentHash: 42 }
        );
        assert(nonStringHash.contentComparison === null, '7. a non-string contentHash on either side degrades to null, never coerced/guessed');

        const emptyStringHash = compareSnapshotWorldPublications(
            { publicationId: 'pub-a', contentHash: 'hash-1' },
            { publicationId: 'pub-b', contentHash: '' }
        );
        assert(emptyStringHash.contentComparison === null, '8. an empty-string contentHash is treated as unknown, never as a genuine (empty) content identity');

        console.log('✓ Section I: malformed input degrades honestly — identity is reported whenever genuinely knowable, contentComparison degrades to null rather than guessing');
    }

    // ---------------------------------------------------------------
    // Section J — purity: frozen results, no mutation, repeatable.
    // ---------------------------------------------------------------
    {
        const a = descriptor({ publicationId: 'pub-a', contentHash: 'hash-1' });
        const b = descriptor({ publicationId: 'pub-b', contentHash: 'hash-1' });

        const first = compareSnapshotWorldPublications(a, b);
        const second = compareSnapshotWorldPublications(a, b);
        assert(JSON.stringify(first) === JSON.stringify(second), '1. calling twice with byte-identical arguments returns a byte-identical result');
        assert(Object.isFrozen(first), '2. the returned comparison is frozen');

        let threw = false;
        try { first.contentComparison = 'tampered'; } catch (e) { threw = true; }
        assert(first.contentComparison === WorldSnapshotContentComparison.SAME_CONTENT, "3. the frozen result's own contentComparison cannot be reassigned");

        assert(Object.isFrozen(a) && Object.isFrozen(b), '4. sanity — the inputs themselves stay frozen/unmutated');
        assert(Object.isFrozen(WorldSnapshotContentComparison), '5. the exported enum object is itself frozen');

        console.log('✓ Section J: compareSnapshotWorldPublications() is pure, frozen, and deterministic — no mutation of its own inputs or outputs');
    }

    // ---------------------------------------------------------------
    // Section K — structural audit.
    // ---------------------------------------------------------------
    return (async () => {
        const source = await readFile(new URL('../application/WorldSnapshotComparison.js', import.meta.url), 'utf8');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/fetch\(|localStorage|WebRTC|WorldDiscoverySourceRegistry|registry\.|deriveWorldEncounters\(|resolveSnapshotWorldPlacement\(|resolveSnapshotWorldPositionClaim\(|registerMaterializedSnapshotWorldSource\(|unregisterMaterializedSnapshotWorldSource\(/.test(codeOnly),
            '1. no I/O, no registry access, and no re-invocation of any upstream discovery/resolution/placement/registration function');
        assert(!/computeContentHash|sha256|crypto\./.test(codeOnly),
            '2. no hashing of any kind — contentHash is only ever compared as an opaque already-known string, never recomputed');
        assert(!/rank|trust|verified|best|preferred|reliable|freshness|quality|score/i.test(codeOnly),
            '3. no rank/trust/verified/best/preferred/reliable/freshness/quality/score vocabulary anywhere in the new module\'s own executable code');
        assert(!/duplicate/i.test(codeOnly),
            '4. no "duplicate" vocabulary of any kind — this file states a content fact, never a deduplication/removal policy (see the module\'s own header)');
        assert(!/Nostr|Arweave/i.test(codeOnly),
            '5. no Nostr/Arweave-specific vocabulary — this file operates entirely on already-known, source-agnostic facts');
        assert(!/sourceFamily|WorldEncounterPresentationSourceFamily/.test(codeOnly),
            '6. no sourceFamily/kind gating of any kind — the comparison is deliberately source-family agnostic (see the module\'s own header)');
        assert(!/WorldEncounterKind|new.*Kind\b/.test(codeOnly),
            '7. no new World Encounter kind is introduced');

        console.log('✓ Section K: structural sweep — no I/O, no registry access, no re-invocation of upstream discovery/resolution/placement/registration, no hashing, no rank/trust/duplicate vocabulary, no sourceFamily gating, no new World Encounter kind');

        console.log('\n✅ All World Snapshot Comparison tests passed.');
    })();
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
