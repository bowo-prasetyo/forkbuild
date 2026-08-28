import { requireRealBasePublicationTransactionPlan } from '../application/BasePublicationTransactionReview.js';

// 0.8.93 — Explicit Base Reviewed Transaction Signing.
//
// `application/BasePublicationTransactionPlanCoordinator.js#construct()`
// (0.8.91) produces a real, immutable, UNSIGNED Base transaction plan, and
// `application/BasePublicationTransactionReview.js` (0.8.92) turns it into
// what a person sees before authorizing it. Nothing since has ever handed
// that plan to a wallet and asked for a signature. This class is that
// handoff, held to the identical principle `anchoring/
// BitcoinAnchorWalletSigner.js` (0.8.50) already established one chain
// over:
//
//   ForkBuild requests authorization; the wallet controls the keys and
//   performs the signing.
//
//   { network, chainId, from, to, value, data,
//     nonce, gasLimit, maxFeePerGas, maxPriorityFeePerGas }   an already-
//                                                              CONSTRUCTED,
//                                                              FROZEN plan
//                                                              (0.8.91)
//           │
//           ▼
//   BaseTransactionSigner.requestSignature({ plan })          (THIS FILE
//           │                                                  — new)
//           │
//           ├─ requireRealBasePublicationTransactionPlan(plan)
//           │  (0.8.92's own field-by-field re-validation, reused
//           │   verbatim — never duplicated)
//           ▼
//   a transactionRequest built ONLY from `plan`'s own already-frozen
//   fields — never a fresh nonce, gas estimate, or fee read of any kind
//           │
//           ▼
//   ┌─────────────────────┐
//   │ an injected `wallet` │   user reviews (in the wallet's own UI too),
//   │  (never this class)  │   user approves, wallet signs
//   └──────────┬───────────┘
//              ▼
//   { signed: true, rawTransaction }
// | { signed: false, reason }
// | { signed: false, unavailable: true, reason }
//
// THE SIGNER RECEIVES THE ALREADY-CONSTRUCTED PLAN — IT NEVER RECONSTRUCTS
// ONE. This class calls no RPC source, observes no account, estimates no
// gas, and chooses no fee of any kind. Every field of the transactionRequest
// handed to `wallet.signTransaction()` is read straight off `plan` — the
// exact, already-frozen artifact a caller already holds from a successful
// 0.8.91 construction (and already showed a person via 0.8.92's own
// review). A caller that hands this class a bare `contentHash` and an
// `account`, hoping it will figure out the rest, gets a thrown
// caller-contract violation instead — see "`plan` MUST BE A REAL,
// ALREADY-CONSTRUCTED PLAN" below.
//
// THE TRANSACTION TYPE IS EXPLICIT, NEVER LEFT FOR THE WALLET TO GUESS.
// `plan.maxFeePerGas`/`plan.maxPriorityFeePerGas` already commit this
// codebase to EIP-1559 pricing (0.8.91) — this class names that
// commitment structurally, stamping `type: '0x2'` on every
// transactionRequest it builds, rather than handing the wallet a bag of
// fields and letting it silently decide which transaction envelope they
// belong to.
//
// FORKBUILD NEVER RECEIVES A PRIVATE KEY, NEVER GENERATES ONE, NEVER
// DERIVES A SEED, NEVER STORES A WALLET SECRET. This class does not
// import anything resembling a broadcaster, and never calls
// `eth_sendTransaction`/`eth_sendRawTransaction` — `requestSignature()`
// resolves to a signed raw transaction or a reason it could not get one,
// nothing more. Whether the user approves the transaction, and how the
// private key that signs it is held, is entirely the injected `wallet`'s
// own concern — the identical restraint `anchoring/
// BitcoinAnchorWalletSigner.js`'s own header already holds toward its own
// injected `wallet`.
//
// A `wallet` HAS EXACTLY THIS SHAPE, MIRRORING `anchoring/
// BitcoinAnchorWalletSigner.js`'s OWN `wallet` CONTRACT PRECISELY, ONE
// CHAIN OVER:
//
//   { signTransaction(transactionRequest) ->
//       { signed: true, rawTransaction }
//           — rawTransaction: a hex string carrying the wallet's own
//             signed, serialized transaction. NEVER inspected, decoded,
//             or compared against `plan` by this class — see "SIGNED IS
//             NOT INSPECTED, HERE" below.
//     | { signed: false, reason }
//           — a DEFINITE no: the user declined, or the wallet refused.
//     | { signed: false, unavailable: true, reason }
//           — cannot PRESENTLY tell: the wallet is locked, unreachable,
//             or does not support signing without broadcasting. NEVER
//             treated as a decline.
//     (sync return or Promise — requestSignature() always awaits it) }
//
// Throwing is tolerated as a last resort — caught and reported as the
// `unavailable` form, never the definite-decline form — mirroring exactly
// how `anchoring/BitcoinAnchorWalletSigner.js` already treats a throwing
// wallet.
//
// SIGNED IS NOT INSPECTED, HERE. Unlike `anchoring/
// BitcoinAnchorWalletSigner.js` (which independently re-inspects every
// claimed PSBT signature in the SAME milestone it was introduced in), this
// class never decodes `rawTransaction` and never checks that it actually
// corresponds to `plan`. That correspondence check — genuinely,
// cryptographically confirming a wallet's claimed signature belongs to
// the exact transaction this class asked to have signed — is this
// milestone's own next, deliberately separate step: see docs/Roadmap.md,
// 0.8.94. This class only ever checks that a claimed success actually
// carries SOME `rawTransaction` value at all — a wallet-contract
// violation otherwise, never silently accepted as success.
//
// STILL NEVER BROADCASTING. A successful `{ signed: true }` result is a
// signed raw transaction, never a transaction hash, never anything handed
// to a network. Turning a signed artifact into one this codebase has
// itself verified, and broadcasting it, are each their own, separately
// sized future milestones — see docs/Roadmap.md, 0.8.94 and 0.8.95.
//
// `plan` MUST BE A REAL, ALREADY-CONSTRUCTED PLAN — NO DUCK TYPING. Every
// field this class reads off `plan` is checked, before a transactionRequest
// is ever built, by `application/BasePublicationTransactionReview.js`'s
// own exported `requireRealBasePublicationTransactionPlan()` — the exact
// same known-good-internal-artifact re-validation 0.8.92's own review
// already performs, reused verbatim rather than duplicated. A malformed
// `plan` is a caller-contract violation and throws, before the wallet is
// ever consulted — never an operational "signing unavailable" outcome.
export class BaseTransactionSigner {
    constructor({ wallet } = {}) {
        if (!wallet || typeof wallet.signTransaction !== 'function') {
            throw new Error('BaseTransactionSigner: a wallet capable of signTransaction() is required');
        }
        this._wallet = wallet;
    }

    // Resolves to exactly one of:
    //
    //   { signed: true, rawTransaction }
    //   { signed: false, reason }
    //       — the wallet reached a definite no.
    //   { signed: false, unavailable: true, reason }
    //       — cannot presently obtain a signature; retrying later may
    //         succeed.
    //
    // Throws only for a malformed `plan` (a caller-contract violation,
    // checked before the wallet is ever consulted) or a wallet result this
    // class cannot make sense of at all (a wallet-contract violation, not
    // an operational failure — mirroring `anchoring/
    // BitcoinAnchorWalletSigner.js#requestSignature()` throwing when a
    // wallet claims `signed: true` but returns no `psbt`).
    async requestSignature({ plan } = {}) {
        requireRealBasePublicationTransactionPlan(plan);

        const transactionRequest = Object.freeze({
            type: '0x2', // EIP-1559 — explicit, never left for the wallet to infer from the fee fields alone.
            chainId: plan.chainId,
            nonce: plan.nonce,
            gas: plan.gasLimit,
            maxFeePerGas: plan.maxFeePerGas,
            maxPriorityFeePerGas: plan.maxPriorityFeePerGas,
            from: plan.from,
            to: plan.to,
            value: plan.value,
            data: plan.data
        });

        let result;
        try {
            result = await this._wallet.signTransaction(transactionRequest);
        } catch (error) {
            return { signed: false, unavailable: true, reason: error.message };
        }

        if (!result || result.signed !== true) {
            return {
                signed: false,
                unavailable: !!(result && result.unavailable),
                reason: (result && result.reason) || 'wallet declined to sign this transaction'
            };
        }

        if (typeof result.rawTransaction !== 'string' || !result.rawTransaction) {
            throw new Error('BaseTransactionSigner: wallet reported signed: true but returned no rawTransaction');
        }

        return { signed: true, rawTransaction: result.rawTransaction };
    }
}
