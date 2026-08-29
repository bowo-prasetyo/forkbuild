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
    describePublisherLeaderboardClaimEvolution,
    reconstructPublisherLeaderboardClaimEvolution
} from '../application/PublisherLeaderboardClaimEvolutionView.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.133 — Claim Evolution Projection.
//
// Section A: empty history — signerCount/claimCount zero, signerEvolutions empty
// Section B: a single claim — one signer, one claim, ordered trivially
// Section C: receipt multiplicity — the same claim received several times
//            still contributes one entry to that signer's own sequence
// Section D: one signer, two claims created out of RECEIVED order — the
//            sequence orders by claimCreatedAt, never receivedAt
// Section E: claimCreatedAt vs receivedAt remain two separate, independently
//            recoverable facts on every entry
// Section F: FLAGSHIP — three signers with different evolution patterns,
//            plus a duplicate receipt of one claim
// Section G: malformed input is tolerated, never thrown
// Section H: no mutation of the input history or its records/claims;
//            every result is frozen
// Section I: determinism; reconstruct()/describe() agree
// Section J: no verification — evolutions never change with current
//            local evidence
// Section K: vocabulary boundary — no evaluative/interpretive terms

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
// the rest of the 0.8.121-0.8.132 family already uses.
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

// A signed claim with EXPLICIT, caller-chosen `createdAt`/`policyVersion`/
// `snapshotFingerprint` overrides — needed so this file's own sections can
// script a signer's claims arriving at THIS replica in an order that
// genuinely differs from the order the signer created them in. Mirrors
// `tests/PublisherLeaderboardClaimAgreementView.test.js`'s own
// `signedClaimOverriding()` construct-sign-verify sequence exactly, adding
// only the `createdAt` override this file's own sections need.
function signedClaimOverriding(identityProvider, verifier, archive, overrides = {}) {
    const signerIdentityId = resolveSigningIdentityId(identityProvider);
    const snapshot = reconstructPublisherLeaderboardSnapshot(archive);
    const { fingerprint: snapshotFingerprint } = describePublisherLeaderboardSnapshotFingerprint(snapshot);

    let claim = new PublisherLeaderboardSnapshotClaim({
        evidenceFingerprint: snapshot.evidenceFingerprint,
        policyVersion: snapshot.policy.version,
        snapshotFingerprint,
        signerIdentityId,
        createdAt: new Date(),
        ...overrides
    });
    const signature = identityProvider.signCanonical(claim.getSigningDescriptor());
    claim = claim.withSignature(signature);

    const result = verifier.verifyPublisherLeaderboardSnapshotClaim(claim.toJSON());
    if (result.valid !== true) throw new Error(`signedClaimOverriding: refusing to build a structurally unsigned claim — ${result.reason}`);
    return claim;
}

function recordFor(claim, receivedAt, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
    return new LeaderboardClaimRecord({ claim, receivedAt: new Date(receivedAt), origin });
}

function findSigner(evolutions, signerIdentityId) {
    return evolutions.find((entry) => entry.signerIdentityId === signerIdentityId);
}

function run() {
    const verifier = new LocalAuthorizationVerifier();

    // ---------------------------------------------------------------
    // Section A — empty history.
    // ---------------------------------------------------------------
    {
        const evolution = describePublisherLeaderboardClaimEvolution([]);
        assert(evolution.signerCount === 0, '1. empty history reports signerCount 0');
        assert(evolution.claimCount === 0, '2. empty history reports claimCount 0');
        assert(evolution.signerEvolutions.length === 0, '3. empty history reports no signerEvolutions');
    }
    console.log('✓ Section A: an empty history reports every count at zero and no signerEvolutions');

    // ---------------------------------------------------------------
    // Section B — a single claim.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = recordFor(claim, '2026-08-29T09:00:00Z');

        const evolution = describePublisherLeaderboardClaimEvolution([record]);
        assert(evolution.signerCount === 1, '4. one claim reports signerCount 1');
        assert(evolution.claimCount === 1, '5. one claim reports claimCount 1');
        assert(evolution.signerEvolutions.length === 1, '6. one signerEvolutions entry');
        const aliceEvolution = evolution.signerEvolutions[0];
        assert(aliceEvolution.signerIdentityId === claim.signerIdentityId, '7. the entry names Alice');
        assert(aliceEvolution.claimCount === 1, '8. Alice has exactly one claim');
        assert(aliceEvolution.claims.length === 1, '9. Alice\'s own claims list has exactly one entry');
        assert(aliceEvolution.claims[0].claimId === claim.id, '10. the entry names the claim itself');
        assert(aliceEvolution.claims[0].claimCreatedAt === claim.createdAt.toISOString(), '11. claimCreatedAt is carried through unchanged');
        assert(aliceEvolution.claims[0].receivedAt === record.receivedAt.toISOString(), '12. receivedAt is carried through unchanged');
        assert(aliceEvolution.claims[0].evidenceFingerprint === claim.evidenceFingerprint, '13. evidenceFingerprint is carried through unchanged');
        assert(aliceEvolution.claims[0].policyVersion === claim.policyVersion, '14. policyVersion is carried through unchanged');
        assert(aliceEvolution.claims[0].snapshotFingerprint === claim.snapshotFingerprint, '15. snapshotFingerprint is carried through unchanged');
        assert(aliceEvolution.claims[0].origin === record.origin, '16. origin is carried through unchanged');
    }
    console.log('✓ Section B: a single claim reports one signer with a one-claim sequence carrying every documented field');

    // ---------------------------------------------------------------
    // Section C — receipt multiplicity.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = recordFor(claim, '2026-08-29T10:00:00Z');

        const history = [record, record, record];
        const evolution = describePublisherLeaderboardClaimEvolution(history);
        assert(evolution.claimCount === 3, '17. three identical receipts report claimCount 3');
        assert(evolution.signerCount === 1, '18. the three identical receipts still name only one signer');
        assert(evolution.signerEvolutions.length === 1, '19. still exactly one signerEvolutions entry');
        const aliceEvolution = evolution.signerEvolutions[0];
        assert(aliceEvolution.claimCount === 1, '20. Alice\'s own claimCount reports one DISTINCT claim, never three');
        assert(aliceEvolution.claims.length === 1, '21. Alice\'s own claims sequence holds exactly one entry, never three');
    }
    console.log('✓ Section C: a claim received multiple times contributes exactly one entry to that signer\'s own sequence');

    // ---------------------------------------------------------------
    // Section D — ordered by claimCreatedAt, never receivedAt.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();

        // Claim X created LATER by the signer, but RECEIVED FIRST by this
        // replica. Claim Y created EARLIER by the signer, but RECEIVED
        // SECOND. A receivedAt-ordered sequence would list X before Y; a
        // claimCreatedAt-ordered sequence lists Y before X.
        const claimX = signedClaimOverriding(alice, verifier, archive, { createdAt: new Date('2026-08-29T10:00:00Z') });
        const claimY = signedClaimOverriding(alice, verifier, archive, {
            createdAt: new Date('2026-08-29T09:00:00Z'),
            snapshotFingerprint: 's'.repeat(63) + '9'
        });

        const recordX = recordFor(claimX, '2026-08-29T11:00:00Z');
        const recordY = recordFor(claimY, '2026-08-29T11:01:00Z');

        const evolution = describePublisherLeaderboardClaimEvolution([recordX, recordY]);
        const aliceEvolution = evolution.signerEvolutions[0];
        assert(aliceEvolution.claims.length === 2, '22. Alice has two distinct claims');
        assert(aliceEvolution.claims[0].claimId === claimY.id, '23. the earlier-CREATED claim (Y) appears first, despite arriving second');
        assert(aliceEvolution.claims[1].claimId === claimX.id, '24. the later-CREATED claim (X) appears second, despite arriving first');
    }
    console.log('✓ Section D: a signer\'s own claim sequence orders by claimCreatedAt, never by this replica\'s own receivedAt');

    // ---------------------------------------------------------------
    // Section E — claimCreatedAt and receivedAt remain separate facts.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimOverriding(alice, verifier, archive, { createdAt: new Date('2026-08-29T08:00:00Z') });
        const record = recordFor(claim, '2026-08-29T12:34:56Z');

        const evolution = describePublisherLeaderboardClaimEvolution([record]);
        const entry = evolution.signerEvolutions[0].claims[0];
        assert(entry.claimCreatedAt === '2026-08-29T08:00:00.000Z', '25. claimCreatedAt reflects the signer\'s own declared creation time');
        assert(entry.receivedAt === '2026-08-29T12:34:56.000Z', '26. receivedAt reflects this replica\'s own reception time');
        assert(entry.claimCreatedAt !== entry.receivedAt, '27. the two clocks genuinely differ and neither collapses into the other');
    }
    console.log('✓ Section E: claimCreatedAt and receivedAt remain two separate, independently readable facts on every entry');

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const archiveE1 = buildArchiveE1();
        const archiveE2 = buildArchiveE2();

        // Alice: A1 -> S1, A2 -> S2, A3 -> S3 (three successive claims,
        // created in that order).
        const claimA1 = signedClaimOverriding(alice, verifier, archiveE1, {
            createdAt: new Date('2026-08-29T13:00:00Z')
        });
        const claimA2 = signedClaimOverriding(alice, verifier, archiveE1, {
            createdAt: new Date('2026-08-29T13:10:00Z'),
            snapshotFingerprint: 's'.repeat(63) + '2'
        });
        const claimA3 = signedClaimOverriding(alice, verifier, archiveE2, {
            createdAt: new Date('2026-08-29T13:20:00Z')
        });

        // Bob: B1 -> S1, B2 -> S3 (two claims, S3 shared with nobody here —
        // an independent snapshot fingerprint of Bob's own).
        const claimB1 = signedClaimOverriding(bob, verifier, archiveE1, {
            createdAt: new Date('2026-08-29T13:02:00Z')
        });
        const claimB2 = signedClaimOverriding(bob, verifier, archiveE2, {
            createdAt: new Date('2026-08-29T13:15:00Z'),
            snapshotFingerprint: 's'.repeat(63) + '3'
        });

        // Carol: C1 -> S2 (one claim only).
        const claimC1 = signedClaimOverriding(carol, verifier, archiveE1, {
            createdAt: new Date('2026-08-29T13:05:00Z'),
            snapshotFingerprint: 's'.repeat(63) + '2'
        });

        assert(claimA1.snapshotFingerprint === claimB1.snapshotFingerprint, '28. sanity — A1 and B1 genuinely share one snapshot fingerprint (S1)');
        assert(claimA2.snapshotFingerprint === claimC1.snapshotFingerprint, '29. sanity — A2 and C1 genuinely share one snapshot fingerprint (S2)');
        assert(claimA3.evidenceFingerprint !== claimA1.evidenceFingerprint, '30. sanity — A3 genuinely names different evidence than A1/A2');

        // Receipts are appended out of any tidy per-signer order, and A2
        // arrives twice — once LOCAL, once IMPORTED — to prove duplicate
        // receipts never duplicate a claim's own place in the sequence.
        const history = [
            recordFor(claimB1, '2026-08-29T14:00:00Z'),
            recordFor(claimA1, '2026-08-29T14:01:00Z'),
            recordFor(claimC1, '2026-08-29T14:02:00Z'),
            recordFor(claimA2, '2026-08-29T14:03:00Z'),
            recordFor(claimB2, '2026-08-29T14:04:00Z', PublicationObservationArchiveProvenanceOrigin.IMPORTED),
            recordFor(claimA2, '2026-08-29T14:05:00Z', PublicationObservationArchiveProvenanceOrigin.IMPORTED),
            recordFor(claimA3, '2026-08-29T14:06:00Z')
        ];

        const evolution = describePublisherLeaderboardClaimEvolution(history);

        assert(evolution.claimCount === 7, '31. FLAGSHIP — claimCount includes BOTH of A2\'s receipts (7 total receipts, one being A2\'s second arrival)');
        assert(evolution.signerCount === 3, '32. FLAGSHIP — exactly three signers');
        assert(evolution.signerEvolutions.length === 3, '33. FLAGSHIP — exactly three signerEvolutions entries');

        const aliceEvolution = findSigner(evolution.signerEvolutions, claimA1.signerIdentityId);
        const bobEvolution = findSigner(evolution.signerEvolutions, claimB1.signerIdentityId);
        const carolEvolution = findSigner(evolution.signerEvolutions, claimC1.signerIdentityId);
        assert(aliceEvolution && bobEvolution && carolEvolution, '34. FLAGSHIP — all three signers are individually findable');

        // Alice has three DISTINCT claims — A2's duplicate receipt is not
        // double-counted, and the sequence is ordered by claimCreatedAt.
        assert(aliceEvolution.claimCount === 3, '35. FLAGSHIP — Alice has three distinct claims, not four');
        assert(aliceEvolution.claims.length === 3, '36. FLAGSHIP — Alice\'s own claims sequence holds exactly three entries');
        assert(serialize(aliceEvolution.claims.map((c) => c.claimId)) === serialize([claimA1.id, claimA2.id, claimA3.id]), '37. FLAGSHIP — Alice\'s sequence is A1, A2, A3 in claimCreatedAt order');
        assert(aliceEvolution.claims[0].snapshotFingerprint === claimA1.snapshotFingerprint, '38. FLAGSHIP — Alice\'s first claim names S1');
        assert(aliceEvolution.claims[1].snapshotFingerprint === claimA2.snapshotFingerprint, '39. FLAGSHIP — Alice\'s second claim names S2');
        assert(aliceEvolution.claims[2].snapshotFingerprint === claimA3.snapshotFingerprint, '40. FLAGSHIP — Alice\'s third claim names a genuinely different snapshot (S3\')');
        assert(aliceEvolution.claims[2].evidenceFingerprint !== aliceEvolution.claims[0].evidenceFingerprint, '41. FLAGSHIP — Alice\'s evidence change (E1 -> E2) is visible on the entries themselves');
        assert(aliceEvolution.claims[0].policyVersion === claimA1.policyVersion, '42. FLAGSHIP — policyVersion is carried through per entry');

        // Bob has two distinct claims.
        assert(bobEvolution.claimCount === 2, '43. FLAGSHIP — Bob has two distinct claims');
        assert(serialize(bobEvolution.claims.map((c) => c.claimId)) === serialize([claimB1.id, claimB2.id]), '44. FLAGSHIP — Bob\'s sequence is B1, B2 in claimCreatedAt order');

        // Carol has one claim.
        assert(carolEvolution.claimCount === 1, '45. FLAGSHIP — Carol has one claim');
        assert(carolEvolution.claims[0].claimId === claimC1.id, '46. FLAGSHIP — Carol\'s one claim is C1');

        // Identical snapshots across different signers remain independently
        // attributable — Alice's A1 and Bob's B1 both name S1, each within
        // its own, separately reported signer sequence; likewise Alice's A2
        // and Carol's C1 both name S2. Neither shared snapshot fingerprint
        // merges the two signers' own sequences into one.
        assert(aliceEvolution.claims[0].snapshotFingerprint === bobEvolution.claims[0].snapshotFingerprint, '47. FLAGSHIP — A1 and B1 genuinely share one snapshot fingerprint, reported independently per signer');
        assert(aliceEvolution.claims[1].snapshotFingerprint === carolEvolution.claims[0].snapshotFingerprint, '48. FLAGSHIP — A2 and C1 genuinely share one snapshot fingerprint, reported independently per signer');

        // signerEvolutions itself is ordered by first appearance in
        // `history` (Bob's B1 receipt arrives first, then Alice's A1, then
        // Carol's C1) — never sorted by name or claim count.
        assert(serialize(evolution.signerEvolutions.map((e) => e.signerIdentityId)) === serialize([claimB1.signerIdentityId, claimA1.signerIdentityId, claimC1.signerIdentityId]), '49. FLAGSHIP — signerEvolutions is ordered by first appearance in history, never sorted');
    }
    console.log('✓ Section F: FLAGSHIP — three signers with genuinely different claim-evolution patterns, including a duplicate receipt, report the complete, correctly ordered, per-signer sequence of distinct claims');

    // ---------------------------------------------------------------
    // Section G — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardClaimEvolution().claimCount === 0, '50. calling with no arguments defaults to an empty history, never throws');
        assert(describePublisherLeaderboardClaimEvolution(null).claimCount === 0, '51. null history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimEvolution(undefined).claimCount === 0, '52. undefined history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimEvolution('not an array').claimCount === 0, '53. a non-array history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimEvolution(42).claimCount === 0, '54. a non-array, non-string history degrades to empty, never throws');

        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = recordFor(claim, '2026-08-29T15:00:00Z');
        const mixed = [null, undefined, {}, 'x', 42, claim, record];
        const evolution = describePublisherLeaderboardClaimEvolution(mixed);
        assert(evolution.claimCount === 1, '55. non-LeaderboardClaimRecord entries are silently excluded, leaving only the one genuine record');
        assert(evolution.signerCount === 1, '56. and that one genuine record still produces one signer');
    }
    console.log('✓ Section G: malformed/absent input degrades to a valid, empty-evolution result rather than throwing');

    // ---------------------------------------------------------------
    // Section H — no mutation.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);
        const recordA = recordFor(claimA, '2026-08-29T16:00:00Z');
        const recordB = recordFor(claimB, '2026-08-29T16:01:00Z');
        const history = [recordA, recordB];
        const historySnapshotBefore = history.slice();
        const recordAJsonBefore = serialize(recordA.toJSON());

        const evolution = describePublisherLeaderboardClaimEvolution(history);

        assert(serialize(history) === serialize(historySnapshotBefore), '57. the input history array is never mutated');
        assert(history[0] === recordA && history[1] === recordB, '58. the input history still holds the original record instances');
        assert(serialize(recordA.toJSON()) === recordAJsonBefore, '59. a record itself is never mutated');
        assert(Object.isFrozen(evolution), '60. the result is frozen');
        assert(Object.isFrozen(evolution.signerEvolutions), '61. signerEvolutions is frozen');
        assert(Object.isFrozen(evolution.signerEvolutions[0]), '62. each signerEvolutions entry is itself frozen');
        assert(Object.isFrozen(evolution.signerEvolutions[0].claims), '63. each entry\'s own claims array is frozen');
        assert(Object.isFrozen(evolution.signerEvolutions[0].claims[0]), '64. each claims entry is itself frozen');
    }
    console.log('✓ Section H: neither the input history nor any record/claim it holds is ever mutated, and every returned object/array is frozen');

    // ---------------------------------------------------------------
    // Section I — determinism.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);
        const recordA = recordFor(claimA, '2026-08-29T17:00:00Z');
        const recordB = recordFor(claimB, '2026-08-29T17:01:00Z');
        const history = [recordA, recordA, recordB];

        const evolutionOnce = describePublisherLeaderboardClaimEvolution(history);
        const evolutionTwice = describePublisherLeaderboardClaimEvolution(history);
        assert(serialize(evolutionOnce) === serialize(evolutionTwice), '65. repeated calls on an identical history are byte-identical');

        const reconstructed = reconstructPublisherLeaderboardClaimEvolution(archiveFromClaimHistory(history));
        assert(serialize(evolutionOnce) === serialize(reconstructed), '66. reconstruct() and describe() agree exactly on an identical history, now read from an archive');
    }
    console.log('✓ Section I: repeated computation over the same history produces byte-identical evolutions, and reconstruct()/describe() agree');

    // ---------------------------------------------------------------
    // Section J — no verification: evolutions never change with
    // current local evidence.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archiveE1 = buildArchiveE1();
        const archiveE2 = buildArchiveE2();
        const claim = signedClaimFor(alice, verifier, archiveE1);
        const record = recordFor(claim, '2026-08-29T18:00:00Z');
        const history = [record];

        const evolutionBefore = describePublisherLeaderboardClaimEvolution(history);

        // The claim's CURRENT verification against genuinely different
        // local evidence fails...
        const verification = verifyPublisherLeaderboardSnapshotClaim(archiveE2, record.claim.toJSON(), verifier);
        assert(verification.signatureValid === true && verification.matches === false, '67. the claim genuinely fails verification against different local evidence');

        // ...yet the stored-claim evolution over the identical history is
        // completely unaffected — this module never even imports the
        // verification vocabulary.
        const evolutionAfter = describePublisherLeaderboardClaimEvolution(history);
        assert(serialize(evolutionBefore) === serialize(evolutionAfter), '68. the evolution is byte-identical before and after a disagreeing current verification');
    }
    console.log('✓ Section J: a signer\'s own claim evolution never changes when current local evidence — and therefore current verification outcomes — changes');

    // ---------------------------------------------------------------
    // Section K — vocabulary boundary.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = recordFor(claim, '2026-08-29T19:00:00Z');
        const evolution = describePublisherLeaderboardClaimEvolution([record]);

        const topLevelKeys = Object.keys(evolution).sort();
        assert(serialize(topLevelKeys) === serialize(['signerCount', 'claimCount', 'signerEvolutions'].sort()), '69. the top-level result carries exactly the documented, factual fields');

        const signerKeys = Object.keys(evolution.signerEvolutions[0]).sort();
        assert(serialize(signerKeys) === serialize(['signerIdentityId', 'claimCount', 'claims'].sort()), '70. each signerEvolutions entry carries exactly the documented, factual fields');

        const claimKeys = Object.keys(evolution.signerEvolutions[0].claims[0]).sort();
        assert(serialize(claimKeys) === serialize(['claimId', 'claimCreatedAt', 'receivedAt', 'evidenceFingerprint', 'policyVersion', 'snapshotFingerprint', 'origin'].sort()), '71. each claims entry carries exactly the documented, factual fields');

        const forbidden = [
            'valid', 'verified', 'trusted', 'trust', 'confidence', 'score', 'rank', 'reputation',
            'matches', 'signatureValid', 'improved', 'regressed', 'upgraded', 'downgraded',
            'progress', 'maturity', 'quality', 'evolution', 'evolved'
        ];
        const allKeys = [...topLevelKeys, ...signerKeys, ...claimKeys];
        for (const term of forbidden) {
            assert(!allKeys.includes(term), `72. the result never carries verification/trust/evaluative/interpretive vocabulary ('${term}')`);
        }

        // Note: 'evolution'/'evolved' are deliberately excluded from the
        // source-level check below, exactly as 0.8.132's own vocabulary
        // test excludes 'agree'/'diverge' — the exported function names
        // themselves legitimately carry the milestone's own name. See this
        // file's own module header, "'Evolution' Names The Milestone; It
        // Never Names A Field" — the guarantee this test enforces is that
        // the word is absent from the DATA MODEL (the key lists above), not
        // that it is absent from a function's own name.
        const moduleSource = describePublisherLeaderboardClaimEvolution.toString() + reconstructPublisherLeaderboardClaimEvolution.toString();
        for (const term of ['verif', 'trust', 'confidence', 'score', 'rank', 'reputation', 'improv', 'regress', 'upgrad', 'downgrad', 'quality', 'maturity']) {
            assert(!moduleSource.toLowerCase().includes(term), `73. neither function's own source mentions forbidden vocabulary ('${term}')`);
        }
    }
    console.log('✓ Section K: the result carries no verification, trust, or improvement/regression vocabulary, and neither function computes any');

    console.log('\nAll PublisherLeaderboardClaimEvolutionView tests passed.');
}

run();
