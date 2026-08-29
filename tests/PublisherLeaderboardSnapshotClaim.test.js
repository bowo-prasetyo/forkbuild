import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { reconstructPublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { CreatePublisherLeaderboardSnapshotClaimUseCase } from '../application/CreatePublisherLeaderboardSnapshotClaimUseCase.js';
import {
    describePublisherLeaderboardSnapshotClaimVerification,
    verifyPublisherLeaderboardSnapshotClaim
} from '../application/PublisherLeaderboardSnapshotClaimVerification.js';
import {
    PublisherLeaderboardSnapshotClaim,
    getPublisherLeaderboardSnapshotClaimSigningDescriptor,
    PUBLISHER_LEADERBOARD_SNAPSHOT_CLAIM_KIND
} from '../core/PublisherLeaderboardSnapshotClaim.js';
import { SignatureType, SIGNING_DOMAIN } from '../core/Signature.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.121 — Signed Reproducible Leaderboard Snapshot Claim.
//
// Section A: core/PublisherLeaderboardSnapshotClaim.js — construction & validation
// Section B: toJSON()/fromJSON() round trip, self-describing wire envelope
// Section C: getSigningDescriptor() — canonical payload shape, never carries
//            score/reputation/trust vocabulary
// Section D: application/PublisherLeaderboardSnapshotFingerprint.js — deterministic,
//            changes with the snapshot, tolerant of malformed input
// Section E: CreatePublisherLeaderboardSnapshotClaimUseCase — the ONE
//            construction boundary; requires an authenticated identity;
//            verifies its own output before returning it
// Section F: FLAGSHIP (positive) — Alice signs a claim over her own
//            archive; Bob, holding byte-identical evidence, receives ONLY
//            the serialized claim and independently verifies it — no
//            server, no trusted leaderboard, no trusted achievement result
// Section G: FLAGSHIP (negative) — A VALID SIGNATURE DOES NOT MEAN THE
//            CLAIM IS TRUE RELATIVE TO BOB'S LOCAL EVIDENCE: Bob's own
//            evidence genuinely differs from Alice's; her claim's
//            signature still verifies, but every semantic match fails
// Section H: tampering — changing exactly one of evidenceFingerprint,
//            policyVersion, snapshotFingerprint, signerIdentityId, or the
//            signature itself invalidates the claim
// Section I: same evidence/policy/leaderboard, a different (but genuine)
//            signature over the identical fields still fails structural
//            verification unless it is truly the same signer's own
//            signature
// Section J: never uses PublisherIdentityRecord as the signer
// Section K: malformed/absent claim tolerance — never throws, never matches
// Section L: no score/reputation/trust/confidence/"verified publisher" vocabulary
// Section M: determinism, purity, zero network access, zero mutation

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

// One independent, authenticated LocalIdentityProvider standing in for one
// distinct identity — mirrors tests/PlaceNamingClaims.test.js's own
// makeIdentity().
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

const CREATED_AT = {
    a: new Date('2026-08-29T00:00:00Z'),
    b: new Date('2026-08-29T00:01:00Z'),
    c: new Date('2026-08-29T00:02:00Z'),
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

// Alice and Bob's shared evidence — the same fixture shape 0.8.116 through
// 0.8.120's own flagships already established, reused here rather than
// reinvented.
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

async function run() {
    // ---------------------------------------------------------------
    // Section A — construction & validation.
    // ---------------------------------------------------------------
    {
        const validArgs = { evidenceFingerprint: 'e'.repeat(64), policyVersion: 1, snapshotFingerprint: 'f'.repeat(64), signerIdentityId: 'did:key:zSigner' };

        let threw = false;
        try { new PublisherLeaderboardSnapshotClaim({ ...validArgs, evidenceFingerprint: undefined }); } catch { threw = true; }
        assert(threw, '1. requires an evidenceFingerprint');

        threw = false;
        try { new PublisherLeaderboardSnapshotClaim({ ...validArgs, evidenceFingerprint: '   ' }); } catch { threw = true; }
        assert(threw, '2. rejects a whitespace-only evidenceFingerprint');

        threw = false;
        try { new PublisherLeaderboardSnapshotClaim({ ...validArgs, policyVersion: undefined }); } catch { threw = true; }
        assert(threw, '3. requires a policyVersion');

        threw = false;
        try { new PublisherLeaderboardSnapshotClaim({ ...validArgs, policyVersion: 0 }); } catch { threw = true; }
        assert(threw, '4. rejects a policyVersion less than 1');

        threw = false;
        try { new PublisherLeaderboardSnapshotClaim({ ...validArgs, policyVersion: 1.5 }); } catch { threw = true; }
        assert(threw, '5. rejects a non-integer policyVersion');

        threw = false;
        try { new PublisherLeaderboardSnapshotClaim({ ...validArgs, snapshotFingerprint: undefined }); } catch { threw = true; }
        assert(threw, '6. requires a snapshotFingerprint');

        threw = false;
        try { new PublisherLeaderboardSnapshotClaim({ ...validArgs, signerIdentityId: undefined }); } catch { threw = true; }
        assert(threw, '7. requires a signerIdentityId');

        const claim = new PublisherLeaderboardSnapshotClaim(validArgs);
        assert(claim.id, '8. id auto-generated');
        assert(claim.createdAt instanceof Date, '9. createdAt defaults to now');
        assert(claim.signature === null, '10. signature defaults to null (unsigned)');
        assert(claim.evidenceFingerprint === validArgs.evidenceFingerprint, '11. evidenceFingerprint preserved');
        assert(claim.policyVersion === 1, '12. policyVersion preserved');
        assert(claim.snapshotFingerprint === validArgs.snapshotFingerprint, '13. snapshotFingerprint preserved');
        assert(claim.signerIdentityId === validArgs.signerIdentityId, '14. signerIdentityId preserved');
    }
    console.log('✓ Section A: construction validates evidenceFingerprint, policyVersion, snapshotFingerprint, and signerIdentityId');

    // ---------------------------------------------------------------
    // Section B — toJSON()/fromJSON() round trip.
    // ---------------------------------------------------------------
    {
        const claim = new PublisherLeaderboardSnapshotClaim({
            evidenceFingerprint: 'e'.repeat(64), policyVersion: 1, snapshotFingerprint: 'f'.repeat(64), signerIdentityId: 'did:key:zSigner'
        });
        const json = claim.toJSON();
        assert(json.kind === PUBLISHER_LEADERBOARD_SNAPSHOT_CLAIM_KIND, '15. toJSON() carries the self-describing kind');
        assert(json.schemaVersion === 1, '16. toJSON() carries schemaVersion 1');
        assert(json.signature === null, '17. toJSON() carries a null signature before signing');

        const roundTripped = PublisherLeaderboardSnapshotClaim.fromJSON(json);
        assert(serialize(roundTripped.toJSON()) === serialize(json), '18. fromJSON(toJSON()) round-trips exactly');
        assert(PublisherLeaderboardSnapshotClaim.fromJSON(null) === null, '19. fromJSON(null) returns null rather than throwing');
    }
    console.log('✓ Section B: toJSON()/fromJSON() round-trip exactly, with a self-describing kind/schemaVersion');

    // ---------------------------------------------------------------
    // Section C — getSigningDescriptor(): canonical payload shape.
    // ---------------------------------------------------------------
    {
        const claim = new PublisherLeaderboardSnapshotClaim({
            evidenceFingerprint: 'e'.repeat(64), policyVersion: 3, snapshotFingerprint: 'f'.repeat(64), signerIdentityId: 'did:key:zSigner'
        });
        const descriptor = claim.getSigningDescriptor();
        assert(descriptor.type === SignatureType.PUBLISHER_LEADERBOARD_SNAPSHOT_CLAIM, '20. descriptor.type is the dedicated SignatureType');
        assert(descriptor.id === claim.id, '21. descriptor.id is the claim id');
        assert(descriptor.revision === claim.createdAt.toISOString(), '22. descriptor.revision is the claim createdAt');
        assert(descriptor.payload.protocol === SIGNING_DOMAIN, '23. descriptor.payload.protocol reuses core/Signature.js\'s own SIGNING_DOMAIN');
        assert(descriptor.payload.claimKind === PUBLISHER_LEADERBOARD_SNAPSHOT_CLAIM_KIND, '24. descriptor.payload.claimKind is the claim kind');
        assert(descriptor.payload.evidenceFingerprint === claim.evidenceFingerprint, '25. descriptor.payload.evidenceFingerprint carried');
        assert(descriptor.payload.policyVersion === 3, '26. descriptor.payload.policyVersion carried');
        assert(descriptor.payload.snapshotFingerprint === claim.snapshotFingerprint, '27. descriptor.payload.snapshotFingerprint carried');

        assert(serialize(descriptor) === serialize(getPublisherLeaderboardSnapshotClaimSigningDescriptor(claim.toJSON())), '28. the instance method and the standalone function agree exactly');

        const forbiddenWords = ['score', 'xp', 'reputation', 'trust', 'weight', 'rating', 'percentile', 'level', 'tier', 'points', 'confidence', 'quality', 'worthiness', 'authority', 'verifiedpublisher'];
        const descriptorText = serialize(descriptor).toLowerCase();
        for (const word of forbiddenWords) {
            assert(!descriptorText.includes(word), `29. a signed claim's own descriptor never carries "${word}"`);
        }
    }
    console.log('✓ Section C: getSigningDescriptor() produces the canonical protocol/claimKind/evidenceFingerprint/policyVersion/snapshotFingerprint payload, never evaluative vocabulary');

    // ---------------------------------------------------------------
    // Section D — application/PublisherLeaderboardSnapshotFingerprint.js.
    // ---------------------------------------------------------------
    {
        const archive = buildSharedArchive();
        const snapshot = reconstructPublisherLeaderboardSnapshot(archive);

        const first = describePublisherLeaderboardSnapshotFingerprint(snapshot);
        const second = describePublisherLeaderboardSnapshotFingerprint(snapshot);
        assert(first.algorithm === 'SHA-256', '30. algorithm is SHA-256');
        assert(/^[0-9a-f]{64}$/.test(first.fingerprint), '31. fingerprint is a 64-char lowercase hex digest');
        assert(serialize(first) === serialize(second), '32. calling twice with the equivalent snapshot is byte-identical');

        const otherArchive = buildSharedArchive();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
        const mutatedArchive = associationUseCase.execute(otherArchive, { publisherId: 'Eve', publicationIdentity: identityOf(otherArchive, 'a'), createdAt: CREATED_AT.mutation });
        const mutatedSnapshot = reconstructPublisherLeaderboardSnapshot(mutatedArchive);
        const mutatedFingerprint = describePublisherLeaderboardSnapshotFingerprint(mutatedSnapshot);
        assert(mutatedFingerprint.fingerprint !== first.fingerprint, '33. a genuinely different snapshot fingerprints differently');

        // Two snapshots sharing the SAME semantic identity (evidenceFingerprint,
        // policy.version) but a different leaderboard would be impossible
        // under correct computation — but the fingerprint is still computed
        // over the COMPLETE snapshot, not merely the semantic pair, so a
        // hand-shaped divergent leaderboard under the identical fingerprint/
        // version genuinely fingerprints differently.
        const divergentLeaderboard = { ...snapshot.leaderboard, entries: [...snapshot.leaderboard.entries].reverse() };
        const divergentSnapshotFingerprint = describePublisherLeaderboardSnapshotFingerprint({ evidenceFingerprint: snapshot.evidenceFingerprint, leaderboard: divergentLeaderboard });
        if (snapshot.leaderboard.entries.length > 1) {
            assert(divergentSnapshotFingerprint.fingerprint !== first.fingerprint, '34. the fingerprint is sensitive to leaderboard entry order/content, never merely the semantic (evidenceFingerprint, policyVersion) pair');
        }

        for (const malformed of [null, undefined, 42, 'garbage', [], {}]) {
            const result = describePublisherLeaderboardSnapshotFingerprint(malformed);
            assert(/^[0-9a-f]{64}$/.test(result.fingerprint), `35. malformed input (${JSON.stringify(malformed)}) never throws — degrades to a well-defined fingerprint`);
        }
    }
    console.log('✓ Section D: the snapshot fingerprint is deterministic, sensitive to the complete snapshot content, and tolerant of malformed input');

    // ---------------------------------------------------------------
    // Section E — CreatePublisherLeaderboardSnapshotClaimUseCase.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const anonymousProvider = new LocalIdentityProvider(new InMemoryStorageProvider());

        let threw = false;
        try { new CreatePublisherLeaderboardSnapshotClaimUseCase(null, verifier); } catch { threw = true; }
        assert(threw, '36. constructor requires an identityProvider');

        threw = false;
        try { new CreatePublisherLeaderboardSnapshotClaimUseCase(anonymousProvider, null); } catch { threw = true; }
        assert(threw, '37. constructor requires a verifier');

        const useCase = new CreatePublisherLeaderboardSnapshotClaimUseCase(anonymousProvider, verifier);
        threw = false;
        try { useCase.execute(buildSharedArchive()); } catch { threw = true; }
        assert(threw, '38. execute() throws when nobody is signed in');

        const alice = makeIdentity('Alice');
        const aliceUseCase = new CreatePublisherLeaderboardSnapshotClaimUseCase(alice, verifier);
        const archive = buildSharedArchive();
        const claim = aliceUseCase.execute(archive);

        assert(claim instanceof PublisherLeaderboardSnapshotClaim, '39. execute() returns a genuine claim instance');
        assert(claim.signature !== null, '40. the returned claim is signed');
        assert(claim.signerIdentityId === alice.getSigningIdentity().id, '41. signerIdentityId is Alice\'s own did:key identity');

        const snapshot = reconstructPublisherLeaderboardSnapshot(archive);
        assert(claim.evidenceFingerprint === snapshot.evidenceFingerprint, '42. the claim\'s evidenceFingerprint matches the archive\'s own reconstructed snapshot');
        assert(claim.policyVersion === snapshot.policy.version, '43. the claim\'s policyVersion matches');
        assert(claim.snapshotFingerprint === describePublisherLeaderboardSnapshotFingerprint(snapshot).fingerprint, '44. the claim\'s snapshotFingerprint matches the independently computed digest');

        const structural = verifier.verifyPublisherLeaderboardSnapshotClaim(claim.toJSON());
        assert(structural.valid === true, '45. the freshly created claim structurally verifies');
    }
    console.log('✓ Section E: CreatePublisherLeaderboardSnapshotClaimUseCase is the sole construction boundary, requires an authenticated identity, and verifies its own output');

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP (positive): Alice signs; Bob, holding
    // byte-identical evidence, receives ONLY the serialized claim.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');

        const aliceArchive = buildSharedArchive();
        const claim = new CreatePublisherLeaderboardSnapshotClaimUseCase(alice, verifier).execute(aliceArchive);

        // The claim travels as plain, serialized JSON — round-tripped
        // through JSON to prove no shared object reference is doing any
        // work, exactly like 0.8.120's own flagship.
        const claimAsJson = JSON.parse(JSON.stringify(claim.toJSON()));

        // Bob independently builds the IDENTICAL evidence — never touches
        // aliceArchive, Alice's snapshot, or Alice's identity provider.
        const bobArchive = buildSharedArchive();

        const verification = verifyPublisherLeaderboardSnapshotClaim(bobArchive, claimAsJson, verifier);
        assert(verification.signatureValid === true, '46. FLAGSHIP — the signature verifies: signerIdentityId genuinely signed exactly this claim');
        assert(verification.evidenceFingerprintMatches === true, '47. FLAGSHIP — Bob\'s own independently reconstructed evidence fingerprint matches the claim\'s own');
        assert(verification.policyVersionMatches === true, '48. FLAGSHIP — policyVersionMatches true');
        assert(verification.snapshotFingerprintMatches === true, '49. FLAGSHIP — Bob\'s own independently computed snapshot fingerprint matches the claim\'s own — no server, no trusted leaderboard involved');
        assert(verification.matches === true, '50. FLAGSHIP — matches true overall: Bob independently reconstructed the conclusion AND confirmed who signed it');
    }
    console.log('✓ Section F: FLAGSHIP (positive) — Bob receives only the serialized claim, independently reconstructs his own snapshot, and both signature and content verify');

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP (negative): a VALID signature does not mean
    // the claim is true relative to Bob's local evidence.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');

        const aliceArchive = buildSharedArchive();
        const claim = new CreatePublisherLeaderboardSnapshotClaimUseCase(alice, verifier).execute(aliceArchive);
        const claimAsJson = JSON.parse(JSON.stringify(claim.toJSON()));

        // Bob starts from genuinely different evidence — one extra
        // publisher association Alice's evidence never had.
        const bobArchiveBeforeMutation = buildSharedArchive();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
        const bobArchive = associationUseCase.execute(bobArchiveBeforeMutation, { publisherId: 'Eve', publicationIdentity: identityOf(bobArchiveBeforeMutation, 'a'), createdAt: CREATED_AT.mutation });

        const verification = verifyPublisherLeaderboardSnapshotClaim(bobArchive, claimAsJson, verifier);
        assert(verification.signatureValid === true, '51. FLAGSHIP (negative) — the signature is perfectly genuine: Alice really did sign exactly this claim');
        assert(verification.evidenceFingerprintMatches === false, '52. FLAGSHIP (negative) — yet Bob\'s own evidence fingerprint genuinely differs from what the claim asserts');
        assert(verification.snapshotFingerprintMatches === false, '53. FLAGSHIP (negative) — and Bob\'s own snapshot fingerprint differs too');
        assert(verification.matches === false, '54. FLAGSHIP (negative) — matches is false overall: a valid signature over a claim never makes the claim true relative to a replica\'s own evidence');

        // The policy version itself is unaffected by an evidence mutation.
        assert(verification.policyVersionMatches === true, '55. the ranking policy version is unaffected by this evidence mutation');
    }
    console.log('✓ Section G: FLAGSHIP (negative) — a genuinely valid signature never overrides Bob\'s own independent reconstruction; it only proves who signed, never that the claim is true here');

    // ---------------------------------------------------------------
    // Section H — tampering: one field at a time.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = new CreatePublisherLeaderboardSnapshotClaimUseCase(alice, verifier).execute(archive);
        const genuineJson = claim.toJSON();

        // Sanity: the genuine, untouched claim verifies.
        const sanity = verifyPublisherLeaderboardSnapshotClaim(archive, genuineJson, verifier);
        assert(sanity.matches === true, '56. sanity — the untouched, genuine claim verifies true');

        const tamperedEvidenceFingerprint = { ...genuineJson, evidenceFingerprint: 'f'.repeat(64) };
        const r1 = verifyPublisherLeaderboardSnapshotClaim(archive, tamperedEvidenceFingerprint, verifier);
        assert(r1.signatureValid === false, '57. tampering evidenceFingerprint invalidates the signature (the signed payload no longer matches)');
        assert(r1.matches === false, '58. and matches is false');

        const tamperedPolicyVersion = { ...genuineJson, policyVersion: genuineJson.policyVersion + 1 };
        const r2 = verifyPublisherLeaderboardSnapshotClaim(archive, tamperedPolicyVersion, verifier);
        assert(r2.signatureValid === false, '59. tampering policyVersion invalidates the signature');
        assert(r2.matches === false, '60. and matches is false');

        const tamperedSnapshotFingerprint = { ...genuineJson, snapshotFingerprint: 'a'.repeat(64) };
        const r3 = verifyPublisherLeaderboardSnapshotClaim(archive, tamperedSnapshotFingerprint, verifier);
        assert(r3.signatureValid === false, '61. tampering snapshotFingerprint invalidates the signature');
        assert(r3.matches === false, '62. and matches is false');

        const tamperedSignerIdentityId = { ...genuineJson, signerIdentityId: 'did:key:zSomeoneElse' };
        const r4 = verifyPublisherLeaderboardSnapshotClaim(archive, tamperedSignerIdentityId, verifier);
        assert(r4.signatureValid === false, '63. tampering signerIdentityId invalidates the signature — the signer field no longer matches who actually signed');
        assert(r4.matches === false, '64. and matches is false');

        const tamperedSignature = { ...genuineJson, signature: { ...genuineJson.signature, signature: genuineJson.signature.signature.split('').reverse().join('') } };
        const r5 = verifyPublisherLeaderboardSnapshotClaim(archive, tamperedSignature, verifier);
        assert(r5.signatureValid === false, '65. corrupting the raw signature bytes invalidates the signature');
        assert(r5.matches === false, '66. and matches is false');
    }
    console.log('✓ Section H: tampering with evidenceFingerprint, policyVersion, snapshotFingerprint, signerIdentityId, or the signature itself — one field at a time — always invalidates the claim');

    // ---------------------------------------------------------------
    // Section I — same evidence/policy/leaderboard, a different signature.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildSharedArchive();

        const aliceClaim = new CreatePublisherLeaderboardSnapshotClaimUseCase(alice, verifier).execute(archive);
        const bobClaim = new CreatePublisherLeaderboardSnapshotClaimUseCase(bob, verifier).execute(archive);

        // Alice and Bob assert the IDENTICAL evidenceFingerprint/policyVersion/
        // snapshotFingerprint (they hold the identical evidence) — but each
        // claim carries its own signer's own signature.
        assert(aliceClaim.evidenceFingerprint === bobClaim.evidenceFingerprint, '67. sanity — Alice and Bob assert the identical evidenceFingerprint');
        assert(aliceClaim.snapshotFingerprint === bobClaim.snapshotFingerprint, '68. sanity — and the identical snapshotFingerprint');
        assert(serialize(aliceClaim.signature) !== serialize(bobClaim.signature), '69. sanity — Alice\'s and Bob\'s own signatures genuinely differ');

        // Grafting Bob's signature onto a JSON copy of Alice's claim (same
        // evidenceFingerprint/policyVersion/snapshotFingerprint, but now a
        // signature/signerIdentityId pair that doesn't match its own
        // signerIdentityId claim) fails structurally.
        const grafted = { ...aliceClaim.toJSON(), signerIdentityId: aliceClaim.signerIdentityId, signature: bobClaim.signature.toJSON() };
        const grafted_result = verifyPublisherLeaderboardSnapshotClaim(archive, grafted, verifier);
        assert(grafted_result.signatureValid === false, '70. Bob\'s own genuine signature grafted under Alice\'s claimed signerIdentityId fails structural verification — a signature is never merely "someone signed something like this"');

        // Both ORIGINAL claims verify independently and identically on their
        // own semantic content, despite being signed by two different
        // identities.
        const aliceResult = verifyPublisherLeaderboardSnapshotClaim(archive, aliceClaim.toJSON(), verifier);
        const bobResult = verifyPublisherLeaderboardSnapshotClaim(archive, bobClaim.toJSON(), verifier);
        assert(aliceResult.matches === true && bobResult.matches === true, '71. two independently signed claims, from two different identities, over the identical reproducible snapshot, both verify true — neither is more authoritative than the other');
    }
    console.log('✓ Section I: two different signers can independently attest to the identical reproducible snapshot; a signature can never be grafted from one signer onto another\'s claimed identity');

    // ---------------------------------------------------------------
    // Section J — never uses PublisherIdentityRecord as the signer.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = new CreatePublisherLeaderboardSnapshotClaimUseCase(alice, verifier).execute(archive);

        // The signer is a did:key — never a bare publisher label.
        assert(claim.signerIdentityId.startsWith('did:key:'), '72. signerIdentityId is a did:key, never a bare publisher label');
        assert(claim.signerIdentityId !== 'Alice', '73. signerIdentityId is never the human-readable label passed to makeIdentity()');
    }
    console.log('✓ Section J: the signer is always a cryptographic did:key identity, never a PublisherIdentityRecord label');

    // ---------------------------------------------------------------
    // Section K — malformed/absent claim tolerance.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const archive = buildSharedArchive();

        for (const malformed of [null, undefined, 42, 'garbage', [], {}, { signerIdentityId: 'did:key:zSomeone' }]) {
            const result = verifyPublisherLeaderboardSnapshotClaim(archive, malformed, verifier);
            assert(typeof result.matches === 'boolean', `74. a malformed claim (${JSON.stringify(malformed)}) never throws — matches is always a genuine boolean`);
            assert(result.matches === false, `75. a malformed claim (${JSON.stringify(malformed)}) never matches — there is no well-defined "empty claim" that could legitimately pass`);
            assert(result.signatureValid === false, `76. a malformed claim (${JSON.stringify(malformed)}) never structurally verifies`);
        }

        for (const malformedArchive of [null, undefined, {}, 'garbage', 42]) {
            const genuineClaimShape = { evidenceFingerprint: 'e'.repeat(64), policyVersion: 1, snapshotFingerprint: 'f'.repeat(64), signerIdentityId: 'did:key:zSomeone', signature: null };
            const result = verifyPublisherLeaderboardSnapshotClaim(malformedArchive, genuineClaimShape, verifier);
            assert(result.matches === false, `77. a malformed archive (${JSON.stringify(malformedArchive)}) degrades to the empty archive, never throws`);
        }

        let threw = false;
        try { describePublisherLeaderboardSnapshotClaimVerification({}, {}, null); } catch { threw = true; }
        assert(threw, '78. describePublisherLeaderboardSnapshotClaimVerification() requires a genuine verifier — it never silently treats a missing one as "unsigned"');
    }
    console.log('✓ Section K: a malformed or absent claim never throws and never matches; a malformed archive degrades to empty; a missing verifier is refused outright');

    // ---------------------------------------------------------------
    // Section L — no score/reputation/trust/confidence/"verified
    // publisher" vocabulary anywhere in a claim or a verification result.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = new CreatePublisherLeaderboardSnapshotClaimUseCase(alice, verifier).execute(archive);
        const verification = verifyPublisherLeaderboardSnapshotClaim(archive, claim.toJSON(), verifier);

        const forbidden = ['score', 'xp', 'reputation', 'trust', 'weight', 'rating', 'percentile', 'level', 'tier', 'points', 'confidence', 'quality', 'worthiness', 'authority', 'verifiedpublisher'];
        const claimText = serialize(claim.toJSON()).toLowerCase();
        const verificationText = serialize(verification).toLowerCase();
        for (const word of forbidden) {
            assert(!claimText.includes(word), `79. a claim's own JSON never carries "${word}"`);
            assert(!verificationText.includes(word), `80. a verification result never carries "${word}"`);
        }

        assert(Object.keys(verification).sort().join(',') === ['matches', 'signatureValid', 'evidenceFingerprintMatches', 'policyVersionMatches', 'snapshotFingerprintMatches'].sort().join(','), '81. a verification result carries EXACTLY these five fields');
        for (const key of Object.keys(verification)) {
            assert(typeof verification[key] === 'boolean', `82. every verification field ("${key}") is a plain boolean`);
        }
    }
    console.log('✓ Section L: neither a claim nor a verification result ever carries score/reputation/trust/confidence/"verified publisher" vocabulary');

    // ---------------------------------------------------------------
    // Section M — determinism, purity, zero network access.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = new CreatePublisherLeaderboardSnapshotClaimUseCase(alice, verifier).execute(archive);
        const claimJson = claim.toJSON();

        const first = verifyPublisherLeaderboardSnapshotClaim(archive, claimJson, verifier);
        const second = verifyPublisherLeaderboardSnapshotClaim(archive, claimJson, verifier);
        assert(serialize(first) === serialize(second), '83. repeated verification over equivalent inputs is byte-identical');
        assert(Object.isFrozen(first), '84. a verification result is frozen');

        const preCallCount = archive.publisherPublicationAssociationRecordCount;
        const { result, networkCallOccurred } = await withoutNetworkAccess(() => verifyPublisherLeaderboardSnapshotClaim(archive, claimJson, verifier));
        assert(networkCallOccurred === false, '85. verification performs zero network access');
        assert(archive.publisherPublicationAssociationRecordCount === preCallCount, '86. the archive is untouched by verification');
        assert(result.matches === true, '87. sanity — the result itself is genuine');
    }
    console.log('✓ Section M: verification is deterministic, pure, performs zero network access, and never mutates the archive or the claim');

    console.log('\nAll PublisherLeaderboardSnapshotClaim tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardSnapshotClaim.test.js FAILED:', error);
    process.exitCode = 1;
});
