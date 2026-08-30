import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotAssociation } from '../application/PublisherLeaderboardClaimSnapshotAssociationView.js';
import { describePublisherLeaderboardClaimSnapshotCorrespondence } from '../application/PublisherLeaderboardClaimSnapshotCorrespondenceView.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.139 — Historical Claim-to-Snapshot Correspondence Projection.
//
// Section A: malformed input tolerance — non-array claimHistory/snapshots,
//            non-record elements, never throws
// Section B: FLAGSHIP — S1 = (E1, P1), S2 = (E1, P2), S3 = (E2, P2); Claim
//            A → S2, Claim B → S1, Claim C → no supplied snapshot;
//            duplicating S2 as S4 proves ambiguity is preserved, never
//            arbitrarily resolved
// Section C: mixed-identifier claim (Claim C from 0.8.137/0.8.138's own
//            flagship) still corresponds by fingerprint even though its
//            own asserted evidence/policy fields disagree with that same
//            snapshot — every kept match carries all three facts
// Section D: claim multiplicity — repeated receipts of the identical claim
//            collapse to one correspondence entry, while claimCount still
//            counts every receipt
// Section E: snapshot position (never identity) is reported, order is
//            preserved, no automatic selection, no mutation, determinism,
//            forbidden vocabulary, zero network access, architecture

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
const ALICE = new PublisherIdentityRecord({ publisherId: 'Alice' });
const BOB = new PublisherIdentityRecord({ publisherId: 'Bob' });
const CARL = new PublisherIdentityRecord({ publisherId: 'Carl' });

function signedClaim(identityProvider, { evidenceFingerprint, policyVersion, snapshotFingerprint, createdAt = new Date('2026-08-29T00:00:00Z') }) {
    const signerIdentityId = resolveSigningIdentityId(identityProvider);
    let claim = new PublisherLeaderboardSnapshotClaim({ evidenceFingerprint, policyVersion, snapshotFingerprint, signerIdentityId, createdAt });
    const signature = identityProvider.signCanonical(claim.getSigningDescriptor());
    return claim.withSignature(signature);
}

function recordFor(claim, receivedAt = new Date('2026-08-29T04:00:00Z')) {
    return new LeaderboardClaimRecord({ claim, receivedAt });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — tolerance and shape.
    // ---------------------------------------------------------------
    {
        const empty = describePublisherLeaderboardClaimSnapshotCorrespondence(undefined, undefined);
        assert(empty.claimCount === 0 && empty.distinctClaimIdCount === 0 && empty.snapshotCount === 0 && empty.correspondenceCount === 0, '1. describeXxx(undefined, undefined) — every count is 0, never throws');
        assert(Array.isArray(empty.correspondences) && empty.correspondences.length === 0, '2. correspondences is an empty array');
        assert(Object.isFrozen(empty), '3. the empty result is frozen');

        for (const malformed of [null, 42, 'not a list', {}]) {
            const result = describePublisherLeaderboardClaimSnapshotCorrespondence(malformed, malformed);
            assert(result.claimCount === 0 && result.snapshotCount === 0 && result.correspondences.length === 0, `4. describeXxx(${JSON.stringify(malformed)}, ...) degrades to an empty result, never throwing`);
        }

        const alice = makeIdentity('Alice');
        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const claim = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) });
        const record = recordFor(claim);

        const withMalformedHistory = describePublisherLeaderboardClaimSnapshotCorrespondence(
            [null, 42, 'not a record', {}, record, claim, claim.toJSON()],
            [s1]
        );
        assert(withMalformedHistory.claimCount === 1, '5. non-LeaderboardClaimRecord elements are silently excluded from claimCount — only the genuine record survives');
        assert(withMalformedHistory.correspondences.length === 1 && withMalformedHistory.correspondences[0].claimId === claim.id, '6. exactly one correspondence, for the one genuine record supplied');

        const withMalformedSnapshots = describePublisherLeaderboardClaimSnapshotCorrespondence([record], [null, 42, 'not a snapshot', {}, s1]);
        assert(withMalformedSnapshots.snapshotCount === 5, '7. snapshotCount counts every supplied position, malformed or not');
        assert(withMalformedSnapshots.correspondences[0].snapshotMatches.length === 1 && withMalformedSnapshots.correspondences[0].snapshotMatches[0].snapshotIndex === 4, '8. only the genuine snapshot at its own position matches; malformed snapshot positions never spuriously match');
    }
    console.log('✓ Section A: describePublisherLeaderboardClaimSnapshotCorrespondence() tolerates non-array/malformed claimHistory and snapshots, never throwing, never dropping a position');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP.
    //
    //   S1 = E1/P1  S2 = E1/P2  S3 = E2/P2
    //   Claim A → S2 (signed over S2)
    //   Claim B → S1 (signed over S1)
    //   Claim C → no supplied snapshot (signed over a fingerprint that
    //             names no snapshot in the supplied sequence)
    //
    //   Then S4, an exact duplicate of S2, is appended — Claim A must
    //   correspond to BOTH S2 and S4, with no arbitrary selection.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carl = makeIdentity('Carl');

        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const s2 = snapshotOf(E1, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 3)]));
        const s3 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, CARL, 5)]));

        assert(fingerprintOf(s1) !== fingerprintOf(s2) && fingerprintOf(s2) !== fingerprintOf(s3) && fingerprintOf(s1) !== fingerprintOf(s3), '9. sanity — all three snapshot fingerprints genuinely differ');

        const claimA = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 2, snapshotFingerprint: fingerprintOf(s2) });
        const claimB = signedClaim(bob, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) });
        const noSnapshotFingerprint = '9'.repeat(64);
        const claimC = signedClaim(carl, { evidenceFingerprint: E2, policyVersion: 9, snapshotFingerprint: noSnapshotFingerprint });

        const recordA = recordFor(claimA);
        const recordB = recordFor(claimB);
        const recordC = recordFor(claimC);

        const claimHistory = [recordA, recordB, recordC];

        // First pass: S1, S2, S3 only.
        const correspondence = describePublisherLeaderboardClaimSnapshotCorrespondence(claimHistory, [s1, s2, s3]);

        assert(correspondence.claimCount === 3 && correspondence.distinctClaimIdCount === 3, '10. FLAGSHIP — three distinct receipts, three distinct claims');
        assert(correspondence.snapshotCount === 3, '11. FLAGSHIP — snapshotCount reflects the three supplied snapshots');
        assert(correspondence.correspondenceCount === 3, '12. FLAGSHIP — one correspondence entry per distinct claim, in claimHistory order');

        const [entryA, entryB, entryC] = correspondence.correspondences;

        assert(entryA.claimId === claimA.id && entryA.matchingSnapshotCount === 1 && entryA.snapshotMatches[0].snapshotIndex === 1, '13. FLAGSHIP — Claim A corresponds to exactly S2, at its supplied index 1');
        assert(entryB.claimId === claimB.id && entryB.matchingSnapshotCount === 1 && entryB.snapshotMatches[0].snapshotIndex === 0, '14. FLAGSHIP — Claim B corresponds to exactly S1, at its supplied index 0');
        assert(entryC.claimId === claimC.id && entryC.matchingSnapshotCount === 0 && entryC.snapshotMatches.length === 0, '15. FLAGSHIP — Claim C corresponds to no supplied snapshot, kept with an EMPTY snapshotMatches, never discarded');

        assert(entryA.snapshotMatches[0].evidenceFingerprintMatches === true && entryA.snapshotMatches[0].policyVersionMatches === true && entryA.snapshotMatches[0].snapshotFingerprintMatches === true, '16. FLAGSHIP — Claim A → S2 matches on all three facts');
        assert(entryB.snapshotMatches[0].evidenceFingerprintMatches === true && entryB.snapshotMatches[0].policyVersionMatches === true && entryB.snapshotMatches[0].snapshotFingerprintMatches === true, '17. FLAGSHIP — Claim B → S1 matches on all three facts');

        // Second pass: append S4, an exact duplicate of S2's own identity.
        const s4 = snapshotOf(E1, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 3)]));
        assert(fingerprintOf(s4) === fingerprintOf(s2), '18. sanity — S4 is a genuine duplicate of S2\'s own complete identity');

        const withDuplicate = describePublisherLeaderboardClaimSnapshotCorrespondence(claimHistory, [s1, s2, s3, s4]);
        const entryAWithDuplicate = withDuplicate.correspondences[0];

        assert(entryAWithDuplicate.matchingSnapshotCount === 2, '19. FLAGSHIP — Claim A now corresponds to TWO supplied snapshots, S2 and S4, ambiguity preserved rather than resolved');
        assert(entryAWithDuplicate.snapshotMatches.length === 2, '20. FLAGSHIP — snapshotMatches carries both matching positions');
        assert(entryAWithDuplicate.snapshotMatches[0].snapshotIndex === 1 && entryAWithDuplicate.snapshotMatches[1].snapshotIndex === 3, '21. FLAGSHIP — both S2 (index 1) and S4 (index 3) are named, in the order they were supplied, never picking one');
        assert(entryAWithDuplicate.snapshotMatches[0].snapshotFingerprintMatches === true && entryAWithDuplicate.snapshotMatches[1].snapshotFingerprintMatches === true, '22. FLAGSHIP — both kept matches genuinely match on the full snapshot fingerprint');
    }
    console.log('✓ Section B: FLAGSHIP — Claim A → S2, Claim B → S1, Claim C → nothing; appending an exact duplicate of S2 proves ambiguity is reported (matchingSnapshotCount: 2), never arbitrarily resolved to one snapshot');

    // ---------------------------------------------------------------
    // Section C — a claim whose own asserted fields disagree with the
    // very snapshot it corresponds to by fingerprint (0.8.137's/0.8.138's
    // own "Claim C," reused here to prove the three facts stay visible on
    // a KEPT match, not just a discarded one).
    // ---------------------------------------------------------------
    {
        const carl = makeIdentity('Carl');
        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const s3 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, CARL, 5)]));

        // Asserts E1/P1 (S1-like) yet the snapshotFingerprint it was
        // actually signed over names S3 — a self-inconsistent claim.
        const claimC = signedClaim(carl, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s3) });
        const recordC = recordFor(claimC);

        const correspondence = describePublisherLeaderboardClaimSnapshotCorrespondence([recordC], [s1, s3]);
        const entry = correspondence.correspondences[0];

        assert(entry.matchingSnapshotCount === 1, '23. Claim C corresponds to exactly one supplied snapshot — S3, by fingerprint — never S1, despite asserting S1-like evidence/policy');
        assert(entry.snapshotMatches[0].snapshotIndex === 1, '24. the kept match names S3\'s own supplied position (index 1), never S1\'s (index 0)');
        assert(entry.snapshotMatches[0].snapshotFingerprintMatches === true, '25. the kept match genuinely matches by complete snapshot fingerprint');
        assert(entry.snapshotMatches[0].evidenceFingerprintMatches === false, '26. yet evidenceFingerprintMatches reads false for that SAME kept match — the claim\'s own asserted evidence (E1) disagrees with S3\'s (E2)');
        assert(entry.snapshotMatches[0].policyVersionMatches === false, '27. and policyVersionMatches reads false too (claim asserts P1, S3 is P2) — proof the three facts are never collapsed into the keep/discard decision itself');

        // Cross-checked directly against 0.8.137's own primitive.
        const directAssociation = describePublisherLeaderboardClaimSnapshotAssociation(recordC, s3);
        assert(serialize({ evidenceFingerprintMatches: entry.snapshotMatches[0].evidenceFingerprintMatches, policyVersionMatches: entry.snapshotMatches[0].policyVersionMatches, snapshotFingerprintMatches: entry.snapshotMatches[0].snapshotFingerprintMatches }) === serialize({ evidenceFingerprintMatches: directAssociation.evidenceFingerprintMatches, policyVersionMatches: directAssociation.policyVersionMatches, snapshotFingerprintMatches: directAssociation.snapshotFingerprintMatches }), '28. the three facts on the kept match are byte-identical to 0.8.137\'s own direct per-pair result — this file delegates, never re-derives');
    }
    console.log('✓ Section C: a self-inconsistent claim still corresponds by complete snapshot fingerprint, and the kept match honestly reports evidenceFingerprintMatches/policyVersionMatches as false rather than collapsing to a bare "matched"');

    // ---------------------------------------------------------------
    // Section D — claim multiplicity: repeated receipts of the identical
    // claim collapse to one correspondence entry; claimCount still counts
    // every receipt.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const claim = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) });

        const recordDirect = recordFor(claim, new Date('2026-08-29T04:00:00Z'));
        const recordRelayed = recordFor(claim, new Date('2026-08-29T05:00:00Z'));

        const correspondence = describePublisherLeaderboardClaimSnapshotCorrespondence([recordDirect, recordRelayed], [s1]);

        assert(correspondence.claimCount === 2, '29. claimCount counts both receipts of the identical claim');
        assert(correspondence.distinctClaimIdCount === 1, '30. distinctClaimIdCount collapses to one — correspondence is about claims, not receipts');
        assert(correspondence.correspondenceCount === 1, '31. exactly one correspondence entry, not two');
        assert(correspondence.correspondences[0].matchingSnapshotCount === 1, '32. that single entry still finds its one corresponding snapshot');
    }
    console.log('✓ Section D: repeated receipts of the identical claim collapse to one correspondence entry, while claimCount still counts every receipt — 0.8.128\'s/0.8.132\'s own distinction, held here again');

    // ---------------------------------------------------------------
    // Section E — architecture, order, no automatic selection, no
    // mutation, determinism, vocabulary, network access.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotCorrespondenceView.js', import.meta.url), 'utf8');
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 2, '33. this file has exactly two imports');
        assert(importLines.some((line) => line.includes("from './LeaderboardClaimRecord.js'")), '34. imports LeaderboardClaimRecord (0.8.123, UNCHANGED)');
        assert(importLines.some((line) => line.includes("from './PublisherLeaderboardClaimSnapshotAssociationView.js'")), '35. imports 0.8.137\'s own association view');
        for (const forbiddenModule of ['PublisherLeaderboardSnapshotClaimVerification', 'PublisherLeaderboardHistoricalClaimVerification', 'LocalIdentityProvider', 'PublicationObservationArchive', 'PublisherLeaderboardRankingPolicy', 'resolveSigningIdentityId', 'PublisherLeaderboardSnapshotTimelineView', 'PublisherLeaderboardClaimSnapshotAssociationHistoryView']) {
            assert(!importLines.some((line) => line.includes(forbiddenModule)), `36. this file never imports ${forbiddenModule} — no parallel matching engine, no signing/identity/archive/ranking/timeline import`);
        }
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!codeOnly.includes('.sort('), '37. no `.sort()` anywhere in this file\'s own code — snapshot and claim order is never reordered');
        assert(!codeOnly.includes('verifier'), '38. no `verifier` parameter or reference anywhere in this file\'s own code');

        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
        const claimAlice = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) });
        const claimBob = signedClaim(bob, { evidenceFingerprint: E2, policyVersion: 2, snapshotFingerprint: fingerprintOf(s2) });
        const recordAlice = recordFor(claimAlice);
        const recordBob = recordFor(claimBob);

        // Out-of-order supply on both axes — never resorted.
        const outOfOrder = describePublisherLeaderboardClaimSnapshotCorrespondence([recordBob, recordAlice], [s2, s1]);
        assert(outOfOrder.correspondences[0].claimId === claimBob.id && outOfOrder.correspondences[1].claimId === claimAlice.id, '39. correspondences preserve claimHistory\'s own supplied order — Claim Bob first because it was supplied first');
        assert(outOfOrder.correspondences[0].snapshotMatches[0].snapshotIndex === 0, '40. Claim Bob\'s match names S2\'s own supplied position (index 0)');
        assert(outOfOrder.correspondences[1].snapshotMatches[0].snapshotIndex === 1, '41. Claim Alice\'s match names S1\'s own supplied position (index 1) — snapshots are never resorted either');

        const historyJsonBefore = serialize(recordAlice.toJSON()) + serialize(recordBob.toJSON());
        const snapshotsJsonBefore = serialize([s1, s2]);
        describePublisherLeaderboardClaimSnapshotCorrespondence([recordAlice, recordBob], [s1, s2]);
        assert(serialize(recordAlice.toJSON()) + serialize(recordBob.toJSON()) === historyJsonBefore, '42. neither claim record is ever mutated');
        assert(serialize([s1, s2]) === snapshotsJsonBefore, '43. neither supplied snapshot is ever mutated');
        assert(Object.isFrozen(recordAlice) && Object.isFrozen(recordBob), '44. records remain frozen');

        const first = describePublisherLeaderboardClaimSnapshotCorrespondence([recordAlice, recordBob], [s1, s2]);
        const second = describePublisherLeaderboardClaimSnapshotCorrespondence([recordAlice, recordBob], [s1, s2]);
        assert(serialize(first) === serialize(second), '45. repeated calls with identical input are byte-identical');
        assert(Object.isFrozen(first) && Object.isFrozen(first.correspondences) && Object.isFrozen(first.correspondences[0].snapshotMatches), '46. the result, its correspondences array, and each entry\'s snapshotMatches array are all frozen');

        const forbiddenVocabulary = ['trusted', 'current', 'authoritative', 'verified', 'score', 'rank', 'reputation', 'confidence', 'quality', 'worthiness', 'authority', 'signaturevalid', 'best', 'closest'];
        const projectionText = serialize(first).toLowerCase();
        for (const word of forbiddenVocabulary) {
            assert(!projectionText.includes(word), `47. the projection's own output never carries "${word}"`);
        }
        assert(!('matches' in first.correspondences[0]), '48. no collapsed `matches` verdict field on any correspondence entry');

        const { result, networkCallOccurred } = await withoutNetworkAccess(() => describePublisherLeaderboardClaimSnapshotCorrespondence([recordAlice, recordBob], [s1, s2]));
        assert(networkCallOccurred === false, '49. building a correspondence performs zero network access');
        assert(result.correspondences[0].matchingSnapshotCount === 1, '50. sanity — the result itself is genuine');
    }
    console.log('✓ Section E: imports only 0.8.123\'s record class and 0.8.137\'s association view, claim/snapshot order is always preserved, no automatic selection, no mutation, deterministic, no forbidden vocabulary, zero network access');

    console.log('\nAll PublisherLeaderboardClaimSnapshotCorrespondenceView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotCorrespondenceView.test.js FAILED:', error);
    process.exitCode = 1;
});
