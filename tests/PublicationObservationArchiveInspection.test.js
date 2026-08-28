import { computeContentHash } from '../serializer/contentHash.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/IpfsPublicationRecord.js';
import { BitcoinAnchorBroadcastState } from '../application/BitcoinAnchorBroadcastState.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import { fingerprintPublicationObservationArchive } from '../application/PublicationObservationArchiveFingerprint.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import {
    exportPublicationObservationArchive,
    importPublicationObservationArchive
} from '../application/PublicationObservationArchiveExport.js';
import {
    PublicationObservationArchiveInspectionOutcome,
    inspectPublicationObservationArchive
} from '../application/PublicationObservationArchiveInspection.js';

// 0.8.86 — Non-Replacing External Publication Archive Inspection.
//
// The flagship this milestone exists to prove: inspecting an external
// archive B, while a different archive A is "the current archive" from a
// caller's own point of view, changes nothing about A — not its facts, not
// its fingerprint, not its provenance counts. Only a SEPARATE, later,
// explicit import call ever replaces A. INSPECT != IMPORT.
//
//   Section A: FLAGSHIP — inspecting archive B leaves archive A completely
//              untouched; a later, separate import of B is what actually
//              replaces it
//   Section B: the inspection result's own counts match the external
//              archive's own facts exactly
//   Section C: the inspection's own fingerprint equals
//              fingerprintPublicationObservationArchive() computed
//              directly over the same external archive
//   Section D: provenance is read AS RECORDED on the external archive,
//              never relabeled IMPORTED the way importing would
//   Section E: archiveImportEvents metadata is visible and reported
//              separately from the durable factual/provenance counts
//   Section F: malformed or non-archive input is INVALID_ARCHIVE, never a
//              silently empty inspection
//   Section G: inspecting performs zero network operations
//   Section H: no capability or credential symbol anywhere near this
//              module, by a read-the-source guarantee
//   Section I: inspecting never mutates the supplied payload, and is
//              deterministic
//   Section J: two archives differing ONLY in archiveImportEvents inspect
//              to the SAME fingerprint but DIFFERENT archiveImportCount
//   Section K: bitcoinAnchorIds / ipfsPublicationRecordIndexes are plain,
//              deduplicated, first-seen-order identity lists — never
//              evidence
//   Section L: no trust/verdict vocabulary anywhere in the outcome enum
//   Section M: both a raw JSON string and an already-parsed value are
//              accepted

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const O = PublicationObservationArchiveProvenanceOrigin;

function confirmed({ txid, blockHash, blockHeight, confirmationCount, observedAt }) {
    return Object.freeze({
        state: 'confirmed', txid, blockHash, blockHeight, confirmationCount, reason: null, observedAt
    });
}

const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);
const BLOCK_A = 'c'.repeat(64);
const CONTENT_HASH_A = 'e'.repeat(64);
const NETWORK = 'mainnet';
const IPFS_CONTENT_HASH = computeContentHash('ForkBuild archive inspection test content');
const IPFS_LOCATOR = 'ipfs://bafy-inspection-test';

function buildExternalArchive() {
    const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
    let archive = PublicationObservationArchive.empty();

    const ipfsRecord = new IpfsPublicationRecord({
        contentHash: IPFS_CONTENT_HASH, locator: IPFS_LOCATOR,
        publishedAt: new Date('2026-08-01T00:00:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
    });
    archive = archive.appendIpfsPublicationRecord(ipfsRecord, O.LOCAL);
    const ipfsRecordIndex = archive.ipfsPublicationRecords.length - 1;
    archive = archive.appendIpfsContentVerificationObservation(ipfsRecordIndex, {
        state: 'hash-match', contentHash: IPFS_CONTENT_HASH, locator: IPFS_LOCATOR, reason: null,
        observedAt: new Date('2026-08-01T00:01:00Z')
    }, O.IMPORTED);

    archive = useCase.execute(archive, { anchorId: 'anchor-inspect-A', contentHash: CONTENT_HASH_A, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-01T01:00:00Z') }, O.LOCAL);
    archive = archive.appendBitcoinBroadcastRecord({ anchorId: 'anchor-inspect-A', txid: TXID_A, state: BitcoinAnchorBroadcastState.BROADCASTED, broadcastedAt: new Date('2026-08-01T01:05:00Z') }, O.LOCAL);
    archive = archive.appendBitcoinConfirmationObservation('anchor-inspect-A', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-08-01T01:10:00Z') }), O.LOCAL);
    archive = archive.appendBitcoinConfirmationObservation('anchor-inspect-A', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 6, observedAt: new Date('2026-08-01T01:20:00Z') }), O.IMPORTED);

    // A second anchor with ONLY a content-proof observation and no
    // publication record — proves the anchor-id list is not derived from
    // any one collection alone.
    archive = archive.appendBitcoinContentProofObservation('anchor-inspect-B', {
        state: 'hash-match', contentHash: CONTENT_HASH_A, reason: null, observedAt: new Date('2026-08-01T01:30:00Z')
    }, O.LOCAL);

    archive = archive.appendArchiveImportEvent({
        importedAt: new Date('2026-08-01T02:00:00Z'), importedArchiveSchemaVersion: PublicationObservationArchive.SCHEMA_VERSION, importedEntryCount: 3
    });

    return archive;
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

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        let currentArchive = PublicationObservationArchive.empty();
        currentArchive = currentArchive.appendIpfsPublicationRecord(new IpfsPublicationRecord({
            contentHash: computeContentHash('the CURRENT archive, never inspection\'s to touch'), locator: 'ipfs://bafy-current',
            publishedAt: new Date('2026-08-02T00:00:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        }));
        const currentFingerprintBefore = fingerprintPublicationObservationArchive(currentArchive);
        const currentJSONBefore = JSON.stringify(currentArchive.toJSON());

        const externalArchive = buildExternalArchive();
        const externalPayload = exportPublicationObservationArchive(externalArchive);

        const inspection = inspectPublicationObservationArchive(externalPayload);
        assert(inspection.outcome === PublicationObservationArchiveInspectionOutcome.INSPECTED, '1. inspecting a genuine exported archive succeeds');

        // "Current archive" is never even an argument to
        // inspectPublicationObservationArchive() — it has no way to reach
        // it. This is the flagship assertion, made concrete: whatever a
        // caller was holding as "the current archive" is byte-identical,
        // by construction, before and after the inspect call.
        assert(fingerprintPublicationObservationArchive(currentArchive) === currentFingerprintBefore, '2. the current archive\'s own fingerprint is unchanged after inspecting an unrelated external archive');
        assert(JSON.stringify(currentArchive.toJSON()) === currentJSONBefore, '3. the current archive\'s own facts are byte-identical after inspecting an unrelated external archive');
        assert(currentArchive.publicationCount === 1, '4. the current archive still holds only its own one publication — none of archive B\'s facts leaked in');

        // INSPECT != IMPORT: only an explicit, separate import call ever
        // replaces the current archive.
        const importResult = importPublicationObservationArchive(externalPayload);
        currentArchive = importResult.archive;
        assert(fingerprintPublicationObservationArchive(currentArchive) !== currentFingerprintBefore, '5. only the SEPARATE, explicit import call actually changes what "the current archive" is');
        assert(currentArchive.publicationCount === externalArchive.publicationCount, '6. after import (not inspect), the current archive now holds archive B\'s own facts');
    }
    console.log('✓ Section A: FLAGSHIP — inspecting an external archive never mutates or replaces the current archive; only a separate, explicit import call does');

    // ---------------------------------------------------------------
    // Section B — the inspection result matches the external archive's
    // own facts exactly.
    // ---------------------------------------------------------------
    {
        const archive = buildExternalArchive();
        const { inspection } = inspectPublicationObservationArchive(exportPublicationObservationArchive(archive));

        assert(inspection.schemaVersion === PublicationObservationArchive.SCHEMA_VERSION, '7. schemaVersion matches the archive class\'s own current schema version');
        assert(inspection.ipfsPublicationCount === 1, '8. ipfsPublicationCount matches');
        assert(inspection.ipfsVerificationCount === 1, '9. ipfsVerificationCount matches');
        assert(inspection.bitcoinBroadcastCount === 1, '10. bitcoinBroadcastCount matches');
        assert(inspection.bitcoinConfirmationCount === 2, '11. bitcoinConfirmationCount matches');
        assert(inspection.bitcoinContentProofCount === 1, '12. bitcoinContentProofCount matches');
        assert(inspection.bitcoinAnchorPublicationRecordCount === 1, '13. bitcoinAnchorPublicationRecordCount matches');
        assert(inspection.publicationCount === archive.publicationCount, '14. publicationCount matches archive.publicationCount exactly');
        assert(inspection.observationCount === archive.observationCount, '15. observationCount matches archive.observationCount exactly');
    }
    console.log('✓ Section B: the inspection result\'s own counts match the external archive\'s own facts exactly');

    // ---------------------------------------------------------------
    // Section C — fingerprint consistency.
    // ---------------------------------------------------------------
    {
        const archive = buildExternalArchive();
        const { inspection } = inspectPublicationObservationArchive(exportPublicationObservationArchive(archive));
        assert(inspection.fingerprint === fingerprintPublicationObservationArchive(archive), '16. the inspection\'s own fingerprint equals fingerprintPublicationObservationArchive() computed directly over the same archive');
        assert(inspection.fingerprintAlgorithm === 'SHA-256', '17. the inspection names the algorithm that produced the digest');
    }
    console.log('✓ Section C: the inspection\'s own fingerprint is exactly fingerprintPublicationObservationArchive() over the same external archive — no second algorithm');

    // ---------------------------------------------------------------
    // Section D — provenance is read AS RECORDED, never relabeled.
    // ---------------------------------------------------------------
    {
        const archive = buildExternalArchive();
        const payload = exportPublicationObservationArchive(archive);

        const { inspection } = inspectPublicationObservationArchive(payload);
        assert(inspection.localFactCount === archive.localFactCount, '18. inspection.localFactCount matches the external archive\'s own recorded LOCAL count exactly');
        assert(inspection.importedFactCount === archive.importedFactCount, '19. inspection.importedFactCount matches the external archive\'s own recorded IMPORTED count exactly');
        assert(inspection.localFactCount > 0 && inspection.importedFactCount > 0, '20. sanity check — the fixture archive genuinely mixes LOCAL and IMPORTED facts');

        // Contrast with importing the SAME payload: import relabels every
        // fact IMPORTED (0.8.83); inspection must not.
        const imported = importPublicationObservationArchive(payload).archive;
        assert(imported.localFactCount === 0, '21. sanity check — importing the same payload stamps every fact IMPORTED, per 0.8.83');
        assert(inspection.localFactCount !== imported.localFactCount, '22. inspecting reports DIFFERENT provenance counts than importing the identical payload would — inspection never relabels');
    }
    console.log('✓ Section D: provenance in an inspection result is read exactly as the external archive recorded it, never relabeled the way importing would');

    // ---------------------------------------------------------------
    // Section E — archiveImportEvents metadata reported separately.
    // ---------------------------------------------------------------
    {
        const archive = buildExternalArchive();
        const { inspection } = inspectPublicationObservationArchive(exportPublicationObservationArchive(archive));
        assert(inspection.archiveImportCount === 1, '23. archiveImportCount reflects the external archive\'s own archiveImportEvents, separate from every factual/provenance count above');

        const withoutImportEvents = PublicationObservationArchive.fromJSON({ ...archive.toJSON(), archiveImportEvents: [] });
        const { inspection: inspectionWithoutEvents } = inspectPublicationObservationArchive(exportPublicationObservationArchive(withoutImportEvents));
        assert(inspectionWithoutEvents.archiveImportCount === 0, '24. removing archiveImportEvents changes archiveImportCount alone');
        assert(inspectionWithoutEvents.publicationCount === inspection.publicationCount && inspectionWithoutEvents.observationCount === inspection.observationCount, '25. ...and changes nothing about the durable factual counts');
    }
    console.log('✓ Section E: archiveImportEvents metadata is visible and reported separately from durable factual/provenance counts');

    // ---------------------------------------------------------------
    // Section F — malformed/non-archive input is INVALID_ARCHIVE.
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
            const result = inspectPublicationObservationArchive(input);
            assert(result.outcome === PublicationObservationArchiveInspectionOutcome.INVALID_ARCHIVE, `26. malformed input is rejected as INVALID_ARCHIVE, saw outcome for ${JSON.stringify(input)}: ${result.outcome}`);
            assert(result.inspection === null, `27. a rejected inspection never returns a partial result, saw for ${JSON.stringify(input)}`);
        }

        // A genuinely EMPTY archive is valid and inspects successfully.
        const emptyResult = inspectPublicationObservationArchive(JSON.stringify(PublicationObservationArchive.empty().toJSON()));
        assert(emptyResult.outcome === PublicationObservationArchiveInspectionOutcome.INSPECTED, '28. a genuinely empty, well-formed archive inspects successfully — never treated as malformed');
        assert(emptyResult.inspection.publicationCount === 0 && emptyResult.inspection.observationCount === 0, '29. the inspected empty archive reports no facts');
        assert(emptyResult.inspection.bitcoinAnchorIds.length === 0 && emptyResult.inspection.ipfsPublicationRecordIndexes.length === 0, '30. the inspected empty archive reports no identities');
    }
    console.log('✓ Section F: malformed or non-archive input is INVALID_ARCHIVE, never a silently empty inspection — a genuinely empty archive still inspects');

    // ---------------------------------------------------------------
    // Section G — zero network operations.
    // ---------------------------------------------------------------
    {
        const payload = exportPublicationObservationArchive(buildExternalArchive());
        const { networkCallOccurred } = await withoutNetworkAccess(() => inspectPublicationObservationArchive(payload));
        assert(!networkCallOccurred, '31. inspecting performs zero network operations');
    }
    console.log('✓ Section G: inspecting performs zero network operations');

    // ---------------------------------------------------------------
    // Section H — no capability or credential symbol anywhere near this
    // module.
    // ---------------------------------------------------------------
    {
        const fileText = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublicationObservationArchiveInspection.js', import.meta.url), 'utf8'
        );
        const importLines = fileText.split('\n').filter((line) => line.trim().startsWith('import ')).join('\n').toLowerCase();
        const FORBIDDEN_IMPORT_SUBSTRINGS = ['wallet', 'signer', 'pinning', 'bitcoinrpc', 'fetch', 'xmlhttprequest', 'websocket', 'storage'];
        for (const forbidden of FORBIDDEN_IMPORT_SUBSTRINGS) {
            assert(!importLines.includes(forbidden), `32. the inspection module's own import statements never reference "${forbidden}"`);
        }
    }
    console.log('✓ Section H: no wallet/signer/pinning/network/storage symbol is ever imported by the inspection module — a read-the-source guarantee');

    // ---------------------------------------------------------------
    // Section I — no mutation of the supplied payload; determinism.
    // ---------------------------------------------------------------
    {
        const payload = exportPublicationObservationArchive(buildExternalArchive());
        const payloadTextBefore = JSON.stringify(payload);

        const first = inspectPublicationObservationArchive(payload);
        assert(JSON.stringify(payload) === payloadTextBefore, '33. inspecting never mutates the supplied payload object');

        const second = inspectPublicationObservationArchive(payload);
        assert(JSON.stringify(first) === JSON.stringify(second), '34. calling inspect twice with byte-identical input returns a byte-identical result');
    }
    console.log('✓ Section I: inspecting never mutates the supplied payload and is deterministic');

    // ---------------------------------------------------------------
    // Section J — same fingerprint, different import history.
    // ---------------------------------------------------------------
    {
        let archiveNoEvents = PublicationObservationArchive.empty();
        archiveNoEvents = archiveNoEvents.appendBitcoinConfirmationObservation('anchor-j', confirmed({ txid: TXID_B, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-08-03T00:00:00Z') }));

        const archiveWithEvents = archiveNoEvents
            .appendArchiveImportEvent({ importedAt: new Date('2026-08-03T01:00:00Z'), importedArchiveSchemaVersion: PublicationObservationArchive.SCHEMA_VERSION, importedEntryCount: 1 })
            .appendArchiveImportEvent({ importedAt: new Date('2026-08-03T02:00:00Z'), importedArchiveSchemaVersion: PublicationObservationArchive.SCHEMA_VERSION, importedEntryCount: 2 });

        const { inspection: inspectionNoEvents } = inspectPublicationObservationArchive(exportPublicationObservationArchive(archiveNoEvents));
        const { inspection: inspectionWithEvents } = inspectPublicationObservationArchive(exportPublicationObservationArchive(archiveWithEvents));

        assert(inspectionNoEvents.fingerprint === inspectionWithEvents.fingerprint, '35. two archives differing ONLY in archiveImportEvents inspect to the SAME fingerprint');
        assert(inspectionNoEvents.archiveImportCount === 0 && inspectionWithEvents.archiveImportCount === 2, '36. ...but report DIFFERENT archiveImportCount, since import history is metadata the fingerprint deliberately excludes (0.8.84)');
    }
    console.log('✓ Section J: two archives differing only in archiveImportEvents inspect to the same fingerprint but different archiveImportCount');

    // ---------------------------------------------------------------
    // Section K — bitcoinAnchorIds / ipfsPublicationRecordIndexes are
    // plain, deduplicated identity lists.
    // ---------------------------------------------------------------
    {
        const archive = buildExternalArchive();
        const { inspection } = inspectPublicationObservationArchive(exportPublicationObservationArchive(archive));

        assert(JSON.stringify(inspection.bitcoinAnchorIds) === JSON.stringify(['anchor-inspect-A', 'anchor-inspect-B']), '37. bitcoinAnchorIds lists every distinct anchor the archive holds ANY Bitcoin fact for, in first-seen order — including anchor-inspect-B, which has ONLY a content-proof observation and no publication record');
        assert(JSON.stringify(inspection.ipfsPublicationRecordIndexes) === JSON.stringify([0]), '38. ipfsPublicationRecordIndexes lists every IPFS record position the archive holds');

        // Appending a second, duplicate broadcast for the same anchor
        // never duplicates that anchor's own id in the list.
        const withDuplicateBroadcast = archive.appendBitcoinBroadcastRecord({ anchorId: 'anchor-inspect-A', txid: TXID_A, state: BitcoinAnchorBroadcastState.BROADCASTED, broadcastedAt: new Date('2026-08-01T01:35:00Z') });
        const { inspection: inspectionAfterDuplicate } = inspectPublicationObservationArchive(exportPublicationObservationArchive(withDuplicateBroadcast));
        assert(inspectionAfterDuplicate.bitcoinAnchorIds.length === 2, '39. a second fact for an already-listed anchor never duplicates that anchor\'s own id in bitcoinAnchorIds');
    }
    console.log('✓ Section K: bitcoinAnchorIds/ipfsPublicationRecordIndexes are plain, deduplicated, first-seen-order identity lists — never evidence');

    // ---------------------------------------------------------------
    // Section L — no trust/verdict vocabulary in the outcome enum.
    // ---------------------------------------------------------------
    {
        const FORBIDDEN_WORDS = ['trust', 'confidence', 'verified', 'authentic', 'reliable', 'health', 'score', 'canonical', 'newer', 'correct'];
        const outcomeValues = Object.values(PublicationObservationArchiveInspectionOutcome).join(' ').toLowerCase();
        for (const forbidden of FORBIDDEN_WORDS) {
            assert(!outcomeValues.includes(forbidden), `40. the inspection outcome vocabulary never mentions "${forbidden}"`);
        }
        assert(Object.keys(PublicationObservationArchiveInspectionOutcome).sort().join(',') === 'INSPECTED,INVALID_ARCHIVE', '41. the outcome enum exposes exactly these two outcomes — nothing more');
    }
    console.log('✓ Section L: no trust/confidence/validity/verified/authentic/newer/correct vocabulary exists anywhere in the inspection outcome');

    // ---------------------------------------------------------------
    // Section M — accepts both a raw JSON string and an already-parsed
    // value.
    // ---------------------------------------------------------------
    {
        const archive = buildExternalArchive();
        const payloadObject = exportPublicationObservationArchive(archive);
        const viaString = inspectPublicationObservationArchive(JSON.stringify(payloadObject));
        const viaObject = inspectPublicationObservationArchive(payloadObject);
        assert(viaString.outcome === PublicationObservationArchiveInspectionOutcome.INSPECTED && viaObject.outcome === PublicationObservationArchiveInspectionOutcome.INSPECTED, '42. inspecting accepts both a raw JSON string and an already-parsed value');
        assert(JSON.stringify(viaString.inspection) === JSON.stringify(viaObject.inspection), '43. both forms of input produce a byte-identical inspection result');
    }
    console.log('✓ Section M: inspecting accepts both a raw JSON string and an already-parsed value, producing identical results');

    console.log('\nAll PublicationObservationArchiveInspection tests passed.');
}

run().catch((error) => {
    console.error('PublicationObservationArchiveInspection.test.js FAILED:', error);
    console.error(error.stack);
    process.exitCode = 1;
});
