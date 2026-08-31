import { computed, inject } from 'vue';
import { PublicationObservationArchive } from '../../application/PublicationObservationArchive.js';
import {
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js';
import ReconciliationCandidateLeaderboardTable from '../components/ReconciliationCandidateLeaderboardTable.js';

// 0.8.180 — Reconciliation Candidate Leaderboard UI Integration.
//
// The archive-backed COUNTERPART of
// ui/components/ReconciliationCandidateLeaderboardTable.js's own pure
// rendering: this file is the one place in the running app that actually
// calls 0.8.179's own `reconstructXxx()`, and hands its result straight to
// the table component as a `page` prop, unchanged — the identical
// "reconstructXxx() obtains the fact, describeXxx()/the renderer only ever
// displays it" split every projection in this family already holds.
//
//   sourceArchive ──┐
//                   ├─► 0.8.179 reconstructXxx() ─► page ─► <ReconciliationCandidateLeaderboardTable>
//   targetArchive ──┘
//
// `sourceArchive` IS THIS REPLICA'S OWN REAL, ALREADY-DURABLE ARCHIVE —
// THE SAME `publicationObservationArchiveStorage` EVERY OTHER READ OF THIS
// REPLICA'S OWN RECONCILIATION HISTORY ALREADY GOES THROUGH (see
// ui/views/DecentralizedPublicationsView.js's own 0.8.75 wiring). Loaded
// once, read-only — this view never calls `.save()`, so it can never
// mutate the archive it displays.
//
// `targetArchive` IS HONESTLY EMPTY, NEVER FABRICATED. Comparing this
// replica's own archive against a genuinely DIFFERENT replica's archive
// requires knowing which peer to compare against and fetching their
// evidence — a real "source/target replica selection" feature 0.8.179's
// own Roadmap entry named as separate, later work, not yet built anywhere
// in this app. Until it exists, `targetArchive` is
// `PublicationObservationArchive.empty()` rather than a second copy of
// `sourceArchive` or any other invented stand-in — every count a reader
// sees below is therefore an honest `sourceOnlyCount` (a fact this
// replica alone has recorded), never a fabricated agreement/divergence
// with a peer that was never actually consulted.
//
// PURE WIRING — NO NEW COMPUTATION. This file performs no evidence
// comparison of its own; `page` is exactly 0.8.179's own result,
// unchanged, passed straight through as a prop.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Selecting a peer/target replica to compare against.** See
//   "`targetArchive` is honestly empty," above — real, separately sized,
//   later work.
// - **Refresh/reload behavior.** `sourceArchive` is loaded once, on
//   mount; a reconciliation decision or observation recorded afterward
//   is not reflected without navigating back to this page again.
// - **A top-level navigation entry.** This route is reachable by URL —
//   like `ui/views/ChatView.js`'s own `/chat/:identityId` — but is not
//   yet linked from `ui/App.js`'s own nav bar; that is a product
//   decision for whichever future milestone gives this page a real
//   entry point (e.g. from the Publication Center).
export default {
    name: 'ReconciliationCandidateLeaderboardView',
    components: { ReconciliationCandidateLeaderboardTable },
    setup() {
        const publicationObservationArchiveStorage = inject('publicationObservationArchiveStorage', null);
        const sourceArchive = publicationObservationArchiveStorage
            ? publicationObservationArchiveStorage.load()
            : PublicationObservationArchive.empty();
        const targetArchive = PublicationObservationArchive.empty();

        const page = computed(() => reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, targetArchive));

        return { page };
    },
    template: `
        <section class="reconciliation-leaderboard-view">
            <h1>Reconciliation Candidate Leaderboard</h1>
            <p class="reconciliation-leaderboard-note">
                Decision and observation evidence this replica has recorded for each
                reconciliation candidate, shown separately. Comparing against a peer
                replica's own archive is separate, later work — every count below
                reflects this replica alone.
            </p>
            <ReconciliationCandidateLeaderboardTable :page="page" />
        </section>
    `
};
