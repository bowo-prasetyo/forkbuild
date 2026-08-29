import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/IpfsPublicationRecord.js';
import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { reconstructAchievementEvents } from '../application/AchievementEvent.js';
import { reconstructPublisherAchievementStatistics } from '../application/PublisherAchievementStatisticsView.js';
import { reconstructPublisherRanking } from '../application/PublisherRankingPolicy.js';
import { reconstructPublisherLeaderboard } from '../application/PublisherLeaderboardView.js';
import {
    AchievementEvidenceImportOutcome,
    exportAchievementEvidence,
    importAchievementEvidence
} from '../application/AchievementEvidenceExport.js';

// 0.8.114 — Portable Achievement & Leaderboard Evidence Export.
//
// The flagship this milestone exists to prove: Alice's replica exports
// ONLY her durable evidence — Bitcoin/Base publication identity records,
// publication references, publisher associations — and Bob's replica,
// holding nothing else Alice ever had, independently RECOMPUTES the exact
// same achievement events, statistics, ranking, and leaderboard from that
// evidence alone. Bob never imports Alice's own rank, score, or badge
// count — he never even sees one — he only ever imports facts, and
// arrives at the identical conclusion by running the identical, unchanged
// pipeline over them himself.
//
//   Section A: FLAGSHIP — Alice's evidence, exported, transported as
//              plain JSON text, imported into a bare replica with none of
//              Alice's other facts — achievement events, statistics,
//              ranking, and leaderboard all reconstruct byte-identical;
//              zero network access; every imported fact is provenance
//              IMPORTED; observation/IPFS/broadcast facts never transit
//              and are never needed
//   Section B: deterministic export — identical evidence exports to
//              byte-identical JSON, with no exportedAt or other
//              export-time field, and no added envelope
//   Section C: the exported payload carries exactly the four evidence
//              collections and nothing else — no observation history, no
//              IPFS records, no broadcast records, no archiveImportEvents,
//              no provenance, and no achievement/badge/statistic/rank/
//              leaderboard vocabulary anywhere
//   Section D: malformed/invalid input is INVALID_EVIDENCE, never a
//              silently returned partial or empty archive — a genuinely
//              empty evidence payload still imports successfully
//   Section E: import never merges — repeated calls carry no state of
//              their own, and every imported fact is stamped IMPORTED
//              regardless of whether it was LOCAL or IMPORTED in the
//              exporting replica's own archive
//   Section F: no capability or credential field anywhere in exported
//              output
//   Section G: export requires a genuine archive instance and never
//              mutates it; import accepts both a raw string and an
//              already-parsed value

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const CONCLUSION_KEYS = [
    'rank', 'score', 'points', 'badgecount', 'achievementcount', 'leaderboard',
    'achievementkind', 'distinctachievementkindcount', 'distinctbadgekindcount',
    'statistics', 'policy'
];
function assertNoConclusionVocabulary(value, path) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
        assert(!CONCLUSION_KEYS.includes(key.toLowerCase()), `${path}.${key} looks like a computed conclusion — evidence export must never carry it`);
        assertNoConclusionVocabulary(child, `${path}.${key}`);
    }
}

const FORBIDDEN_CAPABILITY_KEYS = [
    'signPsbt', 'privateKey', 'seedPhrase', 'wallet', 'walletConnection', 'credential',
    'credentials', 'authHeader', 'authorizationHeader', 'apiKey', 'token', 'secret'
];
function assertNoCapabilityOrCredential(value, path) {
    if (typeof value === 'function') {
        throw new Error(`ASSERT FAILED: ${path} is a function — a capability leaked into exported output`);
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
        assert(
            !FORBIDDEN_CAPABILITY_KEYS.some((forbidden) => key.toLowerCase().includes(forbidden.toLowerCase())),
            `${path}.${key} looks like a capability or credential field — never allowed in exported output`
        );
        assertNoCapabilityOrCredential(child, `${path}.${key}`);
    }
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
const TXID_BASE = '0x' + 'c'.repeat(64);
const BLOCK_A = 'd'.repeat(64);

// Alice's complete replica — evidence the achievement pipeline actually
// reads (two Bitcoin publications, one Base publication, one explicit
// reference between the two Bitcoin publications, two publishers each
// explicitly associated with their own publications) PLUS a pile of
// evidence-IRRELEVANT facts (an IPFS publication, a Bitcoin confirmation
// observation, a Bitcoin broadcast record) that this milestone's own
// flagship must prove never need to transit to Bob at all.
function buildAliceArchive() {
    const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
    const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
    const referenceUseCase = new CreatePublicationReferenceRecordUseCase();
    const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

    let archive = PublicationObservationArchive.empty();

    // Evidence-irrelevant facts, appended first, deliberately never
    // referenced by anything achievement-shaped below.
    archive = archive.appendIpfsPublicationRecord(new IpfsPublicationRecord({
        contentHash: 'irrelevant-ipfs-content-hash', locator: 'ipfs://bafy-irrelevant',
        publishedAt: new Date('2026-08-01T00:00:00Z'), publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
    }));

    archive = btcUseCase.execute(archive, { anchorId: 'evidence-anchor-a', contentHash: 'evidence-content-a', txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-01T01:00:00Z') });
    archive = btcUseCase.execute(archive, { anchorId: 'evidence-anchor-b', contentHash: 'evidence-content-b', txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-01T02:00:00Z') });
    archive = baseUseCase.execute(archive, { contentHash: 'evidence-content-c', txid: TXID_BASE, network: NETWORK, createdAt: new Date('2026-08-01T03:00:00Z') });

    archive = archive.appendBitcoinConfirmationObservation('evidence-anchor-a', {
        state: BitcoinAnchorConfirmationState.CONFIRMED, txid: TXID_A, blockHash: BLOCK_A,
        blockHeight: 900000, confirmationCount: 6, reason: null, observedAt: new Date('2026-08-01T04:00:00Z')
    });
    archive = archive.appendBitcoinBroadcastRecord({ anchorId: 'evidence-anchor-b', txid: TXID_B, state: 'broadcasted', broadcastedAt: new Date('2026-08-01T01:30:00Z') });

    const identityA = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'evidence-anchor-a').toBlockchainPublicationIdentity();
    const identityB = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'evidence-anchor-b').toBlockchainPublicationIdentity();
    const identityC = archive.baseAnchorPublicationRecords[0].toBlockchainPublicationIdentity();

    archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: identityB, referencedPublicationIdentity: identityA, createdAt: new Date('2026-08-01T05:00:00Z') });

    archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityA, createdAt: new Date('2026-08-01T06:00:00Z') });
    archive = associationUseCase.execute(archive, { publisherId: 'Alice', publicationIdentity: identityC, createdAt: new Date('2026-08-01T06:01:00Z') });
    archive = associationUseCase.execute(archive, { publisherId: 'Bob', publicationIdentity: identityB, createdAt: new Date('2026-08-01T06:02:00Z') });

    return archive;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        let aliceArchive = buildAliceArchive();

        const alicePublisherIdentity = new PublisherIdentityRecord({ publisherId: 'Alice' });
        const bobPublisherIdentity = new PublisherIdentityRecord({ publisherId: 'Bob' });

        const aliceEvents = reconstructAchievementEvents(aliceArchive);
        const aliceAliceStatistics = reconstructPublisherAchievementStatistics(aliceArchive, alicePublisherIdentity);
        const aliceBobStatistics = reconstructPublisherAchievementStatistics(aliceArchive, bobPublisherIdentity);
        const aliceRanking = reconstructPublisherRanking(aliceArchive);
        const aliceLeaderboard = reconstructPublisherLeaderboard(aliceArchive);

        assert(aliceEvents.count > 0, '1. Alice\'s own archive genuinely earns at least one achievement event — a meaningful fixture');
        assert(aliceLeaderboard.entryCount === 2, '2. both explicitly associated publishers appear on Alice\'s own leaderboard');

        const { result: exported, networkCallOccurred: networkDuringExport } = await withoutNetworkAccess(
            () => exportAchievementEvidence(aliceArchive)
        );
        assert(!networkDuringExport, '3. exporting performs zero network operations');

        // Simulate a real transfer: the exported payload becomes raw text.
        const exportedText = JSON.stringify(exported);

        // Destroy every in-memory reference to Alice's own archive — Bob
        // never receives it, only the evidence text above.
        aliceArchive = null;

        const { result: importResult, networkCallOccurred: networkDuringImport } = await withoutNetworkAccess(
            () => importAchievementEvidence(exportedText)
        );
        assert(!networkDuringImport, '4. importing performs zero network operations');
        assert(importResult.outcome === AchievementEvidenceImportOutcome.IMPORTED, '5. a genuine evidence export imports successfully');
        assert(importResult.archive instanceof PublicationObservationArchive, '6. import produces a genuine PublicationObservationArchive instance');

        const bobArchive = importResult.archive;

        // Bob's replica never received Alice's IPFS record, broadcast
        // record, or confirmation observation — they were never exported.
        assert(bobArchive.ipfsPublicationRecords.length === 0, '7. Bob\'s replica holds no IPFS publication records — never exported');
        assert(bobArchive.bitcoinBroadcastRecords.length === 0, '8. Bob\'s replica holds no Bitcoin broadcast records — never exported');
        assert(Object.keys(bobArchive.bitcoinConfirmationObservationsByAnchorId).length === 0, '9. Bob\'s replica holds no Bitcoin confirmation observations — never exported');
        assert(bobArchive.archiveImportEvents.length === 0, '10. Bob\'s replica records no whole-archive import event — evidence import is a narrower operation');

        // Bob independently recomputes the identical pipeline, from
        // evidence alone.
        const bobEvents = reconstructAchievementEvents(bobArchive);
        const bobAliceStatistics = reconstructPublisherAchievementStatistics(bobArchive, alicePublisherIdentity);
        const bobBobStatistics = reconstructPublisherAchievementStatistics(bobArchive, bobPublisherIdentity);
        const bobRanking = reconstructPublisherRanking(bobArchive);
        const bobLeaderboard = reconstructPublisherLeaderboard(bobArchive);

        assert(JSON.stringify(bobEvents) === JSON.stringify(aliceEvents), '11. Bob\'s independently reconstructed achievement events are byte-identical to Alice\'s own');
        assert(JSON.stringify(bobAliceStatistics) === JSON.stringify(aliceAliceStatistics), '12. Bob\'s independently reconstructed statistics for Alice are byte-identical to Alice\'s own');
        assert(JSON.stringify(bobBobStatistics) === JSON.stringify(aliceBobStatistics), '13. Bob\'s independently reconstructed statistics for Bob are byte-identical to Alice\'s own');
        assert(JSON.stringify(bobRanking) === JSON.stringify(aliceRanking), '14. Bob\'s independently reconstructed ranking is byte-identical to Alice\'s own');
        assert(JSON.stringify(bobLeaderboard) === JSON.stringify(aliceLeaderboard), '15. Bob\'s independently reconstructed leaderboard is byte-identical to Alice\'s own — the flagship property this milestone exists to prove');

        // Every fact that entered Bob's archive is provenance IMPORTED —
        // never a silent LOCAL, regardless of what it was in Alice's own
        // archive.
        assert(bobArchive.localFactCount === 0, '16. Bob\'s replica holds zero LOCAL facts');
        assert(bobArchive.importedFactCount === bobArchive.totalFactCount && bobArchive.totalFactCount > 0, '17. every fact Bob\'s replica holds is IMPORTED');
    }
    console.log('✓ Section A: FLAGSHIP — Alice\'s evidence, exported and reimported into a bare replica, independently reconstructs byte-identical achievement events, statistics, ranking, and leaderboard, with zero network access');

    // ---------------------------------------------------------------
    // Section B — deterministic export.
    // ---------------------------------------------------------------
    {
        const archiveA = buildAliceArchive();
        const archiveB = buildAliceArchive();

        const exportedA = exportAchievementEvidence(archiveA);
        const exportedB = exportAchievementEvidence(archiveB);
        assert(JSON.stringify(exportedA) === JSON.stringify(exportedB), '18. two independently built archives holding identical evidence export to byte-identical JSON');

        const exportedAAgain = exportAchievementEvidence(archiveA);
        assert(JSON.stringify(exportedA) === JSON.stringify(exportedAAgain), '19. exporting the same archive twice produces byte-identical output — no exportedAt or other export-time field is ever inserted');
        assert(!('exportedAt' in exportedA), '20. the exported payload never carries an exportedAt field');
    }
    console.log('✓ Section B: deterministic export — identical evidence exports to byte-identical JSON, with no exportedAt or added envelope');

    // ---------------------------------------------------------------
    // Section C — exactly the four evidence collections, nothing else.
    // ---------------------------------------------------------------
    {
        const archive = buildAliceArchive();
        const exported = exportAchievementEvidence(archive);

        const expectedKeys = ['schemaVersion', 'bitcoinAnchorPublicationRecords', 'baseAnchorPublicationRecords', 'publicationReferenceRecords', 'publisherPublicationAssociationRecords'];
        assert(Object.keys(exported).sort().join(',') === expectedKeys.slice().sort().join(','), '21. the exported payload carries exactly the four evidence collections plus schemaVersion, and nothing else');

        for (const forbidden of ['ipfsPublicationRecords', 'bitcoinBroadcastRecords', 'bitcoinConfirmationObservationsByAnchorId', 'bitcoinContentProofObservationsByAnchorId', 'baseTransactionInclusionObservationsByTransactionHash', 'archiveImportEvents']) {
            assert(!(forbidden in exported), `22. ${forbidden} never appears in achievement evidence — it feeds nothing the achievement pipeline reads`);
        }
        for (const forbidden of ['bitcoinAnchorPublicationRecordProvenance', 'baseAnchorPublicationRecordProvenance', 'publicationReferenceRecordProvenance', 'publisherPublicationAssociationRecordProvenance']) {
            assert(!(forbidden in exported), `23. ${forbidden} never appears — provenance describes the exporting replica's own ingestion, never a fact Bob should inherit`);
        }

        assertNoConclusionVocabulary(exported, 'exported');
    }
    console.log('✓ Section C: the exported payload carries exactly the four evidence collections and no observation, provenance, or conclusion vocabulary');

    // ---------------------------------------------------------------
    // Section D — malformed/invalid input is INVALID_EVIDENCE, and a
    // genuinely empty evidence payload still imports successfully.
    // ---------------------------------------------------------------
    {
        const genuineEmpty = { schemaVersion: 1, bitcoinAnchorPublicationRecords: [], baseAnchorPublicationRecords: [], publicationReferenceRecords: [], publisherPublicationAssociationRecords: [] };
        const malformedInputs = [
            'not even json{',
            JSON.stringify({ ...genuineEmpty, schemaVersion: 999 }),
            JSON.stringify({ ...genuineEmpty, extraUnexpectedField: true }),
            JSON.stringify({ ...genuineEmpty, rank: 1 }),
            (() => { const j = { ...genuineEmpty }; delete j.baseAnchorPublicationRecords; return JSON.stringify(j); })(),
            JSON.stringify({ ...genuineEmpty, bitcoinAnchorPublicationRecords: [{ anchorId: 'x' }] }),
            null,
            undefined,
            42,
            'null',
            JSON.stringify([1, 2, 3])
        ];
        for (const input of malformedInputs) {
            const result = importAchievementEvidence(input);
            assert(result.outcome === AchievementEvidenceImportOutcome.INVALID_EVIDENCE, `24. malformed input is rejected as INVALID_EVIDENCE, saw outcome for ${JSON.stringify(input)}: ${result.outcome}`);
            assert(result.archive === null, `25. a rejected import never returns a partially reconstructed archive, saw for ${JSON.stringify(input)}`);
        }

        const emptyResult = importAchievementEvidence(JSON.stringify(genuineEmpty));
        assert(emptyResult.outcome === AchievementEvidenceImportOutcome.IMPORTED, '26. a genuinely empty, well-formed evidence payload imports successfully — never treated as malformed');
        assert(emptyResult.archive.bitcoinAnchorPublicationRecordCount === 0 && emptyResult.archive.totalFactCount === 0, '27. the imported empty evidence holds no facts');
        assert(reconstructPublisherLeaderboard(emptyResult.archive).entryCount === 0, '28. an empty evidence archive reconstructs to an empty leaderboard');
    }
    console.log('✓ Section D: malformed input is INVALID_EVIDENCE, never a silently returned partial archive — a genuinely empty evidence payload still imports');

    // ---------------------------------------------------------------
    // Section E — import never merges; every imported fact is stamped
    // IMPORTED regardless of the exporting replica's own provenance.
    // ---------------------------------------------------------------
    {
        const archiveX = buildAliceArchive();
        let archiveY = PublicationObservationArchive.empty();
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        archiveY = btcUseCase.execute(archiveY, { anchorId: 'lonely-anchor', contentHash: 'lonely-content', txid: 'e'.repeat(64), network: NETWORK, createdAt: new Date('2026-08-02T00:00:00Z') });

        importAchievementEvidence(exportAchievementEvidence(archiveX));
        const resultY = importAchievementEvidence(exportAchievementEvidence(archiveY));

        assert(resultY.archive.bitcoinAnchorPublicationRecordCount === 1, '29. importing archive Y after archive X carries none of X\'s facts — importAchievementEvidence() holds no state of its own');
        assert(resultY.archive.baseAnchorPublicationRecordCount === 0, '30. archive Y\'s import holds zero Base publication records, exactly as archive Y itself did');

        // Provenance: archive X's own facts are LOCAL (built via ordinary
        // append calls); Bob's imported facts are IMPORTED regardless.
        assert(archiveX.localFactCount > 0 && archiveX.importedFactCount === 0, '31. sanity — archive X\'s own facts are LOCAL, before any export');
        const { archive: reimportedX } = importAchievementEvidence(exportAchievementEvidence(archiveX));
        assert(reimportedX.localFactCount === 0 && reimportedX.importedFactCount === reimportedX.totalFactCount, '32. every fact reimported from archive X is stamped IMPORTED, even though it was LOCAL in the exporting replica\'s own archive');
    }
    console.log('✓ Section E: import never merges — each call is independent, and every imported fact is stamped IMPORTED regardless of its provenance in the exporting replica');

    // ---------------------------------------------------------------
    // Section F — no capability or credential field anywhere in exported
    // output.
    // ---------------------------------------------------------------
    {
        const archive = buildAliceArchive();
        const exported = exportAchievementEvidence(archive);
        assertNoCapabilityOrCredential(exported, 'exported');
    }
    console.log('✓ Section F: no capability or credential field anywhere in exported output');

    // ---------------------------------------------------------------
    // Section G — export requires a genuine archive instance and never
    // mutates it; import accepts both a raw string and an
    // already-parsed value.
    // ---------------------------------------------------------------
    {
        let threw = false;
        try {
            exportAchievementEvidence({ bitcoinAnchorPublicationRecords: [] });
        } catch (error) {
            threw = true;
        }
        assert(threw, '33. exportAchievementEvidence() throws for a non-PublicationObservationArchive input');

        const archive = buildAliceArchive();
        const beforeJSON = JSON.stringify(archive.toJSON());
        exportAchievementEvidence(archive);
        assert(JSON.stringify(archive.toJSON()) === beforeJSON, '34. exporting an archive never mutates it');

        const exported = exportAchievementEvidence(archive);
        const viaString = importAchievementEvidence(JSON.stringify(exported));
        const viaObject = importAchievementEvidence(exported);
        assert(viaString.outcome === AchievementEvidenceImportOutcome.IMPORTED && viaObject.outcome === AchievementEvidenceImportOutcome.IMPORTED, '35. import accepts both a raw JSON string and an already-parsed value');
        assert(JSON.stringify(viaString.archive.toJSON()) === JSON.stringify(viaObject.archive.toJSON()), '36. both forms of input produce byte-identical archives');
    }
    console.log('✓ Section G: export requires a genuine archive instance and never mutates it; import accepts both a raw string and an already-parsed value');

    console.log('\nAll AchievementEvidenceExport tests passed.');
}

run().catch((error) => {
    console.error('AchievementEvidenceExport.test.js FAILED:', error);
    process.exitCode = 1;
});
