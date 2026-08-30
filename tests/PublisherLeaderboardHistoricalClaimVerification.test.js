import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { CreatePublisherLeaderboardSnapshotClaimUseCase } from '../application/CreatePublisherLeaderboardSnapshotClaimUseCase.js';
import { reconstructPublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import {
    describePublisherLeaderboardHistoricalClaimVerification,
    verifyPublisherLeaderboardHistoricalClaim
} from '../application/PublisherLeaderboardHistoricalClaimVerification.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.135 — Historical Signed Leaderboard Claim Verification.
//
// Section A: describePublisherLeaderboardHistoricalClaimVerification() —
//            malformed input tolerance, requires a genuine
//            LeaderboardClaimRecord, requires a genuine verifier, carries
//            receipt metadata + historical snapshot identity through
// Section B: FLAGSHIP — Snapshot A (evidence E1, policy P1), Claim C
//            signed over Snapshot A; verifying C against Snapshot A
//            matches on every applicable fact; the current archive later
//            becomes Snapshot B (evidence E2, identical policy P1);
//            verifying the SAME, UNMODIFIED claim against Snapshot B
//            still reports signatureValid true while
//            evidenceFingerprintMatches/snapshotFingerprintMatches flip
//            to false
// Section C: cryptographically invalid signature — the three semantic
//            facts stay independently computed
// Section D: verifyPublisherLeaderboardHistoricalClaim() is a byte-
//            identical alias of the describe function
// Section E: malformed/absent historical snapshot degrades to 0.8.119's
//            own empty snapshot, never throws; neither claimRecord nor
//            snapshot is ever mutated
// Section F: no reconstruction — no archive import, no clock, determinism,
//            no forbidden trust vocabulary, zero network access

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

// The identical shared-evidence fixture 0.8.116 through 0.8.134's own
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

function recordFor(claim, receivedAt = new Date('2026-08-29T04:00:00Z')) {
    return new LeaderboardClaimRecord({ claim, receivedAt });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — tolerance and shape.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, archive);
        const snapshotA = reconstructPublisherLeaderboardSnapshot(archive);

        for (const malformed of [null, undefined, 42, 'not a record', [], {}, claim, claim.toJSON()]) {
            assert(describePublisherLeaderboardHistoricalClaimVerification(malformed, snapshotA, verifier) === null, `1. describeXxx(${JSON.stringify(malformed) || String(malformed)}, ...) is null — a genuine LeaderboardClaimRecord is required, never a bare claim`);
        }

        const receivedAt = new Date('2026-08-29T04:30:00Z');
        const record = recordFor(claim, receivedAt);

        let threw = false;
        try { describePublisherLeaderboardHistoricalClaimVerification(record, snapshotA, null); } catch { threw = true; }
        assert(threw, '2. requires a genuine verifier — delegates that requirement to 0.8.121, never silently tolerates a missing one');

        const projection = describePublisherLeaderboardHistoricalClaimVerification(record, snapshotA, verifier);
        assert(projection.signerIdentityId === claim.signerIdentityId, '3. signerIdentityId is carried through from the claim, unchanged');
        assert(projection.claimCreatedAt.getTime() === claim.createdAt.getTime(), '4. claimCreatedAt is carried through from the claim, unchanged');
        assert(projection.receivedAt.getTime() === receivedAt.getTime(), '5. receivedAt is carried through from the record, unchanged');
        assert(projection.historicalEvidenceFingerprint === snapshotA.evidenceFingerprint, '6. historicalEvidenceFingerprint echoes the SUPPLIED historical snapshot\'s own identity');
        assert(projection.historicalPolicyVersion === snapshotA.policy.version, '7. historicalPolicyVersion likewise echoes the supplied snapshot');
        assert(typeof projection.historicalSnapshotFingerprint === 'string' && projection.historicalSnapshotFingerprint.length === 64, '8. historicalSnapshotFingerprint is a genuine 64-char digest of the supplied historical snapshot');
        assert(Object.isFrozen(projection), '9. the projection is frozen');
        assert(record.claim === claim, '10. sanity — describing a verification never touches, copies, or replaces the record\'s own claim instance');
    }
    console.log('✓ Section A: describePublisherLeaderboardHistoricalClaimVerification() requires a genuine LeaderboardClaimRecord and a genuine verifier, and carries receipt metadata + the supplied historical snapshot\'s own identity through unchanged');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP.
    //
    //   Snapshot A: evidence E1, policy P1, leaderboard L1
    //   Claim C:    signed over Snapshot A
    //   Snapshot B: evidence E2, policy P1 (unchanged), leaderboard L2
    //
    //   verify(C, Snapshot A) → everything matches
    //   verify(C, Snapshot B) → signatureValid true, but
    //                           evidenceFingerprintMatches/
    //                           snapshotFingerprintMatches false
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');

        // Snapshot A: evidence E1.
        const archiveA = buildSharedArchive();
        const snapshotA = reconstructPublisherLeaderboardSnapshot(archiveA);

        // Claim C: signed over Snapshot A, then stored as a durable receipt.
        const claimC = signedClaimFor(alice, verifier, archiveA);
        const record = recordFor(claimC);
        const genuineRecordJson = serialize(record.toJSON());

        // Verify C against Snapshot A: the snapshot it was actually signed over.
        const againstA = describePublisherLeaderboardHistoricalClaimVerification(record, snapshotA, verifier);
        assert(againstA.signatureValid === true, '11. FLAGSHIP — Alice genuinely signed exactly this claim');
        assert(againstA.evidenceFingerprintMatches === true, '12. FLAGSHIP — Snapshot A is the exact snapshot the claim was signed over');
        assert(againstA.policyVersionMatches === true, '13. FLAGSHIP — the policy version matches Snapshot A');
        assert(againstA.snapshotFingerprintMatches === true, '14. FLAGSHIP — the snapshot fingerprint matches Snapshot A');
        assert(againstA.matches === true, '15. FLAGSHIP — every applicable fact matches against Snapshot A');

        // The current archive evolves: new evidence arrives (E2), but the
        // SAME ranking policy is used, so policy P1 is unchanged.
        let archiveB = archiveA;
        archiveB = anchor(archiveB, 'd', TXID_D);
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
        archiveB = associationUseCase.execute(archiveB, { publisherId: 'Eve', publicationIdentity: identityOf(archiveB, 'd'), createdAt: CREATED_AT.mutation });
        const snapshotB = reconstructPublisherLeaderboardSnapshot(archiveB);

        assert(snapshotB.evidenceFingerprint !== snapshotA.evidenceFingerprint, '16. sanity — Snapshot B genuinely carries different evidence than Snapshot A');
        assert(snapshotB.policy.version === snapshotA.policy.version, '17. sanity — Snapshot B carries the identical ranking policy version as Snapshot A');
        assert(serialize(snapshotB.leaderboard) !== serialize(snapshotA.leaderboard), '18. sanity — Snapshot B\'s leaderboard genuinely differs from Snapshot A\'s');

        // The stored claim record is completely untouched by any of this.
        assert(serialize(record.toJSON()) === genuineRecordJson, '19. FLAGSHIP — the stored claim record is completely untouched by the archive\'s later evolution');

        // Verify the SAME, UNMODIFIED claim C against Snapshot B.
        const againstB = describePublisherLeaderboardHistoricalClaimVerification(record, snapshotB, verifier);
        assert(againstB.signatureValid === true, '20. FLAGSHIP — the signature remains perfectly genuine: the claim itself was never altered');
        assert(againstB.evidenceFingerprintMatches === false, '21. FLAGSHIP — but Snapshot B\'s evidence genuinely differs from what the claim asserts');
        assert(againstB.snapshotFingerprintMatches === false, '22. FLAGSHIP — and Snapshot B\'s composite snapshot fingerprint differs too');
        assert(againstB.policyVersionMatches === true, '23. FLAGSHIP — the policy version is unaffected: Snapshot B used the identical ranking policy');
        assert(againstB.matches === false, '24. FLAGSHIP — matches flips to false: only the RELATIONSHIP between the claim and the supplied snapshot changed, never the claim\'s own cryptographic validity');

        // Cryptographic validity is intrinsic to the claim; semantic
        // agreement is relational to the snapshot supplied.
        assert(againstA.signatureValid === againstB.signatureValid, '25. FLAGSHIP — signatureValid is IDENTICAL across both calls: it is a fact about the claim alone, never about which snapshot it is checked against');
        assert(againstA.matches !== againstB.matches, '26. FLAGSHIP — matches genuinely differs across the two calls: semantic agreement is relational to the supplied snapshot');

        // The historical snapshot identity fields echo whichever snapshot
        // was actually supplied to that particular call.
        assert(againstA.historicalEvidenceFingerprint === snapshotA.evidenceFingerprint && againstA.historicalEvidenceFingerprint !== snapshotB.evidenceFingerprint, '27. FLAGSHIP — historicalEvidenceFingerprint reports Snapshot A\'s own identity when Snapshot A was supplied');
        assert(againstB.historicalEvidenceFingerprint === snapshotB.evidenceFingerprint && againstB.historicalEvidenceFingerprint !== snapshotA.evidenceFingerprint, '28. FLAGSHIP — historicalEvidenceFingerprint reports Snapshot B\'s own identity when Snapshot B was supplied');

        // Receipt metadata is identical across both calls — only the
        // relationship to the supplied snapshot changed.
        assert(againstA.signerIdentityId === againstB.signerIdentityId && againstA.claimCreatedAt.getTime() === againstB.claimCreatedAt.getTime() && againstA.receivedAt.getTime() === againstB.receivedAt.getTime(), '29. FLAGSHIP — the claim\'s own receipt metadata is identical across both calls');
    }
    console.log('✓ Section B: FLAGSHIP — the identical, unmodified claim is checked against two different historical snapshots; signatureValid stays true both times (intrinsic to the claim) while evidenceFingerprintMatches/snapshotFingerprintMatches/matches flip to false against the later snapshot (relational to the snapshot supplied)');

    // ---------------------------------------------------------------
    // Section C — cryptographically invalid signature; facts stay independent.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, archive);
        const genuineJson = claim.toJSON();

        const tamperedJson = { ...genuineJson, signature: { ...genuineJson.signature, signature: genuineJson.signature.signature.split('').reverse().join('') } };
        const tamperedClaim = PublisherLeaderboardSnapshotClaim.fromJSON(tamperedJson);
        const record = recordFor(tamperedClaim);
        const snapshotA = reconstructPublisherLeaderboardSnapshot(archive);

        const projection = describePublisherLeaderboardHistoricalClaimVerification(record, snapshotA, verifier);
        assert(projection.signatureValid === false, '30. corrupted signature bytes are cryptographically invalid');
        assert(projection.evidenceFingerprintMatches === true, '31. the three semantic facts are still computed independently — never implicitly forced false by signatureValid');
        assert(projection.policyVersionMatches === true, '32. policyVersionMatches likewise still independently true');
        assert(projection.snapshotFingerprintMatches === true, '33. snapshotFingerprintMatches likewise still independently true');
        assert(projection.matches === false, '34. matches is false overall — signatureValid alone already fails it — but every other fact remains independently on record');
    }
    console.log('✓ Section C: a cryptographically invalid signature never implicitly determines the three semantic comparison facts against a supplied historical snapshot');

    // ---------------------------------------------------------------
    // Section D — verifyPublisherLeaderboardHistoricalClaim() is a byte-identical alias.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = recordFor(claim);
        const snapshotA = reconstructPublisherLeaderboardSnapshot(archive);

        const viaDescribe = describePublisherLeaderboardHistoricalClaimVerification(record, snapshotA, verifier);
        const viaVerify = verifyPublisherLeaderboardHistoricalClaim(record, snapshotA, verifier);
        assert(serialize(viaDescribe) === serialize(viaVerify), '35. verifyPublisherLeaderboardHistoricalClaim() produces a byte-identical result to describePublisherLeaderboardHistoricalClaimVerification() — it adds no computation of its own');

        assert(verifyPublisherLeaderboardHistoricalClaim(null, snapshotA, verifier) === null, '36. the alias carries the identical malformed-record tolerance');
    }
    console.log('✓ Section D: verifyPublisherLeaderboardHistoricalClaim() is a deliberately thin, byte-identical alias of the pure projection');

    // ---------------------------------------------------------------
    // Section E — malformed/absent snapshot tolerance; no mutation.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = recordFor(claim);

        const emptySnapshot = reconstructPublisherLeaderboardSnapshot(PublicationObservationArchive.empty());
        for (const malformedSnapshot of [null, undefined, {}, 'not a snapshot', 42, []]) {
            const result = describePublisherLeaderboardHistoricalClaimVerification(record, malformedSnapshot, verifier);
            const expected = describePublisherLeaderboardHistoricalClaimVerification(record, emptySnapshot, verifier);
            assert(serialize(result) === serialize(expected), `37. a malformed historical snapshot (${JSON.stringify(malformedSnapshot)}) degrades to 0.8.119's own well-defined empty snapshot, never throwing`);
        }

        const recordJsonBefore = serialize(record.toJSON());
        const snapshotA = reconstructPublisherLeaderboardSnapshot(archive);
        const snapshotJsonBefore = serialize(snapshotA);
        describePublisherLeaderboardHistoricalClaimVerification(record, snapshotA, verifier);
        assert(serialize(record.toJSON()) === recordJsonBefore, '38. the claim record is never mutated by verification');
        assert(serialize(snapshotA) === snapshotJsonBefore, '39. the supplied historical snapshot is never mutated by verification');
        assert(Object.isFrozen(record), '40. the record remains frozen');
    }
    console.log('✓ Section E: a malformed/absent historical snapshot degrades to 0.8.119\'s own empty snapshot, never throwing, and neither the claim record nor the supplied snapshot is ever mutated');

    // ---------------------------------------------------------------
    // Section F — no reconstruction, determinism, vocabulary, network access.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardHistoricalClaimVerification.js', import.meta.url), 'utf8');
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(!importLines.some((line) => line.includes('PublicationObservationArchive')), '41. this file never imports PublicationObservationArchive — no archive-reading entry point exists anywhere in it, the critical rule this milestone exists to enforce');
        assert(!importLines.some((line) => line.includes('reconstructPublisherLeaderboardSnapshot')), '42. this file never imports reconstructPublisherLeaderboardSnapshot() — it never reconstructs a snapshot from an archive, historical or otherwise');

        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = recordFor(claim);
        const snapshotA = reconstructPublisherLeaderboardSnapshot(archive);

        const first = describePublisherLeaderboardHistoricalClaimVerification(record, snapshotA, verifier);
        const second = describePublisherLeaderboardHistoricalClaimVerification(record, snapshotA, verifier);
        assert(serialize(first) === serialize(second), '43. repeated calls with identical input are byte-identical — nothing is cached, memoized, or persisted as a side effect');

        const forbiddenVocabulary = ['trusted', 'current', 'authoritative', 'verified', 'score', 'rank', 'reputation', 'confidence', 'quality', 'worthiness', 'authority'];
        const projectionText = serialize(first).toLowerCase();
        for (const word of forbiddenVocabulary) {
            assert(!projectionText.includes(word), `44. the projection's own output never carries "${word}" — only 0.8.119/0.8.121/0.8.124's own reused vocabulary appears`);
        }

        const { result, networkCallOccurred } = await withoutNetworkAccess(() => describePublisherLeaderboardHistoricalClaimVerification(record, snapshotA, verifier));
        assert(networkCallOccurred === false, '45. verifying a claim record against a historical snapshot performs zero network access');
        assert(result.matches === true, '46. sanity — the result itself is genuine');
    }
    console.log('✓ Section F: no archive-reading entry point exists anywhere in this file, verification is deterministic, uses only reused vocabulary, and performs zero network access');

    console.log('\nAll PublisherLeaderboardHistoricalClaimVerification tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardHistoricalClaimVerification.test.js FAILED:', error);
    process.exitCode = 1;
});
