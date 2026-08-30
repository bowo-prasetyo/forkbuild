import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotAssociation } from '../application/PublisherLeaderboardClaimSnapshotAssociationView.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.137 — Historical Claim-to-Snapshot Association Projection.
//
// Section A: malformed input tolerance — requires a genuine
//            LeaderboardClaimRecord, never throws, carries receipt
//            metadata + the supplied snapshot's own identity through
// Section B: FLAGSHIP — S1 = (E1, P1), S2 = (E1, P2), S3 = (E2, P2); a
//            claim signed over S2, explicitly associated with each of the
//            three snapshots in turn, proves the three facts are
//            genuinely independent
// Section C: signature independence — a claim with a deliberately invalid
//            signature but identical asserted identifiers produces the
//            IDENTICAL association facts as a genuinely signed one
// Section D: no automatic snapshot selection, no collapsed `matches`
//            field, no verifier required, no mutation, determinism,
//            forbidden vocabulary, zero network access

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

// Signs a claim asserting EXACTLY the supplied identifiers — never
// derived from an archive, so the flagship's three snapshots can be
// fabricated directly, the identical pattern
// tests/PublisherLeaderboardSnapshotDifference.test.js's own
// `snapshotOf()` already establishes for snapshots.
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
        const alice = makeIdentity('Alice');
        const leaderboardP1 = makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]);
        const snapshot1 = snapshotOf(E1, leaderboardP1);
        const claim = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(snapshot1) });

        for (const malformed of [null, undefined, 42, 'not a record', [], {}, claim, claim.toJSON()]) {
            assert(describePublisherLeaderboardClaimSnapshotAssociation(malformed, snapshot1) === null, `1. describeXxx(${JSON.stringify(malformed) || String(malformed)}, ...) is null — a genuine LeaderboardClaimRecord is required, never a bare claim`);
        }

        const receivedAt = new Date('2026-08-29T04:30:00Z');
        const record = recordFor(claim, receivedAt);
        const association = describePublisherLeaderboardClaimSnapshotAssociation(record, snapshot1);

        assert(association.claimId === claim.id, '2. claimId is carried through from the claim, unchanged');
        assert(association.signerIdentityId === claim.signerIdentityId, '3. signerIdentityId is carried through from the claim, unchanged');
        assert(association.claimCreatedAt.getTime() === claim.createdAt.getTime(), '4. claimCreatedAt is carried through from the claim, unchanged');
        assert(association.snapshotFingerprint === fingerprintOf(snapshot1), '5. snapshotFingerprint echoes the SUPPLIED snapshot\'s own identity');
        assert(association.evidenceFingerprint === snapshot1.evidenceFingerprint, '6. evidenceFingerprint likewise echoes the supplied snapshot');
        assert(association.policyVersion === snapshot1.policy.version, '7. policyVersion likewise echoes the supplied snapshot');
        assert(association.evidenceFingerprintMatches === true && association.policyVersionMatches === true && association.snapshotFingerprintMatches === true, '8. a claim associated with the exact snapshot it names matches on all three facts');
        assert(Object.isFrozen(association), '9. the projection is frozen');
        assert(!('matches' in association), '10. no collapsed matches verdict — this is association, never verification');
        assert(!('signatureValid' in association), '11. no signatureValid field — this file checks no signature');
        assert(record.claim === claim, '12. sanity — describing an association never touches, copies, or replaces the record\'s own claim instance');
    }
    console.log('✓ Section A: describePublisherLeaderboardClaimSnapshotAssociation() requires a genuine LeaderboardClaimRecord, carries receipt metadata + the supplied snapshot\'s own identity through, and never carries signatureValid/matches');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP.
    //
    //   S1 = (E1, P1)   S2 = (E1, P2)   S3 = (E2, P2)
    //   Claim signed over S2.
    //
    //   Claim → S1: evidenceFingerprintMatches true,  policyVersionMatches false, snapshotFingerprintMatches false
    //   Claim → S2: evidenceFingerprintMatches true,  policyVersionMatches true,  snapshotFingerprintMatches true
    //   Claim → S3: evidenceFingerprintMatches false, policyVersionMatches true,  snapshotFingerprintMatches false
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');

        const s1 = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const s2 = snapshotOf(E1, makeLeaderboard(makePolicy(2), [makeEntry(1, ALICE, 3)]));
        const s3 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, ALICE, 5)]));

        assert(s1.evidenceFingerprint === s2.evidenceFingerprint && s2.evidenceFingerprint !== s3.evidenceFingerprint, '13. sanity — S1/S2 share evidence, S3 genuinely differs');
        assert(s1.policy.version !== s2.policy.version && s2.policy.version === s3.policy.version, '14. sanity — S2/S3 share a policy version, S1 genuinely differs');
        assert(fingerprintOf(s1) !== fingerprintOf(s2) && fingerprintOf(s2) !== fingerprintOf(s3) && fingerprintOf(s1) !== fingerprintOf(s3), '15. sanity — all three snapshot fingerprints genuinely differ');

        const claim = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 2, snapshotFingerprint: fingerprintOf(s2) });
        const record = recordFor(claim);

        const toS1 = describePublisherLeaderboardClaimSnapshotAssociation(record, s1);
        assert(toS1.evidenceFingerprintMatches === true, '16. FLAGSHIP — Claim→S1: evidence matches (both E1)');
        assert(toS1.policyVersionMatches === false, '17. FLAGSHIP — Claim→S1: policy version differs (claim asserts P2, S1 is P1)');
        assert(toS1.snapshotFingerprintMatches === false, '18. FLAGSHIP — Claim→S1: composite fingerprint differs');

        const toS2 = describePublisherLeaderboardClaimSnapshotAssociation(record, s2);
        assert(toS2.evidenceFingerprintMatches === true, '19. FLAGSHIP — Claim→S2: evidence matches');
        assert(toS2.policyVersionMatches === true, '20. FLAGSHIP — Claim→S2: policy version matches — the exact snapshot the claim was signed over');
        assert(toS2.snapshotFingerprintMatches === true, '21. FLAGSHIP — Claim→S2: composite fingerprint matches');

        const toS3 = describePublisherLeaderboardClaimSnapshotAssociation(record, s3);
        assert(toS3.evidenceFingerprintMatches === false, '22. FLAGSHIP — Claim→S3: evidence differs (claim asserts E1, S3 is E2)');
        assert(toS3.policyVersionMatches === true, '23. FLAGSHIP — Claim→S3: policy version matches (both P2)');
        assert(toS3.snapshotFingerprintMatches === false, '24. FLAGSHIP — Claim→S3: composite fingerprint differs');

        // The three facts are genuinely independent — every one of the
        // eight possible true/false triples is not required, but no two
        // of the three calls above produce the identical triple, and each
        // call mixes true and false within itself.
        const triple = (a) => `${a.evidenceFingerprintMatches}/${a.policyVersionMatches}/${a.snapshotFingerprintMatches}`;
        assert(triple(toS1) === 'true/false/false', '25. FLAGSHIP — Claim→S1 triple is exactly (true, false, false)');
        assert(triple(toS2) === 'true/true/true', '26. FLAGSHIP — Claim→S2 triple is exactly (true, true, true)');
        assert(triple(toS3) === 'false/true/false', '27. FLAGSHIP — Claim→S3 triple is exactly (false, true, false)');

        // Receipt metadata is identical across all three calls — only the
        // relationship to the supplied snapshot changed.
        assert(toS1.claimId === toS2.claimId && toS2.claimId === toS3.claimId, '28. FLAGSHIP — claimId is identical across all three calls');
        assert(toS1.signerIdentityId === toS2.signerIdentityId && toS2.signerIdentityId === toS3.signerIdentityId, '29. FLAGSHIP — signerIdentityId is identical across all three calls');

        // The echoed snapshot identity fields track whichever snapshot was
        // actually supplied to that particular call.
        assert(toS1.snapshotFingerprint === fingerprintOf(s1) && toS2.snapshotFingerprint === fingerprintOf(s2) && toS3.snapshotFingerprint === fingerprintOf(s3), '30. FLAGSHIP — snapshotFingerprint echoes whichever snapshot was actually supplied to that call');
    }
    console.log('✓ Section B: FLAGSHIP — a claim signed over S2 is explicitly associated with S1, S2, and S3 in turn; evidenceFingerprintMatches/policyVersionMatches/snapshotFingerprintMatches vary independently across the three calls, proving the three relationships are genuinely independent');

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

        const genuineAssociation = describePublisherLeaderboardClaimSnapshotAssociation(genuineRecord, s2);
        const tamperedAssociation = describePublisherLeaderboardClaimSnapshotAssociation(tamperedRecord, s2);

        assert(genuineAssociation.evidenceFingerprintMatches === true && genuineAssociation.policyVersionMatches === true && genuineAssociation.snapshotFingerprintMatches === true, '31. the genuinely signed claim associates fully with S2');
        assert(tamperedAssociation.evidenceFingerprintMatches === true && tamperedAssociation.policyVersionMatches === true && tamperedAssociation.snapshotFingerprintMatches === true, '32. the tampered-signature claim associates fully with S2 too — association never inspects the signature');
        assert(genuineAssociation.evidenceFingerprintMatches === tamperedAssociation.evidenceFingerprintMatches && genuineAssociation.policyVersionMatches === tamperedAssociation.policyVersionMatches && genuineAssociation.snapshotFingerprintMatches === tamperedAssociation.snapshotFingerprintMatches, '33. the three association facts are IDENTICAL between a genuinely signed claim and a deliberately invalid-signature claim sharing the same asserted identifiers');
    }
    console.log('✓ Section C: a deliberately invalid signature never changes the association facts — association answers whether a claim describes a snapshot, never whether its signature is valid');

    // ---------------------------------------------------------------
    // Section D — no automatic selection, tolerance, no mutation,
    // determinism, vocabulary, network access.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotAssociationView.js', import.meta.url), 'utf8');
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(!importLines.some((line) => line.includes('PublicationObservationArchive')), '34. this file never imports PublicationObservationArchive — no archive reconstruction anywhere in it');
        // Strip full-line comments before checking the ACTUAL CODE — the
        // header prose above discusses ".find()" and "verifier" by name
        // (to explain what this file deliberately does NOT do), so only
        // the executable lines are checked here.
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!codeOnly.includes('.find('), '35. no `.find()` anywhere in this file\'s own code — no automatic "best matching snapshot" selection over a collection');
        assert(!codeOnly.includes('verifier'), '36. no `verifier` parameter or reference anywhere in this file\'s own code — association performs no cryptographic check');

        const alice = makeIdentity('Alice');
        const snapshot = snapshotOf(E1, makeLeaderboard(makePolicy(1), [makeEntry(1, ALICE, 3)]));
        const claim = signedClaim(alice, { evidenceFingerprint: E1, policyVersion: 1, snapshotFingerprint: fingerprintOf(snapshot) });
        const record = recordFor(claim);

        const emptySnapshot = describePublisherLeaderboardSnapshot(undefined, undefined);
        for (const malformedSnapshot of [null, undefined, {}, 'not a snapshot', 42, []]) {
            const result = describePublisherLeaderboardClaimSnapshotAssociation(record, malformedSnapshot);
            const expected = describePublisherLeaderboardClaimSnapshotAssociation(record, emptySnapshot);
            assert(serialize(result) === serialize(expected), `37. a malformed snapshot (${JSON.stringify(malformedSnapshot)}) degrades to 0.8.119's own well-defined empty snapshot, never throwing`);
        }

        const recordJsonBefore = serialize(record.toJSON());
        const snapshotJsonBefore = serialize(snapshot);
        describePublisherLeaderboardClaimSnapshotAssociation(record, snapshot);
        assert(serialize(record.toJSON()) === recordJsonBefore, '38. the claim record is never mutated');
        assert(serialize(snapshot) === snapshotJsonBefore, '39. the supplied snapshot is never mutated');
        assert(Object.isFrozen(record), '40. the record remains frozen');

        const first = describePublisherLeaderboardClaimSnapshotAssociation(record, snapshot);
        const second = describePublisherLeaderboardClaimSnapshotAssociation(record, snapshot);
        assert(serialize(first) === serialize(second), '41. repeated calls with identical input are byte-identical');

        const forbiddenVocabulary = ['trusted', 'current', 'authoritative', 'verified', 'score', 'rank', 'reputation', 'confidence', 'quality', 'worthiness', 'authority', 'signaturevalid'];
        const projectionText = serialize(first).toLowerCase();
        for (const word of forbiddenVocabulary) {
            assert(!projectionText.includes(word), `42. the projection's own output never carries "${word}"`);
        }
        assert(!('matches' in first), '42b. the projection carries no collapsed `matches` verdict field');

        const { result, networkCallOccurred } = await withoutNetworkAccess(() => describePublisherLeaderboardClaimSnapshotAssociation(record, snapshot));
        assert(networkCallOccurred === false, '43. associating a claim record with a snapshot performs zero network access');
        assert(result.evidenceFingerprintMatches === true, '44. sanity — the result itself is genuine');
    }
    console.log('✓ Section D: no automatic snapshot selection, no verifier surface, malformed input degrades to 0.8.119\'s own empty snapshot, neither input is ever mutated, results are deterministic, no forbidden vocabulary, zero network access');

    console.log('\nAll PublisherLeaderboardClaimSnapshotAssociationView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotAssociationView.test.js FAILED:', error);
    process.exitCode = 1;
});
