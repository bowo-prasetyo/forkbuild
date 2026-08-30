import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotAssociation } from '../application/PublisherLeaderboardClaimSnapshotAssociationView.js';
import { describePublisherLeaderboardClaimSnapshotAssociationHistory } from '../application/PublisherLeaderboardClaimSnapshotAssociationHistoryView.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.138 — Historical Claim-to-Snapshot Association History Projection.
//
// Section A: malformed input tolerance — a non-array argument, and
//            elements that are not `{ claimRecord, snapshot }` shaped
//            objects, never throw
// Section B: FLAGSHIP — S1 = (E1, P1), S2 = (E1, P2), S3 = (E2, P2); Claim
//            A describes S2, Claim B describes S1, Claim C has mixed
//            identifiers; every explicitly supplied pair independently
//            reproduces 0.8.137's own per-pair facts, in supplied order
// Section C: same claim + same snapshot, signature changed — the
//            association history entry is byte-identical, because 0.8.137
//            deliberately ignores signatures
// Section D: supplied order is preserved (never sorted), and repeated
//            pairs are never deduplicated
// Section E: no automatic matching, no collapsed verdict, no mutation,
//            determinism, forbidden vocabulary, zero network access, and
//            the module imports only 0.8.137

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
        const empty = describePublisherLeaderboardClaimSnapshotAssociationHistory(undefined);
        assert(empty.associationCount === 0, '1. describeXxx(undefined) — associationCount is 0, never throws');
        assert(Array.isArray(empty.associations) && empty.associations.length === 0, '2. describeXxx(undefined) — associations is an empty array');
        assert(Object.isFrozen(empty), '3. the empty result is frozen');

        for (const malformed of [null, 42, 'not a list', {}]) {
            const result = describePublisherLeaderboardClaimSnapshotAssociationHistory(malformed);
            assert(result.associationCount === 0 && result.associations.length === 0, `4. describeXxx(${JSON.stringify(malformed)}) degrades to an empty history, never throwing`);
        }

        const alice = makeIdentity('Alice');
        const snapshot = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const claim = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(snapshot) });
        const record = recordFor(claim);

        const withMalformedElements = describePublisherLeaderboardClaimSnapshotAssociationHistory([
            null,
            42,
            'not a pair',
            {},
            { claimRecord: record, snapshot },
            { claimRecord: 'not a record', snapshot }
        ]);
        assert(withMalformedElements.associationCount === 6, '5. a malformed element occupies its own position — nothing is silently dropped');
        assert(withMalformedElements.associations[0] === null, '6. a null element degrades to null, exactly like 0.8.137\'s own tolerance for a missing claimRecord');
        assert(withMalformedElements.associations[1] === null, '7. a non-object element degrades to null');
        assert(withMalformedElements.associations[2] === null, '8. a string element degrades to null');
        assert(withMalformedElements.associations[3] === null, '9. an empty-object element (no claimRecord/snapshot) degrades to null');
        assert(withMalformedElements.associations[4] !== null && withMalformedElements.associations[4].evidenceFingerprintMatches === true, '10. a genuinely well-formed pair produces a real association, in its own position');
        assert(withMalformedElements.associations[5] === null, '11. a pair with a malformed claimRecord degrades to null, exactly like 0.8.137\'s own single-pair tolerance');
    }
    console.log('✓ Section A: describePublisherLeaderboardClaimSnapshotAssociationHistory() tolerates a non-array argument and malformed elements, never throwing, never dropping a position');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP.
    //
    //   S1 = (E1, P1)   S2 = (E1, P2)   S3 = (E2, P2)
    //   Claim A signed over S2.  Claim B signed over S1.
    //   Claim C has mixed identifiers (asserts E1/P1/fingerprint-of-S3).
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carl = makeIdentity('Carl');

        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const s2 = snapshotOf(E1, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 3)]));
        const s3 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, CARL, 5)]));

        assert(fingerprintOf(s1) !== fingerprintOf(s2) && fingerprintOf(s2) !== fingerprintOf(s3) && fingerprintOf(s1) !== fingerprintOf(s3), '12. sanity — all three snapshot fingerprints genuinely differ');

        const claimA = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 2, snapshotFingerprint: fingerprintOf(s2) });
        const claimB = signedClaim(bob, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) });
        const claimC = signedClaim(carl, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s3) });

        const recordA = recordFor(claimA);
        const recordB = recordFor(claimB);
        const recordC = recordFor(claimC);

        const pairs = [
            { claimRecord: recordA, snapshot: s2 }, // Claim A → S2: full match
            { claimRecord: recordB, snapshot: s1 }, // Claim B → S1: full match
            { claimRecord: recordC, snapshot: s1 }, // Claim C → S1: evidence matches, policy matches, fingerprint differs
            { claimRecord: recordC, snapshot: s2 }, // Claim C → S2: evidence matches, policy differs, fingerprint differs
            { claimRecord: recordC, snapshot: s3 }  // Claim C → S3: evidence differs, policy differs, fingerprint differs
        ];

        const history = describePublisherLeaderboardClaimSnapshotAssociationHistory(pairs);

        assert(history.associationCount === 5, '13. FLAGSHIP — associationCount equals the number of supplied pairs');
        assert(history.associations.length === 5, '14. FLAGSHIP — associations carries exactly one entry per supplied pair');

        for (let index = 0; index < pairs.length; index++) {
            const expected = describePublisherLeaderboardClaimSnapshotAssociation(pairs[index].claimRecord, pairs[index].snapshot);
            assert(serialize(history.associations[index]) === serialize(expected), `15.${index} FLAGSHIP — associations[${index}] is byte-identical to 0.8.137's own per-pair result, in the supplied position`);
        }

        assert(history.associations[0].evidenceFingerprintMatches === true && history.associations[0].policyVersionMatches === true && history.associations[0].snapshotFingerprintMatches === true, '16. FLAGSHIP — Claim A → S2 matches on all three facts');
        assert(history.associations[1].evidenceFingerprintMatches === true && history.associations[1].policyVersionMatches === true && history.associations[1].snapshotFingerprintMatches === true, '17. FLAGSHIP — Claim B → S1 matches on all three facts');
        assert(history.associations[2].evidenceFingerprintMatches === true && history.associations[2].policyVersionMatches === true && history.associations[2].snapshotFingerprintMatches === false, '18. FLAGSHIP — Claim C → S1: evidence/policy match, composite fingerprint differs');
        assert(history.associations[3].evidenceFingerprintMatches === true && history.associations[3].policyVersionMatches === false && history.associations[3].snapshotFingerprintMatches === false, '19. FLAGSHIP — Claim C → S2: evidence matches, policy version differs');
        assert(history.associations[4].evidenceFingerprintMatches === false && history.associations[4].policyVersionMatches === false && history.associations[4].snapshotFingerprintMatches === true, '20. FLAGSHIP — Claim C → S3: evidence/policy assert S1-like values yet the composite fingerprint claim was signed over IS S3\'s — proof the three facts stay independent even for a claim with genuinely mixed identifiers');

        assert(history.associations[0].claimId === claimA.id && history.associations[1].claimId === claimB.id, '21. FLAGSHIP — claimId on each entry names the claim actually supplied in that pair');
        assert(history.associations[2].claimId === claimC.id && history.associations[3].claimId === claimC.id && history.associations[4].claimId === claimC.id, '22. FLAGSHIP — the same claimId repeats across every pair naming Claim C, exactly like 0.8.137\'s own repeated-claim behavior');
    }
    console.log('✓ Section B: FLAGSHIP — Claim A/B/C explicitly paired against S1/S2/S3 reproduce 0.8.137\'s own per-pair facts exactly, entry for entry, in supplied position');

    // ---------------------------------------------------------------
    // Section C — signature independence.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const s2 = snapshotOf(E1, makeLeaderboard(makePolicy(2), [makeEntry(1, ALICE, 3)]));
        const identifiers = { evidenceFingerprint: E1, policyVersion: 2, snapshotFingerprint: fingerprintOf(s2) };

        const genuineClaim = signedClaim(alice, identifiers);
        const genuineJson = genuineClaim.toJSON();
        const tamperedJson = { ...genuineJson, signature: { ...genuineJson.signature, signature: genuineJson.signature.signature.split('').reverse().join('') } };
        const tamperedClaim = PublisherLeaderboardSnapshotClaim.fromJSON(tamperedJson);

        const genuineRecord = recordFor(genuineClaim);
        const tamperedRecord = recordFor(tamperedClaim);

        const history = describePublisherLeaderboardClaimSnapshotAssociationHistory([
            { claimRecord: genuineRecord, snapshot: s2 },
            { claimRecord: tamperedRecord, snapshot: s2 }
        ]);

        assert(serialize(history.associations[0]) === serialize(history.associations[1]), '23. the association history entry for a genuinely signed claim and a deliberately tampered claim sharing identical asserted identifiers is byte-identical — 0.8.138 inherits 0.8.137\'s own signature independence exactly');
        assert(!('signatureValid' in history.associations[0]), '24. no signatureValid field anywhere in a history entry');
    }
    console.log('✓ Section C: same claim, same snapshot, signature changed — the association history entry stays byte-identical, because association never inspects a signature');

    // ---------------------------------------------------------------
    // Section D — supplied order preserved, no deduplication.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, ALICE, 5)]));
        const claim = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(s1) });
        const record = recordFor(claim);

        // Claim A → Snapshot 1, Claim A → Snapshot 1 (repeated), Claim A → Snapshot 2.
        const history = describePublisherLeaderboardClaimSnapshotAssociationHistory([
            { claimRecord: record, snapshot: s1 },
            { claimRecord: record, snapshot: s1 },
            { claimRecord: record, snapshot: s2 }
        ]);

        assert(history.associationCount === 3, '25. no deduplication — three supplied pairs produce three entries, even though the first two are identical');
        assert(serialize(history.associations[0]) === serialize(history.associations[1]), '26. the two repeated pairs produce byte-identical entries, both preserved');
        assert(serialize(history.associations[1]) !== serialize(history.associations[2]), '27. the third, genuinely different pair produces a genuinely different entry');

        // Out-of-order supply: S2 first, then S1 — the result must NOT be
        // reordered by snapshot identity, claim creation time, or match
        // count.
        const outOfOrder = describePublisherLeaderboardClaimSnapshotAssociationHistory([
            { claimRecord: record, snapshot: s2 },
            { claimRecord: record, snapshot: s1 }
        ]);
        assert(outOfOrder.associations[0].snapshotFingerprint === fingerprintOf(s2), '28. the caller-supplied order is preserved — S2 appears first because it was supplied first, never resorted');
        assert(outOfOrder.associations[1].snapshotFingerprint === fingerprintOf(s1), '29. S1 appears second, exactly the order supplied');
    }
    console.log('✓ Section D: caller-supplied order is preserved exactly (never sorted by claim time, snapshot identity, signer, fingerprint, or match count), and repeated pairs are never deduplicated');

    // ---------------------------------------------------------------
    // Section E — architecture, tolerance, no mutation, determinism,
    // vocabulary, network access.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotAssociationHistoryView.js', import.meta.url), 'utf8');
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 1, '30. this file has exactly one import');
        assert(importLines[0].includes("from './PublisherLeaderboardClaimSnapshotAssociationView.js'"), '31. this file imports only 0.8.137\'s own PublisherLeaderboardClaimSnapshotAssociationView.js');
        for (const forbiddenModule of ['PublisherLeaderboardSnapshotClaimVerification', 'PublisherLeaderboardHistoricalClaimVerification', 'LocalIdentityProvider', 'PublicationObservationArchive', 'PublisherLeaderboardRankingPolicy', 'resolveSigningIdentityId']) {
            assert(!importLines.some((line) => line.includes(forbiddenModule)), `32. this file never imports ${forbiddenModule} — no parallel association/verification engine, no signing/identity/archive/ranking import`);
        }
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!codeOnly.includes('.sort('), '33. no `.sort()` anywhere in this file\'s own code — supplied order is never reordered');
        assert(!codeOnly.includes('new Set') && !codeOnly.includes('new Map'), '34. no `Set`/`Map` anywhere in this file\'s own code — no deduplication of any kind');
        assert(!codeOnly.includes('verifier'), '35. no `verifier` parameter or reference anywhere in this file\'s own code');

        const alice = makeIdentity('Alice');
        const snapshot = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const claim = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(snapshot) });
        const record = recordFor(claim);
        const pairs = [{ claimRecord: record, snapshot }];

        const pairsJsonBefore = serialize({ claimRecordJson: record.toJSON(), snapshot });
        describePublisherLeaderboardClaimSnapshotAssociationHistory(pairs);
        assert(serialize({ claimRecordJson: record.toJSON(), snapshot }) === pairsJsonBefore, '36. neither the claim record nor the snapshot is ever mutated');
        assert(Object.isFrozen(record), '37. the record remains frozen');

        const first = describePublisherLeaderboardClaimSnapshotAssociationHistory(pairs);
        const second = describePublisherLeaderboardClaimSnapshotAssociationHistory(pairs);
        assert(serialize(first) === serialize(second), '38. repeated calls with identical input are byte-identical');
        assert(Object.isFrozen(first) && Object.isFrozen(first.associations), '39. the result and its associations array are both frozen');

        const forbiddenVocabulary = ['trusted', 'current', 'authoritative', 'verified', 'score', 'rank', 'reputation', 'confidence', 'quality', 'worthiness', 'authority', 'signaturevalid'];
        const projectionText = serialize(first).toLowerCase();
        for (const word of forbiddenVocabulary) {
            assert(!projectionText.includes(word), `40. the projection's own output never carries "${word}"`);
        }
        assert(!('matches' in (first.associations[0] || {})), '41. no collapsed `matches` verdict field on any entry');

        const { result, networkCallOccurred } = await withoutNetworkAccess(() => describePublisherLeaderboardClaimSnapshotAssociationHistory(pairs));
        assert(networkCallOccurred === false, '42. building an association history performs zero network access');
        assert(result.associations[0].evidenceFingerprintMatches === true, '43. sanity — the result itself is genuine');
    }
    console.log('✓ Section E: imports only 0.8.137, no matching subsystem, no forbidden vocabulary, no mutation, deterministic, zero network access');

    console.log('\nAll PublisherLeaderboardClaimSnapshotAssociationHistoryView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotAssociationHistoryView.test.js FAILED:', error);
    process.exitCode = 1;
});
