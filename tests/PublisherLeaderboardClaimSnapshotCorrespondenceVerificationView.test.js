import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotCorrespondence } from '../application/PublisherLeaderboardClaimSnapshotCorrespondenceView.js';
import { describePublisherLeaderboardHistoricalClaimVerification } from '../application/PublisherLeaderboardHistoricalClaimVerification.js';
import { describePublisherLeaderboardClaimSnapshotCorrespondenceVerification } from '../application/PublisherLeaderboardClaimSnapshotCorrespondenceVerificationView.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.140 — Historical Claim-to-Snapshot Correspondence Verification Projection.
//
// Section A: malformed input tolerance — no eligible pairs never touches
//            `verifier`, never throws; a genuine eligible pair with no
//            verifier throws, delegated straight to 0.8.135
// Section B: FLAGSHIP — Claim A -> S1 (fully consistent, genuine
//            signature), Claim B -> S2 (genuine signature, one asserted
//            field self-inconsistent), Claim C -> S3 (fully consistent
//            asserted fields, tampered signature), and A+S2 — no
//            correspondence, so no invented verification result
// Section C: architecture — imports only 0.8.123's record class, 0.8.139,
//            and 0.8.135; no forbidden vocabulary; order preserved; no
//            automatic selection; no mutation; determinism; zero network
//            access; every fact is byte-identical to a direct 0.8.139/
//            0.8.135 call

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
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

function makePolicy(version) {
    return Object.freeze({
        version,
        criteria: Object.freeze([Object.freeze({ field: 'achievementCount', order: 'DESCENDING' })]),
        tieBreak: Object.freeze({ field: 'publisherIdentity.publisherId', order: 'ASCENDING' })
    });
}

function makeEntry(rank, publisherIdentity, achievementCount) {
    return Object.freeze({ rank, publisherIdentity, achievementCount, distinctAchievementKindCount: 1, publicationIdentityCount: 1 });
}

function makeLeaderboard(policy, entries) {
    return Object.freeze({ policy, entryCount: entries.length, entries: Object.freeze(entries) });
}

function snapshotOf(fingerprint, leaderboard) {
    return describePublisherLeaderboardSnapshot(fingerprint, leaderboard);
}

function fingerprintOf(snapshot) {
    return describePublisherLeaderboardSnapshotFingerprint(snapshot).fingerprint;
}

const E1 = '1'.repeat(64);
const E2 = '2'.repeat(64);
const E3 = '3'.repeat(64);
const ALICE = new PublisherIdentityRecord({ publisherId: 'Alice' });
const BOB = new PublisherIdentityRecord({ publisherId: 'Bob' });
const CARL = new PublisherIdentityRecord({ publisherId: 'Carl' });

function signedClaim(identityProvider, { evidenceFingerprint, policyVersion, snapshotFingerprint, createdAt = new Date('2026-08-30T00:00:00Z') }) {
    const signerIdentityId = resolveSigningIdentityId(identityProvider);
    let claim = new PublisherLeaderboardSnapshotClaim({ evidenceFingerprint, policyVersion, snapshotFingerprint, signerIdentityId, createdAt });
    const signature = identityProvider.signCanonical(claim.getSigningDescriptor());
    return claim.withSignature(signature);
}

function tamper(claim) {
    const genuineJson = claim.toJSON();
    const tamperedJson = { ...genuineJson, signature: { ...genuineJson.signature, signature: genuineJson.signature.signature.split('').reverse().join('') } };
    return PublisherLeaderboardSnapshotClaim.fromJSON(tamperedJson);
}

function recordFor(claim, receivedAt = new Date('2026-08-30T04:00:00Z')) {
    return new LeaderboardClaimRecord({ claim, receivedAt });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — tolerance and shape.
    // ---------------------------------------------------------------
    {
        const verifier = new LocalAuthorizationVerifier();

        const empty = describePublisherLeaderboardClaimSnapshotCorrespondenceVerification(undefined, undefined, verifier);
        assert(empty.claimCount === 0 && empty.distinctClaimIdCount === 0 && empty.snapshotCount === 0 && empty.correspondenceCount === 0, '1. describeXxx(undefined, undefined, verifier) — every count is 0, never throws');
        assert(Array.isArray(empty.correspondences) && empty.correspondences.length === 0, '2. correspondences is an empty array');
        assert(Object.isFrozen(empty), '3. the empty result is frozen');

        for (const malformed of [null, 42, 'not a list', {}]) {
            const result = describePublisherLeaderboardClaimSnapshotCorrespondenceVerification(malformed, malformed, null);
            assert(result.claimCount === 0 && result.snapshotCount === 0 && result.correspondences.length === 0, `4. describeXxx(${JSON.stringify(malformed)}, ..., null) degrades to an empty result even with no verifier at all — never throwing`);
        }

        const alice = makeIdentity('Alice');
        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const claim = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) });
        const record = recordFor(claim);

        // No eligible pair exists (no snapshots supplied at all) — the
        // verifier is never touched, and this never throws even though
        // `verifier` is `null`.
        const noSnapshots = describePublisherLeaderboardClaimSnapshotCorrespondenceVerification([record], [], null);
        assert(noSnapshots.correspondenceCount === 1 && noSnapshots.correspondences[0].matchingSnapshotCount === 0, '5. a claim with no supplied snapshot is still kept, with an empty snapshotMatches, and no verifier is ever required to report that');
        assert(noSnapshots.correspondences[0].snapshotMatches.length === 0, '6. snapshotMatches is genuinely empty, never populated with an invented entry');

        // An eligible pair genuinely exists this time — the verifier
        // requirement now surfaces, delegated straight to 0.8.135.
        let threw = false;
        try { describePublisherLeaderboardClaimSnapshotCorrespondenceVerification([record], [s1], null); } catch { threw = true; }
        assert(threw, '7. once an eligible (claim, snapshot) pair genuinely exists, a missing verifier throws — delegated to 0.8.135, never silently tolerated');

        const withMalformedHistory = describePublisherLeaderboardClaimSnapshotCorrespondenceVerification(
            [null, 42, 'not a record', {}, record, claim, claim.toJSON()],
            [s1],
            verifier
        );
        assert(withMalformedHistory.claimCount === 1, '8. non-LeaderboardClaimRecord elements are silently excluded from claimCount — only the genuine record survives');
        assert(withMalformedHistory.correspondences.length === 1 && withMalformedHistory.correspondences[0].claimId === claim.id, '9. exactly one correspondence, for the one genuine record supplied');

        const withMalformedSnapshots = describePublisherLeaderboardClaimSnapshotCorrespondenceVerification([record], [null, 42, 'not a snapshot', {}, s1], verifier);
        assert(withMalformedSnapshots.snapshotCount === 5, '10. snapshotCount counts every supplied position, malformed or not');
        assert(withMalformedSnapshots.correspondences[0].snapshotMatches.length === 1 && withMalformedSnapshots.correspondences[0].snapshotMatches[0].snapshotIndex === 4, '11. only the genuine snapshot at its own position matches; malformed snapshot positions never spuriously match or need a verifier');
    }
    console.log('✓ Section A: describePublisherLeaderboardClaimSnapshotCorrespondenceVerification() tolerates non-array/malformed claimHistory and snapshots and never requires a verifier unless a genuine eligible pair exists');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP.
    //
    //   S1 = E1/P1  S2 = E2/P2  S3 = E3/P3
    //   Claim A -> S1: fully consistent asserted fields, genuine signature
    //   Claim B -> S2: genuine signature, but asserts policyVersion 99
    //              instead of S2's own P2 — corresponds by fingerprint,
    //              yet one asserted field genuinely disagrees
    //   Claim C -> S3: fully consistent asserted fields, TAMPERED signature
    //   A + S2: no correspondence at all — must never produce an
    //           invented verification result
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carl = makeIdentity('Carl');

        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
        const s3 = snapshotOf(E3, makeLeaderboard(makePolicy(3), [makeEntry(1, CARL, 7)]));
        const snapshots = [s1, s2, s3];

        assert(fingerprintOf(s1) !== fingerprintOf(s2) && fingerprintOf(s2) !== fingerprintOf(s3) && fingerprintOf(s1) !== fingerprintOf(s3), '12. sanity — all three snapshot fingerprints genuinely differ');

        const claimA = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) });
        const claimB = signedClaim(bob, { evidenceFingerprint: E2, policyVersion: 99, snapshotFingerprint: fingerprintOf(s2) });
        const claimC = tamper(signedClaim(carl, { evidenceFingerprint: E3, policyVersion: 3, snapshotFingerprint: fingerprintOf(s3) }));

        const recordA = recordFor(claimA);
        const recordB = recordFor(claimB);
        const recordC = recordFor(claimC);
        const claimHistory = [recordA, recordB, recordC];

        const verifier = new LocalAuthorizationVerifier();
        const result = describePublisherLeaderboardClaimSnapshotCorrespondenceVerification(claimHistory, snapshots, verifier);

        assert(result.claimCount === 3 && result.distinctClaimIdCount === 3 && result.snapshotCount === 3 && result.correspondenceCount === 3, '13. FLAGSHIP — three distinct claims, three supplied snapshots, three correspondence entries');

        const [entryA, entryB, entryC] = result.correspondences;

        // Case 1 — A + S1: structurally corresponding, valid signature, every fact true.
        assert(entryA.claimId === claimA.id && entryA.matchingSnapshotCount === 1, '14. FLAGSHIP Case 1 — Claim A corresponds to exactly one supplied snapshot');
        const matchA = entryA.snapshotMatches[0];
        assert(matchA.snapshotIndex === 0, '15. FLAGSHIP Case 1 — Claim A corresponds to S1, at its supplied index 0');
        assert(matchA.association.evidenceFingerprintMatches === true && matchA.association.policyVersionMatches === true && matchA.association.snapshotFingerprintMatches === true, '16. FLAGSHIP Case 1 — association: every structural fact true');
        assert(matchA.verification.signatureValid === true, '17. FLAGSHIP Case 1 — verification: genuine signature');
        assert(matchA.verification.evidenceFingerprintMatches === true && matchA.verification.policyVersionMatches === true && matchA.verification.snapshotFingerprintMatches === true, '18. FLAGSHIP Case 1 — verification: every semantic fact true');
        assert(matchA.verification.matches === true, '19. FLAGSHIP Case 1 — verification: matches is true — everything about Claim A agrees with S1');

        // Case 2 — B + S2: structurally corresponding, valid signature, one asserted field differs.
        assert(entryB.claimId === claimB.id && entryB.matchingSnapshotCount === 1, '20. FLAGSHIP Case 2 — Claim B corresponds to exactly one supplied snapshot');
        const matchB = entryB.snapshotMatches[0];
        assert(matchB.snapshotIndex === 1, '21. FLAGSHIP Case 2 — Claim B corresponds to S2, at its supplied index 1 — kept by complete snapshotFingerprint agreement despite the field mismatch below');
        assert(matchB.association.snapshotFingerprintMatches === true, '22. FLAGSHIP Case 2 — association: snapshotFingerprintMatches true — this is WHY the pair was kept at all');
        assert(matchB.association.evidenceFingerprintMatches === true, '23. FLAGSHIP Case 2 — association: evidenceFingerprintMatches true — Claim B genuinely asserts S2\'s own evidence');
        assert(matchB.association.policyVersionMatches === false, '24. FLAGSHIP Case 2 — association: policyVersionMatches FALSE — Claim B asserts policyVersion 99, S2\'s own policy is 2');
        assert(matchB.verification.signatureValid === true, '25. FLAGSHIP Case 2 — verification: genuine signature — Bob genuinely signed exactly this claim');
        assert(matchB.verification.policyVersionMatches === false, '26. FLAGSHIP Case 2 — verification: the SAME field mismatch surfaces on the verification layer too, independently computed');
        assert(matchB.verification.matches === false, '27. FLAGSHIP Case 2 — verification: matches is false — the pair genuinely corresponds, yet does not fully verify');
        assert(matchB.association.policyVersionMatches === matchB.verification.policyVersionMatches, '28. FLAGSHIP Case 2 — the two independently-computed layers agree with each other on this fact, as they must for a field 0.8.135 and 0.8.137 both compare identically');

        // Case 3 — C + S3: structurally corresponding, tampered/invalid signature, semantic identity still corresponds.
        assert(entryC.claimId === claimC.id && entryC.matchingSnapshotCount === 1, '29. FLAGSHIP Case 3 — Claim C corresponds to exactly one supplied snapshot');
        const matchC = entryC.snapshotMatches[0];
        assert(matchC.snapshotIndex === 2, '30. FLAGSHIP Case 3 — Claim C corresponds to S3, at its supplied index 2');
        assert(matchC.association.evidenceFingerprintMatches === true && matchC.association.policyVersionMatches === true && matchC.association.snapshotFingerprintMatches === true, '31. FLAGSHIP Case 3 — association: every structural fact true — a forged/corrupted signature never changes what the claim\'s own fields assert');
        assert(matchC.verification.signatureValid === false, '32. FLAGSHIP Case 3 — verification: signatureValid FALSE — the signature bytes were tampered');
        assert(matchC.verification.evidenceFingerprintMatches === true && matchC.verification.policyVersionMatches === true && matchC.verification.snapshotFingerprintMatches === true, '33. FLAGSHIP Case 3 — verification: the three semantic facts remain independently true, exactly like association — the claim describes this snapshot structurally, but its signature is invalid');
        assert(matchC.verification.matches === false, '34. FLAGSHIP Case 3 — verification: matches is false overall, purely because of the invalid signature, never because of a semantic disagreement');

        // Case 4 — A + S2: no correspondence, so no invented verification result.
        assert(entryA.snapshotMatches.length === 1, '35. FLAGSHIP Case 4 — Claim A has exactly ONE snapshotMatches entry — nothing invented for the (A, S2) pair 0.8.139 itself never discovered');
        assert(!entryA.snapshotMatches.some((match) => match.snapshotIndex === 1), '36. FLAGSHIP Case 4 — no snapshotMatches entry names S2 (index 1) for Claim A — "these don\'t correspond" is never silently turned into "verification failed"');

        // Cross-check every fact against direct 0.8.139/0.8.135 calls —
        // this file re-derives nothing.
        const directCorrespondence = describePublisherLeaderboardClaimSnapshotCorrespondence(claimHistory, snapshots);
        assert(serialize(directCorrespondence.correspondences[1].snapshotMatches[0]) === serialize({ snapshotIndex: matchB.snapshotIndex, ...matchB.association }), '37. FLAGSHIP — Claim B\'s association facts are byte-identical to a direct 0.8.139 call');
        const directVerification = describePublisherLeaderboardHistoricalClaimVerification(recordC, s3, verifier);
        assert(matchC.verification.signatureValid === directVerification.signatureValid && matchC.verification.matches === directVerification.matches, '38. FLAGSHIP — Claim C\'s verification facts are byte-identical to a direct 0.8.135 call against the identical pair');
    }
    console.log('✓ Section B: FLAGSHIP — A+S1 fully agrees, B+S2 corresponds but one asserted field disagrees, C+S3 corresponds structurally despite a tampered signature, and A+S2 (no correspondence) never produces an invented verification result');

    // ---------------------------------------------------------------
    // Section C — architecture, order, no automatic selection, no
    // mutation, determinism, vocabulary, network access.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotCorrespondenceVerificationView.js', import.meta.url), 'utf8');
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 3, '39. this file has exactly three imports');
        assert(importLines.some((line) => line.includes("from './LeaderboardClaimRecord.js'")), '40. imports LeaderboardClaimRecord (0.8.123, UNCHANGED)');
        assert(importLines.some((line) => line.includes("from './PublisherLeaderboardClaimSnapshotCorrespondenceView.js'")), '41. imports 0.8.139\'s own correspondence view');
        assert(importLines.some((line) => line.includes("from './PublisherLeaderboardHistoricalClaimVerification.js'")), '42. imports 0.8.135\'s own historical verification');
        for (const forbiddenModule of ['PublisherLeaderboardClaimSnapshotAssociationView', 'PublisherLeaderboardSnapshotClaimVerification', 'LocalIdentityProvider', 'PublicationObservationArchive', 'PublisherLeaderboardRankingPolicy', 'resolveSigningIdentityId', 'PublisherLeaderboardSnapshotTimelineView', 'PublisherLeaderboardClaimSnapshotAssociationHistoryView']) {
            assert(!importLines.some((line) => line.includes(forbiddenModule)), `43. this file never imports ${forbiddenModule} — no second correspondence/verification engine, no signing/identity/archive/ranking/timeline import`);
        }
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!codeOnly.includes('.sort('), '44. no `.sort()` anywhere in this file\'s own code — claim and snapshot order is never reordered');
        assert(!codeOnly.includes('.verify'), '45. no direct verifier method call anywhere in this file\'s own code — `verifier` is only ever handed to 0.8.135, never invoked directly');

        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
        const claimAlice = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) });
        const claimBob = signedClaim(bob, { evidenceFingerprint: E2, policyVersion: 2, snapshotFingerprint: fingerprintOf(s2) });
        const recordAlice = recordFor(claimAlice);
        const recordBob = recordFor(claimBob);
        const verifier = new LocalAuthorizationVerifier();

        // Out-of-order supply on both axes — never resorted.
        const outOfOrder = describePublisherLeaderboardClaimSnapshotCorrespondenceVerification([recordBob, recordAlice], [s2, s1], verifier);
        assert(outOfOrder.correspondences[0].claimId === claimBob.id && outOfOrder.correspondences[1].claimId === claimAlice.id, '46. correspondences preserve claimHistory\'s own supplied order — Claim Bob first because it was supplied first');
        assert(outOfOrder.correspondences[0].snapshotMatches[0].snapshotIndex === 0, '47. Claim Bob\'s match names S2\'s own supplied position (index 0)');
        assert(outOfOrder.correspondences[1].snapshotMatches[0].snapshotIndex === 1, '48. Claim Alice\'s match names S1\'s own supplied position (index 1) — snapshots are never resorted either');

        const historyJsonBefore = serialize(recordAlice.toJSON()) + serialize(recordBob.toJSON());
        const snapshotsJsonBefore = serialize([s1, s2]);
        describePublisherLeaderboardClaimSnapshotCorrespondenceVerification([recordAlice, recordBob], [s1, s2], verifier);
        assert(serialize(recordAlice.toJSON()) + serialize(recordBob.toJSON()) === historyJsonBefore, '49. neither claim record is ever mutated');
        assert(serialize([s1, s2]) === snapshotsJsonBefore, '50. neither supplied snapshot is ever mutated');
        assert(Object.isFrozen(recordAlice) && Object.isFrozen(recordBob), '51. records remain frozen');

        const first = describePublisherLeaderboardClaimSnapshotCorrespondenceVerification([recordAlice, recordBob], [s1, s2], verifier);
        const second = describePublisherLeaderboardClaimSnapshotCorrespondenceVerification([recordAlice, recordBob], [s1, s2], verifier);
        assert(serialize(first) === serialize(second), '52. repeated calls with identical input are byte-identical');
        assert(Object.isFrozen(first) && Object.isFrozen(first.correspondences) && Object.isFrozen(first.correspondences[0].snapshotMatches), '53. the result, its correspondences array, and each entry\'s snapshotMatches array are all frozen');
        assert(Object.isFrozen(first.correspondences[0].snapshotMatches[0].association) && Object.isFrozen(first.correspondences[0].snapshotMatches[0].verification), '54. each match\'s association and verification objects are both frozen');

        const forbiddenVocabulary = ['trusted', 'validclaim', 'trustedsnapshot', 'confidence', 'reputation', 'score', 'rank', 'quality', 'worthiness', 'authority', 'authoritative', 'best', 'closest'];
        const projectionText = serialize(first).toLowerCase();
        for (const word of forbiddenVocabulary) {
            assert(!projectionText.includes(word), `55. the projection's own output never carries "${word}"`);
        }

        const { result, networkCallOccurred } = await withoutNetworkAccess(() => describePublisherLeaderboardClaimSnapshotCorrespondenceVerification([recordAlice, recordBob], [s1, s2], verifier));
        assert(networkCallOccurred === false, '56. building a correspondence verification performs zero network access');
        assert(result.correspondences[0].snapshotMatches[0].verification.matches === true, '57. sanity — the result itself is genuine');
    }
    console.log('✓ Section C: imports only 0.8.123\'s record class, 0.8.139\'s correspondence view, and 0.8.135\'s historical verification; claim/snapshot order is always preserved, no automatic selection, no mutation, deterministic, no forbidden vocabulary, zero network access');

    console.log('\nAll PublisherLeaderboardClaimSnapshotCorrespondenceVerificationView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotCorrespondenceVerificationView.test.js FAILED:', error);
    process.exitCode = 1;
});
