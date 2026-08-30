import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotCorrespondenceVerification } from '../application/PublisherLeaderboardClaimSnapshotCorrespondenceVerificationView.js';
import { describePublisherLeaderboardClaimSnapshotDivergence } from '../application/PublisherLeaderboardClaimSnapshotDivergenceView.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.142 — Historical Claim/Snapshot Divergence Projection.
//
// Section A: malformed input tolerance — no eligible pairs never touches
//            `verifier`, never throws; a genuine eligible pair with no
//            verifier throws, delegated straight to 0.8.140; an empty
//            `divergences` for an empty world
// Section B: FLAGSHIP — Claim A -> S1 (fully corresponding, fully valid),
//            Claim B -> S2 (corresponds, but asserted evidence differs —
//            self-inconsistency, not hidden by an agreeing composite
//            fingerprint), Claim C -> S3 (corresponds, asserted fields all
//            agree, but the signature is tampered), Claim D -> no
//            corresponding snapshot at all — D must never appear in
//            `divergences`
// Section C: architecture — imports only 0.8.140; no forbidden vocabulary
//            (including no fraud/trust/severity/confidence vocabulary);
//            order preserved; no mutation; determinism; zero network
//            access; every fact byte-identical to a direct 0.8.140 call

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

        const empty = describePublisherLeaderboardClaimSnapshotDivergence(undefined, undefined, verifier);
        assert(empty.claimCount === 0 && empty.distinctClaimIdCount === 0 && empty.snapshotCount === 0 && empty.correspondenceCount === 0 && empty.divergenceCount === 0, '1. describeXxx(undefined, undefined, verifier) — every count is 0, never throws');
        assert(Array.isArray(empty.divergences) && empty.divergences.length === 0, '2. divergences is an empty array');
        assert(Object.isFrozen(empty), '3. the empty result is frozen');

        for (const malformed of [null, 42, 'not a list', {}]) {
            const result = describePublisherLeaderboardClaimSnapshotDivergence(malformed, malformed, null);
            assert(result.claimCount === 0 && result.snapshotCount === 0 && result.divergences.length === 0, `4. describeXxx(${JSON.stringify(malformed)}, ..., null) degrades to an empty result even with no verifier at all — never throwing`);
        }

        const alice = makeIdentity('Alice');
        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const claim = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) });
        const record = recordFor(claim);

        // No eligible pair exists (no snapshots supplied at all) — the
        // verifier is never touched, and this never throws even though
        // `verifier` is `null`. The claim is still visible one layer down
        // (via correspondenceCount) but contributes zero divergences.
        const noSnapshots = describePublisherLeaderboardClaimSnapshotDivergence([record], [], null);
        assert(noSnapshots.correspondenceCount === 1 && noSnapshots.divergenceCount === 0, '5. a claim with no supplied snapshot contributes zero divergences, and no verifier is ever required to report that');
        assert(noSnapshots.divergences.length === 0, '6. divergences is genuinely empty, never populated with an invented entry');

        // An eligible pair genuinely exists this time — the verifier
        // requirement now surfaces, delegated straight to 0.8.140/0.8.135.
        let threw = false;
        try { describePublisherLeaderboardClaimSnapshotDivergence([record], [s1], null); } catch { threw = true; }
        assert(threw, '7. once an eligible (claim, snapshot) pair genuinely exists, a missing verifier throws — delegated to 0.8.140, never silently tolerated');

        const withMalformedHistory = describePublisherLeaderboardClaimSnapshotDivergence(
            [null, 42, 'not a record', {}, record, claim, claim.toJSON()],
            [s1],
            verifier
        );
        assert(withMalformedHistory.claimCount === 1, '8. non-LeaderboardClaimRecord elements are silently excluded from claimCount — only the genuine record survives');
        assert(withMalformedHistory.divergenceCount === 1 && withMalformedHistory.divergences[0].claimId === claim.id, '9. exactly one divergence entry, for the one genuine record\'s one genuine corresponding snapshot');
    }
    console.log('✓ Section A: describePublisherLeaderboardClaimSnapshotDivergence() tolerates non-array/malformed claimHistory and snapshots and never requires a verifier unless a genuine eligible pair exists');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP.
    //
    //   S1 = E1/P1  S2 = E2/P2  S3 = E3/P3
    //   Claim A -> S1: fully corresponding, fully valid — every fact true,
    //              every divergence fact false
    //   Claim B -> S2: genuine signature, corresponds by snapshotFingerprint,
    //              but asserts a WRONG evidenceFingerprint — self-
    //              inconsistency, not hidden by the agreeing composite
    //              fingerprint
    //   Claim C -> S3: fully consistent asserted fields (every divergence
    //              fact false), but a TAMPERED signature — signatureValid
    //              and divergence stay visibly independent
    //   Claim D: asserts a snapshotFingerprint matching nothing supplied —
    //              no correspondence at all, so ZERO divergence entries
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carl = makeIdentity('Carl');
        const diana = makeIdentity('Diana');

        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
        const s3 = snapshotOf(E3, makeLeaderboard(makePolicy(3), [makeEntry(1, CARL, 7)]));
        const snapshots = [s1, s2, s3];

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
        const result = describePublisherLeaderboardClaimSnapshotDivergence(claimHistory, snapshots, verifier);

        assert(result.claimCount === 4 && result.distinctClaimIdCount === 4 && result.snapshotCount === 3 && result.correspondenceCount === 4, '10. FLAGSHIP — four distinct claims, three supplied snapshots, four correspondence entries (one per distinct claim, D included with zero matches)');
        assert(result.divergenceCount === 3, '11. FLAGSHIP — exactly three divergence entries: A, B, and C — Claim D contributes none');

        const divergenceByClaimId = new Map(result.divergences.map((entry) => [entry.claimId, entry]));
        assert(!divergenceByClaimId.has(claimD.id), '12. FLAGSHIP Case D — Claim D never appears in divergences at all, despite being a fully-formed, validly-signed claim — absence of correspondence is never turned into a divergence entry');

        // Case A — fully corresponding, fully valid.
        const entryA = divergenceByClaimId.get(claimA.id);
        assert(entryA.snapshotIndex === 0, '13. FLAGSHIP Case A — Claim A corresponds to S1, at its supplied index 0');
        assert(entryA.association.evidenceFingerprintMatches === true && entryA.association.policyVersionMatches === true && entryA.association.snapshotFingerprintMatches === true, '14. FLAGSHIP Case A — association: every structural fact true');
        assert(entryA.verification.signatureValid === true && entryA.verification.matches === true, '15. FLAGSHIP Case A — verification: genuine signature, everything matches');
        assert(entryA.divergence.evidenceFingerprintDiffers === false && entryA.divergence.policyVersionDiffers === false && entryA.divergence.snapshotFingerprintDiffers === false, '16. FLAGSHIP Case A — divergence: every fact false — a fully agreeing pair is still projected, honestly reporting no divergence');

        // Case B — corresponds, but asserted evidence differs.
        const entryB = divergenceByClaimId.get(claimB.id);
        assert(entryB.snapshotIndex === 1, '17. FLAGSHIP Case B — Claim B corresponds to S2, at its supplied index 1 — kept by complete snapshotFingerprint agreement despite the field mismatch below');
        assert(entryB.association.snapshotFingerprintMatches === true, '18. FLAGSHIP Case B — association: snapshotFingerprintMatches true — this is WHY the pair was kept at all');
        assert(entryB.association.evidenceFingerprintMatches === false, '19. FLAGSHIP Case B — association: evidenceFingerprintMatches FALSE — Claim B asserts the wrong evidence fingerprint');
        assert(entryB.association.policyVersionMatches === true, '20. FLAGSHIP Case B — association: policyVersionMatches true — only ONE of the three fields is inconsistent, never all three collapsed together');
        assert(entryB.verification.signatureValid === true, '21. FLAGSHIP Case B — verification: genuine signature — Bob genuinely signed exactly this self-inconsistent claim');
        assert(entryB.verification.matches === false, '22. FLAGSHIP Case B — verification: matches is false — the pair genuinely corresponds, yet does not fully verify');
        assert(entryB.divergence.evidenceFingerprintDiffers === true, '23. FLAGSHIP Case B — divergence: evidenceFingerprintDiffers TRUE — the self-inconsistency is visible here, never hidden by the agreeing snapshotFingerprint');
        assert(entryB.divergence.policyVersionDiffers === false && entryB.divergence.snapshotFingerprintDiffers === false, '24. FLAGSHIP Case B — divergence: the other two facts stay independently false — this is a ONE-field divergence, not a collapsed "this pair diverges" boolean');

        // Case C — corresponds structurally, tampered signature.
        const entryC = divergenceByClaimId.get(claimC.id);
        assert(entryC.snapshotIndex === 2, '25. FLAGSHIP Case C — Claim C corresponds to S3, at its supplied index 2');
        assert(entryC.association.evidenceFingerprintMatches === true && entryC.association.policyVersionMatches === true && entryC.association.snapshotFingerprintMatches === true, '26. FLAGSHIP Case C — association: every structural fact true — a forged/corrupted signature never changes what the claim\'s own fields assert');
        assert(entryC.verification.signatureValid === false, '27. FLAGSHIP Case C — verification: signatureValid FALSE — the signature bytes were tampered');
        assert(entryC.verification.matches === false, '28. FLAGSHIP Case C — verification: matches is false overall, purely because of the invalid signature');
        assert(entryC.divergence.evidenceFingerprintDiffers === false && entryC.divergence.policyVersionDiffers === false && entryC.divergence.snapshotFingerprintDiffers === false, '29. FLAGSHIP Case C — divergence: every fact false — an invalid signature is never folded into `divergence`; `signatureValid: false` alongside `snapshotFingerprintDiffers: false` is a perfectly representable, independently reported factual result');

        // Cross-check every fact against a direct 0.8.140 call — this file
        // re-derives nothing.
        const directCorrespondenceVerification = describePublisherLeaderboardClaimSnapshotCorrespondenceVerification(claimHistory, snapshots, verifier);
        const directEntryB = directCorrespondenceVerification.correspondences.find((entry) => entry.claimId === claimB.id).snapshotMatches[0];
        assert(serialize({ association: entryB.association, verification: entryB.verification }) === serialize({ association: directEntryB.association, verification: directEntryB.verification }), '30. FLAGSHIP — Claim B\'s association and verification facts are byte-identical to a direct 0.8.140 call');
    }
    console.log('✓ Section B: FLAGSHIP — A fully agrees, B corresponds but asserted evidence differs (self-inconsistency), C corresponds structurally despite a tampered signature (divergence independent of signatureValid), and D (no correspondence) never appears in divergences');

    // ---------------------------------------------------------------
    // Section C — architecture, order, no mutation, determinism,
    // vocabulary, network access.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotDivergenceView.js', import.meta.url), 'utf8');
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 1, '31. this file has exactly one import');
        assert(importLines.some((line) => line.includes("from './PublisherLeaderboardClaimSnapshotCorrespondenceVerificationView.js'")), '32. imports 0.8.140\'s own correspondence verification view');
        for (const forbiddenModule of ['LeaderboardClaimRecord', 'PublisherLeaderboardClaimSnapshotCorrespondenceView', 'PublisherLeaderboardHistoricalClaimVerification', 'PublisherLeaderboardClaimSnapshotAssociationView', 'PublisherLeaderboardSnapshotDifference', 'LocalIdentityProvider', 'PublicationObservationArchive', 'PublisherLeaderboardRankingPolicy', 'resolveSigningIdentityId', 'PublisherLeaderboardSnapshotTimelineView']) {
            assert(!importLines.some((line) => line.includes(forbiddenModule)), `33. this file never imports ${forbiddenModule} — no second correspondence/verification/difference engine, no signing/identity/archive/ranking/timeline import`);
        }
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!codeOnly.includes('.sort('), '34. no `.sort()` anywhere in this file\'s own code — divergence entries are never reordered');
        assert(!codeOnly.includes('.verify'), '35. no direct verifier method call anywhere in this file\'s own code — `verifier` is only ever handed to 0.8.140, never invoked directly');

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
        const outOfOrder = describePublisherLeaderboardClaimSnapshotDivergence([recordBob, recordAlice], [s2, s1], verifier);
        assert(outOfOrder.divergences[0].claimId === claimBob.id && outOfOrder.divergences[1].claimId === claimAlice.id, '36. divergences preserve claimHistory\'s own supplied order — Claim Bob first because it was supplied first');
        assert(outOfOrder.divergences[0].snapshotIndex === 0 && outOfOrder.divergences[1].snapshotIndex === 1, '37. each entry\'s snapshotIndex names the supplied snapshots position — snapshots are never resorted either');

        const historyJsonBefore = serialize(recordAlice.toJSON()) + serialize(recordBob.toJSON());
        const snapshotsJsonBefore = serialize([s1, s2]);
        describePublisherLeaderboardClaimSnapshotDivergence([recordAlice, recordBob], [s1, s2], verifier);
        assert(serialize(recordAlice.toJSON()) + serialize(recordBob.toJSON()) === historyJsonBefore, '38. neither claim record is ever mutated');
        assert(serialize([s1, s2]) === snapshotsJsonBefore, '39. neither supplied snapshot is ever mutated');
        assert(Object.isFrozen(recordAlice) && Object.isFrozen(recordBob), '40. records remain frozen');

        const first = describePublisherLeaderboardClaimSnapshotDivergence([recordAlice, recordBob], [s1, s2], verifier);
        const second = describePublisherLeaderboardClaimSnapshotDivergence([recordAlice, recordBob], [s1, s2], verifier);
        assert(serialize(first) === serialize(second), '41. repeated calls with identical input are byte-identical');
        assert(Object.isFrozen(first) && Object.isFrozen(first.divergences) && Object.isFrozen(first.divergences[0].divergence), '42. the result, its divergences array, and each entry\'s divergence object are all frozen');
        assert(Object.isFrozen(first.divergences[0].association) && Object.isFrozen(first.divergences[0].verification), '43. each entry\'s association and verification objects are both frozen');

        const forbiddenVocabulary = ['fraud', 'invalidclaim', 'conflict', 'regression', 'improved', 'regressed', 'trend', 'trusted', 'confidence', 'reputation', 'severity', 'score', 'rank', 'quality', 'remediation', 'authoritative', 'best', 'closest'];
        const projectionText = serialize(first).toLowerCase();
        for (const word of forbiddenVocabulary) {
            assert(!projectionText.includes(word), `44. the projection's own output never carries "${word}"`);
        }

        const { result, networkCallOccurred } = await withoutNetworkAccess(() => describePublisherLeaderboardClaimSnapshotDivergence([recordAlice, recordBob], [s1, s2], verifier));
        assert(networkCallOccurred === false, '45. building a divergence projection performs zero network access');
        assert(result.divergences[0].verification.matches === true, '46. sanity — the result itself is genuine');
    }
    console.log('✓ Section C: imports only 0.8.140\'s correspondence verification view; entry order preserved, no mutation, deterministic, no forbidden vocabulary, zero network access');

    console.log('\nAll PublisherLeaderboardClaimSnapshotDivergenceView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotDivergenceView.test.js FAILED:', error);
    process.exitCode = 1;
});
