import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotDivergence } from '../application/PublisherLeaderboardClaimSnapshotDivergenceView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.143 — Claim/Snapshot Reconciliation Plan Projection.
//
// Section A: malformed input tolerance — no eligible pairs never touches
//            `verifier`, never throws; a genuine eligible pair with no
//            verifier throws, delegated straight to 0.8.142; an empty
//            plan for an empty world
// Section B: FLAGSHIP — Claim A -> S1 (fully corresponding, fully valid,
//            nothing to reconcile), Claim B -> S2 (corresponds, asserted
//            evidence differs — a genuine reconciliation difference),
//            Claim C -> S3 (corresponds, every asserted field agrees, but
//            the signature is tampered — never a reconciliation
//            difference), Claim D -> no corresponding snapshot at all,
//            Snapshot S4 -> no corresponding claim at all
// Section C: architecture — imports only 0.8.142 and 0.8.123's own record
//            class; no forbidden vocabulary (including no action/policy
//            vocabulary); order preserved; no mutation; determinism; zero
//            network access; every fact byte-identical to a direct 0.8.142
//            call

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
const E_WRONG = '9'.repeat(64);
const ALICE = new PublisherIdentityRecord({ publisherId: 'Alice' });
const BOB = new PublisherIdentityRecord({ publisherId: 'Bob' });
const CARL = new PublisherIdentityRecord({ publisherId: 'Carl' });
const DIANA = new PublisherIdentityRecord({ publisherId: 'Diana' });

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

        const empty = describePublisherLeaderboardClaimSnapshotReconciliationPlan(undefined, undefined, verifier);
        assert(empty.claimCount === 0 && empty.distinctClaimIdCount === 0 && empty.snapshotCount === 0 && empty.correspondenceCount === 0, '1. describeXxx(undefined, undefined, verifier) — every count is 0, never throws');
        assert(empty.divergentCorrespondenceCount === 0 && empty.claimsWithoutCorrespondenceCount === 0 && empty.snapshotsWithoutCorrespondenceCount === 0, '2. every plan-specific count is 0 for an empty world');
        assert(Array.isArray(empty.divergentCorrespondences) && empty.divergentCorrespondences.length === 0, '3. divergentCorrespondences is an empty array');
        assert(Array.isArray(empty.claimsWithoutCorrespondence) && empty.claimsWithoutCorrespondence.length === 0, '4. claimsWithoutCorrespondence is an empty array');
        assert(Array.isArray(empty.snapshotsWithoutCorrespondence) && empty.snapshotsWithoutCorrespondence.length === 0, '5. snapshotsWithoutCorrespondence is an empty array');
        assert(Object.isFrozen(empty), '6. the empty result is frozen');

        for (const malformed of [null, 42, 'not a list', {}]) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationPlan(malformed, malformed, null);
            assert(result.claimCount === 0 && result.snapshotCount === 0 && result.divergentCorrespondences.length === 0 && result.claimsWithoutCorrespondence.length === 0 && result.snapshotsWithoutCorrespondence.length === 0, `7. describeXxx(${JSON.stringify(malformed)}, ..., null) degrades to an empty plan even with no verifier at all — never throwing`);
        }

        const alice = makeIdentity('Alice');
        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const claim = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) });
        const record = recordFor(claim);

        // No eligible pair exists (no snapshots supplied at all) — the
        // verifier is never touched, and this never throws even though
        // `verifier` is `null`. The claim is visible as its own
        // claimsWithoutCorrespondence entry, never as an invented
        // divergence.
        const noSnapshots = describePublisherLeaderboardClaimSnapshotReconciliationPlan([record], [], null);
        assert(noSnapshots.correspondenceCount === 1 && noSnapshots.divergentCorrespondenceCount === 0, '8. a claim with no supplied snapshot contributes zero divergent correspondences, and no verifier is ever required to report that');
        assert(noSnapshots.claimsWithoutCorrespondenceCount === 1 && noSnapshots.claimsWithoutCorrespondence[0].claimId === claim.id, '9. the claim appears in claimsWithoutCorrespondence instead');
        assert(noSnapshots.claimsWithoutCorrespondence[0].claimHistoryPosition === 0, '10. claimHistoryPosition names the position in the supplied claimHistory array');
        assert(noSnapshots.claimsWithoutCorrespondence[0].signerIdentityId === claim.signerIdentityId && +noSnapshots.claimsWithoutCorrespondence[0].claimCreatedAt === +claim.createdAt, '11. signerIdentityId and claimCreatedAt are read straight off the claim');

        // An eligible pair genuinely exists this time — the verifier
        // requirement now surfaces, delegated straight to 0.8.142.
        let threw = false;
        try { describePublisherLeaderboardClaimSnapshotReconciliationPlan([record], [s1], null); } catch { threw = true; }
        assert(threw, '12. once an eligible (claim, snapshot) pair genuinely exists, a missing verifier throws — delegated to 0.8.142, never silently tolerated');

        const withMalformedHistory = describePublisherLeaderboardClaimSnapshotReconciliationPlan(
            [null, 42, 'not a record', {}, record, claim, claim.toJSON()],
            [s1],
            verifier
        );
        assert(withMalformedHistory.claimCount === 1, '13. non-LeaderboardClaimRecord elements are silently excluded from claimCount — only the genuine record survives');
        assert(withMalformedHistory.claimsWithoutCorrespondenceCount === 0, '14. the one genuine record corresponds to S1, so it never appears in claimsWithoutCorrespondence');
    }
    console.log('✓ Section A: describePublisherLeaderboardClaimSnapshotReconciliationPlan() tolerates non-array/malformed claimHistory and snapshots and never requires a verifier unless a genuine eligible pair exists');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP.
    //
    //   S1 = E1/P1  S2 = E2/P2  S3 = E3/P3  S4 = E4/P4 (unmatched)
    //   Claim A -> S1: fully corresponding, fully valid — nothing to
    //              reconcile, so A must never appear in
    //              divergentCorrespondences
    //   Claim B -> S2: genuine signature, corresponds by snapshotFingerprint,
    //              but asserts a WRONG evidenceFingerprint — a genuine
    //              reconciliation difference
    //   Claim C -> S3: fully consistent asserted fields (no field
    //              divergence), but a TAMPERED signature — must never
    //              appear in divergentCorrespondences (a signature problem
    //              is not a reconciliation difference), and — because it
    //              genuinely corresponds — must never appear in
    //              claimsWithoutCorrespondence either
    //   Claim D: asserts a snapshotFingerprint matching nothing supplied —
    //              no correspondence at all, so D belongs in
    //              claimsWithoutCorrespondence, never in
    //              divergentCorrespondences
    //   Snapshot S4: supplied but named by no claim at all — belongs in
    //              snapshotsWithoutCorrespondence
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carl = makeIdentity('Carl');
        const diana = makeIdentity('Diana');

        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
        const s3 = snapshotOf(E3, makeLeaderboard(makePolicy(3), [makeEntry(1, CARL, 7)]));
        const s4 = snapshotOf(E4, makeLeaderboard(makePolicy(4), [makeEntry(1, DIANA, 9)]));
        const snapshots = [s1, s2, s3, s4];

        const claimA = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) });
        const claimB = signedClaim(bob, { evidenceFingerprint: E_WRONG, policyVersion: 2, snapshotFingerprint: fingerprintOf(s2) });
        const claimC = tamper(signedClaim(carl, { evidenceFingerprint: E3, policyVersion: 3, snapshotFingerprint: fingerprintOf(s3) }));
        const claimD = signedClaim(diana, { evidenceFingerprint: E4, policyVersion: 1, snapshotFingerprint: 'f'.repeat(64) });

        const recordA = recordFor(claimA);
        const recordB = recordFor(claimB);
        const recordC = recordFor(claimC);
        const recordD = recordFor(claimD);
        const claimHistory = [recordA, recordB, recordC, recordD];

        const verifier = new LocalAuthorizationVerifier();
        const plan = describePublisherLeaderboardClaimSnapshotReconciliationPlan(claimHistory, snapshots, verifier);

        assert(plan.claimCount === 4 && plan.distinctClaimIdCount === 4 && plan.snapshotCount === 4 && plan.correspondenceCount === 4, '15. FLAGSHIP — four distinct claims, four supplied snapshots, four correspondence entries (one per distinct claim, D included with zero matches)');

        // divergentCorrespondences: only B.
        assert(plan.divergentCorrespondenceCount === 1, '16. FLAGSHIP — exactly one divergent correspondence: B — A agrees fully, C\'s only problem is its signature, D never corresponds at all');
        const entryB = plan.divergentCorrespondences[0];
        assert(entryB.claimId === claimB.id && entryB.snapshotIndex === 1, '17. FLAGSHIP — the one divergent correspondence is Claim B against S2, at its supplied index');
        assert(entryB.divergence.evidenceFingerprintDiffers === true && entryB.divergence.policyVersionDiffers === false && entryB.divergence.snapshotFingerprintDiffers === false, '18. FLAGSHIP — Claim B\'s divergence is embedded whole: exactly the one field genuinely disagrees');
        assert(entryB.association.snapshotFingerprintMatches === true && entryB.verification.signatureValid === true, '19. FLAGSHIP — Claim B\'s association and verification facts are embedded whole alongside its divergence, not reduced to a status');

        assert(!plan.divergentCorrespondences.some((entry) => entry.claimId === claimA.id), '20. FLAGSHIP — Claim A (fully agrees) never appears in divergentCorrespondences');
        assert(!plan.divergentCorrespondences.some((entry) => entry.claimId === claimC.id), '21. FLAGSHIP — Claim C (tampered signature, but every asserted field agrees) never appears in divergentCorrespondences — a signature problem is never turned into a reconciliation difference');
        assert(!plan.divergentCorrespondences.some((entry) => entry.claimId === claimD.id), '22. FLAGSHIP — Claim D (no correspondence at all) never appears in divergentCorrespondences');

        // claimsWithoutCorrespondence: only D.
        assert(plan.claimsWithoutCorrespondenceCount === 1, '23. FLAGSHIP — exactly one claim without correspondence: D');
        assert(plan.claimsWithoutCorrespondence[0].claimId === claimD.id, '24. FLAGSHIP — Claim D is the one claim without a corresponding snapshot');
        assert(plan.claimsWithoutCorrespondence[0].claimHistoryPosition === 3, '25. FLAGSHIP — Claim D\'s own position in the supplied claimHistory array is 3');
        assert(plan.claimsWithoutCorrespondence[0].signerIdentityId === claimD.signerIdentityId, '26. FLAGSHIP — Claim D\'s signerIdentityId is reported alongside its position');
        assert(!plan.claimsWithoutCorrespondence.some((entry) => entry.claimId === claimC.id), '27. FLAGSHIP — Claim C genuinely corresponds to S3, so it never appears in claimsWithoutCorrespondence despite its tampered signature');

        // snapshotsWithoutCorrespondence: only S4.
        assert(plan.snapshotsWithoutCorrespondenceCount === 1, '28. FLAGSHIP — exactly one snapshot without correspondence: S4');
        assert(plan.snapshotsWithoutCorrespondence[0].snapshotIndex === 3, '29. FLAGSHIP — S4\'s own supplied position is 3');

        // Cross-check every divergentCorrespondences fact against a direct
        // 0.8.142 call — this file re-derives nothing.
        const directDivergence = describePublisherLeaderboardClaimSnapshotDivergence(claimHistory, snapshots, verifier);
        const directEntryB = directDivergence.divergences.find((entry) => entry.claimId === claimB.id);
        assert(serialize(entryB) === serialize(directEntryB), '30. FLAGSHIP — Claim B\'s plan entry is byte-identical to its direct 0.8.142 entry');
    }
    console.log('✓ Section B: FLAGSHIP — A fully agrees (excluded), B genuinely diverges (included, embedded whole), C corresponds despite a tampered signature (excluded from both divergentCorrespondences and claimsWithoutCorrespondence), D has no correspondence at all (claimsWithoutCorrespondence), and S4 has no correspondence at all (snapshotsWithoutCorrespondence)');

    // ---------------------------------------------------------------
    // Section C — architecture, order, no mutation, determinism,
    // vocabulary, network access.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js', import.meta.url), 'utf8');
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 2, '31. this file has exactly two imports');
        assert(importLines.some((line) => line.includes("from './LeaderboardClaimRecord.js'")), '32. imports LeaderboardClaimRecord (0.8.123, UNCHANGED)');
        assert(importLines.some((line) => line.includes("from './PublisherLeaderboardClaimSnapshotDivergenceView.js'")), '33. imports 0.8.142\'s own divergence view');
        for (const forbiddenModule of ['PublisherLeaderboardClaimSnapshotCorrespondenceView', 'PublisherLeaderboardClaimSnapshotCorrespondenceVerificationView', 'PublisherLeaderboardHistoricalClaimVerification', 'PublisherLeaderboardClaimSnapshotAssociationView', 'PublisherLeaderboardSnapshotDifference', 'PublisherLeaderboardClaimEvolutionView', 'LocalIdentityProvider', 'PublicationObservationArchive', 'PublisherLeaderboardRankingPolicy', 'resolveSigningIdentityId', 'PublisherLeaderboardSnapshotTimelineView']) {
            assert(!importLines.some((line) => line.includes(forbiddenModule)), `34. this file never imports ${forbiddenModule} — no second correspondence/verification/divergence engine, no signing/identity/archive/ranking/timeline import`);
        }
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!codeOnly.includes('.sort('), '35. no `.sort()` anywhere in this file\'s own code — plan entries are never reordered');
        assert(!codeOnly.includes('.verify'), '36. no direct verifier method call anywhere in this file\'s own code — `verifier` is only ever handed to 0.8.142, never invoked directly');

        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
        const claimAlice = signedClaim(alice, { evidenceFingerprint: E_WRONG, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) });
        const claimBob = signedClaim(bob, { evidenceFingerprint: E_WRONG, policyVersion: 2, snapshotFingerprint: fingerprintOf(s2) });
        const recordAlice = recordFor(claimAlice);
        const recordBob = recordFor(claimBob);
        const verifier = new LocalAuthorizationVerifier();

        // Out-of-order supply on both axes — never resorted. Both claims
        // are constructed to genuinely diverge (wrong evidenceFingerprint)
        // so both land in divergentCorrespondences, exercising order there.
        const outOfOrder = describePublisherLeaderboardClaimSnapshotReconciliationPlan([recordBob, recordAlice], [s2, s1], verifier);
        assert(outOfOrder.divergentCorrespondences[0].claimId === claimBob.id && outOfOrder.divergentCorrespondences[1].claimId === claimAlice.id, '37. divergentCorrespondences preserve claimHistory\'s own supplied order — Claim Bob first because it was supplied first');
        assert(outOfOrder.divergentCorrespondences[0].snapshotIndex === 0 && outOfOrder.divergentCorrespondences[1].snapshotIndex === 1, '38. each entry\'s snapshotIndex names the supplied snapshots position — snapshots are never resorted either');

        const historyJsonBefore = serialize(recordAlice.toJSON()) + serialize(recordBob.toJSON());
        const snapshotsJsonBefore = serialize([s1, s2]);
        describePublisherLeaderboardClaimSnapshotReconciliationPlan([recordAlice, recordBob], [s1, s2], verifier);
        assert(serialize(recordAlice.toJSON()) + serialize(recordBob.toJSON()) === historyJsonBefore, '39. neither claim record is ever mutated');
        assert(serialize([s1, s2]) === snapshotsJsonBefore, '40. neither supplied snapshot is ever mutated');
        assert(Object.isFrozen(recordAlice) && Object.isFrozen(recordBob), '41. records remain frozen');

        const first = describePublisherLeaderboardClaimSnapshotReconciliationPlan([recordAlice, recordBob], [s1, s2], verifier);
        const second = describePublisherLeaderboardClaimSnapshotReconciliationPlan([recordAlice, recordBob], [s1, s2], verifier);
        assert(serialize(first) === serialize(second), '42. repeated calls with identical input are byte-identical');
        assert(Object.isFrozen(first) && Object.isFrozen(first.divergentCorrespondences) && Object.isFrozen(first.claimsWithoutCorrespondence) && Object.isFrozen(first.snapshotsWithoutCorrespondence), '43. the result and all three of its own lists are frozen');

        // Snapshots without any correspondence — walked in position order,
        // never deduplicated or reordered.
        const claimNamingS1Only = recordFor(signedClaim(makeIdentity('Erin'), { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) }));
        const withUnmatchedSnapshot = describePublisherLeaderboardClaimSnapshotReconciliationPlan([claimNamingS1Only], [s1, s2], verifier);
        assert(withUnmatchedSnapshot.snapshotsWithoutCorrespondence.length === 1 && withUnmatchedSnapshot.snapshotsWithoutCorrespondence[0].snapshotIndex === 1, '44. the one supplied snapshot nothing corresponds to (S2, index 1) is reported, in position order');
        assert(Object.isFrozen(withUnmatchedSnapshot.snapshotsWithoutCorrespondence[0]), '45. each snapshotsWithoutCorrespondence entry is frozen');
        assert(Object.isFrozen(withUnmatchedSnapshot.claimsWithoutCorrespondence[0] ?? {}) || withUnmatchedSnapshot.claimsWithoutCorrespondence.length === 0, '46. sanity — claimsWithoutCorrespondence is empty here, the one claim genuinely corresponds to S1');

        const forbiddenVocabulary = ['fraud', 'invalidclaim', 'conflict', 'regression', 'improved', 'regressed', 'trend', 'trusted', 'confidence', 'reputation', 'severity', 'score', 'rank', 'quality', 'remediation', 'authoritative', 'best', 'closest', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'resolve', 'apply'];
        const projectionText = serialize(first).toLowerCase();
        for (const word of forbiddenVocabulary) {
            assert(!projectionText.includes(word), `47. the plan's own output never carries "${word}"`);
        }

        const { result, networkCallOccurred } = await withoutNetworkAccess(() => describePublisherLeaderboardClaimSnapshotReconciliationPlan([recordAlice, recordBob], [s1, s2], verifier));
        assert(networkCallOccurred === false, '48. building a reconciliation plan performs zero network access');
        assert(result.divergentCorrespondenceCount === 2, '49. sanity — the result itself is genuine');
    }
    console.log('✓ Section C: imports only 0.8.142\'s divergence view and 0.8.123\'s record class; entry order preserved, no mutation, deterministic, no forbidden vocabulary (including no action/policy vocabulary), zero network access');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationPlanView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationPlanView.test.js FAILED:', error);
    process.exitCode = 1;
});
