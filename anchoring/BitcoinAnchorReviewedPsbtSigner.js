import { BitcoinAnchorWalletSigner } from './BitcoinAnchorWalletSigner.js';
import { BitcoinAnchorPsbtSerializer } from './BitcoinAnchorPsbtSerializer.js';

// 0.8.59 — Explicit Bitcoin Anchor Transaction Review UI.
//
// A wallet being CONNECTED is a signing capability, never authorization —
// anchoring/BitcoinWalletConnection.js's own header (0.8.58) already draws
// that line. This class draws the identical line one step later, at the
// point a signature is actually requested: a transaction being REVIEWED is
// a person having seen its own facts, never itself the act of authorizing
// THIS class to sign whatever `description` a caller happens to hand it
// next. Both lines exist for the same reason — a fact about availability
// is not consent.
//
//   application/BitcoinAnchorTransactionReviewView.js
//     describeBitcoinAnchorTransactionReview(description)
//           │
//           ▼
//   { ..., unsignedPsbtHex }        shown to a person on screen
//           │
//           │  (a person looks at it, then a caller later asks to sign)
//           ▼
//   BitcoinAnchorReviewedPsbtSigner.requestSignature(         (THIS FILE
//       { description, reviewedUnsignedPsbtHex })              — new)
//           │
//           ├─ description no longer serializes to
//           │  reviewedUnsignedPsbtHex ──► { signed: false, reason }
//           │  (the wallet is NEVER consulted for this outcome)
//           ▼
//   anchoring/BitcoinAnchorWalletSigner.js#requestSignature()   (0.8.50,
//           │                                                    UNCHANGED)
//           ▼
//   { signed: true, psbt, signedInputs }
// | { signed: false, reason }
// | { signed: false, unavailable: true, reason }
//
// SITS ABOVE BitcoinAnchorWalletSigner.js, NEVER INSIDE IT — THE IDENTICAL
// RESTRAINT 0.8.58 ALREADY HELD TOWARD THIS EXACT CLASS. `anchoring/
// BitcoinAnchorWalletSigner.js` is UNCHANGED by this milestone: still
// constructed with only `{ wallet }`, still never receiving a private key,
// seed, WIF, or wallet password, still independently re-inspecting every
// claimed signature via `anchoring/BitcoinAnchorSignedPsbtInspector.js`
// exactly as before. This class adds exactly ONE precondition in front of
// that unchanged one — never a second, competing signing pathway.
//
// THE ONE INVARIANT THIS CLASS EXISTS TO ENFORCE: a wallet is never asked
// to sign anything other than the exact transaction that was reviewed.
// `requestSignature()` independently re-serializes `description` — via the
// same anchoring/BitcoinAnchorPsbtSerializer.js every other class in this
// pipeline already uses to re-validate what it is handed — and compares the
// resulting hex, byte for byte, against the caller-supplied
// `reviewedUnsignedPsbtHex` (application/
// BitcoinAnchorTransactionReviewView.js's own `unsignedPsbtHex`, from the
// SAME review a person was shown). Any disagreement — a different fee, a
// substituted output, a different UTXO set, a stale review reused against a
// rebuilt plan — is refused BEFORE `wallet.signPsbt()` is ever called. This
// is deliberately stricter than anchoring/BitcoinAnchorSignedPsbtInspector.js's
// own boundary (0.8.50), which only ever checks a signature AFTER a wallet
// has already been asked; this class refuses to even ask.
//
// A MISMATCH IS A DEFINITE REFUSAL, NEVER "UNAVAILABLE." A description that
// no longer matches what was reviewed is not a transient, retriable
// condition — retrying with the SAME mismatched description would refuse
// again, forever. `requestSignature()` reports it as `{ signed: false,
// reason }`, the identical definite-decline shape
// anchoring/BitcoinAnchorWalletSigner.js already uses for a wallet's own
// explicit rejection — never `unavailable: true`.
//
// `reviewedUnsignedPsbtHex` IS A REQUIRED, EXPLICIT ARGUMENT — NEVER
// INFERRED. This class does not remember a previous review, does not read
// application/BitcoinAnchorTransactionReviewView.js itself, and does not
// accept a `description` with no `reviewedUnsignedPsbtHex` at all (a caller
// omitting it is a contract violation and throws, exactly like
// anchoring/BitcoinAnchorWalletSigner.js#requestSignature() throwing on a
// `description` it cannot serialize — there is no such thing as "sign
// without having reviewed anything" through this class). A caller
// constructs the value to compare against by actually calling
// `describeBitcoinAnchorTransactionReview()` first — this class never
// shortcuts that step.
export class BitcoinAnchorReviewedPsbtSigner {
    constructor({ wallet } = {}) {
        this._signer = new BitcoinAnchorWalletSigner({ wallet });
        this._serializer = new BitcoinAnchorPsbtSerializer();
    }

    // Matches every other anchoring/ class's own anchorType exactly — the
    // same external protocol, one more stage of it.
    get anchorType() { return 'bitcoin-op-return'; }

    // Resolves to exactly one of:
    //
    //   { signed: true, psbt, signedInputs }
    //   { signed: false, reason }
    //       — either `description` no longer matches `reviewedUnsignedPsbtHex`
    //         (the wallet is never consulted), or
    //         anchoring/BitcoinAnchorWalletSigner.js's own identical
    //         definite-decline outcome.
    //   { signed: false, unavailable: true, reason }
    //       — anchoring/BitcoinAnchorWalletSigner.js's own identical
    //         cannot-presently-tell outcome. Never reached for a review
    //         mismatch, which is always definite.
    //
    // Throws for a missing `reviewedUnsignedPsbtHex` (see this file's own
    // header) or a malformed `description` — the identical
    // already-known-good-internal-artifact re-validation
    // BitcoinAnchorWalletSigner#requestSignature() itself performs, run
    // here first so a mismatch can be reported before the wallet is ever
    // consulted.
    async requestSignature({ description, reviewedUnsignedPsbtHex } = {}) {
        if (typeof reviewedUnsignedPsbtHex !== 'string' || !reviewedUnsignedPsbtHex) {
            throw new Error('BitcoinAnchorReviewedPsbtSigner: reviewedUnsignedPsbtHex is required — describe the transaction with application/BitcoinAnchorTransactionReviewView.js before ever requesting a signature');
        }

        const { hex: currentUnsignedPsbtHex } = this._serializer.serialize(description);
        if (currentUnsignedPsbtHex !== reviewedUnsignedPsbtHex) {
            return {
                signed: false,
                reason: 'description no longer matches the transaction that was reviewed — signing refused before the wallet was ever consulted'
            };
        }

        return this._signer.requestSignature({ description });
    }
}
