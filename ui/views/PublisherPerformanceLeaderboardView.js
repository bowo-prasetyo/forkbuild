import { PublicationObservationArchive } from '../../application/PublicationObservationArchive.js';
import { reconstructPublisherLeaderboard } from '../../application/PublisherLeaderboardView.js';

// 0.9.417 — Publisher Performance Leaderboard UI.
//
// 0.9.416's own audit (tests/PublisherPerformanceLeaderboardProductGapAudit
// .test.js) found the ranking capability real and live-tested, and found
// application/PublisherLeaderboardView.js's own reconstructPublisherLeaderboard()
// (0.8.113, UNCHANGED — itself composing application/PublisherRankingPolicy.js's
// own reconstructPublisherRanking(), 0.8.112, UNCHANGED) already the correct
// presentation boundary over it — but reachable by no UI path at all: zero
// UI imports, zero routes, zero contextual entries (that audit's own
// Section D). This milestone closes exactly that reachability gap, and
// nothing else:
//
//   this replica's own PublicationObservationArchive
//                 │
//                 ▼
//   reconstructPublisherLeaderboard()   (0.8.113, UNCHANGED)
//                 │
//                 ▼
//   { policy, entryCount, entries }
//                 │
//                 ▼
//   THIS FILE — renders the ranked rows, verbatim
//
// NO NEW RANKING CALCULATION. This file never sorts, compares, tie-breaks,
// or scores a publisher — its own `leaderboard` computed property below
// calls reconstructPublisherLeaderboard() exactly once and the template
// renders its own `entries`, in its own order, unchanged. See
// application/PublisherRankingPolicy.js's and application/
// PublisherLeaderboardView.js's own headers for why a rank is never
// recomputed above the one place it is decided.
//
// OPTIONS API, NO setup()/inject() FROM 'vue' — the same deliberate shape
// ui/views/ReconciliationWorkspaceView.js's own header explains: a plain
// `data()`/`computed`/`methods` object can be exercised directly
// (`Component.computed.leaderboard.call(ctx)`) with no real Vue runtime, no
// `createApp()`, and no injection context — see this milestone's own test,
// tests/PublisherPerformanceLeaderboardUi.test.js.
//
// THE SAME ARCHIVE-LOADING SEAM EVERY OTHER PAGE ON THIS REPLICA ALREADY
// USES. `publicationObservationArchiveStorage` is injected exactly like
// ui/views/ReconciliationWorkspaceView.js's own copy of the identical
// `inject` block — its own `load()` never throws (storage/
// LocalStoragePublicationObservationArchive.js's own header), so a missing
// or corrupted archive degrades to PublicationObservationArchive.empty()
// and therefore an honest, zero-entry leaderboard — never a crashed page,
// and never a fabricated ranking standing in for data that could not be
// read.
//
// FRESH EVERY TIME — NO STORE, NO CACHE, NO SNAPSHOT, NO SUBSCRIPTION, NO
// POLLING. There is no PublisherPerformanceLeaderboardStore/Cache/Sync/
// Snapshot/Subscription/Polling class anywhere in this file or behind it —
// 0.9.416's own audit (Section G) already proved a leaderboard is
// computable fresh, cheaply, from data the application already has.
// `leaderboard` reads this replica's own archive and recomputes the
// ranking every time it is evaluated — reloading, or re-navigating to this
// route, reflects this replica's own current archive, never a stale one.
//
// PUBLISHER PERFORMANCE LEADERBOARD, NEVER RECONCILIATION LEADERBOARD.
// This file shares no route state, query parameter, reconciliation
// evidence, candidate-selection logic, or peer-archive comparison with
// /reconciliation-leaderboard (ui/views/ReconciliationCandidateLeaderboardView.js)
// — the two pages happen to both read this replica's own
// PublicationObservationArchive (the one durable fact store this whole
// application already has), and happen to both be reached from the same
// "Publication Archive" card on /publications, but neither imports the
// other, and this file never reads a second, peer-supplied archive to
// compare against. See 0.9.416's own Section A for the two concepts' full
// genealogy.
//
// NOT A TOP-NAV DESTINATION. Reached from one contextual link on
// /publications' own "Publication Archive" card — see ui/views/
// DecentralizedPublicationsView.js's own 0.9.417 comment — the identical
// "contextual, not global" shape every other link on that same card
// already uses (/reconciliation-leaderboard, /reconciliation-workspace,
// /publisher-snapshot-claim).
export default {
    name: 'PublisherPerformanceLeaderboardView',
    inject: {
        // The SAME app-wide storage adapter every other archive-reading
        // page already injects — never a second one. Optional
        // (`default: null`) so this component degrades to an honest,
        // empty archive rather than throwing when nothing provides it —
        // the identical shape ui/views/ReconciliationWorkspaceView.js's
        // own `inject` block already uses.
        publicationObservationArchiveStorage: { default: null }
    },
    computed: {
        // The ONE call this file ever makes into the ranking/presentation
        // chain — see this file's own header, "no new ranking
        // calculation." Reads this replica's own archive fresh, every
        // time this is evaluated; never cached across evaluations, never
        // persisted.
        leaderboard() {
            const archive = this.publicationObservationArchiveStorage
                ? this.publicationObservationArchiveStorage.load()
                : PublicationObservationArchive.empty();
            return reconstructPublisherLeaderboard(archive);
        }
    },
    template: `
        <section class="publisher-performance-leaderboard-view">
            <h1>Publisher Performance Leaderboard</h1>
            <p class="reconciliation-leaderboard-note">
                Publishers ranked by their own recorded achievements and publications,
                computed fresh from this replica's own archive every time this page
                loads. This is a presentation of the existing Publisher Ranking
                Policy's own result — never a second ranking system — and nothing
                shown here is persisted.
            </p>
            <p v-if="leaderboard.entryCount === 0" class="empty-state">
                No publishers to rank yet — no publisher has explicitly associated a
                publication in this replica's own archive.
            </p>
            <template v-else>
                <p class="reconciliation-leaderboard-summary">
                    {{ leaderboard.entryCount }} publisher(s) ranked, under Publisher
                    Ranking Policy v{{ leaderboard.policy.version }}
                </p>
                <div class="reconciliation-leaderboard-table-wrap">
                    <table class="reconciliation-leaderboard-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Publisher</th>
                                <th>Achievements</th>
                                <th>Achievement Kinds</th>
                                <th>Publications</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="entry in leaderboard.entries" :key="entry.publisherIdentity.publisherId">
                                <td>{{ entry.rank }}</td>
                                <td>{{ entry.publisherIdentity.publisherId }}</td>
                                <td>{{ entry.achievementCount }}</td>
                                <td>{{ entry.distinctAchievementKindCount }}</td>
                                <td>{{ entry.publicationIdentityCount }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </template>
        </section>
    `
};
