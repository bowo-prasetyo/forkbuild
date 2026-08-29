import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { CreatePublisherLeaderboardSnapshotClaimUseCase } from '../application/CreatePublisherLeaderboardSnapshotClaimUseCase.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { reconstructPublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { verifyPublisherLeaderboardSnapshotClaim } from '../application/PublisherLeaderboardSnapshotClaimVerification.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import {
    describePublisherLeaderboardClaimAgreement,
    reconstructPublisherLeaderboardClaimAgreement
} from '../application/PublisherLeaderboardClaimAgreementView.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.132 — Claim Agreement & Divergence Projection.
//
// Section A: empty history — every count zero, every group/pair array empty
// Section B: a single claim — no relationships to itself, every group/pair
//            array still empty
// Section C: receipt multiplicity — the same claim received several times
//            never produces a relationship with itself
// Section D: sharedSnapshotGroups — two distinct signers, the same
//            snapshot fingerprint
// Section E: signerClaimGroups — one signer, two distinct claims over
//            genuinely different evidence
// Section F: differingSnapshotPairs — same evidence fingerprint, different
//            snapshot fingerprint
// Section G: FLAGSHIP — Alice's claim A (E1/policy1/S1), Alice's claim B
//            (E1/policy2/S3), Bob's claim C (E1/policy1/S1), Carol's claim
//            D (E2/policy1/S4)
// Section H: malformed input is tolerated, never thrown
// Section I: no mutation of the input history or its records/claims;
//            every result is frozen
// Section J: determinism; reconstruct()/describe() agree
// Section K: no verification — relationships never change when current
//            local evidence changes
// Section L: vocabulary boundary — no evaluative/verification terms

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function archiveFromClaimHistory(history) {
    let archive = PublicationObservationArchive.empty();
    for (const record of history) {
        archive = archive.appendLeaderboardClaimRecord(record, record.origin);
    }
    return archive;
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
// the rest of the 0.8.121-0.8.131 family already uses.
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

// A signed claim with EXPLICIT, caller-chosen `policyVersion`/
// `snapshotFingerprint` overrides — needed for Sections F/G, which
// demonstrate a relationship (or its absence) between claims that name
// the SAME evidence fingerprint under two different policy versions.
// `CreatePublisherLeaderboardSnapshotClaimUseCase#execute()` always signs
// THIS replica's own currently-installed ranking policy version (0.8.121,
// UNCHANGED — see that class's own header, "signing is never automatic"),
// so this helper reaches past the use case, mirroring
// `tests/PublisherLeaderboardClaimHistoryTimelineView.test.js`'s own
// `signedClaimAt()` construct-sign-verify sequence, to model a second,
// later policy version signing over the identical underlying evidence —
// a scenario this file's own module never needs to verify, only observe.
function signedClaimOverriding(identityProvider, verifier, archive, overrides = {}) {
    const signerIdentityId = resolveSigningIdentityId(identityProvider);
    const snapshot = reconstructPublisherLeaderboardSnapshot(archive);
    const { fingerprint: snapshotFingerprint } = describePublisherLeaderboardSnapshotFingerprint(snapshot);

    let claim = new PublisherLeaderboardSnapshotClaim({
        evidenceFingerprint: snapshot.evidenceFingerprint,
        policyVersion: snapshot.policy.version,
        snapshotFingerprint,
        signerIdentityId,
        ...overrides
    });
    const signature = identityProvider.signCanonical(claim.getSigningDescriptor());
    claim = claim.withSignature(signature);

    // A genuinely overridden policyVersion/snapshotFingerprint no longer
    // reproduces from `archive` itself, so this helper only re-runs the
    // structural verification the use case itself relies on (signature
    // shape/domain), never the full semantic `matches` check — this
    // module under test never consults verification of any kind, and the
    // fixture claims below need only be genuinely, structurally SIGNED.
    const result = verifier.verifyPublisherLeaderboardSnapshotClaim(claim.toJSON());
    if (result.valid !== true) throw new Error(`signedClaimOverriding: refusing to build a structurally unsigned claim — ${result.reason}`);
    return claim;
}

function recordFor(claim, receivedAt, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
    return new LeaderboardClaimRecord({ claim, receivedAt: new Date(receivedAt), origin });
}

function findGroup(groups, fieldName, value) {
    return groups.find((entry) => entry[fieldName] === value);
}

function run() {
    const verifier = new LocalAuthorizationVerifier();

    // ---------------------------------------------------------------
    // Section A — empty history.
    // ---------------------------------------------------------------
    {
        const agreement = describePublisherLeaderboardClaimAgreement([]);
        assert(agreement.claimCount === 0, '1. empty history reports claimCount 0');
        assert(agreement.distinctClaimIdCount === 0, '2. empty history reports distinctClaimIdCount 0');
        assert(agreement.sharedSnapshotGroups.length === 0, '3. empty history reports no sharedSnapshotGroups');
        assert(agreement.sharedEvidenceGroups.length === 0, '4. empty history reports no sharedEvidenceGroups');
        assert(agreement.signerClaimGroups.length === 0, '5. empty history reports no signerClaimGroups');
        assert(agreement.differingSnapshotPairs.length === 0, '6. empty history reports no differingSnapshotPairs');
    }
    console.log('✓ Section A: an empty history reports every count at zero and every group/pair array empty');

    // ---------------------------------------------------------------
    // Section B — a single claim.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = recordFor(claim, '2026-08-29T09:00:00Z');

        const agreement = describePublisherLeaderboardClaimAgreement([record]);
        assert(agreement.claimCount === 1, '7. one claim reports claimCount 1');
        assert(agreement.distinctClaimIdCount === 1, '8. one claim reports distinctClaimIdCount 1');
        assert(agreement.sharedSnapshotGroups.length === 0, '9. a single claim shares its snapshot with nobody');
        assert(agreement.sharedEvidenceGroups.length === 0, '10. a single claim shares its evidence with nobody');
        assert(agreement.signerClaimGroups.length === 0, '11. a single claim shares its signer with nobody');
        assert(agreement.differingSnapshotPairs.length === 0, '12. a single claim has no pair to differ from');
    }
    console.log('✓ Section B: a single claim reports no relationships of any kind');

    // ---------------------------------------------------------------
    // Section C — receipt multiplicity.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = recordFor(claim, '2026-08-29T10:00:00Z');

        const history = [record, record, record];
        const agreement = describePublisherLeaderboardClaimAgreement(history);
        assert(agreement.claimCount === 3, '13. three identical receipts report claimCount 3');
        assert(agreement.distinctClaimIdCount === 1, '14. the three identical receipts still name only one distinct claim');
        assert(agreement.sharedSnapshotGroups.length === 0, '15. a claim received multiple times never forms a relationship with itself');
        assert(agreement.sharedEvidenceGroups.length === 0, '16. same — evidence grouping');
        assert(agreement.signerClaimGroups.length === 0, '17. same — signer grouping');
        assert(agreement.differingSnapshotPairs.length === 0, '18. same — differing-snapshot pairing');
    }
    console.log('✓ Section C: a claim received multiple times never produces a relationship with itself');

    // ---------------------------------------------------------------
    // Section D — sharedSnapshotGroups.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimC = signedClaimFor(bob, verifier, archive);
        assert(claimA.snapshotFingerprint === claimC.snapshotFingerprint, '19. sanity — two independent signers over the same archive genuinely share one snapshot fingerprint');

        const recordA = recordFor(claimA, '2026-08-29T11:00:00Z');
        const recordC = recordFor(claimC, '2026-08-29T11:01:00Z', PublicationObservationArchiveProvenanceOrigin.IMPORTED);

        const agreement = describePublisherLeaderboardClaimAgreement([recordA, recordC]);
        assert(agreement.sharedSnapshotGroups.length === 1, '20. the shared snapshot fingerprint produces exactly one group');
        const snapshotGroup = agreement.sharedSnapshotGroups[0];
        assert(snapshotGroup.snapshotFingerprint === claimA.snapshotFingerprint, '21. the group names the shared snapshot fingerprint');
        assert(serialize(snapshotGroup.claimIds) === serialize([claimA.id, claimC.id]), '22. the group lists both claim ids, in first-appearance order');
        assert(agreement.sharedEvidenceGroups.length === 1, '23. the shared evidence fingerprint also produces one group (a shared snapshot implies shared evidence here)');
        assert(agreement.signerClaimGroups.length === 0, '24. two DIFFERENT signers never form a signerClaimGroups entry');
        assert(agreement.differingSnapshotPairs.length === 0, '25. an identical snapshot fingerprint is never reported as a differing pair');
    }
    console.log('✓ Section D: two distinct signers over the same reproducible snapshot report a sharedSnapshotGroups entry naming both claim ids');

    // ---------------------------------------------------------------
    // Section E — signerClaimGroups.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archiveE1 = buildArchiveE1();
        const archiveE2 = buildArchiveE2();
        const claimA = signedClaimFor(alice, verifier, archiveE1);
        const claimD = signedClaimFor(alice, verifier, archiveE2);
        assert(claimA.evidenceFingerprint !== claimD.evidenceFingerprint, '26. sanity — the two archives genuinely produce different evidence fingerprints');
        assert(claimA.snapshotFingerprint !== claimD.snapshotFingerprint, '27. sanity — and therefore different snapshot fingerprints');

        const recordA = recordFor(claimA, '2026-08-29T12:00:00Z');
        const recordD = recordFor(claimD, '2026-08-29T12:01:00Z');

        const agreement = describePublisherLeaderboardClaimAgreement([recordA, recordD]);
        assert(agreement.signerClaimGroups.length === 1, '28. the shared signer produces exactly one group');
        const signerGroup = agreement.signerClaimGroups[0];
        assert(signerGroup.signerIdentityId === claimA.signerIdentityId, '29. the group names the shared signer');
        assert(serialize(signerGroup.claimIds) === serialize([claimA.id, claimD.id]), '30. the group lists both of Alice\'s claim ids, in first-appearance order');
        assert(agreement.sharedSnapshotGroups.length === 0, '31. genuinely different snapshots never form a sharedSnapshotGroups entry');
        assert(agreement.sharedEvidenceGroups.length === 0, '32. genuinely different evidence never forms a sharedEvidenceGroups entry');
        assert(agreement.differingSnapshotPairs.length === 0, '33. differingSnapshotPairs only ever pairs claims that DO share an evidence fingerprint — these do not, so no pair is reported');
    }
    console.log('✓ Section E: one signer\'s claims over genuinely different evidence report a signerClaimGroups entry, and nothing else');

    // ---------------------------------------------------------------
    // Section F — differingSnapshotPairs.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        // Claim B: the SAME evidence fingerprint as A, but a later policy
        // version and therefore a genuinely different snapshot fingerprint.
        const claimB = signedClaimOverriding(alice, verifier, archive, {
            policyVersion: claimA.policyVersion + 1,
            snapshotFingerprint: 's'.repeat(63) + '3'
        });
        assert(claimA.evidenceFingerprint === claimB.evidenceFingerprint, '34. sanity — A and B genuinely share one evidence fingerprint');
        assert(claimA.snapshotFingerprint !== claimB.snapshotFingerprint, '35. sanity — A and B genuinely name different snapshot fingerprints');

        const recordA = recordFor(claimA, '2026-08-29T13:00:00Z');
        const recordB = recordFor(claimB, '2026-08-29T13:01:00Z');

        const agreement = describePublisherLeaderboardClaimAgreement([recordA, recordB]);
        assert(agreement.sharedEvidenceGroups.length === 1, '36. the shared evidence fingerprint produces one group');
        assert(agreement.sharedSnapshotGroups.length === 0, '37. the differing snapshot fingerprints never form a sharedSnapshotGroups entry');
        assert(agreement.differingSnapshotPairs.length === 1, '38. exactly one differingSnapshotPairs entry is reported');
        const pair = agreement.differingSnapshotPairs[0];
        assert(pair.evidenceFingerprint === claimA.evidenceFingerprint, '39. the pair names the shared evidence fingerprint');
        assert(pair.claimIdA === claimA.id && pair.claimIdB === claimB.id, '40. the pair names A and B, in first-appearance order');
        assert(pair.snapshotFingerprintA === claimA.snapshotFingerprint && pair.snapshotFingerprintB === claimB.snapshotFingerprint, '41. the pair carries each claim\'s own snapshot fingerprint');
    }
    console.log('✓ Section F: two claims sharing one evidence fingerprint but naming different snapshot fingerprints report exactly one differingSnapshotPairs entry');

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const archiveE1 = buildArchiveE1();
        const archiveE2 = buildArchiveE2();

        // Claim A — Alice, evidence E1, policy 1, snapshot S1.
        const claimA = signedClaimFor(alice, verifier, archiveE1);
        // Claim B — Alice again, the SAME evidence E1, a later policy
        // version, a genuinely different snapshot fingerprint (S3).
        const claimB = signedClaimOverriding(alice, verifier, archiveE1, {
            policyVersion: claimA.policyVersion + 1,
            snapshotFingerprint: 's'.repeat(63) + '3'
        });
        // Claim C — Bob, the identical evidence/policy/snapshot as A —
        // an independent signer attesting to the same reproducible result.
        const claimC = signedClaimFor(bob, verifier, archiveE1);
        // Claim D — Carol, genuinely different evidence entirely (E2).
        const claimD = signedClaimFor(carol, verifier, archiveE2);

        assert(claimA.snapshotFingerprint === claimC.snapshotFingerprint, '42. sanity — A and C genuinely share one snapshot fingerprint');
        assert(claimA.evidenceFingerprint === claimB.evidenceFingerprint, '43. sanity — A and B genuinely share one evidence fingerprint');
        assert(claimA.snapshotFingerprint !== claimB.snapshotFingerprint, '44. sanity — A and B genuinely name different snapshot fingerprints');
        assert(claimA.evidenceFingerprint !== claimD.evidenceFingerprint, '45. sanity — A and D genuinely share nothing');

        const history = [
            recordFor(claimA, '2026-08-29T14:00:00Z'),
            recordFor(claimB, '2026-08-29T14:01:00Z'),
            recordFor(claimC, '2026-08-29T14:02:00Z', PublicationObservationArchiveProvenanceOrigin.IMPORTED),
            recordFor(claimD, '2026-08-29T14:03:00Z', PublicationObservationArchiveProvenanceOrigin.IMPORTED)
        ];
        const agreement = describePublisherLeaderboardClaimAgreement(history);

        assert(agreement.claimCount === 4, '46. FLAGSHIP — claimCount counts all four claims');
        assert(agreement.distinctClaimIdCount === 4, '47. FLAGSHIP — all four are distinct claims');

        // A ↔ C: same evidence, same policy, same snapshot, different signer.
        assert(agreement.sharedSnapshotGroups.length === 1, '48. FLAGSHIP — exactly one sharedSnapshotGroups entry (A, C)');
        assert(serialize(agreement.sharedSnapshotGroups[0].claimIds) === serialize([claimA.id, claimC.id]), '49. FLAGSHIP — that entry names exactly A and C');

        // A ↔ B ↔ C: A/B/C all share evidence E1 (B by construction, C by
        // reconstructing the same archive as A); D's evidence never joins.
        assert(agreement.sharedEvidenceGroups.length === 1, '50. FLAGSHIP — exactly one sharedEvidenceGroups entry');
        assert(serialize(agreement.sharedEvidenceGroups[0].claimIds) === serialize([claimA.id, claimB.id, claimC.id]), '51. FLAGSHIP — that entry names A, B, and C, never D');

        // A ↔ B: same signer (Alice).
        assert(agreement.signerClaimGroups.length === 1, '52. FLAGSHIP — exactly one signerClaimGroups entry (Alice\'s own A and B)');
        assert(serialize(agreement.signerClaimGroups[0].claimIds) === serialize([claimA.id, claimB.id]), '53. FLAGSHIP — that entry names exactly A and B');

        // A ↔ B differ in snapshot despite sharing evidence, and so do
        // B ↔ C (B's own overridden snapshot differs from both A's and
        // C's identical one) — EVERY differing pair drawn from the shared-
        // evidence group is reported, not only the first. A ↔ C do NOT
        // differ (identical snapshot), so that pair is absent; nothing
        // pairs with D (no shared evidence at all).
        assert(agreement.differingSnapshotPairs.length === 2, '54. FLAGSHIP — exactly two differingSnapshotPairs entries (A↔B and B↔C), never A↔C (identical snapshot) or anything involving D');
        assert(agreement.differingSnapshotPairs[0].claimIdA === claimA.id && agreement.differingSnapshotPairs[0].claimIdB === claimB.id, '55. FLAGSHIP — the first entry names A and B');
        assert(agreement.differingSnapshotPairs[1].claimIdA === claimB.id && agreement.differingSnapshotPairs[1].claimIdB === claimC.id, '56. FLAGSHIP — the second entry names B and C');
    }
    console.log('✓ Section G: FLAGSHIP — Alice\'s claim A, Alice\'s later-policy claim B over the same evidence, Bob\'s claim C matching A exactly, and Carol\'s wholly unrelated claim D, report the complete, correct set of shared-snapshot, shared-evidence, shared-signer, and differing-snapshot relationships');

    // ---------------------------------------------------------------
    // Section H — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardClaimAgreement().claimCount === 0, '57. calling with no arguments defaults to an empty history, never throws');
        assert(describePublisherLeaderboardClaimAgreement(null).claimCount === 0, '58. null history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimAgreement(undefined).claimCount === 0, '59. undefined history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimAgreement('not an array').claimCount === 0, '60. a non-array history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimAgreement(42).claimCount === 0, '61. a non-array, non-string history degrades to empty, never throws');

        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = recordFor(claim, '2026-08-29T15:00:00Z');
        const mixed = [null, undefined, {}, 'x', 42, claim, record];
        const agreement = describePublisherLeaderboardClaimAgreement(mixed);
        assert(agreement.claimCount === 1, '62. non-LeaderboardClaimRecord entries are silently excluded, leaving only the one genuine record');
    }
    console.log('✓ Section H: malformed/absent input degrades to a valid, empty-relationship result rather than throwing');

    // ---------------------------------------------------------------
    // Section I — no mutation.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimC = signedClaimFor(bob, verifier, archive);
        const recordA = recordFor(claimA, '2026-08-29T16:00:00Z');
        const recordC = recordFor(claimC, '2026-08-29T16:01:00Z');
        const history = [recordA, recordC];
        const historySnapshotBefore = history.slice();
        const recordAJsonBefore = serialize(recordA.toJSON());

        const agreement = describePublisherLeaderboardClaimAgreement(history);

        assert(serialize(history) === serialize(historySnapshotBefore), '63. the input history array is never mutated');
        assert(history[0] === recordA && history[1] === recordC, '64. the input history still holds the original record instances');
        assert(serialize(recordA.toJSON()) === recordAJsonBefore, '65. a record itself is never mutated');
        assert(Object.isFrozen(agreement), '66. the result is frozen');
        assert(Object.isFrozen(agreement.sharedSnapshotGroups), '67. sharedSnapshotGroups is frozen');
        assert(Object.isFrozen(agreement.sharedSnapshotGroups[0]), '68. each entry within sharedSnapshotGroups is itself frozen');
        assert(Object.isFrozen(agreement.sharedSnapshotGroups[0].claimIds), '69. each entry\'s own claimIds array is frozen');
        assert(Object.isFrozen(agreement.sharedEvidenceGroups), '70. sharedEvidenceGroups is frozen');
        assert(Object.isFrozen(agreement.signerClaimGroups), '71. signerClaimGroups is frozen');
        assert(Object.isFrozen(agreement.differingSnapshotPairs), '72. differingSnapshotPairs is frozen');
    }
    console.log('✓ Section I: neither the input history nor any record/claim it holds is ever mutated, and every returned object/array is frozen');

    // ---------------------------------------------------------------
    // Section J — determinism.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimC = signedClaimFor(bob, verifier, archive);
        const recordA = recordFor(claimA, '2026-08-29T17:00:00Z');
        const recordC = recordFor(claimC, '2026-08-29T17:01:00Z');
        const history = [recordA, recordA, recordC];

        const agreementOnce = describePublisherLeaderboardClaimAgreement(history);
        const agreementTwice = describePublisherLeaderboardClaimAgreement(history);
        assert(serialize(agreementOnce) === serialize(agreementTwice), '73. repeated calls on an identical history are byte-identical');

        const reconstructed = reconstructPublisherLeaderboardClaimAgreement(archiveFromClaimHistory(history));
        assert(serialize(agreementOnce) === serialize(reconstructed), '74. reconstruct() and describe() agree exactly on an identical history, now read from an archive');
    }
    console.log('✓ Section J: repeated computation over the same history produces byte-identical relationships, and reconstruct()/describe() agree');

    // ---------------------------------------------------------------
    // Section K — no verification: relationships never change with
    // current local evidence.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archiveE1 = buildArchiveE1();
        const archiveE2 = buildArchiveE2();
        const claimA = signedClaimFor(alice, verifier, archiveE1);
        const claimC = signedClaimFor(bob, verifier, archiveE1);
        const recordA = recordFor(claimA, '2026-08-29T18:00:00Z');
        const recordC = recordFor(claimC, '2026-08-29T18:01:00Z');
        const history = [recordA, recordC];

        const agreementBefore = describePublisherLeaderboardClaimAgreement(history);
        assert(findGroup(agreementBefore.sharedSnapshotGroups, 'snapshotFingerprint', claimA.snapshotFingerprint), '75. sanity — A and C start out sharing a snapshotFingerprint group');

        // A's CURRENT verification against genuinely different local
        // evidence fails...
        const verification = verifyPublisherLeaderboardSnapshotClaim(archiveE2, recordA.claim.toJSON(), verifier);
        assert(verification.signatureValid === true && verification.matches === false, '76. the claim genuinely fails verification against different local evidence');

        // ...yet the stored-claim relationships over the identical history
        // are completely unaffected — this module never even imports the
        // verification vocabulary.
        const agreementAfter = describePublisherLeaderboardClaimAgreement(history);
        assert(serialize(agreementBefore) === serialize(agreementAfter), '77. relationships are byte-identical before and after a disagreeing current verification');
    }
    console.log('✓ Section K: relationships over stored claims never change when current local evidence — and therefore current verification outcomes — changes');

    // ---------------------------------------------------------------
    // Section L — vocabulary boundary.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = recordFor(claim, '2026-08-29T19:00:00Z');
        const agreement = describePublisherLeaderboardClaimAgreement([record]);

        const keys = Object.keys(agreement).sort();
        assert(serialize(keys) === serialize([
            'claimCount',
            'distinctClaimIdCount',
            'sharedSnapshotGroups',
            'sharedEvidenceGroups',
            'signerClaimGroups',
            'differingSnapshotPairs'
        ].sort()), '78. the result carries exactly the documented, factual fields');

        const forbidden = ['valid', 'verified', 'trusted', 'trust', 'confidence', 'score', 'rank', 'reputation', 'matches', 'signatureValid', 'agree', 'agreement', 'diverge', 'divergence', 'conflict'];
        for (const term of forbidden) {
            assert(!keys.includes(term), `78. the result never carries verification/trust/evaluative vocabulary ('${term}')`);
        }

        // Note: 'agree'/'diverge' are deliberately excluded from this
        // source-level check — the exported function names themselves
        // (`describePublisherLeaderboardClaimAgreement`) legitimately
        // carry the milestone's own name. See this file's own module
        // header, "'Agreement' And 'Divergence' Name The Milestone; They
        // Never Name A Field" — the guarantee this test enforces is that
        // neither word appears in the DATA MODEL (`keys`, above), not that
        // it is absent from a function's own name.
        const moduleSource = describePublisherLeaderboardClaimAgreement.toString() + reconstructPublisherLeaderboardClaimAgreement.toString();
        for (const term of ['verif', 'trust', 'confidence', 'score', 'rank', 'reputation', 'conflict']) {
            assert(!moduleSource.toLowerCase().includes(term), `79. neither function's own source mentions forbidden vocabulary ('${term}')`);
        }
    }
    console.log('✓ Section L: the result carries no verification, trust, or evaluative vocabulary, and neither function computes any');

    console.log('\nAll PublisherLeaderboardClaimAgreementView tests passed.');
}

run();
