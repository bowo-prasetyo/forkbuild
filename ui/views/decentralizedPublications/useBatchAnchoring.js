import { reactive } from 'vue';
import { ExternalAnchorCreationOutcome } from '../../../application/anchoring/ExternalAnchorCreationOutcome.js';
import { describeCreationAttempt } from '../../../application/anchoring/PublicationAnchorCreationView.js';
import { CREATION_BADGE_CLASSES, humanizeAnchorType } from './presentation.js';

// Anchoring several publications with one external recording (one wallet
// approval), for each anchorType whose publisher can (Steem today). The
// person picks the publications; one click anchors them all, each gets its
// own signed anchor, and the shared block is watched until it is final.
export function useBatchAnchoring({ creationCoordinator, entries, loadEvidence, watchFinality, describeFinality }) {
    const batchAnchorTypes = creationCoordinator && typeof creationCoordinator.batchAnchorTypes === 'function'
        ? creationCoordinator.batchAnchorTypes()
        : [];
    // By anchorType: which publications are picked, and the latest attempt.
    const batchAnchoring = reactive(Object.fromEntries(batchAnchorTypes.map(({ anchorType }) => [anchorType, { selected: {}, attempt: null }])));

    function batchSelectedIds(anchorType) {
        const state = batchAnchoring[anchorType];
        return state ? entries.filter((entry) => state.selected[entry.publication.id]).map((entry) => entry.publication.id) : [];
    }

    function batchLimit(anchorType) {
        const found = batchAnchorTypes.find((type) => type.anchorType === anchorType);
        return found && found.maxBatchSize ? found.maxBatchSize : Infinity;
    }

    // Picks every listed publication without an anchor of this type yet, up
    // to the limit.
    function selectUnanchoredForBatch(anchorType) {
        const state = batchAnchoring[anchorType];
        if (!state) return;
        let picked = 0;
        for (const entry of entries) {
            const unanchored = !entry.evidenceAnchors.some((anchor) => anchor.anchorType === anchorType);
            const pick = unanchored && picked < batchLimit(anchorType);
            state.selected[entry.publication.id] = pick;
            if (pick) picked += 1;
        }
    }

    function clearBatchSelection(anchorType) {
        if (batchAnchoring[anchorType]) batchAnchoring[anchorType].selected = {};
    }

    function hasAnchorOfType(entry, anchorType) {
        return entry.evidenceAnchors.some((anchor) => anchor.anchorType === anchorType);
    }

    async function createBatchAnchors(anchorType) {
        const state = batchAnchoring[anchorType];
        const ids = batchSelectedIds(anchorType);
        if (!state || ids.length === 0 || ids.length > batchLimit(anchorType)) return;
        state.attempt = { creating: true, outcome: null, anchors: [], reason: null, error: null, finality: null, count: ids.length };
        try {
            const result = await creationCoordinator.createBatch(ids, anchorType);
            state.attempt = { creating: false, outcome: result.outcome, anchors: result.anchors, reason: result.reason, error: null, finality: null, count: ids.length };
            if (result.outcome === ExternalAnchorCreationOutcome.CREATED) {
                for (const entry of entries) {
                    if (ids.includes(entry.publication.id)) {
                        loadEvidence(entry);
                        entry.evidenceExpanded = true;
                    }
                }
                // Every anchor of a batch names the same transaction.
                if (result.anchors.length > 0) watchFinality(state.attempt, anchorType, result.anchors[0].proof);
                state.selected = {};
            }
        } catch (error) {
            state.attempt = { creating: false, outcome: null, anchors: [], reason: null, error: error.message, finality: null, count: ids.length };
        }
    }

    // The shared creation states (creating, created, rejected, unavailable,
    // failed), with a batch-specific message on success.
    function batchCreationView(anchorType) {
        const attempt = batchAnchoring[anchorType] && batchAnchoring[anchorType].attempt;
        const view = describeCreationAttempt(attempt ? { ...attempt, anchor: attempt.anchors[0] || null } : null);
        if (attempt && attempt.outcome === ExternalAnchorCreationOutcome.CREATED) {
            const locator = attempt.anchors[0] ? attempt.anchors[0].locator : '';
            return { ...view, message: `${attempt.anchors.length} publication${attempt.anchors.length === 1 ? '' : 's'} anchored with one ${humanizeAnchorType(anchorType)} transaction (${locator}). Each has its own signed anchor in its evidence list.` };
        }
        return view;
    }

    function batchCreationBadgeClass(anchorType) {
        return CREATION_BADGE_CLASSES[batchCreationView(anchorType).state] || null;
    }

    function batchFinality(anchorType) {
        const attempt = batchAnchoring[anchorType] && batchAnchoring[anchorType].attempt;
        return describeFinality(anchorType, attempt);
    }

    function batchButtonLabel(anchorType) {
        const attempt = batchAnchoring[anchorType] && batchAnchoring[anchorType].attempt;
        if (attempt && attempt.creating) return 'Anchoring…';
        const count = batchSelectedIds(anchorType).length;
        return `Anchor ${count} Publication${count === 1 ? '' : 's'} on ${humanizeAnchorType(anchorType)}`;
    }

    function batchButtonDisabled(anchorType) {
        const attempt = batchAnchoring[anchorType] && batchAnchoring[anchorType].attempt;
        const count = batchSelectedIds(anchorType).length;
        return Boolean(attempt && attempt.creating) || count === 0 || count > batchLimit(anchorType);
    }

    return {
        batchAnchorTypes, batchAnchoring, batchSelectedIds, batchLimit, selectUnanchoredForBatch, clearBatchSelection,
        hasAnchorOfType, createBatchAnchors, batchCreationView, batchCreationBadgeClass, batchFinality, batchButtonLabel,
        batchButtonDisabled
    };
}
