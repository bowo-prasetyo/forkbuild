import { BitcoinAnchorPublisher } from '../anchoring/BitcoinAnchorPublisher.js';
import { BitcoinAnchorPublicationLifecycleState } from './BitcoinAnchorPublicationLifecycleState.js';

// 0.8.53 — Bitcoin Anchor Publication Lifecycle.
//
// 0.8.47 through 0.8.52 built every piece this codebase needs to actually
// submit a Bitcoin transaction — plan, PSBT, wallet signature, independent
// inspection, cryptographic finalization, broadcast — but left them
// unconnected, six separate classes a caller had to wire by hand, and
// wired to nothing that produces a real `core/PublicationAnchor.js`. This
// class is that connective tissue, and NOTHING else: it adds no new
// Bitcoin primitive, no new cryptography, no new wire format. It composes
// the existing ones into ONE explicit publication action, exactly as
// application/CreateExternalPublicationAnchorUseCase.js (0.8.10) already
// connected `anchoring/BitcoinAnchorPublisher.js` to application/
// CreatePublicationAnchorUseCase.js for the SIMPLER, one-shot-broadcaster
// case — this is the identical connection, for the granular,
// external-wallet case 0.8.47→0.8.52 built:
//
//   Publication contentHash
//           │
//           ▼
//   BitcoinAnchorTransactionBuilder.build()             (0.8.47)
//           │                                    PLAN_FAILED ──┐
//           ▼                                                  │
//   BitcoinAnchorPsbtBuilder.build()                    (0.8.48)
//           │                                                  │
//           ▼                                                  │
//   BitcoinAnchorPsbtSerializer.serialize()             (0.8.49)
//           │  → PSBT_READY                                     │
//           ▼                                                  │
//   BitcoinAnchorWalletSigner.requestSignature()        (0.8.50)
//           │                              SIGNING_UNAVAILABLE ─┤
//           │                                 SIGNATURE_INVALID ┤
//           ▼  → SIGNED                                         │
//   BitcoinAnchorSignedPsbtFinalizer.finalize()         (0.8.51)
//           │                                FINALIZATION_FAILED┤
//           ▼  → FINALIZED                                      │
//   BitcoinAnchorTransactionBroadcaster.broadcast()     (0.8.52)
//           │                            BROADCAST_UNAVAILABLE ─┤
//           │                               BROADCAST_REJECTED ─┤
//           ▼  → BROADCASTED                                    │
//   CreatePublicationAnchorUseCase.execute()             (0.8.8, UNCHANGED)
//           │                                                  │
//           ▼                                                  ▼
//   a real, signed, cataloged PublicationAnchor      { state, reason, ... }
//
// ORCHESTRATION ONLY — NEVER A SECOND IMPLEMENTATION. This class never
// selects UTXOs, never encodes a byte of PSBT, never checks a signature,
// never talks to a network itself, and never constructs a
// `core/PublicationAnchor.js` by hand. Every one of those responsibilities
// stays exactly where 0.8.8 and 0.8.47→0.8.52 already put them; this class
// only sequences calls to them and translates each one's own result into
// application/BitcoinAnchorPublicationLifecycleState.js's own vocabulary.
//
// ONE EXPLICIT ACTION, NOT FIVE. `publishAnchor()` runs the entire
// plan→PSBT→sign→finalize→broadcast sequence in a single call — the
// external, one-way side effects it performs (asking a wallet to sign,
// submitting to the network) are each already a single, explicit
// operation; there is no reason to force a person through five separate
// button-clicks to glue primitives together by hand, which is exactly
// what this milestone exists to make unnecessary. See docs/Roadmap.md,
// 0.8.53.
//
// FAILURES STOP AT THE BOUNDARY THAT PRODUCED THEM — NEVER GUESSED
// PAST. A failure at any stage returns immediately with a `state` naming
// exactly that stage, and `reachedStage` naming the last stage that DID
// succeed (see application/BitcoinAnchorPublicationLifecycleState.js's own
// header). Nothing downstream of a failure is ever attempted: a wallet
// that could not be reached never has its non-existent signature "assumed
// good" so finalization can proceed, and a finalization failure never
// reaches the broadcaster with unfinalized bytes.
//
// BROADCAST ACCEPTANCE IS RECORDED; IT IS NEVER PROMOTED TO CONFIRMATION.
// `BROADCASTED` — and the PublicationAnchor this class creates the moment
// it is reached — means only "ForkBuild associated this content hash with
// this Bitcoin transaction and the network accepted it for broadcast." The
// created anchor is exactly `core/PublicationAnchor.js` already is: a
// signed, durable, catalogued RECORD of that association — this class
// invents no second, parallel "anchor record" schema, because 0.8.0
// already built the one this milestone needed. Whether the transaction
// later gets mined into a block is answered later, separately, by
// application/ExternalAnchorVerifier.js — this class never queries that,
// never is asked to, and never calls anything Esplora-related. See
// docs/Roadmap.md, "0.8.54 — Bitcoin Anchor Confirmation Observation."
//
// WHY `BitcoinAnchorPublisher` IS CONSTRUCTED HERE, FRESH, PER CALL —
// NEVER INJECTED AS A LONG-LIVED DEPENDENCY, AND NEVER A SECOND
// BROADCAST. anchoring/BitcoinAnchorPublisher.js's own job, unchanged
// since 0.8.9, is turning "a contentHash got broadcast" into the exact
// evidence shape (`locator: 'bitcoin:<txid>'`, `proof: { txid, network }`)
// application/CreatePublicationAnchorUseCase.js and anchoring/
// BitcoinOpReturnProofVerifier.js already agree on. This class reuses
// THAT logic rather than re-deriving it by hand — but by the time this
// class reaches that step, the real network submission has ALREADY
// happened, once, via `bitcoinAnchorTransactionBroadcaster.broadcast()`
// (0.8.52), using the real finalized bytes 0.8.51 produced. So the
// `broadcaster` handed to this call's own `BitcoinAnchorPublisher`
// instance is a thin adapter whose `broadcast()` performs NO network
// operation of its own — it hands back the txid/outcome the real
// broadcast a moment earlier already produced. `BitcoinAnchorPublisher`
// never re-broadcasts, never sees the OP_RETURN payload it would
// ordinarily be given (its evidence shape does not depend on it), and is
// never held as shared state across calls — exactly as disposable as the
// tiny, pure `{locator, proof}` transform it exists to perform.
export class BitcoinAnchorPublicationCoordinator {
    // 0.9.512 — Bitcoin Granular Pipeline Anchor Publication Integration.
    //
    // `bitcoinAnchorTransactionBuilder`/`bitcoinAnchorPsbtBuilder`/
    // `bitcoinAnchorPsbtSerializer`/`bitcoinAnchorWalletSigner`/
    // `bitcoinAnchorSignedPsbtFinalizer`/`bitcoinAnchorTransactionBroadcaster`
    // are now OPTIONAL at construction — validated instead, lazily, at the
    // top of `publishAnchor()` below, the one method that actually uses
    // them. This is a construction-time relaxation ONLY; every one of
    // those six checks still runs, with the identical message, before any
    // Bitcoin-specific work begins — a caller of `publishAnchor()` sees no
    // behavior change whatsoever. The reason is `publishBroadcastedAnchor()`
    // below (also new): a composition root wiring THIS class into a real
    // app, eagerly, at startup — exactly how every other coordinator in
    // ui/main.js is already constructed — cannot supply a real
    // `bitcoinAnchorWalletSigner` at that point, because anchoring/
    // BitcoinAnchorWalletSigner.js's own constructor REQUIRES an already-
    // connected `wallet` (throws otherwise), and no wallet is connected
    // until a person acts. A caller that only ever intends to reach the
    // granular-pipeline boundary — the real, production Bitcoin path —
    // never needs to construct a wallet-signing capability this class
    // would only use for its OWN internal, from-scratch signing sequence.
    // `publicationCatalog`/`createPublicationAnchorUseCase` stay required
    // eagerly, unchanged, because BOTH `publishAnchor()` and
    // `publishBroadcastedAnchor()` need them from the very first line.
    // `publicationAnchorCatalog` is a THIRD, newly optional dependency,
    // used only by `publishBroadcastedAnchor()`'s own duplicate-anchor
    // guard — see that method's own header.
    constructor({
        publicationCatalog,
        createPublicationAnchorUseCase,
        publicationAnchorCatalog = null,
        bitcoinAnchorTransactionBuilder = null,
        bitcoinAnchorPsbtBuilder = null,
        bitcoinAnchorPsbtSerializer = null,
        bitcoinAnchorWalletSigner = null,
        bitcoinAnchorSignedPsbtFinalizer = null,
        bitcoinAnchorTransactionBroadcaster = null
    } = {}) {
        if (!publicationCatalog || typeof publicationCatalog.get !== 'function') {
            throw new Error('BitcoinAnchorPublicationCoordinator: a publication catalog is required');
        }
        if (!createPublicationAnchorUseCase || typeof createPublicationAnchorUseCase.execute !== 'function') {
            throw new Error('BitcoinAnchorPublicationCoordinator: a CreatePublicationAnchorUseCase is required');
        }
        this._publicationCatalog = publicationCatalog;
        this._createPublicationAnchorUseCase = createPublicationAnchorUseCase;
        this._publicationAnchorCatalog = publicationAnchorCatalog;
        this._bitcoinAnchorTransactionBuilder = bitcoinAnchorTransactionBuilder;
        this._bitcoinAnchorPsbtBuilder = bitcoinAnchorPsbtBuilder;
        this._bitcoinAnchorPsbtSerializer = bitcoinAnchorPsbtSerializer;
        this._bitcoinAnchorWalletSigner = bitcoinAnchorWalletSigner;
        this._bitcoinAnchorSignedPsbtFinalizer = bitcoinAnchorSignedPsbtFinalizer;
        this._bitcoinAnchorTransactionBroadcaster = bitcoinAnchorTransactionBroadcaster;
    }

    // Runs the full plan→PSBT→sign→finalize→broadcast→anchor sequence for
    // `publicationId`, using externally supplied funding/signing material
    // — never anything this class invents (see anchoring/
    // BitcoinAnchorTransactionBuilder.js and anchoring/
    // BitcoinAnchorPsbtBuilder.js's own headers on why `utxos`,
    // `changeAddress`, `utxoDetails`, and `changeScriptPubKey` always stay
    // the caller's own). `contentHash` is deliberately NOT an option — it
    // is always the looked-up publication's own `contentReference.hash`,
    // the identical restraint application/
    // CreateExternalPublicationAnchorUseCase.js already holds.
    //
    // Resolves to exactly one of:
    //
    //   { state: BROADCASTED, reachedStage: BROADCASTED, reason: null,
    //     contentHash, unsignedPsbt, txid, anchor }
    //   { state: <failure state>, reachedStage, reason,
    //     contentHash, unsignedPsbt, txid, anchor: null }
    //
    // `unsignedPsbt` (`{ bytes, hex, base64 }`) is present on every outcome
    // from PSBT_READY onward — a caller can always inspect or export the
    // unsigned PSBT, even when a later stage failed. `txid` is present
    // from FINALIZED onward — the finalizer derives it cryptographically,
    // independent of whether broadcasting itself later succeeds.
    //
    // Throws only for a caller-contract violation checked before any
    // Bitcoin-specific work begins (an unknown `publicationId`) or one a
    // downstream class itself already throws for on malformed
    // caller-supplied data (e.g. malformed `utxoDetails` —
    // BitcoinAnchorPsbtBuilder's own contract) — never for an operational
    // Bitcoin-network outcome, which is always reported via `state`.
    async publishAnchor(publicationId, { utxos, changeAddress, utxoDetails, changeScriptPubKey } = {}) {
        // 0.9.512 — moved here, verbatim, from the constructor — see this
        // class's own constructor header on why. Still checked before any
        // Bitcoin-specific work begins, still the identical message, still
        // never reached by `publishBroadcastedAnchor()` below, which needs
        // none of these six collaborators.
        if (!this._bitcoinAnchorTransactionBuilder || typeof this._bitcoinAnchorTransactionBuilder.build !== 'function') {
            throw new Error('BitcoinAnchorPublicationCoordinator: a BitcoinAnchorTransactionBuilder is required');
        }
        if (!this._bitcoinAnchorPsbtBuilder || typeof this._bitcoinAnchorPsbtBuilder.build !== 'function') {
            throw new Error('BitcoinAnchorPublicationCoordinator: a BitcoinAnchorPsbtBuilder is required');
        }
        if (!this._bitcoinAnchorPsbtSerializer || typeof this._bitcoinAnchorPsbtSerializer.serialize !== 'function') {
            throw new Error('BitcoinAnchorPublicationCoordinator: a BitcoinAnchorPsbtSerializer is required');
        }
        if (!this._bitcoinAnchorWalletSigner || typeof this._bitcoinAnchorWalletSigner.requestSignature !== 'function') {
            throw new Error('BitcoinAnchorPublicationCoordinator: a BitcoinAnchorWalletSigner is required');
        }
        if (!this._bitcoinAnchorSignedPsbtFinalizer || typeof this._bitcoinAnchorSignedPsbtFinalizer.finalize !== 'function') {
            throw new Error('BitcoinAnchorPublicationCoordinator: a BitcoinAnchorSignedPsbtFinalizer is required');
        }
        if (!this._bitcoinAnchorTransactionBroadcaster || typeof this._bitcoinAnchorTransactionBroadcaster.broadcast !== 'function') {
            throw new Error('BitcoinAnchorPublicationCoordinator: a BitcoinAnchorTransactionBroadcaster is required');
        }

        const publication = this._publicationCatalog.get(publicationId);
        if (!publication) {
            throw new Error(`BitcoinAnchorPublicationCoordinator: publication ${publicationId} not found`);
        }
        const contentHash = publication.contentReference.hash;

        // Stage 1 — transaction plan (0.8.47). Only stage with an
        // operational failure of its own (e.g. insufficient funds) rather
        // than a caller-contract violation.
        const plan = this._bitcoinAnchorTransactionBuilder.build({ contentHash, utxos, changeAddress });
        if (!plan.built) {
            return this._outcome(BitcoinAnchorPublicationLifecycleState.PLAN_FAILED, {
                reachedStage: null, reason: plan.reason, contentHash
            });
        }

        // Stage 2 — PSBT description + real BIP174 bytes (0.8.48/0.8.49).
        const description = this._bitcoinAnchorPsbtBuilder.build({ plan, utxoDetails, changeScriptPubKey });
        const unsignedPsbt = this._bitcoinAnchorPsbtSerializer.serialize(description);

        // Stage 3 — external wallet signing, independently inspected (0.8.50).
        const signResult = await this._bitcoinAnchorWalletSigner.requestSignature({ description });
        if (!signResult.signed) {
            const state = signResult.unavailable
                ? BitcoinAnchorPublicationLifecycleState.SIGNING_UNAVAILABLE
                : BitcoinAnchorPublicationLifecycleState.SIGNATURE_INVALID;
            return this._outcome(state, {
                reachedStage: BitcoinAnchorPublicationLifecycleState.PSBT_READY,
                reason: signResult.reason, contentHash, unsignedPsbt
            });
        }

        // Stage 4 — cryptographic finalization (0.8.51).
        const finalized = this._bitcoinAnchorSignedPsbtFinalizer.finalize({ description, signedPsbt: signResult.psbt });
        if (!finalized.finalized) {
            return this._outcome(BitcoinAnchorPublicationLifecycleState.FINALIZATION_FAILED, {
                reachedStage: BitcoinAnchorPublicationLifecycleState.SIGNED,
                reason: finalized.reason, contentHash, unsignedPsbt
            });
        }

        // Stage 5 — broadcast the real, already-finalized bytes (0.8.52),
        // then reconnect that result into anchoring/BitcoinAnchorPublisher.js
        // to derive the SAME evidence shape it has produced since 0.8.9 —
        // see this file's own header on why this never re-broadcasts.
        const pipelineBroadcaster = {
            broadcast: async () => {
                const broadcastResult = await this._bitcoinAnchorTransactionBroadcaster.broadcast({
                    txid: finalized.txid, rawTransaction: finalized.rawTransaction
                });
                if (!broadcastResult.broadcasted) {
                    return { broadcast: false, unavailable: !!broadcastResult.unavailable, reason: broadcastResult.reason };
                }
                return { broadcast: true, txid: broadcastResult.txid };
            }
        };
        const bitcoinAnchorPublisher = new BitcoinAnchorPublisher({ network: plan.network, broadcaster: pipelineBroadcaster });
        const evidence = await bitcoinAnchorPublisher.publish(contentHash);

        if (!evidence.published) {
            const state = evidence.unavailable
                ? BitcoinAnchorPublicationLifecycleState.BROADCAST_UNAVAILABLE
                : BitcoinAnchorPublicationLifecycleState.BROADCAST_REJECTED;
            return this._outcome(state, {
                reachedStage: BitcoinAnchorPublicationLifecycleState.FINALIZED,
                reason: evidence.reason, contentHash, unsignedPsbt, txid: finalized.txid
            });
        }

        // Stage 6 — a durable Bitcoin anchor record. Reuses
        // CreatePublicationAnchorUseCase (0.8.8) UNCHANGED, fed exactly the
        // evidence BitcoinAnchorPublisher itself derived — never a
        // hand-built PublicationAnchor, never a second contentHash
        // derivation. This IS the durable record: a signed, catalogued
        // PublicationAnchor asserting only that ForkBuild associated this
        // contentHash with this Bitcoin transaction — never that Bitcoin
        // has confirmed it. See this file's own header.
        const anchor = this._createPublicationAnchorUseCase.execute(publicationId, {
            anchorType: bitcoinAnchorPublisher.anchorType,
            locator: evidence.locator,
            proof: evidence.proof
        });

        return this._outcome(BitcoinAnchorPublicationLifecycleState.BROADCASTED, {
            reachedStage: BitcoinAnchorPublicationLifecycleState.BROADCASTED,
            reason: null, contentHash, unsignedPsbt, txid: evidence.proof.txid, anchor
        });
    }

    // 0.9.512 — Bitcoin Granular Pipeline Anchor Publication Integration.
    //
    // THE ACTIVATED BRIDGE, REACHED FROM THE REAL, PRODUCTION BITCOIN
    // PATH. `publishAnchor()` above composes six raw anchoring/ primitives
    // directly — a full, self-contained plan→PSBT→sign→finalize→broadcast
    // sequence, still exactly as 0.8.53 built it, still exercised in full
    // by tests/BitcoinAnchorPublicationLifecycle.test.js. But the Bitcoin
    // anchor UI ui/main.js/ui/views/DecentralizedPublicationsView.js
    // actually runs in production does not use those six primitives
    // directly — it runs its OWN, richer, already-reviewed granular
    // pipeline: application/BitcoinAnchorTransactionConstructionCoordinator.js
    // (0.8.61) → application/BitcoinAnchorTransactionReviewCoordinator.js
    // (0.8.62) → application/BitcoinAnchorReviewedSigningCoordinator.js
    // (0.8.62, review-preserving — see anchoring/BitcoinAnchorReviewedPsbtSigner.js's
    // own header) → application/BitcoinAnchorSignedPsbtFinalizationCoordinator.js
    // (0.8.63) → application/BitcoinAnchorBroadcastCoordinator.js (0.8.64).
    // That pipeline could always reach a real BROADCASTED outcome — a real
    // txid, from a real, already-reviewed UniSat signature — but nothing
    // ever turned that fact into a `core/PublicationAnchor.js`; only into
    // application/BitcoinAnchorPublicationRecord.js, a local, UI-level
    // observation-history bookkeeping record (0.8.80), never the generic
    // anchor lifecycle Evidence/Verification already read. This method is
    // the missing connection — not a second Bitcoin anchoring system, and
    // not `publishAnchor()`'s own from-scratch sequence run a second way.
    //
    //   granular pipeline's own real BROADCASTED outcome
    //   { broadcasted: true, txid, network }   (application/
    //                                            BitcoinAnchorBroadcastCoordinator.js,
    //                                            0.8.64, UNCHANGED)
    //           │
    //           │ called ONCE, immediately, by the SAME UI action that just
    //           │ observed that outcome — never by a re-render, a `*View()`
    //           │ projection, or any other passive re-observation
    //           ▼
    //   BitcoinAnchorPublicationCoordinator.publishBroadcastedAnchor()  (THIS
    //           │                                                        METHOD)
    //           ▼
    //   anchoring/BitcoinAnchorPublisher.js#publish()     (0.8.9, UNCHANGED —
    //           │                                           the SAME reuse
    //           │                                           `publishAnchor()`
    //           │                                           above already
    //           │                                           performs)
    //           ▼
    //   CreatePublicationAnchorUseCase.execute()           (0.8.8, UNCHANGED)
    //           │
    //           ▼
    //   a real, signed, cataloged PublicationAnchor — immediately visible to
    //   anchoring/BitcoinAnchorEvidenceView.js and anchoring/
    //   BitcoinOpReturnProofVerifier.js, exactly like any other Bitcoin anchor
    //
    // NEVER SIGNS, FINALIZES, OR BROADCASTS ANYTHING. The real broadcast
    // already happened, exactly once, through the granular pipeline's own
    // application/BitcoinAnchorBroadcastCoordinator.js — this method is
    // handed only the FACT that it succeeded (`broadcasted: true` plus the
    // real `txid`/`network` that call itself returned), never a PSBT,
    // never a signature, never a rawTransaction. It constructs a
    // `BitcoinAnchorPublisher` around a broadcaster whose own `broadcast()`
    // performs NO network operation of its own — it simply hands back the
    // `txid` this method was already given — mirroring EXACTLY why
    // `publishAnchor()` above constructs ITS OWN `BitcoinAnchorPublisher`
    // the identical way, around a broadcaster that has already, separately,
    // performed the real submission (see this file's own top-of-file
    // header, "WHY BitcoinAnchorPublisher IS CONSTRUCTED HERE, FRESH, PER
    // CALL"). This is the ONE, and only, reason UniSat/the granular
    // pipeline remains the sole real Bitcoin write path: this method adds
    // no second one.
    //
    // THE LIFECYCLE BOUNDARY THIS METHOD REQUIRES IS EXACTLY BROADCASTED —
    // NEVER EARLIER, NEVER A SEPARATE CONFIRMATION. Mirrors `publishAnchor()`
    // above precisely: a `core/PublicationAnchor.js` is minted the moment
    // broadcast is accepted, never delayed for confirmation — see this
    // file's own header, "BROADCAST ACCEPTANCE IS RECORDED; IT IS NEVER
    // PROMOTED TO CONFIRMATION." Whether the transaction later gets mined
    // is answered later, separately, and unchanged, by application/
    // BitcoinAnchorConfirmationCoordinator.js / anchoring/
    // BitcoinOpReturnProofVerifier.js — this method never touches either.
    // `broadcasted` must be exactly `true` — a caller-contract check, thrown
    // before this publication's identity is even looked up, mirroring
    // exactly how application/BitcoinAnchorBroadcastCoordinator.js#broadcast()
    // itself requires `finalized === true` before it ever calls a real
    // broadcaster.
    //
    // NO DUPLICATE ANCHOR FROM REPEATED OBSERVATION. When this coordinator
    // was constructed with a `publicationAnchorCatalog` (optional — see
    // this class's own constructor header), a second call naming the exact
    // same `publicationId`/`txid` returns the ALREADY-cataloged anchor
    // unchanged rather than minting a second one — protecting against a
    // caller-side bug (a UI action accidentally re-invoked, a duplicate
    // event) rather than requiring every caller to hold its own guard.
    // Without one supplied, this method behaves exactly like `publishAnchor()`
    // always has — it mints unconditionally — preserving this class's own
    // pre-0.9.512 behavior for any existing caller that never passed one.
    //
    // Resolves to exactly one of:
    //
    //   { state: BROADCASTED, reachedStage: BROADCASTED, reason: null,
    //     contentHash, unsignedPsbt: null, txid, anchor }
    //
    // (`unsignedPsbt` is always `null` here — no PSBT was ever built by
    // this method; a caller wanting to inspect the one the granular
    // pipeline itself produced already has it from that pipeline's own
    // review/finalization outcomes.)
    //
    // Throws only for a caller-contract violation checked BEFORE this
    // publication's identity is ever looked up — `broadcasted` is not
    // `true`, or `txid` is missing — or an unknown `publicationId`, the
    // identical check `publishAnchor()` above already performs. Never
    // throws for an operational Bitcoin-network outcome; there is none
    // left for this method to report — the network was already, separately,
    // asked, by the granular pipeline's own broadcast coordinator.
    async publishBroadcastedAnchor(publicationId, { broadcasted, txid, network } = {}) {
        if (broadcasted !== true) {
            throw new Error('BitcoinAnchorPublicationCoordinator: broadcasted must be true — broadcast a transaction through the granular Bitcoin pipeline before ever requesting anchor publication');
        }
        if (typeof txid !== 'string' || !txid) {
            throw new Error('BitcoinAnchorPublicationCoordinator: txid is required — broadcast a transaction before ever requesting anchor publication');
        }

        const publication = this._publicationCatalog.get(publicationId);
        if (!publication) {
            throw new Error(`BitcoinAnchorPublicationCoordinator: publication ${publicationId} not found`);
        }
        const contentHash = publication.contentReference.hash;
        const locator = `bitcoin:${txid}`;

        if (this._publicationAnchorCatalog && typeof this._publicationAnchorCatalog.findByPublicationId === 'function') {
            const existing = this._publicationAnchorCatalog.findByPublicationId(publicationId)
                .find((candidate) => candidate.locator === locator);
            if (existing) {
                return this._outcome(BitcoinAnchorPublicationLifecycleState.BROADCASTED, {
                    reachedStage: BitcoinAnchorPublicationLifecycleState.BROADCASTED,
                    reason: null, contentHash, unsignedPsbt: null, txid, anchor: existing
                });
            }
        }

        // A thin, no-network broadcaster — see this method's own header,
        // "NEVER SIGNS, FINALIZES, OR BROADCASTS ANYTHING" — that only ever
        // hands back the `txid` the granular pipeline's own real broadcast
        // already produced, so this call can reuse anchoring/
        // BitcoinAnchorPublisher.js's own evidence-shape derivation
        // (`locator: 'bitcoin:<txid>'`, `proof: { txid, network }`)
        // unchanged, rather than re-deriving it a second time here.
        const passthroughBroadcaster = { async broadcast() { return { broadcast: true, txid }; } };
        const bitcoinAnchorPublisher = new BitcoinAnchorPublisher({ network, broadcaster: passthroughBroadcaster });
        const evidence = await bitcoinAnchorPublisher.publish(contentHash);

        // Stage 6 — the identical durable-record creation `publishAnchor()`
        // above performs, reusing CreatePublicationAnchorUseCase (0.8.8)
        // UNCHANGED, fed exactly the evidence BitcoinAnchorPublisher itself
        // derived. See this file's own header on Stage 6, above.
        const anchor = this._createPublicationAnchorUseCase.execute(publicationId, {
            anchorType: bitcoinAnchorPublisher.anchorType,
            locator: evidence.locator,
            proof: evidence.proof
        });

        return this._outcome(BitcoinAnchorPublicationLifecycleState.BROADCASTED, {
            reachedStage: BitcoinAnchorPublicationLifecycleState.BROADCASTED,
            reason: null, contentHash, unsignedPsbt: null, txid: evidence.proof.txid, anchor
        });
    }

    _outcome(state, { reachedStage = null, reason = null, contentHash, unsignedPsbt = null, txid = null, anchor = null }) {
        return { state, reachedStage, reason, contentHash, unsignedPsbt, txid, anchor };
    }
}
