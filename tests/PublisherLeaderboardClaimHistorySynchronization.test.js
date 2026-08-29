import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { CreatePublisherLeaderboardSnapshotClaimUseCase } from '../application/CreatePublisherLeaderboardSnapshotClaimUseCase.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { appendLeaderboardClaimHistoryEntry } from '../application/LeaderboardClaimHistory.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import {
    PublisherLeaderboardClaimHistoryExchangeProtocolVersion,
    exportPublisherLeaderboardClaimHistory,
    applyPublisherLeaderboardClaimHistoryExchange,
    PublisherLeaderboardClaimHistoryExchangeApplyOutcome
} from '../application/PublisherLeaderboardClaimHistoryExchange.js';
import { describePublisherLeaderboardClaimHistoryDifference } from '../application/PublisherLeaderboardClaimHistoryDifference.js';
import {
    describePublisherLeaderboardClaimHistorySynchronization,
    reconstructPublisherLeaderboardClaimHistorySynchronization,
    exportPublisherLeaderboardClaimHistorySynchronization,
    applyPublisherLeaderboardClaimHistorySynchronization
} from '../application/PublisherLeaderboardClaimHistorySynchronization.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.131 — Claim History Synchronization Exchange.
//
// Section A: describePublisherLeaderboardClaimHistorySynchronization is a
//            byte-identical passthrough to 0.8.127's own difference
//            projection — no new comparison algorithm, same tolerance
// Section B: reconstructPublisherLeaderboardClaimHistorySynchronization
//            reads both sides through 0.8.130's own archive seam and
//            agrees exactly with 0.8.127's own reconstruct(), including
//            malformed/absent archive tolerance
// Section C: exportPublisherLeaderboardClaimHistorySynchronization exports
//            ONLY sourceOnly, in 0.8.126's own unchanged wire shape;
//            already-converged histories export a genuine empty payload
// Section D: applyPublisherLeaderboardClaimHistorySynchronization is a
//            direct, unmodified delegation to
//            applyPublisherLeaderboardClaimHistoryExchange() — identical
//            outcome, byte for byte, given identical arguments
// Section E: FLAGSHIP — Alice [A, B, B1] / Bob [B, B2, C]; sync Alice to
//            Bob, then Bob to Alice (two explicit, directional calls);
//            both replicas converge to five receipts each, B1 and B2
//            remain genuinely distinct, and a following difference
//            reports sameHistory === true
// Section F: determinism, immutability, zero network access, no archive
//            ever written to
// Section G: no verification/trust vocabulary anywhere in this file's own
//            results; every payload this file produces is a genuine
//            0.8.126 envelope, never a new shape

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function archiveFromClaimHistory(history) {
    let archive = PublicationObservationArchive.empty();
    for (const record of history) {
        archive = archive.appendLeaderboardClaimRecord(record, record.origin);
    }
    return archive;
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

// A small, deterministic evidence fixture — E1. Mirrors the shared
// fixture the rest of the 0.8.121-0.8.130 family already uses.
function buildArchiveE1() {
    const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
    let archive = PublicationObservationArchive.empty();
    archive = anchor(archive, 'a', 'a'.repeat(64), new Date('2026-08-29T00:00:00Z'));
    archive = associationUseCase.execute(archive, { publisherId: 'Carol', publicationIdentity: identityOf(archive, 'a'), createdAt: new Date('2026-08-29T00:01:00Z') });
    return archive;
}

function signedClaimFor(identityProvider, verifier, archive) {
    return new CreatePublisherLeaderboardSnapshotClaimUseCase(identityProvider, verifier).execute(archive);
}

async function run() {
    const verifier = new LocalAuthorizationVerifier();

    // ---------------------------------------------------------------
    // Section A — describePublisherLeaderboardClaimHistorySynchronization
    // is a byte-identical passthrough to 0.8.127's own difference.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);
        const recordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T20:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T20:01:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });

        const sourceHistory = [recordA];
        const targetHistory = [recordB];

        const viaSync = describePublisherLeaderboardClaimHistorySynchronization(sourceHistory, targetHistory);
        const viaDifference = describePublisherLeaderboardClaimHistoryDifference(sourceHistory, targetHistory);
        assert(serialize({ sourceOnly: viaSync.sourceOnly.map((r) => r.toJSON()), targetOnly: viaSync.targetOnly.map((r) => r.toJSON()), sourceOnlyCount: viaSync.sourceOnlyCount, targetOnlyCount: viaSync.targetOnlyCount, sameHistory: viaSync.sameHistory, sourceCount: viaSync.sourceCount, targetCount: viaSync.targetCount })
            === serialize({ sourceOnly: viaDifference.sourceOnly.map((r) => r.toJSON()), targetOnly: viaDifference.targetOnly.map((r) => r.toJSON()), sourceOnlyCount: viaDifference.sourceOnlyCount, targetOnlyCount: viaDifference.targetOnlyCount, sameHistory: viaDifference.sameHistory, sourceCount: viaDifference.sourceCount, targetCount: viaDifference.targetCount }),
            '1. describePublisherLeaderboardClaimHistorySynchronization agrees exactly with describePublisherLeaderboardClaimHistoryDifference');
        assert(viaSync.sourceOnly[0] === recordA && viaSync.targetOnly[0] === recordB, '2. the original record instances are preserved, never copies');

        assert(describePublisherLeaderboardClaimHistorySynchronization().sameHistory === true, '3. calling with no arguments defaults to two empty histories, never throws');
        assert(describePublisherLeaderboardClaimHistorySynchronization(null, 'not an array').sameHistory === true, '4. malformed/absent histories degrade to empty, never throw');
        assert(Object.isFrozen(viaSync), '5. the result is frozen, exactly like 0.8.127\'s own difference result');
    }
    console.log('✓ Section A: describePublisherLeaderboardClaimHistorySynchronization is a byte-identical passthrough to the 0.8.127 difference projection');

    // ---------------------------------------------------------------
    // Section B — reconstructPublisherLeaderboardClaimHistorySynchronization
    // reads both sides through the 0.8.130 archive seam.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T21:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });

        const sourceHistory = [record];
        const targetHistory = [];

        const described = describePublisherLeaderboardClaimHistorySynchronization(sourceHistory, targetHistory);
        const reconstructed = reconstructPublisherLeaderboardClaimHistorySynchronization(archiveFromClaimHistory(sourceHistory), archiveFromClaimHistory(targetHistory));
        assert(reconstructed.sameHistory === described.sameHistory && reconstructed.sourceOnly[0] === described.sourceOnly[0], '6. reconstruct() reads each side\'s durable history and agrees exactly with describe(), preserving the original record instance');

        assert(reconstructPublisherLeaderboardClaimHistorySynchronization(null, undefined).sameHistory === true, '7. an invalid/missing archive on either side degrades to an empty history, never a throw');
        assert(reconstructPublisherLeaderboardClaimHistorySynchronization('not an archive', 42).sourceOnlyCount === 0, '8. a malformed archive argument degrades safely on both sides');
    }
    console.log('✓ Section B: reconstructPublisherLeaderboardClaimHistorySynchronization reads both replicas\' durable histories through the 0.8.130 seam, agreeing exactly with describe()');

    // ---------------------------------------------------------------
    // Section C — exportPublisherLeaderboardClaimHistorySynchronization
    // exports ONLY sourceOnly, in 0.8.126's own unchanged wire shape.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);

        const sharedReceivedAt = new Date('2026-08-29T22:00:00Z');
        const sourceOnlyRecord = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T22:01:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const sharedRecordSource = new LeaderboardClaimRecord({ claim: claimB, receivedAt: sharedReceivedAt, origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });
        const sharedRecordTarget = new LeaderboardClaimRecord({ claim: claimB, receivedAt: sharedReceivedAt, origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });

        const sourceHistory = appendLeaderboardClaimHistoryEntry(appendLeaderboardClaimHistoryEntry([], sourceOnlyRecord), sharedRecordSource);
        const targetHistory = appendLeaderboardClaimHistoryEntry([], sharedRecordTarget);

        const payload = exportPublisherLeaderboardClaimHistorySynchronization(sourceHistory, targetHistory);
        assert(payload.protocolVersion === PublisherLeaderboardClaimHistoryExchangeProtocolVersion, '9. the exported payload carries the SAME protocol version 0.8.126 already defines — no new envelope');
        assert(payload.claims.length === 1, '10. only the one exclusive receipt is exported — the shared receipt is never resent');
        assert(serialize(payload.claims[0]) === serialize(sourceOnlyRecord.toJSON()), '11. the exported entry is exactly the exclusive record\'s own toJSON()');
        assert(serialize(payload) === serialize(exportPublisherLeaderboardClaimHistory([sourceOnlyRecord])), '12. the payload is byte-identical to calling 0.8.126\'s own export directly over exactly the exclusive receipts');

        // Already-converged histories export a genuine, well-formed empty payload.
        const convergedPayload = exportPublisherLeaderboardClaimHistorySynchronization([sharedRecordSource], [sharedRecordTarget]);
        assert(convergedPayload.claims.length === 0, '13. two already-converged histories export zero receipts — never a special sentinel');
        assert(serialize(convergedPayload) === serialize(exportPublisherLeaderboardClaimHistory([])), '14. an empty synchronization export is byte-identical to exporting an empty history directly');

        assert(Object.isFrozen(payload) && Object.isFrozen(payload.claims), '15. the exported payload and its claims array are frozen');
    }
    console.log('✓ Section C: exportPublisherLeaderboardClaimHistorySynchronization exports only the source-exclusive receipts, in the unchanged 0.8.126 wire shape');

    // ---------------------------------------------------------------
    // Section D — applyPublisherLeaderboardClaimHistorySynchronization is
    // a direct, unmodified delegation to 0.8.126's own applier.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T23:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const payload = JSON.parse(JSON.stringify(exportPublisherLeaderboardClaimHistory([record])));

        const viaSync = applyPublisherLeaderboardClaimHistorySynchronization([], payload, verifier);
        const viaExchange = applyPublisherLeaderboardClaimHistoryExchange([], payload, verifier);
        assert(viaSync.outcome === PublisherLeaderboardClaimHistoryExchangeApplyOutcome.APPLIED, '16. sanity — the delegated apply genuinely succeeds');
        assert(serialize(viaSync.history.map((r) => r.toJSON())) === serialize(viaExchange.history.map((r) => r.toJSON())), '17. applying via the synchronization entry point produces the identical resulting history as applying via 0.8.126 directly');
        assert(viaSync.newCount === viaExchange.newCount && viaSync.duplicateCount === viaExchange.duplicateCount && viaSync.rejectedCount === viaExchange.rejectedCount, '18. every reported count agrees exactly');

        // A malformed envelope is rejected identically through either entry point.
        const malformedResult = applyPublisherLeaderboardClaimHistorySynchronization([], { protocolVersion: 999, claims: [] }, verifier);
        assert(malformedResult.outcome === PublisherLeaderboardClaimHistoryExchangeApplyOutcome.INVALID_HISTORY, '19. a malformed envelope is rejected exactly as 0.8.126 already rejects it');
        assert(malformedResult.history === null, '20. an INVALID_HISTORY outcome never fabricates a resulting history');
    }
    console.log('✓ Section D: applyPublisherLeaderboardClaimHistorySynchronization delegates directly to the unmodified 0.8.126 applier — identical outcome, byte for byte');

    // ---------------------------------------------------------------
    // Section E — FLAGSHIP: Alice [A, B, B1] / Bob [B, B2, C]; sync both
    // directions; both replicas converge; B1 and B2 remain distinct.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const eve = makeIdentity('Eve');
        const archive = buildArchiveE1();

        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);
        const claimC = signedClaimFor(eve, verifier, archive);

        const recordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-30T00:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordC = new LeaderboardClaimRecord({ claim: claimC, receivedAt: new Date('2026-08-30T00:01:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });

        // The receipt for claim B both Alice and Bob genuinely share —
        // identical claim, receivedAt, and origin on both sides.
        const sharedReceivedAt = new Date('2026-08-30T00:02:00Z');
        const recordB_aliceCopy = new LeaderboardClaimRecord({ claim: claimB, receivedAt: sharedReceivedAt, origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });
        const recordB_bobCopy = new LeaderboardClaimRecord({ claim: claimB, receivedAt: sharedReceivedAt, origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });

        // B1/B2 — genuinely distinct receipts of the SAME claim B.
        const recordB1 = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-30T00:03:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordB2 = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-30T00:04:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });

        const aliceHistoryOriginal = [recordA, recordB_aliceCopy, recordB1];
        const bobHistoryOriginal = [recordB_bobCopy, recordB2, recordC];

        assert(serialize(recordB1.toJSON()) !== serialize(recordB2.toJSON()), '21. FLAGSHIP — B1 and B2 are genuinely distinct receipts of the same claim B');

        // Sync Alice -> Bob: export what Alice has that Bob lacks, apply
        // it to Bob's own history.
        const aliceToBobPayload = exportPublisherLeaderboardClaimHistorySynchronization(aliceHistoryOriginal, bobHistoryOriginal);
        const aliceToBobResult = applyPublisherLeaderboardClaimHistorySynchronization(bobHistoryOriginal, aliceToBobPayload, verifier);
        assert(aliceToBobResult.outcome === PublisherLeaderboardClaimHistoryExchangeApplyOutcome.APPLIED, '22. FLAGSHIP — Bob applies Alice\'s exclusive receipts');
        assert(aliceToBobResult.newCount === 2, '23. FLAGSHIP — exactly Alice\'s two exclusive receipts (A, B1) are genuinely new to Bob');
        const bobHistorySynced = aliceToBobResult.history;

        // Sync Bob -> Alice: export what Bob ORIGINALLY had that Alice
        // lacks, apply it to Alice's own, original history — two
        // separate, explicit, directional calls, never one reciprocal one.
        const bobToAlicePayload = exportPublisherLeaderboardClaimHistorySynchronization(bobHistoryOriginal, aliceHistoryOriginal);
        const bobToAliceResult = applyPublisherLeaderboardClaimHistorySynchronization(aliceHistoryOriginal, bobToAlicePayload, verifier);
        assert(bobToAliceResult.outcome === PublisherLeaderboardClaimHistoryExchangeApplyOutcome.APPLIED, '24. FLAGSHIP — Alice applies Bob\'s exclusive receipts');
        assert(bobToAliceResult.newCount === 2, '25. FLAGSHIP — exactly Bob\'s two exclusive receipts (B2, C) are genuinely new to Alice');
        const aliceHistorySynced = bobToAliceResult.history;

        assert(aliceHistorySynced.length === 5 && bobHistorySynced.length === 5, '26. FLAGSHIP — both replicas now hold five receipts each');

        const finalDifference = describePublisherLeaderboardClaimHistorySynchronization(aliceHistorySynced, bobHistorySynced);
        assert(finalDifference.sameHistory === true, '27. FLAGSHIP — synchronizing in both directions converges the two replicas to sameHistory === true');
        assert(finalDifference.sourceOnlyCount === 0 && finalDifference.targetOnlyCount === 0, '28. FLAGSHIP — no exclusive receipts remain on either side, even though the two histories hold their five receipts in different orders');

        // B1 and B2 both genuinely survive, on BOTH sides — never
        // collapsed or deduplicated into one receipt for claim B.
        const bClaimReceiptsAlice = aliceHistorySynced.filter((r) => r.claim.id === claimB.id);
        const bClaimReceiptsBob = bobHistorySynced.filter((r) => r.claim.id === claimB.id);
        assert(bClaimReceiptsAlice.length === 3, '29. FLAGSHIP — Alice\'s converged history holds all three of claim B\'s distinct receipts (shared, B1, B2)');
        assert(bClaimReceiptsBob.length === 3, '30. FLAGSHIP — Bob\'s converged history holds all three of claim B\'s distinct receipts too');
        assert(bClaimReceiptsAlice.some((r) => serialize(r.toJSON()) === serialize(recordB1.toJSON())) && bClaimReceiptsAlice.some((r) => serialize(r.toJSON()) === serialize(recordB2.toJSON())), '31. FLAGSHIP — B1 and B2 are both genuinely present in Alice\'s own converged history, never merged');
        assert(bClaimReceiptsBob.some((r) => serialize(r.toJSON()) === serialize(recordB1.toJSON())) && bClaimReceiptsBob.some((r) => serialize(r.toJSON()) === serialize(recordB2.toJSON())), '32. FLAGSHIP — B1 and B2 are both genuinely present in Bob\'s own converged history too');

        // Repeating the identical pair of synchronization calls is a
        // genuine no-op — exchange-level idempotency, inherited unchanged
        // from 0.8.126.
        const reAliceToBobPayload = exportPublisherLeaderboardClaimHistorySynchronization(aliceHistorySynced, bobHistorySynced);
        assert(reAliceToBobPayload.claims.length === 0, '33. FLAGSHIP — re-synchronizing two converged histories exports nothing further');
        const reApply = applyPublisherLeaderboardClaimHistorySynchronization(bobHistorySynced, reAliceToBobPayload, verifier);
        assert(reApply.newCount === 0 && reApply.history === bobHistorySynced, '34. FLAGSHIP — applying an empty synchronization payload is a genuine no-op, returning the exact same history instance');
    }
    console.log('✓ Section E: FLAGSHIP — Alice [A, B, B1] / Bob [B, B2, C] converge to five receipts each via two explicit, directional synchronization calls, with B1 and B2 remaining genuinely distinct throughout');

    // ---------------------------------------------------------------
    // Section F — determinism, immutability, zero network access, no
    // archive ever written to.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);
        const recordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-30T01:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-30T01:01:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });

        const sourceHistory = [recordA];
        const targetHistory = [recordB];
        const sourceSnapshotBefore = sourceHistory.slice();
        const targetSnapshotBefore = targetHistory.slice();

        const payloadOnce = exportPublisherLeaderboardClaimHistorySynchronization(sourceHistory, targetHistory);
        const payloadTwice = exportPublisherLeaderboardClaimHistorySynchronization(sourceHistory, targetHistory);
        assert(serialize(payloadOnce) === serialize(payloadTwice), '35. exporting the identical synchronization twice is byte-identical');
        assert(serialize(sourceHistory) === serialize(sourceSnapshotBefore), '36. neither input history is ever mutated by export');
        assert(serialize(targetHistory) === serialize(targetSnapshotBefore), '37. neither input history is ever mutated by export');

        const wirePayload = JSON.parse(JSON.stringify(payloadOnce));
        const preCallCount = archive.publisherPublicationAssociationRecordCount;
        const { result: applyResult, networkCallOccurred } = await withoutNetworkAccess(() => applyPublisherLeaderboardClaimHistorySynchronization([], wirePayload, verifier));
        assert(networkCallOccurred === false, '38. applying a synchronization payload performs zero network access');
        assert(archive.publisherPublicationAssociationRecordCount === preCallCount, '39. no archive is ever touched — synchronization never even receives an archive reference at this layer');
        assert(applyResult.outcome === PublisherLeaderboardClaimHistoryExchangeApplyOutcome.APPLIED, '40. sanity — the apply itself succeeded');
        assert(Object.isFrozen(applyResult.history), '41. the resulting history is frozen');
    }
    console.log('✓ Section F: synchronization export/apply are deterministic, immutable, and perform zero network or archive access');

    // ---------------------------------------------------------------
    // Section G — no verification/trust vocabulary; every payload this
    // file produces is a genuine, unmodified 0.8.126 envelope.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-30T02:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });

        const described = describePublisherLeaderboardClaimHistorySynchronization([record], []);
        const keys = Object.keys(described).sort();
        assert(serialize(keys) === serialize(['sameHistory', 'sourceCount', 'sourceOnly', 'sourceOnlyCount', 'targetCount', 'targetOnly', 'targetOnlyCount'].sort()), '42. the description carries exactly the documented, factual fields');
        const forbidden = ['signatureValid', 'evidenceFingerprintMatches', 'policyVersionMatches', 'snapshotFingerprintMatches', 'matches', 'trusted', 'valid', 'score', 'reputation', 'rank'];
        for (const term of forbidden) {
            assert(!keys.includes(term), `43. the description never carries verification/trust vocabulary ('${term}')`);
        }

        const payload = exportPublisherLeaderboardClaimHistorySynchronization([record], []);
        const payloadKeys = Object.keys(payload).sort();
        assert(serialize(payloadKeys) === serialize(['claims', 'protocolVersion']), '44. the exported payload carries exactly the two fields 0.8.126 already defines — no synchronization-specific field of any kind');
        const entryKeys = Object.keys(payload.claims[0]).sort();
        assert(serialize(entryKeys) === serialize(['claim', 'origin', 'receivedAt']), '45. each entry carries exactly claim/receivedAt/origin — nothing evaluative, nothing synchronization-specific');
    }
    console.log('✓ Section G: this file carries no verification/trust vocabulary of its own, and every payload it produces is a genuine, unmodified 0.8.126 envelope');

    console.log('\nAll PublisherLeaderboardClaimHistorySynchronization tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimHistorySynchronization.test.js FAILED:', error);
    process.exitCode = 1;
});
