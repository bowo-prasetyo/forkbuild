import { BitcoinAnchorReviewedSigningState } from './BitcoinAnchorReviewedSigningState.js';
import { CreateBitcoinAnchorReviewedPsbtSignerUseCase } from './CreateBitcoinAnchorReviewedPsbtSignerUseCase.js';

// 0.8.62 — Explicit Reviewed Bitcoin Anchor Signing UI.
//
// anchoring/BitcoinAnchorReviewedPsbtSigner.js (0.8.59) already carries the
// ONE invariant this milestone exists to expose behind an explicit button:
// a wallet is never asked to sign anything other than the exact transaction
// that was reviewed. Nothing about that class changes here — this
// coordinator is a deliberately thin wiring on top of it, turning its
// three-way outcome into the six-value vocabulary application/
// BitcoinAnchorReviewedSigningState.js names, exactly as application/
// BitcoinAnchorTransactionConstructionCoordinator.js (0.8.61) already does
// for anchoring/BitcoinAnchorTransactionBuilder.js one stage earlier:
//
//   { wallet, description, reviewedUnsignedPsbtHex }
//           │
//           │ explicit "Sign Reviewed Transaction" click
//           ▼
//   BitcoinAnchorReviewedSigningCoordinator.sign()          (THIS FILE — new)
//           │
//           ▼
//   anchoring/BitcoinAnchorReviewedPsbtSigner.js#requestSignature()   (0.8.59,
//           │                                                          UNCHANGED)
//           ▼
//   { signed: true, psbt, signedInputs }        ──► SIGNED
// | { signed: false, unavailable: true, reason } ──► UNAVAILABLE
// | { signed: false, reason }                    ──► DECLINED
//   (a thrown wallet-contract violation)          ──► FAILED
//
// A FRESH SIGNER FOR EVERY ATTEMPT, NEVER A REMEMBERED ONE. This class
// never holds onto a `wallet` across calls — `sign()` takes `wallet` as an
// explicit argument every time and constructs a brand-new anchoring/
// BitcoinAnchorReviewedPsbtSigner.js (via the unchanged 0.8.59 application/
// CreateBitcoinAnchorReviewedPsbtSignerUseCase.js) for that one call alone.
// A caller that reconnects a different wallet, or a different account,
// between two signing attempts gets exactly that wallet consulted next time
// — never a stale capability from whichever wallet happened to be connected
// when this coordinator was first constructed. See anchoring/
// BitcoinWalletConnection.js's own header, "A CAPABILITY, NEVER A SECRET,"
// on why nothing in this codebase persists a wallet reference longer than
// it has to.
//
// NO WALLET CONNECTED IS UNAVAILABLE, NEVER A THROW AND NEVER A DECLINE. A
// person can disconnect a wallet, or one can drop out from under a page,
// between a transaction being reviewed and "Sign Reviewed Transaction"
// actually being clicked — a real, retriable condition, reported the
// identical honest way anchoring/BitcoinWalletConnection.js's own header
// already treats "no compatible extension detected."
//
// DECLINED COVERS TWO DIFFERENT REFUSALS, ON PURPOSE, BECAUSE THE CLASS
// BENEATH THIS ONE ALREADY DOES. anchoring/BitcoinAnchorReviewedPsbtSigner.js's
// own `requestSignature()` reports BOTH "the wallet declined" and "the
// description no longer matches what was reviewed, so the wallet was never
// even asked" through the identical `{ signed: false, reason }` shape (see
// that file's own header, "A MISMATCH IS A DEFINITE REFUSAL, NEVER
// 'UNAVAILABLE'"). This coordinator does not invent a seventh state to
// split them apart — doing so would require re-implementing the mismatch
// check this class deliberately never duplicates. Both reach
// application/BitcoinAnchorReviewedSigningState.js's own DECLINED; the
// `reason` string, carried through verbatim, is what actually tells them
// apart on screen.
//
// FAILED IS FOR AN UNACCEPTABLE RESULT, NEVER FOR THIS COORDINATOR'S OWN
// CALLER-CONTRACT VIOLATIONS. A missing `description` or
// `reviewedUnsignedPsbtHex` is a UI-layer bug — the caller never reaches
// this method without first having a real review in hand — and is refused
// by throwing, checked before any wallet or signer is ever consulted,
// mirroring exactly how application/
// BitcoinAnchorTransactionConstructionCoordinator.js#construct() itself
// throws for its own missing arguments. Only a throw from the SIGNER this
// class calls — a genuine wallet-contract violation anchoring/
// BitcoinAnchorWalletSigner.js's own header already names (a wallet
// claiming `signed: true` while returning no PSBT at all) — is caught here
// and reported as FAILED, so a broken or malicious wallet extension never
// crashes this page.
export class BitcoinAnchorReviewedSigningCoordinator {
    constructor({ createBitcoinAnchorReviewedPsbtSignerUseCase = new CreateBitcoinAnchorReviewedPsbtSignerUseCase() } = {}) {
        this._createSigner = createBitcoinAnchorReviewedPsbtSignerUseCase;
    }

    // Resolves to exactly one of:
    //
    //   { state: SIGNED, psbt, signedInputs, reason: null }
    //   { state: UNAVAILABLE, psbt: null, signedInputs: null, reason }
    //       — no wallet is connected, or the wallet itself cannot presently
    //         tell whether it can sign.
    //   { state: DECLINED, psbt: null, signedInputs: null, reason }
    //       — a definite no: the wallet declined, or the transaction no
    //         longer matches what was reviewed (the wallet was never
    //         consulted for the latter — see this file's own header).
    //   { state: FAILED, psbt: null, signedInputs: null, reason }
    //       — the signer produced a result this coordinator refuses to
    //         accept as a real answer.
    //
    // Throws only for a caller-contract violation checked BEFORE a wallet
    // is ever consulted — a missing/empty `description` or
    // `reviewedUnsignedPsbtHex` — see this file's own header.
    async sign({ wallet, description, reviewedUnsignedPsbtHex } = {}) {
        if (!description || typeof description !== 'object') {
            throw new Error('BitcoinAnchorReviewedSigningCoordinator: description is required — review a transaction before ever requesting a signature');
        }
        if (typeof reviewedUnsignedPsbtHex !== 'string' || !reviewedUnsignedPsbtHex) {
            throw new Error('BitcoinAnchorReviewedSigningCoordinator: reviewedUnsignedPsbtHex is required — review a transaction before ever requesting a signature');
        }

        if (!wallet || typeof wallet.signPsbt !== 'function') {
            return this._outcome(BitcoinAnchorReviewedSigningState.UNAVAILABLE, {
                reason: 'no wallet is currently connected — connect a wallet before requesting a signature'
            });
        }

        const { bitcoinAnchorReviewedPsbtSigner } = this._createSigner.execute({ wallet });

        let result;
        try {
            result = await bitcoinAnchorReviewedPsbtSigner.requestSignature({ description, reviewedUnsignedPsbtHex });
        } catch (error) {
            return this._outcome(BitcoinAnchorReviewedSigningState.FAILED, { reason: error.message });
        }

        if (result.signed === true) {
            return this._outcome(BitcoinAnchorReviewedSigningState.SIGNED, { psbt: result.psbt, signedInputs: result.signedInputs });
        }
        if (result.unavailable === true) {
            return this._outcome(BitcoinAnchorReviewedSigningState.UNAVAILABLE, { reason: result.reason });
        }
        return this._outcome(BitcoinAnchorReviewedSigningState.DECLINED, { reason: result.reason });
    }

    _outcome(state, { psbt = null, signedInputs = null, reason = null } = {}) {
        return Object.freeze({ state, psbt, signedInputs, reason });
    }
}
