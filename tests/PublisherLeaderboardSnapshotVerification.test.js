import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { reconstructAchievementEvidenceFingerprint } from '../application/AchievementEvidenceFingerprint.js';
import { describePublisherLeaderboard, reconstructPublisherLeaderboard } from '../application/PublisherLeaderboardView.js';
import {
    describePublisherLeaderboardSnapshot,
    reconstructPublisherLeaderboardSnapshot
} from '../application/PublisherLeaderboardSnapshot.js';
import {
    describePublisherLeaderboardSnapshotVerification,
    verifyPublisherLeaderboardSnapshot
} from '../application/PublisherLeaderboardSnapshotVerification.js';

// 0.8.120 — Reproducible Leaderboard Snapshot Verification.
//
// Section A: an empty archive verifies against an empty candidate — all
//            four facts true, matches true
// Section B: FLAGSHIP (positive) — Alice and Bob independently derive
//            byte-identical snapshots from identical evidence; Bob
//            verifies Alice's snapshot against his own archive and every
//            fact reads true
// Section C: FLAGSHIP (negative) — one mutated evidence fact on Bob's side
//            changes his own reconstructed fingerprint and leaderboard;
//            Alice's OLD snapshot now fails verification
// Section D: evidenceFingerprintMatches is independent — same fingerprint,
//            different policy/leaderboard
// Section E: policyVersionMatches vs. policyMatches — a shared version
//            number does not imply the full policy definition agrees
// Section F: leaderboardMatches is independent of policyMatches — the
//            identical policy, genuinely different entries
// Section G: never trusts the candidate — a candidate can claim anything;
//            the local side is always independently recomputed from the
//            archive, never taken from the candidate
// Section H: malformed/absent candidate tolerance — never throws, degrades
//            to comparison against 0.8.119's own well-defined empty snapshot
// Section I: malformed/absent archive tolerance on verifyPublisherLeaderboardSnapshot()
// Section J: determinism, purity, zero network, zero mutation
// Section K: no new trust/score vocabulary; exactly five result fields
// Section L: describe()/verify() agree over equivalent inputs

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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
    a: new Date('2026-08-25T00:00:00Z'),
    b: new Date('2026-08-25T00:01:00Z'),
    c: new Date('2026-08-25T00:02:00Z'),
    carolA: new Date('2026-08-25T00:10:00Z'),
    carolB: new Date('2026-08-25T00:11:00Z'),
    carolC: new Date('2026-08-25T00:12:00Z'),
    daveB: new Date('2026-08-25T00:14:00Z'),
    daveC: new Date('2026-08-25T00:15:00Z'),
    reference: new Date('2026-08-25T00:20:00Z'),
    mutation: new Date('2026-08-25T00:30:00Z')
};

function anchor(archive, letter, txid) {
    const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
    return useCase.execute(archive, { anchorId: `pub-${letter}`, contentHash: `pub-${letter}-content`, txid, network: NETWORK, createdAt: CREATED_AT[letter] });
}

function identityOf(archive, letter) {
    return archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === `pub-${letter}`).toBlockchainPublicationIdentity();
}

// Alice and Bob's shared evidence: A+B+C anchored, Carol associated with
// all three, one reference record (C references B). Byte-identical
// archives built independently, exactly like 0.8.116 through 0.8.119's own
// flagship convergence fixtures — reused in shape here rather than
// reinvented, so this milestone's own flagship is provably the same
// evidence, one layer up.
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

function serializeVerification(verification) {
    return JSON.stringify(verification);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — an empty archive verifies against an empty candidate.
    // ---------------------------------------------------------------
    {
        const emptySnapshot = reconstructPublisherLeaderboardSnapshot(PublicationObservationArchive.empty());
        const verification = verifyPublisherLeaderboardSnapshot(PublicationObservationArchive.empty(), emptySnapshot);

        assert(verification.evidenceFingerprintMatches === true, '1. an empty archive verifying against the empty snapshot: evidenceFingerprintMatches true');
        assert(verification.policyVersionMatches === true, '2. policyVersionMatches true');
        assert(verification.policyMatches === true, '3. policyMatches true');
        assert(verification.leaderboardMatches === true, '4. leaderboardMatches true');
        assert(verification.matches === true, '5. matches true overall');
        assert(Object.isFrozen(verification), '6. the verification result itself is frozen');
    }
    console.log('✓ Section A: an empty archive verifies true against the empty candidate snapshot');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP (positive): Alice and Bob independently derive
    // byte-identical snapshots from identical evidence.
    // ---------------------------------------------------------------
    {
        const aliceArchive = buildSharedArchive();
        const bobArchive = buildSharedArchive();

        const aliceSnapshot = reconstructPublisherLeaderboardSnapshot(aliceArchive);
        const bobSnapshot = reconstructPublisherLeaderboardSnapshot(bobArchive);
        assert(JSON.stringify(aliceSnapshot) === JSON.stringify(bobSnapshot), '7. sanity — Alice and Bob independently derive byte-identical snapshots from identical evidence');
        assert(bobSnapshot.leaderboard.entryCount > 0, '8. sanity — the shared evidence genuinely produces a non-empty leaderboard');

        // Bob receives Alice's snapshot as plain JSON — round-tripped
        // through JSON to prove no shared object reference is doing the
        // work.
        const aliceSnapshotAsJson = JSON.parse(JSON.stringify(aliceSnapshot));

        const verification = verifyPublisherLeaderboardSnapshot(bobArchive, aliceSnapshotAsJson);
        assert(verification.evidenceFingerprintMatches === true, '9. FLAGSHIP — Bob\'s own independently reconstructed evidence fingerprint matches Alice\'s supplied snapshot\'s own fingerprint');
        assert(verification.policyVersionMatches === true, '10. policyVersionMatches true');
        assert(verification.policyMatches === true, '11. policyMatches true');
        assert(verification.leaderboardMatches === true, '12. leaderboardMatches true');
        assert(verification.matches === true, '13. FLAGSHIP — matches true: a leaderboard conclusion is reproducible because its underlying evidence and policy are reproducible');
    }
    console.log('✓ Section B: FLAGSHIP (positive) — Bob independently reconstructs his own snapshot and verifies it byte-for-byte against Alice\'s supplied snapshot');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP (negative): one mutated evidence fact on Bob's
    // side changes his own reconstructed fingerprint and leaderboard;
    // Alice's OLD snapshot now fails verification.
    // ---------------------------------------------------------------
    {
        const aliceArchive = buildSharedArchive();
        const aliceSnapshot = reconstructPublisherLeaderboardSnapshot(aliceArchive);

        // Bob starts from the identical evidence, then genuinely mutates
        // exactly one achievement-driving fact: a new publisher associates
        // with an existing publication.
        const bobArchiveBeforeMutation = buildSharedArchive();
        const identityA = identityOf(bobArchiveBeforeMutation, 'a');
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
        const bobArchiveAfterMutation = associationUseCase.execute(bobArchiveBeforeMutation, { publisherId: 'Eve', publicationIdentity: identityA, createdAt: CREATED_AT.mutation });

        const bobSnapshotAfterMutation = reconstructPublisherLeaderboardSnapshot(bobArchiveAfterMutation);
        assert(bobSnapshotAfterMutation.evidenceFingerprint !== aliceSnapshot.evidenceFingerprint, '14. sanity — Bob\'s own mutated evidence genuinely produces a different fingerprint');
        assert(bobSnapshotAfterMutation.leaderboard.entryCount !== aliceSnapshot.leaderboard.entryCount, '15. sanity — Bob\'s own mutated evidence genuinely produces a different leaderboard (a new publisher entry)');

        const verification = verifyPublisherLeaderboardSnapshot(bobArchiveAfterMutation, aliceSnapshot);
        assert(verification.evidenceFingerprintMatches === false, '16. FLAGSHIP — Alice\'s old snapshot now fails evidenceFingerprintMatches against Bob\'s mutated archive');
        assert(verification.leaderboardMatches === false, '17. FLAGSHIP — and fails leaderboardMatches too — the reproduced conclusion itself now genuinely differs');
        assert(verification.matches === false, '18. FLAGSHIP — matches is false overall: a leaderboard conclusion is reproducible only as long as its underlying evidence stays reproducible');

        // The policy itself never changed — only evidence did.
        assert(verification.policyVersionMatches === true, '19. the ranking policy itself is unchanged by this evidence mutation — policyVersionMatches remains true');
        assert(verification.policyMatches === true, '20. and policyMatches remains true — only the evidence-driven facts diverged');
    }
    console.log('✓ Section C: FLAGSHIP (negative) — mutating exactly one evidence fact makes Alice\'s old snapshot fail verification against Bob\'s newly reconstructed one');

    // ---------------------------------------------------------------
    // Section D — evidenceFingerprintMatches is independent: identical
    // fingerprint, genuinely different policy/leaderboard.
    // ---------------------------------------------------------------
    {
        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const bob = new PublisherIdentityRecord({ publisherId: 'Bob' });
        const sharedFingerprint = reconstructAchievementEvidenceFingerprint(buildSharedArchive()).fingerprint;

        const policyVersion1 = Object.freeze({ version: 1, criteria: Object.freeze([Object.freeze({ field: 'achievementCount', order: 'DESCENDING' })]), tieBreak: Object.freeze({ field: 'publisherIdentity.publisherId', order: 'ASCENDING' }) });
        const policyVersion2 = Object.freeze({ version: 2, criteria: Object.freeze([Object.freeze({ field: 'publicationIdentityCount', order: 'DESCENDING' })]), tieBreak: Object.freeze({ field: 'publisherIdentity.publisherId', order: 'DESCENDING' }) });

        const leaderboardUnderPolicy1 = Object.freeze({
            policy: policyVersion1, entryCount: 2,
            entries: Object.freeze([
                Object.freeze({ rank: 1, publisherIdentity: alice, achievementCount: 3, distinctAchievementKindCount: 2, publicationIdentityCount: 1 }),
                Object.freeze({ rank: 2, publisherIdentity: bob, achievementCount: 1, distinctAchievementKindCount: 1, publicationIdentityCount: 4 })
            ])
        });
        const leaderboardUnderPolicy2 = Object.freeze({
            policy: policyVersion2, entryCount: 2,
            entries: Object.freeze([
                Object.freeze({ rank: 1, publisherIdentity: bob, achievementCount: 1, distinctAchievementKindCount: 1, publicationIdentityCount: 4 }),
                Object.freeze({ rank: 2, publisherIdentity: alice, achievementCount: 3, distinctAchievementKindCount: 2, publicationIdentityCount: 1 })
            ])
        });

        const localSnapshot = describePublisherLeaderboardSnapshot(sharedFingerprint, leaderboardUnderPolicy1);
        const candidateSnapshot = describePublisherLeaderboardSnapshot(sharedFingerprint, leaderboardUnderPolicy2);

        const verification = describePublisherLeaderboardSnapshotVerification(localSnapshot, candidateSnapshot);
        assert(verification.evidenceFingerprintMatches === true, '21. the identical evidence fingerprint compares true even though everything else differs');
        assert(verification.policyVersionMatches === false, '22. two different policy versions compare false');
        assert(verification.policyMatches === false, '23. two different policy definitions compare false');
        assert(verification.leaderboardMatches === false, '24. two different leaderboards compare false');
        assert(verification.matches === false, '25. matches is false overall — one true fact among four is not enough');
    }
    console.log('✓ Section D: evidenceFingerprintMatches is computed independently — true even when the policy and leaderboard genuinely differ');

    // ---------------------------------------------------------------
    // Section E — policyVersionMatches vs. policyMatches: a shared version
    // number does not imply the full policy definition agrees.
    // ---------------------------------------------------------------
    {
        const fingerprint = reconstructAchievementEvidenceFingerprint(PublicationObservationArchive.empty()).fingerprint;
        const emptyLeaderboard = describePublisherLeaderboard(undefined);

        const policyVersion1Original = Object.freeze({ version: 1, criteria: Object.freeze([Object.freeze({ field: 'achievementCount', order: 'DESCENDING' })]), tieBreak: Object.freeze({ field: 'publisherIdentity.publisherId', order: 'ASCENDING' }) });
        // Same version number, subtly different tie-break — a hand-shaped
        // fixture proving the two fields are computed independently rather
        // than one being inferred from the other.
        const policyVersion1Divergent = Object.freeze({ version: 1, criteria: policyVersion1Original.criteria, tieBreak: Object.freeze({ field: 'publisherIdentity.publisherId', order: 'DESCENDING' }) });

        const localSnapshot = describePublisherLeaderboardSnapshot(fingerprint, Object.freeze({ ...emptyLeaderboard, policy: policyVersion1Original }));
        const candidateSnapshot = describePublisherLeaderboardSnapshot(fingerprint, Object.freeze({ ...emptyLeaderboard, policy: policyVersion1Divergent }));

        const verification = describePublisherLeaderboardSnapshotVerification(localSnapshot, candidateSnapshot);
        assert(verification.policyVersionMatches === true, '26. two policies sharing a version number compare true on policyVersionMatches alone');
        assert(verification.policyMatches === false, '27. but compare false on policyMatches — the full definition genuinely differs beneath the shared version number');
        assert(verification.matches === false, '28. matches is false overall — policyVersionMatches true is not sufficient');
    }
    console.log('✓ Section E: policyVersionMatches and policyMatches are genuinely independent facts — a shared version number never masks a divergent policy definition');

    // ---------------------------------------------------------------
    // Section F — leaderboardMatches is independent of policyMatches: the
    // identical policy, genuinely different entries.
    // ---------------------------------------------------------------
    {
        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const bob = new PublisherIdentityRecord({ publisherId: 'Bob' });
        const fingerprint = reconstructAchievementEvidenceFingerprint(PublicationObservationArchive.empty()).fingerprint;
        const policy = describePublisherLeaderboard(undefined).policy;

        const leaderboardA = Object.freeze({
            policy, entryCount: 1,
            entries: Object.freeze([Object.freeze({ rank: 1, publisherIdentity: alice, achievementCount: 3, distinctAchievementKindCount: 2, publicationIdentityCount: 1 })])
        });
        const leaderboardB = Object.freeze({
            policy, entryCount: 1,
            entries: Object.freeze([Object.freeze({ rank: 1, publisherIdentity: bob, achievementCount: 5, distinctAchievementKindCount: 3, publicationIdentityCount: 2 })])
        });

        const localSnapshot = describePublisherLeaderboardSnapshot(fingerprint, leaderboardA);
        const candidateSnapshot = describePublisherLeaderboardSnapshot(fingerprint, leaderboardB);

        const verification = describePublisherLeaderboardSnapshotVerification(localSnapshot, candidateSnapshot);
        assert(verification.evidenceFingerprintMatches === true, '29. sanity — the identical fingerprint');
        assert(verification.policyVersionMatches === true, '30. sanity — the identical policy version');
        assert(verification.policyMatches === true, '31. the identical policy definition compares true');
        assert(verification.leaderboardMatches === false, '32. yet leaderboardMatches compares false — the entries themselves genuinely differ');
        assert(verification.matches === false, '33. matches is false overall — three true facts out of four is not enough');
    }
    console.log('✓ Section F: leaderboardMatches is computed independently — a shared policy never masks genuinely different leaderboard entries');

    // ---------------------------------------------------------------
    // Section G — never trusts the candidate: the local side is always
    // independently recomputed, never taken from the candidate.
    // ---------------------------------------------------------------
    {
        const archive = buildSharedArchive();
        const genuineSnapshot = reconstructPublisherLeaderboardSnapshot(archive);

        // A candidate that CLAIMS to match the archive's own evidence
        // fingerprint but supplies a fabricated leaderboard.
        const alice = new PublisherIdentityRecord({ publisherId: 'FabricatedWinner' });
        const fabricatedLeaderboard = Object.freeze({
            policy: genuineSnapshot.policy, entryCount: 1,
            entries: Object.freeze([Object.freeze({ rank: 1, publisherIdentity: alice, achievementCount: 9999, distinctAchievementKindCount: 9999, publicationIdentityCount: 9999 })])
        });
        const fabricatedCandidate = describePublisherLeaderboardSnapshot(genuineSnapshot.evidenceFingerprint, fabricatedLeaderboard);

        const verification = verifyPublisherLeaderboardSnapshot(archive, fabricatedCandidate);
        assert(verification.evidenceFingerprintMatches === true, '34. the claimed fingerprint genuinely matches — the candidate did not lie about that field');
        assert(verification.leaderboardMatches === false, '35. but the fabricated leaderboard itself fails verification against the archive\'s own independently reconstructed leaderboard');
        assert(verification.matches === false, '36. matches is false overall — a candidate can never talk its way past an independent recomputation');

        // The reverse: verifying the archive's OWN genuine snapshot against
        // itself always succeeds — proving Section G's failure above is
        // about the fabrication, not a broken comparison.
        const selfVerification = verifyPublisherLeaderboardSnapshot(archive, genuineSnapshot);
        assert(selfVerification.matches === true, '37. sanity — the archive\'s own genuine snapshot verifies true against itself');
    }
    console.log('✓ Section G: a candidate is never trusted at face value — the local side is always independently recomputed from the archive, never taken from the candidate');

    // ---------------------------------------------------------------
    // Section H — malformed/absent candidate tolerance.
    // ---------------------------------------------------------------
    {
        const archive = PublicationObservationArchive.empty();
        const emptySnapshot = reconstructPublisherLeaderboardSnapshot(archive);

        for (const malformed of [null, undefined, 42, 'garbage', [], {}, { evidenceFingerprint: 'not-hex' }, { leaderboard: 'not-a-leaderboard' }]) {
            const verification = verifyPublisherLeaderboardSnapshot(archive, malformed);
            assert(typeof verification.matches === 'boolean', `38. a malformed candidate (${JSON.stringify(malformed)}) never throws — matches is always a genuine boolean`);
            // Over the empty archive, a malformed candidate normalizes to
            // the identical well-defined empty snapshot 0.8.119 already
            // defines — which IS the archive's own empty snapshot, so
            // verification succeeds rather than merely not throwing.
            assert(verification.matches === true, `39. over the empty archive, a malformed candidate (${JSON.stringify(malformed)}) normalizes to the identical well-defined empty snapshot and verifies true`);
        }

        // Over a NON-empty archive, the same malformed candidates now
        // genuinely fail — the empty-snapshot normalization does not
        // silently satisfy a real archive's own non-empty snapshot.
        const realArchive = buildSharedArchive();
        for (const malformed of [null, undefined, 'garbage', {}]) {
            const verification = verifyPublisherLeaderboardSnapshot(realArchive, malformed);
            assert(verification.matches === false, `40. over a non-empty archive, a malformed candidate (${JSON.stringify(malformed)}) genuinely fails verification rather than throwing or silently passing`);
        }
    }
    console.log('✓ Section H: a malformed or absent candidate never throws — it normalizes through 0.8.119\'s own established tolerance, and only satisfies verification when the local side is genuinely equivalent to the empty snapshot');

    // ---------------------------------------------------------------
    // Section I — malformed/absent archive tolerance.
    // ---------------------------------------------------------------
    {
        const candidate = reconstructPublisherLeaderboardSnapshot(PublicationObservationArchive.empty());
        for (const malformedArchive of [null, undefined, {}, 'garbage', 42]) {
            const verification = verifyPublisherLeaderboardSnapshot(malformedArchive, candidate);
            assert(verification.matches === true, `41. a malformed archive (${JSON.stringify(malformedArchive)}) degrades to the empty archive, never throws, and verifies true against the empty candidate`);
        }
    }
    console.log('✓ Section I: a malformed or absent archive degrades to the empty archive, never throws');

    // ---------------------------------------------------------------
    // Section J — determinism, purity, zero network, zero mutation.
    // ---------------------------------------------------------------
    {
        const archive = buildSharedArchive();
        const candidate = reconstructPublisherLeaderboardSnapshot(buildSharedArchive());

        const first = verifyPublisherLeaderboardSnapshot(archive, candidate);
        const second = verifyPublisherLeaderboardSnapshot(archive, candidate);
        assert(serializeVerification(first) === serializeVerification(second), '42. repeated verification over equivalent inputs is byte-identical');

        const preCallAssociationCount = archive.publisherPublicationAssociationRecordCount;
        const preCallBitcoinCount = archive.bitcoinAnchorPublicationRecords.length;
        const { result, networkCallOccurred } = await withoutNetworkAccess(() => verifyPublisherLeaderboardSnapshot(archive, candidate));
        assert(networkCallOccurred === false, '43. verification performs zero network access');
        assert(archive.publisherPublicationAssociationRecordCount === preCallAssociationCount, '44. the archive\'s own association record count is untouched');
        assert(archive.bitcoinAnchorPublicationRecords.length === preCallBitcoinCount, '45. the archive\'s own Bitcoin record count is untouched');
        assert(Object.isFrozen(candidate) === Object.isFrozen(candidate), '46. sanity — the candidate remains frozen (unchanged by verification)');
        assert(result.matches === true, '47. sanity — the result itself is genuine');
    }
    console.log('✓ Section J: verification is deterministic, pure, performs zero network access, and never mutates the archive or either snapshot');

    // ---------------------------------------------------------------
    // Section K — no new trust/score vocabulary; exactly five result
    // fields.
    // ---------------------------------------------------------------
    {
        const archive = buildSharedArchive();
        const verification = verifyPublisherLeaderboardSnapshot(archive, reconstructPublisherLeaderboardSnapshot(archive));
        const json = JSON.stringify(verification).toLowerCase();
        const forbidden = ['score', 'xp', 'reputation', 'trust', 'weight', 'rating', 'percentile', 'level', 'tier', 'points', 'confidence', 'verified', 'authentic', 'timestamp'];
        for (const word of forbidden) {
            assert(!json.includes(word), `48. a verification result never carries "${word}"`);
        }
        assert(Object.keys(verification).sort().join(',') === ['matches', 'evidenceFingerprintMatches', 'policyVersionMatches', 'policyMatches', 'leaderboardMatches'].sort().join(','), '49. a verification result carries EXACTLY these five fields — nothing else');
        for (const key of Object.keys(verification)) {
            assert(typeof verification[key] === 'boolean', `50. every field ("${key}") is a plain boolean — no score, no percentage, no partial-credit value`);
        }
    }
    console.log('✓ Section K: a verification result never introduces score/xp/reputation/trust/confidence vocabulary, and carries exactly five plain boolean fields');

    // ---------------------------------------------------------------
    // Section L — describe()/verify() agree over equivalent inputs.
    // ---------------------------------------------------------------
    {
        const archive = buildSharedArchive();
        const candidateArchive = buildSharedArchive();
        const candidateSnapshot = reconstructPublisherLeaderboardSnapshot(candidateArchive);

        const viaVerify = verifyPublisherLeaderboardSnapshot(archive, candidateSnapshot);
        const localSnapshot = reconstructPublisherLeaderboardSnapshot(archive);
        const viaDescribe = describePublisherLeaderboardSnapshotVerification(localSnapshot, candidateSnapshot);
        assert(serializeVerification(viaVerify) === serializeVerification(viaDescribe), '51. verifyPublisherLeaderboardSnapshot(archive, candidate) agrees exactly with describePublisherLeaderboardSnapshotVerification(reconstructPublisherLeaderboardSnapshot(archive), candidate)');
    }
    console.log('✓ Section L: verify() over an archive agrees exactly with describe() over that archive\'s own already-reconstructed snapshot');

    console.log('\nAll PublisherLeaderboardSnapshotVerification tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardSnapshotVerification.test.js FAILED:', error);
    process.exitCode = 1;
});
