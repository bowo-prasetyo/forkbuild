import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { CreatePublisherLeaderboardSnapshotClaimUseCase } from '../application/CreatePublisherLeaderboardSnapshotClaimUseCase.js';
import { verifyPublisherLeaderboardSnapshotClaim } from '../application/PublisherLeaderboardSnapshotClaimVerification.js';
import { reconstructPublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import {
    describePublisherLeaderboardClaimHistoryTimeline,
    reconstructPublisherLeaderboardClaimHistoryTimeline
} from '../application/PublisherLeaderboardClaimHistoryTimelineView.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.129 — Claim History Timeline Projection.
//
// Section A: empty history — an empty, frozen timeline
// Section B: a single receipt — every field carried through exactly
// Section C: received-time ordering — entries sorted by receivedAt
// Section D: creation-time independence — claimCreatedAt never determines
//            timeline position
// Section E: equal receivedAt values retain original history-array order
// Section F: multiplicity — repeated receipts remain repeated entries
// Section G: FLAGSHIP — multiple signers/claims/creation times/receipt
//            times, plus duplicate receipts
// Section H: no mutation of the input history, its records, or the claims
//            they carry
// Section I: malformed input never throws
// Section J: determinism — repeated calls are byte-identical
// Section K: no verification — the timeline never changes with current
//            local evidence
// Section L: vocabulary boundary — no trust/verification/scoring/ranking
//            vocabulary anywhere in the result or either function's source

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
// the rest of the 0.8.121-0.8.128 family already uses.
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

// A signed claim with an EXPLICIT, caller-chosen `createdAt` — needed for
// Sections D/G, which demonstrate that timeline position tracks
// `receivedAt`, never `claimCreatedAt`. `CreatePublisherLeaderboardSnapshotClaimUseCase#execute()`
// deliberately stamps `createdAt` as "now" (0.8.121, UNCHANGED — see that
// class's own header) and offers no override, so this helper mirrors its
// exact construct-sign-verify sequence directly, the one place in this
// test file that reaches past the use case to control a signer's own
// clock.
function signedClaimAt(identityProvider, verifier, archive, createdAt) {
    const signerIdentityId = resolveSigningIdentityId(identityProvider);
    const snapshot = reconstructPublisherLeaderboardSnapshot(archive);
    const { fingerprint: snapshotFingerprint } = describePublisherLeaderboardSnapshotFingerprint(snapshot);

    let claim = new PublisherLeaderboardSnapshotClaim({
        evidenceFingerprint: snapshot.evidenceFingerprint,
        policyVersion: snapshot.policy.version,
        snapshotFingerprint,
        signerIdentityId,
        createdAt
    });
    const signature = identityProvider.signCanonical(claim.getSigningDescriptor());
    claim = claim.withSignature(signature);

    const result = verifier.verifyPublisherLeaderboardSnapshotClaim(claim.toJSON());
    if (!result.valid) throw new Error(`signedClaimAt: refusing to build an unverifiable claim — ${result.reason}`);
    return claim;
}

function run() {
    const verifier = new LocalAuthorizationVerifier();

    // ---------------------------------------------------------------
    // Section A — empty history.
    // ---------------------------------------------------------------
    {
        const timeline = describePublisherLeaderboardClaimHistoryTimeline([]);
        assert(timeline.entryCount === 0, '1. empty history reports entryCount 0');
        assert(Array.isArray(timeline.entries) && timeline.entries.length === 0, '2. empty history reports an empty entries array');
        assert(Object.isFrozen(timeline), '3. an empty timeline result is frozen');
        assert(Object.isFrozen(timeline.entries), '4. an empty timeline\'s entries array is frozen');
    }
    console.log('✓ Section A: an empty history produces an empty, frozen timeline');

    // ---------------------------------------------------------------
    // Section B — a single receipt.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimAt(alice, verifier, archive, new Date('2026-08-29T09:55:00Z'));
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T10:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });

        const timeline = describePublisherLeaderboardClaimHistoryTimeline([record]);
        assert(timeline.entryCount === 1, '5. one receipt reports entryCount 1');
        const entry = timeline.entries[0];
        assert(entry.claimId === claim.id, '6. entry.claimId matches claim.id exactly');
        assert(entry.signerIdentityId === claim.signerIdentityId, '7. entry.signerIdentityId matches claim.signerIdentityId exactly');
        assert(entry.evidenceFingerprint === claim.evidenceFingerprint, '8. entry.evidenceFingerprint matches claim.evidenceFingerprint exactly');
        assert(entry.policyVersion === claim.policyVersion, '9. entry.policyVersion matches claim.policyVersion exactly');
        assert(entry.snapshotFingerprint === claim.snapshotFingerprint, '10. entry.snapshotFingerprint matches claim.snapshotFingerprint exactly');
        assert(entry.claimCreatedAt === claim.createdAt.toISOString(), '11. entry.claimCreatedAt matches claim.createdAt exactly, as an ISO string');
        assert(entry.receivedAt === record.receivedAt.toISOString(), '12. entry.receivedAt matches record.receivedAt exactly, as an ISO string');
        assert(entry.origin === PublicationObservationArchiveProvenanceOrigin.LOCAL, '13. entry.origin matches record.origin exactly');
        assert(Object.isFrozen(entry), '14. each entry is frozen');
    }
    console.log('✓ Section B: a single receipt carries every documented field through exactly');

    // ---------------------------------------------------------------
    // Section C — received-time ordering.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(alice, verifier, archive);
        const claimC = signedClaimFor(alice, verifier, archive);

        // Appended out of receivedAt order.
        const recordC = new LeaderboardClaimRecord({ claim: claimC, receivedAt: new Date('2026-08-29T12:00:00Z') });
        const recordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T10:00:00Z') });
        const recordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T11:00:00Z') });

        const timeline = describePublisherLeaderboardClaimHistoryTimeline([recordC, recordA, recordB]);
        assert(timeline.entries.map((e) => e.claimId).join(',') === [claimA.id, claimB.id, claimC.id].join(','), '15. entries are ordered by receivedAt ascending, regardless of history-array order');
    }
    console.log('✓ Section C: entries are ordered chronologically by receivedAt');

    // ---------------------------------------------------------------
    // Section D — creation-time independence.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        // Claim A created LATE but received EARLY; claim B created EARLY
        // but received LATE — creation order is the exact inverse of
        // reception order.
        const claimA = signedClaimAt(alice, verifier, archive, new Date('2026-08-29T20:00:00Z'));
        const claimB = signedClaimAt(alice, verifier, archive, new Date('2026-08-29T08:00:00Z'));

        const recordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T10:00:00Z') });
        const recordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T11:00:00Z') });

        const timeline = describePublisherLeaderboardClaimHistoryTimeline([recordA, recordB]);
        assert(timeline.entries[0].claimId === claimA.id && timeline.entries[1].claimId === claimB.id, '16. timeline position follows receivedAt, never claimCreatedAt, even when creation order is the exact inverse of reception order');
        assert(timeline.entries[0].claimCreatedAt === claimA.createdAt.toISOString(), '17. the earlier-positioned entry still reports its own, later, claimCreatedAt unchanged');
        assert(timeline.entries[1].claimCreatedAt === claimB.createdAt.toISOString(), '18. the later-positioned entry still reports its own, earlier, claimCreatedAt unchanged');
    }
    console.log('✓ Section D: claimCreatedAt never determines timeline position — only receivedAt does');

    // ---------------------------------------------------------------
    // Section E — equal receivedAt values.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);
        const sameInstant = new Date('2026-08-29T13:00:00Z');

        const recordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: sameInstant });
        const recordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt: sameInstant });

        // B appended before A, both sharing the identical receivedAt.
        const timeline = describePublisherLeaderboardClaimHistoryTimeline([recordB, recordA]);
        assert(timeline.entries[0].claimId === claimB.id && timeline.entries[1].claimId === claimA.id, '19. equal receivedAt values retain original history-array order (B before A)');

        // Reversing the array order reverses the tie-broken result too.
        const timelineReversed = describePublisherLeaderboardClaimHistoryTimeline([recordA, recordB]);
        assert(timelineReversed.entries[0].claimId === claimA.id && timelineReversed.entries[1].claimId === claimB.id, '20. the tie-break follows history-array order, not any inherent property of the records themselves');
    }
    console.log('✓ Section E: entries sharing an identical receivedAt retain original history-array order');

    // ---------------------------------------------------------------
    // Section F — multiplicity.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const recordLocal = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T10:30:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordImported1 = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T11:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });
        const recordImported2 = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T11:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });

        const timeline = describePublisherLeaderboardClaimHistoryTimeline([recordLocal, recordImported1, recordImported2]);
        assert(timeline.entryCount === 3, '21. three receipts of the same claim report entryCount 3, never collapsed');
        assert(timeline.entries.every((e) => e.claimId === claim.id), '22. all three entries name the same claimId');
        assert(timeline.entries[0].origin === PublicationObservationArchiveProvenanceOrigin.LOCAL, '23. the first entry carries its own LOCAL origin');
        assert(timeline.entries[1].origin === PublicationObservationArchiveProvenanceOrigin.IMPORTED && timeline.entries[2].origin === PublicationObservationArchiveProvenanceOrigin.IMPORTED, '24. the two later entries each carry their own IMPORTED origin, remaining two entries rather than one');
    }
    console.log('✓ Section F: repeated receipts of the identical claim remain repeated, undeduplicated timeline entries');

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archiveE1 = buildArchiveE1();
        const archiveE2 = buildArchiveE2();

        // A: created 10:00, received 10:30
        // B: created 10:20, received 10:25
        // C: created 10:10, received 10:40
        const claimA = signedClaimAt(alice, verifier, archiveE1, new Date('2026-08-29T10:00:00Z'));
        const claimB = signedClaimAt(alice, verifier, archiveE1, new Date('2026-08-29T10:20:00Z'));
        const claimC = signedClaimAt(bob, verifier, archiveE2, new Date('2026-08-29T10:10:00Z'));

        const recordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T10:30:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T10:25:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordC = new LeaderboardClaimRecord({ claim: claimC, receivedAt: new Date('2026-08-29T10:40:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });

        // Duplicate receipt scenario for claim A, layered into the same
        // history: LOCAL at 10:30 (recordA above), then IMPORTED twice at
        // an identical, later instant.
        const sameLaterInstant = new Date('2026-08-29T11:00:00Z');
        const recordA_ImportedFirst = new LeaderboardClaimRecord({ claim: claimA, receivedAt: sameLaterInstant, origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });
        const recordA_ImportedSecond = new LeaderboardClaimRecord({ claim: claimA, receivedAt: sameLaterInstant, origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });

        const history = [recordA, recordB, recordC, recordA_ImportedFirst, recordA_ImportedSecond];
        const timeline = describePublisherLeaderboardClaimHistoryTimeline(history);

        assert(timeline.entryCount === 5, '25. FLAGSHIP — entryCount counts all five stored receipts, including the two duplicate A receipts');

        // Chronological order by receivedAt: B(10:25) -> A(10:30) -> C(10:40) -> A(11:00) -> A(11:00, tie-broken by history order).
        const claimIds = timeline.entries.map((e) => e.claimId);
        assert(claimIds[0] === claimB.id, '26. FLAGSHIP — B (received 10:25) is first, despite being created LATER than A and C');
        assert(claimIds[1] === claimA.id, '27. FLAGSHIP — A (received 10:30) is second');
        assert(claimIds[2] === claimC.id, '28. FLAGSHIP — C (received 10:40) is third');
        assert(claimIds[3] === claimA.id && claimIds[4] === claimA.id, '29. FLAGSHIP — the two duplicate, later A receipts (received 11:00) come fourth and fifth, in original history-array order');

        // Creation timestamps remain visible, unchanged, on each entry —
        // the timeline never becomes a reconstruction of signer chronology.
        assert(timeline.entries[0].claimCreatedAt === claimB.createdAt.toISOString(), '30. FLAGSHIP — B\'s own entry still reports B created 10:20');
        assert(timeline.entries[1].claimCreatedAt === claimA.createdAt.toISOString(), '31. FLAGSHIP — A\'s own entry still reports A created 10:00');
        assert(timeline.entries[2].claimCreatedAt === claimC.createdAt.toISOString(), '32. FLAGSHIP — C\'s own entry still reports C created 10:10');

        // All three A receipts remain three distinct entries.
        const receivedAtsForA = timeline.entries.filter((e) => e.claimId === claimA.id).map((e) => e.receivedAt);
        assert(receivedAtsForA.length === 3, '33. FLAGSHIP — claim A appears as three distinct timeline entries (LOCAL once, IMPORTED twice), never deduplicated');
        assert(receivedAtsForA[0] === recordA.receivedAt.toISOString(), '34. FLAGSHIP — A\'s first receipt carries its own 10:30 receivedAt');
        assert(receivedAtsForA[1] === sameLaterInstant.toISOString() && receivedAtsForA[2] === sameLaterInstant.toISOString(), '35. FLAGSHIP — A\'s two duplicate later receipts each carry the identical, shared receivedAt');
    }
    console.log('✓ Section G: FLAGSHIP — the timeline follows receipt chronology (B, A, C, A, A), never signer creation chronology, while preserving every claimCreatedAt and every duplicate receipt untouched');

    // ---------------------------------------------------------------
    // Section H — no mutation.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T16:00:00Z') });
        const history = [record];
        const historySnapshotBefore = history.slice();
        const recordJsonBefore = serialize(record.toJSON());
        const claimJsonBefore = serialize(claim.toJSON());

        const timeline = describePublisherLeaderboardClaimHistoryTimeline(history);

        assert(serialize(history) === serialize(historySnapshotBefore), '36. the input history array is never mutated');
        assert(history[0] === record, '37. the input history still holds the original record instance');
        assert(serialize(record.toJSON()) === recordJsonBefore, '38. the record itself is never mutated');
        assert(serialize(claim.toJSON()) === claimJsonBefore, '39. the underlying claim is never mutated');
        assert(Object.isFrozen(timeline), '40. the result is frozen');
        assert(Object.isFrozen(timeline.entries), '41. entries is frozen');
        assert(Object.isFrozen(timeline.entries[0]), '42. each entry within entries is itself frozen');
    }
    console.log('✓ Section H: neither the input history, its records, nor the claims they carry are ever mutated, and every returned object/array is frozen');

    // ---------------------------------------------------------------
    // Section I — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardClaimHistoryTimeline().entryCount === 0, '43. calling with no arguments defaults to an empty timeline, never throws');
        assert(describePublisherLeaderboardClaimHistoryTimeline(null).entryCount === 0, '44. null history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimHistoryTimeline(undefined).entryCount === 0, '45. undefined history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimHistoryTimeline('not an array').entryCount === 0, '46. a non-array history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimHistoryTimeline(42).entryCount === 0, '47. a non-array, non-string history degrades to empty, never throws');

        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T15:00:00Z') });
        const mixed = [null, undefined, {}, 'x', 42, claim, record];
        const timeline = describePublisherLeaderboardClaimHistoryTimeline(mixed);
        assert(timeline.entryCount === 1, '48. non-LeaderboardClaimRecord entries are silently excluded, leaving only the one genuine record');
    }
    console.log('✓ Section I: malformed/absent input degrades to a valid, empty (or partially valid) timeline result rather than throwing');

    // ---------------------------------------------------------------
    // Section J — determinism.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);
        const recordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T17:00:00Z') });
        const recordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T17:01:00Z') });
        const history = [recordA, recordA, recordB];

        const timelineOnce = describePublisherLeaderboardClaimHistoryTimeline(history);
        const timelineTwice = describePublisherLeaderboardClaimHistoryTimeline(history);
        assert(serialize(timelineOnce) === serialize(timelineTwice), '49. repeated calls on an identical history are byte-identical');

        const reconstructed = reconstructPublisherLeaderboardClaimHistoryTimeline(history);
        assert(serialize(timelineOnce) === serialize(reconstructed), '50. reconstruct() and describe() agree exactly on an identical history');
    }
    console.log('✓ Section J: repeated computation over the same history produces byte-identical timelines, and reconstruct()/describe() agree');

    // ---------------------------------------------------------------
    // Section K — no verification: the timeline never changes with
    // current local evidence.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archiveE1 = buildArchiveE1();
        const archiveE2 = buildArchiveE2();
        const claim = signedClaimFor(alice, verifier, archiveE1);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T18:00:00Z') });
        const history = [record];

        const timelineBefore = describePublisherLeaderboardClaimHistoryTimeline(history);

        // The claim's own CURRENT verification against genuinely different
        // local evidence fails...
        const verification = verifyPublisherLeaderboardSnapshotClaim(archiveE2, record.claim.toJSON(), verifier);
        assert(verification.signatureValid === true && verification.matches === false, '51. the claim genuinely fails verification against different local evidence');

        // ...yet the timeline over the identical history is completely
        // unaffected — this module never even imports the verification
        // vocabulary. The claim still appears, at the same position, with
        // the same fields.
        const timelineAfter = describePublisherLeaderboardClaimHistoryTimeline(history);
        assert(serialize(timelineBefore) === serialize(timelineAfter), '52. the timeline is byte-identical before and after a disagreeing current verification');
    }
    console.log('✓ Section K: the timeline over stored history never changes when current local evidence — and therefore current verification outcomes — changes');

    // ---------------------------------------------------------------
    // Section L — vocabulary boundary.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T19:00:00Z') });
        const timeline = describePublisherLeaderboardClaimHistoryTimeline([record]);

        const topLevelKeys = Object.keys(timeline).sort();
        assert(serialize(topLevelKeys) === serialize(['entries', 'entryCount'].sort()), '53. the result carries exactly entries/entryCount at the top level');

        const entryKeys = Object.keys(timeline.entries[0]).sort();
        assert(serialize(entryKeys) === serialize([
            'claimId',
            'signerIdentityId',
            'evidenceFingerprint',
            'policyVersion',
            'snapshotFingerprint',
            'claimCreatedAt',
            'receivedAt',
            'origin'
        ].sort()), '54. each entry carries exactly the documented, factual fields');

        const forbidden = ['valid', 'verified', 'trusted', 'trust', 'confidence', 'status', 'score', 'rank', 'reputation', 'matches', 'signatureValid', 'sequence'];
        for (const term of forbidden) {
            assert(!topLevelKeys.includes(term), `55. the top-level result never carries verification/trust/ranking/sequence vocabulary ('${term}')`);
            assert(!entryKeys.includes(term), `56. each entry never carries verification/trust/ranking/sequence vocabulary ('${term}')`);
        }

        const moduleSource = describePublisherLeaderboardClaimHistoryTimeline.toString() + reconstructPublisherLeaderboardClaimHistoryTimeline.toString();
        for (const term of ['verif', 'trust', 'confidence', 'score', 'rank', 'reputation']) {
            assert(!moduleSource.toLowerCase().includes(term), `57. neither function's own source mentions forbidden vocabulary ('${term}')`);
        }
    }
    console.log('✓ Section L: the result carries no verification, trust, scoring, ranking, or sequence vocabulary, and neither function computes any');

    console.log('\nAll PublisherLeaderboardClaimHistoryTimelineView tests passed.');
}

run();
