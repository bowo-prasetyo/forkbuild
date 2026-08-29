import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { CreatePublisherLeaderboardSnapshotClaimUseCase } from '../application/CreatePublisherLeaderboardSnapshotClaimUseCase.js';
import { exportPublisherLeaderboardSnapshotClaim } from '../application/PublisherLeaderboardSnapshotClaimExchange.js';
import { ReceivePublisherLeaderboardSnapshotClaimUseCase } from '../application/ReceivePublisherLeaderboardSnapshotClaimUseCase.js';
import { reconstructPublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import {
    describePublisherLeaderboardClaimVerification,
    reconstructPublisherLeaderboardClaimVerification
} from '../application/PublisherLeaderboardClaimVerificationView.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.124 — Claim Verification Projection.
//
// Section A: describePublisherLeaderboardClaimVerification() — malformed
//            input tolerance, requires a genuine LeaderboardClaimRecord,
//            requires a genuine verifier, carries receipt metadata through
//            unchanged
// Section B: Situation 1 — signed and matching
// Section C: Situation 2 — signed but different from this replica (never
//            fraud by itself)
// Section D: Situation 3 — cryptographically invalid signature; the three
//            semantic facts are still computed independently
// Section E: FLAGSHIP — Alice and Bob share evidence at signing time; Bob
//            imports and stores the claim; verification matches; new
//            evidence arrives at Bob without touching Alice's claim;
//            verification no longer matches
// Section F: reconstructPublisherLeaderboardClaimVerification() — the
//            archive-reading convenience boundary
// Section G: no persistence, determinism, no forbidden trust vocabulary,
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
    mutation: new Date('2026-08-29T00:30:00Z')
};

function anchor(archive, letter, txid) {
    const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
    return useCase.execute(archive, { anchorId: `pub-${letter}`, contentHash: `pub-${letter}-content`, txid, network: NETWORK, createdAt: CREATED_AT[letter] });
}

function identityOf(archive, letter) {
    return archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === `pub-${letter}`).toBlockchainPublicationIdentity();
}

// The identical shared-evidence fixture 0.8.116 through 0.8.123's own
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
    // Section A — describePublisherLeaderboardClaimVerification(): tolerance and shape.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, archive);
        const localSnapshot = reconstructPublisherLeaderboardSnapshot(archive);

        for (const malformed of [null, undefined, 42, 'not a record', [], {}, claim, claim.toJSON()]) {
            assert(describePublisherLeaderboardClaimVerification(malformed, localSnapshot, verifier) === null, `1. describeXxx(${JSON.stringify(malformed) || String(malformed)}, ...) is null — a genuine LeaderboardClaimRecord is required, never a bare claim`);
        }

        const receivedAt = new Date('2026-08-29T04:30:00Z');
        const record = recordFor(claim, receivedAt);

        let threw = false;
        try { describePublisherLeaderboardClaimVerification(record, localSnapshot, null); } catch { threw = true; }
        assert(threw, '2. requires a genuine verifier — delegates that requirement to 0.8.121, never silently tolerates a missing one');

        const projection = describePublisherLeaderboardClaimVerification(record, localSnapshot, verifier);
        assert(projection.signerIdentityId === claim.signerIdentityId, '3. signerIdentityId is carried through from the claim, unchanged');
        assert(projection.claimCreatedAt.getTime() === claim.createdAt.getTime(), '4. claimCreatedAt is carried through from the claim, unchanged');
        assert(projection.receivedAt.getTime() === receivedAt.getTime(), '5. receivedAt is carried through from the record, unchanged — never the claim\'s own createdAt');
        assert(Object.isFrozen(projection), '6. the projection is frozen');

        assert(record.claim === claim, '7. sanity — describing a verification never touches, copies, or replaces the record\'s own claim instance');
    }
    console.log('✓ Section A: describePublisherLeaderboardClaimVerification() requires a genuine LeaderboardClaimRecord and a genuine verifier, and carries signerIdentityId/claimCreatedAt/receivedAt through unchanged');

    // ---------------------------------------------------------------
    // Section B — Situation 1: signed and matching.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = recordFor(claim);
        const localSnapshot = reconstructPublisherLeaderboardSnapshot(archive);

        const projection = describePublisherLeaderboardClaimVerification(record, localSnapshot, verifier);
        assert(projection.signatureValid === true, '8. Situation 1 — the signature is genuine');
        assert(projection.evidenceFingerprintMatches === true, '9. Situation 1 — this replica reconstructs the identical evidence fingerprint');
        assert(projection.policyVersionMatches === true, '10. Situation 1 — this replica reconstructs the identical policy version');
        assert(projection.snapshotFingerprintMatches === true, '11. Situation 1 — this replica reconstructs the identical snapshot fingerprint');
        assert(projection.matches === true, '12. Situation 1 — matches summarizes all four as true: the signer signed the snapshot, and this replica independently reconstructs the same one');
    }
    console.log('✓ Section B: Situation 1 — signed and matching, every comparison fact true');

    // ---------------------------------------------------------------
    // Section C — Situation 2: signed but different from this replica.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const aliceArchive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, aliceArchive);
        const record = recordFor(claim);

        // Bob's own evidence genuinely differs — one extra publication and
        // association Alice's evidence never had. Nobody forged anything.
        let bobArchive = buildSharedArchive();
        bobArchive = anchor(bobArchive, 'd', TXID_D);
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
        bobArchive = associationUseCase.execute(bobArchive, { publisherId: 'Eve', publicationIdentity: identityOf(bobArchive, 'd'), createdAt: CREATED_AT.mutation });
        const bobSnapshot = reconstructPublisherLeaderboardSnapshot(bobArchive);

        const projection = describePublisherLeaderboardClaimVerification(record, bobSnapshot, verifier);
        assert(projection.signatureValid === true, '13. Situation 2 — Alice genuinely signed exactly this claim; the claim is not fraudulent');
        assert(projection.evidenceFingerprintMatches === false, '14. Situation 2 — but Bob\'s own evidence genuinely differs from what the claim asserts');
        assert(projection.snapshotFingerprintMatches === false, '15. Situation 2 — and Bob\'s own snapshot fingerprint differs too');
        assert(projection.policyVersionMatches === true, '16. Situation 2 — the ranking policy version itself is unaffected by an evidence difference');
        assert(projection.matches === false, '17. Situation 2 — matches is false overall: a genuinely signed claim can still disagree with this replica\'s own evidence, which is not by itself evidence of fraud');
    }
    console.log('✓ Section C: Situation 2 — a genuinely signed claim can disagree with this replica\'s own evidence without either replica having done anything wrong');

    // ---------------------------------------------------------------
    // Section D — Situation 3: cryptographically invalid; facts stay independent.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, archive);
        const genuineJson = claim.toJSON();

        // Corrupt only the raw signature bytes — every asserted field
        // (evidenceFingerprint, policyVersion, snapshotFingerprint) is left
        // completely untouched.
        const tamperedJson = { ...genuineJson, signature: { ...genuineJson.signature, signature: genuineJson.signature.signature.split('').reverse().join('') } };
        const tamperedClaim = PublisherLeaderboardSnapshotClaim.fromJSON(tamperedJson);
        const record = recordFor(tamperedClaim);
        const localSnapshot = reconstructPublisherLeaderboardSnapshot(archive);

        const projection = describePublisherLeaderboardClaimVerification(record, localSnapshot, verifier);
        assert(projection.signatureValid === false, '18. Situation 3 — the corrupted signature bytes are cryptographically invalid');
        assert(projection.evidenceFingerprintMatches === true, '19. Situation 3 — the three semantic facts are computed independently: evidenceFingerprintMatches is still true, never implicitly forced false by signatureValid');
        assert(projection.policyVersionMatches === true, '20. Situation 3 — policyVersionMatches is likewise still independently true');
        assert(projection.snapshotFingerprintMatches === true, '21. Situation 3 — snapshotFingerprintMatches is likewise still independently true');
        assert(projection.matches === false, '22. Situation 3 — matches is false overall, because signatureValid alone already fails it — but every other fact remains on record, exactly as independently computed');
    }
    console.log('✓ Section D: Situation 3 — a cryptographically invalid signature never implicitly determines the three semantic comparison facts; each remains independently computed');

    // ---------------------------------------------------------------
    // Section E — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');

        // Alice and Bob share the identical evidence at signing time.
        const sharedArchive = buildSharedArchive();
        const aliceArchive = sharedArchive;
        let bobArchive = sharedArchive;

        // 1. Alice reconstructs her leaderboard and creates a signed claim.
        const aliceClaim = signedClaimFor(alice, verifier, aliceArchive);

        // 2/3. Alice exports the claim; Bob imports and stores it.
        const wirePayload = JSON.parse(JSON.stringify(exportPublisherLeaderboardSnapshotClaim(aliceClaim)));
        const receiveUseCase = new ReceivePublisherLeaderboardSnapshotClaimUseCase(verifier);
        const receipt = receiveUseCase.execute([], wirePayload);
        const bobRecord = receipt.record;
        const genuineRecordJson = serialize(bobRecord.toJSON());

        // Bob verifies it against his own, currently identical, evidence.
        const before = reconstructPublisherLeaderboardClaimVerification(bobRecord, bobArchive, verifier);
        assert(before.signatureValid === true, '23. FLAGSHIP — Alice genuinely signed exactly this claim');
        assert(before.evidenceFingerprintMatches === true, '24. FLAGSHIP — Bob\'s evidence is currently identical to Alice\'s');
        assert(before.policyVersionMatches === true, '25. FLAGSHIP — Bob\'s policy version matches');
        assert(before.snapshotFingerprintMatches === true, '26. FLAGSHIP — Bob\'s reconstructed snapshot fingerprint matches');
        assert(before.matches === true, '27. FLAGSHIP — everything matches while the evidence is genuinely shared');

        // 4. Bob adds a new publication/evidence fact — WITHOUT modifying
        //    Alice's claim in any way.
        bobArchive = anchor(bobArchive, 'd', TXID_D);
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
        bobArchive = associationUseCase.execute(bobArchive, { publisherId: 'Eve', publicationIdentity: identityOf(bobArchive, 'd'), createdAt: CREATED_AT.mutation });

        assert(serialize(bobRecord.toJSON()) === genuineRecordJson, '28. FLAGSHIP — the stored claim record is completely untouched by Bob\'s new evidence');

        const after = reconstructPublisherLeaderboardClaimVerification(bobRecord, bobArchive, verifier);
        assert(after.signatureValid === true, '29. FLAGSHIP — the signature is still, and will always remain, perfectly genuine');
        assert(after.evidenceFingerprintMatches === false, '30. FLAGSHIP — Bob\'s evidence has changed; it no longer matches what the claim asserts');
        assert(after.snapshotFingerprintMatches === false, '31. FLAGSHIP — and neither does Bob\'s reconstructed snapshot fingerprint');
        assert(after.matches === false, '32. FLAGSHIP — matches has flipped to false: the SIGNED CLAIM DID NOT CHANGE, the local evidence did — a signed claim is never a permanently valid assertion about the current state');
        assert(after.policyVersionMatches === true, '33. FLAGSHIP — the ranking policy version itself is unaffected by this particular evidence addition');

        // The receipt metadata never changes either, across both calls.
        assert(before.signerIdentityId === after.signerIdentityId && before.claimCreatedAt.getTime() === after.claimCreatedAt.getTime() && before.receivedAt.getTime() === after.receivedAt.getTime(), '34. FLAGSHIP — the claim\'s own receipt metadata (signer, createdAt, receivedAt) is identical before and after, exactly as it must be for an unmodified record');
    }
    console.log('✓ Section E: FLAGSHIP — Alice and Bob share evidence at signing time and verification matches; once Bob\'s own evidence changes, the identical, unmodified, signed claim no longer matches — proving a signed claim is a durable fact while verification is a computation relative to current evidence');

    // ---------------------------------------------------------------
    // Section F — reconstructPublisherLeaderboardClaimVerification(): the archive-reading boundary.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = recordFor(claim);

        const viaReconstruct = reconstructPublisherLeaderboardClaimVerification(record, archive, verifier);
        const viaDescribe = describePublisherLeaderboardClaimVerification(record, reconstructPublisherLeaderboardSnapshot(archive), verifier);
        assert(serialize(viaReconstruct) === serialize(viaDescribe), '35. reconstructXxx() is exactly describeXxx() composed with 0.8.119\'s own reconstructPublisherLeaderboardSnapshot() — no parallel computation of its own');

        for (const malformedArchive of [null, undefined, {}, 'not an archive', 42]) {
            const result = reconstructPublisherLeaderboardClaimVerification(record, malformedArchive, verifier);
            const expected = describePublisherLeaderboardClaimVerification(record, reconstructPublisherLeaderboardSnapshot(PublicationObservationArchive.empty()), verifier);
            assert(serialize(result) === serialize(expected), `36. a malformed archive (${JSON.stringify(malformedArchive)}) degrades to PublicationObservationArchive.empty() — the identical tolerance every other reconstructXxx()/verifyXxx() entry point in this family already holds`);
        }

        assert(reconstructPublisherLeaderboardClaimVerification(null, archive, verifier) === null, '37. a malformed record still projects to null through the archive-reading entry point');
    }
    console.log('✓ Section F: reconstructPublisherLeaderboardClaimVerification() is the one thin archive-reading entry point, tolerating a malformed archive exactly like every other reconstructXxx() in this family');

    // ---------------------------------------------------------------
    // Section G — no persistence, determinism, vocabulary, and network access.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = recordFor(claim);
        const localSnapshot = reconstructPublisherLeaderboardSnapshot(archive);

        const beforeRecordJson = serialize(record.toJSON());
        const first = describePublisherLeaderboardClaimVerification(record, localSnapshot, verifier);
        const second = describePublisherLeaderboardClaimVerification(record, localSnapshot, verifier);
        assert(serialize(first) === serialize(second), '38. repeated calls with identical input are byte-identical — nothing is cached, memoized, or persisted as a side effect');
        assert(serialize(record.toJSON()) === beforeRecordJson, '39. the record itself is completely untouched by having been verified — verification is never written back onto it');
        assert(Object.isFrozen(record), '40. the record remains frozen — this file never gains, and never needs, a way to mutate it');

        const forbiddenVocabulary = ['trusted', 'current', 'authoritative', 'verified', 'score', 'rank', 'reputation', 'confidence', 'quality', 'worthiness', 'authority'];
        const projectionText = serialize(first).toLowerCase();
        for (const word of forbiddenVocabulary) {
            assert(!projectionText.includes(word), `41. the projection's own output never carries "${word}" — only 0.8.120/0.8.121's own reused vocabulary appears`);
        }

        const { result, networkCallOccurred } = await withoutNetworkAccess(() => reconstructPublisherLeaderboardClaimVerification(record, archive, verifier));
        assert(networkCallOccurred === false, '42. verifying a claim record performs zero network access');
        assert(result.matches === true, '43. sanity — the result itself is genuine');
    }
    console.log('✓ Section G: verification is deterministic, never persisted onto the record, uses only 0.8.120/0.8.121\'s own reused vocabulary, and performs zero network access');

    console.log('\nAll PublisherLeaderboardClaimVerificationView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimVerificationView.test.js FAILED:', error);
    process.exitCode = 1;
});
