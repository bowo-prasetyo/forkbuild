import { BaseTransactionSigner } from './BaseTransactionSigner.js';
import { describeBasePublicationTransactionReview } from '../application/BasePublicationTransactionReview.js';

// 0.8.93 — Explicit Base Reviewed Transaction Signing.
//
// A wallet being connected is a signing capability, never authorization —
// `base/BaseWalletConnection.js`'s own header (0.8.90) already draws that
// line. This class draws the identical line one step later, at the point a
// signature is actually requested: a transaction being REVIEWED is a
// person having seen its own facts, never itself the act of authorizing
// THIS class to sign whatever `plan` a caller happens to hand it next.
// Mirrors `anchoring/BitcoinAnchorReviewedPsbtSigner.js`'s own header
// (0.8.59) exactly, one chain over.
//
//   application/BasePublicationTransactionReview.js
//     describeBasePublicationTransactionReview(plan)
//           │
//           ▼
//   { network, chainId, from, to, value, nonce, gasLimit,
//     maxFeePerGas, maxPriorityFeePerGas,
//     contentHash, transactionData }        shown to a person on screen
//           │
//           │  (a person looks at it, then a caller later asks to sign)
//           ▼
//   BaseReviewedTransactionSigner.requestSignature(            (THIS FILE
//       { plan, reviewedTransaction })                          — new)
//           │
//           ├─ plan no longer describes the SAME transaction as
//           │  reviewedTransaction ──► { signed: false, reason }
//           │  (the wallet is NEVER consulted for this outcome)
//           ▼
//   base/BaseTransactionSigner.js#requestSignature()      (THIS MILESTONE,
//           │                                               sibling file,
//           │                                               UNCHANGED by
//           │                                               this class)
//           ▼
//   { signed: true, rawTransaction }
// | { signed: false, reason }
// | { signed: false, unavailable: true, reason }
//
// SITS ABOVE BaseTransactionSigner.js, NEVER INSIDE IT — THE IDENTICAL
// RESTRAINT `anchoring/BitcoinAnchorReviewedPsbtSigner.js`'s own header
// already holds toward `anchoring/BitcoinAnchorWalletSigner.js`.
// `base/BaseTransactionSigner.js` is unchanged by this class — still
// constructed with only `{ wallet }`, still never receiving a private
// key. This class adds exactly ONE precondition in front of it — never a
// second, competing signing pathway.
//
// THE ONE INVARIANT THIS CLASS EXISTS TO ENFORCE: a wallet is never asked
// to sign anything other than the exact plan that was reviewed.
// `requestSignature()` independently re-derives
// `describeBasePublicationTransactionReview(plan)` — the SAME 0.8.92
// projection a person was actually shown — and compares it, field by
// field, against the caller-supplied `reviewedTransaction`. Any
// disagreement — a different fee, a substituted destination, a
// regenerated nonce, a stale review reused against a rebuilt plan — is
// refused BEFORE `wallet.signTransaction()` is ever called.
//
// A MISMATCH IS A DEFINITE REFUSAL, NEVER "UNAVAILABLE." A plan that no
// longer matches what was reviewed is not a transient, retriable
// condition — retrying with the SAME mismatched plan would refuse again,
// forever. `requestSignature()` reports it as `{ signed: false, reason }`,
// the identical definite-decline shape `base/BaseTransactionSigner.js`
// already uses for a wallet's own explicit rejection — never
// `unavailable: true`.
//
// `reviewedTransaction` IS A REQUIRED, EXPLICIT ARGUMENT — NEVER INFERRED.
// This class does not remember a previous review, does not read
// `ui/views/DecentralizedPublicationsView.js` itself, and does not accept
// a `plan` with no `reviewedTransaction` at all (a caller omitting it is a
// contract violation and throws — there is no such thing as "sign without
// having reviewed anything" through this class). A caller constructs the
// value to compare against by actually calling
// `describeBasePublicationTransactionReview()` first — this class never
// shortcuts that step, mirroring `anchoring/
// BitcoinAnchorReviewedPsbtSigner.js`'s own identical restraint toward its
// own `reviewedUnsignedPsbtHex`.
export class BaseReviewedTransactionSigner {
    constructor({ wallet } = {}) {
        this._signer = new BaseTransactionSigner({ wallet });
    }

    // Resolves to exactly one of:
    //
    //   { signed: true, rawTransaction }
    //   { signed: false, reason }
    //       — either `plan` no longer matches `reviewedTransaction` (the
    //         wallet is never consulted), or `base/
    //         BaseTransactionSigner.js`'s own identical definite-decline
    //         outcome.
    //   { signed: false, unavailable: true, reason }
    //       — `base/BaseTransactionSigner.js`'s own identical
    //         cannot-presently-tell outcome. Never reached for a review
    //         mismatch, which is always definite.
    //
    // Throws for a missing `reviewedTransaction` (see this file's own
    // header) or a malformed `plan` — the identical already-known-good-
    // internal-artifact re-validation `describeBasePublicationTransactionReview()`
    // itself performs, run here first so a mismatch can be reported before
    // the wallet is ever consulted.
    async requestSignature({ plan, reviewedTransaction } = {}) {
        if (!reviewedTransaction || typeof reviewedTransaction !== 'object') {
            throw new Error('BaseReviewedTransactionSigner: reviewedTransaction is required — review the transaction with application/BasePublicationTransactionReview.js before ever requesting a signature');
        }

        const currentReview = describeBasePublicationTransactionReview(plan);
        if (!reviewsMatch(currentReview, reviewedTransaction)) {
            return {
                signed: false,
                reason: 'plan no longer matches the transaction that was reviewed — signing refused before the wallet was ever consulted'
            };
        }

        return this._signer.requestSignature({ plan });
    }
}

const REVIEW_FIELDS = [
    'network', 'chainId', 'from', 'to', 'value', 'nonce',
    'gasLimit', 'maxFeePerGas', 'maxPriorityFeePerGas',
    'contentHash', 'transactionData'
];

function reviewsMatch(a, b) {
    return REVIEW_FIELDS.every((field) => a[field] === b[field]);
}
