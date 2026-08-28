import { computeContentHash } from '../serializer/contentHash.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/IpfsPublicationRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import {
    PublicationObservationArchiveFingerprintAlgorithm,
    fingerprintPublicationObservationArchive
} from '../application/PublicationObservationArchiveFingerprint.js';
import { describePublicationObservationArchiveFingerprint } from '../application/PublicationObservationArchiveFingerprintView.js';
import { describePublicationObservationArchive } from '../application/PublicationObservationArchiveView.js';
import { reconstructBitcoinAnchorDurableEvidence } from '../application/BitcoinAnchorDurableEvidenceView.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import {
    exportPublicationObservationArchive,
    importPublicationObservationArchive,
    recordPublicationObservationArchiveImport
} from '../application/PublicationObservationArchiveExport.js';

// 0.8.84 — Durable Publication Archive Fingerprint.
//
// The flagship this milestone exists to prove: a replica holding a mix of
// LOCAL and IMPORTED publications, and multiple archiveImportEvents,
// exports its own bytes and a second replica RESTORES from exactly those
// bytes (the identical `fromJSON(toJSON())` round trip storage/
// LocalStoragePublicationObservationArchive.js already performs) — the two
// replicas' fingerprints match EXACTLY, provenance included, import events
// excluded. The instant either replica records one more genuinely new
// fact, the fingerprints diverge. A THIRD replica that instead goes
// through the cross-replica `importPublicationObservationArchive()`
// boundary — which 0.8.83 already established always re-stamps every
// fact's provenance to IMPORTED — correctly fingerprints differently, for
// the identical reason Section B demonstrates directly.
//
//   Section A: FLAGSHIP — restoring a replica from its own exported bytes
//              preserves fingerprint identity; one new local fact
//              afterward changes it; the cross-replica import boundary,
//              which relabels provenance, correctly does not preserve it
//   Section B: PROVENANCE-SENSITIVE — identical facts, LOCAL vs IMPORTED,
//              fingerprint differs even though evidence/timeline don't
//   Section C: archiveImportEvents is excluded — different import times,
//              different import counts, same content fingerprint
//   Section D: known SHA-256 vectors — independently computed, proving
//              the hand-rolled implementation is correct, not merely
//              self-consistent
//   Section E: determinism and purity — repeat calls, no mutation
//   Section F: sensitivity — any single new fact changes the fingerprint;
//              duplicate facts are significant
//   Section G: non-instance input never throws through the view; the
//              algorithm-level function is strict, mirroring export
//   Section H: format — exactly 64 lowercase hex characters
//   Section I: no verification/trust vocabulary anywhere near the view

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const O = PublicationObservationArchiveProvenanceOrigin;
const HEX64_PATTERN = /^[0-9a-f]{64}$/;

function confirmed({ txid, blockHash, blockHeight, confirmationCount, observedAt }) {
    return Object.freeze({
        state: 'confirmed', txid, blockHash, blockHeight, confirmationCount, reason: null, observedAt
    });
}

const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);
const BLOCK_A = 'c'.repeat(64);
const BLOCK_B = 'd'.repeat(64);
const CONTENT_HASH_A = 'e'.repeat(64);
const CONTENT_HASH_B = 'f'.repeat(64);
const NETWORK = 'mainnet';
const IPFS_CONTENT_HASH = computeContentHash('ForkBuild fingerprint test content');
const IPFS_LOCATOR = 'ipfs://bafy-fingerprint-test';

function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();

        let replicaA = PublicationObservationArchive.empty();
        replicaA = useCase.execute(replicaA, { anchorId: 'anchor-a', contentHash: CONTENT_HASH_A, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-01T00:00:00Z') });
        replicaA = replicaA.appendBitcoinConfirmationObservation('anchor-a', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-08-01T00:10:00Z') }));
        const ipfsRecord = new IpfsPublicationRecord({
            contentHash: IPFS_CONTENT_HASH, locator: IPFS_LOCATOR,
            publishedAt: new Date('2026-08-01T00:20:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        });
        replicaA = replicaA.appendIpfsPublicationRecord(ipfsRecord);
        // Some of replica A's own facts are already IMPORTED — from an
        // earlier archive import THIS replica itself performed, before
        // this test's own scenario begins — and that earlier import is
        // itself durably recorded as an archiveImportEvent.
        replicaA = useCase.execute(replicaA, { anchorId: 'anchor-b', contentHash: CONTENT_HASH_B, txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-01T00:30:00Z') }, O.IMPORTED);
        replicaA = recordPublicationObservationArchiveImport(replicaA, { importedAt: new Date('2026-08-01T00:31:00Z') });

        const f1 = fingerprintPublicationObservationArchive(replicaA);
        assert(HEX64_PATTERN.test(f1), '1. F1 is a well-formed 64-character lowercase hex digest');

        // Export replica A's own bytes, destroy all in-memory state, and
        // RESTORE a fresh replica B from exactly those bytes —
        // `fromJSON(toJSON())`, the identical generic round trip
        // storage/LocalStoragePublicationObservationArchive.js performs to
        // restore a replica's own prior state across a page reload, a
        // browser restart, or a file backup. THIS restore path — unlike
        // application/PublicationObservationArchiveExport.js's own
        // `importPublicationObservationArchive()` UI action — never
        // relabels provenance (see tests/
        // PublicationObservationArchiveProvenance.test.js, Section J): it
        // is the honest answer to "does this replica, restored elsewhere,
        // represent the exact same durable archive?"
        const exportedA = exportPublicationObservationArchive(replicaA);
        let replicaB = PublicationObservationArchive.fromJSON(JSON.parse(JSON.stringify(exportedA)));

        const f2 = fingerprintPublicationObservationArchive(replicaB);
        assert(f1 === f2, `2. THE FLAGSHIP INVARIANT: F1 === F2 — a replica restored elsewhere from the identical exported bytes fingerprints identically, mix of LOCAL/IMPORTED facts and archiveImportEvents included, saw F1=${f1} F2=${f2}`);

        // Replica B now records one new local fact of its own.
        replicaB = replicaB.appendBitcoinConfirmationObservation('anchor-a', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 6, observedAt: new Date('2026-08-28T00:05:00Z') }));
        const f3 = fingerprintPublicationObservationArchive(replicaB);
        assert(f3 !== f2, '3. one new durable fact changes the archive identity: F3 !== F2');
        assert(f3 !== f1, '4. ...and F3 !== F1 too');

        // The cross-replica IMPORT boundary (application/
        // PublicationObservationArchiveExport.js's own
        // `importPublicationObservationArchive()`, backing the "Import
        // Archive" UI action) is a DIFFERENT operation on purpose — it
        // always re-stamps EVERY fact IMPORTED (0.8.83), even facts that
        // were already IMPORTED, or a mix of both, in the source archive.
        // A THIRD replica that imports (never restores) replica A's export
        // therefore does NOT share F1/F2: its provenance genuinely
        // differs, so its fingerprint correctly differs too — proven in
        // Section B below, and re-confirmed here for replica A specifically.
        const importResult = importPublicationObservationArchive(JSON.stringify(exportedA));
        assert(importResult.outcome === 'imported', '5. a well-formed export still imports successfully through the cross-replica boundary');
        const f4 = fingerprintPublicationObservationArchive(importResult.archive);
        assert(f4 !== f1, '6. importing (never restoring) replica A\'s export into a third replica changes provenance, so it changes the fingerprint too — this is correct, not a bug');
    }
    console.log('✓ Section A: FLAGSHIP — export/import preserves fingerprint identity; a new local fact afterward changes it');

    // ---------------------------------------------------------------
    // Section B — provenance-sensitive: identical facts, different
    // provenance, different fingerprint; evidence/timeline unaffected.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const observedAt = new Date('2026-05-01T00:10:00Z');

        let archiveLocal = PublicationObservationArchive.empty();
        archiveLocal = useCase.execute(archiveLocal, { anchorId: 'anchor-prov', contentHash: CONTENT_HASH_A, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-05-01T00:00:00Z') });
        archiveLocal = archiveLocal.appendBitcoinConfirmationObservation('anchor-prov', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt }));

        let archiveImported = PublicationObservationArchive.empty();
        archiveImported = useCase.execute(archiveImported, { anchorId: 'anchor-prov', contentHash: CONTENT_HASH_A, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-05-01T00:00:00Z') }, O.IMPORTED);
        archiveImported = archiveImported.appendBitcoinConfirmationObservation('anchor-prov', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt }), O.IMPORTED);

        const evidenceLocal = reconstructBitcoinAnchorDurableEvidence(archiveLocal, 'anchor-prov');
        const evidenceImported = reconstructBitcoinAnchorDurableEvidence(archiveImported, 'anchor-prov');
        assert(JSON.stringify(evidenceLocal) === JSON.stringify(evidenceImported), '7. sanity check — reconstructed evidence is byte-identical regardless of provenance (0.8.83\'s own invariant)');

        const summaryLocal = describePublicationObservationArchive(archiveLocal);
        const summaryImported = describePublicationObservationArchive(archiveImported);
        assert(JSON.stringify(summaryLocal) === JSON.stringify(summaryImported), '8. sanity check — the cross-domain summary/timeline is byte-identical regardless of provenance');

        const fingerprintLocal = fingerprintPublicationObservationArchive(archiveLocal);
        const fingerprintImported = fingerprintPublicationObservationArchive(archiveImported);
        assert(fingerprintLocal !== fingerprintImported, '9. THE PROVENANCE INVARIANT: fingerprints differ even though evidence and the cross-domain summary do not — provenance affects archive identity, not interpretation of the underlying facts');
    }
    console.log('✓ Section B: identical facts under different provenance fingerprint differently, while evidence and timelines stay byte-identical');

    // ---------------------------------------------------------------
    // Section C — archiveImportEvents is excluded from the fingerprint.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBitcoinConfirmationObservation('anchor-c', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-06-01T00:00:00Z') }));

        const baseline = fingerprintPublicationObservationArchive(archive);

        const withOneImportEvent = archive.appendArchiveImportEvent({ importedAt: new Date('2026-06-02T00:00:00Z'), importedArchiveSchemaVersion: 3, importedEntryCount: 1 });
        assert(fingerprintPublicationObservationArchive(withOneImportEvent) === baseline, '10. adding an archiveImportEvent does not change the fingerprint');

        const withImportEventAtADifferentTime = archive.appendArchiveImportEvent({ importedAt: new Date('2099-01-01T00:00:00Z'), importedArchiveSchemaVersion: 3, importedEntryCount: 999 });
        assert(fingerprintPublicationObservationArchive(withImportEventAtADifferentTime) === baseline, '11. a different importedAt/importedEntryCount still does not change the fingerprint');

        const withTwoImportEvents = withOneImportEvent.appendArchiveImportEvent({ importedAt: new Date('2026-06-03T00:00:00Z'), importedArchiveSchemaVersion: 3, importedEntryCount: 1 });
        assert(fingerprintPublicationObservationArchive(withTwoImportEvents) === baseline, '12. two archiveImportEvents vs. zero — still the identical fingerprint');

        // The same underlying facts, imported at two different real
        // moments, still produce the same content fingerprint — this is
        // the concrete case the exclusion exists for.
        const { archive: importedAt10 } = importPublicationObservationArchive(exportPublicationObservationArchive(archive));
        const replicaImportedEarly = recordPublicationObservationArchiveImport(importedAt10, { importedAt: new Date('2026-06-01T10:00:00Z') });
        const { archive: importedAt10Again } = importPublicationObservationArchive(exportPublicationObservationArchive(archive));
        const replicaImportedLate = recordPublicationObservationArchiveImport(importedAt10Again, { importedAt: new Date('2026-06-01T10:05:00Z') });
        assert(fingerprintPublicationObservationArchive(replicaImportedEarly) === fingerprintPublicationObservationArchive(replicaImportedLate), '13. two replicas that imported the identical archive at different real times fingerprint identically');
    }
    console.log('✓ Section C: archiveImportEvents is ingestion metadata, excluded from the content fingerprint entirely');

    // ---------------------------------------------------------------
    // Section D — known SHA-256 vectors, independently computed.
    // ---------------------------------------------------------------
    {
        // sha256(canonical JSON of PublicationObservationArchive.empty(),
        // schemaVersion 6 (0.8.104), archiveImportEvents stripped) —
        // independently verified against Node's own
        // `crypto.createHash('sha256')` while authoring this test. This is
        // not merely a self-consistency check: it proves the hand-rolled
        // SHA-256 implementation in application/
        // PublicationObservationArchiveFingerprint.js produces the SAME
        // digest a standard SHA-256 implementation does over the identical
        // bytes.
        const EXPECTED_EMPTY_ARCHIVE_FINGERPRINT = 'aed12ca7ca7d3641ebf412527d1a2b6283224408ec9046ea21c1ce4e8cf4e466';
        assert(fingerprintPublicationObservationArchive(PublicationObservationArchive.empty()) === EXPECTED_EMPTY_ARCHIVE_FINGERPRINT, '14. sha256 of the empty archive\'s own canonical content matches the independently computed vector');

        let single = PublicationObservationArchive.empty();
        single = single.appendBitcoinConfirmationObservation('anchor-1', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-01-01T00:00:00Z') }));
        const EXPECTED_SINGLE_OBSERVATION_FINGERPRINT = 'ab9b727a62ee276b2756422e2e8b4916657139c2716455625dfdfe949b11fdee';
        assert(fingerprintPublicationObservationArchive(single) === EXPECTED_SINGLE_OBSERVATION_FINGERPRINT, '15. sha256 of a one-observation archive matches the independently computed vector');
    }
    console.log('✓ Section D: the hand-rolled SHA-256 implementation matches independently computed vectors, not merely itself');

    // ---------------------------------------------------------------
    // Section E — determinism and purity.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBitcoinConfirmationObservation('anchor-e', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-07-01T00:00:00Z') }));
        const before = JSON.stringify(archive.toJSON());

        const first = fingerprintPublicationObservationArchive(archive);
        const second = fingerprintPublicationObservationArchive(archive);
        assert(first === second, '16. calling the fingerprint function twice on the same archive returns the identical digest');
        assert(JSON.stringify(archive.toJSON()) === before, '17. fingerprinting never mutates the archive');
    }
    console.log('✓ Section E: fingerprinting is deterministic and never mutates the archive it reads');

    // ---------------------------------------------------------------
    // Section F — sensitivity: any single new fact changes the
    // fingerprint; duplicate facts remain significant.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        const f0 = fingerprintPublicationObservationArchive(archive);

        const ipfsRecord = new IpfsPublicationRecord({
            contentHash: IPFS_CONTENT_HASH, locator: IPFS_LOCATOR,
            publishedAt: new Date('2026-04-01T00:00:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        });
        const withOneRecord = archive.appendIpfsPublicationRecord(ipfsRecord);
        const f1 = fingerprintPublicationObservationArchive(withOneRecord);
        assert(f1 !== f0, '18. appending one new fact changes the fingerprint');

        // The identical record, appended a second time, is a DUPLICATE
        // fact — never deduplicated by PublicationObservationArchive.js,
        // and this fingerprint must reflect that: two records fingerprint
        // differently than one, even though they are byte-identical
        // records.
        const withTwoRecords = withOneRecord.appendIpfsPublicationRecord(ipfsRecord);
        const f2 = fingerprintPublicationObservationArchive(withTwoRecords);
        assert(f2 !== f1, '19. a duplicate fact still changes the fingerprint — duplicates are not collapsed');

        // Anchor identity (bitcoinAnchorPublicationRecords) fingerprints
        // independently of observation-shaped facts.
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const withAnchorIdentity = useCase.execute(archive, { anchorId: 'anchor-f', contentHash: CONTENT_HASH_A, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-04-02T00:00:00Z') });
        const f3 = fingerprintPublicationObservationArchive(withAnchorIdentity);
        assert(f3 !== f0 && f3 !== f1 && f3 !== f2, '20. a new anchor publication identity changes the fingerprint independently of the IPFS-record changes above');
    }
    console.log('✓ Section F: every single new or duplicate fact changes the archive\'s own fingerprint');

    // ---------------------------------------------------------------
    // Section G — a non-instance input never throws through the view;
    // the algorithm-level function is strict, mirroring export.
    // ---------------------------------------------------------------
    {
        let threw = false;
        try { fingerprintPublicationObservationArchive({ not: 'an archive' }); } catch (error) { threw = true; }
        assert(threw, '21. fingerprintPublicationObservationArchive() throws for a non-PublicationObservationArchive input, mirroring exportPublicationObservationArchive()');

        const nullView = describePublicationObservationArchiveFingerprint(null);
        const emptyView = describePublicationObservationArchiveFingerprint(PublicationObservationArchive.empty());
        assert(nullView.fingerprint === emptyView.fingerprint, '22. describePublicationObservationArchiveFingerprint() never throws for a non-archive input — it degrades to the empty archive\'s own fingerprint');

        const bogusView = describePublicationObservationArchiveFingerprint('not an archive either');
        assert(bogusView.fingerprint === emptyView.fingerprint, '23. ...regardless of what kind of non-archive value is passed');
    }
    console.log('✓ Section G: the view never throws for non-archive input; the underlying algorithm function is strict, mirroring export');

    // ---------------------------------------------------------------
    // Section H — format: exactly 64 lowercase hex characters.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBitcoinConfirmationObservation('anchor-h', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-07-05T00:00:00Z') }));
        const fingerprint = fingerprintPublicationObservationArchive(archive);
        assert(typeof fingerprint === 'string' && fingerprint.length === 64, '24. the fingerprint is exactly 64 characters long');
        assert(HEX64_PATTERN.test(fingerprint), '25. the fingerprint is lowercase hex only, never uppercase or any other alphabet');
        assert(describePublicationObservationArchiveFingerprint(archive).algorithm === 'SHA-256', '26. the view names its own algorithm explicitly');
        assert(PublicationObservationArchiveFingerprintAlgorithm === 'SHA-256', '27. the exported algorithm constant is SHA-256');
    }
    console.log('✓ Section H: the fingerprint is always exactly 64 lowercase hex characters');

    // ---------------------------------------------------------------
    // Section I — no verification/trust vocabulary anywhere near the
    // fingerprint view.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBitcoinConfirmationObservation('anchor-i', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-07-06T00:00:00Z') }));
        const view = describePublicationObservationArchiveFingerprint(archive);
        const FORBIDDEN_KEYS = ['trust', 'confidence', 'valid', 'verified', 'authentic', 'reliable', 'health', 'score', 'canonical'];
        const json = JSON.stringify(view).toLowerCase();
        for (const forbidden of FORBIDDEN_KEYS) {
            assert(!json.includes(forbidden), `28. the fingerprint view never mentions "${forbidden}"`);
        }
        assert(Object.keys(view).sort().join(',') === 'algorithm,fingerprint', '29. the view exposes exactly two fields — fingerprint and algorithm — nothing more');
    }
    console.log('✓ Section I: no trust/confidence/validity/verified/authentic vocabulary exists anywhere near the fingerprint view');

    console.log('\nAll PublicationObservationArchiveFingerprint tests passed.');
}

run();
