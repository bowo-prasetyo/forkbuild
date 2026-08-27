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
    constructor({
        publicationCatalog,
        createPublicationAnchorUseCase,
        bitcoinAnchorTransactionBuilder,
        bitcoinAnchorPsbtBuilder,
        bitcoinAnchorPsbtSerializer,
        bitcoinAnchorWalletSigner,
        bitcoinAnchorSignedPsbtFinalizer,
        bitcoinAnchorTransactionBroadcaster
    } = {}) {
        if (!publicationCatalog || typeof publicationCatalog.get !== 'function') {
            throw new Error('BitcoinAnchorPublicationCoordinator: a publication catalog is required');
        }
        if (!createPublicationAnchorUseCase || typeof createPublicationAnchorUseCase.execute !== 'function') {
            throw new Error('BitcoinAnchorPublicationCoordinator: a CreatePublicationAnchorUseCase is required');
        }
        if (!bitcoinAnchorTransactionBuilder || typeof bitcoinAnchorTransactionBuilder.build !== 'function') {
            throw new Error('BitcoinAnchorPublicationCoordinator: a BitcoinAnchorTransactionBuilder is required');
        }
        if (!bitcoinAnchorPsbtBuilder || typeof bitcoinAnchorPsbtBuilder.build !== 'function') {
            throw new Error('BitcoinAnchorPublicationCoordinator: a BitcoinAnchorPsbtBuilder is required');
        }
        if (!bitcoinAnchorPsbtSerializer || typeof bitcoinAnchorPsbtSerializer.serialize !== 'function') {
            throw new Error('BitcoinAnchorPublicationCoordinator: a BitcoinAnchorPsbtSerializer is required');
        }
        if (!bitcoinAnchorWalletSigner || typeof bitcoinAnchorWalletSigner.requestSignature !== 'function') {
            throw new Error('BitcoinAnchorPublicationCoordinator: a BitcoinAnchorWalletSigner is required');
        }
        if (!bitcoinAnchorSignedPsbtFinalizer || typeof bitcoinAnchorSignedPsbtFinalizer.finalize !== 'function') {
            throw new Error('BitcoinAnchorPublicationCoordinator: a BitcoinAnchorSignedPsbtFinalizer is required');
        }
        if (!bitcoinAnchorTransactionBroadcaster || typeof bitcoinAnchorTransactionBroadcaster.broadcast !== 'function') {
            throw new Error('BitcoinAnchorPublicationCoordinator: a BitcoinAnchorTransactionBroadcaster is required');
        }
        this._publicationCatalog = publicationCatalog;
        this._createPublicationAnchorUseCase = createPublicationAnchorUseCase;
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

    _outcome(state, { reachedStage = null, reason = null, contentHash, unsignedPsbt = null, txid = null, anchor = null }) {
        return { state, reachedStage, reason, contentHash, unsignedPsbt, txid, anchor };
    }
}
