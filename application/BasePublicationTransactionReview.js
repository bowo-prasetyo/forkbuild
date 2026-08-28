import { decodeBasePublicationCommitment } from './BasePublicationCommitmentEncoding.js';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_PATTERN = /^\d+$/;

// 0.8.92 — Explicit Base Transaction Review.
//
// 0.8.91 gave this codebase a real, immutable, UNSIGNED Base transaction
// plan — `application/BasePublicationTransactionPlanCoordinator.js#construct()`'s
// own `construction.plan`. Nothing since has ever turned that plan into
// what a PERSON needs to see before authorizing it. This file is that
// missing projection, and nothing more — mirroring `application/
// BitcoinAnchorTransactionReviewView.js`'s own header (0.8.59) exactly,
// one chain over:
//
//   { network, chainId, from, to, value, data,
//     nonce, gasLimit, maxFeePerGas, maxPriorityFeePerGas }   an already-
//                                                              CONSTRUCTED
//                                                              PLAN (0.8.91)
//           │
//           ▼
//   describeBasePublicationTransactionReview()          (THIS FILE — new)
//           │
//           ▼
//   { network, chainId, from, to, value,
//     nonce, gasLimit, maxFeePerGas, maxPriorityFeePerGas,
//     contentHash, transactionData }
//
// REVIEW IS A PRESENTATION BOUNDARY, NOT ANOTHER TRANSACTION-PROCESSING
// STAGE. This function performs no RPC call, re-estimates no gas, re-reads
// no fee, and re-derives no nonce — every field it returns is read
// straight off the exact `plan` a caller already holds from a successful
// 0.8.91 construction. Calling it twice with the byte-identical `plan`
// returns a byte-identical result; calling it against an OLDER plan after
// a NEWER one has since been constructed still returns the older plan's
// own frozen figures, never anything the network reports right now — the
// review is of the ARTIFACT, never of the network's current opinion about
// it. This is the exact discipline `docs/Principles.md`, "A Transaction
// Plan Is Not A Publication (0.8.91)," already established for
// construction, held here one stage later: reviewing a plan that was
// already frozen must not quietly become a second, silent observation.
//
// THE COMMITMENT IS MADE VISIBLE, NOT JUST CARRIED THROUGH. `contentHash`
// is `plan.data` decoded back through `decodeBasePublicationCommitment()`
// — the EXACT inverse of the SAME codec `base/
// BasePublicationTransactionPlanner.js` used to encode it in the first
// place (`application/BasePublicationCommitmentEncoding.js`, 0.8.91,
// unchanged). This is a genuine, independent re-validation of `plan.data`,
// not a courtesy copy — the identical role `anchoring/
// BitcoinAnchorPsbtSerializer.js#serialize()` already plays inside
// `describeBitcoinAnchorTransactionReview()` one chain over. `transactionData`
// is `plan.data` itself, verbatim, so a person can see the exact
// correspondence between the two: a raw commitment, and the raw bytes
// that carry it, never hidden behind one generic "payload" label.
//
// FROM AND TO ARE BOTH SHOWN, EXPLICITLY, AS TWO SEPARATE FIELDS. This
// milestone's own architectural point: `base/
// BasePublicationTransactionPlanner.js`'s self-transfer decision (`to` is
// always the identical address as `from`) is a fact a person should be
// able to SEE, not a fact this file interprets FOR them. This function
// computes no `isSelfTransfer` boolean and phrases no "this is a
// self-transfer" sentence of its own — `from === to` is left for whoever
// reads both fields to notice, exactly as `value === "0"` is left for
// whoever reads `value` to notice. Turning an observable fact into a
// computed verdict is precisely what this file refuses to do — see "NEVER
// A VERDICT" below.
//
// NEVER A VERDICT. This function computes no `safe`, `validated`, `ready`,
// `trusted`, or `recommended` field of any kind — only the plan's own
// facts: which account it spends from, where it sends, what it carries,
// and what gas/fee figures it was priced with. Whether those facts are
// ACCEPTABLE remains entirely a judgment for the person reading them,
// exactly as `application/BasePublicationTransactionPlanView.js`'s own
// header (0.8.91) already holds one stage earlier, and `application/
// BitcoinAnchorTransactionReviewView.js`'s own header (0.8.59) already
// holds one chain over.
//
// `plan` MUST BE A REAL, ALREADY-CONSTRUCTED BASE TRANSACTION PLAN — NO
// DUCK TYPING FROM AN ARBITRARY OBJECT. Every field this function reads
// off `plan` is checked against the exact shape `application/
// BasePublicationTransactionPlanCoordinator.js#construct()`'s own
// `construction.plan` always has (see that file's own header) before
// `plan.data` is ever handed to `decodeBasePublicationCommitment()`. This
// is a caller-contract violation, never an operational outcome — unlike a
// 0.8.91 construction attempt itself (which can genuinely be UNAVAILABLE
// or FAILED because a real network was asked something), a plan that has
// already reached CONSTRUCTED is this codebase's own already-known-good
// internal artifact, so a caller passing anything else here was never
// asking this function to review a real transaction plan at all. Mirrors
// `application/PublicationObservationArchiveReplacementReview.js`'s own
// "BOTH ARGUMENTS MUST BE ACTUAL... INSTANCES — NO DUCK TYPING" (0.8.88)
// and `application/BitcoinAnchorTransactionReviewView.js`'s own "Throws
// only for a malformed `description`" (0.8.59) — the identical restraint,
// applied here to a plain, frozen plan object rather than a class
// instance, since `base/BasePublicationTransactionPlanner.js` never
// produces one.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO SIGNING, NO
// BROADCAST. `describeBasePublicationTransactionReview()` reads no clock,
// consults no wallet, and never mutates `plan`. It creates no
// `application/BlockchainPublicationIdentity.js` (0.8.89) — there has been
// no publication yet, only a plan and a review of it.
//
// `requireRealBasePublicationTransactionPlan()` IS EXPORTED, 0.8.93. The
// exact same field-by-field re-validation this file already performed
// internally is now also `base/BaseTransactionSigner.js`'s own precondition
// before it ever builds a transaction request from a plan — never a second,
// independently-drifting copy of these checks. Nothing about the checks
// themselves, or this function's own behavior, changes.
export function describeBasePublicationTransactionReview(plan) {
    requireRealPlan(plan);

    return Object.freeze({
        network: plan.network,
        chainId: plan.chainId,
        from: plan.from,
        to: plan.to,
        value: plan.value,
        nonce: plan.nonce,
        gasLimit: plan.gasLimit,
        maxFeePerGas: plan.maxFeePerGas,
        maxPriorityFeePerGas: plan.maxPriorityFeePerGas,
        contentHash: decodeBasePublicationCommitment(plan.data),
        transactionData: plan.data
    });
}

export function requireRealBasePublicationTransactionPlan(plan) {
    requireRealPlan(plan);
}

function requireRealPlan(plan) {
    if (!plan || typeof plan !== 'object') {
        throw new Error('describeBasePublicationTransactionReview: plan must be a real BasePublicationTransactionPlanner plan');
    }
    if (plan.network !== 'mainnet' && plan.network !== 'testnet') {
        throw new Error('describeBasePublicationTransactionReview: plan.network must be "mainnet" or "testnet"');
    }
    if (!Number.isInteger(plan.chainId) || plan.chainId <= 0) {
        throw new Error('describeBasePublicationTransactionReview: plan.chainId must be a positive integer');
    }
    if (typeof plan.from !== 'string' || !ADDRESS_PATTERN.test(plan.from)) {
        throw new Error('describeBasePublicationTransactionReview: plan.from must be a 20-byte hex EVM address');
    }
    if (typeof plan.to !== 'string' || !ADDRESS_PATTERN.test(plan.to)) {
        throw new Error('describeBasePublicationTransactionReview: plan.to must be a 20-byte hex EVM address');
    }
    if (typeof plan.value !== 'string' || !DECIMAL_PATTERN.test(plan.value)) {
        throw new Error('describeBasePublicationTransactionReview: plan.value must be a decimal-digit string');
    }
    if (!Number.isInteger(plan.nonce) || plan.nonce < 0) {
        throw new Error('describeBasePublicationTransactionReview: plan.nonce must be a non-negative integer');
    }
    if (!Number.isInteger(plan.gasLimit) || plan.gasLimit <= 0) {
        throw new Error('describeBasePublicationTransactionReview: plan.gasLimit must be a positive integer');
    }
    if (typeof plan.maxFeePerGas !== 'string' || !DECIMAL_PATTERN.test(plan.maxFeePerGas)) {
        throw new Error('describeBasePublicationTransactionReview: plan.maxFeePerGas must be a decimal-digit string');
    }
    if (typeof plan.maxPriorityFeePerGas !== 'string' || !DECIMAL_PATTERN.test(plan.maxPriorityFeePerGas)) {
        throw new Error('describeBasePublicationTransactionReview: plan.maxPriorityFeePerGas must be a decimal-digit string');
    }
    // plan.data itself is deliberately NOT validated here — it is
    // independently re-validated, as raw commitment bytes, by
    // decodeBasePublicationCommitment() itself. See this file's own
    // header, "THE COMMITMENT IS MADE VISIBLE, NOT JUST CARRIED THROUGH."
}
