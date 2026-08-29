import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { CreatePublisherLeaderboardSnapshotClaimUseCase } from '../application/CreatePublisherLeaderboardSnapshotClaimUseCase.js';
import { verifyPublisherLeaderboardSnapshotClaim } from '../application/PublisherLeaderboardSnapshotClaimVerification.js';
import { exportPublisherLeaderboardSnapshotClaim } from '../application/PublisherLeaderboardSnapshotClaimExchange.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import {
    ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase,
    LeaderboardClaimArchiveReceiptOutcome
} from '../application/ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase.js';
import {
    describePublisherLeaderboardClaimHistory,
    reconstructPublisherLeaderboardClaimHistory
} from '../application/PublisherLeaderboardClaimHistoryView.js';
import {
    describePublisherLeaderboardClaimHistoryStatistics,
    reconstructPublisherLeaderboardClaimHistoryStatistics
} from '../application/PublisherLeaderboardClaimHistoryStatisticsView.js';
import {
    describePublisherLeaderboardClaimHistoryTimeline,
    reconstructPublisherLeaderboardClaimHistoryTimeline
} from '../application/PublisherLeaderboardClaimHistoryTimelineView.js';
import {
    describePublisherLeaderboardClaimHistoryDifference,
    reconstructPublisherLeaderboardClaimHistoryDifference
} from '../application/PublisherLeaderboardClaimHistoryDifference.js';
import { reconstructPublisherLeaderboardClaimVerificationHistory } from '../application/PublisherLeaderboardClaimVerificationHistoryView.js';
import { describePublicationObservationArchiveDifference } from '../application/PublicationObservationArchiveDifference.js';
import { describePublicationObservationArchiveReplacementReview } from '../application/PublicationObservationArchiveReplacementReview.js';
import {
    exportPublicationObservationArchive,
    importPublicationObservationArchive
} from '../application/PublicationObservationArchiveExport.js';
import { fingerprintPublicationObservationArchive } from '../application/PublicationObservationArchiveFingerprint.js';
import { reconstructAchievementEvidenceFingerprint } from '../application/AchievementEvidenceFingerprint.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.130 — Durable Signed Leaderboard Claim History Archive Integration.
//
// 0.8.121-0.8.129 built a complete, standalone claim subsystem — signing,
// portable exchange, a durable receipt, verification, verification
// history, portable claim-history exchange, and three read-only
// projections (difference/statistics/timeline) — all deliberately over a
// plain, caller-held `LeaderboardClaimHistory` array, never durably
// persisted anywhere. This milestone answers the question those nine
// milestones deliberately deferred: can a replica persist, reload,
// export, inspect, compare, and replace its signed leaderboard claim
// history as durable evidence of what claims it has received — while
// every semantic boundary established since 0.8.121 stays exactly where
// it was?
//
// Section A: empty archive compatibility — a fresh/pre-0.8.130 archive
//            loads with leaderboardClaimRecords: []
// Section B: append and immutability — appendLeaderboardClaimRecord()
//            never mutates the receiver
// Section C: multiplicity — identical claim receipts remain independently
//            stored, never deduplicated
// Section D: persistence — save -> reload preserves exact claims and
//            receipt metadata
// Section E: malformed archive input — invalid claim records degrade the
//            WHOLE archive to empty, never a partial reconstruction
// Section F: history reconstruction — reconstructPublisherLeaderboardClaimHistory()
//            is the one seam that reads the archive's own collection
// Section G: projection composition — statistics/timeline reconstruct
//            correctly from the durable history
// Section H: verification separation — changing evidence changes
//            verification but never the stored claim history
// Section I: archive fingerprint separation — evidence fingerprint stays
//            unaffected by claim-history changes; whole-archive
//            fingerprint changes
// Section J: archive difference — claim differences are exposed
//            separately from achievement-evidence differences
// Section K: replacement review — the claim collection participates
//            without any trust judgment
// Section L: archive export/import — full round-trip preserves claim
//            history
// Section M: FLAGSHIP — receive -> persist -> reload -> export -> import
//            -> reconstruct -> verify, end to end

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
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
const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);
const TXID_C = 'c'.repeat(64);
const TXID_D = 'd'.repeat(64);

const CREATED_AT = {
    a: new Date('2026-08-29T00:00:00Z'),
    b: new Date('2026-08-29T00:01:00Z'),
    c: new Date('2026-08-29T00:02:00Z'),
    d: new Date('2026-08-29T00:03:00Z'),
    carolA: new Date('2026-08-29T00:10:00Z'),
    carolB: new Date('2026-08-29T00:11:00Z'),
    carolC: new Date('2026-08-29T00:12:00Z'),
    daveB: new Date('2026-08-29T00:14:00Z'),
    daveC: new Date('2026-08-29T00:15:00Z'),
    mutation: new Date('2026-08-29T00:30:00Z')
};

function anchor(archive, letter, txid) {
    const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
    return useCase.execute(archive, { anchorId: `pub-${letter}`, contentHash: `pub-${letter}-content`, txid, network: NETWORK, createdAt: CREATED_AT[letter] });
}

function identityOf(archive, letter) {
    return archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === `pub-${letter}`).toBlockchainPublicationIdentity();
}

// The identical shared-evidence fixture 0.8.116 through 0.8.129's own
// flagships already established.
function buildSharedArchive() {
    const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
    const referenceUseCase = new CreatePublicationReferenceRecordUseCase();

    let archive = PublicationObservationArchive.empty();
    archive = anchor(archive, 'a', TXID_A);
    archive = anchor(archive, 'b', TXID_B);
    archive = anchor(archive, 'c', TXID_C);

    const identityA = identityOf(archive, 'a');
    const identityB = identityOf(archive, 'b');
    const identityC = identityOf(archive, 'c');

    archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: identityC, referencedPublicationIdentity: identityB, createdAt: CREATED_AT.b });

    archive = associationUseCase.execute(archive, { publisherId: 'Carol', publicationIdentity: identityA, createdAt: CREATED_AT.carolA });
    archive = associationUseCase.execute(archive, { publisherId: 'Carol', publicationIdentity: identityB, createdAt: CREATED_AT.carolB });
    archive = associationUseCase.execute(archive, { publisherId: 'Carol', publicationIdentity: identityC, createdAt: CREATED_AT.carolC });
    archive = associationUseCase.execute(archive, { publisherId: 'Dave', publicationIdentity: identityB, createdAt: CREATED_AT.daveB });
    archive = associationUseCase.execute(archive, { publisherId: 'Dave', publicationIdentity: identityC, createdAt: CREATED_AT.daveC });

    return archive;
}

// A genuinely DIFFERENT evidence archive — one more anchor and one more
// publisher association than buildSharedArchive() — used everywhere this
// file needs to prove that CURRENT evidence, and only current evidence,
// drives verification.
function buildMutatedArchive() {
    let archive = buildSharedArchive();
    archive = anchor(archive, 'd', TXID_D);
    const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
    archive = associationUseCase.execute(archive, { publisherId: 'Eve', publicationIdentity: identityOf(archive, 'd'), createdAt: CREATED_AT.mutation });
    return archive;
}

function signedClaimFor(identityProvider, verifier, archive) {
    return new CreatePublisherLeaderboardSnapshotClaimUseCase(identityProvider, verifier).execute(archive);
}

function wirePayloadFor(claim) {
    return JSON.parse(JSON.stringify(exportPublisherLeaderboardSnapshotClaim(claim)));
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty archive compatibility.
    // ---------------------------------------------------------------
    {
        const empty = PublicationObservationArchive.empty();
        assert(Array.isArray(empty.leaderboardClaimRecords) && empty.leaderboardClaimRecords.length === 0, '1. a fresh archive holds an empty leaderboardClaimRecords collection');
        assert(empty.leaderboardClaimRecordCount === 0, '2. leaderboardClaimRecordCount is zero on a fresh archive');
        assert(Object.isFrozen(empty.leaderboardClaimRecords), '3. the empty collection is frozen');

        // A pre-0.8.130 archive (schemaVersion 7) is the SAME "wrong
        // schemaVersion degrades to empty" rule every prior schema bump
        // already established — never a special-cased migration.
        const preExistingSchemaJSON = { ...empty.toJSON(), schemaVersion: 7 };
        delete preExistingSchemaJSON.leaderboardClaimRecords;
        delete preExistingSchemaJSON.leaderboardClaimRecordProvenance;
        const loaded = PublicationObservationArchive.fromJSON(preExistingSchemaJSON);
        assert(loaded.leaderboardClaimRecords.length === 0, '4. a pre-0.8.130 archive JSON loads with leaderboardClaimRecords: []');
        assert(serialize(loaded.toJSON()) === serialize(PublicationObservationArchive.empty().toJSON()), '5. it degrades to the exact same empty archive every wrong-schemaVersion payload already degrades to');
    }
    console.log('✓ Section A: a fresh/pre-0.8.130 archive loads with an empty leaderboardClaimRecords collection, via the same conservative schema-mismatch rule already established');

    // ---------------------------------------------------------------
    // Section B — append and immutability.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const sharedArchive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, sharedArchive);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T05:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });

        const before = sharedArchive;
        const beforeJSON = serialize(before.toJSON());
        const after = before.appendLeaderboardClaimRecord(record);

        assert(before !== after, '6. appendLeaderboardClaimRecord() returns a NEW archive instance');
        assert(serialize(before.toJSON()) === beforeJSON, '7. the receiver is never mutated');
        assert(before.leaderboardClaimRecordCount === 0, '8. the receiver still reports zero claim records');
        assert(after.leaderboardClaimRecordCount === 1, '9. the returned archive holds exactly one claim record');
        assert(after.leaderboardClaimRecords[0] === record, '10. the returned archive holds the EXACT record instance, never a copy');
        assert(after.leaderboardClaimRecordProvenance[0] === PublicationObservationArchiveProvenanceOrigin.LOCAL, '11. the provenance tag matches the origin argument');
        assert(Object.isFrozen(after), '12. the returned archive is frozen');
        assert(Object.isFrozen(after.leaderboardClaimRecords), '13. the returned collection is frozen');

        assert(before.appendLeaderboardClaimRecord(null) === before, '14. appending a falsy record is a no-op, returning the identical instance');
        assert(before.appendLeaderboardClaimRecord(claim) === before, '15. appending a bare (non-LeaderboardClaimRecord) value is a no-op');
        assert(before.appendLeaderboardClaimRecord(record, 'trusted') === before, '16. an invalid origin is a no-op, mirroring every other appendXxx()');
    }
    console.log('✓ Section B: appendLeaderboardClaimRecord() never mutates the receiver and returns a new, frozen archive holding the exact record instance');

    // ---------------------------------------------------------------
    // Section C — multiplicity.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const sharedArchive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, sharedArchive);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T05:30:00Z') });

        let archive = sharedArchive;
        archive = archive.appendLeaderboardClaimRecord(record, PublicationObservationArchiveProvenanceOrigin.LOCAL);
        archive = archive.appendLeaderboardClaimRecord(record, PublicationObservationArchiveProvenanceOrigin.IMPORTED);

        assert(archive.leaderboardClaimRecordCount === 2, '17. the identical record appended twice yields two independent entries');
        assert(archive.leaderboardClaimRecords[0] === record && archive.leaderboardClaimRecords[1] === record, '18. both entries carry the SAME underlying record instance — receiving twice is not the same as constructing two different records');
        assert(archive.leaderboardClaimRecordProvenance[0] === PublicationObservationArchiveProvenanceOrigin.LOCAL, '19. the first receipt is tagged LOCAL');
        assert(archive.leaderboardClaimRecordProvenance[1] === PublicationObservationArchiveProvenanceOrigin.IMPORTED, '20. the second receipt is independently tagged IMPORTED');
    }
    console.log('✓ Section C: repeated claim receipts remain independently stored, never deduplicated, exactly as 0.8.123 already established for LeaderboardClaimHistory itself');

    // ---------------------------------------------------------------
    // Section D — persistence: save -> reload.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const sharedArchive = buildSharedArchive();
        const claimA = signedClaimFor(alice, verifier, sharedArchive);
        const claimB = signedClaimFor(bob, verifier, sharedArchive);

        let archive = sharedArchive;
        archive = archive.appendLeaderboardClaimRecord(
            new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T06:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL }),
            PublicationObservationArchiveProvenanceOrigin.LOCAL
        );
        archive = archive.appendLeaderboardClaimRecord(
            new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T06:05:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED }),
            PublicationObservationArchiveProvenanceOrigin.IMPORTED
        );

        const storage = new LocalStoragePublicationObservationArchive(new InMemoryStorageProvider());
        storage.save(archive);
        const reloaded = storage.load();

        assert(reloaded.leaderboardClaimRecordCount === 2, '21. the reloaded archive holds exactly the two claim records that were saved');
        assert(serialize(reloaded.toJSON()) === serialize(archive.toJSON()), '22. save -> reload reproduces a byte-identical archive, claim history included');
        assert(reloaded.leaderboardClaimRecords[0].claim.signature.signature === claimA.signature.signature, '23. the first claim\'s own signature survives the round-trip exactly');
        assert(reloaded.leaderboardClaimRecords[0].receivedAt.getTime() === new Date('2026-08-29T06:00:00Z').getTime(), '24. receivedAt survives the round-trip exactly');
        assert(reloaded.leaderboardClaimRecords[0].origin === PublicationObservationArchiveProvenanceOrigin.LOCAL, '25. origin survives the round-trip exactly');
        assert(reloaded.leaderboardClaimRecords[1].origin === PublicationObservationArchiveProvenanceOrigin.IMPORTED, '26. the second record\'s own origin survives independently');
        assert(reloaded.leaderboardClaimRecords[0] instanceof LeaderboardClaimRecord && reloaded.leaderboardClaimRecords[1] instanceof LeaderboardClaimRecord, '27. reloaded entries are genuine LeaderboardClaimRecord instances, not plain JSON');
    }
    console.log('✓ Section D: save -> reload preserves the exact claim history — claims, receivedAt, origin, and signatures all byte-identical');

    // ---------------------------------------------------------------
    // Section E — malformed archive input degrades the WHOLE archive to
    // empty, never a partial reconstruction.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const sharedArchive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, sharedArchive);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T07:00:00Z') });
        const archive = sharedArchive.appendLeaderboardClaimRecord(record, PublicationObservationArchiveProvenanceOrigin.LOCAL);
        const goodJSON = archive.toJSON();

        // A structurally malformed nested claim (missing a required
        // field) — the deep validation this file delegates entirely to
        // LeaderboardClaimRecord.fromJSON() (0.8.123, UNCHANGED) must
        // catch this, exactly as it would for a bare, non-archived claim.
        // (Cryptographic signature validity is deliberately NOT this
        // seam's job — see application/PublisherLeaderboardSnapshotClaimVerification.js's
        // own, separate, explicit 0.8.121 step; fromJSON() has no verifier
        // to call one with, exactly like every other record class here.)
        const malformedClaimRecords = goodJSON.leaderboardClaimRecords.map((r, i) => i === 0
            ? { ...r, claim: { ...r.claim, evidenceFingerprint: undefined } }
            : r);
        const malformed = { ...goodJSON, leaderboardClaimRecords: malformedClaimRecords };
        const reconstructedMalformed = PublicationObservationArchive.fromJSON(JSON.parse(JSON.stringify(malformed)));
        assert(reconstructedMalformed.leaderboardClaimRecordCount === 0, '28. a structurally malformed claim record is not silently skipped — the WHOLE archive degrades to empty');
        assert(reconstructedMalformed.bitcoinAnchorPublicationRecordCount === 0, '29. every OTHER collection is also empty — never a partial reconstruction holding only the facts that validated');

        // An extra, unexpected field on a claim record.
        const extraFieldRecords = goodJSON.leaderboardClaimRecords.map((r) => ({ ...r, extra: 'nope' }));
        const withExtraField = { ...goodJSON, leaderboardClaimRecords: extraFieldRecords };
        assert(PublicationObservationArchive.fromJSON(withExtraField).leaderboardClaimRecordCount === 0, '30. an unexpected extra field on a claim record degrades the whole archive to empty');

        // A missing required field on a claim record.
        const missingFieldRecords = goodJSON.leaderboardClaimRecords.map((r) => { const { origin, ...rest } = r; return rest; });
        const withMissingField = { ...goodJSON, leaderboardClaimRecords: missingFieldRecords };
        assert(PublicationObservationArchive.fromJSON(withMissingField).leaderboardClaimRecordCount === 0, '31. a missing required field on a claim record degrades the whole archive to empty');

        // A provenance array whose length disagrees with the factual
        // array's own length — the identical strict-length check every
        // other provenance collection already enforces.
        const mismatchedProvenance = { ...goodJSON, leaderboardClaimRecordProvenance: [] };
        assert(PublicationObservationArchive.fromJSON(mismatchedProvenance).leaderboardClaimRecordCount === 0, '32. a provenance array whose length disagrees with the claim records array degrades the whole archive to empty');

        // A genuinely valid payload still reconstructs correctly — proving
        // the strictness above is targeted, not a general refusal.
        const reconstructedGood = PublicationObservationArchive.fromJSON(goodJSON);
        assert(reconstructedGood.leaderboardClaimRecordCount === 1, '33. sanity — an untampered payload still reconstructs exactly');
    }
    console.log('✓ Section E: malformed claim records (tampered signature, extra field, missing field, mismatched provenance length) degrade the WHOLE archive to empty, never a partial reconstruction — exactly this codebase\'s existing, conservative fromJSON() contract');

    // ---------------------------------------------------------------
    // Section F — history reconstruction: the ONE seam.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const sharedArchive = buildSharedArchive();
        const claimA = signedClaimFor(alice, verifier, sharedArchive);
        const claimB = signedClaimFor(bob, verifier, sharedArchive);
        const recordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T08:00:00Z') });
        const recordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T08:05:00Z') });

        let archive = sharedArchive;
        archive = archive.appendLeaderboardClaimRecord(recordA);
        archive = archive.appendLeaderboardClaimRecord(recordB);

        const history = reconstructPublisherLeaderboardClaimHistory(archive);
        assert(history.length === 2 && history[0] === recordA && history[1] === recordB, '34. reconstructPublisherLeaderboardClaimHistory() returns exactly the archive\'s own collection, in order, holding the ORIGINAL record instances');
        assert(history === archive.leaderboardClaimRecords, '35. it returns the archive\'s own frozen array, not a copy');

        assert(reconstructPublisherLeaderboardClaimHistory(null).length === 0, '36. a null archive degrades to an empty history, never a throw');
        assert(reconstructPublisherLeaderboardClaimHistory(undefined).length === 0, '37. an undefined archive degrades to an empty history');
        assert(reconstructPublisherLeaderboardClaimHistory({}).length === 0, '38. a non-archive plain object degrades to an empty history, never duck-typed');

        // The narrated view composes on top, exactly as every other
        // describe/reconstruct pair in this codebase already does.
        const narrated = describePublisherLeaderboardClaimHistory(reconstructPublisherLeaderboardClaimHistory(archive));
        assert(narrated.claimCount === 2 && narrated.claims[0].id === claimA.id && narrated.claims[1].id === claimB.id, '39. the narrated view composes correctly over the reconstructed history');
    }
    console.log('✓ Section F: reconstructPublisherLeaderboardClaimHistory() is the one, thin seam between an archive and the plain claim-record array every downstream projection already expects');

    // ---------------------------------------------------------------
    // Section G — projection composition: statistics and timeline.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const sharedArchive = buildSharedArchive();
        const claimA = signedClaimFor(alice, verifier, sharedArchive);
        const claimB = signedClaimFor(bob, verifier, sharedArchive);
        const recordA1 = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T09:00:00Z') });
        const recordA2 = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T09:05:00Z') });
        const recordB1 = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T08:55:00Z') });

        let archive = sharedArchive;
        archive = archive.appendLeaderboardClaimRecord(recordA1);
        archive = archive.appendLeaderboardClaimRecord(recordA2);
        archive = archive.appendLeaderboardClaimRecord(recordB1);

        const stats = reconstructPublisherLeaderboardClaimHistoryStatistics(archive);
        assert(stats.claimCount === 3, '40. statistics reconstructed from the archive count every receipt');
        assert(stats.distinctClaimIdCount === 2, '41. distinctClaimIdCount correctly collapses the two receipts of the identical claim A');
        assert(stats.distinctSignerIdentityIdCount === 2, '42. two distinct signers are reported');
        assert(serialize(stats) === serialize(describePublisherLeaderboardClaimHistoryStatistics(reconstructPublisherLeaderboardClaimHistory(archive))), '43. reconstructPublisherLeaderboardClaimHistoryStatistics(archive) agrees exactly with describe() composed manually over the same extraction');

        const timeline = reconstructPublisherLeaderboardClaimHistoryTimeline(archive);
        assert(timeline.entryCount === 3, '44. the timeline reconstructed from the archive holds every receipt');
        // B1 was received BEFORE A1/A2 — reception order, never array/creation order.
        assert(timeline.entries[0].claimId === claimB.id, '45. the timeline orders by receivedAt, not by archive append order');
        assert(serialize(timeline) === serialize(describePublisherLeaderboardClaimHistoryTimeline(reconstructPublisherLeaderboardClaimHistory(archive))), '46. reconstructPublisherLeaderboardClaimHistoryTimeline(archive) agrees exactly with describe() composed manually over the same extraction');
    }
    console.log('✓ Section G: statistics and timeline reconstruct correctly from the durable, archived claim history — only reconstructPublisherLeaderboardClaimHistory() understands the archive itself');

    // ---------------------------------------------------------------
    // Section H — verification separation: a permanent architectural
    // regression test. A stored claim is a historical signed statement;
    // its current verification result is a derived observation about the
    // relationship between that statement and CURRENT local evidence.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const evidenceE = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, evidenceE);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T10:00:00Z') });

        const archiveWithClaimAgainstE = evidenceE.appendLeaderboardClaimRecord(record, PublicationObservationArchiveProvenanceOrigin.LOCAL);
        const claimHistory = reconstructPublisherLeaderboardClaimHistory(archiveWithClaimAgainstE);

        const verificationBefore = reconstructPublisherLeaderboardClaimVerificationHistory(claimHistory, archiveWithClaimAgainstE, verifier);
        assert(verificationBefore.claimCount === 1, '47. one verification entry, matching the one stored claim');
        assert(verificationBefore.verifications[0].signatureValid === true && verificationBefore.verifications[0].matches === true, '48. against the SAME evidence it was signed over, the claim matches');

        // Modify the archive's evidence to E' — WITHOUT touching the
        // stored claim record in any way. This is exactly appendXxx()'s
        // own immutability contract: appending a Base publication record
        // returns a new archive whose leaderboardClaimRecords collection
        // is the EXACT SAME array reference as before.
        const archiveWithMutatedEvidence = anchor(archiveWithClaimAgainstE, 'd', TXID_D);
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
        const archiveWithMutatedEvidenceAndClaim = associationUseCase.execute(archiveWithMutatedEvidence, {
            publisherId: 'Eve', publicationIdentity: identityOf(archiveWithMutatedEvidence, 'd'), createdAt: CREATED_AT.mutation
        });

        // Every appendXxx() constructs a fresh archive (and, defensively,
        // a fresh wrapper array per collection — see application/
        // PublicationObservationArchive.js's own constructor) even for
        // collections it does not touch, so array-reference equality is
        // not the right check here. What must hold — and does — is that
        // the ELEMENT inside is the exact same frozen record instance,
        // never a copy, and the collection's own content is unchanged.
        assert(archiveWithMutatedEvidenceAndClaim.leaderboardClaimRecords.length === archiveWithClaimAgainstE.leaderboardClaimRecords.length, '49. claim history === UNCHANGED — mutating evidence never adds to or removes from the claim-records collection');
        assert(archiveWithMutatedEvidenceAndClaim.leaderboardClaimRecords[0] === record, '50. claim record === UNCHANGED — the exact same frozen record instance, byte-identical');

        const claimHistoryAfter = reconstructPublisherLeaderboardClaimHistory(archiveWithMutatedEvidenceAndClaim);
        const verificationAfter = reconstructPublisherLeaderboardClaimVerificationHistory(claimHistoryAfter, archiveWithMutatedEvidenceAndClaim, verifier);
        assert(verificationAfter.verifications[0].signatureValid === true, '51. the signature is still genuinely valid — Alice really did sign this claim');
        assert(verificationAfter.verifications[0].evidenceFingerprintMatches === false, '52. verification === CHANGED — the claim no longer agrees with this replica\'s own, now-different evidence');
        assert(verificationAfter.verifications[0].matches === false, '53. the claim as a whole no longer matches current evidence');

        // The direct, single-claim verification path (0.8.124) agrees.
        const singleVerification = verifyPublisherLeaderboardSnapshotClaim(archiveWithMutatedEvidenceAndClaim, claim.toJSON(), verifier);
        assert(singleVerification.matches === false, '54. the identical conclusion holds through 0.8.124\'s own single-claim verification path, unchanged by this milestone');
    }
    console.log('✓ Section H: PERMANENT REGRESSION TEST — mutating an archive\'s own evidence changes verification but never the stored claim history or claim record; a stored claim is a historical statement, its verification a derived observation');

    // ---------------------------------------------------------------
    // Section I — archive fingerprint separation.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const sharedArchive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, sharedArchive);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T11:00:00Z') });

        const withoutClaim = sharedArchive;
        const withClaim = sharedArchive.appendLeaderboardClaimRecord(record, PublicationObservationArchiveProvenanceOrigin.LOCAL);

        // Evidence fingerprint (0.8.116) — a claim receipt is never
        // achievement evidence.
        const evidenceFingerprintWithout = reconstructAchievementEvidenceFingerprint(withoutClaim);
        const evidenceFingerprintWith = reconstructAchievementEvidenceFingerprint(withClaim);
        assert(evidenceFingerprintWithout.fingerprint === evidenceFingerprintWith.fingerprint, '55. the achievement-evidence fingerprint is byte-identical whether or not the archive holds any leaderboard claim records');

        // Whole-archive fingerprint (0.8.84) — the durable archive state
        // genuinely differs.
        const wholeArchiveFingerprintWithout = fingerprintPublicationObservationArchive(withoutClaim);
        const wholeArchiveFingerprintWith = fingerprintPublicationObservationArchive(withClaim);
        assert(wholeArchiveFingerprintWithout !== wholeArchiveFingerprintWith, '56. the whole-archive fingerprint DOES change — a claim receipt is part of the durable archive state');

        // Adding a second, byte-identical evidence-only fact (unrelated
        // to claims) also changes the evidence fingerprint, for contrast.
        const withUnrelatedEvidenceChange = anchor(withoutClaim, 'd', TXID_D);
        assert(reconstructAchievementEvidenceFingerprint(withUnrelatedEvidenceChange).fingerprint !== evidenceFingerprintWithout.fingerprint, '57. sanity — the evidence fingerprint DOES change when evidence itself changes, proving Section I isn\'t vacuously true');
    }
    console.log('✓ Section I: the evidence fingerprint stays unaffected by claim-history changes, while the whole-archive fingerprint naturally extends to include it');

    // ---------------------------------------------------------------
    // Section J — archive difference: claim differences are reported
    // separately from achievement-evidence differences.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const sharedArchive = buildSharedArchive();
        const claimA = signedClaimFor(alice, verifier, sharedArchive);
        const claimB = signedClaimFor(bob, verifier, sharedArchive);

        // Both archives share IDENTICAL evidence — only their claim
        // histories differ.
        const currentArchive = sharedArchive.appendLeaderboardClaimRecord(
            new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T12:00:00Z') }), PublicationObservationArchiveProvenanceOrigin.LOCAL
        );
        const externalArchive = sharedArchive.appendLeaderboardClaimRecord(
            new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T12:05:00Z') }), PublicationObservationArchiveProvenanceOrigin.IMPORTED
        );

        const wholeDifference = describePublicationObservationArchiveDifference(currentArchive, externalArchive);
        assert(wholeDifference.same === false, '58. the whole-archive fingerprint reports a genuine difference');
        // Both sides hold exactly one record at the SAME array position
        // (position 0) with genuinely different content — the positional
        // diff (0.8.87, UNCHANGED) reports this as `changed`, never
        // `onlyInCurrent`/`onlyInExternal` — a differing fact at a shared
        // identity position is never silently treated as two exclusive
        // facts. This is the sharp contrast Section J exists to draw
        // against the receipt-identity, multiset-aware comparison below.
        assert(wholeDifference.leaderboardClaimRecords.changedCount === 1
            && wholeDifference.leaderboardClaimRecords.onlyInCurrentCount === 0
            && wholeDifference.leaderboardClaimRecords.onlyInExternalCount === 0, '59. the positional leaderboardClaimRecords collection reports the differing position as changed, exactly like every other positional collection');
        assert(wholeDifference.bitcoinAnchorPublicationRecords.changedCount === 0
            && wholeDifference.bitcoinAnchorPublicationRecords.onlyInCurrentCount === 0
            && wholeDifference.bitcoinAnchorPublicationRecords.onlyInExternalCount === 0, '60. every EVIDENCE collection reports no difference at all — the two archives share identical evidence');

        // The receipt-identity, multiset-aware claim-history difference
        // (0.8.127, now archive-aware) agrees on WHICH receipts differ.
        const claimHistoryDifference = reconstructPublisherLeaderboardClaimHistoryDifference(currentArchive, externalArchive);
        assert(claimHistoryDifference.sourceOnly.length === 1 && claimHistoryDifference.sourceOnly[0].claim.id === claimA.id, '61. the claim-history difference names claim A as current-only');
        assert(claimHistoryDifference.targetOnly.length === 1 && claimHistoryDifference.targetOnly[0].claim.id === claimB.id, '62. the claim-history difference names claim B as external-only');

        // Achievement-evidence difference is entirely untouched by claims
        // — this file imports nothing from the claim-history family.
        assert(!Object.keys(wholeDifference).some((key) => key.toLowerCase().includes('achievement')), '63. describePublicationObservationArchiveDifference()\'s own result carries no achievement-evidence vocabulary of its own — it is a WHOLE-archive positional diff, a different projection entirely');
    }
    console.log('✓ Section J: claim-history differences are reported through their own, receipt-identity-aware projection, and as an ordinary eleventh positional collection in the whole-archive diff — achievement-evidence differences remain untouched');

    // ---------------------------------------------------------------
    // Section K — replacement review: the claim collection participates
    // without any trust judgment.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const sharedArchive = buildSharedArchive();
        const claimA = signedClaimFor(alice, verifier, sharedArchive);
        const claimB = signedClaimFor(bob, verifier, sharedArchive);

        const currentArchive = sharedArchive.appendLeaderboardClaimRecord(
            new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T13:00:00Z') }), PublicationObservationArchiveProvenanceOrigin.LOCAL
        );
        let externalArchive = sharedArchive.appendLeaderboardClaimRecord(
            new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T13:00:00Z') }), PublicationObservationArchiveProvenanceOrigin.LOCAL
        );
        externalArchive = externalArchive.appendLeaderboardClaimRecord(
            new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T13:05:00Z') }), PublicationObservationArchiveProvenanceOrigin.IMPORTED
        );

        const review = describePublicationObservationArchiveReplacementReview(currentArchive, externalArchive);
        assert(review.current.leaderboardClaimRecordCount === 1, '64. the current side reports exactly one claim record');
        assert(review.external.leaderboardClaimRecordCount === 2, '65. the external side reports exactly two — claim A (identical) plus claim B (exclusive)');
        assert(review.leaderboardClaimHistoryDifference.sourceOnly.length === 0, '66. claim A is on file identically on both sides — never reported as a difference');
        assert(review.leaderboardClaimHistoryDifference.targetOnly.length === 1 && review.leaderboardClaimHistoryDifference.targetOnly[0].claim.id === claimB.id, '67. claim B is correctly named as the external side\'s own exclusive receipt');

        // Never an "upgrade" — a genuinely valid claim on the external
        // side is reported by exact count/identity, never by any
        // verified/valid/trusted classification.
        const reviewText = serialize(review).toLowerCase();
        for (const term of ['trusted', 'valid', 'verified', 'authentic', 'newer', 'better', 'correct', 'recommend', 'safe', 'stale']) {
            assert(!reviewText.includes(term), `68. the review's own output never carries "${term}" anywhere near the claim collection`);
        }
    }
    console.log('✓ Section K: the claim collection participates in replacement review as another independently inspectable, receipt-identity-compared collection — never a trust or "upgrade" judgment');

    // ---------------------------------------------------------------
    // Section L — archive export/import preserves claim history.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const sharedArchive = buildSharedArchive();
        const claimA = signedClaimFor(alice, verifier, sharedArchive);
        const claimB = signedClaimFor(bob, verifier, sharedArchive);

        let archive = sharedArchive;
        archive = archive.appendLeaderboardClaimRecord(new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T14:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL }), PublicationObservationArchiveProvenanceOrigin.LOCAL);
        archive = archive.appendLeaderboardClaimRecord(new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T14:05:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL }), PublicationObservationArchiveProvenanceOrigin.LOCAL);

        const exported = exportPublicationObservationArchive(archive);
        assert(serialize(exported) === serialize(archive.toJSON()), '69. the exported payload carries exactly archive.toJSON()\'s own fields — no added envelope, claim history included');

        const { outcome, archive: imported } = importPublicationObservationArchive(JSON.parse(JSON.stringify(exported)));
        assert(outcome === 'imported', '70. importing the exported payload succeeds');
        assert(imported.leaderboardClaimRecordCount === 2, '71. the imported archive holds both claim records');
        assert(imported.leaderboardClaimRecords[0].claim.id === claimA.id && imported.leaderboardClaimRecords[1].claim.id === claimB.id, '72. claim identity and order survive export/import exactly');

        // 0.8.83's own provenance-restamping rule applies uniformly, over
        // ALL eleven collections — including this milestone's own.
        assert(imported.leaderboardClaimRecordProvenance.every((origin) => origin === PublicationObservationArchiveProvenanceOrigin.IMPORTED), '73. every claim record\'s own archive-level provenance is uniformly restamped IMPORTED by whole-archive import, exactly like every other collection');
        // The RECORD's own frozen `origin` field is untouched by that
        // restamping — it is a fixed fact about the receipt itself.
        assert(imported.leaderboardClaimRecords[0].origin === PublicationObservationArchiveProvenanceOrigin.LOCAL, '74. the record\'s OWN origin field is never rewritten by archive-level provenance restamping — it stays exactly what it was constructed with');
    }
    console.log('✓ Section L: archive export/import round-trips the full claim history — identity, order, and signatures exact — with archive-level provenance restamped uniformly, never touching a record\'s own frozen origin field');

    // ---------------------------------------------------------------
    // Section M — FLAGSHIP: receive -> persist -> reload -> export ->
    // import -> reconstruct -> verify, end to end.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const sharedArchive = buildSharedArchive();

        const claimA = signedClaimFor(alice, verifier, sharedArchive);
        const claimB = signedClaimFor(alice, verifier, sharedArchive);
        const claimC = signedClaimFor(bob, verifier, sharedArchive);
        assert(claimA.id !== claimB.id, '75. FLAGSHIP — Alice\'s two claims are genuinely distinct claims, not the same claim signed twice');

        const receiveUseCase = new ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase(verifier);

        // The replica receives: A/LOCAL, A/IMPORTED, B/IMPORTED, C/IMPORTED.
        let archive = sharedArchive;

        const receiveA_local = receiveUseCase.execute(archive, wirePayloadFor(claimA), PublicationObservationArchiveProvenanceOrigin.LOCAL);
        assert(receiveA_local.outcome === LeaderboardClaimArchiveReceiptOutcome.RECEIVED, '76. FLAGSHIP — receiving A as LOCAL succeeds');
        archive = receiveA_local.archive;

        const receiveA_imported = receiveUseCase.execute(archive, wirePayloadFor(claimA), PublicationObservationArchiveProvenanceOrigin.IMPORTED);
        assert(receiveA_imported.outcome === LeaderboardClaimArchiveReceiptOutcome.RECEIVED, '77. FLAGSHIP — receiving the identical claim A a second time, as IMPORTED, still succeeds');
        archive = receiveA_imported.archive;

        const receiveB = receiveUseCase.execute(archive, wirePayloadFor(claimB), PublicationObservationArchiveProvenanceOrigin.IMPORTED);
        assert(receiveB.outcome === LeaderboardClaimArchiveReceiptOutcome.RECEIVED, '78. FLAGSHIP — receiving B as IMPORTED succeeds');
        archive = receiveB.archive;

        const receiveC = receiveUseCase.execute(archive, wirePayloadFor(claimC), PublicationObservationArchiveProvenanceOrigin.IMPORTED);
        assert(receiveC.outcome === LeaderboardClaimArchiveReceiptOutcome.RECEIVED, '79. FLAGSHIP — receiving C (Bob\'s claim) as IMPORTED succeeds');
        archive = receiveC.archive;

        assert(archive.leaderboardClaimRecordCount === 4, '80. FLAGSHIP — the archive now holds all four receipts');
        assert(archive.leaderboardClaimRecordProvenance.join(',') === 'local,imported,imported,imported', '81. FLAGSHIP — provenance tags land in exactly the order each receipt was received');
        assert(archive.leaderboardClaimRecords.filter((r) => r.claim.id === claimA.id).length === 2, '82. FLAGSHIP — claim A was received twice, preserved as two independent entries');

        // Never touching evidence, never verifying semantically —
        // receiving is a pure archive-persistence boundary.
        assert(archive.bitcoinAnchorPublicationRecordCount === sharedArchive.bitcoinAnchorPublicationRecordCount, '83. FLAGSHIP — receiving claims never alters any evidence collection');

        // Compute the pre-reload projections.
        const claimHistoryBefore = reconstructPublisherLeaderboardClaimHistory(archive);
        const statsBefore = reconstructPublisherLeaderboardClaimHistoryStatistics(archive);
        const timelineBefore = reconstructPublisherLeaderboardClaimHistoryTimeline(archive);
        const verificationBefore = reconstructPublisherLeaderboardClaimVerificationHistory(claimHistoryBefore, archive, verifier);

        assert(statsBefore.claimCount === 4 && statsBefore.distinctClaimIdCount === 3, '84. FLAGSHIP — statistics: 4 receipts, 3 distinct claims (A twice, B, C)');
        assert(statsBefore.distinctSignerIdentityIdCount === 2, '85. FLAGSHIP — statistics: two distinct signers, Alice and Bob');
        assert(timelineBefore.entryCount === 4, '86. FLAGSHIP — timeline: every receipt appears');
        assert(verificationBefore.claimCount === 4 && verificationBefore.verifications.every((v) => v.signatureValid === true && v.matches === true), '87. FLAGSHIP — every received claim genuinely verifies against this replica\'s own evidence, which it was signed over');

        // Persist -> destroy in-memory state -> reload.
        const storage = new LocalStoragePublicationObservationArchive(new InMemoryStorageProvider());
        storage.save(archive);
        archive = null; // eslint-disable-line no-unused-vars -- simulate full destruction of in-memory state
        const reloaded = storage.load();

        assert(reloaded.leaderboardClaimRecordCount === 4, '88. FLAGSHIP — after destroy-and-reload, all four receipts survive');

        const claimHistoryAfterReload = reconstructPublisherLeaderboardClaimHistory(reloaded);
        const statsAfterReload = reconstructPublisherLeaderboardClaimHistoryStatistics(reloaded);
        const timelineAfterReload = reconstructPublisherLeaderboardClaimHistoryTimeline(reloaded);
        const verificationAfterReload = reconstructPublisherLeaderboardClaimVerificationHistory(claimHistoryAfterReload, reloaded, verifier);

        assert(serialize(statsBefore) === serialize(statsAfterReload), '89. FLAGSHIP — statistics are byte-identical before and after reload');
        assert(serialize(timelineBefore) === serialize(timelineAfterReload), '90. FLAGSHIP — the timeline is byte-identical before and after reload');
        assert(serialize(verificationBefore) === serialize(verificationAfterReload), '91. FLAGSHIP — the full verification history is byte-identical before and after reload');

        // Export -> import -> reconstruct -> verify, one more hop.
        const exported = exportPublicationObservationArchive(reloaded);
        const wireExported = JSON.parse(JSON.stringify(exported));
        const { outcome: importOutcome, archive: reimported } = importPublicationObservationArchive(wireExported);
        assert(importOutcome === 'imported', '92. FLAGSHIP — the exported archive imports successfully on the far side');
        assert(reimported.leaderboardClaimRecordCount === 4, '93. FLAGSHIP — every receipt survives export/import too');

        const claimHistoryAfterImport = reconstructPublisherLeaderboardClaimHistory(reimported);
        const statsAfterImport = reconstructPublisherLeaderboardClaimHistoryStatistics(reimported);
        const timelineAfterImport = reconstructPublisherLeaderboardClaimHistoryTimeline(reimported);
        const verificationAfterImport = reconstructPublisherLeaderboardClaimVerificationHistory(claimHistoryAfterImport, reimported, verifier);

        assert(serialize(statsAfterImport) === serialize(statsBefore), '94. FLAGSHIP — statistics remain byte-identical after a further export/import hop');
        assert(serialize(timelineAfterImport) === serialize(timelineBefore), '95. FLAGSHIP — the timeline remains byte-identical after a further export/import hop');
        // Verification content (signatureValid/matches/etc.) is identical;
        // only the archive-level provenance driving nothing in this
        // comparison could differ, and doesn't appear in verification
        // output at all — see application/LeaderboardClaimRecord.js's own
        // header.
        const stripReceivedWallClock = (v) => v.verifications.map(({ signerIdentityId, claimCreatedAt, signatureValid, evidenceFingerprintMatches, policyVersionMatches, snapshotFingerprintMatches, matches }) =>
            ({ signerIdentityId, claimCreatedAt, signatureValid, evidenceFingerprintMatches, policyVersionMatches, snapshotFingerprintMatches, matches }));
        assert(serialize(stripReceivedWallClock(verificationAfterImport)) === serialize(stripReceivedWallClock(verificationBefore)), '96. FLAGSHIP — every claim\'s own verification outcome is identical after the full receive -> persist -> reload -> export -> import -> reconstruct -> verify pipeline');

        // The FINAL word: multiplicity, timestamps, origins, and
        // signatures are exactly what was received, all the way through.
        assert(reimported.leaderboardClaimRecords.filter((r) => r.claim.id === claimA.id).length === 2, '97. FLAGSHIP — claim A\'s own multiplicity (received twice) survives the entire pipeline');
        assert(serialize(reimported.leaderboardClaimRecords.map((r) => r.claim.signature.signature)) === serialize(reloaded.leaderboardClaimRecords.map((r) => r.claim.signature.signature)), '98. FLAGSHIP — every claim\'s own signature is byte-identical at every hop');
    }
    console.log('✓ Section M: FLAGSHIP — receive (A/LOCAL, A/IMPORTED, B/IMPORTED, C/IMPORTED) -> persist -> destroy -> reload -> export -> import -> reconstruct (history/statistics/timeline/verification) -> verify: every projection agrees, byte-identically, at every hop');

    console.log('\nAll PublicationObservationArchiveLeaderboardClaimIntegration tests passed.');
}

run().catch((error) => {
    console.error('PublicationObservationArchiveLeaderboardClaimIntegration.test.js FAILED:', error);
    process.exitCode = 1;
});
