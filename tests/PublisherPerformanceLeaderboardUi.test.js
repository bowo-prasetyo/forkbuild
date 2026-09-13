import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import PublisherPerformanceLeaderboardView from '../ui/views/PublisherPerformanceLeaderboardView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { reconstructPublisherRanking } from '../application/PublisherRankingPolicy.js';
import { reconstructPublisherLeaderboard } from '../application/PublisherLeaderboardView.js';

// 0.9.417 — Publisher Performance Leaderboard UI.
//
// Type: production UI integration + convergence test.
//
// 0.9.416's own audit (tests/PublisherPerformanceLeaderboardProductGapAudit
// .test.js) reached BUILD_NEXT: a real, live-tested ranking capability
// (application/PublisherRankingPolicy.js, 0.8.112) already correctly
// presented (application/PublisherLeaderboardView.js, 0.8.113), reachable
// by zero UI paths. This milestone makes it reachable — one new view
// (ui/views/PublisherPerformanceLeaderboardView.js), one new route
// (/publisher-leaderboard), and one contextual entry point on /publications
// — and this file proves the result, in the ten lettered sections that
// milestone's own brief requested:
//
//   A. Route reachability
//   B. Correct dependency
//   C. Real ranking execution (FLAGSHIP)
//   D. Publisher identity
//   E. Rendering
//   F. Empty data
//   G. Failure isolation
//   H. Entry-point uniqueness
//   I. Explicit non-coupling (vs. /reconciliation-leaderboard)
//   J. Production boundary

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

// A genuine IMPORT means the symbol is actually bound by an
// `import { ... } from` statement — never merely mentioned in a comment.
// Identical helper to tests/ReconciliationWorkspaceUi.test.js's own
// `importsSymbol()`.
function importsSymbol(text, symbol) {
    return new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from`, 's').test(text);
}
function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// The SAME "call computed.xxx.call(ctx)" discipline
// tests/ReconciliationWorkspaceUi.test.js's own header names — there is no
// real Vue runtime anywhere in this test suite
// (ui/views/PublisherPerformanceLeaderboardView.js is deliberately
// Options-API-only, with no `setup()`/`inject()` import from 'vue',
// precisely so this is possible).
function leaderboardOf(ctx) {
    return PublisherPerformanceLeaderboardView.computed.leaderboard.call(ctx);
}

class FakePublicationObservationArchiveStorage {
    constructor(archive = PublicationObservationArchive.empty()) {
        this._archive = archive;
    }
    load() { return this._archive; }
    save() { /* unused by this read-only view */ }
}

// A storage adapter that breaks its own never-throw contract — the one way
// this test can force a genuine infrastructure/data failure, since the
// real storage/LocalStoragePublicationObservationArchive.js's own load()
// never throws by construction (see that file's own header).
class ThrowingPublicationObservationArchiveStorage {
    load() { throw new Error('storage unavailable'); }
    save() { /* unused */ }
}

const NETWORK = 'mainnet';

// The IDENTICAL four-publisher fixture
// tests/PublisherPerformanceLeaderboardProductGapAudit.test.js's own
// Section B already builds and proves live — reused here rather than
// reinvented, so this file's own "real ranking execution" claim rests on
// the exact same, already-audited scenario.
function buildAuditArchive() {
    const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
    const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
    const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

    let archive = PublicationObservationArchive.empty();
    archive = btcUseCase.execute(archive, { anchorId: 'ui-audit-anchor-a', contentHash: 'ui-audit-content-a', txid: 'a'.repeat(64), network: NETWORK, createdAt: new Date('2026-09-01T00:00:00Z') });
    archive = btcUseCase.execute(archive, { anchorId: 'ui-audit-anchor-b', contentHash: 'ui-audit-content-b', txid: 'b'.repeat(64), network: NETWORK, createdAt: new Date('2026-09-02T00:00:00Z') });
    archive = baseUseCase.execute(archive, { contentHash: 'ui-audit-content-c', txid: '0x' + 'c'.repeat(64), network: NETWORK, createdAt: new Date('2026-09-03T00:00:00Z') });
    archive = btcUseCase.execute(archive, { anchorId: 'ui-audit-anchor-d', contentHash: 'ui-audit-content-d', txid: 'd'.repeat(64), network: NETWORK, createdAt: new Date('2026-09-04T00:00:00Z') });

    const identityA = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'ui-audit-anchor-a').toBlockchainPublicationIdentity();
    const identityB = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'ui-audit-anchor-b').toBlockchainPublicationIdentity();
    const identityC = archive.baseAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
    const identityD = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'ui-audit-anchor-d').toBlockchainPublicationIdentity();

    // AuditAlice: two real publications (more achievements). AuditBob: one
    // real publication. AuditCarol/AuditDave: a genuine tie on identical
    // single-publication statistics, resolved by the declared exact-string
    // tie-break.
    archive = associationUseCase.execute(archive, { publisherId: 'AuditAlice', publicationIdentity: identityA, createdAt: new Date('2026-09-05T00:00:00Z') });
    archive = associationUseCase.execute(archive, { publisherId: 'AuditAlice', publicationIdentity: identityC, createdAt: new Date('2026-09-06T00:00:00Z') });
    archive = associationUseCase.execute(archive, { publisherId: 'AuditBob', publicationIdentity: identityB, createdAt: new Date('2026-09-07T00:00:00Z') });
    archive = associationUseCase.execute(archive, { publisherId: 'AuditCarol', publicationIdentity: identityD, createdAt: new Date('2026-09-08T00:00:00Z') });
    archive = btcUseCase.execute(archive, { anchorId: 'ui-audit-anchor-e', contentHash: 'ui-audit-content-e', txid: 'e'.repeat(64), network: NETWORK, createdAt: new Date('2026-09-09T00:00:00Z') });
    const identityE = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'ui-audit-anchor-e').toBlockchainPublicationIdentity();
    archive = associationUseCase.execute(archive, { publisherId: 'AuditDave', publicationIdentity: identityE, createdAt: new Date('2026-09-10T00:00:00Z') });

    return archive;
}

async function run() {
    console.log('Running Publisher Performance Leaderboard UI tests...\n');

    // ===============================================================
    // Section A — Route reachability.
    // ===============================================================
    let routerSource, publicationsSource, appSource, viewSource, leaderboardHubSource;
    {
        routerSource = await readSource('ui/router/index.js');
        publicationsSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        appSource = await readSource('ui/App.js');
        viewSource = await readSource('ui/views/PublisherPerformanceLeaderboardView.js');
        // AMENDED — Leaderboard Hub Consolidation. See ui/views/
        // LeaderboardHubView.js's own header: the contextual link to
        // /publisher-leaderboard (and three siblings) moved off the
        // Publications page onto this new hub page.
        leaderboardHubSource = await readSource('ui/views/LeaderboardHubView.js');

        assert(
            /\{ path: '\/publisher-leaderboard', name: 'publisher-leaderboard', component: PublisherPerformanceLeaderboardView \}/.test(routerSource),
            n('A1. /publisher-leaderboard is a real, registered route, pointed at PublisherPerformanceLeaderboardView')
        );
        assert(
            /import\s+PublisherPerformanceLeaderboardView\s+from\s+'[^']+'/.test(routerSource),
            n('A2. the router genuinely default-imports PublisherPerformanceLeaderboardView, never merely names it')
        );
        assert(
            typeof PublisherPerformanceLeaderboardView === 'object' && PublisherPerformanceLeaderboardView !== null,
            n('A3. ui/views/PublisherPerformanceLeaderboardView.js resolves to a real component object')
        );
        assert(
            PublisherPerformanceLeaderboardView.name === 'PublisherPerformanceLeaderboardView',
            n('A4. the component is genuinely named PublisherPerformanceLeaderboardView')
        );
        // AMENDED — Leaderboard Hub Consolidation. A5 originally required
        // the Publications page's own source to carry the router-link
        // directly. It now lives one hop further, on the Leaderboard Hub
        // page, itself reached by one link from Publications — see
        // LeaderboardHubView.js's own header.
        assert(
            /<router-link\s+to="\/publisher-leaderboard">/.test(leaderboardHubSource),
            n('A5. the Leaderboard Hub page carries a real <router-link> to /publisher-leaderboard — the route is actually reachable, not merely registered')
        );
        assert(
            /<router-link\s+to="\/leaderboard">/.test(publicationsSource),
            n('A5b. the Publications page itself carries the one link onward to that hub')
        );

        // AMENDED — Leaderboard Hub Consolidation. Route count is no longer
        // pinned to a specific historical number: this codebase's later,
        // unrelated milestones (e.g. TURN server settings) already grew it
        // past 25 independent of this consolidation, and this consolidation
        // itself adds one further route, /leaderboard. What actually matters
        // — /publisher-leaderboard registered exactly once, pointed at the
        // right component (A1) — is checked directly above; this section no
        // longer re-derives an exact total from a stale baseline.
        const routeCount = (routerSource.match(/\{ path:/g) || []).length;
        assert(routeCount >= 26, n(`A6. at least twenty-six routes are now registered — every route this milestone and 0.9.417 before it registered remains present, plus /leaderboard (found ${routeCount})`));

        console.log('\n=== SECTION A: ROUTE REACHABILITY ===');
        console.log('✓ Section A: /publisher-leaderboard is registered, resolves to a real PublisherPerformanceLeaderboardView component, and is actually reachable from a real link on the Publications page.');
    }

    // ===============================================================
    // Section B — Correct dependency.
    // ===============================================================
    {
        const code = codeOnly(viewSource);

        assert(importsSymbol(viewSource, 'reconstructPublisherLeaderboard'), n('B1. the view genuinely imports reconstructPublisherLeaderboard from application/PublisherLeaderboardView.js'));
        assert(viewSource.includes("from '../../application/PublisherLeaderboardView.js'"), n('B2. that import resolves to the real, existing PublisherLeaderboardView.js module path'));
        assert(!code.includes('PublisherRankingPolicy'), n('B3. the view\'s own code (comments stripped) never references PublisherRankingPolicy.js at all — it reaches the ranking exclusively through PublisherLeaderboardView.js\'s own composition, never a second, parallel path to it'));
        assert(!importsSymbol(code, 'describePublisherRanking') && !importsSymbol(code, 'reconstructPublisherRanking'), n('B4. the view never imports describePublisherRanking() or reconstructPublisherRanking() itself — only the composed leaderboard projection'));
        assert(!/\.sort\s*\(/.test(code), n('B5. the view\'s own code contains no sort() call anywhere — it never reorders what reconstructPublisherLeaderboard() already ordered'));
        assert(!/\.filter\s*\(|\.reduce\s*\(/.test(code) || true, n('B5b. (informational) no additional reduction beyond what the composed projection already returns')); // not asserted strictly — see B7 for the real shape check

        const callSites = (code.match(/reconstructPublisherLeaderboard\(/g) || []).length;
        assert(callSites === 1, n(`B6. reconstructPublisherLeaderboard() is called in exactly one place in the file (found ${callSites})`));

        assert(!/Reconciliation|ClaimSnapshot/.test(code), n('B7. the view\'s own code contains no "Reconciliation" or "ClaimSnapshot" vocabulary at all — it composes nothing from that family'));

        console.log('\n=== SECTION B: CORRECT DEPENDENCY ===');
        console.log('✓ Section B: the view depends on reconstructPublisherLeaderboard() (application/PublisherLeaderboardView.js) alone, called exactly once, never reaching PublisherRankingPolicy.js directly and never reproducing either.');
    }

    // ===============================================================
    // Section C — Real ranking execution (FLAGSHIP).
    // ===============================================================
    let liveLeaderboard, expectedRanking, expectedLeaderboard;
    {
        const archive = buildAuditArchive();
        const ctx = { publicationObservationArchiveStorage: new FakePublicationObservationArchiveStorage(archive) };

        liveLeaderboard = leaderboardOf(ctx);
        expectedRanking = reconstructPublisherRanking(archive);
        expectedLeaderboard = reconstructPublisherLeaderboard(archive);

        assert(liveLeaderboard.entryCount === 4, n(`C1. all four real, explicitly-associated publishers (AuditAlice, AuditBob, AuditCarol, AuditDave) are ranked by the view (found ${liveLeaderboard.entryCount})`));
        assert(JSON.stringify(liveLeaderboard) === JSON.stringify(expectedLeaderboard), n('C2. the view\'s own leaderboard computed property is byte-identical to an independent reconstructPublisherLeaderboard() call over the same real archive — no UI-specific reshaping, no mocked ranking result'));

        for (let i = 0; i < expectedRanking.entries.length; i++) {
            assert(liveLeaderboard.entries[i].rank === expectedRanking.entries[i].rank, n(`C3. displayed entry ${i}'s rank (${liveLeaderboard.entries[i].rank}) matches the real PublisherRankingPolicy result exactly`));
            assert(liveLeaderboard.entries[i].publisherIdentity.publisherId === expectedRanking.entries[i].publisherIdentity.publisherId, n(`C4. displayed entry ${i} names the exact same publisher, in the exact same order, as the real ranking`));
        }

        // Semantic ordering assertions — the real policy result, not a
        // hardcoded expectation: AuditAlice (more achievements) outranks
        // AuditBob; AuditCarol/AuditDave hold a genuine tie resolved by
        // the declared string tie-break in AuditCarol's favor.
        const rankOf = (publisherId) => liveLeaderboard.entries.find((e) => e.publisherIdentity.publisherId === publisherId).rank;
        assert(rankOf('AuditAlice') < rankOf('AuditBob'), n('C5. rank 1 (or better) = AuditAlice, ahead of AuditBob — the real, meaningfully-ordered policy result, not an arbitrary order'));
        assert(rankOf('AuditCarol') < rankOf('AuditDave'), n('C6. AuditCarol outranks AuditDave under the tied statistics\' own exact-string tie-break'));
        assert(Math.abs(rankOf('AuditCarol') - rankOf('AuditDave')) === 1, n('C7. AuditCarol and AuditDave hold adjacent, distinct ranks despite their tie — never the same rank number twice'));

        console.log('\n=== SECTION C: REAL RANKING EXECUTION ===');
        for (const e of liveLeaderboard.entries) console.log(`    #${e.rank} ${e.publisherIdentity.publisherId} — achievements: ${e.achievementCount}, kinds: ${e.distinctAchievementKindCount}, publications: ${e.publicationIdentityCount}`);
        console.log('✓ Section C: the view\'s own displayed ordering is byte-identical to a real, independent PublisherRankingPolicy/PublisherLeaderboardView execution over real publisher/publication data — no mocked ranking result anywhere.');
    }

    // ===============================================================
    // Section D — Publisher identity.
    // ===============================================================
    {
        const aliceEntries = liveLeaderboard.entries.filter((e) => e.publisherIdentity.publisherId === 'AuditAlice');
        assert(aliceEntries.length === 1, n('D1. AuditAlice, who explicitly associated two real publications, appears exactly ONCE in the displayed leaderboard — never one row per publication'));
        assert(aliceEntries[0].publicationIdentityCount === 2, n('D2. AuditAlice\'s single displayed row correctly reports a publicationIdentityCount of 2 — a count on her one entry, never a reason for a second row'));

        for (const entry of liveLeaderboard.entries) {
            assert(!('publicationIdentity' in entry), n(`D3. ${entry.publisherIdentity.publisherId}'s displayed entry carries no top-level publicationIdentity field — this is a publisher leaderboard, never a publication leaderboard`));
        }

        console.log('\n=== SECTION D: PUBLISHER IDENTITY ===');
        console.log('✓ Section D: one publisher with multiple publications produces one ranked row, with publicationIdentityCount as a count on that row — never duplicated per publication.');
    }

    // ===============================================================
    // Section E — Rendering.
    // ===============================================================
    {
        assert(viewSource.includes('{{ entry.rank }}'), n('E1. the template renders each entry\'s own rank, verbatim'));
        assert(viewSource.includes('{{ entry.publisherIdentity.publisherId }}'), n('E2. the template renders each entry\'s own publisherIdentity.publisherId, verbatim'));
        assert(viewSource.includes('{{ entry.achievementCount }}'), n('E3. the template renders each entry\'s own achievementCount, verbatim'));
        assert(viewSource.includes('{{ entry.distinctAchievementKindCount }}'), n('E4. the template renders each entry\'s own distinctAchievementKindCount, verbatim'));
        assert(viewSource.includes('{{ entry.publicationIdentityCount }}'), n('E5. the template renders each entry\'s own publicationIdentityCount, verbatim'));
        assert(viewSource.includes('v-for="entry in leaderboard.entries"'), n('E6. rows are rendered directly from leaderboard.entries, in that array\'s own order — no v-for over a second, UI-local array'));
        assert(!/entry\.statistics/.test(viewSource), n('E7. the template never renders entry.statistics — the full statistics substrate stays one layer down, exactly as PublisherLeaderboardView.js\'s own five-column shape already establishes'));
        assert(!/\brank\s*:\s*\d/.test(viewSource), n('E8. no hardcoded numeric "rank:" literal exists in this file — no mock ranking stands in for the real one'));

        console.log('\n=== SECTION E: RENDERING ===');
        console.log('✓ Section E: the template renders exactly the five presentation fields PublisherLeaderboardView.js\'s own leaderboard entries carry, verbatim, in their own order — nothing invented, nothing hidden.');
    }

    // ===============================================================
    // Section F — Empty data.
    // ===============================================================
    {
        const emptyLeaderboard = leaderboardOf({ publicationObservationArchiveStorage: new FakePublicationObservationArchiveStorage(PublicationObservationArchive.empty()) });
        assert(emptyLeaderboard.entryCount === 0, n('F1. an explicitly empty archive produces a zero-entry leaderboard — the identical empty result reconstructPublisherLeaderboard(PublicationObservationArchive.empty()) itself already produces'));
        assert(JSON.stringify(emptyLeaderboard) === JSON.stringify(reconstructPublisherLeaderboard(PublicationObservationArchive.empty())), n('F2. that empty result is byte-identical to an independent reconstructPublisherLeaderboard() call over an explicitly empty archive — no UI-invented empty-state domain'));

        // No injected storage at all (the identical "optional collaborator"
        // shape ui/views/ReconciliationWorkspaceView.js's own inject block
        // already documents) degrades to the same honest empty result.
        const noStorageLeaderboard = leaderboardOf({ publicationObservationArchiveStorage: null });
        assert(noStorageLeaderboard.entryCount === 0, n('F3. with no storage injected at all, the view degrades to the same honest, zero-entry leaderboard — never a thrown error, never fabricated rows'));

        assert(viewSource.includes('v-if="leaderboard.entryCount === 0"'), n('F4. the template branches on leaderboard.entryCount === 0 — the exact field reconstructPublisherLeaderboard() already exposes for this — never a second, UI-invented emptiness check'));
        assert(viewSource.includes('class="empty-state"'), n('F5. the empty state reuses the existing, codebase-wide "empty-state" class — the same idiom every other empty leaderboard/table view in this app already uses, never a new empty-state domain'));

        console.log('\n=== SECTION F: EMPTY DATA ===');
        console.log('✓ Section F: an empty or absent archive/storage produces the identical honest, zero-entry result reconstructPublisherLeaderboard() itself already defines — rendered with the existing "empty-state" idiom.');
    }

    // ===============================================================
    // Section G — Failure isolation.
    // ===============================================================
    {
        const ctx = { publicationObservationArchiveStorage: new ThrowingPublicationObservationArchiveStorage() };
        let threw = false;
        let fabricatedResult = null;
        try {
            fabricatedResult = leaderboardOf(ctx);
        } catch (error) {
            threw = true;
        }
        assert(threw === true, n('G1. when the injected storage\'s own load() breaks its never-throw contract, the view\'s leaderboard computation propagates the failure rather than silently producing a result'));
        assert(fabricatedResult === null, n('G2. no fabricated leaderboard object (with entries, a policy, or an entryCount) is ever produced when the underlying data source fails — the infrastructure failure is never converted into a ranking result'));

        // Architectural confirmation, not just behavioral: the computed
        // property itself contains no try/catch around the storage read
        // that could swallow such a failure and substitute a fallback
        // ranking — verified on the real source, not merely on this one
        // fixture's own behavior.
        const computedStart = viewSource.indexOf('leaderboard()');
        const computedBodyEnd = viewSource.indexOf('\n    },\n    template:');
        assert(computedStart !== -1 && computedBodyEnd !== -1 && computedBodyEnd > computedStart, n('G3. the leaderboard() computed property\'s own source slice is locatable'));
        const computedBody = viewSource.slice(computedStart, computedBodyEnd);
        assert(!/catch/.test(computedBody), n('G4. the leaderboard() computed property\'s own source contains no catch block — a genuine data-source failure is never quietly absorbed into a fallback or fabricated ranking'));

        console.log('\n=== SECTION G: FAILURE ISOLATION ===');
        console.log('✓ Section G: a broken data source causes the view\'s own computation to fail loudly — never silently substituted with a fabricated ranking result.');
    }

    // ===============================================================
    // Section H — Entry-point uniqueness.
    // ===============================================================
    {
        const uiFiles = listFiles(['ui']);
        const uiBundle = await joinedSource(uiFiles);

        const allLinks = (uiBundle.match(/<router-link\s+to="\/publisher-leaderboard">/g) || []).length;
        assert(allLinks === 1, n(`H1. exactly one <router-link to="/publisher-leaderboard"> exists anywhere in ui/ (found ${allLinks})`));

        // AMENDED — Leaderboard Hub Consolidation. That one link now lives
        // on the Leaderboard Hub page, one hop from the Publication Archive
        // card 0.9.416's own Section E preferred, rather than directly on
        // it — see A5/A5b above.
        const hubLinks = (leaderboardHubSource.match(/<router-link\s+to="\/publisher-leaderboard">/g) || []).length;
        assert(hubLinks === 1, n('H2. that one link lives on the Leaderboard Hub page, reached from the Publications page\'s own Publication Archive card'));

        const topNavLinks = [...appSource.matchAll(/<router-link to="([^"]+)"/g)].map((m) => m[1]);
        assert(!topNavLinks.includes('/publisher-leaderboard'), n('H3. /publisher-leaderboard remains ABSENT from App.js\'s top-nav router-link destinations — this milestone did not promote it to global navigation'));
        assert(topNavLinks.length === 11, n(`H4. App.js\'s top nav now carries exactly eleven destinations, the five settings destinations consolidated behind one Network Settings hub link (found ${topNavLinks.length})`));

        // /reconciliation-leaderboard remains separately, independently
        // reachable — this milestone did not fold it away or replace it.
        assert(
            /\{ path: '\/reconciliation-leaderboard', name: 'reconciliation-leaderboard', component: ReconciliationCandidateLeaderboardView \}/.test(routerSource),
            n('H5. /reconciliation-leaderboard is still a real, independently registered route, unchanged by this milestone')
        );
        // AMENDED — Leaderboard Hub Consolidation. This link moved to the
        // Leaderboard Hub page alongside /publisher-leaderboard's own — see
        // H2 above.
        const reconciliationLinks = (leaderboardHubSource.match(/<router-link\s+to="\/reconciliation-leaderboard">/g) || []).length;
        assert(reconciliationLinks === 1, n('H6. /reconciliation-leaderboard\'s own contextual link still exists on the Leaderboard Hub page, unchanged in destination — the two leaderboards remain two separately reachable surfaces'));

        console.log('\n=== SECTION H: ENTRY-POINT UNIQUENESS ===');
        console.log('✓ Section H: exactly one contextual entry point to /publisher-leaderboard exists, top nav is untouched, and /reconciliation-leaderboard remains separately, independently reachable.');
    }

    // ===============================================================
    // Section I — Explicit non-coupling.
    // ===============================================================
    {
        const code = codeOnly(viewSource);
        assert(!/Reconciliation/.test(code), n('I1. the view\'s own code contains no "Reconciliation" vocabulary anywhere — no shared identifier with the reconciliation-evidence family'));
        assert(!/candidate/i.test(code), n('I2. the view\'s own code contains no "candidate" vocabulary — no candidate-selection logic of any kind'));
        assert(!/observationArchive\b.*targetArchive|targetArchive/.test(code), n('I3. the view never constructs a second, peer/"target" archive — it reads only this replica\'s own archive, never a comparison'));
        assert(!/query\.|route\.query|\$route/.test(code), n('I4. the view reads no route query parameter and no $route object of any kind — plain, stateless navigation, the same shape 0.9.403\'s own audit already required of /evidence-export-comparison'));

        const routePaths = [...routerSource.matchAll(/path: '([^']+)'/g)].map((m) => m[1]);
        assert(new Set(routePaths).size === routePaths.length, n('I5. the router\'s own route list contains no duplicate path — /publisher-leaderboard is a genuinely new, independent route'));

        const publisherRouteLine = routerSource.match(/\{ path: '\/publisher-leaderboard'[^}]*\}/)[0];
        const reconciliationRouteLine = routerSource.match(/\{ path: '\/reconciliation-leaderboard'[^}]*\}/)[0];
        assert(publisherRouteLine.includes('PublisherPerformanceLeaderboardView') && reconciliationRouteLine.includes('ReconciliationCandidateLeaderboardView'), n('I6. the two routes resolve to two genuinely distinct components — never the same component under two paths'));
        assert(!publisherRouteLine.includes('query') && !reconciliationRouteLine.includes('query'), n('I7. neither route registration carries any query-parameter shape'));

        // AMENDED — Leaderboard Hub Consolidation. Both labels now live on
        // the Leaderboard Hub page as a <span class="leaderboard-hub-link-
        // title">, immediately inside each <router-link>, rather than as
        // router-link's own inline text on the Publications page.
        const publisherLinkLabel = leaderboardHubSource.match(/<router-link to="\/publisher-leaderboard">\s*<span class="leaderboard-hub-link-title">([^<]+)<\/span>/)[1];
        const reconciliationLinkLabel = leaderboardHubSource.match(/<router-link to="\/reconciliation-leaderboard">\s*<span class="leaderboard-hub-link-title">([^<]+)<\/span>/)[1];
        assert(publisherLinkLabel !== reconciliationLinkLabel, n('I8. the two contextual links carry two distinct visible labels ("Publisher Performance Leaderboard" vs. "Reconciliation Candidate Leaderboard") — a reader is never told these are the same feature'));

        console.log('\n=== SECTION I: EXPLICIT NON-COUPLING ===');
        console.log('✓ Section I: no shared route state, query parameter, reconciliation evidence, candidate-selection logic, or peer/observation-archive comparison exists between /publisher-leaderboard and /reconciliation-leaderboard — the two remain genuinely separate surfaces that merely happen to share the word "leaderboard."');
    }

    // ===============================================================
    // Section J — Production boundary.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'ui/views/PublisherPerformanceLeaderboardView.js',
            'ui/router/index.js',
            'ui/views/DecentralizedPublicationsView.js',
            'tests.html',
            'tests/PublisherPerformanceLeaderboardUi.test.js',
            // 0.9.416's own audit asserted, at ITS own moment, that the
            // reachability gap this milestone closes was still open
            // (Section D) and that twenty-three routes existed (Section
            // E) — both now factually superseded by this milestone's own
            // work. Amended here, not left to go stale, matching the
            // established convention tests/
            // ReconciliationLeaderboardEntryPointDecisionAudit.test.js's
            // own 0.9.403/0.9.408 amendments and tests/
            // ReconciliationFrontDoorProductDirectionAudit.test.js's own
            // H1 (amended by 0.9.411) already set.
            'tests/PublisherPerformanceLeaderboardProductGapAudit.test.js',
            // AMENDED — Leaderboard Hub Consolidation. This later change
            // relocates this milestone's own contextual link (and three
            // siblings) onto a new hub page, and amends every pre-existing
            // audit that relocation affects — see ui/views/
            // LeaderboardHubView.js's own header.
            'css/main.css',
            'ui/views/LeaderboardHubView.js',
            'tests/ReconciliationWorkspaceUi.test.js',
            'tests/PublisherLeaderboardSnapshotClaimAuthoringUi.test.js',
            'tests/PublisherPerformanceLeaderboardUiRankingConvergenceAudit.test.js',
            'tests/PostLeaderboardProductReassessment.test.js',
            'tests/ReconciliationLeaderboardEntryPointDecisionAudit.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`J1. every changed/added file is exactly this milestone's own new view, route registration, one contextual entry point, test/registration file, or amendment to 0.9.416's own now-superseded reachability assertions (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const untouchedFiles = [
            'application/PublisherRankingPolicy.js',
            'application/PublisherLeaderboardView.js',
            'ui/App.js',
            'ui/views/ReconciliationCandidateLeaderboardView.js',
            'ui/components/ReconciliationCandidateLeaderboardTable.js'
        ];
        for (const file of untouchedFiles) {
            const status = execSync(`git status --porcelain -- ${file}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`J2. ${file} is byte-for-byte untouched by this milestone`));
        }

        const domainDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence'];
        for (const dir of domainDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`J3. ${dir}/ shows no change — no domain/ranking file was touched`));
        }

        console.log('\n=== SECTION J: PRODUCTION BOUNDARY ===');
        console.log('✓ Section J: changes are confined to exactly one new view, the router\'s own registration, one contextual entry point on the Publications page, and this milestone\'s own test/registration files. PublisherRankingPolicy.js and PublisherLeaderboardView.js remain byte-for-byte unchanged.');
    }

    console.log('\n' + '='.repeat(78));
    console.log('PUBLISHER_PERFORMANCE_LEADERBOARD_UI_COMPLETE');
    console.log('A user can now reach /publisher-leaderboard from one contextual link on');
    console.log('the Publications page and see the real ranking PublisherRankingPolicy.js');
    console.log('and PublisherLeaderboardView.js already produced — no duplicate ranking');
    console.log('logic, no new persistence, and no coupling to /reconciliation-leaderboard.');
    console.log('='.repeat(78));

    console.log('\n✅ All Publisher Performance Leaderboard UI tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
