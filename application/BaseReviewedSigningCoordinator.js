import { BaseReviewedSigningState } from './BaseReviewedSigningState.js';
import { CreateBaseReviewedTransactionSignerUseCase } from './CreateBaseReviewedTransactionSignerUseCase.js';

// 0.8.93 — Explicit Base Reviewed Transaction Signing.
//
// `base/BaseReviewedTransactionSigner.js` already carries the ONE
// invariant this milestone exists to expose behind an explicit button: a
// wallet is never asked to sign anything other than the exact plan that
// was reviewed. Nothing about that class changes here — this coordinator
// is a deliberately thin wiring on top of it, turning its three-way
// outcome into the six-value vocabulary `application/
// BaseReviewedSigningState.js` names, mirroring `application/
// BitcoinAnchorReviewedSigningCoordinator.js`'s own header (0.8.62)
// exactly, one chain over:
//
//   { wallet, plan, reviewedTransaction }
//           │
//           │ explicit "Sign Reviewed Transaction" click
//           ▼
//   BaseReviewedSigningCoordinator.sign()                (THIS FILE — new)
//           │
//           ▼
//   base/BaseReviewedTransactionSigner.js#requestSignature()   (THIS
//           │                                                   MILESTONE,
//           │                                                   sibling
//           │                                                   file,
//           │                                                   UNCHANGED
//           │                                                   by this
//           │                                                   class)
//           ▼
//   { signed: true, rawTransaction }              ──► SIGNED
// | { signed: false, unavailable: true, reason }  ──► UNAVAILABLE
// | { signed: false, reason }                     ──► DECLINED
//   (a thrown wallet-contract violation)           ──► FAILED
//
// A FRESH SIGNER FOR EVERY ATTEMPT, NEVER A REMEMBERED ONE. This class
// never holds onto a `wallet` across calls — `sign()` takes `wallet` as an
// explicit argument every time and constructs a brand-new `base/
// BaseReviewedTransactionSigner.js` (via the unchanged `application/
// CreateBaseReviewedTransactionSignerUseCase.js`) for that one call alone.
// A caller that reconnects a different wallet between two signing
// attempts gets exactly that wallet consulted next time — never a stale
// capability from whichever wallet happened to be available when this
// coordinator was first constructed.
//
// NO SIGNING CAPABILITY AVAILABLE IS UNAVAILABLE, NEVER A THROW AND NEVER
// A DECLINE. A person can be signed in with no Base-capable wallet
// extension installed, or one can be uninstalled between a transaction
// being reviewed and "Sign Reviewed Transaction" actually being clicked —
// a real, retriable condition, reported the identical honest way `base/
// BaseInjectedProviderWalletAdapter.js`'s own header already treats "no
// compatible extension detected."
//
// EVERY EXPLICIT CLICK IS ITS OWN, FRESH ATTEMPT — NEVER A RETRY. This
// coordinator performs no internal retry, no automatic reconnect, and no
// automatic re-construction of `plan` for a failed or declined attempt. A
// DECLINED result stays DECLINED; a second "Sign Reviewed Transaction"
// click creates an entirely new, distinct SIGNING → (SIGNED|DECLINED|
// UNAVAILABLE|FAILED) attempt, exactly as `application/
// BitcoinAnchorReviewedSigningCoordinator.js`'s own identical restraint
// already holds one chain over.
//
// DECLINED COVERS TWO DIFFERENT REFUSALS, ON PURPOSE, BECAUSE THE CLASS
// BENEATH THIS ONE ALREADY DOES. `base/
// BaseReviewedTransactionSigner.js`'s own `requestSignature()` reports
// BOTH "the wallet declined" and "the plan no longer matches what was
// reviewed, so the wallet was never even asked" through the identical
// `{ signed: false, reason }` shape. This coordinator does not invent a
// seventh state to split them apart — doing so would require
// re-implementing the mismatch check this class deliberately never
// duplicates. Both reach `application/BaseReviewedSigningState.js`'s own
// DECLINED; the `reason` string, carried through verbatim, is what
// actually tells them apart on screen.
//
// FAILED IS FOR AN UNACCEPTABLE RESULT, NEVER FOR THIS COORDINATOR'S OWN
// CALLER-CONTRACT VIOLATIONS. A missing `plan` or `reviewedTransaction` is
// a UI-layer bug — the caller never reaches this method without first
// having a real review in hand — and is refused by throwing, checked
// before any wallet or signer is ever consulted. Only a throw from the
// SIGNER this class calls — a genuine wallet-contract violation (a wallet
// claiming `signed: true` while returning no `rawTransaction` at all) — is
// caught here and reported as FAILED, so a broken or malicious wallet
// extension never crashes this page.
export class BaseReviewedSigningCoordinator {
    constructor({ createBaseReviewedTransactionSignerUseCase = new CreateBaseReviewedTransactionSignerUseCase() } = {}) {
        this._createSigner = createBaseReviewedTransactionSignerUseCase;
    }

    // Resolves to exactly one of:
    //
    //   { state: SIGNED, rawTransaction, reason: null }
    //   { state: UNAVAILABLE, rawTransaction: null, reason }
    //       — no wallet is connected, or the wallet itself cannot presently
    //         tell whether it can sign.
    //   { state: DECLINED, rawTransaction: null, reason }
    //       — a definite no: the wallet declined, or the plan no longer
    //         matches what was reviewed (the wallet was never consulted
    //         for the latter — see this file's own header).
    //   { state: FAILED, rawTransaction: null, reason }
    //       — the signer produced a result this coordinator refuses to
    //         accept as a real answer.
    //
    // Throws only for a caller-contract violation checked BEFORE a wallet
    // is ever consulted — a missing/malformed `plan` or `reviewedTransaction`
    // — see this file's own header.
    async sign({ wallet, plan, reviewedTransaction } = {}) {
        if (!plan || typeof plan !== 'object') {
            throw new Error('BaseReviewedSigningCoordinator: plan is required — construct and review a Base transaction plan before ever requesting a signature');
        }
        if (!reviewedTransaction || typeof reviewedTransaction !== 'object') {
            throw new Error('BaseReviewedSigningCoordinator: reviewedTransaction is required — review a transaction before ever requesting a signature');
        }

        if (!wallet || typeof wallet.signTransaction !== 'function') {
            return this._outcome(BaseReviewedSigningState.UNAVAILABLE, {
                reason: 'no wallet capable of signing a transaction is currently available'
            });
        }

        const { baseReviewedTransactionSigner } = this._createSigner.execute({ wallet });

        let result;
        try {
            result = await baseReviewedTransactionSigner.requestSignature({ plan, reviewedTransaction });
        } catch (error) {
            return this._outcome(BaseReviewedSigningState.FAILED, { reason: error.message });
        }

        if (result.signed === true) {
            return this._outcome(BaseReviewedSigningState.SIGNED, { rawTransaction: result.rawTransaction });
        }
        if (result.unavailable === true) {
            return this._outcome(BaseReviewedSigningState.UNAVAILABLE, { reason: result.reason });
        }
        return this._outcome(BaseReviewedSigningState.DECLINED, { reason: result.reason });
    }

    _outcome(state, { rawTransaction = null, reason = null } = {}) {
        return Object.freeze({ state, rawTransaction, reason });
    }
}
