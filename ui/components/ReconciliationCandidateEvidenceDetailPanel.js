// 0.8.182 — Reconciliation Candidate Evidence Detail Panel.
//
// The Leaderboard table (0.8.180) shows a candidate's own evidence as six
// numbers. This component is the panel that opens underneath one candidate's
// row and shows the actual records those numbers count — decision detail and
// observation detail, each split Shared / Source-only / Target-only, in
// application/PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetailView.js's
// (0.8.182) own order.
//
// A PROJECTION RENDERER, NOT A SECOND AUTHORITY — THE IDENTICAL DISCIPLINE
// 0.8.180's OWN TABLE COMPONENT ALREADY HOLDS. This file imports nothing
// from `application/`: it takes a `detail` prop shaped exactly like one
// entry of 0.8.182's own `candidates` array (`{ decisionDetail,
// observationDetail }`) and renders it verbatim — no count is recomputed
// from a list's own `.length`, no record is reordered, and no record is
// dropped. A caller that wants this panel fed from a real archive composes
// 0.8.182's own `reconstructXxx()` itself (see
// `ui/views/ReconciliationCandidateLeaderboardView.js`) and hands the
// matching candidate's own detail entry down as the `detail` prop — this
// component never reaches for an archive on its own.
//
// DECISION EVIDENCE AND OBSERVATION EVIDENCE STAY IN SEPARATE SECTIONS,
// NEVER MERGED — 0.8.176's own flagship principle, held here again five
// layers up.
//
// `candidateMatchesPlan` IS DISPLAYED AS A FACT, NEVER INTERPRETED. This
// panel prints "yes"/"no" for `candidatePresent`/`candidateMatchesPlan` —
// it never renders the word "stale," "invalid," or "needs attention" for
// `candidateMatchesPlan: false`. `planFingerprint` is shown so a reader can
// see WHICH explicit plan an observation was checked against, without this
// panel ever claiming one plan is authoritative over another.
//
// RECORD ORDER IS RENDERED EXACTLY AS SUPPLIED — NO `sort()` ANYWHERE IN
// THIS FILE. Two records that look similar (same candidate, same decision,
// different plan; or same candidate, same plan, different `observedAt`)
// render as two separate list items, never collapsed into one.
//
// MALFORMED/ABSENT `detail` DEGRADES TO AN EMPTY PANEL — NEVER THROWS.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A score, rank, or any judgment about which record is "better."**
// - **Editing, deleting, or acting on a record from this panel.** This
//   remains a read-only inspection surface, exactly like the leaderboard
//   table it opens underneath.
// - **Persistence, synchronization, or archive access of any kind.**

function isGenuineDetail(value) {
    return Boolean(value) && typeof value === 'object';
}

function safeList(value) {
    return Array.isArray(value) ? value : [];
}

function formatWhen(isoString) {
    return typeof isoString === 'string' && isoString.length > 0 ? isoString : 'unknown time';
}

function formatYesNo(value) {
    return value === true ? 'yes' : 'no';
}

// A plan fingerprint is a 64-character SHA-256 hex digest — long enough
// that printing it in full would dwarf every other column. Showing its own
// first 12 characters is a display convenience only; the full value is
// still the one 0.8.182 forwarded onto the record, unchanged, for any
// caller that needs the exact fingerprint (e.g. `===` comparison).
function shortFingerprint(planFingerprint) {
    return typeof planFingerprint === 'string' && planFingerprint.length > 0
        ? `${planFingerprint.slice(0, 12)}…`
        : 'unknown plan';
}

export function buildDecisionEntries(records) {
    return safeList(records)
        .filter((record) => Boolean(record) && typeof record === 'object')
        .map((record) => Object.freeze({
            disposition: typeof record.decision === 'string' ? record.decision : 'UNKNOWN',
            decidedAt: formatWhen(record.decidedAt)
        }));
}

export function buildObservationEntries(records) {
    return safeList(records)
        .filter((record) => Boolean(record) && typeof record === 'object')
        .map((record) => {
            const decision = record.decision && typeof record.decision === 'object' ? record.decision : null;
            const planIdentity = record.planIdentity && typeof record.planIdentity === 'object' ? record.planIdentity : null;
            return Object.freeze({
                disposition: decision && typeof decision.decision === 'string' ? decision.decision : 'UNKNOWN',
                observedAt: formatWhen(record.observedAt),
                planFingerprint: shortFingerprint(planIdentity ? planIdentity.planFingerprint : null),
                candidatePresent: formatYesNo(record.candidatePresent),
                candidateMatchesPlan: formatYesNo(record.candidateMatchesPlan)
            });
        });
}

export default {
    name: 'ReconciliationCandidateEvidenceDetailPanel',
    props: {
        detail: { type: Object, default: null }
    },
    computed: {
        decisionDetail() {
            return isGenuineDetail(this.detail) && isGenuineDetail(this.detail.decisionDetail) ? this.detail.decisionDetail : null;
        },
        observationDetail() {
            return isGenuineDetail(this.detail) && isGenuineDetail(this.detail.observationDetail) ? this.detail.observationDetail : null;
        },
        decisionShared() {
            return buildDecisionEntries(this.decisionDetail && this.decisionDetail.shared);
        },
        decisionSourceOnly() {
            return buildDecisionEntries(this.decisionDetail && this.decisionDetail.sourceOnly);
        },
        decisionTargetOnly() {
            return buildDecisionEntries(this.decisionDetail && this.decisionDetail.targetOnly);
        },
        observationShared() {
            return buildObservationEntries(this.observationDetail && this.observationDetail.shared);
        },
        observationSourceOnly() {
            return buildObservationEntries(this.observationDetail && this.observationDetail.sourceOnly);
        },
        observationTargetOnly() {
            return buildObservationEntries(this.observationDetail && this.observationDetail.targetOnly);
        }
    },
    template: `
        <div class="evidence-detail-panel">
            <div class="evidence-detail-group">
                <h4 class="evidence-detail-group-title">Decision Evidence</h4>
                <div class="evidence-detail-columns">
                    <div class="evidence-detail-column">
                        <h5>Shared ({{ decisionShared.length }})</h5>
                        <p v-if="decisionShared.length === 0" class="evidence-detail-empty">None</p>
                        <ul v-else class="evidence-detail-list">
                            <li v-for="(entry, index) in decisionShared" :key="'ds-' + index">{{ entry.disposition }} — decided {{ entry.decidedAt }}</li>
                        </ul>
                    </div>
                    <div class="evidence-detail-column">
                        <h5>Source-only ({{ decisionSourceOnly.length }})</h5>
                        <p v-if="decisionSourceOnly.length === 0" class="evidence-detail-empty">None</p>
                        <ul v-else class="evidence-detail-list">
                            <li v-for="(entry, index) in decisionSourceOnly" :key="'dso-' + index">{{ entry.disposition }} — decided {{ entry.decidedAt }}</li>
                        </ul>
                    </div>
                    <div class="evidence-detail-column">
                        <h5>Target-only ({{ decisionTargetOnly.length }})</h5>
                        <p v-if="decisionTargetOnly.length === 0" class="evidence-detail-empty">None</p>
                        <ul v-else class="evidence-detail-list">
                            <li v-for="(entry, index) in decisionTargetOnly" :key="'dto-' + index">{{ entry.disposition }} — decided {{ entry.decidedAt }}</li>
                        </ul>
                    </div>
                </div>
            </div>

            <div class="evidence-detail-group">
                <h4 class="evidence-detail-group-title">Observation Evidence</h4>
                <div class="evidence-detail-columns">
                    <div class="evidence-detail-column">
                        <h5>Shared ({{ observationShared.length }})</h5>
                        <p v-if="observationShared.length === 0" class="evidence-detail-empty">None</p>
                        <ul v-else class="evidence-detail-list">
                            <li v-for="(entry, index) in observationShared" :key="'os-' + index">
                                {{ entry.disposition }} — observed {{ entry.observedAt }} — plan {{ entry.planFingerprint }} — present: {{ entry.candidatePresent }} — matches plan: {{ entry.candidateMatchesPlan }}
                            </li>
                        </ul>
                    </div>
                    <div class="evidence-detail-column">
                        <h5>Source-only ({{ observationSourceOnly.length }})</h5>
                        <p v-if="observationSourceOnly.length === 0" class="evidence-detail-empty">None</p>
                        <ul v-else class="evidence-detail-list">
                            <li v-for="(entry, index) in observationSourceOnly" :key="'oso-' + index">
                                {{ entry.disposition }} — observed {{ entry.observedAt }} — plan {{ entry.planFingerprint }} — present: {{ entry.candidatePresent }} — matches plan: {{ entry.candidateMatchesPlan }}
                            </li>
                        </ul>
                    </div>
                    <div class="evidence-detail-column">
                        <h5>Target-only ({{ observationTargetOnly.length }})</h5>
                        <p v-if="observationTargetOnly.length === 0" class="evidence-detail-empty">None</p>
                        <ul v-else class="evidence-detail-list">
                            <li v-for="(entry, index) in observationTargetOnly" :key="'oto-' + index">
                                {{ entry.disposition }} — observed {{ entry.observedAt }} — plan {{ entry.planFingerprint }} — present: {{ entry.candidatePresent }} — matches plan: {{ entry.candidateMatchesPlan }}
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `
};
