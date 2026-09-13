import { BaseReviewedSigningState } from '../application/BaseReviewedSigningState.js';

// 0.9.470 — Review-Preserving Base Anchor Publisher.
//
// 0.9.466 found every non-signing seam a `BaseAnchorPublisher` would need
// (registry, orchestrator, UI, failure vocabulary, proof shape) already a
// zero-change composition seam, and named the one real constraint: neither
// `base/BaseTransactionSigner.js` nor `base/BaseReviewedTransactionSigner.js`
// accepts a bare `contentHash` — both require an already-constructed,
// already-(optionally)-reviewed plan, by explicit 0.8.93 design. 0.9.469
// resolved the resulting policy question — BASE_ANCHOR_SIGNING_POLICY =
// REVIEW_REQUIRED — and named the buildable direction: "a small bridge from
// the already-live, already-reviewed Base Publication Transaction pipeline
// into `CreatePublicationAnchorUseCase`'s own already-generic { anchorType,
// locator, proof } contract." This class is that bridge, and nothing more:
//
//   an already-CONSTRUCTED plan (base/BasePublicationTransactionPlanner.js,
//   reused unchanged — this class never builds one)
//           │
//           │  an already-produced reviewedTransaction (application/
//           │  BasePublicationTransactionReview.js's own
//           │  describeBasePublicationTransactionReview(plan), shown to a
//           │  person by the CALLER — this class never calls that function
//           │  itself; see "NEVER DESCRIBES A REVIEW" below)
//           ▼
//   BaseAnchorPublisher.publish(publicationId, {                (THIS FILE)
//       contentHash, wallet, plan, reviewedTransaction, archive })
//           │
//           ├── application/BaseReviewedSigningCoordinator.js#sign()
//           │   (UNCHANGED — the exact 0.8.93 review-gated signing path)
//           ├── base/BaseSignedTransactionFinalizer.js#finalize()
//           │   (UNCHANGED — independent cryptographic verification)
//           ├── base/BaseTransactionBroadcaster.js#broadcast()
//           │   (UNCHANGED)
//           ├── application/CreateBaseAnchorPublicationRecordUseCase.js
//           │   (UNCHANGED — durable local Base publication identity)
//           ▼
//   application/CreatePublicationAnchorUseCase.js#execute()   (UNCHANGED —
//           │                                                  0.8.8's own
//           │                                                  generic,
//           │                                                  signer/
//           │                                                  broadcaster-
//           │                                                  free claim)
//           ▼
//   { published: true, locator: 'base:<txid>', proof: { txid, network },
//     anchor, archive }
//
// NOT REGISTERED IN application/ExternalAnchorPublisherRegistry.js — A
// DELIBERATE DEPARTURE FROM THE GENERIC ONE-CLICK ANCHOR SEAM, NOT AN
// OVERSIGHT. That registry's own contract — `publish(contentHash)`, a
// single bare argument — exists for `anchoring/BitcoinAnchorPublisher.js`
// and `anchoring/ArweaveAnchorPublisher.js` precisely because each of THEM
// can drive its own signing/broadcast unattended from a bare contentHash
// alone. Shaping THIS class to fit that identical one-argument call would
// require it to either (a) reconstruct a plan and invent its own
// `reviewedTransaction` internally — silently re-deriving
// `describeBasePublicationTransactionReview(plan)` and feeding it straight
// back into signing with no person ever having seen it — which is exactly
// the automatic-approval bypass 0.9.469 rejected on four independent
// grounds, or (b) return `unavailable` for every bare-contentHash call,
// which would make the registration a decoration, never a real capability.
// 0.9.469 Section I already priced this honestly: the review-preserving
// bridge "cannot fit the generic one-click anchor card... it needs its own
// new, small affordance," never the `v-for="anchorType in
// availableAnchorTypes"` grid. This class's own `publish()` signature
// reflects that finding directly — it takes the exact reviewed inputs
// `application/BaseReviewedSigningCoordinator.js#sign()` already requires,
// never a bare `contentHash`. Wiring a real UI affordance that calls it is
// the next, separately sized integration milestone.
//
// NEVER CONSTRUCTS A PLAN. `base/BasePublicationTransactionPlanner.js`
// already exists, is already RPC-priced, and is already reachable from
// `ui/main.js` via `application/BasePublicationTransactionPlanCoordinator.js`
// — reusing it, not reimplementing it, is what keeps this class the
// "smallest adapter necessary." A caller constructs `plan` exactly as the
// existing Base Publication Transaction UI section already does today,
// before ever calling `publish()`.
//
// NEVER DESCRIBES A REVIEW, AND NEVER CALLS
// `describeBasePublicationTransactionReview()` ITSELF. `reviewedTransaction`
// arrives as a required, caller-supplied argument — the identical
// discipline `base/BaseReviewedTransactionSigner.js`'s own header already
// holds ("a caller constructs the value to compare against by actually
// calling `describeBasePublicationTransactionReview()` first — this class
// never shortcuts that step"). This class adds no second, competing way to
// produce a `reviewedTransaction` — the ONLY place one can come from is a
// person having actually been shown 0.8.92's own projection, exactly as
// today.
//
// CONTENT-HASH FIDELITY IS CHECKED BEFORE ANY WALLET IS EVER CONSULTED.
// `application/CreatePublicationAnchorUseCase.js` derives its own
// `contentHash` from the looked-up publication's `contentReference.hash` —
// it never trusts a caller-supplied one. This class closes the one gap
// that leaves open: nothing otherwise stops a caller from handing it a
// `plan`/`reviewedTransaction` pair that was reviewed and broadcast for a
// DIFFERENT publication's content entirely. `reviewedTransaction.contentHash`
// — 0.8.92's own already-decoded, already-reviewed projection of `plan.data`
// — is compared against the caller's own declared `contentHash` for the
// publication being anchored, and a mismatch throws as a caller-contract
// violation, before `wallet.signTransaction()` is ever reached. This is a
// second, independent check, never a re-decode of `plan.data` — reusing
// `reviewedTransaction`'s own already-produced field rather than importing
// `application/BasePublicationCommitmentEncoding.js` a second time here.
//
// NO SIGNING CAPABILITY OF ITS OWN, AND NEVER A REMEMBERED WALLET. Exactly
// `application/BaseReviewedSigningCoordinator.js`'s own restraint, held
// here one layer up: `wallet` is a required, explicit argument on every
// `publish()` call, never held across calls. This class imports neither
// `base/BaseTransactionSigner.js` nor `base/BaseReviewedTransactionSigner.js`
// directly — only the already-reviewed coordinator sitting in front of them
// — and never constructs either concrete signer itself.
//
// A DEFINITE REFUSAL IS NEVER RETRIED, AND NEVER MASKED AS UNAVAILABLE. The
// four collaborators this class composes each already draw the identical
// unavailable-vs-definite line `docs/Principles.md` establishes throughout
// this codebase; `publish()` only ever forwards that same distinction
// outward — the wallet declining, the plan no longer matching what was
// reviewed, an invalid signature, or a broadcaster's definite rejection are
// all `{ published: false, reason }`; a wallet or broadcaster that cannot
// PRESENTLY be reached is `{ published: false, unavailable: true, reason }`.
// This class invents no new outcome vocabulary of its own.
//
// BROADCAST ACCEPTANCE IS NOT ANCHOR VALIDITY, HELD HERE ONE CHAIN OVER
// FROM `anchoring/BitcoinAnchorPublisher.js`'s OWN IDENTICAL PRINCIPLE. The
// generic anchor this class creates is minted the moment broadcast is
// accepted — never delayed for confirmation or inclusion — because
// `anchoring/BaseProofVerifier.js` (already wired into
// `externalAnchorProofVerifierRegistry` since 0.9.465) already reports
// `PROOF_UNAVAILABLE` for an unconfirmed/not-yet-propagated transaction and
// `VALID` once it is found, entirely independently. Duplicating that
// inclusion-waiting logic here would be a second, competing copy of a
// concern `anchoring/BaseProofVerifier.js` already owns.
export class BaseAnchorPublisher {
    constructor({
        baseReviewedSigningCoordinator,
        baseSignedTransactionFinalizer,
        baseTransactionBroadcaster,
        createBaseAnchorPublicationRecordUseCase,
        createPublicationAnchorUseCase
    } = {}) {
        if (!baseReviewedSigningCoordinator || typeof baseReviewedSigningCoordinator.sign !== 'function') {
            throw new Error('BaseAnchorPublisher: a baseReviewedSigningCoordinator is required');
        }
        if (!baseSignedTransactionFinalizer || typeof baseSignedTransactionFinalizer.finalize !== 'function') {
            throw new Error('BaseAnchorPublisher: a baseSignedTransactionFinalizer is required');
        }
        if (!baseTransactionBroadcaster || typeof baseTransactionBroadcaster.broadcast !== 'function') {
            throw new Error('BaseAnchorPublisher: a baseTransactionBroadcaster is required');
        }
        if (!createBaseAnchorPublicationRecordUseCase || typeof createBaseAnchorPublicationRecordUseCase.execute !== 'function') {
            throw new Error('BaseAnchorPublisher: a createBaseAnchorPublicationRecordUseCase is required');
        }
        if (!createPublicationAnchorUseCase || typeof createPublicationAnchorUseCase.execute !== 'function') {
            throw new Error('BaseAnchorPublisher: a createPublicationAnchorUseCase is required');
        }
        this._signingCoordinator = baseReviewedSigningCoordinator;
        this._finalizer = baseSignedTransactionFinalizer;
        this._broadcaster = baseTransactionBroadcaster;
        this._createRecord = createBaseAnchorPublicationRecordUseCase;
        this._createAnchor = createPublicationAnchorUseCase;
    }

    // Identity metadata only — mirroring `anchoring/BitcoinAnchorPublisher.js`
    // and `anchoring/BaseProofVerifier.js`'s own identical `anchorType`
    // getter. Never consulted by any registry: see this file's own header,
    // "NOT REGISTERED IN application/ExternalAnchorPublisherRegistry.js."
    get anchorType() { return 'base'; }

    // Resolves to exactly one of:
    //
    //   { published: true, locator: 'base:<txid>', proof: { txid, network },
    //     anchor, archive }
    //       — anchor: the cataloged, signed core/PublicationAnchor.js
    //         instance `application/CreatePublicationAnchorUseCase.js`
    //         itself returns.
    //       — archive: a NEW application/PublicationObservationArchive.js,
    //         holding the newly minted application/
    //         BaseAnchorPublicationRecord.js — never a mutation of the
    //         `archive` this call was given.
    //   { published: false, reason }
    //       — a definite no: the wallet declined, the plan no longer
    //         matches what was reviewed, the signed transaction failed
    //         independent verification, or the broadcaster reached a
    //         definite rejection.
    //   { published: false, unavailable: true, reason }
    //       — cannot presently tell: no signing-capable wallet is
    //         connected, or the broadcaster could not presently be
    //         reached. Retrying later, with a fresh `publish()` call, may
    //         succeed — never automatically retried by this class itself.
    //
    // Throws only for a caller-contract violation checked BEFORE the
    // wallet is ever consulted — a missing/empty `contentHash`, or a
    // `reviewedTransaction` whose own `contentHash` does not match it (see
    // this file's own header, "CONTENT-HASH FIDELITY"). Every other
    // caller-contract violation (a missing `plan` or `reviewedTransaction`)
    // is `application/BaseReviewedSigningCoordinator.js#sign()`'s own,
    // reused verbatim rather than duplicated here.
    async publish(publicationId, { contentHash, wallet, plan, reviewedTransaction, archive } = {}) {
        if (typeof contentHash !== 'string' || !contentHash.trim()) {
            throw new Error('BaseAnchorPublisher: contentHash is required');
        }
        const expectedContentHash = contentHash.trim().toLowerCase();
        if (!reviewedTransaction || reviewedTransaction.contentHash !== expectedContentHash) {
            throw new Error(`BaseAnchorPublisher: the reviewed transaction's own contentHash (${reviewedTransaction && reviewedTransaction.contentHash}) does not match the supplied contentHash (${expectedContentHash}) — this reviewed transaction was never for this content`);
        }

        const signResult = await this._signingCoordinator.sign({ wallet, plan, reviewedTransaction });
        if (signResult.state === BaseReviewedSigningState.UNAVAILABLE) {
            return { published: false, unavailable: true, reason: signResult.reason };
        }
        if (signResult.state !== BaseReviewedSigningState.SIGNED) {
            // DECLINED (a wallet refusal, or a stale-plan mismatch caught
            // before the wallet was ever asked) or FAILED (an unacceptable
            // signer result) — both a definite no; see
            // application/BaseReviewedSigningCoordinator.js's own header on
            // why DECLINED alone already covers two distinct refusals.
            return { published: false, reason: signResult.reason };
        }

        const finalizeResult = this._finalizer.finalize({ plan, rawTransaction: signResult.rawTransaction });
        if (!finalizeResult.finalized) {
            // A structural mismatch or an invalid signature are both
            // definite facts about the exact bytes the wallet returned —
            // never `unavailable`. See base/BaseSignedTransactionFinalizer.js's
            // own header.
            return { published: false, reason: finalizeResult.reason };
        }

        const broadcastResult = await this._broadcaster.broadcast({ finalizedTransaction: finalizeResult.finalizedTransaction });
        if (!broadcastResult.broadcasted) {
            return { published: false, unavailable: !!broadcastResult.unavailable, reason: broadcastResult.reason };
        }

        const { txid } = broadcastResult;
        const network = plan.network;
        const archiveWithRecord = this._createRecord.execute(archive, { contentHash: expectedContentHash, txid, network });
        const anchor = this._createAnchor.execute(publicationId, {
            anchorType: this.anchorType,
            locator: `base:${txid}`,
            proof: { txid, network }
        });

        return {
            published: true,
            locator: `base:${txid}`,
            proof: { txid, network },
            anchor,
            archive: archiveWithRecord
        };
    }
}
