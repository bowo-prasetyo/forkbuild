import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { CreatePublisherLeaderboardSnapshotClaimUseCase } from '../application/CreatePublisherLeaderboardSnapshotClaimUseCase.js';
import { verifyPublisherLeaderboardSnapshotClaim } from '../application/PublisherLeaderboardSnapshotClaimVerification.js';
import {
    exportPublisherLeaderboardSnapshotClaim,
    importPublisherLeaderboardSnapshotClaim,
    PublisherLeaderboardSnapshotClaimImportOutcome
} from '../application/PublisherLeaderboardSnapshotClaimExchange.js';
import { PublisherLeaderboardSnapshotClaim, PUBLISHER_LEADERBOARD_SNAPSHOT_CLAIM_KIND } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.122 — Portable Signed Leaderboard Claim Exchange.
//
// Section A: exportPublisherLeaderboardSnapshotClaim() — requires a genuine,
//            signed claim instance; returns the exact, closed nine-field
//            wire shape
// Section B: importPublisherLeaderboardSnapshotClaim() — requires a
//            verifier (throws when missing); never throws for malformed or
//            unverifiable payloads (explicit outcomes instead)
// Section C: round-trip — export then import reconstructs an equivalent
//            claim, byte-identical on re-serialization
// Section D: FLAGSHIP (positive) — Alice signs over her own archive; Bob,
//            holding byte-identical evidence, receives ONLY the exported
//            JSON, imports it, and independently verifies it — no server,
//            no trusted leaderboard
// Section E: FLAGSHIP (negative) — Bob's own evidence genuinely differs;
//            import still succeeds (Alice's signature is perfectly
//            genuine) but the subsequent, separate semantic verification
//            fails
// Section F: tampering the transported payload invalidates import
//            (UNVERIFIABLE_CLAIM), one field at a time
// Section G: the payload transports ONLY the claim — closed field list,
//            no evidence/achievement/badge/statistic/leaderboard/policy
//            vocabulary
// Section H: no persistence — import never touches any archive or store;
//            two imports of the identical claim are independent
// Section I: determinism, purity, zero network access

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

// Alice and Bob's shared evidence — the identical fixture shape 0.8.116
// through 0.8.121's own flagships already established.
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
    // Section A — exportPublisherLeaderboardSnapshotClaim().
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = new CreatePublisherLeaderboardSnapshotClaimUseCase(alice, verifier).execute(archive);

        let threw = false;
        try { exportPublisherLeaderboardSnapshotClaim(null); } catch { threw = true; }
        assert(threw, '1. requires a PublisherLeaderboardSnapshotClaim instance');

        threw = false;
        try { exportPublisherLeaderboardSnapshotClaim(claim.toJSON()); } catch { threw = true; }
        assert(threw, '2. refuses a plain JSON object — a genuine instance is required, never bare JSON');

        const unsignedClaim = new PublisherLeaderboardSnapshotClaim({
            evidenceFingerprint: 'e'.repeat(64), policyVersion: 1, snapshotFingerprint: 'f'.repeat(64), signerIdentityId: 'did:key:zSigner'
        });
        threw = false;
        try { exportPublisherLeaderboardSnapshotClaim(unsignedClaim); } catch { threw = true; }
        assert(threw, '3. refuses to export an unsigned claim');

        const exported = exportPublisherLeaderboardSnapshotClaim(claim);
        assert(serialize(exported) === serialize(claim.toJSON()), '4. the exported payload is exactly claim.toJSON() — no new shape invented');
        assert(Object.isFrozen(exported), '5. the exported payload is frozen');
        assert(exported.kind === PUBLISHER_LEADERBOARD_SNAPSHOT_CLAIM_KIND, '6. exported payload carries the self-describing kind');
    }
    console.log('✓ Section A: exportPublisherLeaderboardSnapshotClaim() requires a genuine, signed claim instance and returns its exact wire shape');

    // ---------------------------------------------------------------
    // Section B — importPublisherLeaderboardSnapshotClaim(): validation.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = new CreatePublisherLeaderboardSnapshotClaimUseCase(alice, verifier).execute(archive);
        const genuinePayload = exportPublisherLeaderboardSnapshotClaim(claim);

        let threw = false;
        try { importPublisherLeaderboardSnapshotClaim(genuinePayload, null); } catch { threw = true; }
        assert(threw, '7. requires a verifier — a missing verifier throws rather than silently treating input as unsigned');

        threw = false;
        try { importPublisherLeaderboardSnapshotClaim(genuinePayload, {}); } catch { threw = true; }
        assert(threw, '8. requires a verifier capable of verifyPublisherLeaderboardSnapshotClaim');

        for (const malformed of [null, undefined, 42, 'not json at all {{{', [], {}, { ...genuinePayload, extraField: 'nope' }]) {
            const result = importPublisherLeaderboardSnapshotClaim(malformed, verifier);
            assert(result.outcome === PublisherLeaderboardSnapshotClaimImportOutcome.INVALID_CLAIM, `9. malformed payload (${JSON.stringify(malformed)}) never throws — yields INVALID_CLAIM`);
            assert(result.claim === null, `10. malformed payload (${JSON.stringify(malformed)}) never produces a claim`);
        }

        const missingField = { ...genuinePayload };
        delete missingField.signerIdentityId;
        const missingFieldResult = importPublisherLeaderboardSnapshotClaim(missingField, verifier);
        assert(missingFieldResult.outcome === PublisherLeaderboardSnapshotClaimImportOutcome.INVALID_CLAIM, '11. a payload missing a required field is INVALID_CLAIM');

        const wrongKind = { ...genuinePayload, kind: 'forkbuild.something-else' };
        assert(importPublisherLeaderboardSnapshotClaim(wrongKind, verifier).outcome === PublisherLeaderboardSnapshotClaimImportOutcome.INVALID_CLAIM, '12. a payload with the wrong self-describing kind is INVALID_CLAIM');

        const wrongSchemaVersion = { ...genuinePayload, schemaVersion: 999 };
        assert(importPublisherLeaderboardSnapshotClaim(wrongSchemaVersion, verifier).outcome === PublisherLeaderboardSnapshotClaimImportOutcome.INVALID_CLAIM, '13. a payload with an unsupported schemaVersion is INVALID_CLAIM');

        const blankEvidenceFingerprint = { ...genuinePayload, evidenceFingerprint: '   ' };
        const blankResult = importPublisherLeaderboardSnapshotClaim(blankEvidenceFingerprint, verifier);
        assert(blankResult.outcome === PublisherLeaderboardSnapshotClaimImportOutcome.INVALID_CLAIM, '14. a payload failing core construction validation (whitespace-only evidenceFingerprint) is INVALID_CLAIM, never a thrown error');

        const asString = JSON.stringify(genuinePayload);
        const fromStringResult = importPublisherLeaderboardSnapshotClaim(asString, verifier);
        assert(fromStringResult.outcome === PublisherLeaderboardSnapshotClaimImportOutcome.IMPORTED, '15. a raw, not-yet-parsed JSON string is accepted exactly like the parsed object');
    }
    console.log('✓ Section B: importPublisherLeaderboardSnapshotClaim() requires a verifier, and never throws for malformed input — INVALID_CLAIM is always an explicit, non-throwing outcome');

    // ---------------------------------------------------------------
    // Section C — round-trip.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = new CreatePublisherLeaderboardSnapshotClaimUseCase(alice, verifier).execute(archive);

        const exported = exportPublisherLeaderboardSnapshotClaim(claim);
        const roundTripped = JSON.parse(JSON.stringify(exported));
        const result = importPublisherLeaderboardSnapshotClaim(roundTripped, verifier);

        assert(result.outcome === PublisherLeaderboardSnapshotClaimImportOutcome.IMPORTED, '16. round-trip: the genuine, untouched export imports successfully');
        assert(result.claim instanceof PublisherLeaderboardSnapshotClaim, '17. the imported claim is a genuine instance');
        assert(serialize(result.claim.toJSON()) === serialize(claim.toJSON()), '18. the imported claim re-serializes byte-identical to the original');
    }
    console.log('✓ Section C: export then import round-trips to a byte-identical, genuine claim instance');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP (positive).
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');

        const aliceArchive = buildSharedArchive();
        const aliceClaim = new CreatePublisherLeaderboardSnapshotClaimUseCase(alice, verifier).execute(aliceArchive);

        // The ONLY thing that crosses from Alice to Bob — exported, then
        // round-tripped through JSON, proving no shared object reference
        // is doing any work.
        const wirePayload = JSON.parse(JSON.stringify(exportPublisherLeaderboardSnapshotClaim(aliceClaim)));

        // Bob independently builds the IDENTICAL evidence — never touches
        // aliceArchive, Alice's claim instance, or Alice's identity
        // provider.
        const bobArchive = buildSharedArchive();

        const importResult = importPublisherLeaderboardSnapshotClaim(wirePayload, verifier);
        assert(importResult.outcome === PublisherLeaderboardSnapshotClaimImportOutcome.IMPORTED, '19. FLAGSHIP — Bob imports the claim: the signature structurally verifies');

        const verification = verifyPublisherLeaderboardSnapshotClaim(bobArchive, importResult.claim.toJSON(), verifier);
        assert(verification.signatureValid === true, '20. FLAGSHIP — signatureValid true: signerIdentityId genuinely signed exactly this claim');
        assert(verification.evidenceFingerprintMatches === true, '21. FLAGSHIP — Bob\'s own independently reconstructed evidence fingerprint matches');
        assert(verification.policyVersionMatches === true, '22. FLAGSHIP — policyVersionMatches true');
        assert(verification.snapshotFingerprintMatches === true, '23. FLAGSHIP — Bob\'s own independently computed snapshot fingerprint matches — no server, no trusted leaderboard involved');
        assert(verification.matches === true, '24. FLAGSHIP — matches true overall');
    }
    console.log('✓ Section D: FLAGSHIP (positive) — Bob receives only the exported JSON, imports it, independently reconstructs his own snapshot, and both signature and content verify — no server, no trusted leaderboard');

    // ---------------------------------------------------------------
    // Section E — FLAGSHIP (negative): a genuinely imported claim can
    // still disagree with Bob's own evidence.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');

        const aliceArchive = buildSharedArchive();
        const aliceClaim = new CreatePublisherLeaderboardSnapshotClaimUseCase(alice, verifier).execute(aliceArchive);
        const wirePayload = JSON.parse(JSON.stringify(exportPublisherLeaderboardSnapshotClaim(aliceClaim)));

        // Bob starts from genuinely different evidence — one extra
        // anchored publication and association Alice's evidence never
        // had.
        let bobArchive = buildSharedArchive();
        bobArchive = anchor(bobArchive, 'd', TXID_D);
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
        bobArchive = associationUseCase.execute(bobArchive, { publisherId: 'Eve', publicationIdentity: identityOf(bobArchive, 'd'), createdAt: CREATED_AT.mutation });

        const importResult = importPublisherLeaderboardSnapshotClaim(wirePayload, verifier);
        assert(importResult.outcome === PublisherLeaderboardSnapshotClaimImportOutcome.IMPORTED, '25. FLAGSHIP (negative) — Bob still imports the claim: Alice\'s signature is perfectly genuine');

        const verification = verifyPublisherLeaderboardSnapshotClaim(bobArchive, importResult.claim.toJSON(), verifier);
        assert(verification.signatureValid === true, '26. FLAGSHIP (negative) — signatureValid remains true: Alice really did sign exactly this claim');
        assert(verification.evidenceFingerprintMatches === false, '27. FLAGSHIP (negative) — yet Bob\'s own evidence fingerprint genuinely differs');
        assert(verification.snapshotFingerprintMatches === false, '28. FLAGSHIP (negative) — and Bob\'s own snapshot fingerprint differs too');
        assert(verification.matches === false, '29. FLAGSHIP (negative) — matches false overall: importing a genuinely signed claim never makes it true relative to Bob\'s own evidence');
    }
    console.log('✓ Section E: FLAGSHIP (negative) — a successfully imported (genuinely signed) claim can still fail every semantic check against a replica\'s own, genuinely different evidence');

    // ---------------------------------------------------------------
    // Section F — tampering the transported payload.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = new CreatePublisherLeaderboardSnapshotClaimUseCase(alice, verifier).execute(archive);
        const genuinePayload = exportPublisherLeaderboardSnapshotClaim(claim);

        const sanity = importPublisherLeaderboardSnapshotClaim(genuinePayload, verifier);
        assert(sanity.outcome === PublisherLeaderboardSnapshotClaimImportOutcome.IMPORTED, '30. sanity — the untouched, genuine export imports successfully');

        const tamperedEvidenceFingerprint = { ...genuinePayload, evidenceFingerprint: 'f'.repeat(64) };
        assert(importPublisherLeaderboardSnapshotClaim(tamperedEvidenceFingerprint, verifier).outcome === PublisherLeaderboardSnapshotClaimImportOutcome.UNVERIFIABLE_CLAIM, '31. tampering evidenceFingerprint yields UNVERIFIABLE_CLAIM');

        const tamperedPolicyVersion = { ...genuinePayload, policyVersion: genuinePayload.policyVersion + 1 };
        assert(importPublisherLeaderboardSnapshotClaim(tamperedPolicyVersion, verifier).outcome === PublisherLeaderboardSnapshotClaimImportOutcome.UNVERIFIABLE_CLAIM, '32. tampering policyVersion yields UNVERIFIABLE_CLAIM');

        const tamperedSnapshotFingerprint = { ...genuinePayload, snapshotFingerprint: 'a'.repeat(64) };
        assert(importPublisherLeaderboardSnapshotClaim(tamperedSnapshotFingerprint, verifier).outcome === PublisherLeaderboardSnapshotClaimImportOutcome.UNVERIFIABLE_CLAIM, '33. tampering snapshotFingerprint yields UNVERIFIABLE_CLAIM');

        const tamperedSignerIdentityId = { ...genuinePayload, signerIdentityId: 'did:key:zSomeoneElse' };
        assert(importPublisherLeaderboardSnapshotClaim(tamperedSignerIdentityId, verifier).outcome === PublisherLeaderboardSnapshotClaimImportOutcome.UNVERIFIABLE_CLAIM, '34. tampering signerIdentityId yields UNVERIFIABLE_CLAIM');

        const tamperedId = { ...genuinePayload, id: `${genuinePayload.id}-tampered` };
        assert(importPublisherLeaderboardSnapshotClaim(tamperedId, verifier).outcome === PublisherLeaderboardSnapshotClaimImportOutcome.UNVERIFIABLE_CLAIM, '35. tampering id (bound into the signed descriptor) yields UNVERIFIABLE_CLAIM');

        const tamperedCreatedAt = { ...genuinePayload, createdAt: new Date(Date.parse(genuinePayload.createdAt) + 1000).toISOString() };
        assert(importPublisherLeaderboardSnapshotClaim(tamperedCreatedAt, verifier).outcome === PublisherLeaderboardSnapshotClaimImportOutcome.UNVERIFIABLE_CLAIM, '36. tampering createdAt (bound into the signed descriptor as revision) yields UNVERIFIABLE_CLAIM');

        const tamperedSignature = { ...genuinePayload, signature: { ...genuinePayload.signature, signature: genuinePayload.signature.signature.split('').reverse().join('') } };
        assert(importPublisherLeaderboardSnapshotClaim(tamperedSignature, verifier).outcome === PublisherLeaderboardSnapshotClaimImportOutcome.UNVERIFIABLE_CLAIM, '37. corrupting the raw signature bytes yields UNVERIFIABLE_CLAIM');

        const strippedSignature = { ...genuinePayload, signature: null };
        assert(importPublisherLeaderboardSnapshotClaim(strippedSignature, verifier).outcome === PublisherLeaderboardSnapshotClaimImportOutcome.UNVERIFIABLE_CLAIM, '38. a claim with its signature stripped entirely yields UNVERIFIABLE_CLAIM, never IMPORTED');
    }
    console.log('✓ Section F: tampering any one of evidenceFingerprint, policyVersion, snapshotFingerprint, signerIdentityId, id, createdAt, or the signature itself always yields UNVERIFIABLE_CLAIM, never IMPORTED');

    // ---------------------------------------------------------------
    // Section G — the payload transports ONLY the claim.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = new CreatePublisherLeaderboardSnapshotClaimUseCase(alice, verifier).execute(archive);
        const exported = exportPublisherLeaderboardSnapshotClaim(claim);

        const expectedKeys = ['kind', 'schemaVersion', 'id', 'evidenceFingerprint', 'policyVersion', 'snapshotFingerprint', 'signerIdentityId', 'createdAt', 'signature'];
        assert(Object.keys(exported).sort().join(',') === expectedKeys.sort().join(','), '39. the exported payload carries EXACTLY these nine fields — nothing else');

        const forbiddenKeys = ['evidence', 'achievements', 'achievementEvents', 'badges', 'statistics', 'leaderboard', 'policy', 'publisherPublicationAssociationRecords', 'bitcoinAnchorPublicationRecords', 'baseAnchorPublicationRecords', 'publicationReferenceRecords', 'privateKey', 'seed', 'seedHex'];
        for (const key of forbiddenKeys) {
            assert(!(key in exported), `40. the exported payload never carries a "${key}" field`);
        }

        const forbiddenVocabulary = ['score', 'xp', 'reputation', 'trust', 'weight', 'rating', 'percentile', 'tier', 'points', 'confidence', 'quality', 'worthiness', 'authority', 'verifiedpublisher', 'privatekey', 'seedhex'];
        const exportedText = serialize(exported).toLowerCase();
        for (const word of forbiddenVocabulary) {
            assert(!exportedText.includes(word), `41. the exported payload never carries "${word}"`);
        }
    }
    console.log('✓ Section G: the exported payload carries exactly the nine claim fields — no evidence, achievement, badge, statistic, leaderboard, policy, or private-key vocabulary of any kind');

    // ---------------------------------------------------------------
    // Section H — no persistence.
    // ---------------------------------------------------------------
    {
        assert(importPublisherLeaderboardSnapshotClaim.length === 2, '42. importPublisherLeaderboardSnapshotClaim() takes no archive parameter — exactly (payload, verifier)');

        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = new CreatePublisherLeaderboardSnapshotClaimUseCase(alice, verifier).execute(archive);
        const exported = exportPublisherLeaderboardSnapshotClaim(claim);

        const first = importPublisherLeaderboardSnapshotClaim(exported, verifier);
        const second = importPublisherLeaderboardSnapshotClaim(exported, verifier);
        assert(first.outcome === PublisherLeaderboardSnapshotClaimImportOutcome.IMPORTED, '43. sanity — first import succeeds');
        assert(second.outcome === PublisherLeaderboardSnapshotClaimImportOutcome.IMPORTED, '44. importing the identical claim a second time succeeds again — no deduplication, no registry, no memory of the first import');
        assert(first.claim !== second.claim, '45. each import produces its own, independent instance — nothing is cached or shared across calls');
    }
    console.log('✓ Section H: import takes no archive, persists nothing, and deduplicates nothing — a durable claim registry remains separate, later work');

    // ---------------------------------------------------------------
    // Section I — determinism, purity, zero network access.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();
        const alice = makeIdentity('Alice');
        const archive = buildSharedArchive();
        const claim = new CreatePublisherLeaderboardSnapshotClaimUseCase(alice, verifier).execute(archive);

        const exportedFirst = exportPublisherLeaderboardSnapshotClaim(claim);
        const exportedSecond = exportPublisherLeaderboardSnapshotClaim(claim);
        assert(serialize(exportedFirst) === serialize(exportedSecond), '46. repeated export over the identical claim is byte-identical');

        const preCallCount = archive.publisherPublicationAssociationRecordCount;
        const { result, networkCallOccurred } = await withoutNetworkAccess(() => importPublisherLeaderboardSnapshotClaim(exportedFirst, verifier));
        assert(networkCallOccurred === false, '47. import performs zero network access');
        assert(archive.publisherPublicationAssociationRecordCount === preCallCount, '48. the archive is untouched — import never even receives an archive reference');
        assert(result.outcome === PublisherLeaderboardSnapshotClaimImportOutcome.IMPORTED, '49. sanity — the result itself is genuine');
    }
    console.log('✓ Section I: export and import are deterministic, pure, and perform zero network access');

    console.log('\nAll PublisherLeaderboardSnapshotClaimExchange tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardSnapshotClaimExchange.test.js FAILED:', error);
    process.exitCode = 1;
});
