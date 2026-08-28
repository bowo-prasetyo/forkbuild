import { computeContentHash } from '../serializer/contentHash.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/IpfsPublicationRecord.js';
import { IpfsPublicationContentVerificationCoordinatorState } from '../application/IpfsPublicationContentVerificationCoordinatorState.js';
import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import {
    PublicationObservationArchiveProvenanceOrigin,
    isValidPublicationObservationArchiveProvenanceOrigin,
    describePublicationObservationArchiveProvenanceOrigin
} from '../application/PublicationObservationArchiveProvenance.js';
import { describePublicationObservationArchiveProvenance } from '../application/PublicationObservationArchiveProvenanceView.js';
import { describePublicationObservationArchive } from '../application/PublicationObservationArchiveView.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { reconstructBitcoinAnchorPublicationLifecycleTimeline } from '../application/BitcoinAnchorPublicationLifecycleTimelineView.js';
import { reconstructBitcoinAnchorDurableEvidence } from '../application/BitcoinAnchorDurableEvidenceView.js';
import {
    exportPublicationObservationArchive,
    importPublicationObservationArchive,
    recordPublicationObservationArchiveImport
} from '../application/PublicationObservationArchiveExport.js';

// 0.8.83 — Publication Archive Provenance & Imported-Fact Boundary.
//
// The flagship this milestone exists to prove: a confirmation observation
// this replica observed locally, exported, imported into a fresh replica,
// and then a SECOND confirmation observation this replica observes for
// itself afterward. The resulting sequence must be `[IMPORTED, LOCAL]` —
// never all-LOCAL (which would erase the fact that most of this history
// arrived from elsewhere) and never all-IMPORTED (which would erase the
// fact that this replica genuinely observed the second one itself).
//
//   Section A: FLAGSHIP — old facts IMPORTED, a subsequent local
//              observation stays LOCAL, in the identical archive
//   Section B: LOCAL is the default for every appendXxx() call site this
//              codebase already has, unchanged
//   Section C: original observedAt/publishedAt/createdAt timestamps are
//              never rewritten by import
//   Section D: import time (archiveImportEvents[i].importedAt) is a
//              distinct fact from any observation's own observedAt
//   Section E: repeated imports don't merge — each import is an
//              independent, full replacement
//   Section F: two anchors sharing a contentHash stay isolated under
//              provenance too
//   Section G: duplicate publication identities/observations each keep
//              their own, independent provenance entry
//   Section H: derived evidence (chain-placement/consistency) is
//              byte-identical regardless of provenance
//   Section I: lifecycle timelines are byte-identical regardless of
//              provenance
//   Section J: provenance itself survives export/import — an archive's
//              own current provenance state round-trips through
//              fromJSON(toJSON()) unchanged; import always re-stamps to
//              IMPORTED regardless of what the payload claimed
//   Section K: no trust/confidence/validity/verified field exists
//              anywhere near provenance
//   Section L: malformed provenance (wrong length, extra/missing key,
//              invalid origin string) is rejected exactly like any other
//              malformed archive field
//   Section M: withUniformProvenance()/appendArchiveImportEvent() reject
//              invalid input as a no-op, mirroring every other appendXxx()

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const O = PublicationObservationArchiveProvenanceOrigin;

function confirmed({ txid, blockHash, blockHeight, confirmationCount, observedAt }) {
    return Object.freeze({
        state: BitcoinAnchorConfirmationState.CONFIRMED,
        txid, blockHash, blockHeight, confirmationCount, reason: null, observedAt
    });
}

const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);
const BLOCK_A = 'c'.repeat(64);
const BLOCK_B = 'd'.repeat(64);
const SHARED_CONTENT_HASH = 'e'.repeat(64);
const NETWORK = 'mainnet';
const IPFS_CONTENT_HASH = computeContentHash('ForkBuild provenance test content');
const IPFS_LOCATOR = 'ipfs://bafy-provenance-test';

function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const anchorId = 'flagship-anchor';

        // Replica A: two local observations.
        let replicaA = PublicationObservationArchive.empty();
        replicaA = useCase.execute(replicaA, { anchorId, contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-01T00:00:00Z') });
        replicaA = replicaA.appendBitcoinConfirmationObservation(anchorId, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-08-01T00:10:00Z') }));
        replicaA = replicaA.appendBitcoinConfirmationObservation(anchorId, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 6, observedAt: new Date('2026-08-01T01:00:00Z') }));
        assert(replicaA.bitcoinConfirmationObservationProvenanceByAnchorId[anchorId].every((o) => o === O.LOCAL), '1. every observation replica A itself made is LOCAL by default');

        // Export A, import into a fresh replica B.
        const exportedA = exportPublicationObservationArchive(replicaA);
        const importResult = importPublicationObservationArchive(JSON.stringify(exportedA));
        assert(importResult.outcome === 'imported', '2. a well-formed export imports successfully');
        let replicaB = recordPublicationObservationArchiveImport(importResult.archive, { importedAt: new Date('2026-08-28T00:00:00Z') });

        assert(replicaB.bitcoinConfirmationObservationProvenanceByAnchorId[anchorId].length === 2, '3. replica B holds both of replica A\'s confirmation observations');
        assert(replicaB.bitcoinConfirmationObservationProvenanceByAnchorId[anchorId].every((o) => o === O.IMPORTED), '4. both imported observations are IMPORTED in replica B');
        assert(replicaB.bitcoinAnchorPublicationRecordProvenance[0] === O.IMPORTED, '5. the imported publication identity is IMPORTED in replica B');

        // Replica B now observes a THIRD confirmation for itself.
        replicaB = replicaB.appendBitcoinConfirmationObservation(anchorId, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 20, observedAt: new Date('2026-08-28T00:05:00Z') }));

        const finalProvenance = replicaB.bitcoinConfirmationObservationProvenanceByAnchorId[anchorId];
        assert(JSON.stringify(finalProvenance) === JSON.stringify([O.IMPORTED, O.IMPORTED, O.LOCAL]), `6. THE FLAGSHIP INVARIANT: sequence is [IMPORTED, IMPORTED, LOCAL], saw ${JSON.stringify(finalProvenance)}`);
        assert(!finalProvenance.every((o) => o === O.LOCAL), '7. never all-LOCAL after an import');
        assert(!finalProvenance.every((o) => o === O.IMPORTED), '8. never all-IMPORTED once a genuinely local observation was added afterward');
    }
    console.log('✓ Section A: FLAGSHIP — imported facts stay IMPORTED, a subsequent local observation stays LOCAL, in the same archive');

    // ---------------------------------------------------------------
    // Section B — LOCAL is the default for every existing call site.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        let archive = PublicationObservationArchive.empty();

        const ipfsRecord = new IpfsPublicationRecord({
            contentHash: IPFS_CONTENT_HASH, locator: IPFS_LOCATOR,
            publishedAt: new Date('2026-08-02T00:00:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        });
        archive = archive.appendIpfsPublicationRecord(ipfsRecord);
        archive = archive.appendIpfsContentVerificationObservation(0, {
            state: IpfsPublicationContentVerificationCoordinatorState.HASH_MATCH,
            contentHash: IPFS_CONTENT_HASH, locator: IPFS_LOCATOR, reason: null, observedAt: new Date('2026-08-02T00:01:00Z')
        });
        archive = archive.appendBitcoinBroadcastRecord({ anchorId: 'b-anchor', txid: TXID_A, state: 'broadcasted', broadcastedAt: new Date('2026-08-02T00:02:00Z') });
        archive = archive.appendBitcoinContentProofObservation('b-anchor', { state: 'HASH_MATCH', contentHash: SHARED_CONTENT_HASH, reason: null, observedAt: new Date('2026-08-02T00:03:00Z') });
        archive = useCase.execute(archive, { anchorId: 'b-anchor', contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-02T00:04:00Z') });

        assert(archive.ipfsPublicationRecordProvenance[0] === O.LOCAL, '9. appendIpfsPublicationRecord() defaults to LOCAL');
        assert(archive.ipfsContentVerificationObservationProvenanceByRecordIndex[0][0] === O.LOCAL, '10. appendIpfsContentVerificationObservation() defaults to LOCAL');
        assert(archive.bitcoinBroadcastRecordProvenance[0] === O.LOCAL, '11. appendBitcoinBroadcastRecord() defaults to LOCAL');
        assert(archive.bitcoinContentProofObservationProvenanceByAnchorId['b-anchor'][0] === O.LOCAL, '12. appendBitcoinContentProofObservation() defaults to LOCAL');
        assert(archive.bitcoinAnchorPublicationRecordProvenance[0] === O.LOCAL, '13. CreateBitcoinAnchorPublicationRecordUseCase (no origin passed) defaults to LOCAL');
        assert(archive.localFactCount === archive.totalFactCount && archive.importedFactCount === 0, '14. an archive built entirely through existing call sites is entirely LOCAL');
    }
    console.log('✓ Section B: every existing appendXxx() call site defaults to LOCAL, unchanged');

    // ---------------------------------------------------------------
    // Section C — original timestamps are never rewritten by import.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        const observedAt = new Date('2026-01-15T08:30:00Z');
        archive = archive.appendBitcoinConfirmationObservation('anchor-c', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt }));

        const { archive: imported } = importPublicationObservationArchive(exportPublicationObservationArchive(archive));
        assert(imported.bitcoinConfirmationObservationsByAnchorId['anchor-c'][0].observedAt.toISOString() === observedAt.toISOString(), '15. observedAt survives import unchanged, byte-identical');
        assert(imported.bitcoinConfirmationObservationProvenanceByAnchorId['anchor-c'][0] === O.IMPORTED, '16. ...while its provenance became IMPORTED');
    }
    console.log('✓ Section C: import never rewrites a fact\'s own observedAt/publishedAt/createdAt');

    // ---------------------------------------------------------------
    // Section D — import time is a distinct fact from observation time.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        const observedAt = new Date('2026-01-15T08:30:00Z');
        archive = archive.appendBitcoinConfirmationObservation('anchor-d', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt }));

        const { archive: imported } = importPublicationObservationArchive(exportPublicationObservationArchive(archive));
        const importedAt = new Date('2026-08-28T09:00:00Z');
        const withEvent = recordPublicationObservationArchiveImport(imported, { importedAt });

        assert(withEvent.archiveImportEvents[0].importedAt.toISOString() === importedAt.toISOString(), '17. archiveImportEvents[0].importedAt is exactly the caller-supplied import time');
        assert(withEvent.archiveImportEvents[0].importedAt.toISOString() !== observedAt.toISOString(), '18. importedAt is a genuinely different instant than the fact\'s own observedAt');
        assert(withEvent.bitcoinConfirmationObservationsByAnchorId['anchor-d'][0].observedAt.toISOString() === observedAt.toISOString(), '19. recording the import event never touches any fact\'s own observedAt');
    }
    console.log('✓ Section D: import time is a distinct, separately recorded fact from any observation\'s own observedAt');

    // ---------------------------------------------------------------
    // Section E — repeated imports don't merge.
    // ---------------------------------------------------------------
    {
        let archiveX = PublicationObservationArchive.empty();
        archiveX = archiveX.appendBitcoinConfirmationObservation('anchor-x', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-02-01T00:00:00Z') }));

        let archiveY = PublicationObservationArchive.empty();
        archiveY = archiveY.appendBitcoinConfirmationObservation('anchor-y', confirmed({ txid: TXID_B, blockHash: BLOCK_B, blockHeight: 2, confirmationCount: 1, observedAt: new Date('2026-02-02T00:00:00Z') }));

        importPublicationObservationArchive(exportPublicationObservationArchive(archiveX));
        const { archive: resultY } = importPublicationObservationArchive(exportPublicationObservationArchive(archiveY));

        assert(resultY.bitcoinConfirmationObservationsByAnchorId['anchor-x'] === undefined, '20. importing Y after X carries none of X\'s facts');
        assert(resultY.bitcoinConfirmationObservationProvenanceByAnchorId['anchor-y'].length === 1, '21. Y\'s own single observation is the only one present, with its own single provenance entry');

        // Importing the SAME archive twice in a row still produces exactly
        // one archiveImportEvent per explicit recordPublicationObservationArchiveImport() call — never accumulated automatically.
        const { archive: firstImport } = importPublicationObservationArchive(exportPublicationObservationArchive(archiveX));
        const recorded = recordPublicationObservationArchiveImport(firstImport, { importedAt: new Date('2026-02-03T00:00:00Z') });
        assert(recorded.archiveImportEvents.length === 1, '22. one explicit recordPublicationObservationArchiveImport() call appends exactly one archiveImportEvent');
    }
    console.log('✓ Section E: repeated imports never merge — each is an independent, full replacement');

    // ---------------------------------------------------------------
    // Section F — two anchors sharing a contentHash stay isolated under
    // provenance too.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        let archive = PublicationObservationArchive.empty();
        archive = useCase.execute(archive, { anchorId: 'anchor-f-a', contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-03-01T00:00:00Z') });
        archive = useCase.execute(archive, { anchorId: 'anchor-f-b', contentHash: SHARED_CONTENT_HASH, txid: TXID_B, network: NETWORK, createdAt: new Date('2026-03-01T00:01:00Z') });
        archive = archive.appendBitcoinConfirmationObservation('anchor-f-a', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-03-01T00:10:00Z') }));

        const { archive: imported } = importPublicationObservationArchive(exportPublicationObservationArchive(archive));
        let mixed = imported;
        mixed = mixed.appendBitcoinConfirmationObservation('anchor-f-b', confirmed({ txid: TXID_B, blockHash: BLOCK_B, blockHeight: 2, confirmationCount: 1, observedAt: new Date('2026-08-28T00:00:00Z') }));

        assert(mixed.bitcoinConfirmationObservationProvenanceByAnchorId['anchor-f-a'].every((o) => o === O.IMPORTED), '23. anchor A\'s (imported) confirmation stays IMPORTED');
        assert(mixed.bitcoinConfirmationObservationProvenanceByAnchorId['anchor-f-b'].every((o) => o === O.LOCAL), '24. anchor B\'s brand-new (local) confirmation is LOCAL, never contaminated by anchor A\'s own provenance');
        assert(mixed.bitcoinAnchorPublicationRecordProvenance.every((o) => o === O.IMPORTED), '25. both publication identities, sharing one contentHash, are independently IMPORTED');
    }
    console.log('✓ Section F: two anchors sharing a contentHash keep independent provenance, never cross-contaminated');

    // ---------------------------------------------------------------
    // Section G — duplicate identities/observations each keep their own
    // provenance entry.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        const ipfsRecord = new IpfsPublicationRecord({
            contentHash: IPFS_CONTENT_HASH, locator: IPFS_LOCATOR,
            publishedAt: new Date('2026-04-01T00:00:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        });
        archive = archive.appendIpfsPublicationRecord(ipfsRecord);
        archive = archive.appendIpfsPublicationRecord(ipfsRecord);

        const { archive: imported } = importPublicationObservationArchive(exportPublicationObservationArchive(archive));
        assert(imported.ipfsPublicationRecordProvenance.length === 2, '26. both duplicate records each hold their own provenance entry');
        assert(imported.ipfsPublicationRecordProvenance.every((o) => o === O.IMPORTED), '27. both duplicates are IMPORTED, independently');
    }
    console.log('✓ Section G: duplicate identities/observations each carry their own, independent provenance entry');

    // ---------------------------------------------------------------
    // Section H — derived evidence is byte-identical regardless of
    // provenance.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const anchorId = 'anchor-h';
        let localArchive = PublicationObservationArchive.empty();
        localArchive = useCase.execute(localArchive, { anchorId, contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-05-01T00:00:00Z') });
        localArchive = localArchive.appendBitcoinConfirmationObservation(anchorId, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-05-01T00:10:00Z') }));
        localArchive = localArchive.appendBitcoinConfirmationObservation(anchorId, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 6, observedAt: new Date('2026-05-01T01:00:00Z') }));

        const { archive: importedArchive } = importPublicationObservationArchive(exportPublicationObservationArchive(localArchive));

        assert(localArchive.localFactCount !== importedArchive.localFactCount || localArchive.importedFactCount !== importedArchive.importedFactCount, '28. sanity check — the two archives genuinely differ in provenance');

        const localEvidence = reconstructBitcoinAnchorDurableEvidence(localArchive, anchorId);
        const importedEvidence = reconstructBitcoinAnchorDurableEvidence(importedArchive, anchorId);
        assert(JSON.stringify(localEvidence) === JSON.stringify(importedEvidence), '29. reconstructed durable evidence is byte-identical regardless of provenance');

        const localSummary = describePublicationObservationArchive(localArchive);
        const importedSummary = describePublicationObservationArchive(importedArchive);
        assert(JSON.stringify(localSummary) === JSON.stringify(importedSummary), '30. the cross-domain archive summary/timeline is byte-identical regardless of provenance');
    }
    console.log('✓ Section H: derived evidence and the cross-domain summary are byte-identical regardless of provenance');

    // ---------------------------------------------------------------
    // Section I — lifecycle timelines are byte-identical regardless of
    // provenance.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const anchorId = 'anchor-i';
        let localArchive = PublicationObservationArchive.empty();
        localArchive = useCase.execute(localArchive, { anchorId, contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-06-01T00:00:00Z') });
        localArchive = localArchive.appendBitcoinBroadcastRecord({ anchorId, txid: TXID_A, state: 'broadcasted', broadcastedAt: new Date('2026-06-01T00:01:00Z') });
        localArchive = localArchive.appendBitcoinConfirmationObservation(anchorId, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-06-01T00:10:00Z') }));

        const { archive: importedArchive } = importPublicationObservationArchive(exportPublicationObservationArchive(localArchive));

        const localTimeline = reconstructBitcoinAnchorPublicationLifecycleTimeline(localArchive, anchorId);
        const importedTimeline = reconstructBitcoinAnchorPublicationLifecycleTimeline(importedArchive, anchorId);
        assert(JSON.stringify(localTimeline) === JSON.stringify(importedTimeline), '31. lifecycle timeline is byte-identical regardless of provenance');
    }
    console.log('✓ Section I: lifecycle timelines are byte-identical regardless of provenance');

    // ---------------------------------------------------------------
    // Section J — provenance survives export/import; import always
    // re-stamps to IMPORTED regardless of what the payload claimed.
    // ---------------------------------------------------------------
    {
        // A generic fromJSON(toJSON()) round trip (as used by
        // storage/LocalStoragePublicationObservationArchive.js) preserves
        // whatever provenance an archive already held — it does NOT
        // relabel anything, unlike the "import" boundary.
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBitcoinConfirmationObservation('anchor-j', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-07-01T00:00:00Z') }));
        const roundTripped = PublicationObservationArchive.fromJSON(archive.toJSON());
        assert(JSON.stringify(roundTripped.toJSON()) === JSON.stringify(archive.toJSON()), '32. a generic fromJSON(toJSON()) round trip is byte-identical, provenance included — storage restore never relabels anything');
        assert(roundTripped.bitcoinConfirmationObservationProvenanceByAnchorId['anchor-j'][0] === O.LOCAL, '33. ...so a LOCAL fact survives a storage round trip as LOCAL, never silently becoming IMPORTED');

        // An archive that already holds a MIX of LOCAL and IMPORTED facts,
        // re-exported and imported again, becomes uniformly IMPORTED —
        // provenance describes entry into THIS archive, never a fact's own
        // multi-hop history.
        const { archive: onceImported } = importPublicationObservationArchive(exportPublicationObservationArchive(archive));
        let mixedArchive = onceImported.appendBitcoinConfirmationObservation('anchor-j', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 6, observedAt: new Date('2026-07-02T00:00:00Z') }));
        assert(JSON.stringify(mixedArchive.bitcoinConfirmationObservationProvenanceByAnchorId['anchor-j']) === JSON.stringify([O.IMPORTED, O.LOCAL]), '34. sanity check — mixedArchive genuinely holds one IMPORTED and one LOCAL fact');

        const { archive: reImported } = importPublicationObservationArchive(exportPublicationObservationArchive(mixedArchive));
        assert(reImported.bitcoinConfirmationObservationProvenanceByAnchorId['anchor-j'].every((o) => o === O.IMPORTED), '35. re-importing an archive that already mixed LOCAL and IMPORTED facts stamps EVERY fact IMPORTED — never carrying forward the prior LOCAL tag');
    }
    console.log('✓ Section J: a generic round trip preserves provenance; the import boundary always re-stamps to IMPORTED');

    // ---------------------------------------------------------------
    // Section K — no trust/confidence/validity/verified field anywhere.
    // ---------------------------------------------------------------
    {
        assert(isValidPublicationObservationArchiveProvenanceOrigin(O.LOCAL), '36. LOCAL is a valid origin');
        assert(isValidPublicationObservationArchiveProvenanceOrigin(O.IMPORTED), '37. IMPORTED is a valid origin');
        assert(!isValidPublicationObservationArchiveProvenanceOrigin('verified'), '38. no third origin value exists');
        assert(!isValidPublicationObservationArchiveProvenanceOrigin('trusted'), '39. "trusted" is never a valid origin');
        assert(describePublicationObservationArchiveProvenanceOrigin('nonsense') === null, '40. an unrecognized origin describes as null, never throws');
        assert(Object.keys(O).sort().join(',') === 'IMPORTED,LOCAL', '41. exactly two provenance values exist, nothing more');

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBitcoinConfirmationObservation('anchor-k', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-07-05T00:00:00Z') }));
        const view = describePublicationObservationArchiveProvenance(archive);
        const FORBIDDEN_KEYS = ['trust', 'confidence', 'valid', 'verified', 'reliable', 'health', 'score', 'canonical'];
        const json = JSON.stringify(view).toLowerCase();
        for (const forbidden of FORBIDDEN_KEYS) {
            assert(!json.includes(forbidden), `42. provenance view never mentions "${forbidden}"`);
        }
    }
    console.log('✓ Section K: no trust/confidence/validity/verified field exists anywhere near provenance');

    // ---------------------------------------------------------------
    // Section L — malformed provenance is rejected exactly like any other
    // malformed archive field.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBitcoinConfirmationObservation('anchor-l', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-07-06T00:00:00Z') }));
        const validJSON = archive.toJSON();

        const wrongLength = { ...validJSON, bitcoinConfirmationObservationProvenanceByAnchorId: { 'anchor-l': [O.LOCAL, O.LOCAL] } };
        assert(!PublicationObservationArchive.isValidJSON(wrongLength), '43. a provenance array longer than its own factual array is rejected');

        const badOrigin = { ...validJSON, bitcoinConfirmationObservationProvenanceByAnchorId: { 'anchor-l': ['trusted'] } };
        assert(!PublicationObservationArchive.isValidJSON(badOrigin), '44. an invalid origin string is rejected');

        const missingKey = { ...validJSON, bitcoinConfirmationObservationProvenanceByAnchorId: {} };
        assert(!PublicationObservationArchive.isValidJSON(missingKey), '45. a provenance-by-key object missing a key its factual counterpart has is rejected');

        const extraKey = { ...validJSON, bitcoinConfirmationObservationProvenanceByAnchorId: { 'anchor-l': [O.LOCAL], 'ghost-anchor': [O.LOCAL] } };
        assert(!PublicationObservationArchive.isValidJSON(extraKey), '46. a provenance-by-key object with an extra key its factual counterpart lacks is rejected');

        const missingField = (() => { const j = { ...validJSON }; delete j.archiveImportEvents; return j; })();
        assert(!PublicationObservationArchive.isValidJSON(missingField), '47. a missing archiveImportEvents field is rejected');

        const badImportEvent = { ...validJSON, archiveImportEvents: [{ importedAt: 'not-a-date', importedArchiveSchemaVersion: 3, importedEntryCount: 0 }] };
        assert(!PublicationObservationArchive.isValidJSON(badImportEvent), '48. an archiveImportEvent with an invalid importedAt is rejected');

        assert(PublicationObservationArchive.isValidJSON(validJSON), '49. sanity check — the original, well-formed payload is still valid');
        const malformedResult = importPublicationObservationArchive(JSON.stringify(wrongLength));
        assert(malformedResult.outcome === 'invalid-archive' && malformedResult.archive === null, '50. malformed provenance is INVALID_ARCHIVE through the import boundary too, never a partially reconstructed archive');
    }
    console.log('✓ Section L: malformed provenance is rejected exactly like any other malformed archive field');

    // ---------------------------------------------------------------
    // Section M — invalid input to the new methods is a no-op.
    // ---------------------------------------------------------------
    {
        let archive = PublicationObservationArchive.empty();
        archive = archive.appendBitcoinConfirmationObservation('anchor-m', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date('2026-07-07T00:00:00Z') }));

        assert(archive.withUniformProvenance('bogus') === archive, '51. withUniformProvenance() with an invalid origin is a no-op, returning the same instance');
        assert(archive.appendBitcoinConfirmationObservation('anchor-m', confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 1, confirmationCount: 1, observedAt: new Date() }), 'bogus') === archive, '52. an appendXxx() call with an invalid origin is a no-op');
        assert(archive.appendArchiveImportEvent({ importedAt: 'not-a-date', importedArchiveSchemaVersion: 3, importedEntryCount: 0 }) === archive, '53. appendArchiveImportEvent() with an invalid importedAt is a no-op');
        assert(archive.appendArchiveImportEvent({ importedAt: new Date(), importedArchiveSchemaVersion: -1, importedEntryCount: 0 }) === archive, '54. appendArchiveImportEvent() with a negative schema version is a no-op');
        assert(recordPublicationObservationArchiveImport({ not: 'an archive' }) instanceof PublicationObservationArchive === false, '55. recordPublicationObservationArchiveImport() with a non-archive input degrades harmlessly');
    }
    console.log('✓ Section M: invalid input to withUniformProvenance()/appendArchiveImportEvent() is a no-op, mirroring every other appendXxx()');

    console.log('\nAll PublicationObservationArchiveProvenance tests passed.');
}

run();
