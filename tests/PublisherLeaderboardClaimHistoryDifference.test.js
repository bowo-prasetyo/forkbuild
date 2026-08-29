import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { CreatePublisherLeaderboardSnapshotClaimUseCase } from '../application/CreatePublisherLeaderboardSnapshotClaimUseCase.js';
import { verifyPublisherLeaderboardSnapshotClaim } from '../application/PublisherLeaderboardSnapshotClaimVerification.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { appendLeaderboardClaimHistoryEntry } from '../application/LeaderboardClaimHistory.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import {
    exportPublisherLeaderboardClaimHistory,
    applyPublisherLeaderboardClaimHistoryExchange,
    PublisherLeaderboardClaimHistoryExchangeApplyOutcome
} from '../application/PublisherLeaderboardClaimHistoryExchange.js';
import {
    describePublisherLeaderboardClaimHistoryDifference,
    reconstructPublisherLeaderboardClaimHistoryDifference
} from '../application/PublisherLeaderboardClaimHistoryDifference.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.127 — Claim History Difference Projection.
//
// Section A: empty vs empty — no difference
// Section B: structurally identical (but distinct-array) histories — no
//            difference, even when receipt instances are separately
//            constructed
// Section C: one-sided receipts — correct sourceOnly/targetOnly, each the
//            ORIGINAL LeaderboardClaimRecord instance, never a copy
// Section D: receipt identity is exact — same claim with a different
//            receivedAt, or a different origin, is always a distinct
//            receipt; two separately built records with identical fields
//            are the same receipt
// Section E: multiplicity preservation — [A, A, B] vs [A, B] reports
//            exactly one A as exclusive, never zero or two
// Section F: verification independence — the SAME stored receipt reports
//            no difference even when each replica's own CURRENT
//            verification of it disagrees
// Section G: FLAGSHIP — Alice [A, B, B1] / Bob [B, B2, C]; difference,
//            then exchange (via 0.8.126, unchanged), then difference again
//            converges to sameHistory === true, without this module
//            performing the exchange itself
// Section H: neither input history is ever mutated; repeated calls are
//            byte-identical; results are frozen; original record instances
//            are preserved, never reconstructed copies
// Section I: describe()/reconstruct() are equivalent; malformed/absent
//            input tolerance; no verification/trust vocabulary anywhere in
//            the result

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
// the rest of the 0.8.121-0.8.126 family already uses.
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

function run() {
    const verifier = new LocalAuthorizationVerifier();

    // ---------------------------------------------------------------
    // Section A — empty vs empty.
    // ---------------------------------------------------------------
    {
        const diff = describePublisherLeaderboardClaimHistoryDifference([], []);
        assert(diff.sameHistory === true, '1. two empty histories report sameHistory');
        assert(diff.sourceOnlyCount === 0 && diff.targetOnlyCount === 0, '2. two empty histories report zero exclusive receipts on either side');
        assert(diff.sourceOnly.length === 0 && diff.targetOnly.length === 0, '3. two empty histories report empty sourceOnly/targetOnly arrays');
        assert(diff.sourceCount === 0 && diff.targetCount === 0, '4. two empty histories report zero counts on each side');
    }
    console.log('✓ Section A: two empty histories report no difference at all');

    // ---------------------------------------------------------------
    // Section B — structurally identical (but distinct-array) histories.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const receivedAt = new Date('2026-08-29T09:00:00Z');

        // Two SEPARATELY constructed records carrying exactly the same
        // fields — the same claim instance, the same receivedAt, the same
        // origin — must compare as the same receipt.
        const one = new LeaderboardClaimRecord({ claim, receivedAt, origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const two = new LeaderboardClaimRecord({ claim, receivedAt, origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        assert(one !== two, '5. sanity — two independently constructed records are distinct instances');
        assert(serialize(one.toJSON()) === serialize(two.toJSON()), '6. sanity — but their serialized content is identical');

        const diff = describePublisherLeaderboardClaimHistoryDifference([one], [two]);
        assert(diff.sameHistory === true, '7. two structurally identical (but distinct-instance) receipts report no difference');
        assert(diff.sourceOnlyCount === 0 && diff.targetOnlyCount === 0, '8. sourceOnly/targetOnly counts are both zero');
        assert(diff.sourceCount === 1 && diff.targetCount === 1, '9. each side\'s own count is still reported correctly even when there is no difference');
    }
    console.log('✓ Section B: structurally identical, separately constructed receipts report no difference');

    // ---------------------------------------------------------------
    // Section C — one-sided receipts.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);

        const sharedReceivedAt = new Date('2026-08-29T10:00:00Z');
        const sourceOnlyRecord = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T10:01:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const sharedRecordForSource = new LeaderboardClaimRecord({ claim: claimB, receivedAt: sharedReceivedAt, origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });
        const sharedRecordForTarget = new LeaderboardClaimRecord({ claim: claimB, receivedAt: sharedReceivedAt, origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });

        const sourceHistory = appendLeaderboardClaimHistoryEntry(appendLeaderboardClaimHistoryEntry([], sourceOnlyRecord), sharedRecordForSource);
        const targetHistory = appendLeaderboardClaimHistoryEntry([], sharedRecordForTarget);

        const diff = describePublisherLeaderboardClaimHistoryDifference(sourceHistory, targetHistory);
        assert(diff.sameHistory === false, '10. one-sided evidence reports sameHistory === false');
        assert(diff.sourceOnlyCount === 1 && diff.targetOnlyCount === 0, '11. exactly one source-only receipt, none on the target side');
        assert(diff.sourceOnly.length === 1 && diff.sourceOnly[0] === sourceOnlyRecord, '12. sourceOnly holds exactly the exclusive record, as the ORIGINAL instance');
        assert(diff.targetOnly.length === 0, '13. targetOnly is empty — the shared receipt cancels out on both sides');
    }
    console.log('✓ Section C: one-sided receipts are reported as exactly the correct source-only/target-only original records');

    // ---------------------------------------------------------------
    // Section D — receipt identity is exact.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);

        // Same claim, different receivedAt — a genuinely distinct receipt.
        const recordT1 = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T11:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordT2 = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T11:05:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const diffReceivedAt = describePublisherLeaderboardClaimHistoryDifference([recordT1], [recordT2]);
        assert(diffReceivedAt.sameHistory === false, '14. same claim, different receivedAt — reported as a genuine difference');
        assert(diffReceivedAt.sourceOnly.length === 1 && diffReceivedAt.sourceOnly[0] === recordT1, '15. recordT1 is exclusive to the source side');
        assert(diffReceivedAt.targetOnly.length === 1 && diffReceivedAt.targetOnly[0] === recordT2, '16. recordT2 is exclusive to the target side — neither cancels the other');

        // Same claim, same receivedAt, different origin — likewise a
        // genuinely distinct receipt.
        const sameReceivedAt = new Date('2026-08-29T11:10:00Z');
        const recordLocal = new LeaderboardClaimRecord({ claim, receivedAt: sameReceivedAt, origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordImported = new LeaderboardClaimRecord({ claim, receivedAt: sameReceivedAt, origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });
        const diffOrigin = describePublisherLeaderboardClaimHistoryDifference([recordLocal], [recordImported]);
        assert(diffOrigin.sameHistory === false, '17. same claim, same receivedAt, different origin — reported as a genuine difference');
        assert(diffOrigin.sourceOnly[0] === recordLocal && diffOrigin.targetOnly[0] === recordImported, '18. LOCAL and IMPORTED receipts of the same claim never cancel each other out');
    }
    console.log('✓ Section D: receipt identity is exact — differing in receivedAt or origin alone is always a distinct receipt, never partially matched');

    // ---------------------------------------------------------------
    // Section E — multiplicity preservation.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);

        const recordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T12:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T12:01:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });

        // Source: [A, A, B] — the SAME recordA instance received twice
        // (0.8.123's own, unchanged multiplicity rule). Target: [A, B].
        const sourceHistory = [recordA, recordA, recordB];
        const targetHistory = [recordA, recordB];

        const diff = describePublisherLeaderboardClaimHistoryDifference(sourceHistory, targetHistory);
        assert(diff.sourceOnlyCount === 1, '19. [A, A, B] vs [A, B] reports exactly ONE exclusive A, never zero or two');
        assert(diff.sourceOnly.length === 1 && diff.sourceOnly[0] === recordA, '20. the one exclusive receipt is recordA itself');
        assert(diff.targetOnlyCount === 0, '21. the target side has no exclusive receipts — its single A and its B both matched');
        assert(diff.sameHistory === false, '22. multiplicity difference alone is still a genuine difference');
    }
    console.log('✓ Section E: [A, A, B] versus [A, B] reports exactly one exclusive receipt — multiplicity is preserved, never collapsed to a set');

    // ---------------------------------------------------------------
    // Section F — verification independence: compares stored receipts,
    // never current verification results.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archiveE1 = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archiveE1);
        const receivedAt = new Date('2026-08-29T13:00:00Z');

        // Alice's and Bob's own copies of the identical receipt.
        const aliceRecord = new LeaderboardClaimRecord({ claim, receivedAt, origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const bobRecord = new LeaderboardClaimRecord({ claim, receivedAt, origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });

        const diff = describePublisherLeaderboardClaimHistoryDifference([aliceRecord], [bobRecord]);
        assert(diff.sameHistory === true, '23. the identical stored receipt reports no difference between Alice and Bob');

        // Now show their CURRENT verification of that same receipt
        // genuinely disagrees — Alice holds E1 (the claim's own evidence);
        // Bob holds a genuinely different archive, E2.
        const archiveE2 = buildArchiveE2();
        const aliceVerification = verifyPublisherLeaderboardSnapshotClaim(archiveE1, aliceRecord.claim.toJSON(), verifier);
        const bobVerification = verifyPublisherLeaderboardSnapshotClaim(archiveE2, bobRecord.claim.toJSON(), verifier);
        assert(aliceVerification.signatureValid === true && aliceVerification.matches === true, '24. Alice\'s own current verification of the receipt succeeds');
        assert(bobVerification.signatureValid === true && bobVerification.matches === false, '25. Bob\'s own current verification of the SAME receipt fails — genuinely different evidence');

        // The difference result is computed BEFORE any verification ran,
        // and re-diffing after verification still reports no difference —
        // this module never even imports the verification vocabulary.
        const diffAfter = describePublisherLeaderboardClaimHistoryDifference([aliceRecord], [bobRecord]);
        assert(diffAfter.sameHistory === true, '26. re-diffing after a disagreeing verification still reports no difference — the receipt itself never changed');
        assert(!('signatureValid' in diffAfter) && !('matches' in diffAfter) && !('evidenceFingerprintMatches' in diffAfter), '27. the difference result carries no verification vocabulary whatsoever');
    }
    console.log('✓ Section F: the same stored receipt reports no difference even when each replica\'s own current verification of it disagrees');

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP: Alice [A, B, B1] / Bob [B, B2, C]; difference,
    // exchange, difference again converges.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const eve = makeIdentity('Eve');
        const archive = buildArchiveE1();

        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);
        const claimC = signedClaimFor(eve, verifier, archive);

        const recordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T14:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordC = new LeaderboardClaimRecord({ claim: claimC, receivedAt: new Date('2026-08-29T14:01:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });

        // The receipt for claim B that BOTH Alice and Bob genuinely share —
        // identical claim, receivedAt, and origin on both sides.
        const sharedReceivedAt = new Date('2026-08-29T14:02:00Z');
        const recordB_aliceCopy = new LeaderboardClaimRecord({ claim: claimB, receivedAt: sharedReceivedAt, origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });
        const recordB_bobCopy = new LeaderboardClaimRecord({ claim: claimB, receivedAt: sharedReceivedAt, origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });

        // B1 — Alice's OWN, additional, genuinely distinct receipt for the
        // identical claim B (different receivedAt/origin).
        const recordB1 = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T14:03:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        // B2 — Bob's OWN, additional, genuinely distinct receipt for the
        // identical claim B.
        const recordB2 = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T14:04:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });

        let aliceHistory = [recordA, recordB_aliceCopy, recordB1];
        let bobHistory = [recordB_bobCopy, recordB2, recordC];

        const firstDiff = describePublisherLeaderboardClaimHistoryDifference(aliceHistory, bobHistory);
        assert(firstDiff.sameHistory === false, '28. FLAGSHIP — Alice and Bob\'s histories genuinely differ');
        assert(firstDiff.sourceOnly.length === 2 && firstDiff.sourceOnly[0] === recordA && firstDiff.sourceOnly[1] === recordB1, '29. FLAGSHIP — Alice-only is exactly [A, B1], in Alice\'s own order');
        assert(firstDiff.targetOnly.length === 2 && firstDiff.targetOnly[0] === recordB2 && firstDiff.targetOnly[1] === recordC, '30. FLAGSHIP — Bob-only is exactly [B2, C], in Bob\'s own order');

        // Converge: Alice receives Bob's exclusive receipts; Bob receives
        // Alice's — entirely via 0.8.126's own, unchanged export/apply.
        // This module performs NEITHER step itself.
        const bobOnlyPayload = exportPublisherLeaderboardClaimHistory(firstDiff.targetOnly);
        const aliceOnlyPayload = exportPublisherLeaderboardClaimHistory(firstDiff.sourceOnly);

        const applyToAlice = applyPublisherLeaderboardClaimHistoryExchange(aliceHistory, bobOnlyPayload, verifier);
        assert(applyToAlice.outcome === PublisherLeaderboardClaimHistoryExchangeApplyOutcome.APPLIED, '31. FLAGSHIP — Alice applies Bob\'s exclusive receipts');
        assert(applyToAlice.newCount === 2, '32. FLAGSHIP — both of Bob\'s exclusive receipts are genuinely new to Alice');
        aliceHistory = applyToAlice.history;

        const applyToBob = applyPublisherLeaderboardClaimHistoryExchange(bobHistory, aliceOnlyPayload, verifier);
        assert(applyToBob.outcome === PublisherLeaderboardClaimHistoryExchangeApplyOutcome.APPLIED, '33. FLAGSHIP — Bob applies Alice\'s exclusive receipts');
        assert(applyToBob.newCount === 2, '34. FLAGSHIP — both of Alice\'s exclusive receipts are genuinely new to Bob');
        bobHistory = applyToBob.history;

        assert(aliceHistory.length === 5 && bobHistory.length === 5, '35. FLAGSHIP — both replicas now hold five receipts each');

        const secondDiff = describePublisherLeaderboardClaimHistoryDifference(aliceHistory, bobHistory);
        assert(secondDiff.sameHistory === true, '36. FLAGSHIP — difference -> exchange -> difference converges to sameHistory === true');
        assert(secondDiff.sourceOnlyCount === 0 && secondDiff.targetOnlyCount === 0, '37. FLAGSHIP — no exclusive receipts remain on either side, even though the two histories hold their five receipts in different orders');
    }
    console.log('✓ Section G: FLAGSHIP — Alice [A, B, B1] / Bob [B, B2, C]: difference -> exchange (0.8.126, unchanged) -> difference again converges to no difference, without this module performing the exchange itself');

    // ---------------------------------------------------------------
    // Section H — no mutation, determinism, frozen results, original
    // instances preserved.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);
        const recordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T15:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T15:01:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });

        const sourceHistory = [recordA];
        const targetHistory = [recordB];
        const sourceSnapshotBefore = sourceHistory.slice();
        const targetSnapshotBefore = targetHistory.slice();

        const diffOnce = describePublisherLeaderboardClaimHistoryDifference(sourceHistory, targetHistory);
        const diffTwice = describePublisherLeaderboardClaimHistoryDifference(sourceHistory, targetHistory);
        assert(serialize(sourceHistory) === serialize(sourceSnapshotBefore), '38. the source history is never mutated');
        assert(serialize(targetHistory) === serialize(targetSnapshotBefore), '39. the target history is never mutated');
        assert(diffOnce.sourceOnly[0] === recordA && diffOnce.targetOnly[0] === recordB, '40. sourceOnly/targetOnly hold the ORIGINAL record instances — never a reconstructed copy');
        assert(diffOnce.sourceOnly[0] instanceof LeaderboardClaimRecord, '41. sourceOnly elements are genuine LeaderboardClaimRecord instances, not plain JSON');
        assert(serialize({ sourceOnly: diffOnce.sourceOnly.map((r) => r.toJSON()), targetOnly: diffOnce.targetOnly.map((r) => r.toJSON()) })
            === serialize({ sourceOnly: diffTwice.sourceOnly.map((r) => r.toJSON()), targetOnly: diffTwice.targetOnly.map((r) => r.toJSON()) }), '42. repeated calls on identical inputs are byte-identical');

        assert(Object.isFrozen(diffOnce), '43. the difference result is frozen');
        assert(Object.isFrozen(diffOnce.sourceOnly), '44. sourceOnly is frozen');
        assert(Object.isFrozen(diffOnce.targetOnly), '45. targetOnly is frozen');
    }
    console.log('✓ Section H: neither input history is ever mutated, repeated calls are byte-identical, and results hold the original, frozen record instances');

    // ---------------------------------------------------------------
    // Section I — describe()/reconstruct() equivalence, tolerance, and
    // vocabulary boundary.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T16:00:00Z') });
        const sourceHistory = [record];
        const targetHistory = [];

        const described = describePublisherLeaderboardClaimHistoryDifference(sourceHistory, targetHistory);
        const reconstructed = reconstructPublisherLeaderboardClaimHistoryDifference(sourceHistory, targetHistory);
        assert(reconstructed.sameHistory === described.sameHistory && reconstructed.sourceOnly[0] === described.sourceOnly[0], '46. reconstruct() and describe() agree exactly, sharing the same original record instances');

        assert(describePublisherLeaderboardClaimHistoryDifference().sameHistory === true, '47. calling with no arguments defaults to two empty histories, never throws');
        assert(describePublisherLeaderboardClaimHistoryDifference(null, undefined).sameHistory === true, '48. null/undefined histories degrade to empty, never throw');
        assert(describePublisherLeaderboardClaimHistoryDifference('not an array', 42).sameHistory === true, '49. malformed non-array histories degrade to empty, never throw');
        assert(describePublisherLeaderboardClaimHistoryDifference([null, {}, 'x'], [claim]).sameHistory === true, '50. non-LeaderboardClaimRecord entries are silently excluded from both sides');

        const keys = Object.keys(described).sort();
        assert(serialize(keys) === serialize(['sameHistory', 'sourceCount', 'sourceOnly', 'sourceOnlyCount', 'targetCount', 'targetOnly', 'targetOnlyCount'].sort()), '51. the result carries exactly the documented, factual fields');
        const forbidden = ['signatureValid', 'evidenceFingerprintMatches', 'policyVersionMatches', 'snapshotFingerprintMatches', 'matches', 'trusted', 'valid', 'score', 'reputation', 'rank'];
        for (const term of forbidden) {
            assert(!keys.includes(term), `52. the result never carries verification/trust vocabulary ('${term}')`);
        }
    }
    console.log('✓ Section I: describe()/reconstruct() agree exactly, malformed/absent input degrades safely, and the result carries no verification or trust vocabulary');

    console.log('\nAll PublisherLeaderboardClaimHistoryDifference tests passed.');
}

run();
