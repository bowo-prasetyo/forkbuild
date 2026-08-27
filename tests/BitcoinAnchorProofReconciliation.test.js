import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { BitcoinAnchorConfirmationObserver } from '../anchoring/BitcoinAnchorConfirmationObserver.js';
import { BitcoinOpReturnProofVerifier } from '../anchoring/BitcoinOpReturnProofVerifier.js';
import { BitcoinAnchorProofReconciliationView } from '../application/BitcoinAnchorProofReconciliationView.js';
import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import { BitcoinAnchorContentProofState } from '../application/BitcoinAnchorContentProofState.js';

// 0.8.55 — Bitcoin Anchor Proof Reconciliation.
//
// The flagship this milestone exists to prove: given a real
// `core/PublicationAnchor.js`, `BitcoinAnchorProofReconciliationView` runs
// the REAL `anchoring/BitcoinAnchorConfirmationObserver.js` (0.8.54) and
// the REAL `anchoring/BitcoinOpReturnProofVerifier.js` (0.8.1) — only
// their own network edges (`confirmationSource`/`fetchImpl`) are faked,
// exactly the technique tests/BitcoinAnchorPublicationLifecycle.test.js
// already established — and places their two independent answers side by
// side, never merging them into a verdict.
//
//   Section A: flagship — CONFIRMED + HASH_MATCH, full shape
//   Section B: the legitimate, honestly-reported combination this
//              milestone exists to make visible: CONFIRMED transaction,
//              HASH_MISMATCH content proof — neither hidden, neither
//              resolved into the other
//   Section C: the two facts come from entirely independent sources —
//              transaction UNAVAILABLE (not found by the confirmation
//              source) alongside a HASH_MATCH content proof (found by
//              the block explorer)
//   Section D: a malformed/missing txid never reaches the confirmation
//              observer at all, reported UNAVAILABLE with an honest
//              reason — the content proof is still independently
//              computed
//   Section E: only bitcoin-op-return anchors — a caller-contract
//              violation throws before either collaborator is consulted
//   Section F: the constructor requires both collaborators
//   Section G: every level of the result is frozen
//   Section H: no `valid`/`healthy`/`trusted`/`reliable`/`canonical`/
//              `confidence`/`status` field anywhere in the result —
//              the one rule this milestone exists to enforce
//   Section I: a throwing proof verifier is translated to UNAVAILABLE,
//              never propagated, and never blocks the independent
//              confirmation observation from succeeding
//
// See docs/Roadmap.md, "0.8.55 — Bitcoin Anchor Proof Reconciliation."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectRejects(promise, message) {
    let threw = false;
    try { await promise; } catch (e) { threw = true; }
    assert(threw, message);
}

const TXID = 'a'.repeat(64);
const CONTENT_HASH = '1a2b3c4d';

function opReturnOutput(hexData) {
    return {
        scriptpubkey_type: 'op_return',
        scriptpubkey_asm: `OP_RETURN OP_PUSHBYTES_${hexData.length / 2} ${hexData}`
    };
}

function makeFakeExplorer({ txs = new Map(), tipHeight = 800000, throwOnRequest = false } = {}) {
    async function fetchImpl(url) {
        if (throwOnRequest) throw new Error('simulated connection failure');
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
    return { txs, fetchImpl };
}

function fakeConfirmationSource(handler) {
    const calls = [];
    return {
        calls,
        fetchConfirmation(txid) {
            calls.push(txid);
            return handler(txid, calls.length);
        }
    };
}

function anchor({ txid = TXID, contentHash = CONTENT_HASH, anchorType = 'bitcoin-op-return', network = 'mainnet' } = {}) {
    return new PublicationAnchor({
        publicationId: 'pub-1',
        contentHash,
        anchorType,
        locator: `bitcoin:${txid || 'none'}`,
        proof: { txid, network }
    });
}

// A dedicated builder for Section D, which needs an anchor whose proof
// carries a specific, possibly-`undefined` txid — `anchor()`'s own
// default-parameter destructuring would otherwise silently substitute the
// real TXID the moment `undefined` is passed explicitly.
function anchorWithProofTxid(txid) {
    return new PublicationAnchor({
        publicationId: 'pub-1',
        contentHash: CONTENT_HASH,
        anchorType: 'bitcoin-op-return',
        locator: 'bitcoin:none',
        proof: txid === undefined ? {} : { txid, network: 'mainnet' }
    });
}

function assertNeverCollapsed(obj, path) {
    const forbidden = ['valid', 'healthy', 'trusted', 'reliable', 'canonical', 'confidence', 'status'];
    for (const key of Object.keys(obj)) {
        assert(!forbidden.includes(key), `${path}.${key} must never exist — reconciliation composes facts, it does not score them`);
    }
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — flagship: CONFIRMED + HASH_MATCH, full shape.
    // ---------------------------------------------------------------
    {
        const confirmationSource = fakeConfirmationSource(() => ({
            found: true, confirmed: true, blockHash: 'f'.repeat(64), blockHeight: 900000, confirmationCount: 6
        }));
        const { fetchImpl } = makeFakeExplorer({
            txs: new Map([[TXID, { txid: TXID, vout: [opReturnOutput(CONTENT_HASH)], status: { confirmed: true, block_height: 899995 } }]])
        });
        const view = new BitcoinAnchorProofReconciliationView({
            bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource }),
            bitcoinProofVerifier: new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl })
        });

        const result = await view.reconcile(anchor());
        assert(result.publicationId === 'pub-1', '1. publicationId is carried through');
        assert(result.contentHash === CONTENT_HASH, '2. contentHash is carried through');
        assert(result.transaction.txid === TXID, '3. transaction.txid is the anchor\'s own proof.txid');
        assert(result.transaction.confirmation.state === BitcoinAnchorConfirmationState.CONFIRMED, '4. confirmation reflects the real observer\'s CONFIRMED outcome');
        assert(result.transaction.confirmation.blockHeight === 900000 && result.transaction.confirmation.confirmationCount === 6, '5. block metadata is preserved exactly');
        assert(result.contentProof.state === BitcoinAnchorContentProofState.HASH_MATCH, '6. contentProof reflects the real verifier\'s matching OP_RETURN');
        assert(result.contentProof.contentHash === CONTENT_HASH, '7. contentProof carries its own contentHash');
    }
    console.log('✓ Section A: flagship — CONFIRMED + HASH_MATCH, composed from the real observer and the real verifier');

    // ---------------------------------------------------------------
    // Section B — the legitimate, honestly-reported combination: a
    // CONFIRMED transaction whose OP_RETURN does not carry the claim.
    // ---------------------------------------------------------------
    {
        const confirmationSource = fakeConfirmationSource(() => ({
            found: true, confirmed: true, blockHash: 'e'.repeat(64), blockHeight: 900001, confirmationCount: 3
        }));
        const { fetchImpl } = makeFakeExplorer({
            txs: new Map([[TXID, { txid: TXID, vout: [opReturnOutput('deadbeef')], status: { confirmed: true, block_height: 899999 } }]])
        });
        const view = new BitcoinAnchorProofReconciliationView({
            bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource }),
            bitcoinProofVerifier: new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl })
        });

        const result = await view.reconcile(anchor());
        assert(result.transaction.confirmation.state === BitcoinAnchorConfirmationState.CONFIRMED, '8. the transaction is genuinely confirmed');
        assert(result.contentProof.state === BitcoinAnchorContentProofState.HASH_MISMATCH, '9. the content proof is a definite, independent mismatch');
        assert(typeof result.contentProof.reason === 'string' && result.contentProof.reason.length > 0, '10. the mismatch carries an honest reason');
    }
    console.log('✓ Section B: CONFIRMED + HASH_MISMATCH is reported honestly, neither hidden nor resolved into the other');

    // ---------------------------------------------------------------
    // Section C — the two facts come from entirely independent
    // sources: the confirmation source cannot find the transaction,
    // while the block explorer independently confirms the content proof.
    // ---------------------------------------------------------------
    {
        const confirmationSource = fakeConfirmationSource(() => ({ found: false, reason: 'not found — may not have propagated yet' }));
        const { fetchImpl } = makeFakeExplorer({
            txs: new Map([[TXID, { txid: TXID, vout: [opReturnOutput(CONTENT_HASH)], status: { confirmed: true, block_height: 899995 } }]])
        });
        const view = new BitcoinAnchorProofReconciliationView({
            bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource }),
            bitcoinProofVerifier: new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl })
        });

        const result = await view.reconcile(anchor());
        assert(result.transaction.confirmation.state === BitcoinAnchorConfirmationState.UNAVAILABLE, '11. the confirmation source\'s own "not found" is honestly UNAVAILABLE');
        assert(result.contentProof.state === BitcoinAnchorContentProofState.HASH_MATCH, '12. the content proof, from a wholly separate source, is independently HASH_MATCH');
    }
    console.log('✓ Section C: the two observations are genuinely independent, drawn from separate sources');

    // ---------------------------------------------------------------
    // Section D — a malformed/missing txid never reaches the
    // confirmation observer; the content proof is still computed.
    // ---------------------------------------------------------------
    {
        for (const badTxid of [undefined, null, '', 'not-hex']) {
            const confirmationSource = fakeConfirmationSource(() => ({ found: true, confirmed: true, blockHash: 'a'.repeat(64), blockHeight: 1, confirmationCount: 1 }));
            const { fetchImpl } = makeFakeExplorer();
            const view = new BitcoinAnchorProofReconciliationView({
                bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource }),
                bitcoinProofVerifier: new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl })
            });

            const result = await view.reconcile(anchorWithProofTxid(badTxid));
            assert(result.transaction.confirmation.state === BitcoinAnchorConfirmationState.UNAVAILABLE, `13. a malformed txid (${JSON.stringify(badTxid)}) reports UNAVAILABLE`);
            assert(confirmationSource.calls.length === 0, '14. the confirmation observer is never consulted for a malformed txid');
            assert(result.contentProof.state === BitcoinAnchorContentProofState.HASH_MISMATCH, '15. the content proof side still runs independently, and reports its own definite rejection');
        }
    }
    console.log('✓ Section D: a malformed txid never reaches the confirmation observer, and never blocks the content-proof observation');

    // ---------------------------------------------------------------
    // Section E — only bitcoin-op-return anchors.
    // ---------------------------------------------------------------
    {
        const confirmationSource = fakeConfirmationSource(() => ({ found: false }));
        const { fetchImpl } = makeFakeExplorer();
        const view = new BitcoinAnchorProofReconciliationView({
            bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource }),
            bitcoinProofVerifier: new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl })
        });

        await expectRejects(view.reconcile(anchor({ anchorType: 'ipfs-content' })), '16. a non-bitcoin anchorType throws');
        assert(confirmationSource.calls.length === 0, '17. the confirmation observer is never consulted for a non-bitcoin anchor');
        await expectRejects(view.reconcile(null), '18. a missing anchor throws');
    }
    console.log('✓ Section E: only bitcoin-op-return anchors are ever reconciled — anything else is a caller-contract violation');

    // ---------------------------------------------------------------
    // Section F — the constructor requires both collaborators.
    // ---------------------------------------------------------------
    {
        const confirmationSource = fakeConfirmationSource(() => ({ found: false }));
        const { fetchImpl } = makeFakeExplorer();
        const realObserver = new BitcoinAnchorConfirmationObserver({ confirmationSource });
        const realVerifier = new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl });

        let threwNoObserver = false;
        try { new BitcoinAnchorProofReconciliationView({ bitcoinProofVerifier: realVerifier }); } catch (e) { threwNoObserver = true; }
        assert(threwNoObserver, '19. missing bitcoinAnchorConfirmationObserver throws');

        let threwNoVerifier = false;
        try { new BitcoinAnchorProofReconciliationView({ bitcoinAnchorConfirmationObserver: realObserver }); } catch (e) { threwNoVerifier = true; }
        assert(threwNoVerifier, '20. missing bitcoinProofVerifier throws');
    }
    console.log('✓ Section F: the constructor requires both a confirmation observer and a proof verifier');

    // ---------------------------------------------------------------
    // Section G — every level of the result is frozen.
    // ---------------------------------------------------------------
    {
        const confirmationSource = fakeConfirmationSource(() => ({ found: true, confirmed: false }));
        const { fetchImpl } = makeFakeExplorer();
        const view = new BitcoinAnchorProofReconciliationView({
            bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource }),
            bitcoinProofVerifier: new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl })
        });

        const result = await view.reconcile(anchor());
        assert(Object.isFrozen(result), '21. the top-level result is frozen');
        assert(Object.isFrozen(result.transaction), '22. transaction is frozen');
        assert(Object.isFrozen(result.transaction.confirmation), '23. transaction.confirmation is frozen');
        assert(Object.isFrozen(result.contentProof), '24. contentProof is frozen');
    }
    console.log('✓ Section G: every level of the reconciliation result is frozen');

    // ---------------------------------------------------------------
    // Section H — no field anywhere collapses the two observations
    // into a single verdict.
    // ---------------------------------------------------------------
    {
        const confirmationSource = fakeConfirmationSource(() => ({
            found: true, confirmed: true, blockHash: 'f'.repeat(64), blockHeight: 900000, confirmationCount: 6
        }));
        const { fetchImpl } = makeFakeExplorer({
            txs: new Map([[TXID, { txid: TXID, vout: [opReturnOutput(CONTENT_HASH)], status: { confirmed: true, block_height: 899995 } }]])
        });
        const view = new BitcoinAnchorProofReconciliationView({
            bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource }),
            bitcoinProofVerifier: new BitcoinOpReturnProofVerifier({ apiUrl: 'https://explorer.test/api', fetchImpl })
        });

        const result = await view.reconcile(anchor());
        assertNeverCollapsed(result, 'result');
        assertNeverCollapsed(result.transaction, 'result.transaction');
        assertNeverCollapsed(result.transaction.confirmation, 'result.transaction.confirmation');
        assertNeverCollapsed(result.contentProof, 'result.contentProof');
    }
    console.log('✓ Section H: no valid/healthy/trusted/reliable/canonical/confidence/status field anywhere in the result');

    // ---------------------------------------------------------------
    // Section I — a throwing proof verifier is translated to
    // UNAVAILABLE, never propagated, and never blocks the independent
    // confirmation observation from succeeding.
    // ---------------------------------------------------------------
    {
        const confirmationSource = fakeConfirmationSource(() => ({
            found: true, confirmed: true, blockHash: 'c'.repeat(64), blockHeight: 900002, confirmationCount: 2
        }));
        const throwingVerifier = { anchorType: 'bitcoin-op-return', verify: async () => { throw new Error('simulated verifier crash'); } };
        const view = new BitcoinAnchorProofReconciliationView({
            bitcoinAnchorConfirmationObserver: new BitcoinAnchorConfirmationObserver({ confirmationSource }),
            bitcoinProofVerifier: throwingVerifier
        });

        const result = await view.reconcile(anchor());
        assert(result.contentProof.state === BitcoinAnchorContentProofState.UNAVAILABLE, '25. a throwing verifier is translated to UNAVAILABLE');
        assert(result.contentProof.reason === 'simulated verifier crash', '26. the throw\'s own message is preserved as the reason');
        assert(result.transaction.confirmation.state === BitcoinAnchorConfirmationState.CONFIRMED, '27. the independent confirmation observation still succeeds normally');
    }
    console.log('✓ Section I: a throwing proof verifier never propagates and never blocks the independent confirmation observation');

    console.log('\nAll BitcoinAnchorProofReconciliation tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorProofReconciliation.test.js FAILED:', error);
    process.exitCode = 1;
});
