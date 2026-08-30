import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimEvolution } from '../application/PublisherLeaderboardClaimEvolutionView.js';
import { describePublisherLeaderboardClaimSnapshotCorrespondenceVerification } from '../application/PublisherLeaderboardClaimSnapshotCorrespondenceVerificationView.js';
import { describePublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolution } from '../application/PublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolutionView.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.141 — Historical Claim Verification Evolution Projection.
//
// Section A: malformed input tolerance — no eligible pairs never touches
//            `verifier`, never throws; a genuine eligible pair with no
//            verifier throws, delegated straight to 0.8.140
// Section B: FLAGSHIP — Alice's own four-claim sequence: Claim A -> S1
//            (fully consistent, genuine signature), Claim B -> S2 (genuine
//            signature, one asserted field self-inconsistent), Claim C ->
//            S3 (fully consistent asserted fields, tampered signature),
//            Claim D -> no corresponding snapshot — plus duplicate
//            receipts of A and B proving they never inflate the signer's
//            own distinct claim sequence
// Section C: architecture — imports only 0.8.133 and 0.8.140; no forbidden
//            vocabulary (including no improvement/regression/trend
//            vocabulary); order preserved; no mutation; determinism; zero
//            network access; every fact byte-identical to a direct
//            0.8.133/0.8.140 call

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
const E4 = '4'.repeat(64);
const ALICE = new PublisherIdentityRecord({ publisherId: 'Alice' });
const BOB = new PublisherIdentityRecord({ publisherId: 'Bob' });
const CARL = new PublisherIdentityRecord({ publisherId: 'Carl' });
const DAVE = new PublisherIdentityRecord({ publisherId: 'Dave' });

function signedClaim(identityProvider, { evidenceFingerprint, policyVersion, snapshotFingerprint, createdAt }) {
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

        const empty = describePublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolution(undefined, undefined, verifier);
        assert(empty.signerCount === 0 && empty.claimCount === 0 && empty.distinctClaimIdCount === 0 && empty.snapshotCount === 0, '1. describeXxx(undefined, undefined, verifier) — every count is 0, never throws');
        assert(Array.isArray(empty.signerEvolutions) && empty.signerEvolutions.length === 0, '2. signerEvolutions is an empty array');
        assert(Object.isFrozen(empty), '3. the empty result is frozen');

        for (const malformed of [null, 42, 'not a list', {}]) {
            const result = describePublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolution(malformed, malformed, null);
            assert(result.signerCount === 0 && result.claimCount === 0 && result.signerEvolutions.length === 0, `4. describeXxx(${JSON.stringify(malformed)}, ..., null) degrades to an empty result even with no verifier at all — never throwing`);
        }

        const alice = makeIdentity('Alice');
        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const claim = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1), createdAt: new Date('2026-08-30T00:00:00Z') });
        const record = recordFor(claim);

        // No eligible pair exists (no snapshots supplied at all) — the
        // verifier is never touched, and this never throws even though
        // `verifier` is `null`.
        const noSnapshots = describePublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolution([record], [], null);
        assert(noSnapshots.signerEvolutions.length === 1 && noSnapshots.signerEvolutions[0].claims[0].matchingSnapshotCount === 0, '5. a claim with no supplied snapshot is still kept in its signer\'s sequence, with an empty snapshotMatches, and no verifier is ever required to report that');
        assert(noSnapshots.signerEvolutions[0].claims[0].snapshotMatches.length === 0, '6. snapshotMatches is genuinely empty, never populated with an invented entry');

        // An eligible pair genuinely exists this time — the verifier
        // requirement now surfaces, delegated straight to 0.8.140.
        let threw = false;
        try { describePublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolution([record], [s1], null); } catch { threw = true; }
        assert(threw, '7. once an eligible (claim, snapshot) pair genuinely exists, a missing verifier throws — delegated to 0.8.140, never silently tolerated');

        const withMalformedHistory = describePublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolution(
            [null, 42, 'not a record', {}, record, claim, claim.toJSON()],
            [s1],
            verifier
        );
        assert(withMalformedHistory.claimCount === 1, '8. non-LeaderboardClaimRecord elements are silently excluded from claimCount — only the genuine record survives');
        assert(withMalformedHistory.signerEvolutions.length === 1 && withMalformedHistory.signerEvolutions[0].claims.length === 1, '9. exactly one signer, one claim, for the one genuine record supplied');
    }
    console.log('✓ Section A: describePublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolution() tolerates non-array/malformed claimHistory and snapshots and never requires a verifier unless a genuine eligible pair exists');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP.
    //
    //   Alice's own successive claims:
    //   Claim A -> S1: fully consistent asserted fields, genuine signature
    //   Claim B -> S2: genuine signature, but asserts policyVersion 99
    //              instead of S2's own P2 — corresponds by fingerprint,
    //              yet one asserted field genuinely disagrees
    //   Claim C -> S3: fully consistent asserted fields, TAMPERED signature
    //   Claim D -> no corresponding snapshot at all
    //   Duplicate receipts of A and B are also stored, proving they never
    //   inflate Alice's own distinct claim sequence.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');

        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
        const s3 = snapshotOf(E3, makeLeaderboard(makePolicy(3), [makeEntry(1, CARL, 7)]));
        const snapshots = [s1, s2, s3];

        const T1 = new Date('2026-08-01T00:00:00Z');
        const T2 = new Date('2026-08-02T00:00:00Z');
        const T3 = new Date('2026-08-03T00:00:00Z');
        const T4 = new Date('2026-08-04T00:00:00Z');

        const claimA = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1), createdAt: T1 });
        const claimB = signedClaim(alice, { evidenceFingerprint: E2, policyVersion: 99, snapshotFingerprint: fingerprintOf(s2), createdAt: T2 });
        const claimC = tamper(signedClaim(alice, { evidenceFingerprint: E3, policyVersion: 3, snapshotFingerprint: fingerprintOf(s3), createdAt: T3 }));
        // Claim D names a snapshot fingerprint nobody supplied — computed
        // over a leaderboard never placed into `snapshots`.
        const unsuppliedSnapshot = snapshotOf(E4, makeLeaderboard(makePolicy(4), [makeEntry(1, DAVE, 9)]));
        const claimD = signedClaim(alice, { evidenceFingerprint: E4, policyVersion: 4, snapshotFingerprint: fingerprintOf(unsuppliedSnapshot), createdAt: T4 });

        const recordA = recordFor(claimA, new Date('2026-08-01T04:00:00Z'));
        const recordADuplicate = recordFor(claimA, new Date('2026-08-01T05:00:00Z'));
        const recordB = recordFor(claimB, new Date('2026-08-02T04:00:00Z'));
        const recordBDuplicate = recordFor(claimB, new Date('2026-08-02T05:00:00Z'));
        const recordC = recordFor(claimC, new Date('2026-08-03T04:00:00Z'));
        const recordD = recordFor(claimD, new Date('2026-08-04T04:00:00Z'));

        const claimHistory = [recordA, recordADuplicate, recordB, recordBDuplicate, recordC, recordD];

        const verifier = new LocalAuthorizationVerifier();
        const result = describePublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolution(claimHistory, snapshots, verifier);

        assert(result.claimCount === 6, '10. FLAGSHIP — claimCount counts every RECEIPT, duplicates included (6 receipts)');
        assert(result.distinctClaimIdCount === 4, '11. FLAGSHIP — distinctClaimIdCount counts DISTINCT claims (A, B, C, D)');
        assert(result.snapshotCount === 3, '12. FLAGSHIP — snapshotCount counts the three supplied snapshots');
        assert(result.signerCount === 1, '13. FLAGSHIP — exactly one signer, Alice');

        assert(result.signerEvolutions.length === 1, '14. FLAGSHIP — exactly one signerEvolutions entry');
        const aliceEvolution = result.signerEvolutions[0];
        assert(aliceEvolution.signerIdentityId === resolveSigningIdentityId(alice), '15. FLAGSHIP — the signerEvolutions entry names Alice\'s own identity id');
        assert(aliceEvolution.claimCount === 4, '16. FLAGSHIP — Alice\'s own claimCount counts DISTINCT claims (4), never inflated by the two duplicate receipts');
        assert(aliceEvolution.claims.length === 4, '17. FLAGSHIP — Alice\'s own claims list holds exactly 4 entries — duplicate receipts never create duplicate evolution entries');

        const [entryA, entryB, entryC, entryD] = aliceEvolution.claims;
        assert(entryA.claimId === claimA.id && entryB.claimId === claimB.id && entryC.claimId === claimC.id && entryD.claimId === claimD.id, '18. FLAGSHIP — claims are ordered A, B, C, D by claimCreatedAt, exactly 0.8.133\'s own ordering');

        // Case 1 — Claim A: structurally associated, valid signature, semantic match.
        assert(entryA.matchingSnapshotCount === 1, '19. FLAGSHIP Case 1 — Claim A corresponds to exactly one supplied snapshot');
        const matchA = entryA.snapshotMatches[0];
        assert(matchA.snapshotIndex === 0, '20. FLAGSHIP Case 1 — Claim A corresponds to S1, at its supplied index 0');
        assert(matchA.association.evidenceFingerprintMatches === true && matchA.association.policyVersionMatches === true && matchA.association.snapshotFingerprintMatches === true, '21. FLAGSHIP Case 1 — association: every structural fact true');
        assert(matchA.verification.signatureValid === true, '22. FLAGSHIP Case 1 — verification: genuine signature');
        assert(matchA.verification.matches === true, '23. FLAGSHIP Case 1 — verification: matches is true — everything about Claim A agrees with S1');

        // Case 2 — Claim B: structurally associated, valid signature, semantic mismatch.
        assert(entryB.matchingSnapshotCount === 1, '24. FLAGSHIP Case 2 — Claim B corresponds to exactly one supplied snapshot');
        const matchB = entryB.snapshotMatches[0];
        assert(matchB.snapshotIndex === 1, '25. FLAGSHIP Case 2 — Claim B corresponds to S2, at its supplied index 1');
        assert(matchB.association.snapshotFingerprintMatches === true, '26. FLAGSHIP Case 2 — association: snapshotFingerprintMatches true — this is WHY the pair was kept at all');
        assert(matchB.association.policyVersionMatches === false, '27. FLAGSHIP Case 2 — association: policyVersionMatches FALSE — Claim B asserts policyVersion 99, S2\'s own policy is 2');
        assert(matchB.verification.signatureValid === true, '28. FLAGSHIP Case 2 — verification: genuine signature — Alice genuinely signed exactly this claim');
        assert(matchB.verification.matches === false, '29. FLAGSHIP Case 2 — verification: matches is false — the pair genuinely corresponds, yet does not fully verify');

        // Case 3 — Claim C: structurally associated, invalid signature, semantic match.
        assert(entryC.matchingSnapshotCount === 1, '30. FLAGSHIP Case 3 — Claim C corresponds to exactly one supplied snapshot');
        const matchC = entryC.snapshotMatches[0];
        assert(matchC.snapshotIndex === 2, '31. FLAGSHIP Case 3 — Claim C corresponds to S3, at its supplied index 2');
        assert(matchC.association.evidenceFingerprintMatches === true && matchC.association.policyVersionMatches === true && matchC.association.snapshotFingerprintMatches === true, '32. FLAGSHIP Case 3 — association: every structural fact true — a tampered signature never changes what the claim\'s own fields assert');
        assert(matchC.verification.signatureValid === false, '33. FLAGSHIP Case 3 — verification: signatureValid FALSE — the signature bytes were tampered');
        assert(matchC.verification.evidenceFingerprintMatches === true && matchC.verification.policyVersionMatches === true && matchC.verification.snapshotFingerprintMatches === true, '34. FLAGSHIP Case 3 — verification: the three semantic facts remain independently true');
        assert(matchC.verification.matches === false, '35. FLAGSHIP Case 3 — verification: matches is false overall, purely because of the invalid signature');

        // Case 4 — Claim D: no corresponding snapshot at all.
        assert(entryD.matchingSnapshotCount === 0, '36. FLAGSHIP Case 4 — Claim D has zero corresponding snapshots');
        assert(Array.isArray(entryD.snapshotMatches) && entryD.snapshotMatches.length === 0, '37. FLAGSHIP Case 4 — snapshotMatches is genuinely empty, never a fabricated "verificationFailed" entry');
        assert(!('verificationFailed' in entryD), '38. FLAGSHIP Case 4 — no verificationFailed field is ever invented for a claim with no corresponding snapshot');

        // No improvement/regression/trend vocabulary anywhere on the result.
        const projectionText = serialize(result).toLowerCase();
        for (const word of ['improved', 'regressed', 'upgraded', 'downgraded', 'progress', 'trajectory', 'trend', 'declining', 'trustdeclining', 'verificationfailed']) {
            assert(!projectionText.includes(word), `39. FLAGSHIP — the projection's own output never carries "${word}"`);
        }

        // Cross-check every fact against direct 0.8.133/0.8.140 calls —
        // this file re-derives nothing.
        const directEvolution = describePublisherLeaderboardClaimEvolution(claimHistory);
        assert(serialize(directEvolution.signerEvolutions[0].claims.map(({ claimId, claimCreatedAt }) => ({ claimId, claimCreatedAt }))) === serialize(aliceEvolution.claims.map(({ claimId, claimCreatedAt }) => ({ claimId, claimCreatedAt }))), '40. FLAGSHIP — claim identity/ordering is byte-identical to a direct 0.8.133 call');
        const directCorrespondenceVerification = describePublisherLeaderboardClaimSnapshotCorrespondenceVerification(claimHistory, snapshots, verifier);
        const directEntryB = directCorrespondenceVerification.correspondences.find((entry) => entry.claimId === claimB.id);
        assert(serialize(directEntryB.snapshotMatches) === serialize(entryB.snapshotMatches), '41. FLAGSHIP — Claim B\'s snapshotMatches are byte-identical to a direct 0.8.140 call');
    }
    console.log('✓ Section B: FLAGSHIP — Alice\'s own four-claim sequence preserves fully-matching, semantically-mismatched, signature-tampered, and unsupplied-snapshot cases distinctly, and duplicate receipts never inflate her own distinct claim sequence');

    // ---------------------------------------------------------------
    // Section C — architecture, order, no mutation, determinism,
    // vocabulary, network access.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolutionView.js', import.meta.url), 'utf8');
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 2, '42. this file has exactly two imports');
        assert(importLines.some((line) => line.includes("from './PublisherLeaderboardClaimEvolutionView.js'")), '43. imports 0.8.133\'s own claim evolution view');
        assert(importLines.some((line) => line.includes("from './PublisherLeaderboardClaimSnapshotCorrespondenceVerificationView.js'")), '44. imports 0.8.140\'s own correspondence verification view');
        for (const forbiddenModule of ['LeaderboardClaimRecord', 'PublisherLeaderboardClaimSnapshotAssociationView', 'PublisherLeaderboardClaimSnapshotCorrespondenceView', 'PublisherLeaderboardHistoricalClaimVerification', 'PublisherLeaderboardSnapshotClaimVerification', 'PublisherLeaderboardClaimAgreementView', 'LocalIdentityProvider', 'PublicationObservationArchive', 'PublisherLeaderboardRankingPolicy', 'resolveSigningIdentityId', 'PublisherLeaderboardSnapshotTimelineView', 'PublisherLeaderboardClaimSnapshotAssociationHistoryView']) {
            assert(!importLines.some((line) => line.includes(forbiddenModule)), `45. this file never imports ${forbiddenModule} — no second evolution/correspondence/verification engine, no signing/identity/archive/ranking/timeline import`);
        }
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!codeOnly.includes('.sort('), '46. no `.sort()` anywhere in this file\'s own code — claim, signer, and snapshot order is never reordered');
        assert(!codeOnly.includes('.verify'), '47. no direct verifier method call anywhere in this file\'s own code — `verifier` is only ever handed to 0.8.140, never invoked directly');
        assert(!codeOnly.toLowerCase().includes('reconstruct'), '48. no reconstruct variant — matching 0.8.139\'s/0.8.140\'s own choice');

        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
        const claimAlice = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1), createdAt: new Date('2026-08-01T00:00:00Z') });
        const claimBob = signedClaim(bob, { evidenceFingerprint: E2, policyVersion: 2, snapshotFingerprint: fingerprintOf(s2), createdAt: new Date('2026-08-02T00:00:00Z') });
        const recordAlice = recordFor(claimAlice);
        const recordBob = recordFor(claimBob);
        const verifier = new LocalAuthorizationVerifier();

        // Out-of-order supply on both axes — signer order follows first
        // appearance in claimHistory, snapshots are never resorted.
        const outOfOrder = describePublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolution([recordBob, recordAlice], [s2, s1], verifier);
        assert(outOfOrder.signerEvolutions[0].signerIdentityId === resolveSigningIdentityId(bob) && outOfOrder.signerEvolutions[1].signerIdentityId === resolveSigningIdentityId(alice), '49. signerEvolutions preserve claimHistory\'s own first-appearance order — Bob first because his claim was supplied first');
        assert(outOfOrder.signerEvolutions[0].claims[0].snapshotMatches[0].snapshotIndex === 0, '50. Bob\'s claim names S2\'s own supplied position (index 0)');
        assert(outOfOrder.signerEvolutions[1].claims[0].snapshotMatches[0].snapshotIndex === 1, '51. Alice\'s claim names S1\'s own supplied position (index 1) — snapshots are never resorted either');

        const historyJsonBefore = serialize(recordAlice.toJSON()) + serialize(recordBob.toJSON());
        const snapshotsJsonBefore = serialize([s1, s2]);
        describePublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolution([recordAlice, recordBob], [s1, s2], verifier);
        assert(serialize(recordAlice.toJSON()) + serialize(recordBob.toJSON()) === historyJsonBefore, '52. neither claim record is ever mutated');
        assert(serialize([s1, s2]) === snapshotsJsonBefore, '53. neither supplied snapshot is ever mutated');
        assert(Object.isFrozen(recordAlice) && Object.isFrozen(recordBob), '54. records remain frozen');

        const first = describePublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolution([recordAlice, recordBob], [s1, s2], verifier);
        const second = describePublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolution([recordAlice, recordBob], [s1, s2], verifier);
        assert(serialize(first) === serialize(second), '55. repeated calls with identical input are byte-identical');
        assert(Object.isFrozen(first) && Object.isFrozen(first.signerEvolutions) && Object.isFrozen(first.signerEvolutions[0].claims), '56. the result, its signerEvolutions array, and each signer\'s claims array are all frozen');
        assert(Object.isFrozen(first.signerEvolutions[0].claims[0].snapshotMatches) && Object.isFrozen(first.signerEvolutions[0].claims[0].snapshotMatches[0].association) && Object.isFrozen(first.signerEvolutions[0].claims[0].snapshotMatches[0].verification), '57. each claim\'s snapshotMatches array and each match\'s association/verification objects are all frozen');

        const forbiddenVocabulary = ['trusted', 'validclaim', 'trustedsnapshot', 'confidence', 'reputation', 'score', 'rank', 'quality', 'worthiness', 'authority', 'authoritative', 'best', 'closest', 'improved', 'regressed', 'upgraded', 'downgraded'];
        const projectionText = serialize(first).toLowerCase();
        for (const word of forbiddenVocabulary) {
            assert(!projectionText.includes(word), `58. the projection's own output never carries "${word}"`);
        }

        const { result, networkCallOccurred } = await withoutNetworkAccess(() => describePublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolution([recordAlice, recordBob], [s1, s2], verifier));
        assert(networkCallOccurred === false, '59. building a claim verification evolution performs zero network access');
        assert(result.signerEvolutions[0].claims[0].snapshotMatches[0].verification.matches === true, '60. sanity — the result itself is genuine');
    }
    console.log('✓ Section C: imports only 0.8.133\'s claim evolution view and 0.8.140\'s correspondence verification view; signer/claim/snapshot order is always preserved, no reconstruct variant, no mutation, deterministic, no forbidden vocabulary, zero network access');

    console.log('\nAll PublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolutionView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotCorrespondenceVerificationEvolutionView.test.js FAILED:', error);
    process.exitCode = 1;
});
