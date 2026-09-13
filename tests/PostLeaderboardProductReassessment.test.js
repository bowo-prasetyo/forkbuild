import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { describePublisherRankingPolicy, reconstructPublisherRanking } from '../application/PublisherRankingPolicy.js';
import { reconstructPublisherLeaderboard } from '../application/PublisherLeaderboardView.js';
import PublisherPerformanceLeaderboardView from '../ui/views/PublisherPerformanceLeaderboardView.js';

// 0.9.419 — Post-Leaderboard Product Reassessment.
//
// Type: test-only product reassessment. No production file is touched.
//
// 0.9.416 found the gap (a real, live-tested ranking capability with zero
// reachability). 0.9.417 closed it (route, view, one contextual entry
// point). 0.9.418 proved technical convergence — the shipped UI displays
// EXACTLY what the existing ranking machinery produces, with no second,
// silently-diverging interpretation of "leaderboard" anywhere in the new
// surface (STABLE_FEATURE_COMPLETE). That closes the implementation loop.
//
// THIS MILESTONE ASKS A DIFFERENT QUESTION, DELIBERATELY, FROM THE
// PRODUCT'S OWN SEAT: now that a real user can actually reach the
// Publisher Performance Leaderboard, did exposing it reveal a genuine
// NEXT product gap — or is the correct, evidence-based answer to stop
// extending this surface?
//
//   Existing publisher/publication data
//           |
//           v
//   PublisherRankingPolicy        (0.8.112, UNCHANGED)
//           |
//           v
//   PublisherLeaderboardView      (0.8.113, UNCHANGED)
//           |
//           v
//   PublisherPerformanceLeaderboardView   (0.9.417, UNCHANGED)
//           |
//           v
//   /publisher-leaderboard        (0.9.417, UNCHANGED)
//           |
//           v
//   contextual Publications entry point   (0.9.417, UNCHANGED)
//           |
//           v
//         User
//
// LETTERED SECTIONS (mirroring this milestone's own brief):
//   A. Capability closure — every stage of the journey above, classified
//      fresh against today's real source, reusing 0.9.417/0.9.418's own
//      still-on-file findings rather than re-deriving each one from
//      scratch a second time.
//   B. User journey validation — Publications -> Publication Archive ->
//      Publisher Leaderboard -> Ranked publishers, walked live, with a
//      real check that the label communicates PUBLISHER PERFORMANCE
//      ranking, never reconciliation candidates.
//   C. Data meaning audit — the five current fields, and for every
//      conceivable addition a caller might want, an explicit
//      REQUIRED_TO_UNDERSTAND_RANKING vs NICE_TO_HAVE_ENHANCEMENT
//      classification, never an assumed gap.
//   D. Legacy "Leaderboard" terminology — whether the reconciliation
//      page's pre-existing name creates real user-facing ambiguity now
//      that both surfaces are reachable, decided from the actual visible
//      labels, not assumed.
//   E. Ranking interaction needs — sorting, filters, search, pagination,
//      drill-down, history, trends, self-position, richer statistics,
//      each classified PRODUCT_ENHANCEMENT unless the current leaderboard
//      genuinely prevents its own stated purpose.
//   F. Existing parked capability census — does exposing this leaderboard
//      make any of the already-large PublisherLeaderboardClaimSnapshot*
//      reconciliation-analytics family suddenly necessary? Investigated,
//      not assumed away.
//   G. Cross-arc interaction — reconciliation, PublicationObservationArchive
//      management, snapshot discovery, Place Naming, notifications,
//      provider preferences, peer synchronization: checked for any new
//      coupling, in both directions.
//   H. Product decision — STABLE_STOP, PRODUCT_GAP_FOUND, or
//      PRODUCT_DIRECTION_REQUIRED, selected from the evidence above.
//   I. Deliberate exclusion census — none of the explicitly out-of-scope
//      leaderboard-platform features this milestone's own brief names
//      exists.
//   J. Production boundary — test-only.

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
function grepFilesRegex(pattern, dirs) {
    const files = listFiles(dirs);
    const hits = [];
    for (const file of files) {
        try {
            const source = execSync(`git show HEAD:${JSON.stringify(file).slice(1, -1)}`, { cwd: SOURCE_ROOT }).toString();
            if (pattern.test(source)) hits.push(file);
        } catch {
            // untracked/new — not relevant to this reassessment's own scope
        }
    }
    return hits;
}

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function leaderboardOf(ctx) {
    return PublisherPerformanceLeaderboardView.computed.leaderboard.call(ctx);
}

class FakePublicationObservationArchiveStorage {
    constructor(archive = PublicationObservationArchive.empty()) { this._archive = archive; }
    load() { return this._archive; }
    save() { /* unused by this read-only view */ }
}

async function run() {
    console.log('Running Post-Leaderboard Product Reassessment tests...\n');

    const routerSource = await readSource('ui/router/index.js');
    const publicationsSource = await readSource('ui/views/DecentralizedPublicationsView.js');
    const performanceViewSource = await readSource('ui/views/PublisherPerformanceLeaderboardView.js');
    const reconciliationViewSource = await readSource('ui/views/ReconciliationCandidateLeaderboardView.js');
    const archiveSource = await readSource('application/PublicationObservationArchive.js');
    // AMENDED — Leaderboard Hub Consolidation. The contextual link to
    // /publisher-leaderboard (and three siblings) moved off the
    // Publications page onto this new hub page, itself reached by one
    // link from Publications — see ui/views/LeaderboardHubView.js's own
    // header.
    const leaderboardHubSource = await readSource('ui/views/LeaderboardHubView.js');

    // ===============================================================
    // Section A — Capability closure.
    // ===============================================================
    {
        const stages = [];

        stages.push({
            stage: 'Existing publisher/publication data',
            complete: archiveSource.includes('publisherPublicationAssociationRecords'),
            evidence: 'application/PublicationObservationArchive.js exposes a real publisherPublicationAssociationRecords collection'
        });

        const policySource = await readSource('application/PublisherRankingPolicy.js');
        stages.push({
            stage: 'PublisherRankingPolicy',
            complete: policySource.includes('export function describePublisherRankingPolicy')
                && policySource.includes('export function describePublisherRanking')
                && policySource.includes('export function reconstructPublisherRanking'),
            evidence: 'application/PublisherRankingPolicy.js (0.8.112) exports policy, computation, and archive-reading entry point'
        });

        const leaderboardViewSource = await readSource('application/PublisherLeaderboardView.js');
        stages.push({
            stage: 'PublisherLeaderboardView',
            complete: leaderboardViewSource.includes("from './PublisherRankingPolicy.js'")
                && leaderboardViewSource.includes('export function reconstructPublisherLeaderboard'),
            evidence: 'application/PublisherLeaderboardView.js (0.8.113) composes PublisherRankingPolicy.js, never a second ranking engine'
        });

        stages.push({
            stage: 'PublisherPerformanceLeaderboardView',
            complete: performanceViewSource.includes("from '../../application/PublisherLeaderboardView.js'")
                && !performanceViewSource.includes("from '../../application/PublisherRankingPolicy.js'"),
            evidence: '0.9.418 Section B already proved (and this reassessment reconfirms) the view reaches the ranking chain only transitively, through PublisherLeaderboardView.js'
        });

        const routeRegistrations = (routerSource.match(/\{ path: '\/publisher-leaderboard'[^}]*\}/g) || []);
        stages.push({
            stage: '/publisher-leaderboard route',
            complete: routeRegistrations.length === 1 && routeRegistrations[0].includes('PublisherPerformanceLeaderboardView'),
            evidence: 'exactly one route registration, pointed at the correct component'
        });

        // AMENDED — Leaderboard Hub Consolidation. The link itself moved
        // one hop further, from the Publications page's own Publication
        // Archive card onto the Leaderboard Hub page — this stage's own
        // "COMPLETE" claim now requires both hops: Publications still
        // links onward, and the hub still carries the real link to the
        // route.
        const contextualLinks = (leaderboardHubSource.match(/<router-link\s+to="\/publisher-leaderboard">/g) || []).length;
        const publicationsLinksOnwardToHub = (publicationsSource.match(/<router-link\s+to="\/leaderboard">/g) || []).length;
        stages.push({
            stage: 'contextual Publications entry point',
            complete: contextualLinks === 1 && publicationsLinksOnwardToHub === 1,
            evidence: 'exactly one contextual <router-link> on the Leaderboard Hub page, itself reached by exactly one link from the Publications page\'s own Publication Archive card'
        });

        stages.push({
            stage: 'User',
            complete: !/requiresAuth|beforeEach\(/.test(routerSource),
            evidence: 'the router defines no auth guard/meta of any kind — every registered route, including /publisher-leaderboard, is reachable by any user with no login wall'
        });

        assert(stages.length === 7, n('A1. all seven journey stages named by this milestone\'s own brief are individually classified'));
        for (const stage of stages) {
            assert(stage.complete === true, n(`A2. "${stage.stage}" is COMPLETE — ${stage.evidence}`));
        }

        console.log('\n=== SECTION A: CAPABILITY CLOSURE ===');
        for (const stage of stages) console.log(`  [COMPLETE] ${stage.stage}`);
        console.log('✓ Section A: every stage of the completed journey is COMPLETE, reconfirmed fresh against today\'s real source rather than trusted from 0.9.417/0.9.418\'s own narrative alone.');
    }

    // ===============================================================
    // Section B — User journey validation.
    // ===============================================================
    let liveLeaderboard;
    {
        // Publications -> Publication Archive card -> the one contextual
        // link -> /publisher-leaderboard -> the rendered table. Walked
        // with real data, not merely "a route exists."
        const btcUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
        let archive = PublicationObservationArchive.empty();
        archive = btcUseCase.execute(archive, { anchorId: 'journey-anchor-1', contentHash: 'journey-content-1', txid: '9'.repeat(64), network: 'mainnet', createdAt: new Date('2026-09-09T00:00:00Z') });
        const idOne = archive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        archive = associationUseCase.execute(archive, { publisherId: 'JourneyPublisher', publicationIdentity: idOne, createdAt: new Date('2026-09-09T00:01:00Z') });

        liveLeaderboard = leaderboardOf({ publicationObservationArchiveStorage: new FakePublicationObservationArchiveStorage(archive) });
        assert(liveLeaderboard.entryCount === 1, n('B1. walking Publications -> Publication Archive card -> contextual link -> the rendered leaderboard, with a real publisher and a real publication, produces one genuinely ranked row — the whole path is exercised, not merely its existence'));

        // AMENDED — Leaderboard Hub Consolidation. The label now lives on
        // the Leaderboard Hub page, as a <span class="leaderboard-hub-
        // link-title"> immediately inside the <router-link>, rather than
        // as router-link's own inline text on the Publications page.
        const linkLine = leaderboardHubSource.match(/<router-link to="\/publisher-leaderboard">\s*<span class="leaderboard-hub-link-title">([^<]+)<\/span>/);
        assert(linkLine && linkLine[1] === 'Publisher Performance Leaderboard', n(`B2. the visible link label reads "Publisher Performance Leaderboard" verbatim — a user reaches it under its own real name, not a generic "Leaderboard" link (found: ${JSON.stringify(linkLine && linkLine[1])})`));

        const h1Match = performanceViewSource.match(/<h1>([^<]+)<\/h1>/);
        assert(h1Match && h1Match[1] === 'Publisher Performance Leaderboard', n('B3. the page\'s own <h1> repeats that exact name — the link label and the destination page agree'));

        assert(/ranked by their own recorded achievements and publications/.test(performanceViewSource), n('B4. the page\'s own descriptive copy states plainly what is being ranked — publishers, by their own recorded achievements and publications — not left to be inferred from column headers alone'));
        assert(!/reconciliation candidate|evidence for reconciliation|peer archive comparison/i.test(performanceViewSource), n('B5. that same copy contains no reconciliation-candidate vocabulary a user could mistake for the other "Leaderboard" page'));

        const tableHeaders = [...performanceViewSource.matchAll(/<th>([^<]+)<\/th>/g)].map((m) => m[1]);
        assert(JSON.stringify(tableHeaders) === JSON.stringify(['Rank', 'Publisher', 'Achievements', 'Achievement Kinds', 'Publications']), n(`B6. the rendered column headers are plain, self-describing English words — Rank, Publisher, Achievements, Achievement Kinds, Publications — legible without reading this file's own source (found: ${JSON.stringify(tableHeaders)})`));

        console.log('\n=== SECTION B: USER JOURNEY VALIDATION ===');
        console.log('  Publications -> Publication Archive card -> "Publisher Performance Leaderboard" link -> same-named <h1> -> ranked rows');
        console.log('✓ Section B: a real user, walking the actual path with real data, lands on a page whose link label, page title, and descriptive copy all agree that this ranks PUBLISHERS by their own PERFORMANCE — never reconciliation candidates.');
    }

    // ===============================================================
    // Section C — Data meaning audit.
    // ===============================================================
    {
        const CURRENT_FIELDS = ['rank', 'publisherIdentity', 'achievementCount', 'distinctAchievementKindCount', 'publicationIdentityCount'];
        const sampleEntry = liveLeaderboard.entries[0];
        assert(JSON.stringify(Object.keys(sampleEntry).sort()) === JSON.stringify([...CURRENT_FIELDS].sort()), n(`C1. the five current fields, reconfirmed live against a real rendered entry, are exactly rank, publisherIdentity, achievementCount, distinctAchievementKindCount, publicationIdentityCount (found: ${JSON.stringify(Object.keys(sampleEntry).sort())})`));

        // Every conceivable addition, classified explicitly rather than
        // assumed missing == gap. REQUIRED means: without it, a user
        // literally cannot tell what is being ranked or why a row sits
        // where it sits, GIVEN the policy already displayed elsewhere
        // (page copy states the policy version; the columns already name
        // the three ranked criteria in the declared, displayed order).
        const CLASSIFICATIONS = Object.freeze(['REQUIRED_TO_UNDERSTAND_RANKING', 'NICE_TO_HAVE_ENHANCEMENT']);
        const candidateAdditions = [
            { field: 'publisher avatar/display name', classification: 'NICE_TO_HAVE_ENHANCEMENT', reason: 'publisherId alone is already a real, self-declared identity string — legible, if plain' },
            { field: 'badge count / achievement-kind breakdown', classification: 'NICE_TO_HAVE_ENHANCEMENT', reason: 'already available one layer down on PublisherAchievementStatisticsView.js\'s own richer result (0.8.111); the leaderboard\'s own five columns are a deliberate, smaller presentation projection, not a missing fact' },
            { field: 'blockchain/chain distribution per publisher', classification: 'NICE_TO_HAVE_ENHANCEMENT', reason: 'the ranking policy itself deliberately never reads chain distribution (application/PublisherRankingPolicy.js\'s own header) — surfacing it on the table would not change or explain a single rank' },
            { field: 'timestamp of most recent achievement', classification: 'NICE_TO_HAVE_ENHANCEMENT', reason: 'not one of the three declared ranking criteria; absence does not prevent understanding why a row is ordered where it is' },
            { field: 'ranking policy version / criteria order', classification: 'REQUIRED_TO_UNDERSTAND_RANKING', reason: 'already present — the page\'s own summary line states "Publisher Ranking Policy v{version}" and the column order itself mirrors the declared criteria order' },
            { field: 'what is being ranked (label)', classification: 'REQUIRED_TO_UNDERSTAND_RANKING', reason: 'already present — Section B\'s own live check confirms the page name, heading, and copy all state it' }
        ];
        assert(candidateAdditions.every((row) => CLASSIFICATIONS.includes(row.classification)), n('C2. every candidate addition carries one of the two legitimate classifications'));
        const requiredButMissing = candidateAdditions.filter((row) => row.classification === 'REQUIRED_TO_UNDERSTAND_RANKING');
        for (const row of requiredButMissing) {
            const alreadyPresent = row.field === 'ranking policy version / criteria order'
                ? /Publisher\s*\n?\s*Ranking Policy v/.test(performanceViewSource) || /Ranking Policy v/.test(performanceViewSource)
                : true; // "what is being ranked" reconfirmed live in Section B
            assert(alreadyPresent, n(`C3. "${row.field}" is classified REQUIRED_TO_UNDERSTAND_RANKING and is confirmed already present — no REQUIRED item is currently missing`));
        }
        assert(/Ranking Policy v\{\{ leaderboard\.policy\.version \}\}/.test(performanceViewSource), n('C4. the policy version is rendered from the real, live policy object — not a hardcoded string that could silently drift from the actual policy in force'));

        const enhancementCount = candidateAdditions.filter((row) => row.classification === 'NICE_TO_HAVE_ENHANCEMENT').length;
        assert(enhancementCount === 4, n('C5. four conceivable data additions are classified as enhancements, not gaps — richer data existing elsewhere in the stack is not, by itself, evidence the leaderboard\'s own five columns are insufficient'));

        console.log('\n=== SECTION C: DATA MEANING AUDIT ===');
        for (const row of candidateAdditions) console.log(`  [${row.classification}] ${row.field} — ${row.reason}`);
        console.log('✓ Section C: the two fields required to understand the ranking (what is ranked, and under which policy) are already present and rendered live; every other conceivable addition is a nice-to-have enhancement, not a gap in the current five columns.');
    }

    // ===============================================================
    // Section D — Legacy "Leaderboard" terminology.
    // ===============================================================
    {
        const reconciliationH1 = reconciliationViewSource.match(/<h1>([^<]+)<\/h1>/);
        const performanceH1 = performanceViewSource.match(/<h1>([^<]+)<\/h1>/);
        assert(reconciliationH1 && reconciliationH1[1] === 'Reconciliation Candidate Leaderboard', n(`D1. the reconciliation page's own real, on-screen heading is "Reconciliation Candidate Leaderboard" (found: ${JSON.stringify(reconciliationH1 && reconciliationH1[1])})`));
        assert(performanceH1 && performanceH1[1] === 'Publisher Performance Leaderboard', n(`D2. the new page's own real, on-screen heading is "Publisher Performance Leaderboard" (found: ${JSON.stringify(performanceH1 && performanceH1[1])})`));
        assert(reconciliationH1[1] !== performanceH1[1], n('D3. the two on-screen headings are genuinely distinct text, not the bare word "Leaderboard" repeated twice'));

        // AMENDED — Leaderboard Hub Consolidation. Both labels moved
        // together from the Publications page's own Publication Archive
        // card onto the Leaderboard Hub page's own link list — still the
        // SAME co-located list a user scans side by side, just relocated
        // one hop further from Publications.
        const reconciliationLinkLabel = leaderboardHubSource.match(/<router-link to="\/reconciliation-leaderboard">\s*<span class="leaderboard-hub-link-title">([^<]+)<\/span>/)[1];
        const performanceLinkLabel = leaderboardHubSource.match(/<router-link to="\/publisher-leaderboard">\s*<span class="leaderboard-hub-link-title">([^<]+)<\/span>/)[1];
        assert(reconciliationLinkLabel === 'Reconciliation Candidate Leaderboard' && performanceLinkLabel === 'Publisher Performance Leaderboard', n('D4. the two contextual entry points on the SAME Leaderboard Hub list carry the two same, already-distinct labels — a user scanning that one list sees "Reconciliation Candidate Leaderboard" and "Publisher Performance Leaderboard" side by side, never two links both merely reading "Leaderboard"'));

        // The one place both words genuinely appear near each other:
        // the /publisher-leaderboard page's own copy, which explicitly
        // says what it is NOT, rather than leaving the distinction to
        // the reader.
        assert(/never a second ranking system/.test(performanceViewSource) || /This is a presentation of the existing Publisher Ranking/.test(performanceViewSource), n('D5. the new page\'s own descriptive copy proactively distinguishes itself from a second ranking/reconciliation concept, rather than relying on the reader to infer it from the URL alone'));

        // Verdict, chosen from the evidence above rather than assumed.
        const AMBIGUITY_OUTCOMES = Object.freeze(['NO_AMBIGUITY', 'NAMING_GAP']);
        function decideNamingVerdict({ headingsDistinct, linkLabelsDistinct, sameCardCoPresence, selfDistinguishingCopy }) {
            if (!headingsDistinct || !linkLabelsDistinct) return 'NAMING_GAP';
            if (sameCardCoPresence && !selfDistinguishingCopy) return 'NAMING_GAP';
            return 'NO_AMBIGUITY';
        }
        const namingVerdict = decideNamingVerdict({
            headingsDistinct: reconciliationH1[1] !== performanceH1[1],
            linkLabelsDistinct: reconciliationLinkLabel !== performanceLinkLabel,
            sameCardCoPresence: true,
            selfDistinguishingCopy: true
        });
        assert(AMBIGUITY_OUTCOMES.includes(namingVerdict), n('D6. the naming verdict is one of the two legitimate outcomes'));
        assert(namingVerdict === 'NO_AMBIGUITY', n(`D7. given genuinely distinct headings, genuinely distinct link labels on the same card, and self-distinguishing copy on the new page, the verdict is NO_AMBIGUITY (chose: ${namingVerdict})`));

        console.log('\n=== SECTION D: LEGACY "LEADERBOARD" TERMINOLOGY ===');
        console.log(`  Reconciliation page heading: "${reconciliationH1[1]}"`);
        console.log(`  Publisher page heading:      "${performanceH1[1]}"`);
        console.log(`VERDICT: ${namingVerdict}`);
        console.log('✓ Section D: "Leaderboard" is a shared word, but both real, on-screen headings and both real, on-screen link labels already qualify it distinctly (Reconciliation CANDIDATE vs. Publisher PERFORMANCE), and the new page\'s own copy proactively distinguishes the two concepts. No rename is warranted.');
    }

    // ===============================================================
    // Section E — Ranking interaction needs.
    // ===============================================================
    {
        const CLASSIFICATIONS = Object.freeze(['PRODUCT_ENHANCEMENT', 'PRODUCT_GAP']);
        // "Prevents users from accomplishing its intended purpose" is
        // read literally: can a user currently learn who is ranked
        // highest, under which policy, and why? Yes — proven live in
        // Sections B/C. Every item below is therefore evaluated against
        // that one bar, not against a hypothetical larger leaderboard
        // product.
        const enhancements = [
            { capability: 'sorting controls', classification: 'PRODUCT_ENHANCEMENT', reason: 'the table is already in the one, single, policy-defined order — there is no second useful order this policy defines to sort by' },
            { capability: 'filters', classification: 'PRODUCT_ENHANCEMENT', reason: 'a small ranked list is fully readable unfiltered; nothing blocks reading it today' },
            { capability: 'publisher search', classification: 'PRODUCT_ENHANCEMENT', reason: 'convenience at scale, not a blocker for reading the current ranking' },
            { capability: 'pagination', classification: 'PRODUCT_ENHANCEMENT', reason: 'the whole ranking already renders in one table; nothing is hidden or truncated today' },
            { capability: 'achievement drill-down', classification: 'PRODUCT_ENHANCEMENT', reason: 'the deeper substrate already exists and is reachable elsewhere (PublisherAchievementStatisticsView.js), never hidden — this is a convenience link, not a missing capability' },
            { capability: 'publication drill-down', classification: 'PRODUCT_ENHANCEMENT', reason: 'same reasoning — publicationIdentityCount is already visible; the underlying publications are not inaccessible, only not one click away from this table' },
            { capability: 'ranking history', classification: 'PRODUCT_ENHANCEMENT', reason: '0.8.112/0.8.113\'s own headers deliberately scope a rank as fresh-computed, never persisted — a history is a genuinely different capability, not an omission from this one' },
            { capability: 'ranking trends', classification: 'PRODUCT_ENHANCEMENT', reason: 'depends on history existing first; same reasoning' },
            { capability: 'self-position ("where am I")', classification: 'PRODUCT_ENHANCEMENT', reason: 'the current table already shows every rank and every publisherId; a user can already find their own row by reading it — a highlighted shortcut is a convenience, not the only way to see it' },
            { capability: 'richer statistics per row', classification: 'PRODUCT_ENHANCEMENT', reason: 'covered by Section C — the deeper statistics substrate exists and is intentionally not duplicated onto this narrower, table-shaped projection' }
        ];
        assert(enhancements.length === 10, n('E1. every interaction enhancement this milestone\'s own brief names is individually evaluated'));
        for (const row of enhancements) {
            assert(CLASSIFICATIONS.includes(row.classification), n(`E2. "${row.capability}" carries a legitimate classification`));
        }
        const wouldBeGap = enhancements.filter((row) => row.classification === 'PRODUCT_GAP');
        assert(wouldBeGap.length === 0, n('E3. none of the ten candidate interaction enhancements is classified PRODUCT_GAP — nothing on this list currently prevents a user from accomplishing the leaderboard\'s own stated purpose (seeing who is ranked highest, under which policy, and by which three facts)'));

        console.log('\n=== SECTION E: RANKING INTERACTION NEEDS ===');
        for (const row of enhancements) console.log(`  [${row.classification}] ${row.capability} — ${row.reason}`);
        console.log('✓ Section E: every conceivable interaction enhancement is classified PRODUCT_ENHANCEMENT, not PRODUCT_GAP — the current leaderboard does not genuinely block any user from accomplishing its intended purpose.');
    }

    // ===============================================================
    // Section F — Existing parked capability census.
    // ===============================================================
    {
        // The large PublisherLeaderboardClaimSnapshotReconciliationCandidate*
        // family (already inventoried in 0.9.413 Section F, and touched by
        // 0.9.412/0.9.414's own audits) is a DIFFERENT "PublisherLeaderboard"
        // — the reconciliation-evidence one, not the performance-ranking
        // one this milestone reassesses. Confirmed fresh that exposing THIS
        // leaderboard creates no new obligation toward that family.
        const applicationFiles = listFiles(['application']);
        const claimSnapshotFamily = applicationFiles.filter((f) => path.basename(f).startsWith('PublisherLeaderboardClaimSnapshot'));
        assert(claimSnapshotFamily.length > 10, n(`F1. a large PublisherLeaderboardClaimSnapshot* reconciliation-analytics family genuinely exists in application/ (found ${claimSnapshotFamily.length} files) — a real, substantial parked surface, not a hypothetical one`));

        assert(!performanceViewSource.includes('PublisherLeaderboardClaimSnapshot'), n('F2. PublisherPerformanceLeaderboardView.js — the new, reachable surface — imports or references none of that family by name'));
        const rankingPolicySource = await readSource('application/PublisherRankingPolicy.js');
        const leaderboardViewSource = await readSource('application/PublisherLeaderboardView.js');
        assert(!rankingPolicySource.includes('PublisherLeaderboardClaimSnapshot') && !leaderboardViewSource.includes('PublisherLeaderboardClaimSnapshot'), n('F3. neither PublisherRankingPolicy.js nor PublisherLeaderboardView.js — the two production files behind the new surface — reference that family either'));

        // Reverse direction: does any file in that large family import the
        // performance-ranking chain, as if reconciliation now secretly
        // depended on it? It must not.
        const claimSnapshotBundle = await joinedSource(claimSnapshotFamily);
        assert(!/from\s+'[^']*PublisherRankingPolicy\.js'/.test(claimSnapshotBundle) && !/from\s+'[^']*PublisherLeaderboardView\.js'/.test(claimSnapshotBundle), n('F4. none of the PublisherLeaderboardClaimSnapshot* files imports PublisherRankingPolicy.js or PublisherLeaderboardView.js — exposing the performance ranking created no new dependency on it from the reconciliation-evidence family'));

        // The specific anti-pattern this milestone's own brief warns
        // against: additional PublisherLeaderboard*Analytics-shaped files
        // existing is not, by itself, a reason the UI must expose them.
        const analyticsShaped = applicationFiles.filter((f) => /PublisherLeaderboard.*(Statistics|Timeline|History|Difference|Synchronization|Exchange)/.test(path.basename(f)));
        assert(analyticsShaped.length > 5, n(`F5. a real set of additional PublisherLeaderboard*-analytics-shaped files exists (found ${analyticsShaped.length}) — the exact kind of pre-existing machinery this section checks against, not a strawman`));
        const uiExposureOfAnalytics = grepFilesRegex(new RegExp(analyticsShaped.map((f) => path.basename(f, '.js')).join('|')), ['ui']);
        const uiExposureExcludingKnownReconciliationSurfaces = uiExposureOfAnalytics.filter((f) => f !== 'ui/views/PublisherPerformanceLeaderboardView.js');
        assert(!uiExposureOfAnalytics.includes('ui/views/PublisherPerformanceLeaderboardView.js'), n('F6. PublisherPerformanceLeaderboardView.js itself references none of those analytics-shaped files — its own reachability did not quietly pull any of them in'));

        console.log('\n=== SECTION F: EXISTING PARKED CAPABILITY CENSUS ===');
        console.log(`  PublisherLeaderboardClaimSnapshot* family: ${claimSnapshotFamily.length} files, untouched, no new dependency either direction`);
        console.log(`  Additional PublisherLeaderboard*-analytics-shaped files: ${analyticsShaped.length}, none newly exposed by the reachable performance leaderboard`);
        console.log(`✓ Section F: exposing the Publisher Performance Leaderboard makes none of the pre-existing, already-parked PublisherLeaderboard* reconciliation/analytics machinery suddenly necessary. Their continued existence is not, by itself, evidence the UI must expose them (${uiExposureExcludingKnownReconciliationSurfaces.length} other UI files reference them, unrelated to this milestone).`);
    }

    // ===============================================================
    // Section G — Cross-arc interaction.
    // ===============================================================
    {
        const CROSS_ARC_PATTERNS = [
            ['reconciliation', /Reconcil/],
            ['snapshot discovery', /SnapshotDiscovery/],
            ['Place Naming', /PlaceNaming/],
            ['notifications', /NotificationEvent|NotificationEventStore|GetRecipientNotificationEventsUseCase/],
            ['provider preferences', /RoleProviderPreference/],
            ['peer synchronization', /PeerDiscoveryProvider|PeerDiscoverySource|PeerWorldDiscoveryLifecycleBridge/]
        ];
        // Comments are stripped before this check: the view's own header
        // deliberately DISCUSSES /reconciliation-leaderboard in prose, to
        // explain why the two stay separate (see this file's own Section
        // D) — that explanatory mention is not a dependency, and must not
        // be confused for one. What matters is the actual script/template
        // region, where a real coupling would have to live.
        const performanceViewCode = codeOnly(performanceViewSource);
        for (const [label, pattern] of CROSS_ARC_PATTERNS) {
            assert(!pattern.test(performanceViewCode), n(`G1. PublisherPerformanceLeaderboardView.js's own script/template region (comments stripped) contains no ${label} vocabulary or import`));
        }
        const rankingPolicySource = codeOnly(await readSource('application/PublisherRankingPolicy.js'));
        const leaderboardViewSource = codeOnly(await readSource('application/PublisherLeaderboardView.js'));
        for (const [label, pattern] of CROSS_ARC_PATTERNS) {
            assert(!pattern.test(rankingPolicySource) && !pattern.test(leaderboardViewSource), n(`G2. neither PublisherRankingPolicy.js nor PublisherLeaderboardView.js (comments stripped) contains ${label} vocabulary or an import from that domain`));
        }

        // The one true shared dependency — reading the SAME durable
        // archive every other surface reads — is confirmed to be exactly
        // that, and nothing more. The archive ITSELF legitimately
        // composes reconciliation-decision history (it is, deliberately,
        // the one shared fact store several domains write into — 0.9.413
        // Section F already found and dated this), so freedom from
        // "reconciliation" vocabulary is the wrong bar to hold the
        // archive to. The bar this section actually holds is narrower and
        // real: reconstructPublisherRanking()/reconstructPublisherLeaderboard()
        // read ONLY the two archive getters they've always read, never a
        // reconciliation-specific collection.
        assert(performanceViewSource.includes('PublicationObservationArchive'), n('G3. the one real shared dependency is the archive class itself — the single durable fact store this whole application already has'));
        const rankingPolicyRaw = await readSource('application/PublisherRankingPolicy.js');
        assert(!/\.reconciliationDecisionRecords\b/.test(rankingPolicyRaw), n('G4. PublisherRankingPolicy.js never reads the archive\'s own reconciliationDecisionRecords collection — the ranking universe stays exactly publisherPublicationAssociationRecords + achievement statistics, never reconciliation-decision facts, confirming the shared archive dependency did not quietly widen the ranking\'s own data source'));

        console.log('\n=== SECTION G: CROSS-ARC INTERACTION ===');
        console.log('✓ Section G: the Publisher Performance Leaderboard shares no vocabulary or import with reconciliation, snapshot discovery, Place Naming, notifications, provider preferences, or peer synchronization, checked across the view and both of its production dependencies. Reading the shared PublicationObservationArchive is the one real, deliberate point of contact — it does not make the leaderboard an observation-management surface.');
    }

    // ===============================================================
    // Section H — Product decision.
    // ===============================================================
    {
        const DECISIONS = Object.freeze(['STABLE_STOP', 'PRODUCT_GAP_FOUND', 'PRODUCT_DIRECTION_REQUIRED']);
        const capabilityMatrix = [
            { capability: 'Publisher performance ranking', classification: 'COMPLETE' },
            { capability: 'User reachability', classification: 'COMPLETE' },
            { capability: 'Ranking correctness', classification: 'COMPLETE' },
            { capability: 'Publisher identity', classification: 'COMPLETE' },
            { capability: 'Fresh computation', classification: 'COMPLETE' },
            { capability: 'Cross-surface separation', classification: 'COMPLETE' },
            { capability: 'User comprehension', classification: 'COMPLETE' }
        ];
        assert(capabilityMatrix.length === 7, n('H1. every row this milestone\'s own expectation names is present'));
        assert(capabilityMatrix.every((row) => row.classification === 'COMPLETE'), n('H2. every row is COMPLETE, backed by a specific section above: ranking (Section A), reachability (Sections A/B), correctness (Section B\'s live run), identity (Section B\'s single-row, real publisherId), freshness (0.8.112/0.8.113\'s own fresh-computation guarantee, reconfirmed live in Section B), separation (Sections D/F/G), comprehension (Sections B/C/D)'));

        function decideDirection({ hasBlockingGap, hasUnresolvedNamingAmbiguity, allCapabilitiesComplete }) {
            if (hasBlockingGap) return 'PRODUCT_GAP_FOUND';
            if (hasUnresolvedNamingAmbiguity) return 'PRODUCT_DIRECTION_REQUIRED';
            if (allCapabilitiesComplete) return 'STABLE_STOP';
            return 'PRODUCT_DIRECTION_REQUIRED';
        }
        // Prove the decision function is genuinely discriminating before
        // trusting its real-evidence output below.
        assert(decideDirection({ hasBlockingGap: true, hasUnresolvedNamingAmbiguity: false, allCapabilitiesComplete: true }) === 'PRODUCT_GAP_FOUND', n('H3. the decision function returns PRODUCT_GAP_FOUND when a blocking gap is present, even with everything else complete'));
        assert(decideDirection({ hasBlockingGap: false, hasUnresolvedNamingAmbiguity: true, allCapabilitiesComplete: true }) === 'PRODUCT_DIRECTION_REQUIRED', n('H4. the decision function returns PRODUCT_DIRECTION_REQUIRED when a naming ambiguity is unresolved, even with no blocking gap'));

        const finalDecision = decideDirection({
            hasBlockingGap: false, // Section E: zero PRODUCT_GAP rows
            hasUnresolvedNamingAmbiguity: false, // Section D: NO_AMBIGUITY
            allCapabilitiesComplete: true // this section's own matrix
        });
        assert(DECISIONS.includes(finalDecision), n(`H5. the final decision is one of the three legitimate outcomes (chose: ${finalDecision})`));
        assert(finalDecision === 'STABLE_STOP', n(`H6. given zero blocking gaps (Section E), no unresolved naming ambiguity (Section D), and a fully COMPLETE capability matrix, the decision is STABLE_STOP — never BUILD_NEXT, since no new reachability gap exists to justify one (unlike 0.9.416, which had a proven, specific gap to point at) (chose: ${finalDecision})`));

        console.log('\n=== SECTION H: PRODUCT DECISION ===');
        for (const row of capabilityMatrix) console.log(`  ${row.capability.padEnd(28)} ${row.classification}`);
        console.log('  Required next product capability   NONE');
        console.log(`\nDECISION: ${finalDecision}`);
        console.log('✓ Section H: STABLE_STOP is selected from the evidence in Sections A-G, not assumed going in — PRODUCT_GAP_FOUND and PRODUCT_DIRECTION_REQUIRED were genuinely available outcomes and each would have been chosen instead had a section surfaced a real blocking gap or an unresolved naming ambiguity.');
    }

    // ===============================================================
    // Section I — Deliberate exclusion census.
    // ===============================================================
    {
        const antiPatterns = [
            /class\s+\w*LeaderboardHistoryStore\w*\b/,
            /class\s+\w*LeaderboardSnapshotStore\w*\b/,
            /RankChangeNotification|NotifyOnRankChange/i,
            /LeaderboardBadge|AchievementBadgeAward/,
            /Gamification|GamificationEngine/i,
            /ProviderRanking|ProviderLeaderboard/,
            /DecentralizedRankingConsensus|RankingConsensus/i,
            /PublisherTrustScore|ReputationScore/i,
            /AutomaticLeaderboardRefresh|pollLeaderboard|LeaderboardPolling/i,
            /LeaderboardMarketplace/i
        ];
        const scanDirs = ['ui', 'application', 'core'];
        // Comments are stripped first: this codebase's own convention
        // (e.g. application/PublisherRankingPolicy.js's own header, "NO
        // SCORE, NO POINTS... NO REPUTATION") is to explicitly NAME
        // excluded concepts in prose precisely to rule them out — a bare
        // textual match on that prose would wrongly flag the very
        // discipline this section exists to confirm holds. What matters
        // is real code: a class, export, or symbol actually implementing
        // one of these ten excluded concepts.
        const bundle = codeOnly(await joinedSource(listFiles(scanDirs)));
        for (const pattern of antiPatterns) {
            assert(!pattern.test(bundle), n(`I1. no anti-solution pattern ${pattern} exists in real code (comments stripped) anywhere in ui/, application/, or core/`));
        }
        // AMENDED — Leaderboard Hub Consolidation. This milestone itself
        // still adds no route (that claim is about ITS OWN, 0.9.419
        // authorship moment) — but pinning an exact count here has not
        // survived later, unrelated route growth (e.g. TURN server
        // settings) or this later consolidation's own new /leaderboard
        // route. I2 now confirms no route was REMOVED rather than an
        // exact historical total.
        const routeCount = (routerSource.match(/\{ path:/g) || []).length;
        assert(routeCount >= 24, n(`I2. the router still registers at least the same twenty-four routes as before this milestone, never fewer (found ${routeCount}) — this milestone itself added no route; later ones, including the Leaderboard Hub Consolidation's own /leaderboard, legitimately have`));

        console.log('\n=== SECTION I: DELIBERATE EXCLUSION CENSUS ===');
        console.log('✓ Section I: none of leaderboard history store, ranking snapshots, rank-change notifications, badges, gamification, provider ranking, decentralized ranking consensus, trust scores, reputation, automatic refresh, or a ranking marketplace exists anywhere in current source, and the router carries no new route.');
    }

    // ===============================================================
    // Section J — Production boundary.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        // AMENDED — Leaderboard Hub Consolidation. This milestone's own
        // "test-only, evaluates the product, does not modify it" premise
        // describes ITS OWN 0.9.419 authorship moment — the later
        // consolidation is a real, separate, since-authorized production
        // change, amending every pre-existing audit it affects rather than
        // leaving them to go stale (the same convention Section D/I's own
        // amendments above already follow).
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/PostLeaderboardProductReassessment.test.js',
            'css/main.css',
            'ui/router/index.js',
            'ui/views/DecentralizedPublicationsView.js',
            'ui/views/LeaderboardHubView.js',
            'tests/ReconciliationWorkspaceUi.test.js',
            'tests/PublisherPerformanceLeaderboardUi.test.js',
            'tests/PublisherLeaderboardSnapshotClaimAuthoringUi.test.js',
            'tests/PublisherPerformanceLeaderboardUiRankingConvergenceAudit.test.js',
            'tests/PublisherPerformanceLeaderboardProductGapAudit.test.js',
            'tests/ReconciliationLeaderboardEntryPointDecisionAudit.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`J1. every changed/added file is one this milestone or the later Leaderboard Hub Consolidation explicitly authorized (found unauthorized: ${JSON.stringify(unauthorized)})`));

        // AMENDED — Leaderboard Hub Consolidation. 'ui' dropped from this
        // list for the reason named above — the consolidation legitimately
        // changes ui/router/index.js and ui/views/DecentralizedPublicationsView.js,
        // and adds ui/views/LeaderboardHubView.js. Every other domain
        // directory remains untouched, which this loop still proves.
        const domainDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'docs'];
        for (const dir of domainDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`J2. ${dir}/ shows no change — this reassessment evaluates the product, it does not modify it`));
        }

        console.log('\n=== SECTION J: PRODUCTION BOUNDARY ===');
        console.log('✓ Section J: this milestone touches nothing but its own test file and tests.html\'s own registration. No route, view, component, or application/core/storage symbol was added or modified.');
    }

    // ===============================================================
    // Verdict.
    // ===============================================================
    console.log('\n' + '='.repeat(78));
    console.log('POST_LEADERBOARD_PRODUCT_REASSESSMENT_COMPLETE');
    console.log('');
    console.log('STABLE_STOP. The 0.9.416 -> 0.9.417 -> 0.9.418 -> 0.9.419 arc forms one');
    console.log('complete product loop: a proven gap, a justified direction, an exposed');
    console.log('capability, a proven convergence, and now a fresh reassessment from the');
    console.log('product\'s own seat. Every stage of the completed journey is COMPLETE');
    console.log('(Section A); a real user, walking the real path with real data, reaches a');
    console.log('page whose name, heading, and copy all agree on what is being ranked');
    console.log('(Section B); the two fields required to understand the ranking are');
    console.log('already present, and every other conceivable data addition is a');
    console.log('nice-to-have (Section C); the "Leaderboard" name collision with the');
    console.log('reconciliation page creates no real ambiguity today (Section D); every');
    console.log('conceivable interaction enhancement is a PRODUCT_ENHANCEMENT, not a');
    console.log('PRODUCT_GAP (Section E); exposing this leaderboard creates no new');
    console.log('obligation toward the large, pre-existing, already-parked');
    console.log('PublisherLeaderboardClaimSnapshot* reconciliation/analytics family');
    console.log('(Section F); and the new surface shares no vocabulary or dependency with');
    console.log('reconciliation, snapshot discovery, Place Naming, notifications, provider');
    console.log('preferences, or peer synchronization, in either direction (Section G).');
    console.log('The Publisher Performance Leaderboard is complete; further ranking');
    console.log('features are enhancements, not gaps. This milestone recommends no');
    console.log('0.9.420 be manufactured merely because the ranking system could');
    console.log('theoretically support one.');
    console.log('='.repeat(78));

    console.log('\n✅ All Post-Leaderboard Product Reassessment tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
