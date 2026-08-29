import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { CreatePublisherLeaderboardSnapshotClaimUseCase } from '../application/CreatePublisherLeaderboardSnapshotClaimUseCase.js';
import { verifyPublisherLeaderboardSnapshotClaim } from '../application/PublisherLeaderboardSnapshotClaimVerification.js';
import { exportPublisherLeaderboardSnapshotClaim } from '../application/PublisherLeaderboardSnapshotClaimExchange.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { appendLeaderboardClaimHistoryEntry } from '../application/LeaderboardClaimHistory.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import {
    PublisherLeaderboardClaimHistoryExchangeProtocolVersion,
    PublisherLeaderboardClaimHistoryImportOutcome,
    PublisherLeaderboardClaimHistoryExchangeApplyOutcome,
    exportPublisherLeaderboardClaimHistory,
    importPublisherLeaderboardClaimHistory,
    applyPublisherLeaderboardClaimHistoryExchange
} from '../application/PublisherLeaderboardClaimHistoryExchange.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.126 — Portable Claim History Exchange.
//
// Section A: exportPublisherLeaderboardClaimHistory — shape, ordering,
//            tolerance for malformed/absent input, exact-toJSON() entries
// Section B: importPublisherLeaderboardClaimHistory — envelope validation
//            (whole-payload INVALID_HISTORY), per-entry rejection (never
//            fatal to the rest), verifier requirement, empty history
// Section C: export -> import round-trips every claim, receivedAt, and
//            origin exactly
// Section D: FLAGSHIP — three replicas; Alice exports {A, B}, Bob exports
//            {B, C}, Carol applies both and ends with [A, B, B, C] because
//            the two B receipts genuinely differ (origin/receivedAt);
//            repeating the identical exchanges is idempotent
// Section E: negative test — a claim valid against E1 is transported to a
//            replica holding E2; the transported claim is carried through
//            byte for byte, never altered to reflect the receiver's own
//            (failing) verification
// Section F: malformed/forged entries are skipped, never fatal to the rest
//            of an otherwise genuine history
// Section G: determinism, immutability, zero network access, no archive
//            touching

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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
// fixture the rest of the 0.8.121-0.8.125 family already uses.
function buildArchiveE1() {
    const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
    let archive = PublicationObservationArchive.empty();
    archive = anchor(archive, 'a', 'a'.repeat(64), new Date('2026-08-29T00:00:00Z'));
    archive = associationUseCase.execute(archive, { publisherId: 'Carol', publicationIdentity: identityOf(archive, 'a'), createdAt: new Date('2026-08-29T00:01:00Z') });
    return archive;
}

// A genuinely different evidence fixture — E2.
function buildArchiveE2() {
    const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
    let archive = PublicationObservationArchive.empty();
    archive = anchor(archive, 'z', 'z'.repeat(64), new Date('2026-08-29T00:00:00Z'));
    archive = associationUseCase.execute(archive, { publisherId: 'Zara', publicationIdentity: identityOf(archive, 'z'), createdAt: new Date('2026-08-29T00:01:00Z') });
    return archive;
}

function signedClaimFor(identityProvider, verifier, archive) {
    return new CreatePublisherLeaderboardSnapshotClaimUseCase(identityProvider, verifier).execute(archive);
}

function wireClaim(claim) {
    return JSON.parse(JSON.stringify(exportPublisherLeaderboardSnapshotClaim(claim)));
}

async function run() {
    const verifier = new LocalAuthorizationVerifier();

    // ---------------------------------------------------------------
    // Section A — exportPublisherLeaderboardClaimHistory.
    // ---------------------------------------------------------------
    {
        const emptyExport = exportPublisherLeaderboardClaimHistory([]);
        assert(emptyExport.protocolVersion === PublisherLeaderboardClaimHistoryExchangeProtocolVersion, '1. an empty history still carries the protocol version');
        assert(Array.isArray(emptyExport.claims) && emptyExport.claims.length === 0, '2. an empty history exports to an empty claims array');
        assert(Object.isFrozen(emptyExport), '3. the export payload is frozen');

        assert(serialize(exportPublisherLeaderboardClaimHistory(null)) === serialize(emptyExport), '4. a null history degrades to empty, never a throw');
        assert(serialize(exportPublisherLeaderboardClaimHistory('not an array')) === serialize(emptyExport), '5. a malformed history degrades to empty, never a throw');
        assert(serialize(exportPublisherLeaderboardClaimHistory([null, 42, {}])) === serialize(emptyExport), '6. non-LeaderboardClaimRecord entries are silently excluded');

        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);

        const recordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T01:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T01:05:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });
        const history = appendLeaderboardClaimHistoryEntry(appendLeaderboardClaimHistoryEntry([], recordA), recordB);

        const exported = exportPublisherLeaderboardClaimHistory(history);
        assert(exported.claims.length === 2, '7. every genuine record is exported');
        assert(serialize(exported.claims[0]) === serialize(recordA.toJSON()), '8. each exported entry is EXACTLY the record\'s own toJSON() — never a new shape');
        assert(serialize(exported.claims[1]) === serialize(recordB.toJSON()), '9. entry order matches history order, oldest first');
        assert(Object.keys(exported.claims[0]).sort().join(',') === 'claim,origin,receivedAt', '10. each entry carries exactly claim/receivedAt/origin — nothing evaluative');
    }
    console.log('✓ Section A: exportPublisherLeaderboardClaimHistory carries every record\'s own toJSON() unchanged, in order, tolerating malformed/absent input');

    // ---------------------------------------------------------------
    // Section B — importPublisherLeaderboardClaimHistory.
    // ---------------------------------------------------------------
    {
        let threw = false;
        try { importPublisherLeaderboardClaimHistory({ protocolVersion: 1, claims: [] }, null); } catch { threw = true; }
        assert(threw, '11. requires a verifier');

        threw = false;
        try { importPublisherLeaderboardClaimHistory({ protocolVersion: 1, claims: [] }, {}); } catch { threw = true; }
        assert(threw, '12. requires a verifier capable of verifyPublisherLeaderboardSnapshotClaim');

        for (const malformed of [null, undefined, 42, 'not json at all {{{', [], { protocolVersion: 2, claims: [] }, { protocolVersion: 1, claims: 'not an array' }, { protocolVersion: 1, claims: [], extra: true }, { claims: [] }]) {
            const result = importPublisherLeaderboardClaimHistory(malformed, verifier);
            assert(result.outcome === PublisherLeaderboardClaimHistoryImportOutcome.INVALID_HISTORY, `13. malformed envelope (${JSON.stringify(malformed)}) never throws — yields INVALID_HISTORY`);
            assert(result.records === null, '14. INVALID_HISTORY never produces records');
        }

        const emptyResult = importPublisherLeaderboardClaimHistory({ protocolVersion: 1, claims: [] }, verifier);
        assert(emptyResult.outcome === PublisherLeaderboardClaimHistoryImportOutcome.IMPORTED, '15. an empty claims array is a genuine, well-formed IMPORTED result');
        assert(emptyResult.records.length === 0 && emptyResult.importedCount === 0 && emptyResult.rejectedCount === 0, '16. importing nothing imports nothing, cleanly');

        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const genuineEntry = { claim: wireClaim(claim), receivedAt: '2026-08-29T02:00:00.000Z', origin: PublicationObservationArchiveProvenanceOrigin.LOCAL };

        const stringPayload = JSON.stringify({ protocolVersion: 1, claims: [genuineEntry] });
        const stringResult = importPublisherLeaderboardClaimHistory(stringPayload, verifier);
        assert(stringResult.outcome === PublisherLeaderboardClaimHistoryImportOutcome.IMPORTED, '17. a raw JSON string payload is accepted, just like a single claim import');
        assert(stringResult.records.length === 1, '18. the one genuine entry imports successfully');
    }
    console.log('✓ Section B: importPublisherLeaderboardClaimHistory requires a verifier, validates the whole envelope atomically, and cleanly imports an empty history');

    // ---------------------------------------------------------------
    // Section C — export -> import round-trips exactly.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);

        const receivedAtA = new Date('2026-08-29T03:00:00Z');
        const receivedAtB = new Date('2026-08-29T03:05:00Z');
        const recordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt: receivedAtA, origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const recordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: receivedAtB, origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });
        const originalHistory = appendLeaderboardClaimHistoryEntry(appendLeaderboardClaimHistoryEntry([], recordA), recordB);

        const wirePayload = JSON.parse(JSON.stringify(exportPublisherLeaderboardClaimHistory(originalHistory)));
        const importResult = importPublisherLeaderboardClaimHistory(wirePayload, verifier);
        assert(importResult.outcome === PublisherLeaderboardClaimHistoryImportOutcome.IMPORTED, '19. a genuine exported history imports cleanly');
        assert(importResult.records.length === 2, '20. every record round-trips');
        assert(importResult.records[0].claim.signerIdentityId === claimA.signerIdentityId, '21. the first record genuinely names Alice as signer');
        assert(importResult.records[0].receivedAt.getTime() === receivedAtA.getTime(), '22. receivedAt round-trips exactly, never regenerated to "now"');
        assert(importResult.records[0].origin === PublicationObservationArchiveProvenanceOrigin.LOCAL, '23. origin round-trips exactly, as transported — never force-stamped imported');
        assert(importResult.records[1].claim.signerIdentityId === claimB.signerIdentityId, '24. the second record genuinely names Bob as signer');
        assert(serialize(importResult.records[1].claim.toJSON()) === serialize(claimB.toJSON()), '25. the transported claim is byte-identical to the original signed claim');
    }
    console.log('✓ Section C: export -> import round-trips every claim, receivedAt, and origin exactly — never regenerated, never re-stamped');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: three replicas, genuinely distinct receipts, idempotent re-exchange.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const eve = makeIdentity('Eve');
        const archive = buildArchiveE1();

        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);
        const claimC = signedClaimFor(eve, verifier, archive);

        // Alice signed A herself (LOCAL), and separately received Bob's
        // own claim B at her own moment in time (IMPORTED).
        const aliceRecordA = new LeaderboardClaimRecord({ claim: claimA, receivedAt: new Date('2026-08-29T04:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const aliceRecordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T04:01:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });
        const aliceHistory = appendLeaderboardClaimHistoryEntry(appendLeaderboardClaimHistoryEntry([], aliceRecordA), aliceRecordB);

        // Bob signed B himself (LOCAL, at HIS OWN, genuinely different
        // moment), and separately received Eve's own claim C (IMPORTED).
        const bobRecordB = new LeaderboardClaimRecord({ claim: claimB, receivedAt: new Date('2026-08-29T05:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const bobRecordC = new LeaderboardClaimRecord({ claim: claimC, receivedAt: new Date('2026-08-29T05:01:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED });
        const bobHistory = appendLeaderboardClaimHistoryEntry(appendLeaderboardClaimHistoryEntry([], bobRecordB), bobRecordC);

        assert(serialize(aliceRecordB.toJSON()) !== serialize(bobRecordB.toJSON()), '26. FLAGSHIP — Alice\'s and Bob\'s own receipts for claim B are genuinely distinct records (different receivedAt/origin)');

        const alicePayload = JSON.parse(JSON.stringify(exportPublisherLeaderboardClaimHistory(aliceHistory)));
        const bobPayload = JSON.parse(JSON.stringify(exportPublisherLeaderboardClaimHistory(bobHistory)));

        let carolHistory = [];
        const applyAlice1 = applyPublisherLeaderboardClaimHistoryExchange(carolHistory, alicePayload, verifier);
        assert(applyAlice1.outcome === PublisherLeaderboardClaimHistoryExchangeApplyOutcome.APPLIED, '27. FLAGSHIP — Carol applies Alice\'s exported history');
        assert(applyAlice1.newCount === 2 && applyAlice1.duplicateCount === 0, '28. FLAGSHIP — both of Alice\'s receipts are genuinely new to Carol');
        carolHistory = applyAlice1.history;

        const applyBob1 = applyPublisherLeaderboardClaimHistoryExchange(carolHistory, bobPayload, verifier);
        assert(applyBob1.outcome === PublisherLeaderboardClaimHistoryExchangeApplyOutcome.APPLIED, '29. FLAGSHIP — Carol applies Bob\'s exported history');
        assert(applyBob1.newCount === 2 && applyBob1.duplicateCount === 0, '30. FLAGSHIP — both of Bob\'s receipts are genuinely new to Carol too — including his OWN distinct receipt for claim B');
        carolHistory = applyBob1.history;

        assert(carolHistory.length === 4, '31. FLAGSHIP — Carol now holds four receipts: A, B (Alice\'s), B (Bob\'s), C');
        assert(carolHistory[0].claim.id === claimA.id, '32. FLAGSHIP — entry order: A first');
        assert(carolHistory[1].claim.id === claimB.id && carolHistory[1].origin === PublicationObservationArchiveProvenanceOrigin.IMPORTED, '33. FLAGSHIP — then Alice\'s own receipt for B');
        assert(carolHistory[2].claim.id === claimB.id && carolHistory[2].origin === PublicationObservationArchiveProvenanceOrigin.LOCAL, '34. FLAGSHIP — then Bob\'s own, genuinely distinct receipt for the SAME claim B');
        assert(carolHistory[3].claim.id === claimC.id, '35. FLAGSHIP — then C');

        // Repeating the EXACT SAME two exchanges must not duplicate
        // anything — exchange-level idempotency.
        const applyAlice2 = applyPublisherLeaderboardClaimHistoryExchange(carolHistory, alicePayload, verifier);
        assert(applyAlice2.outcome === PublisherLeaderboardClaimHistoryExchangeApplyOutcome.APPLIED, '36. FLAGSHIP — re-applying Alice\'s identical export still succeeds');
        assert(applyAlice2.newCount === 0 && applyAlice2.duplicateCount === 2, '37. FLAGSHIP — every one of Alice\'s receipts is now recognized as already on file');
        assert(applyAlice2.history === carolHistory, '38. FLAGSHIP — a no-op apply returns the EXACT SAME history instance, never merely an equal one');

        const applyBob2 = applyPublisherLeaderboardClaimHistoryExchange(carolHistory, bobPayload, verifier);
        assert(applyBob2.newCount === 0 && applyBob2.duplicateCount === 2, '39. FLAGSHIP — re-applying Bob\'s identical export is likewise a genuine no-op');
        assert(applyBob2.history === carolHistory, '40. FLAGSHIP — no-op apply, second exchange too, returns the identical instance');
        assert(carolHistory.length === 4, '41. FLAGSHIP — Carol\'s history did not grow — repeated exchange is idempotent');
    }
    console.log('✓ Section D: FLAGSHIP — Carol converges [A, B, B, C] from two replicas\' independent, genuinely distinct receipts for the shared claim B, and repeated exchange never duplicates them');

    // ---------------------------------------------------------------
    // Section E — a transported claim is never altered to reflect the receiver's own verification.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archiveE1 = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archiveE1);

        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T06:00:00Z'), origin: PublicationObservationArchiveProvenanceOrigin.LOCAL });
        const payload = JSON.parse(JSON.stringify(exportPublisherLeaderboardClaimHistory([record])));

        // Carol holds genuinely different evidence, E2.
        let carolHistory = [];
        const applyResult = applyPublisherLeaderboardClaimHistoryExchange(carolHistory, payload, verifier);
        assert(applyResult.outcome === PublisherLeaderboardClaimHistoryExchangeApplyOutcome.APPLIED, '42. Carol successfully applies a claim that was valid against evidence she does not hold');
        carolHistory = applyResult.history;

        assert(serialize(carolHistory[0].claim.toJSON()) === serialize(claim.toJSON()), '43. the stored claim is EXACTLY the original signed claim — byte for byte');

        const archiveE2 = buildArchiveE2();
        const verification = verifyPublisherLeaderboardSnapshotClaim(archiveE2, carolHistory[0].claim.toJSON(), verifier);
        assert(verification.signatureValid === true, '44. the signature itself remains genuinely valid — transport never touches it');
        assert(verification.evidenceFingerprintMatches === false, '45. yet the claim fails to match Carol\'s own, genuinely different evidence');
        assert(verification.matches === false, '46. transported claim ≠ current verification result — the claim itself was never altered to agree with Carol\'s own reality');

        // The record on file is still exactly what was transported —
        // running verification changed nothing about it.
        assert(serialize(carolHistory[0].claim.toJSON()) === serialize(claim.toJSON()), '47. re-checking after verification — the stored claim is still untouched');
    }
    console.log('✓ Section E: a transported claim carries through exactly as signed — a receiver\'s own, differing verification result never mutates or replaces it');

    // ---------------------------------------------------------------
    // Section F — malformed/forged entries are skipped, never fatal to the rest.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const archive = buildArchiveE1();
        const claimA = signedClaimFor(alice, verifier, archive);
        const claimB = signedClaimFor(bob, verifier, archive);

        const genuineEntryA = { claim: wireClaim(claimA), receivedAt: '2026-08-29T07:00:00.000Z', origin: PublicationObservationArchiveProvenanceOrigin.LOCAL };
        const genuineEntryB = { claim: wireClaim(claimB), receivedAt: '2026-08-29T07:01:00.000Z', origin: PublicationObservationArchiveProvenanceOrigin.LOCAL };
        const tamperedEntry = { claim: { ...wireClaim(claimA), snapshotFingerprint: 'f'.repeat(64) }, receivedAt: '2026-08-29T07:02:00.000Z', origin: PublicationObservationArchiveProvenanceOrigin.IMPORTED };
        const malformedShapeEntry = { claim: wireClaim(claimA), receivedAt: '2026-08-29T07:03:00.000Z' }; // missing origin
        const badReceivedAtEntry = { claim: wireClaim(claimA), receivedAt: 'not a date', origin: PublicationObservationArchiveProvenanceOrigin.LOCAL };

        const payload = {
            protocolVersion: 1,
            claims: [genuineEntryA, tamperedEntry, genuineEntryB, malformedShapeEntry, badReceivedAtEntry]
        };

        const importResult = importPublisherLeaderboardClaimHistory(payload, verifier);
        assert(importResult.outcome === PublisherLeaderboardClaimHistoryImportOutcome.IMPORTED, '48. a mostly-genuine history still imports, atomically rejecting only its own malformed entries, never the whole payload');
        assert(importResult.importedCount === 2, '49. only the two genuine entries are imported');
        assert(importResult.rejectedCount === 3, '50. the tampered, shape-malformed, and bad-receivedAt entries are all rejected');
        assert(importResult.rejections.length === 3, '51. every rejection is reported');
        assert(importResult.rejections[0].index === 1, '52. rejections report the ORIGINAL index into payload.claims');
        assert(importResult.rejections.some((r) => r.index === 3), '53. the malformed-shape entry is reported too');
        assert(importResult.rejections.some((r) => r.index === 4), '54. the bad-receivedAt entry is reported too');
        assert(importResult.records[0].claim.signerIdentityId === claimA.signerIdentityId && importResult.records[1].claim.signerIdentityId === claimB.signerIdentityId, '55. the surviving records are exactly the two genuine ones, in order');

        const applyResult = applyPublisherLeaderboardClaimHistoryExchange([], payload, verifier);
        assert(applyResult.outcome === PublisherLeaderboardClaimHistoryExchangeApplyOutcome.APPLIED, '56. apply likewise succeeds over a mostly-genuine payload');
        assert(applyResult.newCount === 2 && applyResult.rejectedCount === 3, '57. apply carries the same import/rejection counts through unchanged');
        assert(applyResult.history.length === 2, '58. only the two genuine receipts land in the resulting history');
    }
    console.log('✓ Section F: malformed, forged, and shape-invalid entries are rejected individually, by index and reason, never discarding the rest of an otherwise genuine history');

    // ---------------------------------------------------------------
    // Section G — determinism, immutability, zero network access.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice');
        const archive = buildArchiveE1();
        const claim = signedClaimFor(alice, verifier, archive);
        const record = new LeaderboardClaimRecord({ claim, receivedAt: new Date('2026-08-29T08:00:00Z') });
        const history = appendLeaderboardClaimHistoryEntry([], record);

        const exportedOnce = exportPublisherLeaderboardClaimHistory(history);
        const exportedTwice = exportPublisherLeaderboardClaimHistory(history);
        assert(serialize(exportedOnce) === serialize(exportedTwice), '59. exporting the identical history twice is byte-identical');
        assert(history.length === 1, '60. exporting never mutates the source history');

        const wirePayload = JSON.parse(JSON.stringify(exportedOnce));
        const preCallCount = archive.publisherPublicationAssociationRecordCount;
        const { result: applyResult, networkCallOccurred } = await withoutNetworkAccess(() => applyPublisherLeaderboardClaimHistoryExchange([], wirePayload, verifier));
        assert(networkCallOccurred === false, '61. applying an exchange performs zero network access');
        assert(archive.publisherPublicationAssociationRecordCount === preCallCount, '62. no archive is ever touched — the exchange never even receives an archive reference');
        assert(applyResult.outcome === PublisherLeaderboardClaimHistoryExchangeApplyOutcome.APPLIED, '63. sanity — the apply itself succeeded');

        assert(Object.isFrozen(applyResult.history), '64. the resulting history is frozen');
        assert(Object.isFrozen(applyResult.rejections), '65. the rejections array is frozen');

        const importOnce = importPublisherLeaderboardClaimHistory(wirePayload, verifier);
        const importTwice = importPublisherLeaderboardClaimHistory(wirePayload, verifier);
        assert(serialize(importOnce.records.map((r) => r.toJSON())) === serialize(importTwice.records.map((r) => r.toJSON())), '66. importing the identical payload twice is byte-identical');
    }
    console.log('✓ Section G: export/import/apply are deterministic, immutable, touch no archive, and perform zero network access');

    console.log('\nAll PublisherLeaderboardClaimHistoryExchange tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimHistoryExchange.test.js FAILED:', error);
    process.exitCode = 1;
});
