import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { BitcoinAnchorConfirmationObserver } from '../anchoring/BitcoinAnchorConfirmationObserver.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
import { BitcoinAnchorProofReconciliationView } from '../application/BitcoinAnchorProofReconciliationView.js';
import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import { BitcoinAnchorContentProofState } from '../application/BitcoinAnchorContentProofState.js';
import { appendBitcoinAnchorConfirmationObservationHistoryEntry } from '../application/BitcoinAnchorConfirmationObservationHistory.js';
import {
    describeBitcoinAnchorConfirmationObservationHistoryDetails,
    describeBitcoinAnchorConfirmationObservationDetail
} from '../application/BitcoinAnchorConfirmationObservationHistoryDetailView.js';
import { describeBitcoinAnchorContentProofStateLabel, describeBitcoinAnchorContentProof } from '../application/BitcoinAnchorContentProofView.js';

// 0.8.57 — Bitcoin Anchor Proof & Confirmation Inspection UI.
//
// This milestone adds no new domain behavior — 0.8.54 (confirmation
// observation), 0.8.55 (proof reconciliation), and 0.8.56 (confirmation
// history) already built every fact this test exercises. What this
// milestone adds is ui/views/DecentralizedPublicationsView.js's own
// "Bitcoin Anchor" section, and its own `reconcileBitcoinAnchor()`,
// `bitcoinAnchorReconciliationView()`, and `bitcoinAnchorConfirmationHistoryView()`
// functions — thin composition over exactly the classes this test drives
// directly, the same "test the composed application layer a Vue component
// calls, never the component itself" boundary tests/
// PublicationAnchorCreationUX.test.js already established for the 0.8.11
// Publication Center. This file proves that composition is sound, and
// that combining it produces nothing the individual pieces did not already
// promise.
//
// The one new file this milestone adds to `application/` —
// application/BitcoinAnchorContentProofView.js — is exercised directly in
// Section D; everything else in this file drives the REAL, unchanged
// 0.8.54/0.8.55/0.8.56 classes exactly the way ui/views/
// DecentralizedPublicationsView.js#reconcileBitcoinAnchor() does.
//
//   Section A: FLAGSHIP — the milestone's own deliberately awkward
//              scenario: NOT_CONFIRMED + HASH_MATCH, then CONFIRMED (same
//              content proof), both observations landing in the append-only
//              confirmation history in order; a third, UNAVAILABLE
//              observation never rewrites the earlier CONFIRMED entry.
//   Section B: reconciliation can report CONFIRMED + HASH_MISMATCH at the
//              same time — the UI's own `bitcoinAnchorReconciliationView()`
//              shape never resolves that into one verdict.
//   Section C: the confirmation history and the content-proof observation
//              stay genuinely separate — appending confirmation
//              observations never touches, needs, or reads contentProof.
//   Section D: application/BitcoinAnchorContentProofView.js names all
//              three content-proof states honestly, and adds no field
//              beyond `stateLabel`.
//   Section E: no confidence/reliability/score/status/valid/healthy field
//              anywhere the UI's own composition touches.
//
// See docs/Roadmap.md, "0.8.57 — Bitcoin Anchor Proof & Confirmation
// Inspection UI."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const TXID = 'b'.repeat(64);
const CONTENT_HASH = 'cafef00d';

function opReturnOutput(hexData) {
    return {
        scriptpubkey_type: 'op_return',
        scriptpubkey_asm: `OP_RETURN OP_PUSHBYTES_${hexData.length / 2} ${hexData}`
    };
}

function makeFakeExplorer({ txs = new Map(), tipHeight = 900010 } = {}) {
    async function fetchImpl(url) {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith('/blocks/tip/height')) {
            return new Response(String(tipHeight), { status: 200 });
        }
        const match = parsed.pathname.match(/\/tx\/([0-9a-f]+)$/i);
        if (match) {
            const tx = txs.get(match[1]);
            if (!tx) return new Response('not found', { status: 404 });
            return new Response(JSON.stringify(tx), { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    return { fetchImpl };
}

// A scripted confirmation source — each call to fetchConfirmation()
// advances to the next scripted answer, mirroring the "one explicit click,
// one fresh network read" discipline anchoring/
// BitcoinAnchorConfirmationObserver.js's own header requires. Mirrors
// tests/BitcoinAnchorProofReconciliation.test.js's own fakeConfirmationSource().
function scriptedConfirmationSource(answers) {
    let call = 0;
    return {
        fetchConfirmation() {
            const answer = answers[Math.min(call, answers.length - 1)];
            call += 1;
            return answer;
        }
    };
}

function anchorFor(contentHash) {
    return new PublicationAnchor({
        publicationId: 'pub-alice',
        contentHash,
        anchorType: 'bitcoin-op-return',
        locator: `bitcoin:${TXID}`,
        proof: { txid: TXID, network: 'mainnet' }
    });
}

// Mirrors ui/views/DecentralizedPublicationsView.js#reconcileBitcoinAnchor()
// exactly: one reconcile() call, its result replacing the "current"
// reconciliation, and its own transaction.confirmation separately appended
// to the confirmation history — never the other way around, and never a
// second network call.
async function clickReconcile(view, anchor, history) {
    const result = await view.reconcile(anchor);
    const nextHistory = appendBitcoinAnchorConfirmationObservationHistoryEntry(history, result.transaction.confirmation);
    return { result, history: nextHistory };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP
    // ---------------------------------------------------------------
    {
        const anchor = anchorFor(CONTENT_HASH);
        // The block explorer anchoring/BitcoinOpReturnProofVerifier.js
        // reads from already sees this transaction confirmed — content
        // proof only ever reads a confirmed transaction's own outputs (see
        // that class's own header). The confirmation OBSERVER, immediately
        // below, is a genuinely SEPARATE source asked a separate question,
        // and click 1 deliberately has it answer NOT_CONFIRMED anyway —
        // exactly the "two facts, two independent sources" shape tests/
        // BitcoinAnchorProofReconciliation.test.js's own Section C already
        // proves legitimate.
        const { fetchImpl } = makeFakeExplorer({
            txs: new Map([[TXID, { txid: TXID, vout: [opReturnOutput(CONTENT_HASH)], status: { confirmed: true, block_height: 920000 } }]])
        });
        const bitcoinProofVerifier = new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl });

        // Click 1 — the confirmation OBSERVER reports NOT_CONFIRMED; the
        // content proof, independently, already matches.
        const confirmationSource1 = scriptedConfirmationSource([{ found: true, confirmed: false }]);
        const view1 = new BitcoinAnchorProofReconciliationView({
            bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource: confirmationSource1 }),
            bitcoinProofVerifier
        });
        let history = [];
        let click1;
        ({ result: click1, history } = await clickReconcile(view1, anchor, history));
        assert(click1.transaction.confirmation.state === BitcoinAnchorConfirmationState.NOT_CONFIRMED, '1. first click: NOT_CONFIRMED');
        assert(click1.contentProof.state === BitcoinAnchorContentProofState.HASH_MATCH, '2. first click: content proof is independently HASH_MATCH');
        assert(history.length === 1, '3. confirmation history now holds exactly one entry');

        // Click 2 — the SAME transaction, now mined. The content proof is
        // asked again too (reconcile() always asks both), unchanged.
        const confirmationSource2 = scriptedConfirmationSource([
            { found: true, confirmed: true, blockHash: 'd'.repeat(64), blockHeight: 920123, confirmationCount: 6 }
        ]);
        const view2 = new BitcoinAnchorProofReconciliationView({
            bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource: confirmationSource2 }),
            bitcoinProofVerifier
        });
        let click2;
        ({ result: click2, history } = await clickReconcile(view2, anchor, history));
        assert(click2.transaction.confirmation.state === BitcoinAnchorConfirmationState.CONFIRMED, '4. second click: CONFIRMED');
        assert(click2.transaction.confirmation.blockHeight === 920123 && click2.transaction.confirmation.confirmationCount === 6, '5. block metadata is preserved');
        assert(history.length === 2, '6. the history now holds BOTH observations, appended, never replaced');

        // The full narration, oldest first — exactly the chronological
        // order "Show Confirmation History" renders.
        const narrated = describeBitcoinAnchorConfirmationObservationHistoryDetails(history);
        assert(narrated.count === 2, '7. two history entries');
        assert(narrated.entries[0].state === BitcoinAnchorConfirmationState.NOT_CONFIRMED, '8. entry 0 is still the first, NOT_CONFIRMED, click');
        assert(narrated.entries[1].state === BitcoinAnchorConfirmationState.CONFIRMED, '9. entry 1 is the second, CONFIRMED, click — oldest first, never reordered');

        // Click 3 — the confirmation source becomes unreachable. A brand
        // new, honestly UNAVAILABLE entry joins the history; the earlier
        // CONFIRMED entry from click 2 is untouched.
        const confirmationSource3 = { fetchConfirmation: async () => { throw new Error('simulated network timeout'); } };
        const view3 = new BitcoinAnchorProofReconciliationView({
            bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource: confirmationSource3 }),
            bitcoinProofVerifier
        });
        const historyBeforeClick3 = history;
        const confirmedEntryBeforeClick3 = history[1];
        let click3;
        ({ result: click3, history } = await clickReconcile(view3, anchor, history));
        assert(click3.transaction.confirmation.state === BitcoinAnchorConfirmationState.UNAVAILABLE, '10. third click: UNAVAILABLE, never a silent retry of the earlier CONFIRMED fact');
        assert(history.length === 3, '11. the history now holds all three observations');
        assert(history[1] === confirmedEntryBeforeClick3, '12. the earlier CONFIRMED entry is the SAME frozen object — never rewritten or replaced');
        assert(historyBeforeClick3.length === 2, '13. the array handed into the append call is itself untouched — appendBitcoinAnchorConfirmationObservationHistoryEntry() never mutates its input');

        const finalNarration = describeBitcoinAnchorConfirmationObservationHistoryDetails(history);
        assert(finalNarration.entries.map((e) => e.state).join(',')
            === [BitcoinAnchorConfirmationState.NOT_CONFIRMED, BitcoinAnchorConfirmationState.CONFIRMED, BitcoinAnchorConfirmationState.UNAVAILABLE].join(','),
            '14. the final history narrates all three observations, in the order they actually happened');

        // Per-observation inspection — application/
        // BitcoinAnchorConfirmationObservationHistoryDetailView.js's own
        // describeBitcoinAnchorConfirmationObservationDetail(), the SAME
        // function ui/views/DecentralizedPublicationsView.js#
        // bitcoinAnchorReconciliationView() projects for "right now."
        const currentDetail = describeBitcoinAnchorConfirmationObservationDetail(click3.transaction.confirmation);
        assert(currentDetail.stateShortLabel === 'Unavailable', '15. the current reconciliation\'s own confirmation projects the identical short label a history row would show');
    }
    console.log('✓ Section A (FLAGSHIP): NOT_CONFIRMED -> CONFIRMED -> UNAVAILABLE, each click\'s confirmation appended to history in order; an earlier CONFIRMED entry is never rewritten by a later UNAVAILABLE one');

    // ---------------------------------------------------------------
    // Section B — CONFIRMED transaction + HASH_MISMATCH content proof,
    // simultaneously, with no verdict field resolving the two.
    // ---------------------------------------------------------------
    {
        const anchor = anchorFor(CONTENT_HASH);
        const { fetchImpl } = makeFakeExplorer({
            // The OP_RETURN carries a DIFFERENT hash than the anchor claims.
            txs: new Map([[TXID, { txid: TXID, vout: [opReturnOutput('deadbeef')], status: { confirmed: true, block_height: 920100 } }]])
        });
        const confirmationSource = scriptedConfirmationSource([
            { found: true, confirmed: true, blockHash: 'e'.repeat(64), blockHeight: 920123, confirmationCount: 12 }
        ]);
        const view = new BitcoinAnchorProofReconciliationView({
            bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource }),
            bitcoinProofVerifier: new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl })
        });

        const result = await view.reconcile(anchor);
        assert(result.transaction.confirmation.state === BitcoinAnchorConfirmationState.CONFIRMED, '16. the transaction is genuinely, deeply confirmed');
        assert(result.contentProof.state === BitcoinAnchorContentProofState.HASH_MISMATCH, '17. the content proof is, independently, a definite mismatch');

        // The exact shape ui/views/DecentralizedPublicationsView.js#
        // bitcoinAnchorReconciliationView() builds for display — two
        // sibling keys, never merged.
        const uiView = {
            confirmation: describeBitcoinAnchorConfirmationObservationDetail(result.transaction.confirmation),
            contentProof: describeBitcoinAnchorContentProof(result.contentProof)
        };
        assert(uiView.confirmation.stateLabel === 'Transaction confirmed', '18. confirmation reads as its own honest sentence');
        assert(uiView.contentProof.stateLabel === 'Hash does not match OP_RETURN', '19. content proof reads as its own honest, SEPARATE sentence');
        for (const forbidden of ['valid', 'healthy', 'trusted', 'anchorHealth', 'verdict', 'overall']) {
            assert(!(forbidden in uiView), `20. the combined display object never carries a "${forbidden}" field`);
            assert(!(forbidden in uiView.confirmation), `21. confirmation never carries a "${forbidden}" field`);
            assert(!(forbidden in uiView.contentProof), `22. contentProof never carries a "${forbidden}" field`);
        }
    }
    console.log('✓ Section B: CONFIRMED + HASH_MISMATCH displays honestly, side by side — the UI never collapses the two into a verdict');

    // ---------------------------------------------------------------
    // Section C — the confirmation history and content-proof
    // observation stay genuinely separate.
    // ---------------------------------------------------------------
    {
        const anchor = anchorFor(CONTENT_HASH);
        const { fetchImpl } = makeFakeExplorer({
            txs: new Map([[TXID, { txid: TXID, vout: [opReturnOutput(CONTENT_HASH)], status: { confirmed: true, block_height: 920000 } }]])
        });
        const confirmationSource = scriptedConfirmationSource([
            { found: true, confirmed: false },
            { found: true, confirmed: true, blockHash: 'f'.repeat(64), blockHeight: 920200, confirmationCount: 1 }
        ]);
        const view = new BitcoinAnchorProofReconciliationView({
            bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource }),
            bitcoinProofVerifier: new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl })
        });

        let history = [];
        let first;
        ({ result: first, history } = await clickReconcile(view, anchor, history));
        let second;
        ({ result: second, history } = await clickReconcile(view, anchor, history));

        // Only two confirmation entries ever accumulate — no third,
        // "content proof history" entry rides along with them; this
        // milestone builds no such history at all (see this file's own
        // header).
        assert(history.length === 2, '23. exactly two confirmation observations accumulated, one per reconcile() click');
        assert(!('contentProof' in history[0]) && !('contentProof' in history[1]), '24. a confirmation history entry never carries a contentProof field of its own');
        assert(first.contentProof.state === BitcoinAnchorContentProofState.HASH_MATCH && second.contentProof.state === BitcoinAnchorContentProofState.HASH_MATCH,
            '25. each click\'s own contentProof is still independently available on that click\'s own result, just never accumulated into a history');
    }
    console.log('✓ Section C: confirmation history and content-proof observation stay genuinely separate — no unified "Bitcoin Anchor History"');

    // ---------------------------------------------------------------
    // Section D — application/BitcoinAnchorContentProofView.js names all
    // three content-proof states honestly.
    // ---------------------------------------------------------------
    {
        assert(describeBitcoinAnchorContentProofStateLabel(BitcoinAnchorContentProofState.HASH_MATCH) === 'Hash matches OP_RETURN', '26. HASH_MATCH label');
        assert(describeBitcoinAnchorContentProofStateLabel(BitcoinAnchorContentProofState.HASH_MISMATCH) === 'Hash does not match OP_RETURN', '27. HASH_MISMATCH label');
        assert(describeBitcoinAnchorContentProofStateLabel(BitcoinAnchorContentProofState.UNAVAILABLE) === 'Content proof unavailable', '28. UNAVAILABLE label');
        assert(describeBitcoinAnchorContentProofStateLabel('not-a-real-state') === null, '29. an unrecognized state names nothing, rather than guessing');
        assert(describeBitcoinAnchorContentProof(null) === null, '30. no observation yet -> null, never a fabricated "unavailable" fact');

        const observed = new Date();
        const projected = describeBitcoinAnchorContentProof({ state: BitcoinAnchorContentProofState.HASH_MATCH, contentHash: CONTENT_HASH, reason: null, observedAt: observed });
        assert(projected.contentHash === CONTENT_HASH && projected.observedAt === observed, '31. every existing field is carried through unchanged');
        assert(Object.keys(projected).sort().join(',') === ['contentHash', 'observedAt', 'reason', 'state', 'stateLabel'].sort().join(','),
            '32. describeBitcoinAnchorContentProof() adds exactly one new field — stateLabel — and nothing else');
        assert(Object.isFrozen(projected), '33. the projected result is frozen');
    }
    console.log('✓ Section D: application/BitcoinAnchorContentProofView.js names all three states honestly, and adds no field beyond stateLabel');

    // ---------------------------------------------------------------
    // Section E — no confidence/reliability/score/status field anywhere.
    // ---------------------------------------------------------------
    {
        const forbidden = ['confidence', 'reliability', 'score', 'status', 'valid', 'healthy', 'trusted', 'anchorHealth'];
        const label = describeBitcoinAnchorContentProof({ state: BitcoinAnchorContentProofState.UNAVAILABLE, contentHash: null, reason: 'x', observedAt: new Date() });
        for (const key of forbidden) {
            assert(!(key in label), `34. describeBitcoinAnchorContentProof()'s own result never carries a "${key}" field`);
        }
    }
    console.log('✓ Section E: no confidence/reliability/score/status/valid/healthy field anywhere this milestone\'s own composition touches');

    console.log('\nAll BitcoinAnchorProofConfirmationInspectionUX tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorProofConfirmationInspectionUX.test.js FAILED:', error);
    process.exitCode = 1;
});
