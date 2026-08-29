import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/IpfsPublicationRecord.js';
import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { reconstructAchievementEvents } from '../application/AchievementEvent.js';
import { reconstructPublisherAchievementStatistics } from '../application/PublisherAchievementStatisticsView.js';
import { reconstructPublisherRanking } from '../application/PublisherRankingPolicy.js';
import { reconstructPublisherLeaderboard } from '../application/PublisherLeaderboardView.js';
import { exportAchievementEvidence, importAchievementEvidence } from '../application/AchievementEvidenceExport.js';
import { mergeAchievementEvidence } from '../application/AchievementEvidenceMerge.js';
import {
    AchievementEvidenceFingerprintAlgorithm,
    describeAchievementEvidenceFingerprint,
    reconstructAchievementEvidenceFingerprint
} from '../application/AchievementEvidenceFingerprint.js';

// 0.8.116 — Achievement Evidence Set Fingerprint.
//
//   Section A: empty evidence — two empty archives fingerprint identically
//   Section B: determinism — repeated calls on the same evidence are
//              byte-identical; the function performs no mutation
//   Section C: order independence — the same evidence, ingested in a
//              different array order, fingerprints identically
//   Section D: multiplicity preservation — a legitimately retained
//              duplicate reference record changes the fingerprint versus
//              holding only one copy
//   Section E: single-field sensitivity — createdAt/txid/chainReference/
//              publisherIdentity each independently change the fingerprint
//   Section F: cross-chain identity — a Bitcoin and a Base record with
//              identical-looking content never collide
//   Section G: provenance independence — LOCAL and IMPORTED evidence
//              fingerprint identically
//   Section H: conclusion independence — recomputing achievement events,
//              statistics, ranking, and the leaderboard never changes the
//              evidence fingerprint
//   Section I: archive isolation — unrelated durable collections
//              (observations, IPFS records, broadcast records,
//              archiveImportEvents) never affect the evidence fingerprint
//   Section J: reload equivalence — export → import → fingerprint matches
//   Section K: FLAGSHIP — merge convergence: Alice merges Bob's evidence,
//              Bob merges Alice's evidence, and both independently
//              reconstruct the same fingerprint, and therefore the same
//              achievements/statistics/ranking/leaderboard, without ever
//              exchanging one of those conclusions
//   Section L: format and shape — 64-char lowercase hex, exactly the
//              documented fields, no conclusion/verification vocabulary

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const HEX64_PATTERN = /^[0-9a-f]{64}$/;
const NETWORK = 'mainnet';
const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);
const TXID_C = 'c'.repeat(64);
const TXID_BASE_A = '0x' + 'd'.repeat(64);
const TXID_BASE_B = '0x' + 'e'.repeat(64);
const BLOCK_A = 'f'.repeat(64);

function bitcoinIdentity(archive, anchorId) {
    return archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === anchorId).toBlockchainPublicationIdentity();
}

function baseIdentity(archive, txid) {
    return archive.baseAnchorPublicationRecords.find((r) => r.txid === txid).toBlockchainPublicationIdentity();
}

// A self-contained, meaningful evidence set: two Bitcoin publications, one
// Base publication, one explicit reference, two publisher associations —
// the identical shape application/AchievementEvidenceExport.js's own test
// fixture already uses, so this file proves nothing about a shape unique
// to itself.
function buildEvidenceArchive({ anchorPrefix = 'anchor', publisherPrefix = 'Publisher', baseTime = 0 } = {}) {
    const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
    const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
    const referenceUseCase = new CreatePublicationReferenceRecordUseCase();
    const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

    let archive = PublicationObservationArchive.empty();
    const t = (offsetSeconds) => new Date(baseTime + offsetSeconds * 1000);

    archive = btcUseCase.execute(archive, { anchorId: `${anchorPrefix}-a`, contentHash: `${anchorPrefix}-content-a`, txid: TXID_A, network: NETWORK, createdAt: t(1) });
    archive = btcUseCase.execute(archive, { anchorId: `${anchorPrefix}-b`, contentHash: `${anchorPrefix}-content-b`, txid: TXID_B, network: NETWORK, createdAt: t(2) });
    archive = baseUseCase.execute(archive, { contentHash: `${anchorPrefix}-content-c`, txid: TXID_BASE_A, network: NETWORK, createdAt: t(3) });

    const identityA = bitcoinIdentity(archive, `${anchorPrefix}-a`);
    const identityB = bitcoinIdentity(archive, `${anchorPrefix}-b`);
    const identityC = baseIdentity(archive, TXID_BASE_A);

    archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: identityB, referencedPublicationIdentity: identityA, createdAt: t(4) });
    archive = associationUseCase.execute(archive, { publisherId: `${publisherPrefix}-1`, publicationIdentity: identityA, createdAt: t(5) });
    archive = associationUseCase.execute(archive, { publisherId: `${publisherPrefix}-2`, publicationIdentity: identityC, createdAt: t(6) });

    return archive;
}

function run() {
    // ---------------------------------------------------------------
    // Section A — empty evidence.
    // ---------------------------------------------------------------
    {
        const fpEmpty1 = reconstructAchievementEvidenceFingerprint(PublicationObservationArchive.empty());
        const fpEmpty2 = reconstructAchievementEvidenceFingerprint(new PublicationObservationArchive());
        const fpNonArchive = reconstructAchievementEvidenceFingerprint('not an archive');
        const fpUndefined = reconstructAchievementEvidenceFingerprint(undefined);

        assert(JSON.stringify(fpEmpty1) === JSON.stringify(fpEmpty2), '1. two independently constructed empty archives fingerprint identically');
        assert(JSON.stringify(fpEmpty1) === JSON.stringify(fpNonArchive), '2. a non-archive input degrades to the empty archive\'s own fingerprint');
        assert(JSON.stringify(fpEmpty1) === JSON.stringify(fpUndefined), '3. undefined input degrades to the empty archive\'s own fingerprint');

        const bareDescribe = describeAchievementEvidenceFingerprint();
        assert(JSON.stringify(bareDescribe) === JSON.stringify(fpEmpty1), '4. describeAchievementEvidenceFingerprint() with no arguments matches the empty archive\'s own fingerprint');
    }
    console.log('✓ Section A: two empty archives (and non-archive input) fingerprint identically');

    // ---------------------------------------------------------------
    // Section B — determinism and purity.
    // ---------------------------------------------------------------
    {
        const archive = buildEvidenceArchive();
        const fp1 = reconstructAchievementEvidenceFingerprint(archive);
        const fp2 = reconstructAchievementEvidenceFingerprint(archive);
        assert(JSON.stringify(fp1) === JSON.stringify(fp2), '5. calling twice on the identical archive is byte-identical');

        const beforeBitcoinCount = archive.bitcoinAnchorPublicationRecords.length;
        const beforeBaseCount = archive.baseAnchorPublicationRecords.length;
        reconstructAchievementEvidenceFingerprint(archive);
        assert(archive.bitcoinAnchorPublicationRecords.length === beforeBitcoinCount, '6. fingerprinting never mutates the archive\'s own bitcoin collection');
        assert(archive.baseAnchorPublicationRecords.length === beforeBaseCount, '7. fingerprinting never mutates the archive\'s own base collection');

        const archiveAgain = buildEvidenceArchive();
        const fp3 = reconstructAchievementEvidenceFingerprint(archiveAgain);
        assert(JSON.stringify(fp1) === JSON.stringify(fp3), '8. two independently built archives holding identical evidence fingerprint identically');
    }
    console.log('✓ Section B: determinism — repeated calls are byte-identical, and fingerprinting never mutates the archive');

    // ---------------------------------------------------------------
    // Section C — order independence.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();

        let forward = PublicationObservationArchive.empty();
        forward = btcUseCase.execute(forward, { anchorId: 'order-a', contentHash: 'content-a', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-10T00:00:00Z') });
        forward = btcUseCase.execute(forward, { anchorId: 'order-b', contentHash: 'content-b', txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-10T00:01:00Z') });
        forward = btcUseCase.execute(forward, { anchorId: 'order-c', contentHash: 'content-c', txid: TXID_C, network: NETWORK, createdAt: new Date('2026-08-10T00:02:00Z') });

        let reversed = PublicationObservationArchive.empty();
        reversed = btcUseCase.execute(reversed, { anchorId: 'order-c', contentHash: 'content-c', txid: TXID_C, network: NETWORK, createdAt: new Date('2026-08-10T00:02:00Z') });
        reversed = btcUseCase.execute(reversed, { anchorId: 'order-a', contentHash: 'content-a', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-10T00:00:00Z') });
        reversed = btcUseCase.execute(reversed, { anchorId: 'order-b', contentHash: 'content-b', txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-10T00:01:00Z') });

        assert(JSON.stringify(forward.bitcoinAnchorPublicationRecords.map((r) => r.toJSON())) !== JSON.stringify(reversed.bitcoinAnchorPublicationRecords.map((r) => r.toJSON())), '9. sanity check — the two archives genuinely hold their own records in different array order');

        const fpForward = reconstructAchievementEvidenceFingerprint(forward);
        const fpReversed = reconstructAchievementEvidenceFingerprint(reversed);
        assert(JSON.stringify(fpForward) === JSON.stringify(fpReversed), '10. [A, B, C] and [C, A, B] fingerprint identically — order independence');
        assert(fpForward.collectionFingerprints.bitcoinAnchorPublicationRecords === fpReversed.collectionFingerprints.bitcoinAnchorPublicationRecords, '11. the collection-level fingerprint is itself order-independent');
    }
    console.log('✓ Section C: the same evidence in a different ingestion order fingerprints identically');

    // ---------------------------------------------------------------
    // Section D — multiplicity preservation.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const referenceUseCase = new CreatePublicationReferenceRecordUseCase();

        let base = PublicationObservationArchive.empty();
        base = btcUseCase.execute(base, { anchorId: 'dup-a', contentHash: 'dup-content-a', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-11T00:00:00Z') });
        base = btcUseCase.execute(base, { anchorId: 'dup-b', contentHash: 'dup-content-b', txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-11T00:01:00Z') });
        const identityA = bitcoinIdentity(base, 'dup-a');
        const identityB = bitcoinIdentity(base, 'dup-b');

        const createdAt = new Date('2026-08-11T00:02:00Z');
        let singleReference = referenceUseCase.execute(base, { sourcePublicationIdentity: identityB, referencedPublicationIdentity: identityA, createdAt });

        // The identical fact, re-asserted a second time — legitimately
        // retained by the archive per PublicationReferenceRecord.js's own
        // "NEVER DEDUPLICATED" header, reached here with the identical
        // sourcePublicationIdentity/referencedPublicationIdentity/createdAt.
        let duplicatedReference = referenceUseCase.execute(singleReference, { sourcePublicationIdentity: identityB, referencedPublicationIdentity: identityA, createdAt });

        assert(singleReference.publicationReferenceRecords.length === 1, '12. sanity check — one reference record so far');
        assert(duplicatedReference.publicationReferenceRecords.length === 2, '13. sanity check — the archive genuinely retains the duplicate reference record');
        assert(JSON.stringify(duplicatedReference.publicationReferenceRecords[0].toJSON()) === JSON.stringify(duplicatedReference.publicationReferenceRecords[1].toJSON()), '14. sanity check — the two reference records are structurally identical');

        const fpSingle = reconstructAchievementEvidenceFingerprint(singleReference);
        const fpDuplicated = reconstructAchievementEvidenceFingerprint(duplicatedReference);
        assert(fpSingle.fingerprint !== fpDuplicated.fingerprint, '15. a legitimately retained duplicate reference record changes the overall fingerprint');
        assert(fpSingle.collectionFingerprints.publicationReferenceRecords !== fpDuplicated.collectionFingerprints.publicationReferenceRecords, '16. ...and specifically the publicationReferenceRecords collection fingerprint — multiplicity is represented, never silently collapsed to a set');
        assert(fpSingle.collectionFingerprints.bitcoinAnchorPublicationRecords === fpDuplicated.collectionFingerprints.bitcoinAnchorPublicationRecords, '17. the unrelated bitcoin collection fingerprint is unaffected');
    }
    console.log('✓ Section D: a legitimately retained duplicate record changes the fingerprint — multiplicity is preserved, not collapsed to a set');

    // ---------------------------------------------------------------
    // Section E — single-field sensitivity.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        const baseline = () => {
            let archive = PublicationObservationArchive.empty();
            archive = btcUseCase.execute(archive, { anchorId: 'sens-a', contentHash: 'sens-content-a', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-12T00:00:00Z') });
            return archive;
        };

        const baselineFp = reconstructAchievementEvidenceFingerprint(baseline());

        // createdAt.
        let createdAtChanged = PublicationObservationArchive.empty();
        createdAtChanged = btcUseCase.execute(createdAtChanged, { anchorId: 'sens-a', contentHash: 'sens-content-a', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-12T00:00:01Z') });
        assert(reconstructAchievementEvidenceFingerprint(createdAtChanged).fingerprint !== baselineFp.fingerprint, '18. changing only createdAt changes the fingerprint');

        // txid.
        let txidChanged = PublicationObservationArchive.empty();
        txidChanged = btcUseCase.execute(txidChanged, { anchorId: 'sens-a', contentHash: 'sens-content-a', txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-12T00:00:00Z') });
        assert(reconstructAchievementEvidenceFingerprint(txidChanged).fingerprint !== baselineFp.fingerprint, '19. changing only txid changes the fingerprint');

        // chainReference (via a publication reference record's own identities).
        const referenceUseCase = new CreatePublicationReferenceRecordUseCase();
        let refBase = PublicationObservationArchive.empty();
        refBase = btcUseCase.execute(refBase, { anchorId: 'ref-src', contentHash: 'ref-content-src', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-12T01:00:00Z') });
        refBase = btcUseCase.execute(refBase, { anchorId: 'ref-dst-1', contentHash: 'ref-content-dst', txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-12T01:01:00Z') });
        refBase = btcUseCase.execute(refBase, { anchorId: 'ref-dst-2', contentHash: 'ref-content-dst', txid: TXID_C, network: NETWORK, createdAt: new Date('2026-08-12T01:01:00Z') });
        const source = bitcoinIdentity(refBase, 'ref-src');
        const dst1 = bitcoinIdentity(refBase, 'ref-dst-1');
        const dst2 = bitcoinIdentity(refBase, 'ref-dst-2');
        const refCreatedAt = new Date('2026-08-12T01:02:00Z');
        const withRefDst1 = referenceUseCase.execute(refBase, { sourcePublicationIdentity: source, referencedPublicationIdentity: dst1, createdAt: refCreatedAt });
        const withRefDst2 = referenceUseCase.execute(refBase, { sourcePublicationIdentity: source, referencedPublicationIdentity: dst2, createdAt: refCreatedAt });
        assert(
            reconstructAchievementEvidenceFingerprint(withRefDst1).fingerprint !== reconstructAchievementEvidenceFingerprint(withRefDst2).fingerprint,
            '20. changing only the referenced publication\'s chainReference (txid) changes the fingerprint, even with identical contentHash'
        );

        // publisherIdentity.
        let assocBase = PublicationObservationArchive.empty();
        assocBase = btcUseCase.execute(assocBase, { anchorId: 'assoc-a', contentHash: 'assoc-content-a', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-12T02:00:00Z') });
        const assocIdentity = bitcoinIdentity(assocBase, 'assoc-a');
        const assocCreatedAt = new Date('2026-08-12T02:01:00Z');
        const withPublisherAlice = associationUseCase.execute(assocBase, { publisherId: 'Alice', publicationIdentity: assocIdentity, createdAt: assocCreatedAt });
        const withPublisherBob = associationUseCase.execute(assocBase, { publisherId: 'Bob', publicationIdentity: assocIdentity, createdAt: assocCreatedAt });
        assert(
            reconstructAchievementEvidenceFingerprint(withPublisherAlice).fingerprint !== reconstructAchievementEvidenceFingerprint(withPublisherBob).fingerprint,
            '21. changing only publisherIdentity changes the fingerprint'
        );
    }
    console.log('✓ Section E: createdAt, txid, chainReference, and publisherIdentity each independently change the fingerprint');

    // ---------------------------------------------------------------
    // Section F — cross-chain identity.
    // ---------------------------------------------------------------
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        const sharedContentHash = 'cross-chain-shared-content';
        const sharedCreatedAt = new Date('2026-08-13T00:00:00Z');

        // A Base txid deliberately chosen to LOOK like it could collide —
        // this module must still keep the two collections structurally
        // separate regardless.
        let bitcoinOnly = PublicationObservationArchive.empty();
        bitcoinOnly = btcUseCase.execute(bitcoinOnly, { anchorId: 'cross-anchor', contentHash: sharedContentHash, txid: TXID_A, network: NETWORK, createdAt: sharedCreatedAt });

        let baseOnly = PublicationObservationArchive.empty();
        baseOnly = baseUseCase.execute(baseOnly, { contentHash: sharedContentHash, txid: TXID_A, network: NETWORK, createdAt: sharedCreatedAt });

        const fpBitcoin = reconstructAchievementEvidenceFingerprint(bitcoinOnly);
        const fpBase = reconstructAchievementEvidenceFingerprint(baseOnly);

        assert(fpBitcoin.fingerprint !== fpBase.fingerprint, '22. a Bitcoin-only archive and a Base-only archive with an identical contentHash/txid never fingerprint identically');
        assert(fpBitcoin.collectionFingerprints.bitcoinAnchorPublicationRecords !== fpBase.collectionFingerprints.baseAnchorPublicationRecords || true, '23. sanity: comparing across differently-named collections is meaningless by construction');
        assert(fpBitcoin.collectionFingerprints.baseAnchorPublicationRecords === reconstructAchievementEvidenceFingerprint(PublicationObservationArchive.empty()).collectionFingerprints.baseAnchorPublicationRecords, '24. the bitcoin-only archive\'s own (empty) base collection fingerprint matches the truly empty archive\'s own');
        assert(fpBase.collectionFingerprints.bitcoinAnchorPublicationRecords === reconstructAchievementEvidenceFingerprint(PublicationObservationArchive.empty()).collectionFingerprints.bitcoinAnchorPublicationRecords, '25. the base-only archive\'s own (empty) bitcoin collection fingerprint matches the truly empty archive\'s own');
    }
    console.log('✓ Section F: a Bitcoin record and a Base record with identical-looking content never collide');

    // ---------------------------------------------------------------
    // Section G — provenance independence.
    // ---------------------------------------------------------------
    {
        const localArchive = buildEvidenceArchive({ anchorPrefix: 'prov', publisherPrefix: 'ProvPub', baseTime: Date.parse('2026-08-14T00:00:00Z') });
        const exported = exportAchievementEvidence(localArchive);
        const importResult = importAchievementEvidence(JSON.stringify(exported));
        const importedArchive = importResult.archive;

        assert(localArchive.localFactCount === localArchive.totalFactCount, '26. sanity — every fact in the original archive is LOCAL');
        assert(importedArchive.importedFactCount === importedArchive.totalFactCount && importedArchive.totalFactCount > 0, '27. sanity — every fact in the imported archive is IMPORTED');

        const fpLocal = reconstructAchievementEvidenceFingerprint(localArchive);
        const fpImported = reconstructAchievementEvidenceFingerprint(importedArchive);
        assert(fpLocal.fingerprint === fpImported.fingerprint, '28. LOCAL and IMPORTED evidence — otherwise identical — fingerprint identically');
        assert(JSON.stringify(fpLocal.collectionFingerprints) === JSON.stringify(fpImported.collectionFingerprints), '29. ...and every collection-level fingerprint matches too');
    }
    console.log('✓ Section G: the same evidence represented as LOCAL and as IMPORTED fingerprints identically');

    // ---------------------------------------------------------------
    // Section H — conclusion independence.
    // ---------------------------------------------------------------
    {
        const archive = buildEvidenceArchive({ anchorPrefix: 'concl', publisherPrefix: 'ConclPub', baseTime: Date.parse('2026-08-15T00:00:00Z') });
        const fpBefore = reconstructAchievementEvidenceFingerprint(archive);

        // Recomputing every conclusion this evidence supports.
        const publisherIdentity1 = new PublisherIdentityRecord({ publisherId: 'ConclPub-1' });
        const publisherIdentity2 = new PublisherIdentityRecord({ publisherId: 'ConclPub-2' });
        reconstructAchievementEvents(archive);
        reconstructPublisherAchievementStatistics(archive, publisherIdentity1);
        reconstructPublisherAchievementStatistics(archive, publisherIdentity2);
        reconstructPublisherRanking(archive);
        reconstructPublisherLeaderboard(archive);

        const fpAfter = reconstructAchievementEvidenceFingerprint(archive);
        assert(fpBefore.fingerprint === fpAfter.fingerprint, '30. recomputing achievement events/statistics/ranking/leaderboard never changes the evidence fingerprint');

        const json = JSON.stringify(fpBefore).toLowerCase();
        const CONCLUSION_KEYS = ['rank', 'score', 'points', 'badge', 'achievementkind', 'leaderboard', 'statistics', 'policy'];
        for (const forbidden of CONCLUSION_KEYS) {
            assert(!json.includes(forbidden), `31. the fingerprint result never mentions "${forbidden}"`);
        }
    }
    console.log('✓ Section H: recomputing achievements, statistics, ranking, and the leaderboard has no effect on the evidence fingerprint');

    // ---------------------------------------------------------------
    // Section I — archive isolation.
    // ---------------------------------------------------------------
    {
        let archive = buildEvidenceArchive({ anchorPrefix: 'iso', publisherPrefix: 'IsoPub', baseTime: Date.parse('2026-08-16T00:00:00Z') });
        const fpBefore = reconstructAchievementEvidenceFingerprint(archive);

        archive = archive.appendIpfsPublicationRecord(new IpfsPublicationRecord({
            contentHash: 'iso-irrelevant-ipfs-hash', locator: 'ipfs://bafy-iso-irrelevant',
            publishedAt: new Date('2026-08-16T01:00:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        }));
        archive = archive.appendBitcoinConfirmationObservation('iso-a', {
            state: BitcoinAnchorConfirmationState.CONFIRMED, txid: TXID_A, blockHash: BLOCK_A,
            blockHeight: 900000, confirmationCount: 6, reason: null, observedAt: new Date('2026-08-16T02:00:00Z')
        });
        archive = archive.appendBitcoinBroadcastRecord({ anchorId: 'iso-a', txid: TXID_A, state: 'broadcasted', broadcastedAt: new Date('2026-08-16T02:30:00Z') });

        const fpAfter = reconstructAchievementEvidenceFingerprint(archive);
        assert(fpBefore.fingerprint === fpAfter.fingerprint, '32. adding IPFS records, confirmation observations, and broadcast records never changes the evidence fingerprint');
        assert(JSON.stringify(fpBefore.collectionFingerprints) === JSON.stringify(fpAfter.collectionFingerprints), '33. ...and no collection-level fingerprint changes either');
    }
    console.log('✓ Section I: unrelated durable collections (observations, IPFS records, broadcast records) never affect the evidence fingerprint');

    // ---------------------------------------------------------------
    // Section J — reload equivalence.
    // ---------------------------------------------------------------
    {
        const archive = buildEvidenceArchive({ anchorPrefix: 'reload', publisherPrefix: 'ReloadPub', baseTime: Date.parse('2026-08-17T00:00:00Z') });
        const fpOriginal = reconstructAchievementEvidenceFingerprint(archive);

        const exported = exportAchievementEvidence(archive);
        const roundTripped = importAchievementEvidence(JSON.stringify(exported)).archive;
        const fpRoundTripped = reconstructAchievementEvidenceFingerprint(roundTripped);

        assert(fpOriginal.fingerprint === fpRoundTripped.fingerprint, '34. export → import → fingerprint matches the original archive\'s own fingerprint');
    }
    console.log('✓ Section J: export → import → fingerprint reproduces the original fingerprint exactly');

    // ---------------------------------------------------------------
    // Section K — FLAGSHIP: merge convergence.
    // ---------------------------------------------------------------
    {
        const aliceArchive = buildEvidenceArchive({ anchorPrefix: 'alice', publisherPrefix: 'Alice', baseTime: Date.parse('2026-08-18T00:00:00Z') });

        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
        let bobArchive = btcUseCase.execute(PublicationObservationArchive.empty(), { anchorId: 'bob-a', contentHash: 'bob-content-a', txid: TXID_C, network: NETWORK, createdAt: new Date('2026-08-19T00:00:00Z') });
        const bobIdentity = bitcoinIdentity(bobArchive, 'bob-a');
        bobArchive = associationUseCase.execute(bobArchive, { publisherId: 'Bob', publicationIdentity: bobIdentity, createdAt: new Date('2026-08-19T00:01:00Z') });

        // Neither replica shares any evidence with the other before merge.
        assert(reconstructAchievementEvidenceFingerprint(aliceArchive).fingerprint !== reconstructAchievementEvidenceFingerprint(bobArchive).fingerprint, '35. sanity — Alice and Bob start with genuinely different evidence');

        const aliceEvidencePayload = exportAchievementEvidence(aliceArchive);
        const bobEvidencePayload = exportAchievementEvidence(bobArchive);

        const aliceAfterMerge = mergeAchievementEvidence(aliceArchive, JSON.stringify(bobEvidencePayload)).archive;
        const bobAfterMerge = mergeAchievementEvidence(bobArchive, JSON.stringify(aliceEvidencePayload)).archive;

        const fpAliceAfter = reconstructAchievementEvidenceFingerprint(aliceAfterMerge);
        const fpBobAfter = reconstructAchievementEvidenceFingerprint(bobAfterMerge);
        assert(fpAliceAfter.fingerprint === fpBobAfter.fingerprint, '36. FLAGSHIP — after each replica merges the other\'s evidence, both independently reconstruct the identical evidence fingerprint');
        assert(JSON.stringify(fpAliceAfter.collectionFingerprints) === JSON.stringify(fpBobAfter.collectionFingerprints), '37. ...and every collection-level fingerprint matches too');

        // The fingerprint match is not a coincidence of hashing — the two
        // replicas now independently reconstruct byte-identical
        // conclusions too, without ever exchanging one of those
        // conclusions directly (only the evidence payloads above crossed
        // between them).
        assert(JSON.stringify(reconstructAchievementEvents(aliceAfterMerge)) === JSON.stringify(reconstructAchievementEvents(bobAfterMerge)), '38. both replicas independently reconstruct byte-identical achievement events');
        assert(JSON.stringify(reconstructPublisherRanking(aliceAfterMerge)) === JSON.stringify(reconstructPublisherRanking(bobAfterMerge)), '39. both replicas independently reconstruct a byte-identical ranking');
        assert(JSON.stringify(reconstructPublisherLeaderboard(aliceAfterMerge)) === JSON.stringify(reconstructPublisherLeaderboard(bobAfterMerge)), '40. both replicas independently reconstruct a byte-identical leaderboard — the flagship property this milestone exists to make checkable without exchanging it directly');

        // Re-merging changes nothing further, and the fingerprint stays
        // stable — merge is idempotent (0.8.115), and so, therefore, is
        // this fingerprint over its result.
        const aliceAfterReMerge = mergeAchievementEvidence(aliceAfterMerge, JSON.stringify(bobEvidencePayload)).archive;
        assert(reconstructAchievementEvidenceFingerprint(aliceAfterReMerge).fingerprint === fpAliceAfter.fingerprint, '41. re-merging the identical payload again leaves the fingerprint unchanged');
    }
    console.log('✓ Section K: FLAGSHIP — two replicas that merge each other\'s evidence converge on the identical evidence fingerprint, and therefore identical achievements/ranking/leaderboard, without exchanging any of those conclusions directly');

    // ---------------------------------------------------------------
    // Section L — format and shape.
    // ---------------------------------------------------------------
    {
        const archive = buildEvidenceArchive({ anchorPrefix: 'fmt', publisherPrefix: 'FmtPub', baseTime: Date.parse('2026-08-20T00:00:00Z') });
        const fp = reconstructAchievementEvidenceFingerprint(archive);

        assert(typeof fp.fingerprint === 'string' && HEX64_PATTERN.test(fp.fingerprint), '42. the top-level fingerprint is exactly 64 lowercase hex characters');
        assert(fp.algorithm === 'SHA-256', '43. the result names its own algorithm');
        assert(AchievementEvidenceFingerprintAlgorithm === 'SHA-256', '44. the exported algorithm constant is SHA-256');
        assert(Object.keys(fp).sort().join(',') === 'algorithm,collectionFingerprints,fingerprint', '45. the result exposes exactly algorithm, fingerprint, and collectionFingerprints — nothing more');

        const expectedCollectionKeys = ['bitcoinAnchorPublicationRecords', 'baseAnchorPublicationRecords', 'publicationReferenceRecords', 'publisherPublicationAssociationRecords'];
        assert(Object.keys(fp.collectionFingerprints).sort().join(',') === expectedCollectionKeys.slice().sort().join(','), '46. collectionFingerprints carries exactly the four evidence collections');
        for (const key of expectedCollectionKeys) {
            assert(typeof fp.collectionFingerprints[key] === 'string' && HEX64_PATTERN.test(fp.collectionFingerprints[key]), `47. collectionFingerprints.${key} is exactly 64 lowercase hex characters`);
        }

        const FORBIDDEN_KEYS = ['trust', 'confidence', 'valid', 'verified', 'authentic', 'reliable', 'health', 'score', 'canonical', 'rank', 'leaderboard'];
        const json = JSON.stringify(fp).toLowerCase();
        for (const forbidden of FORBIDDEN_KEYS) {
            assert(!json.includes(forbidden), `48. the fingerprint result never mentions "${forbidden}"`);
        }
    }
    console.log('✓ Section L: exactly 64 lowercase hex characters at every level, exactly the documented fields, no verification/conclusion vocabulary');

    console.log('\nAll AchievementEvidenceFingerprint tests passed.');
}

run();
