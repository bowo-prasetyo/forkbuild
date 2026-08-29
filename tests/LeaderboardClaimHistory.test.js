import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { CreatePublisherLeaderboardSnapshotClaimUseCase } from '../application/CreatePublisherLeaderboardSnapshotClaimUseCase.js';
import { verifyPublisherLeaderboardSnapshotClaim } from '../application/PublisherLeaderboardSnapshotClaimVerification.js';
import { exportPublisherLeaderboardSnapshotClaim } from '../application/PublisherLeaderboardSnapshotClaimExchange.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import {
    appendLeaderboardClaimHistoryEntry,
    findLeaderboardClaimRecordsBySignerIdentityId,
    findLeaderboardClaimRecordsBySnapshotFingerprint,
    findLeaderboardClaimRecordsByEvidenceFingerprint
} from '../application/LeaderboardClaimHistory.js';
import {
    ReceivePublisherLeaderboardSnapshotClaimUseCase,
    LeaderboardClaimReceiptOutcome
} from '../application/ReceivePublisherLeaderboardSnapshotClaimUseCase.js';
import {
    describePublisherLeaderboardClaimHistoryEntry,
    describePublisherLeaderboardClaimHistory
} from '../application/PublisherLeaderboardClaimHistoryView.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.123 — Signed Leaderboard Claim Archive.
//
// Section A: LeaderboardClaimRecord — construction validation, immutability,
//            toJSON()/fromJSON() round-trip
// Section B: LeaderboardClaimHistory — append-only, multiplicity preserved,
//            never mutates the array handed in, the three findXxx() lookups
// Section C: ReceivePublisherLeaderboardSnapshotClaimUseCase — construction,
//            never throws for malformed/unverifiable input (explicit
//            outcomes instead), history unchanged on failure
// Section D: FLAGSHIP — Alice signs and exports once; two independent
//            replicas each receive it into their own history; receiving
//            the identical claim twice preserves multiplicity (two
//            records, never deduplicated)
// Section E: receipt is never a verdict — a RECEIVED record's claim can
//            still fail 0.8.121's own separate semantic verification
//            against a replica's own, genuinely different evidence
// Section F: PublisherLeaderboardClaimHistoryView — intentionally factual,
//            no trusted/valid/current/authoritative/verified/score/rank
//            vocabulary anywhere in its output
// Section G: no archive touching; determinism; zero network access

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
    reference: new Date('2026-08-29T00:20:00Z'),
    mutation: new Date('2026-08-29T00:30:00Z')
};

function anchor(archive, letter, txid) {
    const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
    return useCase.execute(archive, { anchorId: `pub-${letter}`, contentHash: `pub-${letter}-content`, txid, network: NETWORK, createdAt: CREATED_AT[letter] });
}

function identityOf(archive, letter) {
    return archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === `pub-${letter}`).toBlockchainPublicationIdentity();
}

// The identical shared-evidence fixture 0.8.116 through 0.8.122's own
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

    archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: identityC, referencedPublicationIdentity: identityB, createdAt: CREATED_AT.reference });

    archive = associationUseCase.execute(archive, { publisherId: 'Carol', publicationIdentity: identityA, createdAt: CREATED_AT.carolA });
    archive = associationUseCase.execute(archive, { publisherId: 'Carol', publicationIdentity: identityB, createdAt: CREATED_AT.carolB });
    archive = associationUseCase.execute(archive, { publisherId: 'Carol', publicationIdentity: identityC, createdAt: CREATED_AT.carolC });
    archive = associationUseCase.execute(archive, { publisherId: 'Dave', publicationIdentity: identityB, createdAt: CREATED_AT.daveB });
    archive = associationUseCase.execute(archive, { publisherId: 'Dave', publicationIdentity: identityC, createdAt: CREATED_AT.daveC });

    return archive;
}

function serialize(value) {
    return JSON.stringify(value);
}

function signedClaimFor(identityProvider, verifier, archive) {
    return new CreatePublisherLeaderboardSnapshotClaimUseCase(identityProvider, verifier).execute(archive);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — LeaderboardClaimRecord.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, archive);

        let threw = false;
        try { new LeaderboardClaimRecord({ claim: null }); } catch { threw = true; }
        assert(threw, '1. requires a genuine PublisherLeaderboardSnapshotClaim instance');

        threw = false;
        try { new LeaderboardClaimRecord({ claim: claim.toJSON() }); } catch { threw = true; }
        assert(threw, '2. refuses a plain JSON object — a genuine instance is required, never bare JSON');

        const unsignedClaim = new PublisherLeaderboardSnapshotClaim({
            evidenceFingerprint: 'e'.repeat(64), policyVersion: 1, snapshotFingerprint: 'f'.repeat(64), signerIdentityId: 'did:key:zSigner'
        });
        threw = false;
        try { new LeaderboardClaimRecord({ claim: unsignedClaim }); } catch { threw = true; }
        assert(threw, '3. refuses to record an unsigned claim');

        threw = false;
        try { new LeaderboardClaimRecord({ claim, origin: 'trusted' }); } catch { threw = true; }
        assert(threw, '4. refuses an invalid provenance origin — only local/imported are ever accepted');

        threw = false;
        try { new LeaderboardClaimRecord({ claim, receivedAt: 'not a date' }); } catch { threw = true; }
        assert(threw, '5. refuses an unparsable receivedAt');

        const receivedAt = new Date('2026-08-29T01:00:00Z');
        const record = new LeaderboardClaimRecord({ claim, receivedAt, origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });
        assert(record.claim === claim, '6. the record carries the EXACT claim instance handed in, never a copy');
        assert(record.receivedAt.getTime() === receivedAt.getTime(), '7. receivedAt is preserved exactly');
        assert(record.origin === PublicationObservationArchiveProvenanceOrigin.IMPORTED, '8. origin is preserved exactly');
        assert(Object.isFrozen(record), '9. a LeaderboardClaimRecord is frozen');

        const defaultOriginRecord = new LeaderboardClaimRecord({ claim });
        assert(defaultOriginRecord.origin === PublicationObservationArchiveProvenanceOrigin.IMPORTED, '10. origin defaults to imported — the honest default for a received claim');

        const roundTripped = LeaderboardClaimRecord.fromJSON(JSON.parse(JSON.stringify(record.toJSON())));
        assert(roundTripped instanceof LeaderboardClaimRecord, '11. fromJSON() reconstructs a genuine instance');
        assert(serialize(roundTripped.toJSON()) === serialize(record.toJSON()), '12. round-trip is byte-identical');
        assert(roundTripped.claim.signature.signature === claim.signature.signature, '13. the claims own signature survives the round-trip unchanged');

        assert(LeaderboardClaimRecord.fromJSON(null) === null, '14. fromJSON(null) is null, never a throw');
        assert(LeaderboardClaimRecord.fromJSON({ claim: null }) === null, '15. fromJSON() with no recoverable claim is null');
    }
    console.log('✓ Section A: LeaderboardClaimRecord requires a genuine signed claim, a valid origin, and a valid receivedAt; it is immutable and round-trips exactly');

    // ---------------------------------------------------------------
    // Section B — LeaderboardClaimHistory.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildSharedArchive();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);

        const recordA1 = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T02:00:00Z') });
        const recordA2 = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T02:05:00Z') });
        const recordB1 = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T02:10:00Z') });

        let history = [];
        const afterA1 = appendLeaderboardClaimHistoryEntry(history, recordA1);
        assert(history.length === 0, '16. append never mutates the array handed in');
        assert(afterA1.length === 1 && afterA1[0] === recordA1, '17. append returns a new array with the record appended');
        assert(Object.isFrozen(afterA1), '18. the returned history is frozen');

        const afterA2 = appendLeaderboardClaimHistoryEntry(afterA1, recordA2);
        const afterB1 = appendLeaderboardClaimHistoryEntry(afterA2, recordB1);
        history = afterB1;

        assert(history.length === 3, '19. the SAME claim received twice is preserved as two independent records — never deduplicated');
        assert(history[0] === recordA1 && history[1] === recordA2 && history[2] === recordB1, '20. entries preserve insertion order');

        const bySigner = findLeaderboardClaimRecordsBySignerIdentityId(history, claimA.signerIdentityId);
        assert(bySigner.length === 2 && bySigner[0] === recordA1 && bySigner[1] === recordA2, '21. findBySignerIdentityId returns every record from that signer, in order');
        assert(findLeaderboardClaimRecordsBySignerIdentityId(history, 'did:key:zNobody').length === 0, '22. an unknown signer finds nothing');
        assert(findLeaderboardClaimRecordsBySignerIdentityId(history, null).length === 0, '23. a malformed signerIdentityId finds nothing, never throws');

        const bySnapshot = findLeaderboardClaimRecordsBySnapshotFingerprint(history, claimA.snapshotFingerprint);
        assert(bySnapshot.length === 3, '24. findBySnapshotFingerprint returns every record naming that fingerprint — Alice and Bob both signed the identical shared snapshot');

        const byEvidence = findLeaderboardClaimRecordsByEvidenceFingerprint(history, claimA.evidenceFingerprint);
        assert(byEvidence.length === 3, '25. findByEvidenceFingerprint returns every record over that evidence set — Alice and Bob both signed the identical shared evidence');

        const appendNullRecord = appendLeaderboardClaimHistoryEntry(history, null);
        assert(serialize(appendNullRecord.map((r) => r === recordA1)) === serialize(history.map((r) => r === recordA1)) && appendNullRecord.length === history.length, '26. appending a falsy record is a no-op that still returns a frozen copy');
    }
    console.log('✓ Section B: LeaderboardClaimHistory is append-only, preserves multiplicity, never mutates its input, and each findXxx() is a plain, order-preserving lookup');

    // ---------------------------------------------------------------
    // Section C — ReceivePublisherLeaderboardSnapshotClaimUseCase: construction and validation.
    // ---------------------------------------------------------------
    {
        let threw = false;
        try { new ReceivePublisherLeaderboardSnapshotClaimUseCase(null); } catch { threw = true; }
        assert(threw, '27. requires a verifier');

        threw = false;
        try { new ReceivePublisherLeaderboardSnapshotClaimUseCase({}); } catch { threw = true; }
        assert(threw, '28. requires a verifier capable of verifyPublisherLeaderboardSnapshotClaim');

        const verifier = new LocalAuthorizationVerifier();
        const useCase = new ReceivePublisherLeaderboardSnapshotClaimUseCase(verifier);

        for (const malformed of [null, undefined, 42, 'not json at all {{{', [], {}]) {
            const result = useCase.execute([], malformed);
            assert(result.outcome === LeaderboardClaimReceiptOutcome.INVALID_CLAIM, `29. malformed payload (${JSON.stringify(malformed)}) never throws — yields INVALID_CLAIM`);
            assert(result.record === null, '30. INVALID_CLAIM never produces a record');
            assert(result.history.length === 0, '31. INVALID_CLAIM leaves history unchanged');
        }

        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, archive);
        const genuinePayload = exportPublisherLeaderboardSnapshotClaim(claim);
        const tampered = { ...genuinePayload, snapshotFingerprint: 'a'.repeat(64) };
        const tamperedResult = useCase.execute([], tampered);
        assert(tamperedResult.outcome === LeaderboardClaimReceiptOutcome.UNVERIFIABLE_CLAIM, '32. a tampered payload never throws — yields UNVERIFIABLE_CLAIM');
        assert(tamperedResult.record === null, '33. UNVERIFIABLE_CLAIM never produces a record');
        assert(tamperedResult.history.length === 0, '34. UNVERIFIABLE_CLAIM leaves history unchanged');

        threw = false;
        try { useCase.execute([], genuinePayload, 'trusted'); } catch { threw = true; }
        assert(threw, '35. an invalid origin argument throws — a programmer error, never tolerated');
    }
    console.log('✓ Section C: ReceivePublisherLeaderboardSnapshotClaimUseCase requires a verifier, and never throws for malformed or unverifiable input — INVALID_CLAIM/UNVERIFIABLE_CLAIM are explicit, non-throwing outcomes that leave history untouched');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: receiving into independent replica histories.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const aliceArchive = buildSharedArchive();
        const aliceClaim = signedClaimFor(alice, verifier, aliceArchive);
        const wirePayload = JSON.parse(JSON.stringify(exportPublisherLeaderboardSnapshotClaim(aliceClaim)));

        // Bob and Carol each receive the SAME wire payload, independently,
        // into their own, separate histories.
        const bobUseCase = new ReceivePublisherLeaderboardSnapshotClaimUseCase(verifier);
        const carolUseCase = new ReceivePublisherLeaderboardSnapshotClaimUseCase(verifier);

        const bobResult = bobUseCase.execute([], wirePayload);
        assert(bobResult.outcome === LeaderboardClaimReceiptOutcome.RECEIVED, '36. FLAGSHIP — Bob receives Alice\'s claim');
        assert(bobResult.record.claim.signerIdentityId === aliceClaim.signerIdentityId, '37. FLAGSHIP — the recorded claim genuinely names Alice as signer');
        assert(bobResult.record.origin === PublicationObservationArchiveProvenanceOrigin.IMPORTED, '38. FLAGSHIP — a received claim is recorded with imported provenance');

        const carolResult = carolUseCase.execute([], wirePayload);
        assert(carolResult.outcome === LeaderboardClaimReceiptOutcome.RECEIVED, '39. FLAGSHIP — Carol independently receives the identical claim, into her own history');
        assert(bobResult.history !== carolResult.history, '40. FLAGSHIP — Bob\'s and Carol\'s histories are independent arrays, never shared state');
        assert(bobResult.record !== carolResult.record, '41. FLAGSHIP — each replica\'s own record is its own instance');

        // Receiving the identical claim a second time (say, relayed
        // through a second peer) preserves multiplicity — never
        // deduplicated.
        const bobSecondReceipt = bobUseCase.execute(bobResult.history, wirePayload);
        assert(bobSecondReceipt.outcome === LeaderboardClaimReceiptOutcome.RECEIVED, '42. FLAGSHIP — receiving the identical claim a second time still succeeds');
        assert(bobSecondReceipt.history.length === 2, '43. FLAGSHIP — Bob\'s history now holds TWO records for the identical claim, never collapsed into one');
        assert(bobSecondReceipt.history[0] !== bobSecondReceipt.history[1], '44. FLAGSHIP — the two records are distinct instances, each with its own receivedAt');
    }
    console.log('✓ Section D: FLAGSHIP — independent replicas each receive a signed claim into their own, separate history; receiving the identical claim twice preserves multiplicity rather than deduplicating');

    // ---------------------------------------------------------------
    // Section E — a RECEIVED record is never a verdict.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const aliceArchive = buildSharedArchive();
        const aliceClaim = signedClaimFor(alice, verifier, aliceArchive);
        const wirePayload = JSON.parse(JSON.stringify(exportPublisherLeaderboardSnapshotClaim(aliceClaim)));

        // Bob's own evidence genuinely differs from Alice's.
        let bobArchive = buildSharedArchive();
        bobArchive = anchor(bobArchive, 'd', TXID_D);
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
        bobArchive = associationUseCase.execute(bobArchive, { publisherId: 'Eve', publicationIdentity: identityOf(bobArchive, 'd'), createdAt: CREATED_AT.mutation });

        const receiveUseCase = new ReceivePublisherLeaderboardSnapshotClaimUseCase(verifier);
        const receipt = receiveUseCase.execute([], wirePayload);
        assert(receipt.outcome === LeaderboardClaimReceiptOutcome.RECEIVED, '45. Bob successfully receives and records Alice\'s genuinely signed claim');

        // The receipt itself carries no opinion about whether the claim
        // agrees with Bob's own evidence — that remains 0.8.121's own,
        // separate, explicit question.
        const verification = verifyPublisherLeaderboardSnapshotClaim(bobArchive, receipt.record.claim.toJSON(), verifier);
        assert(verification.signatureValid === true, '46. signatureValid remains true — Alice really did sign exactly this claim');
        assert(verification.evidenceFingerprintMatches === false, '47. yet Bob\'s own evidence genuinely differs from what the claim asserts');
        assert(verification.matches === false, '48. a successfully RECEIVED record can still fail every semantic check — receiving a claim never makes it true relative to this replica\'s own evidence');

        // The record on file is untouched by that computation — recording
        // it a second time changes nothing about what was recorded, and
        // re-running verification twice never mutates the stored record.
        const verificationAgain = verifyPublisherLeaderboardSnapshotClaim(bobArchive, receipt.record.claim.toJSON(), verifier);
        assert(serialize(verificationAgain) === serialize(verification), '49. re-verifying the identical stored record is deterministic and leaves the record itself unaffected');
    }
    console.log('✓ Section E: a successfully RECEIVED record is a receipt, not a verdict — its claim can still fail 0.8.121\'s own, separate semantic verification against a replica\'s own, genuinely different evidence');

    // ---------------------------------------------------------------
    // Section F — PublisherLeaderboardClaimHistoryView: intentionally factual.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildSharedArchive();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);

        assert(describePublisherLeaderboardClaimHistoryEntry(null) === null, '50. describeXxxEntry(null) is null, never a throw');
        assert(describePublisherLeaderboardClaimHistoryEntry(claimA) === null, '51. describeXxxEntry() refuses a bare claim — a genuine LeaderboardClaimRecord is required');

        const receivedAt = new Date('2026-08-29T03:00:00Z');
        const recordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt, origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });
        const recordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T03:05:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });

        const entry = describePublisherLeaderboardClaimHistoryEntry(recordA);
        assert(entry.id === claimA.id, '52. entry.id is the claim\'s own id');
        assert(entry.signerIdentityId === claimA.signerIdentityId, '53. entry.signerIdentityId matches the claim');
        assert(entry.evidenceFingerprint === claimA.evidenceFingerprint, '54. entry.evidenceFingerprint matches the claim');
        assert(entry.policyVersion === claimA.policyVersion, '55. entry.policyVersion matches the claim');
        assert(entry.snapshotFingerprint === claimA.snapshotFingerprint, '56. entry.snapshotFingerprint matches the claim');
        assert(entry.createdAt.getTime() === claimA.createdAt.getTime(), '57. entry.createdAt matches the claim');
        assert(entry.receivedAt.getTime() === receivedAt.getTime(), '58. entry.receivedAt matches the record');
        assert(entry.origin === PublicationObservationArchiveProvenanceOrigin.IMPORTED, '59. entry.origin matches the record');

        let history = appendLeaderboardClaimHistoryEntry([], recordA);
        history = appendLeaderboardClaimHistoryEntry(history, recordB);
        const projection = describePublisherLeaderboardClaimHistory(history);
        assert(projection.claimCount === 2, '60. claimCount reflects every record on file');
        assert(projection.claims.length === 2 && projection.claims[0].id === claimA.id && projection.claims[1].id === claimB.id, '61. claims preserves the exact order history holds them, never sorted or ranked');

        const forbiddenVocabulary = ['trusted', 'valid', 'current', 'authoritative', 'verified', 'score', 'rank', 'matches', 'reputation', 'confidence', 'quality', 'worthiness', 'authority'];
        const projectionText = serialize(projection).toLowerCase();
        for (const word of forbiddenVocabulary) {
            assert(!projectionText.includes(word), `62. the view's own output never carries "${word}"`);
        }
        assert(describePublisherLeaderboardClaimHistory(null).claimCount === 0, '63. a malformed history projects to an honest empty result, never a throw');
    }
    console.log('✓ Section F: PublisherLeaderboardClaimHistoryView narrates every record faithfully, in order, and never introduces trusted/valid/current/authoritative/verified/score/rank/matches vocabulary');

    // ---------------------------------------------------------------
    // Section G — no archive touching; determinism; zero network access.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, archive);
        const wirePayload = exportPublisherLeaderboardSnapshotClaim(claim);
        const useCase = new ReceivePublisherLeaderboardSnapshotClaimUseCase(verifier);

        const preCallCount = archive.publisherPublicationAssociationRecordCount;
        const { result, networkCallOccurred } = await withoutNetworkAccess(() => useCase.execute([], wirePayload));
        assert(networkCallOccurred === false, '64. receiving a claim performs zero network access');
        assert(archive.publisherPublicationAssociationRecordCount === preCallCount, '65. the archive is untouched — the use case never even receives an archive reference');
        assert(result.outcome === LeaderboardClaimReceiptOutcome.RECEIVED, '66. sanity — the result itself is genuine');

        const firstProjection = describePublisherLeaderboardClaimHistory(result.history);
        const secondProjection = describePublisherLeaderboardClaimHistory(result.history);
        assert(serialize(firstProjection) === serialize(secondProjection), '67. repeated projection over the identical history is byte-identical');
    }
    console.log('✓ Section G: receiving a claim never touches any archive; projection is deterministic and zero network access is used');

    console.log('\nAll LeaderboardClaimHistory tests passed.');
}

run().catch((error) => {
    console.error('LeaderboardClaimHistory.test.js FAILED:', error);
    process.exitCode = 1;
});
