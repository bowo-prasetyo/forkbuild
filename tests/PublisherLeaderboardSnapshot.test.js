import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { reconstructAchievementEvidenceFingerprint } from '../application/AchievementEvidenceFingerprint.js';
import { exportAchievementEvidence, importAchievementEvidence } from '../application/AchievementEvidenceExport.js';
import {
    describeAchievementEvidenceExchangeRequest,
    reconstructAchievementEvidenceExchangeResponse,
    applyAchievementEvidenceExchange
} from '../application/AchievementEvidenceExchange.js';
import { describePublisherLeaderboard, reconstructPublisherLeaderboard } from '../application/PublisherLeaderboardView.js';
import { describePublisherRanking } from '../application/PublisherRankingPolicy.js';
import {
    describePublisherLeaderboardSnapshot,
    reconstructPublisherLeaderboardSnapshot
} from '../application/PublisherLeaderboardSnapshot.js';

// 0.8.119 — Reproducible Leaderboard Snapshot.
//
// Section A: an empty archive produces a valid, well-defined empty snapshot
// Section B: determinism — repeated reconstruction is byte-identical
// Section C: evidence sensitivity — one changed achievement-driving fact
//            changes both the fingerprint and the reconstructed snapshot
// Section D: policy sensitivity — same evidence fingerprint, different
//            policy, different snapshot (identity and result)
// Section E: policy preservation — snapshot.policy is the EXACT policy
//            object the leaderboard was ranked under, by reference
// Section F: leaderboard projection purity — no re-ranking, no sort, no
//            second comparator inside this layer
// Section G: archive isolation — observations outside achievement evidence
//            never change a reconstructed snapshot
// Section H: reload equivalence — archive -> export/import -> snapshot
//            matches the original snapshot
// Section I: synchronization convergence — the 0.8.118 Alice/Bob scenario,
//            one layer up: disjoint snapshots converge after a two-way
//            exchange, entirely from recomputation, never transmission
// Section J: no persistence — reconstructing a snapshot never mutates the
//            archive or introduces a new collection
// Section K: no new ranking vocabulary anywhere on a snapshot
// Section L: shape, defaults, malformed-input tolerance, zero network

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
const TXID_D = 'd'.repeat(64);

const CREATED_AT = {
    a: new Date('2026-08-25T00:00:00Z'),
    b: new Date('2026-08-25T00:01:00Z'),
    c: new Date('2026-08-25T00:02:00Z'),
    d: new Date('2026-08-25T00:03:00Z'),
    carolA: new Date('2026-08-25T00:10:00Z'),
    carolB: new Date('2026-08-25T00:11:00Z'),
    carolC: new Date('2026-08-25T00:12:00Z'),
    carolD: new Date('2026-08-25T00:13:00Z'),
    daveB: new Date('2026-08-25T00:14:00Z'),
    daveC: new Date('2026-08-25T00:15:00Z'),
    reference: new Date('2026-08-25T00:20:00Z')
};

function anchor(archive, letter, txid) {
    const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
    return useCase.execute(archive, { anchorId: `pub-${letter}`, contentHash: `pub-${letter}-content`, txid, network: NETWORK, createdAt: CREATED_AT[letter] });
}

function identityOf(archive, letter) {
    return archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === `pub-${letter}`).toBlockchainPublicationIdentity();
}

// A minimal, one-publisher archive that genuinely earns at least one
// achievement — the smallest fixture that makes "the snapshot changed"
// or "the snapshot didn't change" a meaningful assertion rather than a
// vacuous one over two empty leaderboards.
function buildSinglePublisherArchive() {
    const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
    let archive = PublicationObservationArchive.empty();
    archive = anchor(archive, 'a', TXID_A);
    const identityA = identityOf(archive, 'a');
    archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityA, createdAt: CREATED_AT.a });
    return archive;
}

// Alice's own replica: publications A, B, C. Carol is associated with all
// three of Alice's own publications; Dave with B and C only. One reference
// record (C references B). Identical fixture to
// tests/AchievementEvidenceExchange.test.js's own flagship, reused here
// rather than reinvented, so this milestone's own convergence test is
// provably the same scenario, one layer up.
function buildAliceArchive() {
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

// Bob's own replica: publications B, C, D — B and C byte-identical to
// Alice's own, D genuinely new.
function buildBobArchive() {
    const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
    const referenceUseCase = new CreatePublicationReferenceRecordUseCase();

    let archive = PublicationObservationArchive.empty();
    archive = anchor(archive, 'b', TXID_B);
    archive = anchor(archive, 'c', TXID_C);
    archive = anchor(archive, 'd', TXID_D);

    const identityB = identityOf(archive, 'b');
    const identityC = identityOf(archive, 'c');
    const identityD = identityOf(archive, 'd');

    archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: identityC, referencedPublicationIdentity: identityB, createdAt: CREATED_AT.reference });

    archive = associationUseCase.execute(archive, { publisherId: 'Carol', publicationIdentity: identityB, createdAt: CREATED_AT.carolB });
    archive = associationUseCase.execute(archive, { publisherId: 'Carol', publicationIdentity: identityC, createdAt: CREATED_AT.carolC });
    archive = associationUseCase.execute(archive, { publisherId: 'Carol', publicationIdentity: identityD, createdAt: CREATED_AT.carolD });
    archive = associationUseCase.execute(archive, { publisherId: 'Dave', publicationIdentity: identityB, createdAt: CREATED_AT.daveB });
    archive = associationUseCase.execute(archive, { publisherId: 'Dave', publicationIdentity: identityC, createdAt: CREATED_AT.daveC });

    return archive;
}

function serializeSnapshot(snapshot) {
    return JSON.stringify(snapshot);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — an empty archive produces a valid, well-defined empty
    // snapshot.
    // ---------------------------------------------------------------
    {
        const snapshot = reconstructPublisherLeaderboardSnapshot(PublicationObservationArchive.empty());
        assert(typeof snapshot.evidenceFingerprint === 'string' && /^[0-9a-f]{64}$/.test(snapshot.evidenceFingerprint), '1. an empty archive still produces a genuine, well-formed 64-char hex fingerprint');
        assert(snapshot.evidenceFingerprint === reconstructAchievementEvidenceFingerprint(PublicationObservationArchive.empty()).fingerprint, '2. the empty snapshot\'s own fingerprint is exactly 0.8.116\'s own fingerprint over an empty archive');
        assert(snapshot.policy && snapshot.policy.version === 1, '3. a policy is present even over an empty archive');
        assert(snapshot.leaderboard.entryCount === 0 && snapshot.leaderboard.entries.length === 0, '4. an empty archive\'s own leaderboard has zero entries');
        assert(Object.isFrozen(snapshot), '5. the snapshot itself is frozen');

        assert(reconstructPublisherLeaderboardSnapshot(null).evidenceFingerprint === snapshot.evidenceFingerprint, '6. a null archive degrades to the same empty snapshot, never throws');
        assert(reconstructPublisherLeaderboardSnapshot(undefined).evidenceFingerprint === snapshot.evidenceFingerprint, '7. an undefined archive never throws');
        assert(reconstructPublisherLeaderboardSnapshot({}).evidenceFingerprint === snapshot.evidenceFingerprint, '8. a plain object masquerading as an archive degrades to the empty snapshot');
    }
    console.log('✓ Section A: an empty archive produces a valid, well-defined empty snapshot');

    // ---------------------------------------------------------------
    // Section B — determinism.
    // ---------------------------------------------------------------
    {
        const archive = buildSinglePublisherArchive();
        const first = reconstructPublisherLeaderboardSnapshot(archive);
        const second = reconstructPublisherLeaderboardSnapshot(archive);
        assert(serializeSnapshot(first) === serializeSnapshot(second), '9. repeated reconstruction from the identical archive is byte-identical');

        const rebuiltArchive = buildSinglePublisherArchive();
        const third = reconstructPublisherLeaderboardSnapshot(rebuiltArchive);
        assert(serializeSnapshot(first) === serializeSnapshot(third), '10. two independently built, factually equivalent archives reconstruct byte-identical snapshots');
    }
    console.log('✓ Section B: repeated reconstruction, and reconstruction from two independently built equivalent archives, is byte-identical');

    // ---------------------------------------------------------------
    // Section C — evidence sensitivity.
    // ---------------------------------------------------------------
    {
        const archive = buildSinglePublisherArchive();
        const before = reconstructPublisherLeaderboardSnapshot(archive);

        // Change one achievement-driving evidence fact: a second publisher
        // associates with the same publication.
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
        const identityA = identityOf(archive, 'a');
        const changedArchive = associationUseCase.execute(archive, { publisherId: 'Bob', publicationIdentity: identityA, createdAt: CREATED_AT.b });

        const after = reconstructPublisherLeaderboardSnapshot(changedArchive);
        assert(after.evidenceFingerprint !== before.evidenceFingerprint, '11. one changed achievement-driving fact changes the evidence fingerprint');
        assert(serializeSnapshot(after) !== serializeSnapshot(before), '12. the reconstructed snapshot changes accordingly');
        assert(after.leaderboard.entryCount === 2 && before.leaderboard.entryCount === 1, '13. concretely: the leaderboard itself now names a second publisher');
    }
    console.log('✓ Section C: a changed achievement-driving evidence fact changes both the fingerprint and the reconstructed snapshot');

    // ---------------------------------------------------------------
    // Section D — policy sensitivity. There is exactly one shipped ranking
    // policy (0.8.112, version 1) — this section proves the PURE
    // computation carries whatever policy its input leaderboard names,
    // never hardcoding one, by handing it two hand-shaped leaderboards
    // that share an evidence fingerprint but declare different policies.
    // ---------------------------------------------------------------
    {
        const alice = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const bob = new PublisherIdentityRecord({ publisherId: 'Bob' });
        const sharedFingerprint = reconstructAchievementEvidenceFingerprint(buildSinglePublisherArchive()).fingerprint;

        const policyVersion1 = Object.freeze({ version: 1, criteria: Object.freeze([Object.freeze({ field: 'achievementCount', order: 'DESCENDING' })]), tieBreak: Object.freeze({ field: 'publisherIdentity.publisherId', order: 'ASCENDING' }) });
        const policyVersion2 = Object.freeze({ version: 2, criteria: Object.freeze([Object.freeze({ field: 'publicationIdentityCount', order: 'DESCENDING' })]), tieBreak: Object.freeze({ field: 'publisherIdentity.publisherId', order: 'DESCENDING' }) });

        const leaderboardUnderPolicy1 = Object.freeze({
            policy: policyVersion1,
            entryCount: 2,
            entries: Object.freeze([
                Object.freeze({ rank: 1, publisherIdentity: alice, achievementCount: 3, distinctAchievementKindCount: 2, publicationIdentityCount: 1 }),
                Object.freeze({ rank: 2, publisherIdentity: bob, achievementCount: 1, distinctAchievementKindCount: 1, publicationIdentityCount: 4 })
            ])
        });
        const leaderboardUnderPolicy2 = Object.freeze({
            policy: policyVersion2,
            entryCount: 2,
            entries: Object.freeze([
                Object.freeze({ rank: 1, publisherIdentity: bob, achievementCount: 1, distinctAchievementKindCount: 1, publicationIdentityCount: 4 }),
                Object.freeze({ rank: 2, publisherIdentity: alice, achievementCount: 3, distinctAchievementKindCount: 2, publicationIdentityCount: 1 })
            ])
        });

        const snapshotUnderPolicy1 = describePublisherLeaderboardSnapshot(sharedFingerprint, leaderboardUnderPolicy1);
        const snapshotUnderPolicy2 = describePublisherLeaderboardSnapshot(sharedFingerprint, leaderboardUnderPolicy2);

        assert(snapshotUnderPolicy1.evidenceFingerprint === snapshotUnderPolicy2.evidenceFingerprint, '14. sanity — both snapshots share the identical evidence fingerprint');
        assert(snapshotUnderPolicy1.policy.version !== snapshotUnderPolicy2.policy.version, '15. two different policies produce two different policy versions on the snapshot');
        assert(serializeSnapshot(snapshotUnderPolicy1) !== serializeSnapshot(snapshotUnderPolicy2), '16. the identical evidence fingerprint under two different policies produces two genuinely different snapshots');
        assert(snapshotUnderPolicy1.leaderboard.entries[0].publisherIdentity.publisherId === 'Alice', '17. under policy 1, Alice ranks first');
        assert(snapshotUnderPolicy2.leaderboard.entries[0].publisherIdentity.publisherId === 'Bob', '18. under policy 2, the ordering genuinely differs — Bob ranks first');
    }
    console.log('✓ Section D: the identical evidence fingerprint under two different ranking policies produces two genuinely different snapshots');

    // ---------------------------------------------------------------
    // Section E — policy preservation: the exact policy object, by
    // reference, never a re-described copy.
    // ---------------------------------------------------------------
    {
        const archive = buildSinglePublisherArchive();
        const fingerprint = reconstructAchievementEvidenceFingerprint(archive).fingerprint;
        const leaderboard = reconstructPublisherLeaderboard(archive);
        const snapshot = describePublisherLeaderboardSnapshot(fingerprint, leaderboard);

        assert(snapshot.policy === snapshot.leaderboard.policy, '19. snapshot.policy is the EXACT same object instance as snapshot.leaderboard.policy — never a second, independently-produced copy');
        assert(snapshot.policy === leaderboard.policy, '20. and it is the exact same instance the underlying leaderboard handed to describePublisherLeaderboardSnapshot() carried, by reference');
        assert(Object.keys(snapshot.policy).sort().join(',') === 'criteria,tieBreak,version'.split(',').sort().join(','), '21. the preserved policy carries its full definition — criteria and tieBreak, not merely a bare version number');
    }
    console.log('✓ Section E: the snapshot preserves the exact ranking policy object, by reference, never summarized to a bare version number');

    // ---------------------------------------------------------------
    // Section F — leaderboard projection purity: no re-ranking, no sort,
    // ever, inside this layer.
    // ---------------------------------------------------------------
    {
        const zed = new PublisherIdentityRecord({ publisherId: 'Zed' });
        const amy = new PublisherIdentityRecord({ publisherId: 'Amy' });
        const fabricatedLeaderboard = Object.freeze({
            policy: describePublisherRanking([]).policy,
            entryCount: 2,
            entries: Object.freeze([
                Object.freeze({ rank: 99, publisherIdentity: zed, achievementCount: 1, distinctAchievementKindCount: 1, publicationIdentityCount: 1 }),
                Object.freeze({ rank: 1, publisherIdentity: amy, achievementCount: 1, distinctAchievementKindCount: 1, publicationIdentityCount: 1 })
            ])
        });
        const fingerprint = reconstructAchievementEvidenceFingerprint(PublicationObservationArchive.empty()).fingerprint;

        const snapshot = describePublisherLeaderboardSnapshot(fingerprint, fabricatedLeaderboard);
        assert(snapshot.leaderboard === fabricatedLeaderboard, '22. the input leaderboard is echoed by reference, untouched — the same instance, not a copy');
        assert(snapshot.leaderboard.entries.map((e) => e.publisherIdentity.publisherId).join(',') === 'Zed,Amy', '23. entry order is preserved EXACTLY as given — "Zed" first despite rank 99, never reordered');
        assert(snapshot.leaderboard.entries.map((e) => e.rank).join(',') === '99,1', '24. rank values are untouched, including a non-monotonic sequence this layer never corrects');

        const realArchive = buildSinglePublisherArchive();
        const directLeaderboard = reconstructPublisherLeaderboard(realArchive);
        const directFingerprint = reconstructAchievementEvidenceFingerprint(realArchive).fingerprint;
        const composedSnapshot = describePublisherLeaderboardSnapshot(directFingerprint, directLeaderboard);
        assert(JSON.stringify(composedSnapshot.leaderboard) === JSON.stringify(directLeaderboard), '25. over genuine input, the snapshot\'s own leaderboard is byte-identical to reconstructPublisherLeaderboard()\'s own output — no re-ranking, no second projection');
    }
    console.log('✓ Section F: the snapshot layer performs no re-ranking, no sort, and no second comparator of its own — it echoes the input leaderboard verbatim');

    // ---------------------------------------------------------------
    // Section G — archive isolation: observations outside achievement
    // evidence never change a reconstructed snapshot.
    // ---------------------------------------------------------------
    {
        const archive = buildSinglePublisherArchive();
        const before = reconstructPublisherLeaderboardSnapshot(archive);

        const identityA = identityOf(archive, 'a');
        const withConfirmation = archive.appendBitcoinConfirmationObservation('pub-a', {
            state: 'CONFIRMED', txid: TXID_A, blockHash: 'f'.repeat(64), blockHeight: 800000,
            confirmationCount: 6, reason: null, observedAt: new Date('2026-08-26T00:00:00Z')
        });
        const withContentProof = withConfirmation.appendBitcoinContentProofObservation('pub-a', {
            state: 'MATCH', contentHash: 'pub-a-content', reason: null, observedAt: new Date('2026-08-26T00:01:00Z')
        });

        const after = reconstructPublisherLeaderboardSnapshot(withContentProof);
        assert(withContentProof.bitcoinConfirmationObservationsByAnchorId['pub-a'].length === 1, '26. sanity — the confirmation observation genuinely landed on the archive');
        assert(serializeSnapshot(after) === serializeSnapshot(before), '27. an archived confirmation and content-proof observation, unrelated to achievement evidence, never changes the reconstructed snapshot');
        assert(identityA instanceof Object, '28. sanity — the publication identity used above is genuine');
    }
    console.log('✓ Section G: observations outside the four achievement-evidence collections never change a reconstructed snapshot');

    // ---------------------------------------------------------------
    // Section H — reload equivalence: archive -> export/import -> snapshot
    // matches the original snapshot.
    // ---------------------------------------------------------------
    {
        const archive = buildAliceArchive();
        const original = reconstructPublisherLeaderboardSnapshot(archive);

        const exported = exportAchievementEvidence(archive);
        const importResult = importAchievementEvidence(exported);
        const reloaded = reconstructPublisherLeaderboardSnapshot(importResult.archive);

        assert(serializeSnapshot(reloaded) === serializeSnapshot(original), '29. a snapshot reconstructed after an export/import round-trip is byte-identical to the original');
    }
    console.log('✓ Section H: archive -> export/import -> snapshot matches the original snapshot exactly');

    // ---------------------------------------------------------------
    // Section I — synchronization convergence: the 0.8.118 Alice/Bob
    // scenario, one layer up.
    // ---------------------------------------------------------------
    {
        const aliceArchive = buildAliceArchive();
        const bobArchive = buildBobArchive();

        const aliceSnapshotBefore = reconstructPublisherLeaderboardSnapshot(aliceArchive);
        const bobSnapshotBefore = reconstructPublisherLeaderboardSnapshot(bobArchive);
        assert(serializeSnapshot(aliceSnapshotBefore) !== serializeSnapshot(bobSnapshotBefore), '30. before any exchange, Alice\'s and Bob\'s own snapshots genuinely differ');

        const aliceRequest = describeAchievementEvidenceExchangeRequest(
            aliceArchive.bitcoinAnchorPublicationRecords, aliceArchive.baseAnchorPublicationRecords,
            aliceArchive.publicationReferenceRecords, aliceArchive.publisherPublicationAssociationRecords
        );
        const bobResponseToAlice = reconstructAchievementEvidenceExchangeResponse(aliceRequest, bobArchive);
        const aliceAfterApply = applyAchievementEvidenceExchange(aliceArchive, bobResponseToAlice).archive;

        const bobRequest = describeAchievementEvidenceExchangeRequest(
            bobArchive.bitcoinAnchorPublicationRecords, bobArchive.baseAnchorPublicationRecords,
            bobArchive.publicationReferenceRecords, bobArchive.publisherPublicationAssociationRecords
        );
        const aliceResponseToBob = reconstructAchievementEvidenceExchangeResponse(bobRequest, aliceArchive);
        const bobAfterApply = applyAchievementEvidenceExchange(bobArchive, aliceResponseToBob).archive;

        const aliceSnapshotAfter = reconstructPublisherLeaderboardSnapshot(aliceAfterApply);
        const bobSnapshotAfter = reconstructPublisherLeaderboardSnapshot(bobAfterApply);
        assert(serializeSnapshot(aliceSnapshotAfter) === serializeSnapshot(bobSnapshotAfter), '31. FLAGSHIP — after one exchange in EACH direction, Alice\'s and Bob\'s own independently reconstructed snapshots are byte-identical');
        assert(aliceSnapshotAfter.evidenceFingerprint !== aliceSnapshotBefore.evidenceFingerprint, '32. Alice\'s own snapshot genuinely changed — she now holds Bob\'s publication D too');
        assert(aliceSnapshotAfter.leaderboard.entryCount > 0, '33. sanity — the converged snapshot names a genuinely non-empty leaderboard');

        // The crucial negative proof: the snapshot itself never appeared in
        // any exchanged message — it was independently RECOMPUTED on each
        // replica after the evidence alone converged.
        const exchangedJson = (
            JSON.stringify(aliceRequest) + JSON.stringify(bobResponseToAlice) +
            JSON.stringify(bobRequest) + JSON.stringify(aliceResponseToBob)
        ).toLowerCase();
        for (const word of ['leaderboard', 'ranking', 'rank', 'policy']) {
            assert(!exchangedJson.includes(word), `34. "${word}" never appears in any exchanged message — the converged snapshot was recomputed, never transmitted`);
        }
    }
    console.log('✓ Section I: FLAGSHIP — Alice and Bob converge to byte-identical, independently reconstructed snapshots through a two-way evidence exchange, without either snapshot ever being transmitted');

    // ---------------------------------------------------------------
    // Section J — no persistence: reconstructing a snapshot never mutates
    // the archive.
    // ---------------------------------------------------------------
    {
        const archive = buildAliceArchive();
        const beforeSnapshotJson = JSON.stringify(exportAchievementEvidence(archive));
        const preCallAssociationCount = archive.publisherPublicationAssociationRecordCount;
        const preCallBitcoinCount = archive.bitcoinAnchorPublicationRecords.length;

        const { result: snapshot, networkCallOccurred } = await withoutNetworkAccess(() => reconstructPublisherLeaderboardSnapshot(archive));
        assert(networkCallOccurred === false, '35. reconstructing a snapshot performs zero network access');
        assert(JSON.stringify(exportAchievementEvidence(archive)) === beforeSnapshotJson, '36. the archive\'s own achievement evidence is byte-identical after reconstructing a snapshot from it');
        assert(archive.publisherPublicationAssociationRecordCount === preCallAssociationCount, '37. the archive\'s own association record count is untouched');
        assert(archive.bitcoinAnchorPublicationRecords.length === preCallBitcoinCount, '38. the archive\'s own Bitcoin record count is untouched');
        assert(!('leaderboardSnapshots' in archive), '39. the archive gains no new leaderboardSnapshots collection of any kind');
        assert(snapshot !== undefined, '40. sanity — a snapshot was in fact produced');
    }
    console.log('✓ Section J: reconstructing a snapshot performs zero network access and never mutates or extends the archive');

    // ---------------------------------------------------------------
    // Section K — no new ranking vocabulary anywhere on a snapshot.
    // ---------------------------------------------------------------
    {
        const archive = buildAliceArchive();
        const snapshot = reconstructPublisherLeaderboardSnapshot(archive);
        const json = JSON.stringify(snapshot).toLowerCase();
        const forbidden = ['score', 'xp', 'reputation', 'trust', 'weight', 'rating', 'percentile', 'level', 'tier', 'points', 'snapshothash', 'exportedat', 'timestamp'];
        for (const word of forbidden) {
            assert(!json.includes(word), `41. a snapshot never carries "${word}"`);
        }
        assert(Object.keys(snapshot).sort().join(',') === ['evidenceFingerprint', 'leaderboard', 'policy'].sort().join(','), '42. a snapshot carries EXACTLY these three top-level fields — nothing else');
    }
    console.log('✓ Section K: a snapshot never introduces score/xp/reputation/trust/weight/rating/percentile vocabulary, or any field beyond the three documented ones');

    // ---------------------------------------------------------------
    // Section L — shape, defaults, malformed-input tolerance.
    // ---------------------------------------------------------------
    {
        const archive = buildSinglePublisherArchive();
        const fingerprint = reconstructAchievementEvidenceFingerprint(archive).fingerprint;
        const leaderboard = reconstructPublisherLeaderboard(archive);

        const described = describePublisherLeaderboardSnapshot(fingerprint, leaderboard);
        const reconstructed = reconstructPublisherLeaderboardSnapshot(archive);
        assert(serializeSnapshot(described) === serializeSnapshot(reconstructed), '43. describe() over an archive\'s own already-computed fingerprint and leaderboard agrees with reconstruct() over the archive itself');

        // Malformed evidenceFingerprint degrades to the canonical empty
        // fingerprint, never thrown on, never echoed as-is.
        for (const malformed of [null, undefined, 42, '', 'not-hex', 'A'.repeat(64), 'a'.repeat(63)]) {
            const snapshot = describePublisherLeaderboardSnapshot(malformed, leaderboard);
            assert(snapshot.evidenceFingerprint === reconstructAchievementEvidenceFingerprint(PublicationObservationArchive.empty()).fingerprint, `44. a malformed evidenceFingerprint (${JSON.stringify(malformed)}) degrades to the canonical empty-evidence fingerprint`);
        }

        // Malformed leaderboard degrades to describePublisherLeaderboard(undefined).
        const emptyLeaderboard = describePublisherLeaderboard(undefined);
        for (const malformed of [null, undefined, 'garbage', 42, [], {}, { entries: 'not-an-array' }]) {
            const snapshot = describePublisherLeaderboardSnapshot(fingerprint, malformed);
            assert(JSON.stringify(snapshot.leaderboard) === JSON.stringify(emptyLeaderboard), `45. a malformed leaderboard (${JSON.stringify(malformed)}) degrades to describePublisherLeaderboard(undefined)`);
            assert(snapshot.policy.version === 1, '46. and still carries a well-defined policy');
        }

        assert(Object.isFrozen(described.leaderboard), '47. the echoed leaderboard remains frozen');
        assert(Object.isFrozen(described.policy), '48. the echoed policy remains frozen');
    }
    console.log('✓ Section L: describe()/reconstruct() agree, and malformed input degrades to well-defined empty values, never throwing');

    console.log('\nAll PublisherLeaderboardSnapshot tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardSnapshot.test.js FAILED:', error);
    process.exitCode = 1;
});
