// 0.8.78 — Bitcoin Anchor Observation Evidence Correlation.
//
// Every Bitcoin-domain milestone since 0.8.54 has produced its own,
// independent fact about ONE anchor: application/BitcoinAnchorBroadcastView.js
// (0.8.64) reports a broadcast attempt, application/
// BitcoinAnchorConfirmationObservationHistory.js (0.8.56) reports a
// sequence of confirmation checks, application/BitcoinAnchorContentProofView.js
// (0.8.57) reports a content-proof reconciliation, application/
// BitcoinAnchorChainPlacementObserver.js (0.8.76) reports whether that
// confirmation sequence's own block placement changed, and application/
// BitcoinAnchorObservationConsistencyAnalyzer.js (0.8.77) reports whether
// that same sequence is internally self-contradictory. Each of these five
// facts is shown on its own, independent disclosure today — this file is
// the first to put them side by side, for one anchor, as a single, plain
// evidence bundle:
//
//   Bitcoin Anchor (anchorId)
//   ├── broadcastObservations       (application/BitcoinAnchorBroadcastView.js)
//   ├── confirmationObservations    (application/BitcoinAnchorConfirmationObservationHistory.js)
//   ├── contentProofObservations    (application/BitcoinAnchorContentProofView.js)
//   ├── chainPlacementObservations  (application/BitcoinAnchorChainPlacementObserver.js, 0.8.76)
//   └── consistencyFindings         (application/BitcoinAnchorObservationConsistencyAnalyzer.js, 0.8.77)
//
// CORRELATE EVIDENCE BY EXPLICIT IDENTITY, NEVER BY RESEMBLANCE. This is
// the one rule this entire milestone exists to enforce. `anchorId` is a
// required, explicit, caller-supplied string — the exact identity
// application/PublicationObservationArchive.js (0.8.75) already keys
// `bitcoinConfirmationObservationsByAnchorId`/
// `bitcoinContentProofObservationsByAnchorId` by, and already stamps onto
// every `bitcoinBroadcastRecords` entry — never a value this file derives
// from a `txid`, a `contentHash`, or a `blockHash` carried by any
// observation it is handed. Two anchors can easily share an identical
// `contentHash` (the same content anchored twice, in two separate Bitcoin
// transactions) or, in principle, even share superficially similar
// fields; neither is ever, on its own, evidence of shared anchor
// identity. See docs/Principles.md, "No New Global Identity Scheme" in
// application/PublicationObservationTimelineView.js's own header (0.8.74),
// the identical restraint held here one domain over, for the reasoning in
// full — and the flagship test in tests/BitcoinAnchorObservationEvidence.test.js,
// which constructs exactly this scenario (two anchors, one shared
// contentHash, two different txid values) and proves neither anchor's own
// evidence ever leaks into the other's.
//
// A PURE COMPOSITION OF ALREADY-RECORDED OBSERVATIONS, NEVER A NEW SOURCE
// OF TRUTH. `composeBitcoinAnchorObservationEvidence()` invents no new
// fact of its own. Every observation it is handed — broadcast,
// confirmation, content-proof — is carried through completely unchanged,
// under a `{ index, observation }` wrapper that names only that
// observation's own 1-based position within the array THE CALLER supplied
// for this one anchor (never a position guessed from a different,
// unrelated collection). `chainPlacementObservations`/
// `consistencyFindings` are carried through exactly as application/
// BitcoinAnchorChainPlacementObserver.js#observeBitcoinAnchorChainPlacementChanges()
// (0.8.76) and application/BitcoinAnchorObservationConsistencyAnalyzer.js#
// analyzeBitcoinAnchorObservationConsistency() (0.8.77) themselves already
// produced them — this file never recomputes, re-derives, or second-guesses
// either analysis. A caller that wants those two sections populated calls
// those two, already-independently-tested functions itself, over
// whichever confirmation history it is composing evidence for, and hands
// the results in here unchanged:
//
//   confirmationHistory
//        │
//        ├──► observeBitcoinAnchorChainPlacementChanges()  ──► chainPlacementObservations
//        ├──► analyzeBitcoinAnchorObservationConsistency()  ──► consistencyFindings
//        └──────────────────────────────────────────────────► confirmationObservations
//                                                                      │
//   broadcastObservations ───────────────────────────────────────────►│
//   contentProofObservations ──────────────────────────────────────────► composeBitcoinAnchorObservationEvidence()
//
// That keeps 0.8.76 and 0.8.77 exactly as independently testable as they
// already were — this file adds no hidden "super analyzer" over them, and
// no combined `status`, `confidence`, `health`, `trusted`, `valid`,
// `canonical`, `reliable`, or verdict field of any kind over the five
// sections it bundles together. See docs/Principles.md, "The UI Displays
// Observations; It Does Not Turn Them Into A Verdict (0.8.57)," held here
// once more, one layer up: five independently produced facts sit next to
// each other, unscored and uncombined, exactly as this milestone's own
// proposal named up front — "the result should remain a collection of
// independently produced facts."
//
// A MISSING COLLECTION IS AN HONEST EMPTY COLLECTION, NEVER AN ERROR OR A
// FABRICATED ENTRY. An anchor with no broadcast attempt this replica ever
// observed (a discovered, already-catalogued claim from another replica —
// see application/PublicationObservationTimelineView.js's own header, "an
// anchor with no broadcastedAt contributes no broadcast entry") simply
// gets `broadcastObservations: { count: 0, observations: [] }`; an anchor
// with no confirmation checks yet gets the identical empty shape for
// `confirmationObservations`, and so on. Nothing here throws, and nothing
// here invents a placeholder entry to fill a gap.
//
// NEVER MUTATES, NEVER APPENDS, NEVER PERSISTS, NEVER QUERIES BITCOIN OR
// ESPLORA. This function only ever reads its own arguments; it does not
// import `appendBitcoinAnchorConfirmationObservationHistoryEntry()`, does
// not import anything from application/PublicationObservationArchive.js or
// storage/, and returns a brand-new, frozen result every call. Calling it
// twice with byte-identical arguments returns a byte-identical result.
export function composeBitcoinAnchorObservationEvidence({
    anchorId,
    broadcastObservations = [],
    confirmationObservations = [],
    contentProofObservations = [],
    chainPlacementObservations = null,
    consistencyFindings = null
} = {}) {
    if (typeof anchorId !== 'string' || !anchorId) {
        throw new Error(
            'composeBitcoinAnchorObservationEvidence: anchorId is required, as an explicit string — '
            + 'evidence is never composed by inferring an anchor identity from a txid, a contentHash, '
            + 'a blockHash, or a position in some other collection'
        );
    }

    return Object.freeze({
        anchorId,
        broadcastObservations: indexedEntries(broadcastObservations),
        confirmationObservations: indexedEntries(confirmationObservations),
        contentProofObservations: indexedEntries(contentProofObservations),
        chainPlacementObservations: chainPlacementObservations || EMPTY_CHAIN_PLACEMENT_OBSERVATIONS,
        consistencyFindings: consistencyFindings || EMPTY_CONSISTENCY_FINDINGS
    });
}

const EMPTY_CHAIN_PLACEMENT_OBSERVATIONS = Object.freeze({ count: 0, comparisons: Object.freeze([]) });
const EMPTY_CONSISTENCY_FINDINGS = Object.freeze({ count: 0, findings: Object.freeze([]) });

function indexedEntries(list) {
    const items = (Array.isArray(list) ? list : []).filter(Boolean);
    return Object.freeze(items.map((observation, i) => Object.freeze({ index: i + 1, observation })));
}
