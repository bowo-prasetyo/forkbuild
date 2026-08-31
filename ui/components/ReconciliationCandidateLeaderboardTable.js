// 0.8.180 — Reconciliation Candidate Leaderboard UI Integration.
//
// 0.8.179 wired two archives all the way through to a page-ready result —
// `{ isEmpty, rowCount, rows }` — but stopped there on purpose: "turning
// that data into pixels a reader actually sees remains separate work," its
// own header said. This file is that separate work, and nothing more:
//
//   0.8.179 Archive-Backed Page
//             │
//             ▼
//   { isEmpty, rowCount, rows }
//             │
//             ▼
//   0.8.180 THIS FILE — a projection renderer
//             │
//             ▼
//   Reconciliation Candidate Leaderboard (on screen)
//
// A PROJECTION RENDERER, NOT A SECOND AUTHORITY. `buildLeaderboardRows()`
// below reads `page.rows` exactly as 0.8.178/0.8.179 already produced it —
// one row in, one display row out, in the SAME order — and copies each
// count straight across (`decisionEvidence.sharedCount` ->
// `decisionShared`, and so on). No count is added, dropped, combined,
// recomputed, or turned into a score. There is no `sort()`, no `filter()`
// beyond the same defensive shape check 0.8.178 itself already performs
// one layer down, and no candidate ranking anywhere in this file — "0.8.179
// says what to display, 0.8.180 decides how to display it," never the
// other way around.
//
// `describeCandidateLabel()` — THE ONE GENUINELY NEW DECISION THIS
// MILESTONE MAKES. Every projection beneath this file left a row's
// `candidate` field exactly as 0.8.144 first shaped it — a plain
// `{ type, claimId? , snapshotIndex? }` record, never decoded into words a
// reader can actually read on a page (see 0.8.178's own header, "Candidate
// identity is referenced, never copied or interpreted"). A real page
// cannot print `[object Object]`, so this file — and only this file —
// decodes the three candidate shapes 0.8.144 already established into a
// short, neutral label. This is presentation formatting, not domain
// judgment: it names which claim/snapshot a row is about, never whether
// that candidate is correct, preferred, or in need of resolution.
//
// DECISION EVIDENCE AND OBSERVATION EVIDENCE STAY IN SEPARATE COLUMN
// GROUPS, NEVER MERGED — 0.8.176's own flagship principle, held here again
// four layers up. Neither `buildLeaderboardRows()` nor the template below
// sums, averages, or otherwise combines a row's decision counts with its
// observation counts.
//
// "EVIDENCE LEADERBOARD," NOT A RANKED LEADERBOARD. The table header reads
// Candidate / Decision Evidence / Observation Evidence — never Rank / Score
// / Status. Rows render in `page.rows`' own order (`v-for`, keyed by
// index, no `sort()`), so a reader sees candidates in the exact order
// 0.8.176 first discovered them, not an order implying one candidate beat
// another.
//
// MALFORMED/ABSENT `page` DEGRADES TO THE EMPTY STATE — NEVER THROWS.
// `buildLeaderboardRows()` tolerates a `page` that is `null`, `undefined`,
// or missing a genuine `rows` array the same way 0.8.178 tolerates a
// malformed read model: it degrades to `[]` rather than throwing. The
// component's own `isEmpty` computed property mirrors this — `page.isEmpty`
// when `page` is genuine, `true` otherwise — so a caller that hands this
// component nothing still sees a clear "no candidates" message rather than
// a broken page.
//
// PURE PRESENTATION — NO COMPUTATION, NO ARCHIVE ACCESS, NO MUTATION.
// This file imports nothing from `application/` — exactly the "zero
// imports" architectural discipline 0.8.178 itself established two layers
// down, held here again at the very top of the chain: a caller that wants
// this table fed from real archives composes 0.8.179's own `reconstructXxx()`
// itself (see `ui/views/ReconciliationCandidateLeaderboardView.js`) and
// hands the result down as the `page` prop — this component never reaches
// for an archive on its own.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A score, rank, ordering by evidence weight, or any comparison
//   between two candidates' own evidence.** See "Evidence leaderboard,"
//   above.
// - **A `winner`, `correct`/`incorrect`, `valid`, `preferred`, `status`,
//   or `confidence` column of any kind.**
// - **Filtering, a candidate detail/inspection panel, pagination, refresh
//   behavior, or a formal ranking/scoring model.** Real, separately sized,
//   later work — only worth naming after this page has actually been seen.
// - **Persistence, synchronization, or archive access of any kind.** This
//   component only ever reads the `page` prop it is handed.

export function describeCandidateLabel(candidate) {
    if (!candidate || typeof candidate !== 'object') return 'Unknown candidate';

    if (candidate.type === 'DIVERGENT_CORRESPONDENCE') {
        return `Claim ${candidate.claimId} ↔ Snapshot #${candidate.snapshotIndex}`;
    }
    if (candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT') {
        return `Claim ${candidate.claimId} (no corresponding Snapshot)`;
    }
    if (candidate.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM') {
        return `Snapshot #${candidate.snapshotIndex} (no corresponding Claim)`;
    }
    return 'Unknown candidate';
}

function safeCount(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

// buildLeaderboardRows() — the pure transform this component's own
// template renders verbatim. Takes 0.8.179/0.8.178's own `page` result (or
// anything shaped like it) and returns one flat display row per entry in
// `page.rows`, IN THE SAME ORDER, with every count copied straight across.
export function buildLeaderboardRows(page) {
    const sourceRows = page && Array.isArray(page.rows) ? page.rows : [];

    return sourceRows
        .filter((row) => Boolean(row) && typeof row === 'object')
        .map((row) => Object.freeze({
            candidateLabel: describeCandidateLabel(row.candidate),
            decisionShared: safeCount(row.decisionEvidence && row.decisionEvidence.sharedCount),
            decisionSourceOnly: safeCount(row.decisionEvidence && row.decisionEvidence.sourceOnlyCount),
            decisionTargetOnly: safeCount(row.decisionEvidence && row.decisionEvidence.targetOnlyCount),
            observationShared: safeCount(row.observationEvidence && row.observationEvidence.sharedCount),
            observationSourceOnly: safeCount(row.observationEvidence && row.observationEvidence.sourceOnlyCount),
            observationTargetOnly: safeCount(row.observationEvidence && row.observationEvidence.targetOnlyCount)
        }));
}

export default {
    name: 'ReconciliationCandidateLeaderboardTable',
    props: {
        page: { type: Object, default: null }
    },
    computed: {
        rows() {
            return buildLeaderboardRows(this.page);
        },
        isEmpty() {
            return Boolean(!this.page || this.page.isEmpty);
        },
        rowCount() {
            return this.page && typeof this.page.rowCount === 'number' ? this.page.rowCount : 0;
        }
    },
    template: `
        <div class="reconciliation-leaderboard">
            <p v-if="isEmpty" class="empty-state">No reconciliation candidates to display.</p>
            <template v-else>
                <p class="reconciliation-leaderboard-summary">{{ rowCount }} candidate(s)</p>
                <div class="reconciliation-leaderboard-table-wrap">
                    <table class="reconciliation-leaderboard-table">
                        <thead>
                            <tr>
                                <th rowspan="2" class="reconciliation-leaderboard-candidate-col">Candidate</th>
                                <th colspan="3">Decision Evidence</th>
                                <th colspan="3">Observation Evidence</th>
                            </tr>
                            <tr>
                                <th>Shared</th>
                                <th>Source-only</th>
                                <th>Target-only</th>
                                <th>Shared</th>
                                <th>Source-only</th>
                                <th>Target-only</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(row, index) in rows" :key="index">
                                <td class="reconciliation-leaderboard-candidate-col">{{ row.candidateLabel }}</td>
                                <td>{{ row.decisionShared }}</td>
                                <td>{{ row.decisionSourceOnly }}</td>
                                <td>{{ row.decisionTargetOnly }}</td>
                                <td>{{ row.observationShared }}</td>
                                <td>{{ row.observationSourceOnly }}</td>
                                <td>{{ row.observationTargetOnly }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </template>
        </div>
    `
};
