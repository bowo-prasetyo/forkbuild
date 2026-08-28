import { BaseNetworkObservationState } from './BaseNetworkObservationState.js';
import { BasePublicationTransactionPlanState } from './BasePublicationTransactionPlanState.js';

// 0.8.91 — Explicit Base Publication Transaction Construction.
//
// This milestone's own proposal named this exact gap directly: 0.8.90
// built a real, read-only Base observation capability and wired it into
// `ui/views/DecentralizedPublicationsView.js`'s own "Base Network" panel,
// but nothing since has ever called anything resembling a "Create Base
// Transaction Plan" action. This class is that wiring, and NOTHING
// else — it turns an already-OBSERVED account fact into an already-built
// plan, through `base/BasePublicationTransactionPlanner.js`:
//
//   { publicationId, contentHash, accountObservation }
//           │
//           │ explicit "Create Base Transaction Plan" click
//           ▼
//   BasePublicationTransactionPlanCoordinator.construct()   (THIS FILE — new)
//           │
//           ▼
//   BasePublicationTransactionPlanner.plan()          (0.8.91, base/)
//           │                       plan.built === false ──┬──────────┐
//           ▼                                               ▼          ▼
//   { accountObservation, plan }              unavailable:true   unavailable:false
//   a frozen CONSTRUCTION, never                     │                │
//   signed, never broadcast                          ▼                ▼
//           │                              { state: UNAVAILABLE }  { state: FAILED }
//           ▼
//   { state: CONSTRUCTED, construction, reason: null }
//
// A DELIBERATELY THIN COORDINATOR — ORCHESTRATION ONLY, NEVER A SECOND
// IMPLEMENTATION. This class never observes a Base account, never
// refreshes one, never retries a failed or unavailable attempt on its
// own, never selects a different account, never changes the fee reads it
// was constructed with, never signs, and never broadcasts. Every one of
// those responsibilities stays exactly where an earlier milestone already
// put it (account observation: 0.8.90; nonce/gas/fee reads and plan
// arithmetic: 0.8.91's own `base/BasePublicationTransactionPlanner.js`) —
// this class only ever calls the one collaborator it is handed, once, and
// reports what it said. Mirrors `application/
// BitcoinAnchorTransactionConstructionCoordinator.js`'s own header
// (0.8.61) exactly, one chain over.
//
// `contentHash` IS A CALLER-SUPPLIED PARAMETER, NEVER LOOKED UP FROM A
// CATALOG. Identical reasoning to `application/
// BitcoinAnchorTransactionConstructionCoordinator.js`'s own header: a
// caller (the UI, reading a publication entry it already has on screen)
// already has `publicationId`/`contentHash` in hand, so adding a catalog
// dependency here would only duplicate a lookup the caller has already
// done.
//
// AN ACCOUNT OBSERVATION MUST ALREADY BE OBSERVED — NEVER SILENTLY
// RE-OBSERVED, NEVER RE-VALIDATED FOR STALENESS. `accountObservation` is
// expected to be a real `base/BaseNetworkObserver.js#observeAccount()`
// result whose own `state` is already `OBSERVED` (application/
// BaseNetworkObservationState.js) — a caller-contract violation, checked
// before the planner is ever called, exactly like every other
// malformed-input check this class performs. That the observed balance
// may already be stale by the time anyone constructs a plan against it —
// let alone signs one — is a fact this codebase already lives with for
// Bitcoin funding (see `application/
// BitcoinAnchorTransactionConstructionCoordinator.js`'s own header, "A
// FUNDING OBSERVATION MUST ALREADY BE OBSERVED"); this class never
// re-observes to find a fresher answer on its own.
//
// THE PLANNER REMAINS THE SOLE AUTHORITY FOR NONCE/GAS/FEE READS AND THE
// AFFORDABILITY CHECK. `accountObservation.address`/`.network`/
// `.chainId`/`.nativeBalanceWei` are handed to
// `basePublicationTransactionPlanner.plan()` exactly as observed — this
// class never re-derives, re-checks, or second-guesses the plan that
// comes back.
//
// A CONSTRUCTION RECORDS WHAT PRODUCED IT; IT DOES NOT CLAIM THE OBSERVED
// BALANCE OR FEE FIGURES REMAIN CURRENT. A successful result's own
// `construction` object freezes together the exact `accountObservation`
// that was used and the exact `plan` the planner returned FROM it —
// never a live reference a later mutation could change out from under a
// caller holding this result, and never a claim that the account still
// holds this balance, right now, or that the network still prices gas
// this way. See this file's own header above, and docs/Roadmap.md,
// 0.8.91: "A plan should freeze the values it was constructed with. If
// the network changes afterward, that does not silently mutate an
// existing plan."
//
// ASYNCHRONOUS, EXACTLY LIKE THE PLANNER IT WRAPS. Unlike `application/
// BitcoinAnchorTransactionConstructionCoordinator.js#construct()` (fully
// synchronous, because the Bitcoin builder it wraps performs no network
// access of its own), `construct()` here genuinely awaits
// `basePublicationTransactionPlanner.plan()`'s own nonce/gas/fee reads —
// a caller always `await`s this call.
export class BasePublicationTransactionPlanCoordinator {
    constructor({ basePublicationTransactionPlanner } = {}) {
        if (!basePublicationTransactionPlanner || typeof basePublicationTransactionPlanner.plan !== 'function') {
            throw new Error('BasePublicationTransactionPlanCoordinator: a BasePublicationTransactionPlanner is required');
        }
        this._basePublicationTransactionPlanner = basePublicationTransactionPlanner;
    }

    // Resolves to exactly one of:
    //
    //   { state: CONSTRUCTED, construction: { publicationId, contentHash,
    //     accountObservation, plan, constructedAt }, reason: null }
    //   { state: UNAVAILABLE, construction: null, reason }
    //       — the planner could not presently read the nonce, gas
    //         estimate, or fee figures this plan needs.
    //   { state: FAILED, construction: null, reason }
    //       — every read succeeded, but the account cannot afford the
    //         resulting plan.
    //
    // Throws only for a caller-contract violation checked BEFORE the
    // planner is ever called — a missing/empty publicationId or
    // contentHash, or an accountObservation that is not itself an
    // OBSERVED Base account observation — mirroring exactly how
    // `application/BitcoinAnchorTransactionConstructionCoordinator.js#
    // construct()` itself throws for its own malformed fundingObservation
    // rather than reporting it as an operational outcome.
    async construct({ publicationId, contentHash, accountObservation } = {}) {
        if (typeof publicationId !== 'string' || !publicationId.trim()) {
            throw new Error('BasePublicationTransactionPlanCoordinator: publicationId must be a non-empty string');
        }
        if (typeof contentHash !== 'string' || !contentHash.trim()) {
            throw new Error('BasePublicationTransactionPlanCoordinator: contentHash must be a non-empty string');
        }
        if (!accountObservation || accountObservation.state !== BaseNetworkObservationState.OBSERVED) {
            throw new Error('BasePublicationTransactionPlanCoordinator: accountObservation must be an OBSERVED Base account observation — this coordinator never observes an account itself');
        }

        const result = await this._basePublicationTransactionPlanner.plan({
            contentHash,
            address: accountObservation.address,
            network: accountObservation.network,
            chainId: accountObservation.chainId,
            nativeBalanceWei: accountObservation.nativeBalanceWei
        });

        if (!result.built) {
            const state = result.unavailable ? BasePublicationTransactionPlanState.UNAVAILABLE : BasePublicationTransactionPlanState.FAILED;
            return this._outcome(state, { reason: result.reason });
        }

        const construction = Object.freeze({
            publicationId,
            contentHash,
            accountObservation,
            plan: Object.freeze({
                network: result.network,
                chainId: result.chainId,
                from: result.from,
                to: result.to,
                value: result.value,
                data: result.data,
                nonce: result.nonce,
                gasLimit: result.gasLimit,
                maxFeePerGas: result.maxFeePerGas,
                maxPriorityFeePerGas: result.maxPriorityFeePerGas
            }),
            constructedAt: new Date()
        });

        return this._outcome(BasePublicationTransactionPlanState.CONSTRUCTED, { construction, reason: null });
    }

    _outcome(state, { construction = null, reason = null } = {}) {
        return { state, construction, reason };
    }
}
