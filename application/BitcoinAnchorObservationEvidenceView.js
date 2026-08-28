import { describeBitcoinAnchorBroadcast } from './BitcoinAnchorBroadcastView.js';
import { describeBitcoinAnchorConfirmationObservationHistory } from './BitcoinAnchorConfirmationObservationHistoryView.js';
import { describeBitcoinAnchorContentProof } from './BitcoinAnchorContentProofView.js';
import { describeBitcoinAnchorChainPlacementObservations } from './BitcoinAnchorChainPlacementObservationView.js';
import { describeBitcoinAnchorObservationConsistency } from './BitcoinAnchorObservationConsistencyView.js';

// 0.8.78 — Bitcoin Anchor Observation Evidence Correlation.
//
// application/BitcoinAnchorObservationEvidence.js's own
// `composeBitcoinAnchorObservationEvidence()` already bundles one anchor's
// five independent facts together. This file is the presentation layer
// for that bundle — mirroring every prior `*View.js` file's own
// "compose existing describe functions, invent no new vocabulary" shape
// exactly, one level up:
//
//   describeBitcoinAnchorObservationEvidence(evidence)
//     -> { anchorId,
//          broadcastObservations:      { count, observations: [...] },
//          confirmationObservations:   { count, observations: [...] },
//          contentProofObservations:   { count, observations: [...] },
//          chainPlacementObservations: { count, comparisons: [...] },
//          consistencyFindings:        { count, findings: [...] } }
//
// A COMPOSITION OF EXISTING VIEWS, NOT A NEW VOCABULARY. Every state
// label this file ever shows is produced by calling an already-existing,
// already-independently-tested `describe*()` function unchanged:
// application/BitcoinAnchorBroadcastView.js#describeBitcoinAnchorBroadcast()
// (0.8.64), application/BitcoinAnchorConfirmationObservationHistoryView.js#
// describeBitcoinAnchorConfirmationObservationHistory() (0.8.56),
// application/BitcoinAnchorContentProofView.js#describeBitcoinAnchorContentProof()
// (0.8.57), application/BitcoinAnchorChainPlacementObservationView.js#
// describeBitcoinAnchorChainPlacementObservations() (0.8.76), and
// application/BitcoinAnchorObservationConsistencyView.js#
// describeBitcoinAnchorObservationConsistency() (0.8.77). This file's own
// new work is exactly two things: (1) carrying each entry's own `index` —
// its 1-based position within THIS anchor's own array, assigned by
// application/BitcoinAnchorObservationEvidence.js, never re-derived here —
// alongside its already-described fields, and (2) placing all five
// sections next to each other under one `anchorId`.
//
// COUNTS ARE DESCRIPTIVE, NEVER SCORES. `count` on every section names
// only how many facts this replica happens to have recorded for this
// anchor in that one category — never a completeness percentage, a
// strength rating, or a step toward any combined verdict. Four
// confirmation observations and one content-proof observation is not
// narrated as "well evidenced"; zero broadcast observations is not
// narrated as a gap or a warning. There is no `overallStatus`,
// `confidence`, `health`, `trusted`, `valid`, `canonical`, `reliable`, or
// verdict field anywhere in this file's output — the identical restraint
// application/BitcoinAnchorObservationEvidence.js's own header already
// holds, one layer down, held here again for its own presentation.
//
// NOTHING IS EVER DISCARDED. Every field an underlying `describe*()`
// function already returns for an observation is carried through
// unchanged; this file only ever adds `index` alongside it.
//
// PURE AND STATELESS. No constructor, no injected collaborator, no
// network access, no caching. Calling this function twice with
// byte-identical arguments returns a byte-identical result.
export function describeBitcoinAnchorObservationEvidence(evidence) {
    if (!evidence) return null;

    return Object.freeze({
        anchorId: evidence.anchorId,
        broadcastObservations: describeBroadcastSection(evidence.broadcastObservations),
        confirmationObservations: describeConfirmationSection(evidence.confirmationObservations),
        contentProofObservations: describeContentProofSection(evidence.contentProofObservations),
        chainPlacementObservations: describeBitcoinAnchorChainPlacementObservations(evidence.chainPlacementObservations),
        consistencyFindings: describeBitcoinAnchorObservationConsistency(evidence.consistencyFindings)
    });
}

function describeBroadcastSection(entries) {
    const list = (Array.isArray(entries) ? entries : []).map((entry) => {
        const described = describeBitcoinAnchorBroadcast(entry.observation);
        return Object.freeze({
            index: entry.index,
            state: described.state,
            stateLabel: described.stateLabel,
            txid: described.txid,
            reason: described.reason,
            broadcastedAt: (entry.observation && entry.observation.broadcastedAt != null) ? entry.observation.broadcastedAt : null
        });
    });
    return Object.freeze({ count: list.length, observations: Object.freeze(list) });
}

function describeConfirmationSection(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const described = describeBitcoinAnchorConfirmationObservationHistory(list.map((entry) => entry.observation)).observations;
    const withIndex = list.map((entry, i) => Object.freeze({ index: entry.index, ...described[i] }));
    return Object.freeze({ count: withIndex.length, observations: Object.freeze(withIndex) });
}

function describeContentProofSection(entries) {
    const list = (Array.isArray(entries) ? entries : []).map((entry) => Object.freeze({
        index: entry.index,
        ...(describeBitcoinAnchorContentProof(entry.observation) || {})
    }));
    return Object.freeze({ count: list.length, observations: Object.freeze(list) });
}
