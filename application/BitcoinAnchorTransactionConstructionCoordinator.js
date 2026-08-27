import { BitcoinAnchorFundingObservationState } from './BitcoinAnchorFundingObservationState.js';
import { BitcoinAnchorTransactionConstructionState } from './BitcoinAnchorTransactionConstructionState.js';

// 0.8.61 — Explicit Bitcoin Anchor Transaction Construction UI.
//
// 0.8.60's own "Deliberately excluded" list named this milestone directly:
// "Actually calling anchoring/BitcoinAnchorTransactionBuilder.js... or
// wiring a 'Create Transaction Plan' action into this page" was left real,
// separately sized future work. This class is that wiring, and NOTHING
// else — it turns an already-OBSERVED funding fact into an already-built
// plan, through the exact, unchanged 0.8.47 builder:
//
//   { publicationId, contentHash, fundingObservation }
//           │
//           │ explicit "Create Transaction Plan" click
//           ▼
//   BitcoinAnchorTransactionConstructionCoordinator.construct()   (THIS FILE — new)
//           │
//           ▼
//   BitcoinAnchorTransactionBuilder.build()             (0.8.47, UNCHANGED)
//           │                                    plan.built === false ──┐
//           ▼                                                           │
//   { fundingObservation, plan }              a frozen CONSTRUCTION      │
//                                              IDENTITY, never signed,   │
//                                              never broadcast           │
//           │                                                           │
//           ▼                                                           ▼
//   { state: CONSTRUCTED, construction, reason: null }   { state: FAILED, construction: null, reason }
//
// A DELIBERATELY THIN COORDINATOR — ORCHESTRATION ONLY, NEVER A SECOND
// IMPLEMENTATION. This class never discovers UTXOs, never refreshes
// funding, never retries a failed attempt with different inputs, never
// selects a different account, never changes the fee policy it was
// constructed with, never generates an address, never signs, and never
// broadcasts. Every one of those responsibilities stays exactly where an
// earlier milestone already put it (funding observation: 0.8.60; UTXO
// selection and fee arithmetic: 0.8.47; signing: 0.8.50/0.8.58/0.8.59;
// broadcasting: 0.8.52) — this class only ever calls the one collaborator
// it is handed, once, and reports what it said.
//
// `contentHash` IS A CALLER-SUPPLIED PARAMETER, NEVER LOOKED UP FROM A
// CATALOG. Unlike application/BitcoinAnchorPublicationCoordinator.js
// (0.8.53), which resolves `contentHash` itself from an injected
// `publicationCatalog`, this coordinator takes no catalog dependency at
// all — `publicationId` and `contentHash` both arrive from the caller
// exactly as given. This is deliberate, not an oversight: 0.8.53's own
// coordinator exists to run a full plan-through-broadcast pipeline where
// "which publication" is the only thing a caller should need to name; this
// coordinator exists one step earlier, where a caller (the UI, reading a
// publication entry it already has on screen) already has both facts in
// hand and this class's only job is turning them, plus a funding
// observation, into a plan — adding a catalog dependency here would only
// duplicate a lookup the caller has already done.
//
// A FUNDING OBSERVATION MUST ALREADY BE OBSERVED — NEVER SILENTLY
// REFRESHED, NEVER RE-VALIDATED FOR STALENESS. `fundingObservation` is
// expected to be a real anchoring/BitcoinWalletFundingObserver.js result
// whose own `state` is already `OBSERVED` (application/
// BitcoinAnchorFundingObservationState.js) — a caller-contract violation,
// checked before the builder is ever called, exactly like every other
// malformed-input check this class performs. Whether that observation is
// STALE (a wallet reconnected on a different network since; a UTXO it
// named may already be spent) is a fact application/
// BitcoinAnchorFundingView.js#describeBitcoinAnchorFunding()'s own
// `networkMismatch` already names to the person deciding whether to
// construct — this class never checks it, never blocks on it, and never
// re-observes to find a fresher answer on its own. See docs/Roadmap.md,
// "0.8.60 — Explicit Bitcoin Anchor Funding & Address Preparation," on why
// "a funding observation is a fact about a moment, never a commitment."
//
// THE BUILDER REMAINS THE SOLE AUTHORITY FOR SELECTION AND FEE ARITHMETIC.
// `fundingObservation.utxos` and `fundingObservation.changeAccount` are
// handed to `bitcoinAnchorTransactionBuilder.build()` exactly as observed
// — this class never sorts, filters, or re-orders them first, and never
// second-guesses the plan that comes back. See anchoring/
// BitcoinAnchorTransactionBuilder.js's own header, "DETERMINISTIC COIN
// SELECTION" — reusing that determinism unchanged is why calling
// `construct()` twice with the byte-identical `fundingObservation` and
// `contentHash` always returns a byte-identical plan.
//
// A CONSTRUCTION RECORDS WHAT PRODUCED IT; IT DOES NOT CLAIM THOSE UTXOS
// REMAIN SPENDABLE. A successful result's own `construction` object
// freezes together the exact `fundingObservation` that was used and the
// exact `plan` the builder returned FROM it — never a live reference a
// later mutation could change out from under a caller holding this result,
// and never a claim that the named inputs are still, right now, unspent.
// That a wallet's real spendable set can change between construction and
// any later signing attempt is exactly the same restraint every
// observation in this codebase already holds (see this file's own header
// above on `fundingObservation`) — a signing milestone built later is
// where re-checking that would belong, never here.
//
// SYNCHRONOUS, EXACTLY LIKE THE BUILDER IT WRAPS. `construct()` performs
// no network access and no async work of any kind — mirroring anchoring/
// BitcoinAnchorTransactionBuilder.js#build() exactly, one level up. A
// caller does not need to `await` this call; it is not asynchronous
// because there was never anything here for it to wait on.
export class BitcoinAnchorTransactionConstructionCoordinator {
    constructor({ bitcoinAnchorTransactionBuilder } = {}) {
        if (!bitcoinAnchorTransactionBuilder || typeof bitcoinAnchorTransactionBuilder.build !== 'function') {
            throw new Error('BitcoinAnchorTransactionConstructionCoordinator: a BitcoinAnchorTransactionBuilder is required');
        }
        this._bitcoinAnchorTransactionBuilder = bitcoinAnchorTransactionBuilder;
    }

    // Resolves synchronously to exactly one of:
    //
    //   { state: CONSTRUCTED, construction: { publicationId, contentHash,
    //     fundingObservation, plan }, reason: null }
    //   { state: FAILED, construction: null, reason }
    //       — the builder could not build a plan from this funding
    //         observation (e.g. insufficient funds).
    //
    // Throws only for a caller-contract violation checked BEFORE the
    // builder is ever called — a missing/empty publicationId or
    // contentHash, or a fundingObservation that is not itself an OBSERVED
    // funding observation — mirroring exactly how anchoring/
    // BitcoinAnchorTransactionBuilder.js#build() itself throws for its own
    // malformed contentHash/utxos/changeAddress rather than reporting them
    // as an operational outcome.
    construct({ publicationId, contentHash, fundingObservation } = {}) {
        if (typeof publicationId !== 'string' || !publicationId.trim()) {
            throw new Error('BitcoinAnchorTransactionConstructionCoordinator: publicationId must be a non-empty string');
        }
        if (typeof contentHash !== 'string' || !contentHash.trim()) {
            throw new Error('BitcoinAnchorTransactionConstructionCoordinator: contentHash must be a non-empty string');
        }
        if (!fundingObservation || fundingObservation.state !== BitcoinAnchorFundingObservationState.OBSERVED) {
            throw new Error('BitcoinAnchorTransactionConstructionCoordinator: fundingObservation must be an OBSERVED funding observation — this coordinator never observes funding itself');
        }

        const plan = this._bitcoinAnchorTransactionBuilder.build({
            contentHash,
            utxos: fundingObservation.utxos,
            changeAddress: fundingObservation.changeAccount
        });

        if (!plan.built) {
            return this._outcome(BitcoinAnchorTransactionConstructionState.FAILED, { reason: plan.reason });
        }

        const construction = Object.freeze({
            publicationId,
            contentHash,
            fundingObservation,
            plan,
            constructedAt: new Date()
        });

        return this._outcome(BitcoinAnchorTransactionConstructionState.CONSTRUCTED, { construction, reason: null });
    }

    _outcome(state, { construction = null, reason = null } = {}) {
        return { state, construction, reason };
    }
}
