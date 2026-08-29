import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { CreatePublisherLeaderboardSnapshotClaimUseCase } from '../application/CreatePublisherLeaderboardSnapshotClaimUseCase.js';
import { reconstructPublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { appendLeaderboardClaimHistoryEntry } from '../application/LeaderboardClaimHistory.js';
import { describePublisherLeaderboardClaimVerification } from '../application/PublisherLeaderboardClaimVerificationView.js';
import {
    describePublisherLeaderboardClaimVerificationHistory,
    reconstructPublisherLeaderboardClaimVerificationHistory
} from '../application/PublisherLeaderboardClaimVerificationHistoryView.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.125 — Claim Verification History Projection.
//
// Section A: describePublisherLeaderboardClaimVerificationHistory() —
//            malformed input tolerance, shape, order preservation
// Section B: FLAGSHIP — one local snapshot evaluated against three
//            historical claims from three different signers, then the
//            identical, unmodified history re-evaluated after this
//            replica's own evidence changes
// Section C: history multiplicity is preserved — the same signed claim
//            received three times projects to three verification entries,
//            never deduplicated
// Section D: reconstructPublisherLeaderboardClaimVerificationHistory() —
//            the archive-reading convenience boundary, one shared
//            snapshot reconstruction
// Section E: no persistence, determinism, no forbidden trust vocabulary,
//            zero network access

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
    eve: new Date('2026-08-29T00:30:00Z')
};

function anchor(archive, letter, txid) {
    const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
    return useCase.execute(archive, { anchorId: `pub-${letter}`, contentHash: `pub-${letter}-content`, txid, network: NETWORK, createdAt: CREATED_AT[letter] });
}

function identityOf(archive, letter) {
    return archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === `pub-${letter}`).toBlockchainPublicationIdentity();
}

// The identical shared-evidence fixture 0.8.116 through 0.8.124's own
// flagships already established — "E1/P1/S1" in the milestone's own
// framing.
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

// "E2/P1/S2" — genuinely different evidence: one extra anchored
// publication, associated to a signer neither E1 archive ever knew about.
function extendWithNewEvidence(archive) {
    let extended = anchor(archive, 'd', TXID_D);
    const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
    extended = associationUseCase.execute(extended, { publisherId: 'Eve', publicationIdentity: identityOf(extended, 'd'), createdAt: CREATED_AT.eve });
    return extended;
}

function serialize(value) {
    return JSON.stringify(value);
}

function signedClaimFor(identityProvider, verifier, archive) {
    return new CreatePublisherLeaderboardSnapshotClaimUseCase(identityProvider, verifier).execute(archive);
}

function recordFor(claim, receivedAt) {
    return new LeaderboardClaimRecord({ claim, receivedAt });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — describePublisherLeaderboardClaimVerificationHistory(): tolerance and shape.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildSharedArchive();
        const localSnapshot = reconstructPublisherLeaderboardSnapshot(archive);

        for (const malformed of [null, undefined, 42, 'not a history', {}]) {
            const result = describePublisherLeaderboardClaimVerificationHistory(malformed, localSnapshot, verifier);
            assert(result.claimCount === 0, `1. describeXxx(${JSON.stringify(malformed) || String(malformed)}, ...) degrades to claimCount 0 — never throws`);
            assert(result.verifications.length === 0, '2. and an empty verifications array');
        }

        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);
        const recordA = recordFor(claimA, new Date('2026-08-29T04:00:00Z'));
        const recordB = recordFor(claimB, new Date('2026-08-29T04:01:00Z'));

        // A malformed entry mixed into an otherwise genuine list is
        // silently skipped, never aborting the whole projection.
        const mixed = [recordA, null, 'not a record', recordB, 42];
        const mixedResult = describePublisherLeaderboardClaimVerificationHistory(mixed, localSnapshot, verifier);
        assert(mixedResult.claimCount === 2, '3. a malformed entry inside an otherwise genuine array is skipped, never counted');
        assert(mixedResult.verifications[0].signerIdentityId === claimA.signerIdentityId, '4. the surviving entries keep their original relative order — Alice first');
        assert(mixedResult.verifications[1].signerIdentityId === claimB.signerIdentityId, '5. — Bob second, exactly as they appear in the source array');

        const genuine = describePublisherLeaderboardClaimVerificationHistory([recordA, recordB], localSnapshot, verifier);
        assert(genuine.claimCount === 2, '6. claimCount matches the number of genuine records');
        assert(Object.isFrozen(genuine), '7. the result is frozen');
        assert(Object.isFrozen(genuine.verifications), '8. the verifications array is frozen');
        assert(Object.isFrozen(genuine.verifications[0]), '9. every individual entry is frozen — 0.8.124\'s own guarantee, unchanged');

        const viaDescribeAlone = describePublisherLeaderboardClaimVerification(recordA, localSnapshot, verifier);
        assert(serialize(genuine.verifications[0]) === serialize(viaDescribeAlone), '10. each entry is byte-identical to 0.8.124\'s own describePublisherLeaderboardClaimVerification() for that record — a projection of a projection, never a parallel computation');
    }
    console.log('✓ Section A: describePublisherLeaderboardClaimVerificationHistory() tolerates a malformed history/entries, preserves order, and reuses 0.8.124\'s own per-record projection byte for byte');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: one local snapshot, three historical claims, then new local evidence.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');

        // E1/P1/S1 — the evidence Alice and Bob both sign against.
        const archiveE1 = buildSharedArchive();
        // E2/P1/S2 — Carol's own, genuinely different evidence.
        const archiveE2 = extendWithNewEvidence(buildSharedArchive());

        const claimA = signedClaimFor(alice, verifier, archiveE1);
        const claimB = signedClaimFor(bob, verifier, archiveE1);
        const claimC = signedClaimFor(carol, verifier, archiveE2);

        const recordA = recordFor(claimA, new Date('2026-08-29T05:00:00Z'));
        const recordB = recordFor(claimB, new Date('2026-08-29T05:01:00Z'));
        const recordC = recordFor(claimC, new Date('2026-08-29T05:02:00Z'));

        let claimHistory = [];
        claimHistory = appendLeaderboardClaimHistoryEntry(claimHistory, recordA);
        claimHistory = appendLeaderboardClaimHistoryEntry(claimHistory, recordB);
        claimHistory = appendLeaderboardClaimHistoryEntry(claimHistory, recordC);
        const historyJsonBefore = serialize(claimHistory.map((r) => r.toJSON()));

        // This replica currently represents E1/P1/S1 — identical to what
        // Alice and Bob signed, genuinely different from what Carol signed.
        let localArchive = archiveE1;

        const before = reconstructPublisherLeaderboardClaimVerificationHistory(claimHistory, localArchive, verifier);
        assert(before.claimCount === 3, '11. FLAGSHIP — all three historical claims are projected, one entry each');

        const [aliceBefore, bobBefore, carolBefore] = before.verifications;
        assert(aliceBefore.signerIdentityId === claimA.signerIdentityId && aliceBefore.signatureValid === true && aliceBefore.matches === true, '12. FLAGSHIP — Alice: signature valid and matches this replica\'s current E1 evidence');
        assert(bobBefore.signerIdentityId === claimB.signerIdentityId && bobBefore.signatureValid === true && bobBefore.matches === true, '13. FLAGSHIP — Bob: signature valid and matches this replica\'s current E1 evidence');
        assert(carolBefore.signerIdentityId === claimC.signerIdentityId && carolBefore.signatureValid === true && carolBefore.matches === false, '14. FLAGSHIP — Carol: signature valid, but her E2 evidence genuinely differs from this replica\'s current E1 evidence — never fraud by itself');

        // New local evidence arrives at THIS replica — without touching
        // any stored claim in any way. It happens to land on exactly the
        // evidence Carol independently signed against.
        localArchive = extendWithNewEvidence(archiveE1);

        assert(serialize(claimHistory.map((r) => r.toJSON())) === historyJsonBefore, '15. FLAGSHIP — the stored claim history is completely untouched by this replica\'s own new evidence');

        const after = reconstructPublisherLeaderboardClaimVerificationHistory(claimHistory, localArchive, verifier);
        const [aliceAfter, bobAfter, carolAfter] = after.verifications;

        assert(aliceAfter.signatureValid === true && aliceAfter.matches === false, '16. FLAGSHIP — Alice: signature still valid, but no longer matches — this replica\'s own evidence moved, her stored claim did not');
        assert(bobAfter.signatureValid === true && bobAfter.matches === false, '17. FLAGSHIP — Bob: identically, signature still valid, no longer matches');
        assert(carolAfter.signatureValid === true && carolAfter.matches === true, '18. FLAGSHIP — Carol: her unmodified claim now matches, because this replica\'s own evidence moved to agree with what she signed all along');

        assert(aliceBefore.receivedAt.getTime() === aliceAfter.receivedAt.getTime() && aliceBefore.claimCreatedAt.getTime() === aliceAfter.claimCreatedAt.getTime(), '19. FLAGSHIP — receipt metadata for every entry is identical before and after, exactly as it must be for an unmodified history');
    }
    console.log('✓ Section B: FLAGSHIP — one local snapshot evaluated against three historical claims from three signers; after this replica\'s own evidence changes, the identical unmodified history projects genuinely different verification facts');

    // ---------------------------------------------------------------
    // Section C — history multiplicity is preserved, never deduplicated.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, archive);

        // The identical signed claim, received three times.
        const receipt1 = recordFor(claim, new Date('2026-08-29T06:00:00Z'));
        const receipt2 = recordFor(claim, new Date('2026-08-29T06:05:00Z'));
        const receipt3 = recordFor(claim, new Date('2026-08-29T06:10:00Z'));

        let claimHistory = [];
        claimHistory = appendLeaderboardClaimHistoryEntry(claimHistory, receipt1);
        claimHistory = appendLeaderboardClaimHistoryEntry(claimHistory, receipt2);
        claimHistory = appendLeaderboardClaimHistoryEntry(claimHistory, receipt3);

        const result = reconstructPublisherLeaderboardClaimVerificationHistory(claimHistory, archive, verifier);
        assert(result.claimCount === 3, '20. the same signed claim received three times projects to THREE verification entries — claim identity ≠ receipt identity, never deduplicated');
        assert(result.verifications.every((v) => v.signerIdentityId === claim.signerIdentityId && v.matches === true), '21. every one of the three entries independently agrees on the underlying facts');
        assert(result.verifications[0].receivedAt.getTime() < result.verifications[1].receivedAt.getTime() && result.verifications[1].receivedAt.getTime() < result.verifications[2].receivedAt.getTime(), '22. the three entries are distinguishable by, and preserve, their own distinct receivedAt — three genuine receipts, never collapsed into one');
    }
    console.log('✓ Section C: the same signed claim received three times projects to three independent verification entries, exactly preserving claim/receipt multiplicity');

    // ---------------------------------------------------------------
    // Section D — reconstructPublisherLeaderboardClaimVerificationHistory(): the archive-reading boundary.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildSharedArchive();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);
        const recordA = recordFor(claimA, new Date('2026-08-29T07:00:00Z'));
        const recordB = recordFor(claimB, new Date('2026-08-29T07:01:00Z'));

        let claimHistory = [];
        claimHistory = appendLeaderboardClaimHistoryEntry(claimHistory, recordA);
        claimHistory = appendLeaderboardClaimHistoryEntry(claimHistory, recordB);

        const viaReconstruct = reconstructPublisherLeaderboardClaimVerificationHistory(claimHistory, archive, verifier);
        const localSnapshot = reconstructPublisherLeaderboardSnapshot(archive);
        const viaDescribe = describePublisherLeaderboardClaimVerificationHistory(claimHistory, localSnapshot, verifier);
        assert(serialize(viaReconstruct) === serialize(viaDescribe), '23. reconstructXxx() is exactly describeXxx() composed with a single call to 0.8.119\'s own reconstructPublisherLeaderboardSnapshot() — no parallel computation of its own');

        // The ONE-reconstruction discipline: describeXxx(), given the
        // identical pre-reconstructed snapshot, must agree with every
        // per-claim call made against that SAME instance — proving no
        // entry in the collection was silently evaluated against a
        // re-read, possibly different, snapshot.
        for (const entry of viaDescribe.verifications) {
            const record = entry.signerIdentityId === claimA.signerIdentityId ? recordA : recordB;
            const perClaim = describePublisherLeaderboardClaimVerification(record, localSnapshot, verifier);
            assert(serialize(entry) === serialize(perClaim), '24. every entry equals a direct per-record call against the identical shared localSnapshot instance');
        }

        for (const malformedArchive of [null, undefined, {}, 'not an archive', 42]) {
            const result = reconstructPublisherLeaderboardClaimVerificationHistory(claimHistory, malformedArchive, verifier);
            const expected = describePublisherLeaderboardClaimVerificationHistory(claimHistory, reconstructPublisherLeaderboardSnapshot(PublicationObservationArchive.empty()), verifier);
            assert(serialize(result) === serialize(expected), `25. a malformed archive (${JSON.stringify(malformedArchive)}) degrades to PublicationObservationArchive.empty() — the identical tolerance every other reconstructXxx()/verifyXxx() entry point in this family already holds`);
        }

        const emptyResult = reconstructPublisherLeaderboardClaimVerificationHistory(null, archive, verifier);
        assert(emptyResult.claimCount === 0 && emptyResult.verifications.length === 0, '26. a malformed history still projects to an empty, well-shaped result through the archive-reading entry point');
    }
    console.log('✓ Section D: reconstructPublisherLeaderboardClaimVerificationHistory() reconstructs the local snapshot once and projects every claim against that identical instance, tolerating a malformed archive/history exactly like every other reconstructXxx() in this family');

    // ---------------------------------------------------------------
    // Section E — no persistence, determinism, vocabulary, and network access.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildSharedArchive();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);
        const recordA = recordFor(claimA, new Date('2026-08-29T08:00:00Z'));
        const recordB = recordFor(claimB, new Date('2026-08-29T08:01:00Z'));

        let claimHistory = [];
        claimHistory = appendLeaderboardClaimHistoryEntry(claimHistory, recordA);
        claimHistory = appendLeaderboardClaimHistoryEntry(claimHistory, recordB);
        const beforeHistoryJson = serialize(claimHistory.map((r) => r.toJSON()));

        const localSnapshot = reconstructPublisherLeaderboardSnapshot(archive);
        const first = describePublisherLeaderboardClaimVerificationHistory(claimHistory, localSnapshot, verifier);
        const second = describePublisherLeaderboardClaimVerificationHistory(claimHistory, localSnapshot, verifier);
        assert(serialize(first) === serialize(second), '27. repeated calls with identical input are byte-identical — nothing is cached, memoized, or persisted as a side effect');
        assert(serialize(claimHistory.map((r) => r.toJSON())) === beforeHistoryJson, '28. the claim history itself is completely untouched by having been projected — verification is never written back onto it');
        for (const record of claimHistory) {
            assert(Object.isFrozen(record), '29. every record in the history remains frozen — this file never gains, and never needs, a way to mutate one');
        }

        const forbiddenVocabulary = ['trusted', 'current', 'authoritative', 'verified', 'score', 'rank', 'reputation', 'confidence', 'quality', 'worthiness', 'authority', 'verificationstatus'];
        const projectionText = serialize(first).toLowerCase();
        for (const word of forbiddenVocabulary) {
            assert(!projectionText.includes(word), `30. the projection's own output never carries "${word}" — only 0.8.120/0.8.121's own reused five-boolean vocabulary appears, never a collapsed status field`);
        }

        const { result, networkCallOccurred } = await withoutNetworkAccess(() => reconstructPublisherLeaderboardClaimVerificationHistory(claimHistory, archive, verifier));
        assert(networkCallOccurred === false, '31. projecting a claim verification history performs zero network access');
        assert(result.claimCount === 2 && result.verifications.every((v) => v.matches === true), '32. sanity — the result itself is genuine');
    }
    console.log('✓ Section E: verification history projection is deterministic, never persisted onto the history or its records, uses only the reused five-boolean vocabulary, and performs zero network access');

    console.log('\nAll PublisherLeaderboardClaimVerificationHistoryView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimVerificationHistoryView.test.js FAILED:', error);
    process.exitCode = 1;
});
