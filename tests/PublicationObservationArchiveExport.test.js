import { computeContentHash } from '../serializer/contentHash.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/IpfsPublicationRecord.js';
import { IpfsPublicationContentVerificationCoordinatorState } from '../application/IpfsPublicationContentVerificationCoordinatorState.js';
import { BitcoinAnchorBroadcastState } from '../application/BitcoinAnchorBroadcastState.js';
import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import { BitcoinAnchorContentProofState } from '../application/BitcoinAnchorContentProofState.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { describePublicationObservationArchive } from '../application/PublicationObservationArchiveView.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { reconstructBitcoinAnchorPublicationLifecycleTimeline } from '../application/BitcoinAnchorPublicationLifecycleTimelineView.js';
import {
    PublicationObservationArchiveImportOutcome,
    exportPublicationObservationArchive,
    importPublicationObservationArchive
} from '../application/PublicationObservationArchiveExport.js';

// 0.8.82 — Durable Publication Archive Export & Import.
//
// The flagship this milestone exists to prove: two Bitcoin publication
// records sharing one contentHash, with interleaved broadcasts,
// confirmations, and content-proof observations, plus an IPFS publication
// and its own verification history — the complete six-collection archive —
// survives export → destroy every in-memory reference → import, with
// every durable fact, every reconstructed evidence bundle, and both
// publications' own lifecycle timelines byte-identical, zero network
// operations, and no evidence ever crossing between the two anchors.
//
//   Section A: FLAGSHIP — full six-collection archive, export, destroy,
//              import, reconstruct — identical facts, identical
//              timelines, zero cross-contamination, zero network calls
//   Section B: deterministic export — identical facts export to
//              byte-identical JSON, with no exportedAt or other field
//              export did not itself already hold
//   Section C: duplicate publication identities and duplicate
//              observations are preserved through the round trip, never
//              deduplicated
//   Section D: malformed/invalid input is INVALID_ARCHIVE, never a
//              silently returned empty archive — distinct from
//              PublicationObservationArchive.fromJSON()'s own storage
//              behavior, and a genuinely empty archive still imports
//              successfully
//   Section E: import never merges — repeated calls carry no state of
//              their own, and each import is independent of any other
//   Section F: no capability or credential field anywhere in exported
//              output
//   Section G: export requires a genuine archive instance and never
//              mutates it; import accepts both a raw string and an
//              already-parsed value

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const FORBIDDEN_CAPABILITY_KEYS = [
    'signPsbt', 'privateKey', 'seedPhrase', 'wallet', 'walletConnection', 'credential',
    'credentials', 'authHeader', 'authorizationHeader', 'apiKey', 'token', 'secret'
];

function assertNoCapabilityOrCredential(value, path) {
    if (typeof value === 'function') {
        throw new Error(`ASSERT FAILED: ${path} is a function — a capability leaked into exported output`);
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
        assert(
            !FORBIDDEN_CAPABILITY_KEYS.some((forbidden) => key.toLowerCase().includes(forbidden.toLowerCase())),
            `${path}.${key} looks like a capability or credential field — never allowed in exported output`
        );
        assertNoCapabilityOrCredential(child, `${path}.${key}`);
    }
}

async function withoutNetworkAccess(fn) {
    let networkCallOccurred = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (...args) => { networkCallOccurred = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch in this environment')); };
    try {
        return { result: await fn(), networkCallOccurred };
    } finally {
        globalThis.fetch = originalFetch;
    }
}

function confirmed({ txid, blockHash, blockHeight, confirmationCount, observedAt }) {
    return Object.freeze({
        state: BitcoinAnchorConfirmationState.CONFIRMED,
        txid, blockHash, blockHeight, confirmationCount, reason: null, observedAt
    });
}

function contentProof({ contentHash, observedAt, state = BitcoinAnchorContentProofState.HASH_MATCH }) {
    return Object.freeze({ state, contentHash, reason: null, observedAt });
}

const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);
const BLOCK_A = 'c'.repeat(64);
const BLOCK_B = 'd'.repeat(64);
const SHARED_CONTENT_HASH = 'e'.repeat(64);
const NETWORK = 'mainnet';
const IPFS_CONTENT_HASH = computeContentHash('ForkBuild archive export/import flagship content');
const IPFS_LOCATOR = 'ipfs://bafy-export-import-test';

function buildFlagshipArchive() {
    const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
    const anchorIdA = 'publication-A';
    const anchorIdB = 'publication-B';

    let archive = PublicationObservationArchive.empty();

    // IPFS side — one publication record, verified twice.
    const ipfsRecord = new IpfsPublicationRecord({
        contentHash: IPFS_CONTENT_HASH, locator: IPFS_LOCATOR,
        publishedAt: new Date('2026-07-01T00:00:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
    });
    archive = archive.appendIpfsPublicationRecord(ipfsRecord);
    const ipfsRecordIndex = archive.ipfsPublicationRecords.length - 1;
    archive = archive.appendIpfsContentVerificationObservation(ipfsRecordIndex, {
        state: IpfsPublicationContentVerificationCoordinatorState.HASH_MATCH,
        contentHash: IPFS_CONTENT_HASH, locator: IPFS_LOCATOR, reason: null, observedAt: new Date('2026-07-01T00:01:00Z')
    });
    archive = archive.appendIpfsContentVerificationObservation(ipfsRecordIndex, {
        state: IpfsPublicationContentVerificationCoordinatorState.UNAVAILABLE,
        contentHash: null, locator: IPFS_LOCATOR, reason: 'gateway timeout', observedAt: new Date('2026-07-01T00:02:00Z')
    });

    // Bitcoin side — two publication identities, one shared contentHash,
    // deliberately cross-interleaved append order.
    archive = useCase.execute(archive, { anchorId: anchorIdA, contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-07-01T01:00:00Z') });
    archive = useCase.execute(archive, { anchorId: anchorIdB, contentHash: SHARED_CONTENT_HASH, txid: TXID_B, network: NETWORK, createdAt: new Date('2026-07-01T01:00:30Z') });

    archive = archive.appendBitcoinConfirmationObservation(anchorIdA, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-07-01T01:20:00Z') }));
    archive = archive.appendBitcoinBroadcastRecord({ anchorId: anchorIdB, txid: TXID_B, state: BitcoinAnchorBroadcastState.BROADCASTED, broadcastedAt: new Date('2026-07-01T01:05:00Z') });
    archive = archive.appendBitcoinContentProofObservation(anchorIdA, contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-07-01T01:15:00Z') }));
    archive = archive.appendBitcoinConfirmationObservation(anchorIdB, confirmed({ txid: TXID_B, blockHash: BLOCK_B, blockHeight: 910000, confirmationCount: 1, observedAt: new Date('2026-07-01T01:25:00Z') }));
    archive = archive.appendBitcoinBroadcastRecord({ anchorId: anchorIdA, txid: TXID_A, state: BitcoinAnchorBroadcastState.BROADCASTED, broadcastedAt: new Date('2026-07-01T01:10:00Z') });
    archive = archive.appendBitcoinContentProofObservation(anchorIdB, contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-07-01T01:30:00Z') }));
    // A second confirmation each, so a chain-placement/consistency
    // derivation actually exists for both anchors.
    archive = archive.appendBitcoinConfirmationObservation(anchorIdA, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 6, observedAt: new Date('2026-07-01T01:40:00Z') }));
    archive = archive.appendBitcoinConfirmationObservation(anchorIdB, confirmed({ txid: TXID_B, blockHash: BLOCK_B, blockHeight: 910000, confirmationCount: 6, observedAt: new Date('2026-07-01T01:45:00Z') }));

    return { archive, anchorIdA, anchorIdB };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        let { archive, anchorIdA, anchorIdB } = buildFlagshipArchive();

        const originalArchiveJSON = archive.toJSON();
        const originalSummary = describePublicationObservationArchive(archive);
        const originalTimelineA = reconstructBitcoinAnchorPublicationLifecycleTimeline(archive, anchorIdA);
        const originalTimelineB = reconstructBitcoinAnchorPublicationLifecycleTimeline(archive, anchorIdB);

        assert(archive.publicationCount === 3, '1. publicationCount counts one IPFS record and two Bitcoin broadcasts');
        assert(archive.bitcoinAnchorPublicationRecordCount === 2, '2. two Bitcoin publication identities were minted');

        const { result: exported, networkCallOccurred: networkDuringExport } = await withoutNetworkAccess(
            () => exportPublicationObservationArchive(archive)
        );
        assert(!networkDuringExport, '3. exporting performs zero network operations');

        // Simulate a real file round trip: the exported payload becomes
        // raw text, exactly as it would sitting in a downloaded file.
        const exportedText = JSON.stringify(exported);

        // Destroy every in-memory reference.
        archive = null;

        const { result: importResult, networkCallOccurred: networkDuringImport } = await withoutNetworkAccess(
            () => importPublicationObservationArchive(exportedText)
        );
        assert(!networkDuringImport, '4. importing performs zero network operations');
        assert(importResult.outcome === PublicationObservationArchiveImportOutcome.IMPORTED, '5. a genuine export imports successfully');
        assert(importResult.archive instanceof PublicationObservationArchive, '6. import produces a genuine PublicationObservationArchive instance');

        const restored = importResult.archive;
        assert(JSON.stringify(restored.toJSON()) === JSON.stringify(originalArchiveJSON), '7. the restored archive serializes identically to the original');

        const restoredSummary = describePublicationObservationArchive(restored);
        assert(JSON.stringify(restoredSummary) === JSON.stringify(originalSummary), '8. the restored archive\'s reconstructed cross-domain summary is byte-identical to the original');

        const restoredTimelineA = reconstructBitcoinAnchorPublicationLifecycleTimeline(restored, anchorIdA);
        const restoredTimelineB = reconstructBitcoinAnchorPublicationLifecycleTimeline(restored, anchorIdB);
        assert(JSON.stringify(restoredTimelineA) === JSON.stringify(originalTimelineA), '9. Publication A\'s lifecycle timeline is byte-identical after export/import');
        assert(JSON.stringify(restoredTimelineB) === JSON.stringify(originalTimelineB), '10. Publication B\'s lifecycle timeline is byte-identical after export/import');

        // No evidence crossed between the two anchors.
        assert(restoredTimelineA.entries.every((e) => e.anchorId === anchorIdA), '11. every one of Publication A\'s restored entries names anchorId A');
        assert(restoredTimelineB.entries.every((e) => e.anchorId === anchorIdB), '12. every one of Publication B\'s restored entries names anchorId B');
        assert(!restoredTimelineA.entries.some((e) => e.txid === TXID_B), '13. Publication B\'s txid never appears in Publication A\'s restored timeline');
        assert(!restoredTimelineB.entries.some((e) => e.txid === TXID_A), '14. Publication A\'s txid never appears in Publication B\'s restored timeline');
        assert(restored.bitcoinConfirmationObservationsByAnchorId[anchorIdA].length === 2, '15. Publication A retains exactly its own two confirmation observations');
        assert(restored.bitcoinConfirmationObservationsByAnchorId[anchorIdB].length === 2, '16. Publication B retains exactly its own two confirmation observations');
    }
    console.log('✓ Section A: FLAGSHIP — full six-collection archive, export, destroy, import, reconstruct — identical facts, identical timelines, zero cross-contamination, zero network calls');

    // ---------------------------------------------------------------
    // Section B — deterministic export.
    // ---------------------------------------------------------------
    {
        const { archive: archiveA } = buildFlagshipArchive();
        const { archive: archiveB } = buildFlagshipArchive();

        const exportedA = exportPublicationObservationArchive(archiveA);
        const exportedB = exportPublicationObservationArchive(archiveB);
        assert(JSON.stringify(exportedA) === JSON.stringify(exportedB), '17. two independently built archives holding identical facts export to byte-identical JSON');

        const exportedAAgain = exportPublicationObservationArchive(archiveA);
        assert(JSON.stringify(exportedA) === JSON.stringify(exportedAAgain), '18. exporting the same archive twice produces byte-identical output — no exportedAt or other export-time field is ever inserted');
        assert(!('exportedAt' in exportedA), '19. the exported payload never carries an exportedAt field');
        assert(Object.keys(exportedA).sort().join(',') === Object.keys(archiveA.toJSON()).sort().join(','), '20. the exported payload carries exactly archive.toJSON()\'s own fields — no added envelope');
    }
    console.log('✓ Section B: deterministic export — identical facts export to byte-identical JSON, with no exportedAt or added envelope');

    // ---------------------------------------------------------------
    // Section C — duplicate identities and duplicate observations
    // preserved.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        let archive = PublicationObservationArchive.empty();

        const ipfsRecord = new IpfsPublicationRecord({
            contentHash: IPFS_CONTENT_HASH, locator: IPFS_LOCATOR,
            publishedAt: new Date('2026-07-02T00:00:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        });
        // The IDENTICAL record, appended twice — a duplicate publication
        // identity this archive never deduplicates.
        archive = archive.appendIpfsPublicationRecord(ipfsRecord);
        archive = archive.appendIpfsPublicationRecord(ipfsRecord);

        archive = useCase.execute(archive, { anchorId: 'dup-anchor', contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-07-02T00:00:00Z') });
        // The IDENTICAL confirmation observation, appended twice.
        const duplicateObservation = confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-07-02T00:10:00Z') });
        archive = archive.appendBitcoinConfirmationObservation('dup-anchor', duplicateObservation);
        archive = archive.appendBitcoinConfirmationObservation('dup-anchor', duplicateObservation);

        const { archive: restored } = importPublicationObservationArchive(exportPublicationObservationArchive(archive));
        assert(restored.ipfsPublicationRecords.length === 2, '21. two duplicate IPFS publication identities both survive the round trip');
        assert(JSON.stringify(restored.ipfsPublicationRecords[0].toJSON()) === JSON.stringify(restored.ipfsPublicationRecords[1].toJSON()), '22. the two duplicate records remain byte-identical to each other after the round trip');
        assert(restored.bitcoinConfirmationObservationsByAnchorId['dup-anchor'].length === 2, '23. two duplicate confirmation observations both survive the round trip — never deduplicated');
    }
    console.log('✓ Section C: duplicate publication identities and duplicate observations survive the round trip, never deduplicated');

    // ---------------------------------------------------------------
    // Section D — malformed/invalid input is INVALID_ARCHIVE, and a
    // genuinely empty archive still imports successfully.
    // ---------------------------------------------------------------
    {
        const malformedInputs = [
            'not even json{',
            JSON.stringify({ ...PublicationObservationArchive.empty().toJSON(), schemaVersion: 999 }),
            JSON.stringify({ ...PublicationObservationArchive.empty().toJSON(), extraUnexpectedField: true }),
            (() => { const j = PublicationObservationArchive.empty().toJSON(); delete j.bitcoinBroadcastRecords; return JSON.stringify(j); })(),
            null,
            undefined,
            42,
            'null',
            JSON.stringify([1, 2, 3])
        ];
        for (const input of malformedInputs) {
            const result = importPublicationObservationArchive(input);
            assert(result.outcome === PublicationObservationArchiveImportOutcome.INVALID_ARCHIVE, `24. malformed input is rejected as INVALID_ARCHIVE, saw outcome for ${JSON.stringify(input)}: ${result.outcome}`);
            assert(result.archive === null, `25. a rejected import never returns a partially reconstructed archive, saw for ${JSON.stringify(input)}`);
        }

        // A genuinely EMPTY archive is a different thing entirely — it is
        // valid, and imports successfully, never confused with malformed
        // input.
        const emptyResult = importPublicationObservationArchive(JSON.stringify(PublicationObservationArchive.empty().toJSON()));
        assert(emptyResult.outcome === PublicationObservationArchiveImportOutcome.IMPORTED, '26. a genuinely empty, well-formed archive imports successfully — never treated as malformed');
        assert(emptyResult.archive.publicationCount === 0 && emptyResult.archive.observationCount === 0, '27. the imported empty archive holds no facts');
    }
    console.log('✓ Section D: malformed input is INVALID_ARCHIVE, never a silently returned empty archive — a genuinely empty archive still imports');

    // ---------------------------------------------------------------
    // Section E — import never merges; each call is independent.
    // ---------------------------------------------------------------
    {
        const { archive: archiveX } = buildFlagshipArchive();
        let archiveY = PublicationObservationArchive.empty();
        archiveY = archiveY.appendIpfsPublicationRecord(new IpfsPublicationRecord({
            contentHash: computeContentHash('a completely different archive'), locator: 'ipfs://bafy-other',
            publishedAt: new Date('2026-07-03T00:00:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        }));

        importPublicationObservationArchive(exportPublicationObservationArchive(archiveX));
        const resultY = importPublicationObservationArchive(exportPublicationObservationArchive(archiveY));

        assert(resultY.archive.publicationCount === 1, '28. importing archive Y after archive X carries none of X\'s facts — importPublicationObservationArchive() holds no state of its own');
        assert(resultY.archive.bitcoinAnchorPublicationRecordCount === 0, '29. archive Y\'s import holds zero Bitcoin publication records, exactly as archive Y itself did');
        assert(JSON.stringify(resultY.archive.toJSON()) === JSON.stringify(archiveY.toJSON()), '30. the imported archive Y is exactly archive Y — never archive X merged with archive Y');
    }
    console.log('✓ Section E: import never merges — each call is independent, with no accumulated state of its own');

    // ---------------------------------------------------------------
    // Section F — no capability or credential field anywhere in
    // exported output.
    // ---------------------------------------------------------------
    {
        const { archive } = buildFlagshipArchive();
        const exported = exportPublicationObservationArchive(archive);
        assertNoCapabilityOrCredential(exported, 'exported');
    }
    console.log('✓ Section F: no capability or credential field anywhere in exported output');

    // ---------------------------------------------------------------
    // Section G — export requires a genuine archive instance and never
    // mutates it; import accepts both a raw string and an
    // already-parsed value.
    // ---------------------------------------------------------------
    {
        let threw = false;
        try {
            exportPublicationObservationArchive({ ipfsPublicationRecords: [] });
        } catch (error) {
            threw = true;
        }
        assert(threw, '31. exportPublicationObservationArchive() throws for a non-PublicationObservationArchive input, mirroring LocalStoragePublicationObservationArchive.save()\'s own contract');

        const { archive } = buildFlagshipArchive();
        const beforeJSON = JSON.stringify(archive.toJSON());
        exportPublicationObservationArchive(archive);
        assert(JSON.stringify(archive.toJSON()) === beforeJSON, '32. exporting an archive never mutates it');

        const exported = exportPublicationObservationArchive(archive);
        const viaString = importPublicationObservationArchive(JSON.stringify(exported));
        const viaObject = importPublicationObservationArchive(exported);
        assert(viaString.outcome === PublicationObservationArchiveImportOutcome.IMPORTED && viaObject.outcome === PublicationObservationArchiveImportOutcome.IMPORTED, '33. import accepts both a raw JSON string and an already-parsed value');
        assert(JSON.stringify(viaString.archive.toJSON()) === JSON.stringify(viaObject.archive.toJSON()), '34. both forms of input produce byte-identical archives');
    }
    console.log('✓ Section G: export requires a genuine archive instance and never mutates it; import accepts both a raw string and an already-parsed value');

    console.log('\nAll PublicationObservationArchiveExport tests passed.');
}

run().catch((error) => {
    console.error('PublicationObservationArchiveExport.test.js FAILED:', error);
    process.exitCode = 1;
});
