import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import {
    exportAchievementEvidence,
    importAchievementEvidence
} from '../application/AchievementEvidenceExport.js';
import { mergeAchievementEvidence } from '../application/AchievementEvidenceMerge.js';
import { reconstructAchievementEvidenceFingerprint } from '../application/AchievementEvidenceFingerprint.js';
import {
    AchievementEvidenceDifferenceCollectionOrder,
    describeAchievementEvidenceDifference,
    reconstructAchievementEvidenceDifference
} from '../application/AchievementEvidenceDifference.js';

// 0.8.117 — Achievement Evidence Difference Projection.
//
//   Section A: empty vs empty — no difference
//   Section B: identical archives (structurally, not the same instance) —
//              no difference
//   Section C: one-sided evidence — correct sourceOnly/targetOnly records
//   Section D: multi-collection isolation — a difference in one collection
//              never leaks into another
//   Section E: exact structural equality — a record differing in a single
//              non-createdAt field is genuinely distinct evidence
//   Section F: multiplicity preservation — [A, A] vs [A] reports exactly
//              one A as exclusive, never zero or two
//   Section G: createdAt sensitivity — two otherwise-identical records
//              differing only in createdAt are both genuinely distinct
//   Section H: cross-chain identity isolation — a Bitcoin and a Base
//              record with identical-looking content never cancel each
//              other out across collections
//   Section I: provenance independence — LOCAL and IMPORTED evidence,
//              otherwise identical, reports no difference
//   Section J: input archives are never mutated
//   Section K: deterministic repeated output
//   Section L: reload/export equivalence — export -> import -> diff
//              against the original reports no difference
//   Section M: fingerprint agrees with difference result — sameEvidence
//              always matches sourceFingerprint === targetFingerprint
//   Section N: FLAGSHIP — merge convergence: before merging, each
//              replica's own exclusive evidence appears on its own side of
//              the difference; after each merges the other's evidence, the
//              difference reports no difference at all
//   Section O: shape, defaults, and vocabulary — describe()/reconstruct()
//              defaults, non-archive degradation, and no achievement/
//              badge/statistics/ranking/leaderboard vocabulary anywhere

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const NETWORK = 'mainnet';
const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);
const TXID_C = 'c'.repeat(64);
const TXID_D = 'd'.repeat(64);
const TXID_BASE_A = '0x' + 'e'.repeat(64);
const TXID_BASE_B = '0x' + 'f'.repeat(64);

function bitcoinIdentity(archive, anchorId) {
    return archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === anchorId).toBlockchainPublicationIdentity();
}

function baseIdentity(archive, txid) {
    return archive.baseAnchorPublicationRecords.find((r) => r.txid === txid).toBlockchainPublicationIdentity();
}

function run() {
    // ---------------------------------------------------------------
    // Section A — empty vs empty.
    // ---------------------------------------------------------------
    {
        const diff = reconstructAchievementEvidenceDifference(PublicationObservationArchive.empty(), new PublicationObservationArchive());
        assert(diff.sameEvidence === true, '1. two empty archives report sameEvidence');
        assert(diff.sourceOnlyCount === 0 && diff.targetOnlyCount === 0, '2. two empty archives report zero source-only and target-only facts');
        for (const key of AchievementEvidenceDifferenceCollectionOrder) {
            assert(diff[key].sourceOnly.length === 0 && diff[key].targetOnly.length === 0, `3. collection ${key} reports no exclusive evidence for two empty archives`);
        }
    }
    console.log('✓ Section A: two empty archives report no difference at all');

    // ---------------------------------------------------------------
    // Section B — identical archives, structurally, but distinct
    // instances.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        function build() {
            let archive = PublicationObservationArchive.empty();
            archive = btcUseCase.execute(archive, { anchorId: 'ident-a', contentHash: 'ident-content-a', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-20T00:00:00Z') });
            return archive;
        }
        const one = build();
        const two = build();
        assert(one !== two, '4. sanity — two independently built archives are distinct instances');

        const diff = reconstructAchievementEvidenceDifference(one, two);
        assert(diff.sameEvidence === true, '5. two independently built, structurally identical archives report sameEvidence');
        assert(diff.sourceFingerprint === diff.targetFingerprint, '6. their fingerprints also match');
        assert(diff.bitcoinAnchorPublicationRecords.sourceCount === 1 && diff.bitcoinAnchorPublicationRecords.targetCount === 1, '7. each side\'s own count is reported correctly even when there is no difference');
    }
    console.log('✓ Section B: two structurally identical (but distinct-instance) archives report no difference');

    // ---------------------------------------------------------------
    // Section C — one-sided evidence: correct sourceOnly/targetOnly
    // records.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const sharedSpec = { anchorId: 'shared', contentHash: 'shared-content', txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-21T00:00:00Z') };

        let source = PublicationObservationArchive.empty();
        source = btcUseCase.execute(source, { anchorId: 'source-only', contentHash: 'source-only-content', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-21T00:01:00Z') });
        source = btcUseCase.execute(source, sharedSpec);

        let target = PublicationObservationArchive.empty();
        target = btcUseCase.execute(target, sharedSpec);
        target = btcUseCase.execute(target, { anchorId: 'target-only', contentHash: 'target-only-content', txid: TXID_D, network: NETWORK, createdAt: new Date('2026-08-21T00:02:00Z') });

        const diff = reconstructAchievementEvidenceDifference(source, target);
        assert(diff.sameEvidence === false, '8. two archives with genuinely exclusive evidence on each side never report sameEvidence');
        assert(diff.bitcoinAnchorPublicationRecords.sourceOnlyCount === 1 && diff.bitcoinAnchorPublicationRecords.targetOnlyCount === 1, '9. exactly one record is exclusive to each side');
        assert(diff.bitcoinAnchorPublicationRecords.sourceOnly[0].anchorId === 'source-only', '10. the source-only record is exactly the one only the source archive holds');
        assert(diff.bitcoinAnchorPublicationRecords.targetOnly[0].anchorId === 'target-only', '11. the target-only record is exactly the one only the target archive holds');
        assert(JSON.stringify(diff.bitcoinAnchorPublicationRecords.sourceOnly[0]) === JSON.stringify(source.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'source-only').toJSON()), '12. the reported source-only record is the exact canonical toJSON() shape of the real record');
        assert(diff.sourceOnlyCount === 1 && diff.targetOnlyCount === 1, '13. the top-level counts sum this one collection\'s own counts');
    }
    console.log('✓ Section C: one-sided evidence is reported as exactly the correct source-only/target-only records');

    // ---------------------------------------------------------------
    // Section D — multi-collection isolation.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const referenceUseCase = new CreatePublicationReferenceRecordUseCase();

        let base = PublicationObservationArchive.empty();
        base = btcUseCase.execute(base, { anchorId: 'iso-x', contentHash: 'iso-content-x', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-22T00:00:00Z') });
        base = btcUseCase.execute(base, { anchorId: 'iso-y', contentHash: 'iso-content-y', txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-22T00:01:00Z') });
        const identityX = bitcoinIdentity(base, 'iso-x');
        const identityY = bitcoinIdentity(base, 'iso-y');

        // Source has one extra reference record; every other collection is
        // byte-identical between the two sides.
        const source = referenceUseCase.execute(base, { sourcePublicationIdentity: identityY, referencedPublicationIdentity: identityX, createdAt: new Date('2026-08-22T00:02:00Z') });
        const target = base;

        const diff = reconstructAchievementEvidenceDifference(source, target);
        assert(diff.publicationReferenceRecords.sourceOnlyCount === 1 && diff.publicationReferenceRecords.targetOnlyCount === 0, '14. the reference collection alone reports the difference');
        assert(diff.bitcoinAnchorPublicationRecords.sourceOnlyCount === 0 && diff.bitcoinAnchorPublicationRecords.targetOnlyCount === 0, '15. the unrelated bitcoin collection reports no difference at all');
        assert(diff.baseAnchorPublicationRecords.sourceOnlyCount === 0 && diff.baseAnchorPublicationRecords.targetOnlyCount === 0, '16. the unrelated base collection reports no difference at all');
        assert(diff.publisherPublicationAssociationRecords.sourceOnlyCount === 0 && diff.publisherPublicationAssociationRecords.targetOnlyCount === 0, '17. the unrelated association collection reports no difference at all');
        assert(diff.sourceOnlyCount === 1 && diff.targetOnlyCount === 0, '18. the top-level counts reflect only the one differing collection');
    }
    console.log('✓ Section D: a difference confined to one collection never leaks into another');

    // ---------------------------------------------------------------
    // Section E — exact structural equality: a single non-createdAt field
    // difference is genuinely distinct evidence.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        let base = PublicationObservationArchive.empty();
        base = btcUseCase.execute(base, { anchorId: 'struct-a', contentHash: 'struct-content-a', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-23T00:00:00Z') });
        const identity = bitcoinIdentity(base, 'struct-a');
        const sharedCreatedAt = new Date('2026-08-23T00:01:00Z');

        const withAlice = associationUseCase.execute(base, { publisherId: 'Alice', publicationIdentity: identity, createdAt: sharedCreatedAt });
        const withBob = associationUseCase.execute(base, { publisherId: 'Bob', publicationIdentity: identity, createdAt: sharedCreatedAt });

        const diff = reconstructAchievementEvidenceDifference(withAlice, withBob);
        assert(diff.publisherPublicationAssociationRecords.sourceOnlyCount === 1 && diff.publisherPublicationAssociationRecords.targetOnlyCount === 1, '19. two associations differing only in publisherId are both reported as exclusive to their own side');
        assert(diff.publisherPublicationAssociationRecords.sourceOnly[0].publisherIdentity.publisherId === 'Alice', '20. the source-only association names Alice');
        assert(diff.publisherPublicationAssociationRecords.targetOnly[0].publisherIdentity.publisherId === 'Bob', '21. the target-only association names Bob');
    }
    console.log('✓ Section E: records differing in a single field are exact, distinct evidence — never partially matched');

    // ---------------------------------------------------------------
    // Section F — multiplicity preservation.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const referenceUseCase = new CreatePublicationReferenceRecordUseCase();

        let base = PublicationObservationArchive.empty();
        base = btcUseCase.execute(base, { anchorId: 'mult-a', contentHash: 'mult-content-a', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-24T00:00:00Z') });
        base = btcUseCase.execute(base, { anchorId: 'mult-b', contentHash: 'mult-content-b', txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-24T00:01:00Z') });
        const identityA = bitcoinIdentity(base, 'mult-a');
        const identityB = bitcoinIdentity(base, 'mult-b');
        const createdAt = new Date('2026-08-24T00:02:00Z');

        // Target: the reference asserted once. Source: the identical fact
        // asserted TWICE — a legitimately retained duplicate, per
        // application/PublicationReferenceRecord.js's own "NEVER
        // DEDUPLICATED" header.
        let target = referenceUseCase.execute(base, { sourcePublicationIdentity: identityB, referencedPublicationIdentity: identityA, createdAt });
        let source = referenceUseCase.execute(target, { sourcePublicationIdentity: identityB, referencedPublicationIdentity: identityA, createdAt });

        assert(source.publicationReferenceRecords.length === 2, '22. sanity — the source archive genuinely holds the duplicate reference twice');
        assert(target.publicationReferenceRecords.length === 1, '23. sanity — the target archive holds it only once');

        const diff = reconstructAchievementEvidenceDifference(source, target);
        assert(diff.publicationReferenceRecords.sourceOnlyCount === 1, '24. [A, A] compared against [A] reports exactly ONE A as source-only — never zero');
        assert(diff.publicationReferenceRecords.targetOnlyCount === 0, '25. ...and never reports anything as target-only, since target holds nothing source lacks');
        assert(diff.sameEvidence === false, '26. a genuine multiplicity difference is never reported as sameEvidence');
    }
    console.log('✓ Section F: [A, A] versus [A] reports exactly one exclusive record — multiplicity is preserved, never collapsed to a set');

    // ---------------------------------------------------------------
    // Section G — createdAt sensitivity.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const referenceUseCase = new CreatePublicationReferenceRecordUseCase();

        let base = PublicationObservationArchive.empty();
        base = btcUseCase.execute(base, { anchorId: 'time-a', contentHash: 'time-content-a', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-25T00:00:00Z') });
        base = btcUseCase.execute(base, { anchorId: 'time-b', contentHash: 'time-content-b', txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-25T00:01:00Z') });
        const identityA = bitcoinIdentity(base, 'time-a');
        const identityB = bitcoinIdentity(base, 'time-b');

        const earlier = referenceUseCase.execute(base, { sourcePublicationIdentity: identityB, referencedPublicationIdentity: identityA, createdAt: new Date('2026-08-25T01:00:00Z') });
        const later = referenceUseCase.execute(base, { sourcePublicationIdentity: identityB, referencedPublicationIdentity: identityA, createdAt: new Date('2026-08-25T02:00:00Z') });

        const diff = reconstructAchievementEvidenceDifference(earlier, later);
        assert(diff.publicationReferenceRecords.sourceOnlyCount === 1 && diff.publicationReferenceRecords.targetOnlyCount === 1, '27. two references identical except createdAt are each other\'s exclusive evidence, never matched away');
        assert(diff.sameEvidence === false, '28. a createdAt-only difference is never reported as sameEvidence');
    }
    console.log('✓ Section G: records differing only in createdAt remain distinct facts, never silently matched');

    // ---------------------------------------------------------------
    // Section H — cross-chain identity isolation.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        const sharedContentHash = 'cross-chain-shared-content';
        const sharedCreatedAt = new Date('2026-08-26T00:00:00Z');

        let bitcoinOnly = PublicationObservationArchive.empty();
        bitcoinOnly = btcUseCase.execute(bitcoinOnly, { anchorId: 'cross-anchor', contentHash: sharedContentHash, txid: TXID_A, network: NETWORK, createdAt: sharedCreatedAt });

        let baseOnly = PublicationObservationArchive.empty();
        baseOnly = baseUseCase.execute(baseOnly, { contentHash: sharedContentHash, txid: TXID_A, network: NETWORK, createdAt: sharedCreatedAt });

        const diff = reconstructAchievementEvidenceDifference(bitcoinOnly, baseOnly);
        assert(diff.bitcoinAnchorPublicationRecords.sourceOnlyCount === 1 && diff.bitcoinAnchorPublicationRecords.targetOnlyCount === 0, '29. the bitcoin collection reports the bitcoin record as source-only, never cancelled by an unrelated base record');
        assert(diff.baseAnchorPublicationRecords.sourceOnlyCount === 0 && diff.baseAnchorPublicationRecords.targetOnlyCount === 1, '30. the base collection reports the base record as target-only, entirely independently');
        assert(diff.sameEvidence === false, '31. a Bitcoin-only archive and a Base-only archive with identical-looking content never report sameEvidence');
    }
    console.log('✓ Section H: a Bitcoin record and a Base record with identical-looking content never cancel each other out across collections');

    // ---------------------------------------------------------------
    // Section I — provenance independence.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        let localArchive = PublicationObservationArchive.empty();
        localArchive = btcUseCase.execute(localArchive, { anchorId: 'prov-a', contentHash: 'prov-content-a', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-27T00:00:00Z') });
        const identity = bitcoinIdentity(localArchive, 'prov-a');
        localArchive = associationUseCase.execute(localArchive, { publisherId: 'ProvPub', publicationIdentity: identity, createdAt: new Date('2026-08-27T00:01:00Z') });

        const importedArchive = importAchievementEvidence(exportAchievementEvidence(localArchive)).archive;
        assert(localArchive.localFactCount === localArchive.totalFactCount, '32. sanity — every fact in the local archive is LOCAL');
        assert(importedArchive.importedFactCount === importedArchive.totalFactCount, '33. sanity — every fact in the imported archive is IMPORTED');

        const diff = reconstructAchievementEvidenceDifference(localArchive, importedArchive);
        assert(diff.sameEvidence === true, '34. identical facts under LOCAL and IMPORTED provenance report sameEvidence');
        assert(diff.sourceOnlyCount === 0 && diff.targetOnlyCount === 0, '35. no fact is reported as exclusive to either side merely because its provenance differs');
    }
    console.log('✓ Section I: the same evidence under LOCAL and IMPORTED provenance reports no difference');

    // ---------------------------------------------------------------
    // Section J — input archives are never mutated.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        let source = PublicationObservationArchive.empty();
        source = btcUseCase.execute(source, { anchorId: 'mut-src', contentHash: 'mut-content-src', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-28T00:00:00Z') });
        let target = PublicationObservationArchive.empty();
        target = btcUseCase.execute(target, { anchorId: 'mut-tgt', contentHash: 'mut-content-tgt', txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-28T00:01:00Z') });

        const beforeSourceJSON = JSON.stringify(source.toJSON());
        const beforeTargetJSON = JSON.stringify(target.toJSON());

        reconstructAchievementEvidenceDifference(source, target);

        assert(JSON.stringify(source.toJSON()) === beforeSourceJSON, '36. the source archive is never mutated by computing a difference over it');
        assert(JSON.stringify(target.toJSON()) === beforeTargetJSON, '37. the target archive is never mutated by computing a difference over it');
    }
    console.log('✓ Section J: neither the source nor the target archive is ever mutated');

    // ---------------------------------------------------------------
    // Section K — deterministic repeated output.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        let source = PublicationObservationArchive.empty();
        source = btcUseCase.execute(source, { anchorId: 'det-src', contentHash: 'det-content-src', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-28T01:00:00Z') });
        let target = PublicationObservationArchive.empty();
        target = btcUseCase.execute(target, { anchorId: 'det-tgt', contentHash: 'det-content-tgt', txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-28T01:01:00Z') });

        const first = reconstructAchievementEvidenceDifference(source, target);
        const second = reconstructAchievementEvidenceDifference(source, target);
        assert(JSON.stringify(first) === JSON.stringify(second), '38. calling reconstructAchievementEvidenceDifference() twice on identical inputs is byte-identical');
    }
    console.log('✓ Section K: repeated calls on identical inputs are byte-identical');

    // ---------------------------------------------------------------
    // Section L — reload/export equivalence.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        const referenceUseCase = new CreatePublicationReferenceRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        let archive = PublicationObservationArchive.empty();
        archive = btcUseCase.execute(archive, { anchorId: 'reload-a', contentHash: 'reload-content-a', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-29T00:00:00Z') });
        archive = baseUseCase.execute(archive, { contentHash: 'reload-content-b', txid: TXID_BASE_A, network: NETWORK, createdAt: new Date('2026-08-29T00:01:00Z') });
        const identityA = bitcoinIdentity(archive, 'reload-a');
        const identityB = baseIdentity(archive, TXID_BASE_A);
        archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: identityA, referencedPublicationIdentity: identityB, createdAt: new Date('2026-08-29T00:02:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'ReloadPub', publicationIdentity: identityA, createdAt: new Date('2026-08-29T00:03:00Z') });

        const roundTripped = importAchievementEvidence(exportAchievementEvidence(archive)).archive;
        const diff = reconstructAchievementEvidenceDifference(archive, roundTripped);
        assert(diff.sameEvidence === true, '39. export -> import -> diff against the original reports no difference');
        assert(diff.sourceOnlyCount === 0 && diff.targetOnlyCount === 0, '40. every collection reports zero exclusive facts after a round trip');
    }
    console.log('✓ Section L: export -> import -> diff against the original reports no difference');

    // ---------------------------------------------------------------
    // Section M — fingerprint agrees with difference result.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();

        function archiveWith(anchorId, txid) {
            let archive = PublicationObservationArchive.empty();
            archive = btcUseCase.execute(archive, { anchorId, contentHash: `content-${anchorId}`, txid, network: NETWORK, createdAt: new Date('2026-08-29T01:00:00Z') });
            return archive;
        }

        const same1 = archiveWith('agree-a', TXID_A);
        const same2 = archiveWith('agree-a', TXID_A);
        const different = archiveWith('agree-b', TXID_B);

        const equalCase = reconstructAchievementEvidenceDifference(same1, same2);
        assert((equalCase.sourceFingerprint === equalCase.targetFingerprint) === equalCase.sameEvidence, '41. when the evidence is genuinely equal, the fingerprint comparison and sameEvidence agree');
        assert(equalCase.sameEvidence === true, '42. sanity — this case is genuinely equal evidence');

        const differentCase = reconstructAchievementEvidenceDifference(same1, different);
        assert((differentCase.sourceFingerprint === differentCase.targetFingerprint) === differentCase.sameEvidence, '43. when the evidence genuinely differs, the fingerprint comparison and sameEvidence agree');
        assert(differentCase.sameEvidence === false, '44. sanity — this case is genuinely different evidence');

        // Cross-checked directly against 0.8.116's own fingerprint
        // primitive, reused unchanged.
        assert(equalCase.sourceFingerprint === reconstructAchievementEvidenceFingerprint(same1).fingerprint, '45. sourceFingerprint is exactly 0.8.116\'s own fingerprint for the source archive');
        assert(equalCase.targetFingerprint === reconstructAchievementEvidenceFingerprint(same2).fingerprint, '46. targetFingerprint is exactly 0.8.116\'s own fingerprint for the target archive');
    }
    console.log('✓ Section M: sameEvidence and the fingerprint comparison always agree, though computed independently');

    // ---------------------------------------------------------------
    // Section N — FLAGSHIP: merge convergence.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        const referenceUseCase = new CreatePublicationReferenceRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        // Alice = {A, B, C} — two bitcoin publications and one association.
        let aliceArchive = PublicationObservationArchive.empty();
        aliceArchive = btcUseCase.execute(aliceArchive, { anchorId: 'alice-a', contentHash: 'alice-content-a', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-18T00:00:00Z') });
        aliceArchive = btcUseCase.execute(aliceArchive, { anchorId: 'alice-b', contentHash: 'alice-content-b', txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-18T00:01:00Z') });
        const aliceIdentityA = bitcoinIdentity(aliceArchive, 'alice-a');
        aliceArchive = associationUseCase.execute(aliceArchive, { publisherId: 'Alice', publicationIdentity: aliceIdentityA, createdAt: new Date('2026-08-18T00:02:00Z') });

        // Bob = {D} — one, entirely unrelated base publication.
        let bobArchive = PublicationObservationArchive.empty();
        bobArchive = baseUseCase.execute(bobArchive, { contentHash: 'bob-content-d', txid: TXID_BASE_B, network: NETWORK, createdAt: new Date('2026-08-19T00:00:00Z') });
        const bobIdentityD = baseIdentity(bobArchive, TXID_BASE_B);
        bobArchive = associationUseCase.execute(bobArchive, { publisherId: 'Bob', publicationIdentity: bobIdentityD, createdAt: new Date('2026-08-19T00:01:00Z') });

        // Before exchanging anything: each replica's own exclusive
        // evidence appears on its own side of the difference.
        const beforeDiff = reconstructAchievementEvidenceDifference(aliceArchive, bobArchive);
        assert(beforeDiff.sameEvidence === false, '47. before any exchange, Alice and Bob genuinely differ');
        assert(beforeDiff.sourceOnlyCount === aliceArchive.bitcoinAnchorPublicationRecordCount + aliceArchive.publisherPublicationAssociationRecordCount, '48. every one of Alice\'s own facts is reported as source-only before any exchange');
        assert(beforeDiff.targetOnlyCount === bobArchive.baseAnchorPublicationRecordCount + bobArchive.publisherPublicationAssociationRecordCount, '49. every one of Bob\'s own facts is reported as target-only before any exchange');

        // Exchange: each replica merges exactly the other's exclusive
        // evidence this file just reported — nothing more, nothing less.
        const aliceMissingFromBob = JSON.stringify({
            schemaVersion: 1,
            bitcoinAnchorPublicationRecords: beforeDiff.bitcoinAnchorPublicationRecords.sourceOnly,
            baseAnchorPublicationRecords: beforeDiff.baseAnchorPublicationRecords.sourceOnly,
            publicationReferenceRecords: beforeDiff.publicationReferenceRecords.sourceOnly,
            publisherPublicationAssociationRecords: beforeDiff.publisherPublicationAssociationRecords.sourceOnly
        });
        const bobMissingFromAlice = JSON.stringify({
            schemaVersion: 1,
            bitcoinAnchorPublicationRecords: beforeDiff.bitcoinAnchorPublicationRecords.targetOnly,
            baseAnchorPublicationRecords: beforeDiff.baseAnchorPublicationRecords.targetOnly,
            publicationReferenceRecords: beforeDiff.publicationReferenceRecords.targetOnly,
            publisherPublicationAssociationRecords: beforeDiff.publisherPublicationAssociationRecords.targetOnly
        });

        const bobAfterMerge = mergeAchievementEvidence(bobArchive, aliceMissingFromBob).archive;
        const aliceAfterMerge = mergeAchievementEvidence(aliceArchive, bobMissingFromAlice).archive;

        const afterDiff = reconstructAchievementEvidenceDifference(aliceAfterMerge, bobAfterMerge);
        assert(afterDiff.sameEvidence === true, '50. FLAGSHIP — after each replica merges exactly the evidence this file reported as missing, the two replicas report no difference at all');
        assert(afterDiff.sourceOnlyCount === 0 && afterDiff.targetOnlyCount === 0, '51. every collection independently confirms convergence');
        assert(afterDiff.sourceFingerprint === afterDiff.targetFingerprint, '52. and, independently, both replicas now share the identical evidence fingerprint too');
    }
    console.log('✓ Section N: FLAGSHIP — merging exactly the evidence this file reports as missing converges two replicas to no difference at all');

    // ---------------------------------------------------------------
    // Section O — shape, defaults, and vocabulary.
    // ---------------------------------------------------------------
    {
        const bareDescribe = describeAchievementEvidenceDifference();
        const emptyReconstruct = reconstructAchievementEvidenceDifference(PublicationObservationArchive.empty(), PublicationObservationArchive.empty());
        assert(JSON.stringify(bareDescribe) === JSON.stringify(emptyReconstruct), '53. describeAchievementEvidenceDifference() with no arguments matches the empty-vs-empty result');

        const nonArchiveDiff = reconstructAchievementEvidenceDifference('not an archive', undefined);
        assert(JSON.stringify(nonArchiveDiff) === JSON.stringify(emptyReconstruct), '54. non-archive input on either side degrades to the empty archive\'s own result, never throws');

        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        let source = PublicationObservationArchive.empty();
        source = btcUseCase.execute(source, { anchorId: 'shape-a', contentHash: 'shape-content-a', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-29T02:00:00Z') });
        const diff = reconstructAchievementEvidenceDifference(source, PublicationObservationArchive.empty());

        assert(Object.keys(diff).sort().join(',') === [
            'baseAnchorPublicationRecords', 'bitcoinAnchorPublicationRecords', 'publicationReferenceRecords',
            'publisherPublicationAssociationRecords', 'sameEvidence', 'sourceFingerprint', 'sourceOnlyCount',
            'targetFingerprint', 'targetOnlyCount'
        ].sort().join(','), '55. the top-level result exposes exactly the documented fields — nothing more');

        for (const key of AchievementEvidenceDifferenceCollectionOrder) {
            assert(Object.keys(diff[key]).sort().join(',') === ['sourceCount', 'sourceOnly', 'sourceOnlyCount', 'targetCount', 'targetOnly', 'targetOnlyCount'].sort().join(','), `56. collection ${key} exposes exactly the documented per-collection fields`);
        }

        assert(AchievementEvidenceDifferenceCollectionOrder.slice().sort().join(',') === ['baseAnchorPublicationRecords', 'bitcoinAnchorPublicationRecords', 'publicationReferenceRecords', 'publisherPublicationAssociationRecords'].sort().join(','), '57. the exported collection order names exactly the four evidence collections');

        const forbidden = ['rank', 'score', 'points', 'badge', 'achievementkind', 'leaderboard', 'statistics', 'policy', 'trust', 'confidence', 'valid', 'verified', 'authentic', 'reliable', 'canonical'];
        const json = JSON.stringify(diff).toLowerCase();
        for (const word of forbidden) {
            assert(!json.includes(word), `58. the difference result never mentions "${word}"`);
        }
    }
    console.log('✓ Section O: describe()/reconstruct() defaults are consistent, non-archive input degrades safely, and the result carries no achievement/badge/statistics/ranking/leaderboard/trust vocabulary');

    console.log('\nAll AchievementEvidenceDifference tests passed.');
}

try {
    run();
} catch (error) {
    console.error('AchievementEvidenceDifference.test.js FAILED:', error);
    process.exitCode = 1;
}
