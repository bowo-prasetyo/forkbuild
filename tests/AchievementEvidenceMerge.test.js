import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/IpfsPublicationRecord.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { reconstructAchievementEvents } from '../application/AchievementEvent.js';
import { reconstructPublisherAchievementStatistics } from '../application/PublisherAchievementStatisticsView.js';
import { reconstructPublisherRanking } from '../application/PublisherRankingPolicy.js';
import { reconstructPublisherLeaderboard } from '../application/PublisherLeaderboardView.js';
import {
    AchievementEvidenceImportOutcome,
    exportAchievementEvidence,
    importAchievementEvidence
} from '../application/AchievementEvidenceExport.js';
import {
    AchievementEvidenceMergeOutcome,
    describeAchievementEvidenceMerge,
    mergeAchievementEvidence
} from '../application/AchievementEvidenceMerge.js';

// 0.8.115 — Explicit Achievement Evidence Merge.
//
// The flagship this milestone exists to prove: two replicas, each holding
// its OWN, independently-built evidence, and NEITHER holding the other's,
// can merge one's exported evidence into the other's existing archive —
// without losing anything either side already had — and independently
// reconstruct achievement events, statistics, ranking, and leaderboard
// that reflect BOTH replicas' evidence, from a single, explicit
// `mergeAchievementEvidence()` call followed by the identical, UNCHANGED
// reconstruction pipeline 0.8.114 already proved.
//
//   Section A: FLAGSHIP — Bob merges Alice's exported evidence into his
//              own, already non-empty archive; the merged archive holds
//              the union of both; reconstruction over it reflects facts
//              from both replicas
//   Section B: idempotency — merging the identical payload twice leaves
//              the archive exactly as the first merge did, and returns
//              the SAME archive instance, not merely an equal one
//   Section C: distinct multiplicity — two evidence records differing in
//              only one field (createdAt) are never collapsed into one
//   Section D: describeAchievementEvidenceMerge() previews merge without
//              performing it, and its own outcome always matches what
//              mergeAchievementEvidence() itself would return
//   Section E: malformed evidence is INVALID_EVIDENCE for both functions,
//              and archive is untouched
//   Section F: provenance — existing facts keep their own provenance;
//              every newly-incorporated fact is stamped IMPORTED,
//              regardless of its provenance in the archive it came from
//   Section G: merge touches only the four evidence collections — every
//              other collection the target archive holds passes through
//              completely unchanged
//   Section H: merge requires a genuine archive instance and never
//              mutates it
//   Section I: merge never returns achievement/badge/rank/leaderboard
//              vocabulary of any kind

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const NETWORK = 'mainnet';
const TXID_A1 = 'a'.repeat(64);
const TXID_A2 = '0x' + 'b'.repeat(64);
const TXID_B1 = '0x' + 'c'.repeat(64);

// Replica A (Alice) — never holds anything of Bob's.
function buildReplicaA() {
    const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
    const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
    const referenceUseCase = new CreatePublicationReferenceRecordUseCase();
    const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

    let archive = PublicationObservationArchive.empty();
    archive = btcUseCase.execute(archive, { anchorId: 'A1', contentHash: 'content-a1', txid: TXID_A1, network: NETWORK, createdAt: new Date('2026-08-10T00:00:00Z') });
    archive = baseUseCase.execute(archive, { contentHash: 'content-a2', txid: TXID_A2, network: NETWORK, createdAt: new Date('2026-08-10T00:01:00Z') });

    const identityA1 = archive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
    const identityA2 = archive.baseAnchorPublicationRecords[0].toBlockchainPublicationIdentity();

    archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: identityA1, referencedPublicationIdentity: identityA2, createdAt: new Date('2026-08-10T00:02:00Z') });
    archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityA1, createdAt: new Date('2026-08-10T00:03:00Z') });
    archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityA2, createdAt: new Date('2026-08-10T00:04:00Z') });

    return archive;
}

// Replica B (Bob) — already has his own evidence, including a reference to
// Alice's own A1 identity Bob learned about some other way (never Alice's
// own record — only its identity projection, exactly like `application/
// CreatePublicationReferenceRecordUseCase.js`'s own header requires).
function buildReplicaB(identityA1) {
    const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
    const referenceUseCase = new CreatePublicationReferenceRecordUseCase();
    const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

    let archive = PublicationObservationArchive.empty();
    archive = baseUseCase.execute(archive, { contentHash: 'content-b1', txid: TXID_B1, network: NETWORK, createdAt: new Date('2026-08-11T00:00:00Z') });

    const identityB1 = archive.baseAnchorPublicationRecords[0].toBlockchainPublicationIdentity();

    archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: identityB1, referencedPublicationIdentity: identityA1, createdAt: new Date('2026-08-11T00:01:00Z') });
    archive = associationUseCase.execute(archive, { publisherId: 'Bob', publicationIdentity: identityB1, createdAt: new Date('2026-08-11T00:02:00Z') });

    return archive;
}

function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    let mergedArchive;
    {
        const replicaA = buildReplicaA();
        const identityA1 = replicaA.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        const replicaB = buildReplicaB(identityA1);

        assert(replicaB.publicationReferenceRecords.length === 1, '1. sanity — Bob\'s own archive already holds one reference before merging anything');
        assert(replicaB.publisherPublicationAssociationRecords.length === 1, '2. sanity — Bob\'s own archive already holds one association before merging anything');

        const alicePayload = exportAchievementEvidence(replicaA);
        const mergeResult = mergeAchievementEvidence(replicaB, JSON.stringify(alicePayload));

        assert(mergeResult.outcome === AchievementEvidenceMergeOutcome.MERGED, '3. merging Alice\'s genuine evidence into Bob\'s archive succeeds');
        assert(mergeResult.archive instanceof PublicationObservationArchive, '4. merge produces a genuine PublicationObservationArchive instance');

        mergedArchive = mergeResult.archive;

        // The union of both replicas' own evidence — nothing lost, nothing
        // dropped.
        assert(mergedArchive.bitcoinAnchorPublicationRecordCount === 1, '5. merged archive holds Alice\'s one Bitcoin publication (A1)');
        assert(mergedArchive.baseAnchorPublicationRecordCount === 2, '6. merged archive holds both Base publications (Bob\'s B1, Alice\'s A2)');
        assert(mergedArchive.publicationReferenceRecordCount === 2, '7. merged archive holds both references (Bob\'s B1→A1, Alice\'s A1→A2)');
        assert(mergedArchive.publisherPublicationAssociationRecordCount === 3, '8. merged archive holds all three associations (Bob→B1, Alice→A1, Alice→A2)');

        // Bob's own pre-existing facts are completely untouched.
        assert(mergedArchive.baseAnchorPublicationRecords.some((r) => r.txid === TXID_B1), '9. Bob\'s own Base publication survives the merge');
        assert(mergedArchive.publisherPublicationAssociationRecords.some((r) => r.publisherIdentity.publisherId === 'Bob'), '10. Bob\'s own association survives the merge');

        // Independent reconstruction over the merged archive reflects BOTH
        // replicas' evidence — the identical, UNCHANGED pipeline 0.8.114
        // already proved.
        const events = reconstructAchievementEvents(mergedArchive);
        const leaderboard = reconstructPublisherLeaderboard(mergedArchive);
        const ranking = reconstructPublisherRanking(mergedArchive);
        const aliceStatistics = reconstructPublisherAchievementStatistics(mergedArchive, new PublisherIdentityRecord({ publisherId: 'Alice' }));
        const bobStatistics = reconstructPublisherAchievementStatistics(mergedArchive, new PublisherIdentityRecord({ publisherId: 'Bob' }));

        assert(events.count > 0, '11. the merged archive genuinely earns at least one achievement event');
        assert(leaderboard.entryCount === 2, '12. both Alice and Bob appear on the leaderboard reconstructed from the merged archive');
        assert(ranking.entries.length === 2, '13. both publishers appear in the ranking reconstructed from the merged archive');
        assert(aliceStatistics.achievementCount > 0 || aliceStatistics.badgeCount > 0, '14. Alice\'s own statistics, reconstructed on Bob\'s merged archive, reflect Alice\'s own evidence');
        assert(bobStatistics !== null && typeof bobStatistics === 'object', '15. Bob\'s own statistics reconstruct on his own merged archive');
    }
    console.log('✓ Section A: FLAGSHIP — Bob merges Alice\'s exported evidence into his own existing archive; the union is preserved, and independent reconstruction reflects both replicas\' evidence');

    // ---------------------------------------------------------------
    // Section B — idempotency.
    // ---------------------------------------------------------------
    {
        const replicaA = buildReplicaA();
        const identityA1 = replicaA.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        const replicaB = buildReplicaB(identityA1);
        const alicePayload = exportAchievementEvidence(replicaA);

        const firstMerge = mergeAchievementEvidence(replicaB, alicePayload);
        assert(firstMerge.outcome === AchievementEvidenceMergeOutcome.MERGED, '16. sanity — first merge succeeds');

        const secondMerge = mergeAchievementEvidence(firstMerge.archive, alicePayload);
        assert(secondMerge.outcome === AchievementEvidenceMergeOutcome.MERGED, '17. re-merging the identical payload still succeeds');
        assert(secondMerge.archive === firstMerge.archive, '18. re-merging the identical payload changes nothing — the SAME archive instance is returned, not merely an equal one');

        // A genuinely empty payload merged into a non-empty archive is
        // likewise a true no-op.
        const emptyPayload = { schemaVersion: 1, bitcoinAnchorPublicationRecords: [], baseAnchorPublicationRecords: [], publicationReferenceRecords: [], publisherPublicationAssociationRecords: [] };
        const emptyMerge = mergeAchievementEvidence(firstMerge.archive, emptyPayload);
        assert(emptyMerge.archive === firstMerge.archive, '19. merging an evidence payload naming nothing new returns the identical archive instance');
    }
    console.log('✓ Section B: idempotency — merging the identical payload twice, or an empty payload, changes nothing and returns the same archive instance');

    // ---------------------------------------------------------------
    // Section C — distinct multiplicity: records differing in only one
    // field are never collapsed.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        const referenceUseCase = new CreatePublicationReferenceRecordUseCase();

        let source = PublicationObservationArchive.empty();
        source = btcUseCase.execute(source, { anchorId: 'X', contentHash: 'content-x', txid: 'e'.repeat(64), network: NETWORK, createdAt: new Date('2026-08-12T00:00:00Z') });
        source = baseUseCase.execute(source, { contentHash: 'content-y', txid: '0x' + 'f'.repeat(64), network: NETWORK, createdAt: new Date('2026-08-12T00:01:00Z') });
        const identityX = source.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        const identityY = source.baseAnchorPublicationRecords[0].toBlockchainPublicationIdentity();

        // Two references naming the SAME source/referenced pair, differing
        // ONLY in their own createdAt.
        const earlierReferenceArchive = referenceUseCase.execute(source, { sourcePublicationIdentity: identityX, referencedPublicationIdentity: identityY, createdAt: new Date('2026-08-12T01:00:00Z') });
        const laterReferenceArchive = referenceUseCase.execute(source, { sourcePublicationIdentity: identityX, referencedPublicationIdentity: identityY, createdAt: new Date('2026-08-12T02:00:00Z') });

        let target = PublicationObservationArchive.empty();
        const firstMerge = mergeAchievementEvidence(target, exportAchievementEvidence(earlierReferenceArchive));
        assert(firstMerge.archive.publicationReferenceRecordCount === 1, '20. sanity — one reference merged in');

        const secondMerge = mergeAchievementEvidence(firstMerge.archive, exportAchievementEvidence(laterReferenceArchive));
        assert(secondMerge.archive.publicationReferenceRecordCount === 2, '21. a reference differing only by createdAt is genuinely distinct evidence, and both are kept');

        // Re-merging the FIRST (earlier) reference again does not add a
        // third — it is byte-identical to one already present.
        const thirdMerge = mergeAchievementEvidence(secondMerge.archive, exportAchievementEvidence(earlierReferenceArchive));
        assert(thirdMerge.archive === secondMerge.archive, '22. re-merging the earlier reference a second time adds nothing — it already exists');
    }
    console.log('✓ Section C: distinct multiplicity — evidence records differing in only one field (createdAt) remain distinct, never collapsed');

    // ---------------------------------------------------------------
    // Section D — describeAchievementEvidenceMerge() previews without
    // performing, and always matches mergeAchievementEvidence()'s own
    // outcome.
    // ---------------------------------------------------------------
    {
        const replicaA = buildReplicaA();
        const identityA1 = replicaA.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        const replicaB = buildReplicaB(identityA1);
        const alicePayload = exportAchievementEvidence(replicaA);

        const beforeJSON = JSON.stringify(replicaB.toJSON());
        const preview = describeAchievementEvidenceMerge(replicaB, alicePayload);
        assert(JSON.stringify(replicaB.toJSON()) === beforeJSON, '23. describeAchievementEvidenceMerge() never mutates the archive it is given');

        assert(preview.outcome === AchievementEvidenceMergeOutcome.MERGED, '24. preview outcome is MERGED for genuine evidence');
        assert(preview.bitcoinAnchorPublicationRecords.existingCount === 0 && preview.bitcoinAnchorPublicationRecords.incomingCount === 1 && preview.bitcoinAnchorPublicationRecords.newCount === 1, '25. preview correctly counts Bitcoin publications');
        assert(preview.baseAnchorPublicationRecords.existingCount === 1 && preview.baseAnchorPublicationRecords.incomingCount === 1 && preview.baseAnchorPublicationRecords.newCount === 1, '26. preview correctly counts Base publications');
        assert(preview.publicationReferenceRecords.existingCount === 1 && preview.publicationReferenceRecords.incomingCount === 1 && preview.publicationReferenceRecords.newCount === 1, '27. preview correctly counts references');
        assert(preview.publisherPublicationAssociationRecords.existingCount === 1 && preview.publisherPublicationAssociationRecords.incomingCount === 2 && preview.publisherPublicationAssociationRecords.newCount === 2, '28. preview correctly counts associations');
        assert(preview.totalNewCount === 1 + 1 + 1 + 2, '29. preview\'s totals sum every collection\'s own newCount');
        assert(preview.totalDuplicateCount === 0, '30. nothing Alice sent already existed in Bob\'s own archive, so no duplicates');

        const actualMerge = mergeAchievementEvidence(replicaB, alicePayload);
        assert(preview.outcome === actualMerge.outcome, '31. preview outcome matches the outcome the real merge call returns');

        // Preview a merge that adds nothing new — duplicateCount should
        // equal incomingCount, newCount zero.
        const noOpPreview = describeAchievementEvidenceMerge(actualMerge.archive, alicePayload);
        assert(noOpPreview.totalNewCount === 0, '32. previewing a no-op merge reports zero new records');
        assert(noOpPreview.totalDuplicateCount === preview.totalNewCount, '33. previewing a no-op merge reports every one of those records as a duplicate');
    }
    console.log('✓ Section D: describeAchievementEvidenceMerge() previews accurate counts without mutating, and its outcome always matches the real merge\'s own outcome');

    // ---------------------------------------------------------------
    // Section E — malformed evidence is INVALID_EVIDENCE for both
    // functions; archive is untouched.
    // ---------------------------------------------------------------
    {
        const archive = buildReplicaA();
        const beforeJSON = JSON.stringify(archive.toJSON());

        const malformedInputs = ['not even json{', JSON.stringify({ rank: 1 }), null, undefined, 42, JSON.stringify([1, 2, 3])];
        for (const input of malformedInputs) {
            const mergeResult = mergeAchievementEvidence(archive, input);
            assert(mergeResult.outcome === AchievementEvidenceMergeOutcome.INVALID_EVIDENCE, `34. malformed payload is rejected as INVALID_EVIDENCE, saw ${mergeResult.outcome} for ${JSON.stringify(input)}`);
            assert(mergeResult.archive === null, `35. a rejected merge never returns a partially merged archive, saw for ${JSON.stringify(input)}`);

            const preview = describeAchievementEvidenceMerge(archive, input);
            assert(preview.outcome === AchievementEvidenceMergeOutcome.INVALID_EVIDENCE, `36. describe() reports the identical INVALID_EVIDENCE outcome for ${JSON.stringify(input)}`);
            assert(Object.keys(preview).length === 1 && 'outcome' in preview, `37. an invalid-evidence preview carries no count fields at all, saw for ${JSON.stringify(input)}`);
        }

        assert(JSON.stringify(archive.toJSON()) === beforeJSON, '38. a rejected merge never mutates the archive it was given');
    }
    console.log('✓ Section E: malformed evidence is INVALID_EVIDENCE for both merge and preview, and the target archive is left untouched');

    // ---------------------------------------------------------------
    // Section F — provenance: existing facts keep their own provenance;
    // newly-incorporated facts are always IMPORTED.
    // ---------------------------------------------------------------
    {
        const replicaA = buildReplicaA();
        const identityA1 = replicaA.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        const replicaB = buildReplicaB(identityA1);

        assert(replicaB.localFactCount > 0 && replicaB.importedFactCount === 0, '39. sanity — Bob\'s own facts, built via ordinary use cases, are all LOCAL before any merge');
        const localFactCountBeforeMerge = replicaB.localFactCount;

        const { archive: merged } = mergeAchievementEvidence(replicaB, exportAchievementEvidence(replicaA));
        assert(merged.localFactCount === localFactCountBeforeMerge, '40. every fact Bob already held stays LOCAL after merging — merge never rewrites existing provenance');
        assert(merged.importedFactCount === merged.totalFactCount - localFactCountBeforeMerge, '41. every newly-incorporated fact is stamped IMPORTED');
        assert(merged.importedFactCount > 0, '42. sanity — at least one fact was actually newly incorporated');

        // Provenance never becomes a pseudo-blockchain attached to the
        // fact: re-exporting the merged evidence carries no provenance of
        // any kind, exactly like 0.8.114's own export never did.
        const reexported = exportAchievementEvidence(merged);
        for (const forbidden of ['bitcoinAnchorPublicationRecordProvenance', 'baseAnchorPublicationRecordProvenance', 'publicationReferenceRecordProvenance', 'publisherPublicationAssociationRecordProvenance']) {
            assert(!(forbidden in reexported), `43. ${forbidden} never appears in evidence re-exported after a merge`);
        }
    }
    console.log('✓ Section F: existing facts keep their own provenance; every newly-incorporated fact is stamped IMPORTED; provenance never re-exports');

    // ---------------------------------------------------------------
    // Section G — merge touches only the four evidence collections; every
    // other collection the target archive holds is untouched.
    // ---------------------------------------------------------------
    {
        let bobArchive = buildReplicaB(buildReplicaA().bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity());
        bobArchive = bobArchive.appendIpfsPublicationRecord(new IpfsPublicationRecord({
            contentHash: 'bob-ipfs-content', locator: 'ipfs://bafy-bob',
            publishedAt: new Date('2026-08-11T00:03:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        }));
        bobArchive = bobArchive.appendBitcoinBroadcastRecord({ anchorId: 'bob-broadcast-anchor', txid: 'd'.repeat(64), state: 'broadcasted', broadcastedAt: new Date('2026-08-11T00:04:00Z') });

        const beforeIpfsJSON = JSON.stringify(bobArchive.ipfsPublicationRecords.map((r) => r.toJSON()));
        const beforeBroadcastJSON = JSON.stringify(bobArchive.bitcoinBroadcastRecords);
        const beforeImportEventsJSON = JSON.stringify(bobArchive.archiveImportEvents);

        const replicaA = buildReplicaA();
        const { archive: merged } = mergeAchievementEvidence(bobArchive, exportAchievementEvidence(replicaA));

        assert(JSON.stringify(merged.ipfsPublicationRecords.map((r) => r.toJSON())) === beforeIpfsJSON, '44. merge never touches ipfsPublicationRecords');
        assert(JSON.stringify(merged.bitcoinBroadcastRecords) === beforeBroadcastJSON, '45. merge never touches bitcoinBroadcastRecords');
        assert(JSON.stringify(merged.archiveImportEvents) === beforeImportEventsJSON, '46. merge records no whole-archive import event — evidence merge is a narrower operation, exactly like evidence import');
    }
    console.log('✓ Section G: merge touches only the four evidence collections — every other collection the target archive holds passes through unchanged');

    // ---------------------------------------------------------------
    // Section H — merge requires a genuine archive instance and never
    // mutates it.
    // ---------------------------------------------------------------
    {
        let threw = false;
        try {
            mergeAchievementEvidence({ bitcoinAnchorPublicationRecords: [] }, exportAchievementEvidence(buildReplicaA()));
        } catch (error) {
            threw = true;
        }
        assert(threw, '47. mergeAchievementEvidence() throws for a non-PublicationObservationArchive archive argument');

        let describeThrew = false;
        try {
            describeAchievementEvidenceMerge(null, {});
        } catch (error) {
            describeThrew = true;
        }
        assert(describeThrew, '48. describeAchievementEvidenceMerge() throws for a non-PublicationObservationArchive archive argument');

        const archive = buildReplicaB(buildReplicaA().bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity());
        const beforeJSON = JSON.stringify(archive.toJSON());
        mergeAchievementEvidence(archive, exportAchievementEvidence(buildReplicaA()));
        assert(JSON.stringify(archive.toJSON()) === beforeJSON, '49. merging never mutates the archive it was given — a NEW archive is always returned');
    }
    console.log('✓ Section H: merge requires a genuine archive instance and never mutates the one it is given');

    // ---------------------------------------------------------------
    // Section I — merge never returns achievement/badge/rank/leaderboard
    // vocabulary of any kind.
    // ---------------------------------------------------------------
    {
        const replicaA = buildReplicaA();
        const identityA1 = replicaA.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        const replicaB = buildReplicaB(identityA1);

        const mergeResult = mergeAchievementEvidence(replicaB, exportAchievementEvidence(replicaA));
        assert(Object.keys(mergeResult).sort().join(',') === 'archive,outcome', '50. mergeAchievementEvidence() returns exactly { outcome, archive } — no achievement-shaped fields');

        const preview = describeAchievementEvidenceMerge(replicaB, exportAchievementEvidence(replicaA));
        const forbidden = ['rank', 'score', 'points', 'badgecount', 'achievementcount', 'leaderboard', 'achievementkind'];
        for (const key of Object.keys(preview)) {
            assert(!forbidden.includes(key.toLowerCase()), `51. describeAchievementEvidenceMerge()'s own top-level key "${key}" must never look like a computed conclusion`);
        }
    }
    console.log('✓ Section I: merge and its preview never carry achievement/badge/rank/leaderboard vocabulary');

    // ---------------------------------------------------------------
    // Section J — import's and merge's own outcome vocabularies stay
    // independent, and a merged archive's own evidence still round-trips
    // cleanly through 0.8.114's own, UNCHANGED export/import.
    // ---------------------------------------------------------------
    {
        assert(AchievementEvidenceImportOutcome.IMPORTED !== AchievementEvidenceMergeOutcome.MERGED, '52. import\'s and merge\'s own outcome vocabularies are independent');
        assert(importAchievementEvidence(exportAchievementEvidence(mergedArchive)).outcome === AchievementEvidenceImportOutcome.IMPORTED, '53. the merged archive\'s own evidence still exports and re-imports cleanly, exactly like any other archive\'s');
    }
    console.log('✓ Section J: import\'s and merge\'s own outcome vocabularies are independent, and a merged archive\'s evidence still round-trips through export/import');

    console.log('\nAll AchievementEvidenceMerge tests passed.');
}

try {
    run();
} catch (error) {
    console.error('AchievementEvidenceMerge.test.js FAILED:', error);
    process.exitCode = 1;
}
