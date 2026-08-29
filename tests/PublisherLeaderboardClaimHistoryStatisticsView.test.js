import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { CreatePublisherLeaderboardSnapshotClaimUseCase } from '../application/CreatePublisherLeaderboardSnapshotClaimUseCase.js';
import { verifyPublisherLeaderboardSnapshotClaim } from '../application/PublisherLeaderboardSnapshotClaimVerification.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import {
    describePublisherLeaderboardClaimHistoryStatistics,
    reconstructPublisherLeaderboardClaimHistoryStatistics
} from '../application/PublisherLeaderboardClaimHistoryStatisticsView.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.128 — Claim History Statistics Projection.
//
// Section A: empty history — every count zero, every array empty
// Section B: a single receipt — basic counts and count maps
// Section C: receipt multiplicity — identical receipts count multiple
//            times, never collapsed
// Section D: distinct claim identity — several receipts of the SAME claim
//            report claimCount > distinctClaimIdCount
// Section E: multiple signers — signer counts remain independent
// Section F: snapshot/evidence multiplicity — different claims can share
//            the same snapshot/evidence fingerprint
// Section G: FLAGSHIP — Alice's claim A received three times, Alice's
//            claim B, Bob's claim C; claim A and B share a snapshot, C
//            references a genuinely different one
// Section H: malformed input is tolerated, never thrown
// Section I: no mutation of the input history or its records
// Section J: determinism — repeated calls are byte-identical
// Section K: no verification — statistics never change when current
//            local evidence changes
// Section L: vocabulary boundary — no verification/trust/ranking terms

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

const NETWORK = 'mainnet';

function serialize(value) {
    return JSON.stringify(value);
}

function anchor(archive, letter, txid, createdAt) {
    const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
    return useCase.execute(archive, { anchorId: `pub-${letter}`, contentHash: `pub-${letter}-content`, txid, network: NETWORK, createdAt });
}

function identityOf(archive, letter) {
    return archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === `pub-${letter}`).toBlockchainPublicationIdentity();
}

// A small, deterministic evidence fixture — E1. Mirrors the shared fixture
// the rest of the 0.8.121-0.8.127 family already uses.
function buildArchiveE1() {
    const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
    let archive = PublicationObservationArchive.empty();
    archive = anchor(archive, 'a', 'a'.repeat(64), new Date('2026-08-29T00:00:00Z'));
    archive = associationUseCase.execute(archive, { publisherId: 'Carol', publicationIdentity: identityOf(archive, 'a'), createdAt: new Date('2026-08-29T00:01:00Z') });
    return archive;
}

// A genuinely different evidence fixture — E2.
function buildArchiveE2() {
    const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
    let archive = PublicationObservationArchive.empty();
    archive = anchor(archive, 'z', 'z'.repeat(64), new Date('2026-08-29T00:00:00Z'));
    archive = associationUseCase.execute(archive, { publisherId: 'Zara', publicationIdentity: identityOf(archive, 'z'), createdAt: new Date('2026-08-29T00:01:00Z') });
    return archive;
}

function signedClaimFor(identityProvider, verifier, archive) {
    return new CreatePublisherLeaderboardSnapshotClaimUseCase(identityProvider, verifier).execute(archive);
}

function countFor(counts, fieldName, value) {
    return counts.find((entry) => entry[fieldName] === value);
}

function run() {
    const verifier = new LocalAuthorizationVerifier();

    // ---------------------------------------------------------------
    // Section A — empty history.
    // ---------------------------------------------------------------
    {
        const stats = describePublisherLeaderboardClaimHistoryStatistics([]);
        assert(stats.claimCount === 0, '1. empty history reports claimCount 0');
        assert(stats.distinctClaimIdCount === 0, '2. empty history reports distinctClaimIdCount 0');
        assert(stats.distinctSignerIdentityIdCount === 0, '3. empty history reports distinctSignerIdentityIdCount 0');
        assert(stats.distinctSnapshotFingerprintCount === 0, '4. empty history reports distinctSnapshotFingerprintCount 0');
        assert(stats.distinctEvidenceFingerprintCount === 0, '5. empty history reports distinctEvidenceFingerprintCount 0');
        assert(stats.signerIdentityCounts.length === 0, '6. empty history reports empty signerIdentityCounts');
        assert(stats.snapshotFingerprintCounts.length === 0, '7. empty history reports empty snapshotFingerprintCounts');
        assert(stats.evidenceFingerprintCounts.length === 0, '8. empty history reports empty evidenceFingerprintCounts');
    }
    console.log('✓ Section A: an empty history reports every count at zero and every array empty');

    // ---------------------------------------------------------------
    // Section B — a single receipt.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T09:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });

        const stats = describePublisherLeaderboardClaimHistoryStatistics([record]);
        assert(stats.claimCount === 1, '9. one receipt reports claimCount 1');
        assert(stats.distinctClaimIdCount === 1, '10. one receipt reports distinctClaimIdCount 1');
        assert(stats.distinctSignerIdentityIdCount === 1, '11. one receipt reports distinctSignerIdentityIdCount 1');
        assert(stats.distinctSnapshotFingerprintCount === 1, '12. one receipt reports distinctSnapshotFingerprintCount 1');
        assert(stats.distinctEvidenceFingerprintCount === 1, '13. one receipt reports distinctEvidenceFingerprintCount 1');
        assert(stats.signerIdentityCounts.length === 1 && stats.signerIdentityCounts[0].signerIdentityId === claim.signerIdentityId && stats.signerIdentityCounts[0].count === 1, '14. signerIdentityCounts names the one signer with count 1');
        assert(stats.snapshotFingerprintCounts[0].snapshotFingerprint === claim.snapshotFingerprint && stats.snapshotFingerprintCounts[0].count === 1, '15. snapshotFingerprintCounts names the one snapshot fingerprint with count 1');
        assert(stats.evidenceFingerprintCounts[0].evidenceFingerprint === claim.evidenceFingerprint && stats.evidenceFingerprintCounts[0].count === 1, '16. evidenceFingerprintCounts names the one evidence fingerprint with count 1');
    }
    console.log('✓ Section B: a single receipt reports correct counts and count maps');

    // ---------------------------------------------------------------
    // Section C — receipt multiplicity.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T10:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });

        // The SAME record instance, received (stored) three times.
        const history = [record, record, record];
        const stats = describePublisherLeaderboardClaimHistoryStatistics(history);
        assert(stats.claimCount === 3, '17. three identical receipts report claimCount 3, never collapsed');
        assert(stats.distinctClaimIdCount === 1, '18. the three identical receipts still name only one distinct claim');
        assert(stats.signerIdentityCounts.length === 1 && stats.signerIdentityCounts[0].count === 3, '19. the signer\'s count reflects all three stored receipts');
        assert(stats.snapshotFingerprintCounts[0].count === 3, '20. the snapshot fingerprint\'s count reflects all three stored receipts');
        assert(stats.evidenceFingerprintCounts[0].count === 3, '21. the evidence fingerprint\'s count reflects all three stored receipts');
    }
    console.log('✓ Section C: identical receipts count multiple times, never collapsed into one');

    // ---------------------------------------------------------------
    // Section D — distinct claim identity.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);

        const recordT1 = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T11:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordT2 = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T11:05:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });

        const stats = describePublisherLeaderboardClaimHistoryStatistics([recordT1, recordT2]);
        assert(stats.claimCount === 2, '22. two receipts of the same claim report claimCount 2');
        assert(stats.distinctClaimIdCount === 1, '23. two receipts of the same claim report distinctClaimIdCount 1');
        assert(stats.claimCount > stats.distinctClaimIdCount, '24. claimCount is strictly greater than distinctClaimIdCount for a repeatedly received claim');
    }
    console.log('✓ Section D: several receipts of the same claim.id report claimCount > distinctClaimIdCount');

    // ---------------------------------------------------------------
    // Section E — multiple signers.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);

        const recordA1 = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T12:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordA2 = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T12:01:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });
        const recordB1 = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T12:02:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });

        const stats = describePublisherLeaderboardClaimHistoryStatistics([recordA1, recordA2, recordB1]);
        assert(stats.distinctSignerIdentityIdCount === 2, '25. two distinct signers report distinctSignerIdentityIdCount 2');
        assert(countFor(stats.signerIdentityCounts, 'signerIdentityId', claimA.signerIdentityId).count === 2, '26. Alice\'s own count reflects her two receipts');
        assert(countFor(stats.signerIdentityCounts, 'signerIdentityId', claimB.signerIdentityId).count === 1, '27. Bob\'s own count reflects his one receipt, independent of Alice\'s');
        assert(stats.signerIdentityCounts[0].signerIdentityId === claimA.signerIdentityId && stats.signerIdentityCounts[1].signerIdentityId === claimB.signerIdentityId, '28. signerIdentityCounts is ordered by first appearance — Alice before Bob');
    }
    console.log('✓ Section E: signer counts remain independent of one another');

    // ---------------------------------------------------------------
    // Section F — snapshot/evidence multiplicity across distinct claims.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        // Two different signers, signing over the SAME evidence/snapshot —
        // two distinct claims sharing the identical fingerprints.
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);
        assert(claimA.id !== claimB.id, '29. sanity — two independently signed claims over the same archive still carry distinct ids');
        assert(claimA.snapshotFingerprint === claimB.snapshotFingerprint, '30. sanity — the two claims genuinely share one snapshot fingerprint');
        assert(claimA.evidenceFingerprint === claimB.evidenceFingerprint, '31. sanity — the two claims genuinely share one evidence fingerprint');

        const recordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T13:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T13:01:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });

        const stats = describePublisherLeaderboardClaimHistoryStatistics([recordA, recordB]);
        assert(stats.distinctClaimIdCount === 2, '32. two distinct claims report distinctClaimIdCount 2');
        assert(stats.distinctSnapshotFingerprintCount === 1, '33. the shared snapshot fingerprint reports distinctSnapshotFingerprintCount 1');
        assert(stats.distinctEvidenceFingerprintCount === 1, '34. the shared evidence fingerprint reports distinctEvidenceFingerprintCount 1');
        assert(stats.snapshotFingerprintCounts[0].count === 2, '35. the shared snapshot fingerprint\'s own count reflects both claims');
        assert(stats.evidenceFingerprintCounts[0].count === 2, '36. the shared evidence fingerprint\'s own count reflects both claims');
    }
    console.log('✓ Section F: distinct claims can share the same snapshot/evidence fingerprint, tallied together without merging claim identity');

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archiveE1 = buildArchiveE1();
        const archiveE2 = buildArchiveE2();

        // Alice signs claim A and claim B, both over the SAME snapshot (E1).
        const claimA = signedClaimFor(alice, verifier, archiveE1);
        const claimB = signedClaimFor(alice, verifier, archiveE1);
        // Bob signs claim C, over a genuinely DIFFERENT snapshot (E2).
        const claimC = signedClaimFor(bob, verifier, archiveE2);

        // Claim A is received three times.
        const recordA_T1 = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T14:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordA_T2 = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T14:01:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });
        const recordA_T3 = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T14:02:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });

        const recordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T14:03:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordC = new LeaderboardClaimRecord({ claim: claimC, receivedAt: new Date('2026-08-29T14:04:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });

        const history = [recordA_T1, recordA_T2, recordA_T3, recordB, recordC];
        const stats = describePublisherLeaderboardClaimHistoryStatistics(history);

        assert(stats.claimCount === 5, '37. FLAGSHIP — claimCount counts all five stored receipts');
        assert(stats.distinctClaimIdCount === 3, '38. FLAGSHIP — distinctClaimIdCount counts three distinct claims (A, B, C) — the three receipts of A do not collapse claimCount into distinctClaimIdCount');
        assert(stats.distinctSignerIdentityIdCount === 2, '39. FLAGSHIP — two distinct signers (Alice, Bob)');
        assert(stats.distinctSnapshotFingerprintCount === 2, '40. FLAGSHIP — two distinct snapshot fingerprints (A/B share one, C is genuinely different)');
        assert(stats.distinctEvidenceFingerprintCount === 2, '41. FLAGSHIP — two distinct evidence fingerprints, mirroring the snapshot split');

        assert(countFor(stats.signerIdentityCounts, 'signerIdentityId', claimA.signerIdentityId).count === 4, '42. FLAGSHIP — Alice\'s own count is 4 (three receipts of A, plus one of B)');
        assert(countFor(stats.signerIdentityCounts, 'signerIdentityId', claimC.signerIdentityId).count === 1, '43. FLAGSHIP — Bob\'s own count is 1 (one receipt of C)');
        assert(countFor(stats.snapshotFingerprintCounts, 'snapshotFingerprint', claimA.snapshotFingerprint).count === 4, '44. FLAGSHIP — the shared A/B snapshot fingerprint\'s own count is 4');
        assert(countFor(stats.snapshotFingerprintCounts, 'snapshotFingerprint', claimC.snapshotFingerprint).count === 1, '45. FLAGSHIP — claim C\'s own, distinct snapshot fingerprint\'s own count is 1');
    }
    console.log('✓ Section G: FLAGSHIP — Alice\'s three-times-received claim A, plus claim B (same snapshot) and Bob\'s claim C (different snapshot), report claimCount=5, distinctClaimIdCount=3, distinctSignerIdentityIdCount=2, distinctSnapshotFingerprintCount=2, distinctEvidenceFingerprintCount=2');

    // ---------------------------------------------------------------
    // Section H — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardClaimHistoryStatistics().claimCount === 0, '46. calling with no arguments defaults to an empty history, never throws');
        assert(describePublisherLeaderboardClaimHistoryStatistics(null).claimCount === 0, '47. null history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimHistoryStatistics(undefined).claimCount === 0, '48. undefined history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimHistoryStatistics('not an array').claimCount === 0, '49. a non-array history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimHistoryStatistics(42).claimCount === 0, '50. a non-array, non-string history degrades to empty, never throws');

        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T15:00:00Z') });
        const mixed = [null, undefined, {}, 'x', 42, claim, record];
        const stats = describePublisherLeaderboardClaimHistoryStatistics(mixed);
        assert(stats.claimCount === 1, '51. non-LeaderboardClaimRecord entries are silently excluded, leaving only the one genuine record');
    }
    console.log('✓ Section H: malformed/absent input degrades to a valid, empty statistics result rather than throwing');

    // ---------------------------------------------------------------
    // Section I — no mutation.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T16:00:00Z') });
        const history = [record];
        const historySnapshotBefore = history.slice();
        const recordJsonBefore = serialize(record.toJSON());

        const stats = describePublisherLeaderboardClaimHistoryStatistics(history);

        assert(serialize(history) === serialize(historySnapshotBefore), '52. the input history array is never mutated');
        assert(history[0] === record, '53. the input history still holds the original record instance');
        assert(serialize(record.toJSON()) === recordJsonBefore, '54. the record itself is never mutated');
        assert(Object.isFrozen(stats), '55. the result is frozen');
        assert(Object.isFrozen(stats.signerIdentityCounts), '56. signerIdentityCounts is frozen');
        assert(Object.isFrozen(stats.snapshotFingerprintCounts), '57. snapshotFingerprintCounts is frozen');
        assert(Object.isFrozen(stats.evidenceFingerprintCounts), '58. evidenceFingerprintCounts is frozen');
        assert(Object.isFrozen(stats.signerIdentityCounts[0]), '59. each entry within signerIdentityCounts is itself frozen');
    }
    console.log('✓ Section I: neither the input history nor any record it holds is ever mutated, and every returned object/array is frozen');

    // ---------------------------------------------------------------
    // Section J — determinism.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);
        const recordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T17:00:00Z') });
        const recordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T17:01:00Z') });
        const history = [recordA, recordA, recordB];

        const statsOnce = describePublisherLeaderboardClaimHistoryStatistics(history);
        const statsTwice = describePublisherLeaderboardClaimHistoryStatistics(history);
        assert(serialize(statsOnce) === serialize(statsTwice), '60. repeated calls on an identical history are byte-identical');

        const reconstructed = reconstructPublisherLeaderboardClaimHistoryStatistics(history);
        assert(serialize(statsOnce) === serialize(reconstructed), '61. reconstruct() and describe() agree exactly on an identical history');
    }
    console.log('✓ Section J: repeated computation over the same history produces byte-identical statistics, and reconstruct()/describe() agree');

    // ---------------------------------------------------------------
    // Section K — no verification: statistics never change with current
    // local evidence.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archiveE1 = buildArchiveE1();
        const archiveE2 = buildArchiveE2();
        const claim = signedClaimFor(alice, verifier, archiveE1);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T18:00:00Z') });
        const history = [record];

        const statsBefore = describePublisherLeaderboardClaimHistoryStatistics(history);

        // The claim's own CURRENT verification against genuinely different
        // local evidence fails...
        const verification = verifyPublisherLeaderboardSnapshotClaim(archiveE2, record.claim.toJSON(), verifier);
        assert(verification.signatureValid === true && verification.matches === false, '62. the claim genuinely fails verification against different local evidence');

        // ...yet the stored-receipt statistics over the identical history
        // are completely unaffected — this module never even imports the
        // verification vocabulary.
        const statsAfter = describePublisherLeaderboardClaimHistoryStatistics(history);
        assert(serialize(statsBefore) === serialize(statsAfter), '63. statistics are byte-identical before and after a disagreeing current verification');
    }
    console.log('✓ Section K: statistics over stored history never change when current local evidence — and therefore current verification outcomes — changes');

    // ---------------------------------------------------------------
    // Section L — vocabulary boundary.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T19:00:00Z') });
        const stats = describePublisherLeaderboardClaimHistoryStatistics([record]);

        const keys = Object.keys(stats).sort();
        assert(serialize(keys) === serialize([
            'claimCount',
            'distinctClaimIdCount',
            'distinctSignerIdentityIdCount',
            'distinctSnapshotFingerprintCount',
            'distinctEvidenceFingerprintCount',
            'signerIdentityCounts',
            'snapshotFingerprintCounts',
            'evidenceFingerprintCounts'
        ].sort()), '64. the result carries exactly the documented, factual fields');

        const forbidden = ['valid', 'verified', 'trusted', 'trust', 'confidence', 'score', 'rank', 'reputation', 'matches', 'signatureValid'];
        for (const term of forbidden) {
            assert(!keys.includes(term), `65. the result never carries verification/trust/ranking vocabulary ('${term}')`);
        }

        const moduleSource = describePublisherLeaderboardClaimHistoryStatistics.toString() + reconstructPublisherLeaderboardClaimHistoryStatistics.toString();
        for (const term of ['verif', 'trust', 'confidence', 'score', 'rank', 'reputation']) {
            assert(!moduleSource.toLowerCase().includes(term), `66. neither function's own source mentions forbidden vocabulary ('${term}')`);
        }
    }
    console.log('✓ Section L: the result carries no verification, trust, or ranking vocabulary, and neither function computes any');

    console.log('\nAll PublisherLeaderboardClaimHistoryStatisticsView tests passed.');
}

run();
