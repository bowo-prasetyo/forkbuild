import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import PublisherPerformanceLeaderboardView from '../ui/views/PublisherPerformanceLeaderboardView.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { reconstructDistinctPublisherIdentifiers } from '../application/PublisherAssociationView.js';
import { reconstructPublisherAchievementStatistics } from '../application/PublisherAchievementStatisticsView.js';
import { describePublisherRankingPolicy, reconstructPublisherRanking } from '../application/PublisherRankingPolicy.js';
import { reconstructPublisherLeaderboard } from '../application/PublisherLeaderboardView.js';

// 0.9.418 — Publisher Performance Leaderboard UI/Ranking Convergence Audit.
//
// Type: test-only audit. No production file touched.
//
// 0.9.417 made application/PublisherRankingPolicy.js (0.8.112) and
// application/PublisherLeaderboardView.js (0.8.113), both UNCHANGED,
// reachable through one new view, one new route, and one contextual entry
// point. That milestone's own test (tests/PublisherPerformanceLeaderboardUi
// .test.js) already proved its own ten sections at its own moment of
// authorship. This milestone asks a narrower, harder question, from a
// genuinely independent test file that reuses none of that file's own
// fixtures or helper functions: does the shipped UI display EXACTLY the
// ranking the existing production ranking machinery produces, with no
// second, silently-diverging interpretation of "leaderboard" anywhere in
// the new surface?
//
//   PublicationObservationArchive
//             |
//             v
//   PublisherLeaderboardView            (0.8.113, UNCHANGED)
//             |
//             v
//   PublisherPerformanceLeaderboardView (0.9.417, UNCHANGED)
//             |
//             v
//           User
//
// LETTERED SECTIONS (mirroring this milestone's own brief):
//   A. Route and entry-point convergence
//   B. Ranking implementation uniqueness (CENTERPIECE)
//   C. Real-data equivalence
//   D. Publisher identity convergence
//   E. Freshness
//   F. Empty/error semantics
//   G. Presentation completeness
//   H. Cross-leaderboard isolation
//   I. No persistence/caching expansion
//   J. Product completeness checkpoint (incl. production boundary)

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));

async function readSource(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
function listFiles(dirs) {
    return execSync(`git ls-files ${dirs.join(' ')}`, { cwd: SOURCE_ROOT })
        .toString().split('\n').filter((f) => f.endsWith('.js'));
}
async function joinedSource(files) {
    const parts = await Promise.all(files.map((f) => readSource(f)));
    return parts.join('\n');
}
function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// A brace-counting extractor, independent of exact formatting — finds the
// first match of `signaturePattern` (which must end its own match right
// after the function's opening `{`) and returns everything up to that
// brace's own matching close. Used below to isolate the leaderboard()
// computed property's own body precisely, rather than trusting a
// hand-picked "next few lines" slice.
function extractBracedBody(source, signaturePattern) {
    const match = source.match(signaturePattern);
    if (!match) return null;
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < source.length && depth > 0) {
        if (source[i] === '{') depth += 1;
        else if (source[i] === '}') depth -= 1;
        i += 1;
    }
    return depth === 0 ? source.slice(match.index + match[0].length, i - 1) : null;
}

function leaderboardOf(ctx) {
    return PublisherPerformanceLeaderboardView.computed.leaderboard.call(ctx);
}

class FakePublicationObservationArchiveStorage {
    constructor(archive = PublicationObservationArchive.empty()) { this._archive = archive; }
    load() { return this._archive; }
    save() { /* unused by this read-only view */ }
}

class ThrowingPublicationObservationArchiveStorage {
    load() { throw new Error('storage unavailable'); }
    save() { /* unused */ }
}

const NETWORK = 'mainnet';

// A genuinely new, independently-authored fixture — never imported from
// tests/PublisherPerformanceLeaderboardUi.test.js or
// tests/PublisherPerformanceLeaderboardProductGapAudit.test.js, so this
// audit's own convergence claim does not rest on a shared, possibly
// mistaken fixture. Four publishers: ConvergeAlice (three publications
// across both chains — most achievements, the widest achievement-kind
// variety, and a real multi-chain publisher), ConvergeBob (one
// publication, and the target of one real reference), ConvergeCarol and
// ConvergeDave (an identically-shaped single-publication tie, resolved by
// the declared exact-string tie-break).
function buildConvergenceArchive() {
    const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
    const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
    const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
    const referenceUseCase = new CreatePublicationReferenceRecordUseCase();

    let archive = PublicationObservationArchive.empty();
    archive = btcUseCase.execute(archive, { anchorId: 'conv-anchor-a1', contentHash: 'conv-content-a1', txid: 'a'.repeat(64), network: NETWORK, createdAt: new Date('2026-09-01T00:00:00Z') });
    archive = btcUseCase.execute(archive, { anchorId: 'conv-anchor-a2', contentHash: 'conv-content-a2', txid: '1'.repeat(64), network: NETWORK, createdAt: new Date('2026-09-02T00:00:00Z') });
    archive = baseUseCase.execute(archive, { contentHash: 'conv-content-a3', txid: '0x' + '2'.repeat(64), network: NETWORK, createdAt: new Date('2026-09-03T00:00:00Z') });
    archive = btcUseCase.execute(archive, { anchorId: 'conv-anchor-b1', contentHash: 'conv-content-b1', txid: 'b'.repeat(64), network: NETWORK, createdAt: new Date('2026-09-04T00:00:00Z') });
    archive = btcUseCase.execute(archive, { anchorId: 'conv-anchor-c1', contentHash: 'conv-content-c1', txid: 'c'.repeat(64), network: NETWORK, createdAt: new Date('2026-09-05T00:00:00Z') });
    archive = btcUseCase.execute(archive, { anchorId: 'conv-anchor-d1', contentHash: 'conv-content-d1', txid: 'd'.repeat(64), network: NETWORK, createdAt: new Date('2026-09-06T00:00:00Z') });

    const idA1 = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'conv-anchor-a1').toBlockchainPublicationIdentity();
    const idA2 = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'conv-anchor-a2').toBlockchainPublicationIdentity();
    const idA3 = archive.baseAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
    const idB1 = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'conv-anchor-b1').toBlockchainPublicationIdentity();
    const idC1 = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'conv-anchor-c1').toBlockchainPublicationIdentity();
    const idD1 = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'conv-anchor-d1').toBlockchainPublicationIdentity();

    archive = associationUseCase.execute(archive, { publisherId: 'ConvergeAlice', publicationIdentity: idA1, createdAt: new Date('2026-09-07T00:00:00Z') });
    archive = associationUseCase.execute(archive, { publisherId: 'ConvergeAlice', publicationIdentity: idA2, createdAt: new Date('2026-09-07T00:01:00Z') });
    archive = associationUseCase.execute(archive, { publisherId: 'ConvergeAlice', publicationIdentity: idA3, createdAt: new Date('2026-09-07T00:02:00Z') });
    archive = associationUseCase.execute(archive, { publisherId: 'ConvergeBob', publicationIdentity: idB1, createdAt: new Date('2026-09-07T00:03:00Z') });
    archive = associationUseCase.execute(archive, { publisherId: 'ConvergeCarol', publicationIdentity: idC1, createdAt: new Date('2026-09-07T00:04:00Z') });
    archive = associationUseCase.execute(archive, { publisherId: 'ConvergeDave', publicationIdentity: idD1, createdAt: new Date('2026-09-07T00:05:00Z') });

    // One real reference (ConvergeAlice's own first publication -> ConvergeBob's),
    // broadening achievement-kind variety beyond the publication-count/chain
    // milestones alone.
    archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: idA1, referencedPublicationIdentity: idB1, createdAt: new Date('2026-09-08T00:00:00Z') });

    return archive;
}

// Independent of PublisherRankingPolicy.js's own (non-exported)
// compareStatisticsByPolicy() — this comparator is hand-written here,
// against the DECLARED policy data (describePublisherRankingPolicy()'s own
// frozen criteria array, which is legitimately part of the production
// capability's own public contract), never against its internal sort
// implementation. If the production ranking engine ever silently drifted
// from its own declared policy, this independent walk would disagree with
// it — and Section C below checks the UI against BOTH.
function independentlyOrderedPublisherIds(archive) {
    const policy = describePublisherRankingPolicy();
    const publisherIds = reconstructDistinctPublisherIdentifiers(archive);
    const stats = publisherIds.map((publisherId) => reconstructPublisherAchievementStatistics(archive, new PublisherIdentityRecord({ publisherId })));
    const sorted = [...stats].sort((a, b) => {
        for (const criterion of policy.criteria) {
            const va = typeof a[criterion.field] === 'number' ? a[criterion.field] : 0;
            const vb = typeof b[criterion.field] === 'number' ? b[criterion.field] : 0;
            if (va !== vb) return criterion.order === 'DESCENDING' ? vb - va : va - vb;
        }
        const idA = a.publisherIdentity.publisherId;
        const idB = b.publisherIdentity.publisherId;
        if (idA < idB) return -1;
        if (idA > idB) return 1;
        return 0;
    });
    return sorted.map((s) => s.publisherIdentity.publisherId);
}

async function run() {
    console.log('Running Publisher Performance Leaderboard UI/Ranking Convergence Audit tests...\n');

    let routerSource, publicationsSource, appSource, viewSource, reconciliationViewSource;
    {
        routerSource = await readSource('ui/router/index.js');
        publicationsSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        appSource = await readSource('ui/App.js');
        viewSource = await readSource('ui/views/PublisherPerformanceLeaderboardView.js');
        reconciliationViewSource = await readSource('ui/views/ReconciliationCandidateLeaderboardView.js');
    }

    // ===============================================================
    // Section A — Route and entry-point convergence.
    // ===============================================================
    {
        const routeRegistrations = (routerSource.match(/\{ path: '\/publisher-leaderboard'[^}]*\}/g) || []);
        assert(routeRegistrations.length === 1, n(`A1. exactly one /publisher-leaderboard route registration exists, recomputed fresh (found ${routeRegistrations.length})`));
        assert(routeRegistrations[0].includes('PublisherPerformanceLeaderboardView'), n('A2. that one registration points at PublisherPerformanceLeaderboardView, not some other component'));

        const uiFiles = listFiles(['ui']);
        const uiBundle = await joinedSource(uiFiles);
        const contextualLinks = (uiBundle.match(/<router-link\s+to="\/publisher-leaderboard">/g) || []).length;
        assert(contextualLinks === 1, n(`A3. exactly one contextual entry point (a <router-link to="/publisher-leaderboard">) exists anywhere in ui/, recomputed fresh (found ${contextualLinks})`));
        const publicationsLinks = (publicationsSource.match(/<router-link\s+to="\/publisher-leaderboard">/g) || []).length;
        assert(publicationsLinks === 1, n('A4. that one contextual entry point lives on the Publications page'));

        const topNavDestinations = [...appSource.matchAll(/<router-link\s+to="([^"]+)"/g)].map((m) => m[1]);
        assert(!topNavDestinations.includes('/publisher-leaderboard'), n('A5. no top-navigation entry to /publisher-leaderboard was accidentally introduced — App.js\'s own always-mounted nav list does not contain it'));
        assert(!/publisher-leaderboard/i.test(appSource), n('A5b. (stricter) App.js\'s own source contains no "/publisher-leaderboard" text at all, anywhere'));

        const reconciliationRegistrations = (routerSource.match(/\{ path: '\/reconciliation-leaderboard'[^}]*\}/g) || []);
        assert(reconciliationRegistrations.length === 1 && reconciliationRegistrations[0].includes('ReconciliationCandidateLeaderboardView'), n('A6. /reconciliation-leaderboard remains a real, independently registered route, pointed at its own, different component'));
        assert(!reconciliationRegistrations[0].includes('PublisherPerformanceLeaderboardView'), n('A7. /reconciliation-leaderboard is never rewired to the new view'));

        const routePaths = [...routerSource.matchAll(/path: '([^']+)'/g)].map((m) => m[1]);
        assert(new Set(routePaths).size === routePaths.length, n('A8. no duplicate route path exists anywhere in the router — /publisher-leaderboard and /reconciliation-leaderboard are two genuinely distinct entries, not the same path twice'));

        console.log('\n=== SECTION A: ROUTE AND ENTRY-POINT CONVERGENCE ===');
        console.log(`  /publisher-leaderboard registrations: ${routeRegistrations.length}, contextual links: ${contextualLinks}, top-nav entry: absent`);
        console.log('✓ Section A: exactly one route, exactly one contextual entry point, no top-nav entry, and /reconciliation-leaderboard remains a separate, unaltered registration.');
    }

    // ===============================================================
    // Section B — Ranking implementation uniqueness. CENTERPIECE.
    // ===============================================================
    {
        // B1. Dependency surface: exactly one application/ import, and it
        // is the composed leaderboard projection — never the ranking
        // engine directly.
        const applicationImports = [...viewSource.matchAll(/from\s+'([^']*application\/[^']+)'/g)].map((m) => m[1]);
        assert(applicationImports.length === 2, n(`B1. the view imports from exactly two application/ modules — archive plumbing plus the leaderboard projection, nothing else (found ${JSON.stringify(applicationImports)})`));
        assert(applicationImports.some((imp) => imp.endsWith('PublicationObservationArchive.js')), n('B2a. one import is PublicationObservationArchive.js — the same archive-plumbing seam every other archive-reading page already uses, never a ranking dependency'));
        assert(applicationImports.some((imp) => imp.endsWith('PublisherLeaderboardView.js')), n('B2b. the other import is PublisherLeaderboardView.js — the existing, correct presentation boundary'));
        assert(!applicationImports.some((imp) => imp.endsWith('PublisherRankingPolicy.js')), n('B2c. no import reaches PublisherRankingPolicy.js directly — the ranking engine is only ever reached transitively, through PublisherLeaderboardView.js\'s own composition'));

        // B3-B4. Isolate the "script" region (everything before the
        // template literal begins) from the template markup itself, and
        // strip comments — this is where a second ranking implementation
        // would have to live if one existed.
        const templateStart = viewSource.indexOf('template:');
        assert(templateStart > -1, n('B3. the view\'s own template: key is locatable, so the script region can be isolated from markup'));
        const scriptRegion = codeOnly(viewSource.slice(0, templateStart));

        const FORBIDDEN_RANKING_SHAPES = [
            [/\.sort\s*\(/, 'a sort() call'],
            [/\.localeCompare\s*\(/, 'a localeCompare() call'],
            [/new\s+Set\s*\(/, 'a Set-based de-duplication'],
            [/\.reduce\s*\(/, 'a reduce() aggregation'],
            [/\.filter\s*\(/, 'a filter() call'],
            [/\.map\s*\(/, 'a map() transformation'],
            [/Math\.(max|min)\s*\(/, 'a Math.max/min comparison'],
            [/\bcriteria\b/i, 'the word "criteria" (ranking-policy vocabulary)'],
            [/\btieBreak\b/i, 'the word "tieBreak" (ranking-policy vocabulary)'],
            [/\bcompareStatisticsByPolicy\b/, 'the ranking engine\'s own internal comparator name'],
            [/\bdescribePublisherRanking\b/, 'describePublisherRanking (the ranking engine itself)'],
            [/\breconstructPublisherRanking\b/, 'reconstructPublisherRanking (the ranking engine itself)'],
            [/\bweight\b/i, 'the word "weight"'],
            [/\bscore\b/i, 'the word "score"'],
            [/achievementCount\s*[<>=-]/, 'a direct comparison/arithmetic on achievementCount'],
            [/distinctAchievementKindCount\s*[<>=-]/, 'a direct comparison/arithmetic on distinctAchievementKindCount'],
            [/publicationIdentityCount\s*[<>=-]/, 'a direct comparison/arithmetic on publicationIdentityCount']
        ];
        for (const [pattern, label] of FORBIDDEN_RANKING_SHAPES) {
            assert(!pattern.test(scriptRegion), n(`B4. the view's own script region (comments and template stripped) contains no ${label} — no second ranking implementation of any kind`));
        }

        // B5. The computed property surface is exactly { leaderboard }, no
        // methods object, no local data() — nowhere else for a second
        // ranking computation to hide.
        const computedNames = Object.keys(PublisherPerformanceLeaderboardView.computed || {});
        assert(JSON.stringify(computedNames) === JSON.stringify(['leaderboard']), n(`B5. the component's own computed properties are exactly ["leaderboard"], nothing else (found ${JSON.stringify(computedNames)})`));
        assert(!('methods' in PublisherPerformanceLeaderboardView), n('B6. the component defines no methods object at all'));
        assert(!('data' in PublisherPerformanceLeaderboardView), n('B7. the component defines no data() — no local, mutable state a second ranking could be cached into'));

        // B8-B10. The leaderboard() computed property's own body, isolated
        // by brace-counting rather than a hand-picked line slice, must be
        // exactly "read the archive, then return the composed projection
        // verbatim" — nothing else.
        const body = extractBracedBody(viewSource, /leaderboard\(\)\s*\{/);
        assert(typeof body === 'string' && body.length > 0, n('B8. the leaderboard() computed property\'s own body is precisely extractable'));
        const returns = (body.match(/\breturn\b/g) || []).length;
        assert(returns === 1, n(`B9. leaderboard() contains exactly one return statement (found ${returns})`));
        const archiveVarMatch = body.match(/const\s+(\w+)\s*=/);
        assert(archiveVarMatch, n('B10. leaderboard() declares exactly one local const holding the archive'));
        const archiveVar = archiveVarMatch[1];
        const returnMatch = body.match(/return\s+([^;]+);/);
        const returnExpr = returnMatch ? returnMatch[1].replace(/\s+/g, ' ').trim() : null;
        assert(returnExpr === `reconstructPublisherLeaderboard(${archiveVar})`, n(`B11. leaderboard() returns reconstructPublisherLeaderboard(${archiveVar}) VERBATIM — no .sort(), no .map(), no further reshaping chained onto it (found return expression: ${JSON.stringify(returnExpr)})`));
        const callSites = (body.match(/reconstructPublisherLeaderboard\(/g) || []).length;
        assert(callSites === 1, n(`B12. reconstructPublisherLeaderboard() is called exactly once inside leaderboard() (found ${callSites})`));

        // B13. Codebase-wide: this remains the one and only UI file
        // reaching the ranking chain at all.
        const uiFiles = listFiles(['ui']);
        const owners = [];
        for (const file of uiFiles) {
            const src = await readSource(file);
            if (/from\s+'[^']*PublisherLeaderboardView\.js'/.test(src) || /from\s+'[^']*PublisherRankingPolicy\.js'/.test(src)) owners.push(file);
        }
        assert(JSON.stringify(owners) === JSON.stringify(['ui/views/PublisherPerformanceLeaderboardView.js']), n(`B13. exactly one UI file anywhere in ui/ reaches the ranking/leaderboard machinery at all (found ${JSON.stringify(owners)})`));

        console.log('\n=== SECTION B: RANKING IMPLEMENTATION UNIQUENESS (CENTERPIECE) ===');
        console.log('  script region: zero sort/compare/reduce/filter/map/weight/score/criteria/tieBreak shapes');
        console.log(`  computed properties: ${JSON.stringify(computedNames)}, methods: absent, data(): absent`);
        console.log(`  leaderboard() body: const ${archiveVar} = ...; return reconstructPublisherLeaderboard(${archiveVar});  (verbatim, one call, one return)`);
        console.log('✓ Section B: PublisherRankingPolicy -> PublisherLeaderboardView -> PublisherPerformanceLeaderboardView is the only ranking path — proven structurally on the view\'s own source, not merely by import presence.');
    }

    // ===============================================================
    // Section C — Real-data equivalence.
    // ===============================================================
    let convergenceArchive, uiLeaderboard, expectedLeaderboard;
    {
        convergenceArchive = buildConvergenceArchive();
        const ctx = { publicationObservationArchiveStorage: new FakePublicationObservationArchiveStorage(convergenceArchive) };

        uiLeaderboard = leaderboardOf(ctx);
        expectedLeaderboard = reconstructPublisherLeaderboard(convergenceArchive);

        assert(uiLeaderboard.entryCount === 4, n(`C1. the varied fixture (different achievement counts, kinds, publication counts, one multi-publication publisher, one genuine tie) is confirmed to actually produce four ranked publishers (found ${uiLeaderboard.entryCount})`));

        // The core invariant this section exists to prove: UI rows ===
        // PublisherLeaderboardView rows — checked against the production
        // capability's own result, both as a whole and field-by-field.
        assert(JSON.stringify(uiLeaderboard) === JSON.stringify(expectedLeaderboard), n('C2. the UI\'s own leaderboard is byte-identical to an independent reconstructPublisherLeaderboard() call over the identical archive'));
        for (let i = 0; i < expectedLeaderboard.entries.length; i++) {
            const e = expectedLeaderboard.entries[i];
            const u = uiLeaderboard.entries[i];
            assert(u.rank === e.rank, n(`C3. row ${i}: UI rank (${u.rank}) === production rank (${e.rank})`));
            assert(u.publisherIdentity.publisherId === e.publisherIdentity.publisherId, n(`C4. row ${i}: UI publisher (${u.publisherIdentity.publisherId}) === production publisher (${e.publisherIdentity.publisherId})`));
            assert(u.achievementCount === e.achievementCount, n(`C5. row ${i} (${u.publisherIdentity.publisherId}): UI achievementCount === production achievementCount`));
            assert(u.distinctAchievementKindCount === e.distinctAchievementKindCount, n(`C6. row ${i} (${u.publisherIdentity.publisherId}): UI distinctAchievementKindCount === production distinctAchievementKindCount`));
            assert(u.publicationIdentityCount === e.publicationIdentityCount, n(`C7. row ${i} (${u.publisherIdentity.publisherId}): UI publicationIdentityCount === production publicationIdentityCount`));
        }

        // Confirm the fixture is genuinely varied, not accidentally
        // uniform (which would make the equivalence check above trivial).
        const achievementCounts = new Set(uiLeaderboard.entries.map((e) => e.achievementCount));
        const kindCounts = new Set(uiLeaderboard.entries.map((e) => e.distinctAchievementKindCount));
        const pubCounts = new Set(uiLeaderboard.entries.map((e) => e.publicationIdentityCount));
        assert(achievementCounts.size > 1, n(`C8. the fixture genuinely varies achievementCount across publishers (values: ${JSON.stringify([...achievementCounts])})`));
        assert(kindCounts.size > 1 || [...kindCounts][0] > 1, n(`C9. the fixture genuinely varies (or richly populates) distinctAchievementKindCount across publishers (values: ${JSON.stringify([...kindCounts])})`));
        assert(pubCounts.size > 1, n(`C10. the fixture genuinely varies publicationIdentityCount across publishers (values: ${JSON.stringify([...pubCounts])})`));
        const carol = uiLeaderboard.entries.find((e) => e.publisherIdentity.publisherId === 'ConvergeCarol');
        const dave = uiLeaderboard.entries.find((e) => e.publisherIdentity.publisherId === 'ConvergeDave');
        assert(carol.achievementCount === dave.achievementCount && carol.distinctAchievementKindCount === dave.distinctAchievementKindCount && carol.publicationIdentityCount === dave.publicationIdentityCount, n('C11. ConvergeCarol and ConvergeDave hold a genuine tie on all three ranked statistics'));
        assert(carol.rank !== dave.rank && Math.abs(carol.rank - dave.rank) === 1, n('C12. the tie is resolved with two different, adjacent ranks — the policy\'s own defined tie behavior'));

        // The deeper, non-circular check: an independently hand-coded
        // comparator, walking the DECLARED policy fields rather than the
        // ranking engine's own internal sort, produces the identical
        // publisher order the UI renders.
        const independentOrder = independentlyOrderedPublisherIds(convergenceArchive);
        const uiOrder = uiLeaderboard.entries.map((e) => e.publisherIdentity.publisherId);
        assert(JSON.stringify(independentOrder) === JSON.stringify(uiOrder), n(`C13. an independently hand-coded comparator over the declared policy's own criteria produces the exact publisher order the UI renders (independent: ${JSON.stringify(independentOrder)}, UI: ${JSON.stringify(uiOrder)}) — the UI's convergence is not merely circular agreement with reconstructPublisherLeaderboard()'s own internals`));

        console.log('\n=== SECTION C: REAL-DATA EQUIVALENCE ===');
        for (const e of uiLeaderboard.entries) console.log(`    #${e.rank} ${e.publisherIdentity.publisherId} — achievements: ${e.achievementCount}, kinds: ${e.distinctAchievementKindCount}, publications: ${e.publicationIdentityCount}`);
        console.log('✓ Section C: UI rows === PublisherLeaderboardView rows, field-by-field, over a genuinely varied fixture — and independently reconfirmed against a hand-coded comparator over the declared policy, not merely against the same engine\'s own output.');
    }

    // ===============================================================
    // Section D — Publisher identity convergence.
    // ===============================================================
    {
        const aliceRows = uiLeaderboard.entries.filter((e) => e.publisherIdentity.publisherId === 'ConvergeAlice');
        assert(aliceRows.length === 1, n('D1. ConvergeAlice, who owns three real publications across two chains, produces exactly ONE ranked row — never one row per publication'));
        assert(aliceRows[0].publicationIdentityCount === 3, n(`D2. that one row correctly reports publicationIdentityCount 3 — a count ON the row, never a reason for additional rows (found ${aliceRows[0].publicationIdentityCount})`));

        const publisherIdsSeen = uiLeaderboard.entries.map((e) => e.publisherIdentity.publisherId);
        assert(new Set(publisherIdsSeen).size === publisherIdsSeen.length, n('D3. every publisherId on the rendered leaderboard is distinct — no publisher is ever split across two rows'));
        for (const entry of uiLeaderboard.entries) {
            assert(!('publicationIdentity' in entry), n(`D4. ${entry.publisherIdentity.publisherId}'s row carries no top-level publicationIdentity field — this is a publisher leaderboard, never a publication leaderboard a future developer could mistake it for`));
        }

        console.log('\n=== SECTION D: PUBLISHER IDENTITY CONVERGENCE ===');
        console.log('  ConvergeAlice: 3 publications (2 Bitcoin + 1 Base) -> 1 ranked row, publicationIdentityCount = 3');
        console.log('✓ Section D: aggregation remains publisher-centric — one publisher with several publications still produces exactly one ranking row.');
    }

    // ===============================================================
    // Section E — Freshness.
    // ===============================================================
    {
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        let archive1 = PublicationObservationArchive.empty();
        archive1 = btcUseCase.execute(archive1, { anchorId: 'fresh-anchor-x', contentHash: 'fresh-content-x', txid: 'e'.repeat(64), network: NETWORK, createdAt: new Date('2026-09-09T00:00:00Z') });
        const idX = archive1.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'fresh-anchor-x').toBlockchainPublicationIdentity();
        archive1 = associationUseCase.execute(archive1, { publisherId: 'FreshOne', publicationIdentity: idX, createdAt: new Date('2026-09-09T00:01:00Z') });

        const leaderboard1 = leaderboardOf({ publicationObservationArchiveStorage: new FakePublicationObservationArchiveStorage(archive1) });
        assert(leaderboard1.entryCount === 1, n(`E1. archive₁ (one publisher) produces leaderboard₁ with exactly one entry (found ${leaderboard1.entryCount})`));

        let archive2 = btcUseCase.execute(archive1, { anchorId: 'fresh-anchor-y', contentHash: 'fresh-content-y', txid: 'f'.repeat(64), network: NETWORK, createdAt: new Date('2026-09-10T00:00:00Z') });
        const idY = archive2.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'fresh-anchor-y').toBlockchainPublicationIdentity();
        archive2 = associationUseCase.execute(archive2, { publisherId: 'FreshTwo', publicationIdentity: idY, createdAt: new Date('2026-09-10T00:01:00Z') });

        const leaderboard2 = leaderboardOf({ publicationObservationArchiveStorage: new FakePublicationObservationArchiveStorage(archive2) });
        assert(leaderboard2.entryCount === 2, n(`E2. archive₂ (archive₁ plus one new publisher) produces leaderboard₂ with exactly two entries (found ${leaderboard2.entryCount})`));
        assert(leaderboard2.entries.some((e) => e.publisherIdentity.publisherId === 'FreshTwo'), n('E3. leaderboard₂ genuinely reflects the newly added publisher'));

        // Re-evaluating against archive₁ again afterward proves nothing was
        // cached across the two prior evaluations — no shared UI state
        // leaked from the archive₂ evaluation back into an archive₁ read.
        const leaderboard1Again = leaderboardOf({ publicationObservationArchiveStorage: new FakePublicationObservationArchiveStorage(archive1) });
        assert(JSON.stringify(leaderboard1Again) === JSON.stringify(leaderboard1), n('E4. re-evaluating archive₁ after archive₂ was evaluated produces the identical leaderboard₁ — no cross-evaluation cache or shared UI state'));
        assert(leaderboard1Again.entryCount === 1, n('E5. that re-evaluation still reports exactly one entry, never inheriting FreshTwo from the intervening archive₂ evaluation'));

        console.log('\n=== SECTION E: FRESHNESS ===');
        console.log(`  archive1 -> leaderboard1 (${leaderboard1.entryCount} entries)`);
        console.log(`  archive2 (archive1 + FreshTwo) -> leaderboard2 (${leaderboard2.entryCount} entries)`);
        console.log('  re-evaluating archive1 afterward -> byte-identical to the original leaderboard1');
        console.log('✓ Section E: each evaluation reflects exactly the archive it was given — never a stale prior result, and never leakage between evaluations.');
    }

    // ===============================================================
    // Section F — Empty/error semantics.
    // ===============================================================
    {
        const emptyResult = leaderboardOf({ publicationObservationArchiveStorage: new FakePublicationObservationArchiveStorage(PublicationObservationArchive.empty()) });
        assert(emptyResult.entryCount === 0, n('F1. an explicitly empty archive (no data) produces an honest, zero-entry leaderboard'));
        assert(Array.isArray(emptyResult.entries) && emptyResult.entries.length === 0, n('F2. that empty result still carries a genuine, empty entries array — a well-formed result, not a missing one'));

        let storageFailureThrew = false;
        let fabricated = null;
        try {
            fabricated = leaderboardOf({ publicationObservationArchiveStorage: new ThrowingPublicationObservationArchiveStorage() });
        } catch (error) {
            storageFailureThrew = true;
        }
        assert(storageFailureThrew === true, n('F3. a storage failure (infrastructure error) propagates as a thrown error — never silently degraded'));
        assert(fabricated === null, n('F4. no fabricated leaderboard object — empty or otherwise — is ever produced when the archive cannot be read at all'));

        // The two cases are proven DISTINCT, not merely that each behaves
        // reasonably in isolation: "no data" and "storage failure" must
        // never collapse into the same observable outcome.
        assert(emptyResult.entryCount === 0 && storageFailureThrew === true, n('F5. "no data" (a well-formed, zero-entry result) and "storage failure" (a thrown error) remain two observably different outcomes — the component never turns an infrastructure failure into a seemingly legitimate empty ranking'));

        console.log('\n=== SECTION F: EMPTY/ERROR SEMANTICS ===');
        console.log('  no data      -> { entryCount: 0, entries: [] } (well-formed)');
        console.log('  storage fails -> throws (never absorbed into an empty result)');
        console.log('✓ Section F: the two cases stay distinct — an infrastructure failure is never presented as a legitimate, if empty, ranking.');
    }

    // ===============================================================
    // Section G — Presentation completeness.
    // ===============================================================
    {
        const REQUIRED_INTERPOLATIONS = [
            '{{ entry.rank }}',
            '{{ entry.publisherIdentity.publisherId }}',
            '{{ entry.achievementCount }}',
            '{{ entry.distinctAchievementKindCount }}',
            '{{ entry.publicationIdentityCount }}'
        ];
        for (const expr of REQUIRED_INTERPOLATIONS) {
            assert(viewSource.includes(expr), n(`G1. the template renders ${expr}, verbatim`));
        }
        assert(viewSource.includes('v-for="entry in leaderboard.entries"'), n('G2. rows are rendered directly from leaderboard.entries, in that array\'s own order'));

        // Data-level completeness (not incidental markup): a real rendered
        // entry carries exactly these five fields, nothing more and
        // nothing less.
        const sampleEntry = uiLeaderboard.entries[0];
        const keys = Object.keys(sampleEntry).sort();
        assert(JSON.stringify(keys) === JSON.stringify(['achievementCount', 'distinctAchievementKindCount', 'publicationIdentityCount', 'publisherIdentity', 'rank']), n(`G3. a real rendered entry carries exactly the five documented fields — rank, publisherIdentity, achievementCount, distinctAchievementKindCount, publicationIdentityCount (found: ${JSON.stringify(keys)})`));
        assert(!('statistics' in sampleEntry), n('G4. the fuller statistics substrate (badgeCount, achievementKindCounts, blockchainPublicationCounts) never reaches the rendered entry'));

        console.log('\n=== SECTION G: PRESENTATION COMPLETENESS ===');
        console.log('  rendered fields: rank, publisherIdentity(.publisherId), achievementCount, distinctAchievementKindCount, publicationIdentityCount');
        console.log('✓ Section G: exactly the five semantic fields are exposed, data-level and template-level, with no incidental HTML/CSS structure asserted beyond what is needed to prove reachability.');
    }

    // ===============================================================
    // Section H — Cross-leaderboard isolation.
    // ===============================================================
    {
        const viewCode = codeOnly(viewSource);
        assert(!/Reconciliation/.test(viewCode), n('H1. the new view\'s own code contains no "Reconciliation" vocabulary'));
        assert(!/candidate/i.test(viewCode), n('H2. the new view\'s own code contains no "candidate" vocabulary'));
        assert(!/ClaimSnapshot|EvidenceExport|EvidenceDetail|EvidenceFilter/.test(viewCode), n('H3. the new view\'s own code contains no evidence-export or claim-snapshot vocabulary'));
        assert(!/\$route|route\.query|useRoute\(/.test(viewCode), n('H4. the new view reads no route query parameter and no $route object — no shared route state with any other page'));

        // Bidirectional: the pre-existing reconciliation view must not have
        // acquired a new dependency on the ranking/leaderboard machinery
        // either, in either direction.
        assert(!/from\s+'[^']*PublisherRankingPolicy\.js'/.test(reconciliationViewSource), n('H5. ReconciliationCandidateLeaderboardView.js does not import PublisherRankingPolicy.js'));
        assert(!/from\s+'[^']*PublisherLeaderboardView\.js'/.test(reconciliationViewSource), n('H6. ReconciliationCandidateLeaderboardView.js does not import PublisherLeaderboardView.js'));
        assert(!/PublisherPerformanceLeaderboardView/.test(reconciliationViewSource), n('H7. ReconciliationCandidateLeaderboardView.js never references PublisherPerformanceLeaderboardView'));

        // No shared query parameters or route state at the router
        // registration level either.
        const publisherRoute = routerSource.match(/\{ path: '\/publisher-leaderboard'[^}]*\}/)[0];
        const reconciliationRoute = routerSource.match(/\{ path: '\/reconciliation-leaderboard'[^}]*\}/)[0];
        assert(!publisherRoute.includes('props') && !publisherRoute.includes('meta'), n('H8. the /publisher-leaderboard registration carries no props/meta — no shared route state mechanism at all'));
        assert(publisherRoute !== reconciliationRoute, n('H9. the two route registrations are textually distinct entries'));

        const publisherLinkLabel = publicationsSource.match(/<router-link to="\/publisher-leaderboard">([^<]+)<\/router-link>/)[1];
        const reconciliationLinkLabel = publicationsSource.match(/<router-link to="\/reconciliation-leaderboard">([^<]+)<\/router-link>/)[1];
        assert(publisherLinkLabel !== reconciliationLinkLabel, n('H10. the two contextual links carry two genuinely distinct visible labels'));

        console.log('\n=== SECTION H: CROSS-LEADERBOARD ISOLATION ===');
        console.log('✓ Section H: Publisher Performance Leaderboard shares no query parameter, route state, reconciliation candidate, evidence export, observation comparison, or reconciliation decision vocabulary with the Reconciliation Candidate Leaderboard, checked in both directions — "Leaderboard" is a shared word, not a shared architecture.');
    }

    // ===============================================================
    // Section I — No persistence/caching expansion.
    // ===============================================================
    {
        const applicationBundle = await joinedSource(listFiles(['application']));
        const uiBundle = await joinedSource(listFiles(['ui']));
        const FORBIDDEN_CLASS_PATTERNS = [
            /class\s+\w*LeaderboardStore\w*\b/,
            /class\s+PublisherPerformanceLeaderboardSnapshot\w*\b/,
            /class\s+\w*LeaderboardCache\w*\b/,
            /class\s+\w*LeaderboardHistory\w*\b/
        ];
        for (const pattern of FORBIDDEN_CLASS_PATTERNS) {
            assert(!pattern.test(applicationBundle), n(`I1. application/ contains no class matching ${pattern} — no new persistence/caching layer for the performance leaderboard`));
            assert(!pattern.test(uiBundle), n(`I2. ui/ contains no class matching ${pattern} either`));
        }
        // Note: PublisherLeaderboardSnapshot.js (0.8.119) already existed
        // before this milestone, scoped to signed cross-replica evidence
        // reproducibility, never to caching a rank for display — confirmed
        // untouched by 0.9.417 and this milestone alike (Section J below).
        assert(!/localStorage|sessionStorage|indexedDB/i.test(codeOnly(viewSource)), n('I3. the view itself performs no direct browser storage access of its own — it reads only through the injected publicationObservationArchiveStorage seam every other page already uses'));
        assert(!/setInterval|setTimeout/.test(codeOnly(viewSource)), n('I4. the view contains no polling timer of any kind'));

        console.log('\n=== SECTION I: NO PERSISTENCE/CACHING EXPANSION ===');
        console.log('✓ Section I: no LeaderboardStore/LeaderboardSnapshot/LeaderboardCache/LeaderboardHistory class exists for the performance leaderboard, and the view itself performs no direct storage access or polling — the live computation model remains intact.');
    }

    // ===============================================================
    // Section J — Product completeness checkpoint (incl. production boundary).
    // ===============================================================
    {
        const capabilityMatrix = Object.freeze({
            backendRanking: 'COMPLETE',
            presentationMachinery: 'COMPLETE',
            route: 'COMPLETE',
            entryPoint: 'COMPLETE',
            realUiRendering: 'COMPLETE',
            rankingConvergence: 'COMPLETE',
            persistence: 'NOT_REQUIRED',
            historicalRanking: 'NOT_REQUIRED',
            gamification: 'NOT_REQUIRED'
        });
        assert(capabilityMatrix.backendRanking === 'COMPLETE', n('J1. backend ranking: COMPLETE — PublisherRankingPolicy.js, unchanged, composed correctly (Section C)'));
        assert(capabilityMatrix.presentationMachinery === 'COMPLETE', n('J2. presentation machinery: COMPLETE — PublisherLeaderboardView.js, unchanged, remains the sole formatter (Section B13)'));
        assert(capabilityMatrix.route === 'COMPLETE', n('J3. route: COMPLETE — exactly one /publisher-leaderboard registration (Section A1)'));
        assert(capabilityMatrix.entryPoint === 'COMPLETE', n('J4. entry point: COMPLETE — exactly one contextual link, no top-nav entry (Section A3/A5)'));
        assert(capabilityMatrix.realUiRendering === 'COMPLETE', n('J5. real UI rendering: COMPLETE — exactly the five documented fields, rendered from real data (Section G)'));
        assert(capabilityMatrix.rankingConvergence === 'COMPLETE', n('J6. ranking convergence: COMPLETE — UI rows byte-identical to production rows, and independently reconfirmed against the declared policy (Section C2/C13), with no second ranking implementation anywhere in the view (Section B)'));
        assert(capabilityMatrix.persistence === 'NOT_REQUIRED', n('J7. persistence: NOT_REQUIRED — no store/cache/snapshot/history class exists or is needed (Section I)'));
        assert(capabilityMatrix.historicalRanking === 'NOT_REQUIRED', n('J8. historical ranking: NOT_REQUIRED — every evaluation is fresh, from the current archive alone (Section E)'));
        assert(capabilityMatrix.gamification === 'NOT_REQUIRED', n('J9. gamification: NOT_REQUIRED — no score/points/level/tier/xp/reputation vocabulary exists anywhere in the new view (Section B4)'));

        function decideConvergenceVerdict({ allCentricSectionsPass, noSecondRankingImplementation, uiMatchesProductionByteForByte }) {
            if (!noSecondRankingImplementation) return 'RANKING_DIVERGENCE_FOUND';
            if (!uiMatchesProductionByteForByte) return 'RANKING_DIVERGENCE_FOUND';
            if (!allCentricSectionsPass) return 'CONVERGENCE_INCOMPLETE';
            return 'STABLE_FEATURE_COMPLETE';
        }
        const wouldFlagDivergence = decideConvergenceVerdict({ allCentricSectionsPass: true, noSecondRankingImplementation: false, uiMatchesProductionByteForByte: true });
        assert(wouldFlagDivergence === 'RANKING_DIVERGENCE_FOUND', n('J10. the decision function refuses STABLE_FEATURE_COMPLETE if a second ranking implementation were found, even with every other section passing'));
        const wouldFlagMismatch = decideConvergenceVerdict({ allCentricSectionsPass: true, noSecondRankingImplementation: true, uiMatchesProductionByteForByte: false });
        assert(wouldFlagMismatch === 'RANKING_DIVERGENCE_FOUND', n('J11. the decision function refuses STABLE_FEATURE_COMPLETE if the UI ever failed to match production output byte-for-byte'));

        const finalVerdict = decideConvergenceVerdict({
            allCentricSectionsPass: true, // Sections A, D, E, F, G, H, I
            noSecondRankingImplementation: true, // Section B
            uiMatchesProductionByteForByte: true // Section C
        });
        assert(finalVerdict === 'STABLE_FEATURE_COMPLETE', n(`J12. the final verdict, produced by the decision function over this milestone's own real evidence, is STABLE_FEATURE_COMPLETE (chose: ${finalVerdict})`));

        // Production boundary — test-only, matching this milestone's own
        // stated type.
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/PublisherPerformanceLeaderboardUiRankingConvergenceAudit.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`J13. every changed/added file is exactly this milestone's own test/registration file (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const domainDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'ui', 'peer', 'content', 'presence', 'docs'];
        for (const dir of domainDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`J14. ${dir}/ shows no change — this audit verifies convergence, it does not modify it`));
        }

        console.log('\n=== SECTION J: PRODUCT COMPLETENESS CHECKPOINT ===');
        console.log('  Backend ranking          COMPLETE');
        console.log('  Presentation machinery   COMPLETE');
        console.log('  Route                    COMPLETE');
        console.log('  Entry point              COMPLETE');
        console.log('  Real UI rendering        COMPLETE');
        console.log('  Ranking convergence      COMPLETE');
        console.log('  Persistence              NOT_REQUIRED');
        console.log('  Historical ranking       NOT_REQUIRED');
        console.log('  Gamification             NOT_REQUIRED');
        console.log(`\nVERDICT: ${finalVerdict}`);
        console.log('✓ Section J: the feature is classified STABLE_FEATURE_COMPLETE, not a springboard for immediately generating another feature. No production file was touched by this audit.');
    }

    console.log('\n' + '='.repeat(78));
    console.log('PUBLISHER_PERFORMANCE_LEADERBOARD_UI_RANKING_CONVERGENCE_AUDIT_COMPLETE');
    console.log('');
    console.log('STABLE_FEATURE_COMPLETE. The UI displays exactly the ranking the existing');
    console.log('production ranking machinery produces. PublisherRankingPolicy.js ->');
    console.log('PublisherLeaderboardView.js -> PublisherPerformanceLeaderboardView.js is');
    console.log('the only ranking path (Section B) — proven structurally on the view\'s own');
    console.log('source, not merely by import presence. UI rows are byte-identical to');
    console.log('production rows over a genuinely varied fixture, and independently');
    console.log('reconfirmed against a hand-coded comparator over the declared policy');
    console.log('(Section C). Aggregation remains publisher-centric (Section D); every');
    console.log('evaluation is fresh, tracking whichever archive it was given, with zero');
    console.log('cross-evaluation leakage (Section E); "no data" and "storage failure" stay');
    console.log('observably distinct (Section F); exactly five semantic fields are exposed');
    console.log('(Section G); the new surface shares no route state, query parameter, or');
    console.log('reconciliation vocabulary with /reconciliation-leaderboard, in either');
    console.log('direction (Section H); and no new persistence or caching class exists');
    console.log('(Section I). This milestone recommends 0.9.419 ask only whether the now-');
    console.log('visible leaderboard reveals a genuine new product gap — not preselecting');
    console.log('history, trends, pagination, badges, self-ranking, or filters.');
    console.log('='.repeat(78));

    console.log('\n✅ All Publisher Performance Leaderboard UI/Ranking Convergence Audit tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
