import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { reconstructAchievementEvidenceFingerprint } from '../application/AchievementEvidenceFingerprint.js';
import {
    exportAchievementEvidence,
    importAchievementEvidence,
    AchievementEvidenceImportOutcome
} from '../application/AchievementEvidenceExport.js';
import { mergeAchievementEvidence } from '../application/AchievementEvidenceMerge.js';
import { reconstructAchievementEvents } from '../application/AchievementEvent.js';
import { reconstructPublisherAchievementStatistics } from '../application/PublisherAchievementStatisticsView.js';
import { reconstructPublisherRanking } from '../application/PublisherRankingPolicy.js';
import { reconstructPublisherLeaderboard } from '../application/PublisherLeaderboardView.js';
import {
    AchievementEvidenceExchangeProtocolVersion,
    AchievementEvidenceExchangeResponseOutcome,
    AchievementEvidenceExchangeApplyOutcome,
    describeAchievementEvidenceExchangeRequest,
    reconstructAchievementEvidenceExchangeRequest,
    describeAchievementEvidenceExchangeResponse,
    reconstructAchievementEvidenceExchangeResponse,
    applyAchievementEvidenceExchange
} from '../application/AchievementEvidenceExchange.js';

// 0.8.118 — Portable Evidence Synchronization Exchange.
//
//   Section A: request shape — reconstructAchievementEvidenceExchangeRequest()
//              is exactly a protocol envelope around 0.8.116's own
//              fingerprint; describe()/reconstruct() agree
//   Section B: "nothing to exchange" — equal fingerprints produce
//              sameEvidence:true and an explicit, empty (never absent)
//              evidence payload
//   Section C: differing fingerprints produce sameEvidence:false and the
//              responder's ENTIRE evidence, byte-identical to
//              exportAchievementEvidence()'s own output — never a computed
//              sourceOnly/targetOnly difference
//   Section D: malformed requests are INVALID_REQUEST, never a guess
//   Section E: applyAchievementEvidenceExchange() reuses mergeAchievementEvidence()
//              verbatim; malformed/foreign responses are INVALID_RESPONSE
//              and never touch the caller's own archive
//   Section F: applying a "nothing to exchange" response is a genuine
//              no-op — the exact same archive instance comes back
//   Section G: neither side's archive is ever mutated by any of these
//              three functions
//   Section H: deterministic repeated output
//   Section I: zero network access anywhere in the exchange
//   Section J: no achievement/badge/statistic/rank/leaderboard vocabulary
//              anywhere in a request or a response
//   Section K: no sourceOnly/targetOnly vocabulary anywhere in a response
//              — the deliberate departure from 0.8.117's own vocabulary
//   Section L: shape, defaults, and exported vocabulary
//   Section M: FLAGSHIP — Alice (A, B, C) and Bob (B, C, D) hold disjoint
//              evidence; a request/response/apply exchange in EACH
//              direction converges both replicas to the identical evidence
//              fingerprint, and each replica's own INDEPENDENTLY
//              reconstructed achievement events, statistics, ranking, and
//              leaderboard are byte-identical to the other's — without
//              either of those conclusions ever once appearing in an
//              exchanged message

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

// Builds a Bitcoin publication for anchorId/txid 'a'|'b'|'c'|'d' — deterministic
// across independently-built archives, since identity is derived from
// these fields alone (application/BitcoinAnchorPublicationRecord.js's own
// `toBlockchainPublicationIdentity()`), never from array position.
function anchor(archive, letter, txid) {
    const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
    return useCase.execute(archive, { anchorId: `pub-${letter}`, contentHash: `pub-${letter}-content`, txid, network: NETWORK, createdAt: CREATED_AT[letter] });
}

function identityOf(archive, letter) {
    return archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === `pub-${letter}`).toBlockchainPublicationIdentity();
}

// Alice's own replica: publications A, B, C. Carol is associated with all
// three of Alice's own publications; Dave with B and C only. One reference
// record (C references B).
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
// Alice's own (same anchorId/contentHash/txid/createdAt), D genuinely new.
// Carol is associated with all three of Bob's own publications (including
// D, which Alice has never seen); Dave with B and C only, identical to
// Alice's own.
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

async function run() {
    // ---------------------------------------------------------------
    // Section A — request shape.
    // ---------------------------------------------------------------
    {
        const archive = buildAliceArchive();
        const fingerprint = reconstructAchievementEvidenceFingerprint(archive).fingerprint;

        const reconstructed = reconstructAchievementEvidenceExchangeRequest(archive);
        assert(reconstructed.protocolVersion === AchievementEvidenceExchangeProtocolVersion, '1. the request names the current protocol version');
        assert(reconstructed.evidenceFingerprint === fingerprint, '2. the request\'s own evidenceFingerprint is exactly 0.8.116\'s own fingerprint, unchanged');
        assert(Object.keys(reconstructed).sort().join(',') === 'evidenceFingerprint,protocolVersion', '3. a request carries exactly these two fields — nothing else');

        const described = describeAchievementEvidenceExchangeRequest(
            archive.bitcoinAnchorPublicationRecords, archive.baseAnchorPublicationRecords,
            archive.publicationReferenceRecords, archive.publisherPublicationAssociationRecords
        );
        assert(JSON.stringify(described) === JSON.stringify(reconstructed), '4. describe() over an archive\'s own raw collections agrees with reconstruct() over the archive itself');

        const bareRequest = reconstructAchievementEvidenceExchangeRequest(PublicationObservationArchive.empty());
        assert(bareRequest.evidenceFingerprint === reconstructAchievementEvidenceFingerprint(PublicationObservationArchive.empty()).fingerprint, '5. an empty archive still produces a genuine, well-defined request');

        const nonArchiveRequest = reconstructAchievementEvidenceExchangeRequest('not an archive');
        assert(nonArchiveRequest.evidenceFingerprint === bareRequest.evidenceFingerprint, '6. non-archive input degrades to the empty archive\'s own request, never throws');
    }
    console.log('✓ Section A: a request is exactly a protocol envelope around 0.8.116\'s own fingerprint');

    // ---------------------------------------------------------------
    // Section B — "nothing to exchange."
    // ---------------------------------------------------------------
    {
        const archive = buildAliceArchive();
        const request = reconstructAchievementEvidenceExchangeRequest(archive);

        const response = reconstructAchievementEvidenceExchangeResponse(request, archive);
        assert(response.outcome === AchievementEvidenceExchangeResponseOutcome.EVIDENCE_DESCRIBED, '7. an equal-fingerprint response still describes evidence — it is never an error');
        assert(response.sameEvidence === true, '8. two sides sharing one fingerprint report sameEvidence');
        assert(response.requesterFingerprint === response.responderFingerprint, '9. both sides\' own fingerprints are echoed, and agree');
        assert(response.evidence.schemaVersion === 1, '10. the empty evidence payload still carries a genuine schemaVersion');
        for (const key of ['bitcoinAnchorPublicationRecords', 'baseAnchorPublicationRecords', 'publicationReferenceRecords', 'publisherPublicationAssociationRecords']) {
            assert(Array.isArray(response.evidence[key]) && response.evidence[key].length === 0, `11. ${key} is explicitly empty, never absent, when there is nothing to exchange`);
        }

        const importResult = importAchievementEvidence(response.evidence);
        assert(importResult.outcome === AchievementEvidenceImportOutcome.IMPORTED, '12. the empty evidence payload is still a genuine, importable evidence payload');

        // Two genuinely empty, freshly-built archives also agree — sameEvidence
        // is never an artifact of comparing an archive against itself.
        const emptyRequest = reconstructAchievementEvidenceExchangeRequest(PublicationObservationArchive.empty());
        const emptyResponse = reconstructAchievementEvidenceExchangeResponse(emptyRequest, new PublicationObservationArchive());
        assert(emptyResponse.sameEvidence === true, '13. two independently-built empty archives also report sameEvidence');
    }
    console.log('✓ Section B: equal fingerprints produce an explicit, empty "nothing to exchange" evidence payload');

    // ---------------------------------------------------------------
    // Section C — differing fingerprints supply the responder's ENTIRE
    // evidence, never a computed sourceOnly/targetOnly difference.
    // ---------------------------------------------------------------
    {
        const aliceArchive = buildAliceArchive();
        const bobArchive = buildBobArchive();

        const aliceRequest = reconstructAchievementEvidenceExchangeRequest(aliceArchive);
        const response = reconstructAchievementEvidenceExchangeResponse(aliceRequest, bobArchive);

        assert(response.sameEvidence === false, '14. genuinely disjoint evidence never reports sameEvidence');
        assert(response.requesterFingerprint === aliceRequest.evidenceFingerprint, '15. requesterFingerprint is exactly what Alice stated');
        assert(response.responderFingerprint === reconstructAchievementEvidenceFingerprint(bobArchive).fingerprint, '16. responderFingerprint is exactly Bob\'s own current fingerprint');

        const bobFullExport = exportAchievementEvidence(bobArchive);
        assert(JSON.stringify(response.evidence) === JSON.stringify(bobFullExport), '17. the supplied evidence is byte-identical to exportAchievementEvidence(bobArchive) — Bob\'s ENTIRE evidence, not a computed diff');
        assert(response.evidence.bitcoinAnchorPublicationRecords.length === 3, '18. concretely: all three of Bob\'s own publications (B, C, D) are present, not just the one Alice lacks');

        const describedFromRawArrays = describeAchievementEvidenceExchangeResponse(
            aliceRequest,
            bobArchive.bitcoinAnchorPublicationRecords, bobArchive.baseAnchorPublicationRecords,
            bobArchive.publicationReferenceRecords, bobArchive.publisherPublicationAssociationRecords
        );
        assert(JSON.stringify(describedFromRawArrays) === JSON.stringify(response), '19. describe() over Bob\'s own raw collections agrees with reconstruct() over Bob\'s own archive');
    }
    console.log('✓ Section C: differing fingerprints supply the responder\'s entire evidence, byte-identical to exportAchievementEvidence()\'s own output');

    // ---------------------------------------------------------------
    // Section D — malformed requests are INVALID_REQUEST.
    // ---------------------------------------------------------------
    {
        const archive = buildAliceArchive();
        const genuineFingerprint = reconstructAchievementEvidenceExchangeRequest(archive).evidenceFingerprint;

        const malformedRequests = [
            null,
            undefined,
            'not a request',
            42,
            [],
            {},
            { protocolVersion: AchievementEvidenceExchangeProtocolVersion },
            { evidenceFingerprint: genuineFingerprint },
            { protocolVersion: AchievementEvidenceExchangeProtocolVersion, evidenceFingerprint: genuineFingerprint, extra: true },
            { protocolVersion: 999, evidenceFingerprint: genuineFingerprint },
            { protocolVersion: '1', evidenceFingerprint: genuineFingerprint },
            { protocolVersion: AchievementEvidenceExchangeProtocolVersion, evidenceFingerprint: genuineFingerprint.toUpperCase() },
            { protocolVersion: AchievementEvidenceExchangeProtocolVersion, evidenceFingerprint: genuineFingerprint.slice(0, 63) },
            { protocolVersion: AchievementEvidenceExchangeProtocolVersion, evidenceFingerprint: 12345 }
        ];
        for (const malformed of malformedRequests) {
            const response = reconstructAchievementEvidenceExchangeResponse(malformed, archive);
            assert(response.outcome === AchievementEvidenceExchangeResponseOutcome.INVALID_REQUEST, `20. ${JSON.stringify(malformed)} is rejected as INVALID_REQUEST`);
            assert(Object.keys(response).length === 1, '21. an INVALID_REQUEST response carries no other field — no guessed evidence, no partial fingerprint');
        }
    }
    console.log('✓ Section D: a malformed request is INVALID_REQUEST, never a best-effort guess');

    // ---------------------------------------------------------------
    // Section E — applyAchievementEvidenceExchange() reuses
    // mergeAchievementEvidence() verbatim; malformed/foreign responses are
    // INVALID_RESPONSE.
    // ---------------------------------------------------------------
    {
        const aliceArchive = buildAliceArchive();
        const bobArchive = buildBobArchive();
        const request = reconstructAchievementEvidenceExchangeRequest(aliceArchive);
        const response = reconstructAchievementEvidenceExchangeResponse(request, bobArchive);

        const applied = applyAchievementEvidenceExchange(aliceArchive, response);
        assert(applied.outcome === AchievementEvidenceExchangeApplyOutcome.APPLIED, '22. a genuine, differing response applies successfully');

        const directMerge = mergeAchievementEvidence(aliceArchive, response.evidence);
        assert(JSON.stringify(exportAchievementEvidence(applied.archive)) === JSON.stringify(exportAchievementEvidence(directMerge.archive)), '23. applying an exchange produces exactly what mergeAchievementEvidence(archive, response.evidence) itself would — no second merge logic');

        const malformedResponses = [
            null, undefined, 'not a response', 42, [],
            {},
            { outcome: AchievementEvidenceExchangeResponseOutcome.INVALID_REQUEST },
            { outcome: 'not-a-real-outcome', evidence: response.evidence },
            { evidence: response.evidence }
        ];
        for (const malformed of malformedResponses) {
            const result = applyAchievementEvidenceExchange(aliceArchive, malformed);
            assert(result.outcome === AchievementEvidenceExchangeApplyOutcome.INVALID_RESPONSE, `24. ${JSON.stringify(malformed)} is rejected as INVALID_RESPONSE`);
            assert(result.archive === null, '25. an INVALID_RESPONSE result carries no archive');
        }

        let threw = false;
        try { applyAchievementEvidenceExchange('not an archive', response); } catch (error) { threw = true; }
        assert(threw, '26. a non-archive first argument throws, mirroring mergeAchievementEvidence()\'s own contract');
    }
    console.log('✓ Section E: applying an exchange reuses mergeAchievementEvidence() unchanged; malformed or foreign responses are INVALID_RESPONSE and never touch the caller\'s archive');

    // ---------------------------------------------------------------
    // Section F — applying "nothing to exchange" is a genuine no-op.
    // ---------------------------------------------------------------
    {
        const archive = buildAliceArchive();
        const request = reconstructAchievementEvidenceExchangeRequest(archive);
        const response = reconstructAchievementEvidenceExchangeResponse(request, archive);
        assert(response.sameEvidence === true, '27. sanity — comparing an archive against itself has nothing to exchange');

        const applied = applyAchievementEvidenceExchange(archive, response);
        assert(applied.archive === archive, '28. applying an empty "nothing to exchange" evidence payload returns the EXACT SAME archive instance, not merely an equal one');
    }
    console.log('✓ Section F: applying a "nothing to exchange" response is a genuine, documented no-op');

    // ---------------------------------------------------------------
    // Section G — no mutation of any archive, by any of the three
    // functions.
    // ---------------------------------------------------------------
    {
        const aliceArchive = buildAliceArchive();
        const bobArchive = buildBobArchive();
        const aliceSnapshot = JSON.stringify(exportAchievementEvidence(aliceArchive));
        const bobSnapshot = JSON.stringify(exportAchievementEvidence(bobArchive));

        const request = reconstructAchievementEvidenceExchangeRequest(aliceArchive);
        const response = reconstructAchievementEvidenceExchangeResponse(request, bobArchive);
        applyAchievementEvidenceExchange(aliceArchive, response);

        assert(JSON.stringify(exportAchievementEvidence(aliceArchive)) === aliceSnapshot, '29. Alice\'s own archive is never mutated by building a request, receiving a response, or applying one');
        assert(JSON.stringify(exportAchievementEvidence(bobArchive)) === bobSnapshot, '30. Bob\'s own archive is never mutated by answering a request');
    }
    console.log('✓ Section G: neither replica\'s archive is ever mutated');

    // ---------------------------------------------------------------
    // Section H — deterministic repeated output.
    // ---------------------------------------------------------------
    {
        const aliceArchive = buildAliceArchive();
        const bobArchive = buildBobArchive();
        const request = reconstructAchievementEvidenceExchangeRequest(aliceArchive);

        assert(JSON.stringify(reconstructAchievementEvidenceExchangeRequest(aliceArchive)) === JSON.stringify(request), '31. requesting twice from the same archive is byte-identical');

        const responseOne = reconstructAchievementEvidenceExchangeResponse(request, bobArchive);
        const responseTwo = reconstructAchievementEvidenceExchangeResponse(request, bobArchive);
        assert(JSON.stringify(responseOne) === JSON.stringify(responseTwo), '32. responding twice to the same request is byte-identical');
    }
    console.log('✓ Section H: repeated calls on identical inputs are byte-identical');

    // ---------------------------------------------------------------
    // Section I — zero network access.
    // ---------------------------------------------------------------
    {
        const aliceArchive = buildAliceArchive();
        const bobArchive = buildBobArchive();

        const { result: request, networkCallOccurred: n1 } = await withoutNetworkAccess(() => reconstructAchievementEvidenceExchangeRequest(aliceArchive));
        const { result: response, networkCallOccurred: n2 } = await withoutNetworkAccess(() => reconstructAchievementEvidenceExchangeResponse(request, bobArchive));
        const { networkCallOccurred: n3 } = await withoutNetworkAccess(() => applyAchievementEvidenceExchange(aliceArchive, response));
        assert(!n1 && !n2 && !n3, '33. building a request, describing a response, and applying an exchange perform zero network operations');
    }
    console.log('✓ Section I: the entire exchange performs zero network operations');

    // ---------------------------------------------------------------
    // Section J — no achievement/badge/statistic/rank/leaderboard
    // vocabulary anywhere in a request or a response.
    // ---------------------------------------------------------------
    {
        const aliceArchive = buildAliceArchive();
        const bobArchive = buildBobArchive();
        const request = reconstructAchievementEvidenceExchangeRequest(aliceArchive);
        const response = reconstructAchievementEvidenceExchangeResponse(request, bobArchive);

        const forbidden = ['achievement', 'badge', 'rank', 'score', 'points', 'leaderboard', 'statistics', 'policy', 'trust', 'confidence', 'verified', 'authentic', 'canonical'];
        const json = (JSON.stringify(request) + JSON.stringify(response)).toLowerCase();
        for (const word of forbidden) {
            assert(!json.includes(word), `34. neither the request nor the response ever mentions "${word}"`);
        }
    }
    console.log('✓ Section J: a request and a response never carry achievement/badge/statistic/rank/leaderboard/trust vocabulary');

    // ---------------------------------------------------------------
    // Section K — no sourceOnly/targetOnly vocabulary anywhere in a
    // response.
    // ---------------------------------------------------------------
    {
        const aliceArchive = buildAliceArchive();
        const bobArchive = buildBobArchive();
        const request = reconstructAchievementEvidenceExchangeRequest(aliceArchive);
        const response = reconstructAchievementEvidenceExchangeResponse(request, bobArchive);

        const json = JSON.stringify(response).toLowerCase();
        assert(!json.includes('sourceonly') && !json.includes('targetonly'), '35. the response transports evidence directly — never framed as a computed sourceOnly/targetOnly difference');
    }
    console.log('✓ Section K: a response never carries 0.8.117\'s own sourceOnly/targetOnly vocabulary — it transports evidence, not a diff');

    // ---------------------------------------------------------------
    // Section L — shape, defaults, and exported vocabulary.
    // ---------------------------------------------------------------
    {
        assert(AchievementEvidenceExchangeProtocolVersion === 1, '36. the current protocol version is 1');
        assert(Object.keys(AchievementEvidenceExchangeResponseOutcome).sort().join(',') === 'EVIDENCE_DESCRIBED,INVALID_REQUEST', '37. exactly these two response outcomes are exported');
        assert(Object.keys(AchievementEvidenceExchangeApplyOutcome).sort().join(',') === 'APPLIED,INVALID_RESPONSE', '38. exactly these two apply outcomes are exported');

        const bareRequest = describeAchievementEvidenceExchangeRequest();
        assert(JSON.stringify(bareRequest) === JSON.stringify(reconstructAchievementEvidenceExchangeRequest(PublicationObservationArchive.empty())), '39. describe() with no arguments matches the empty archive\'s own request');

        const genuineRequest = reconstructAchievementEvidenceExchangeRequest(buildAliceArchive());
        const evidenceDescribedResponse = reconstructAchievementEvidenceExchangeResponse(genuineRequest, buildBobArchive());
        assert(Object.keys(evidenceDescribedResponse).sort().join(',') === ['evidence', 'outcome', 'protocolVersion', 'requesterFingerprint', 'responderFingerprint', 'sameEvidence'].sort().join(','), '40. an EVIDENCE_DESCRIBED response exposes exactly the documented fields');
        assert(Object.keys(evidenceDescribedResponse.evidence).sort().join(',') === ['schemaVersion', 'bitcoinAnchorPublicationRecords', 'baseAnchorPublicationRecords', 'publicationReferenceRecords', 'publisherPublicationAssociationRecords'].sort().join(','), '41. the evidence payload exposes exactly exportAchievementEvidence()\'s own fields');
    }
    console.log('✓ Section L: describe()/reconstruct() defaults are consistent, and every exported vocabulary item is exactly what is documented');

    // ---------------------------------------------------------------
    // Section M — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const aliceArchive = buildAliceArchive();
        const bobArchive = buildBobArchive();

        const aliceFingerprintBefore = reconstructAchievementEvidenceFingerprint(aliceArchive).fingerprint;
        const bobFingerprintBefore = reconstructAchievementEvidenceFingerprint(bobArchive).fingerprint;
        assert(aliceFingerprintBefore !== bobFingerprintBefore, '42. before any exchange, Alice\'s (A, B, C) and Bob\'s (B, C, D) own evidence genuinely differ');

        // Alice pulls from Bob.
        const aliceRequest = reconstructAchievementEvidenceExchangeRequest(aliceArchive);
        const bobResponseToAlice = reconstructAchievementEvidenceExchangeResponse(aliceRequest, bobArchive);
        const aliceAfterApply = applyAchievementEvidenceExchange(aliceArchive, bobResponseToAlice).archive;

        // Bob independently pulls from Alice's ORIGINAL evidence — a
        // genuinely concurrent, independent exchange, never one dependent
        // on the other having already happened.
        const bobRequest = reconstructAchievementEvidenceExchangeRequest(bobArchive);
        const aliceResponseToBob = reconstructAchievementEvidenceExchangeResponse(bobRequest, aliceArchive);
        const bobAfterApply = applyAchievementEvidenceExchange(bobArchive, aliceResponseToBob).archive;

        const aliceFingerprintAfter = reconstructAchievementEvidenceFingerprint(aliceAfterApply).fingerprint;
        const bobFingerprintAfter = reconstructAchievementEvidenceFingerprint(bobAfterApply).fingerprint;
        assert(aliceFingerprintAfter === bobFingerprintAfter, '43. FLAGSHIP — after one exchange in EACH direction, Alice\'s and Bob\'s own evidence fingerprints agree exactly');
        assert(aliceFingerprintAfter !== aliceFingerprintBefore, '44. Alice\'s own evidence genuinely changed — she now holds Bob\'s publication D too');
        assert(aliceAfterApply.bitcoinAnchorPublicationRecords.length === 4, '45. concretely: Alice now holds all four publications, A through D');
        assert(bobAfterApply.bitcoinAnchorPublicationRecords.length === 4, '46. and so does Bob');

        // Each replica independently walks the ENTIRE, UNCHANGED
        // achievement pipeline over its own, now-converged archive.
        const carol = new PublisherIdentityRecord({ publisherId: 'Carol' });
        const dave = new PublisherIdentityRecord({ publisherId: 'Dave' });

        const aliceEvents = reconstructAchievementEvents(aliceAfterApply);
        const bobEvents = reconstructAchievementEvents(bobAfterApply);
        assert(aliceEvents.count > 0, '47. this fixture genuinely earns at least one achievement event — a meaningful comparison');
        assert(JSON.stringify(aliceEvents) === JSON.stringify(bobEvents), '48. FLAGSHIP — independently reconstructed achievement events are byte-identical, never transferred');

        const aliceCarolStatistics = reconstructPublisherAchievementStatistics(aliceAfterApply, carol);
        const bobCarolStatistics = reconstructPublisherAchievementStatistics(bobAfterApply, carol);
        assert(JSON.stringify(aliceCarolStatistics) === JSON.stringify(bobCarolStatistics), '49. FLAGSHIP — Carol\'s own independently reconstructed statistics are byte-identical on both replicas');

        const aliceDaveStatistics = reconstructPublisherAchievementStatistics(aliceAfterApply, dave);
        const bobDaveStatistics = reconstructPublisherAchievementStatistics(bobAfterApply, dave);
        assert(JSON.stringify(aliceDaveStatistics) === JSON.stringify(bobDaveStatistics), '50. and so are Dave\'s');

        const aliceRanking = reconstructPublisherRanking(aliceAfterApply);
        const bobRanking = reconstructPublisherRanking(bobAfterApply);
        assert(aliceRanking.entries.length === 2, '51. both publishers genuinely appear in the ranking — a meaningful comparison');
        assert(JSON.stringify(aliceRanking) === JSON.stringify(bobRanking), '52. FLAGSHIP — the independently reconstructed ranking is byte-identical on both replicas');

        const aliceLeaderboard = reconstructPublisherLeaderboard(aliceAfterApply);
        const bobLeaderboard = reconstructPublisherLeaderboard(bobAfterApply);
        assert(JSON.stringify(aliceLeaderboard) === JSON.stringify(bobLeaderboard), '53. FLAGSHIP — the independently reconstructed leaderboard is byte-identical on both replicas');

        // The crucial negative proof: none of those four conclusions ever
        // appeared in any of the four exchanged messages.
        const exchangedJson = (
            JSON.stringify(aliceRequest) + JSON.stringify(bobResponseToAlice) +
            JSON.stringify(bobRequest) + JSON.stringify(aliceResponseToBob)
        ).toLowerCase();
        for (const word of ['rank', 'score', 'leaderboard', 'statistics', 'achievementkind', 'badgecount']) {
            assert(!exchangedJson.includes(word), `54. "${word}" never appears in any exchanged message — every conclusion above was independently RECOMPUTED, never transmitted`);
        }
    }
    console.log('✓ Section M: FLAGSHIP — Alice and Bob converge to the identical evidence fingerprint through an exchange in each direction, and independently reconstruct byte-identical achievements, statistics, ranking, and leaderboard, without either conclusion ever appearing in an exchanged message');

    console.log('\nAll AchievementEvidenceExchange tests passed.');
}

run().catch((error) => {
    console.error('AchievementEvidenceExchange.test.js FAILED:', error);
    process.exitCode = 1;
});
