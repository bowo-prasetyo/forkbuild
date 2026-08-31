import ReconciliationCandidateEvidenceDetailPanel from './ReconciliationCandidateEvidenceDetailPanel.js';

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
// - **Filtering, pagination, refresh behavior, or a formal ranking/scoring
//   model.** Real, separately sized, later work — only worth naming after
//   this page has actually been seen.
// - **Persistence, synchronization, or archive access of any kind.** This
//   component only ever reads the `page`/`evidenceDetail` props it is
//   handed.
//
// 0.8.182 — Reconciliation Candidate Evidence Detail View adds exactly one
// interaction on top of the above, and nothing else: an "Inspect Evidence"
// button per row that expands a panel showing the actual records behind
// that row's own six counts, rendered by
// `ReconciliationCandidateEvidenceDetailPanel.js`. The detail data itself
// comes from a SECOND, independent prop — `evidenceDetail`, shaped like
// `application/PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetailView.js`'s
// (0.8.182) own `{ candidateCount, candidates }` result — never derived from
// `page` or from this component's own displayed counts; see that file's own
// header for why the two are two independent readings of the identical
// 0.8.176 result rather than one built on the other.
//
// A DISPLAY ROW (0.8.180's OWN `rows`, UNCHANGED) CARRIES NO CANDIDATE
// IDENTITY OF ITS OWN — so a row is matched to its own `evidenceDetail`
// entry in two steps, never by assuming `page.rows` and
// `evidenceDetail.candidates` are the same length or the same order:
// `candidateKeyForIndex()` first reads the display row's own ORIGINAL
// candidate off `genuinePageRows[index]` — `page.rows`, filtered by the
// IDENTICAL predicate `buildLeaderboardRows()` itself already applies, so
// it stays index-aligned with `rows` even if a malformed page row is ever
// filtered out — then `detailFor()` looks that candidate up inside
// `evidenceDetail.candidates` by CANDIDATE IDENTITY
// (`candidateIdentityKey()`, 0.8.147's/0.8.156's/0.8.176's own structural
// key, duplicated here for the identical reason `describeCandidateLabel()`
// already duplicates 0.8.144's own candidate-shape decoding rather than
// importing application/ to get it), via `detailByCandidateKey`. `page` and
// `evidenceDetail` are built by two separate `reconstructXxx()` calls and
// are under no obligation to hold reference-equal `candidate` objects —
// identity, not object identity or array position, is what ties them
// together. Which rows are expanded is this component's own, entirely
// local, presentational state (`expandedKeys`) — it is never persisted,
// never affects `rows`/`page`/`evidenceDetail` themselves, and resets
// whenever this component remounts.

// The complete structural candidate identity key — 0.8.147's/0.8.153's/
// 0.8.156's/0.8.171's/0.8.174's/0.8.176's own key, duplicated here for the
// identical reason `describeCandidateLabel()` already duplicates 0.8.144's
// own candidate-shape decoding: this component imports nothing from
// `application/`.
function candidateIdentityKey(candidate) {
    if (!candidate || typeof candidate !== 'object') return 'UNKNOWN:none';
    if (candidate.type === 'DIVERGENT_CORRESPONDENCE') {
        return `DIVERGENT_CORRESPONDENCE:${candidate.claimId}:${candidate.snapshotIndex}`;
    }
    if (candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT') {
        return `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT:${candidate.claimId}`;
    }
    if (candidate.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM') {
        return `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM:${candidate.snapshotIndex}`;
    }
    return `UNKNOWN:${JSON.stringify(candidate)}`;
}

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

// The one shape check buildLeaderboardRows() applies to a page row before
// mapping it — extracted so `genuinePageRows()` below can apply the
// IDENTICAL filter to `page.rows` and stay index-aligned with the display
// rows `rows` produces, without buildLeaderboardRows() itself needing to
// carry a candidate-identity key onto its own returned shape (unchanged
// from 0.8.180 — see `ReconciliationCandidateLeaderboardUI.test.js`'s own
// exact-field-shape assertion on a display row).
function isGenuinePageRow(row) {
    return Boolean(row) && typeof row === 'object';
}

// buildLeaderboardRows() — the pure transform this component's own
// template renders verbatim. Takes 0.8.179/0.8.178's own `page` result (or
// anything shaped like it) and returns one flat display row per entry in
// `page.rows`, IN THE SAME ORDER, with every count copied straight across.
export function buildLeaderboardRows(page) {
    const sourceRows = page && Array.isArray(page.rows) ? page.rows : [];

    return sourceRows
        .filter(isGenuinePageRow)
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

// detailEntryByKey() — 0.8.182's own `evidenceDetail.candidates` array,
// indexed by candidate identity so a row can look up its own detail entry
// in constant time. Tolerates a malformed/absent `evidenceDetail` the same
// way `buildLeaderboardRows()` tolerates a malformed `page` — degrades to
// an empty map, never throws.
function detailEntryByKey(evidenceDetail) {
    const sourceCandidates = evidenceDetail && Array.isArray(evidenceDetail.candidates) ? evidenceDetail.candidates : [];
    const map = new Map();
    for (const entry of sourceCandidates) {
        if (!entry || typeof entry !== 'object') continue;
        map.set(candidateIdentityKey(entry.candidate), entry);
    }
    return map;
}

export default {
    name: 'ReconciliationCandidateLeaderboardTable',
    components: { ReconciliationCandidateEvidenceDetailPanel },
    props: {
        page: { type: Object, default: null },
        evidenceDetail: { type: Object, default: null }
    },
    data() {
        return {
            // Which rows' detail panels are open — purely local,
            // presentational state, keyed by candidateIdentityKey(). Never
            // persisted, never read by any computed property above this
            // component.
            expandedKeys: {}
        };
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
        },
        // The SAME filter buildLeaderboardRows() itself applies to
        // `page.rows`, kept index-aligned with `rows` above — this is how a
        // display row (which carries no candidate identity of its own,
        // unchanged from 0.8.180) is matched back to its own candidate for
        // evidence-detail lookup, without relying on `page.rows[index]`
        // directly (which is NOT guaranteed index-aligned with `rows` once
        // a malformed entry is filtered out).
        genuinePageRows() {
            const sourceRows = this.page && Array.isArray(this.page.rows) ? this.page.rows : [];
            return sourceRows.filter(isGenuinePageRow);
        },
        detailByCandidateKey() {
            return detailEntryByKey(this.evidenceDetail);
        }
    },
    methods: {
        candidateKeyForIndex(index) {
            const pageRow = this.genuinePageRows[index];
            return candidateIdentityKey(pageRow ? pageRow.candidate : null);
        },
        isExpanded(candidateKey) {
            return Boolean(this.expandedKeys[candidateKey]);
        },
        toggleExpanded(candidateKey) {
            this.expandedKeys[candidateKey] = !this.expandedKeys[candidateKey];
        },
        detailFor(candidateKey) {
            return this.detailByCandidateKey.get(candidateKey) || null;
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
                                <th rowspan="2"></th>
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
                            <template v-for="(row, index) in rows" :key="index">
                                <tr>
                                    <td class="reconciliation-leaderboard-candidate-col">{{ row.candidateLabel }}</td>
                                    <td>{{ row.decisionShared }}</td>
                                    <td>{{ row.decisionSourceOnly }}</td>
                                    <td>{{ row.decisionTargetOnly }}</td>
                                    <td>{{ row.observationShared }}</td>
                                    <td>{{ row.observationSourceOnly }}</td>
                                    <td>{{ row.observationTargetOnly }}</td>
                                    <td>
                                        <button type="button" class="action-btn action-btn--secondary evidence-inspect-btn"
                                                @click="toggleExpanded(candidateKeyForIndex(index))">
                                            {{ isExpanded(candidateKeyForIndex(index)) ? 'Hide Evidence' : 'Inspect Evidence' }}
                                        </button>
                                    </td>
                                </tr>
                                <tr v-if="isExpanded(candidateKeyForIndex(index))" class="evidence-detail-row">
                                    <td colspan="8">
                                        <ReconciliationCandidateEvidenceDetailPanel :detail="detailFor(candidateKeyForIndex(index))" />
                                    </td>
                                </tr>
                            </template>
                        </tbody>
                    </table>
                </div>
            </template>
        </div>
    `
};
