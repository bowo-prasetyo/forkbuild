import { inject, reactive, ref } from 'vue';
import { BitcoinWalletConnectionState } from '../../../application/anchoring/bitcoin/BitcoinWalletConnectionState.js';
import { describeBitcoinWalletConnection } from '../../../application/anchoring/bitcoin/BitcoinWalletConnectionView.js';
import {
    BITCOIN_WALLET_CONNECTION_BADGE_CLASSES, BITCOIN_ANCHOR_FUNDING_BADGE_CLASSES,
    BITCOIN_ANCHOR_REVIEWED_SIGNING_BADGE_CLASSES, BITCOIN_ANCHOR_SIGNED_PSBT_FINALIZATION_BADGE_CLASSES,
    CREATION_BADGE_CLASSES, BITCOIN_ANCHOR_BROADCAST_BADGE_CLASSES, BITCOIN_ANCHOR_CONFIRMATION_BADGE_CLASSES,
    BITCOIN_ANCHOR_TRANSACTION_CONSTRUCTION_BADGE_CLASSES
} from './presentation.js';
import { describeBitcoinAnchorTransactionReview } from '../../../application/anchoring/bitcoin/BitcoinAnchorTransactionReviewView.js';
import { describeBitcoinAnchorFunding } from '../../../application/anchoring/bitcoin/BitcoinAnchorFundingView.js';
import { BitcoinAnchorFundingObservationState } from '../../../application/anchoring/bitcoin/BitcoinAnchorFundingObservationState.js';
import {
    BitcoinAnchorTransactionConstructionState
} from '../../../application/anchoring/bitcoin/BitcoinAnchorTransactionConstructionState.js';
import { BitcoinAnchorReviewedSigningState } from '../../../application/anchoring/bitcoin/BitcoinAnchorReviewedSigningState.js';
import { describeBitcoinAnchorReviewedSigning } from '../../../application/anchoring/bitcoin/BitcoinAnchorReviewedSigningView.js';
import {
    BitcoinAnchorSignedPsbtFinalizationState
} from '../../../application/anchoring/bitcoin/BitcoinAnchorSignedPsbtFinalizationState.js';
import {
    describeBitcoinAnchorSignedPsbtFinalization
} from '../../../application/anchoring/bitcoin/BitcoinAnchorSignedPsbtFinalizationView.js';
import { BitcoinAnchorBroadcastState } from '../../../application/anchoring/bitcoin/BitcoinAnchorBroadcastState.js';
import { ExternalAnchorCreationOutcome } from '../../../application/anchoring/ExternalAnchorCreationOutcome.js';
import { describeCreationAttempt } from '../../../application/anchoring/PublicationAnchorCreationView.js';
import { describeBitcoinAnchorBroadcast } from '../../../application/anchoring/bitcoin/BitcoinAnchorBroadcastView.js';
import {
    appendBitcoinAnchorConfirmationObservationHistoryEntry
} from '../../../application/anchoring/bitcoin/BitcoinAnchorConfirmationObservationHistory.js';
import {
    describeBitcoinAnchorConfirmationObservationDetail,
    describeBitcoinAnchorConfirmationObservationHistoryDetails
} from '../../../application/anchoring/bitcoin/BitcoinAnchorConfirmationObservationHistoryDetailView.js';
import {
    describeBitcoinAnchorTransactionConstruction
} from '../../../application/anchoring/bitcoin/BitcoinAnchorTransactionConstructionView.js';

// Bitcoin anchoring for the Publications page: wallet connection, funding
// observation, and the construct / review / sign / finalize / broadcast /
// confirm pipeline for one publication at a time. Each step runs only on an
// explicit click and never advances to the next on its own.
export function useBitcoinAnchoring({
    archiveBitcoinAnchorPublicationRecord, archiveBitcoinBroadcast, archiveBitcoinConfirmationObservation,
    findEntry, loadEvidence
}) {
    // One shared wallet connection for the whole page (connecting once
    // shows everywhere), and the only place this page asks a browser wallet
    // for an account or a signing capability. Reading confirmation status
    // needs no wallet.
    const bitcoinWalletConnection = inject('bitcoinWalletConnection', null);
    // Page-level, not per evidence card: funding is prepared for a
    // transaction that has not been built yet. Always a fresh,
    // explicitly-triggered read, never a background poll.
    const bitcoinWalletFundingObserver = inject('bitcoinWalletFundingObserver', null);
    // The Bitcoin anchor pipeline: review coordinator turns a constructed
    // plan into a signable PSBT description, then signing, finalization,
    // broadcast and confirmation each run on their own explicit click. None
    // of these coordinators advances to the next step on its own.
    const bitcoinAnchorTransactionReviewCoordinator = inject('bitcoinAnchorTransactionReviewCoordinator', null);
    const bitcoinAnchorReviewedSigningCoordinator = inject('bitcoinAnchorReviewedSigningCoordinator', null);
    const bitcoinAnchorSignedPsbtFinalizationCoordinator = inject('bitcoinAnchorSignedPsbtFinalizationCoordinator', null);
    const bitcoinAnchorBroadcastCoordinator = inject('bitcoinAnchorBroadcastCoordinator', null);
    // A separate instance from bitcoinAnchorProofReconciliationView even
    // though both use the same observer: this one only observes the txid of
    // this page's own BROADCASTED outcome, that one a persisted anchor's
    // proof.txid.
    const bitcoinAnchorConfirmationCoordinator = inject('bitcoinAnchorConfirmationCoordinator', null);
    // Mints a real PublicationAnchor after a successful broadcast (via
    // publishBroadcastedAnchor()). Without it, only the local publication
    // record is kept.
    const bitcoinAnchorPublicationCoordinator = inject('bitcoinAnchorPublicationCoordinator', null);
    // Requires an already-observed bitcoinAnchorFundingState.observation;
    // the coordinator never observes funding itself.
    const bitcoinAnchorTransactionConstructionCoordinator = inject('bitcoinAnchorTransactionConstructionCoordinator', null);

    // Wallet, funding, account and pipeline state below is page-level: one
    // wallet and one in-progress transaction per page, not per publication.
    // Vue can't observe a plain class instance's mutations, so each action
    // copies the collaborator's state into these reactive holders after
    // every call.
    const bitcoinWalletConnectionState = reactive({
        status: BitcoinWalletConnectionState.DISCONNECTED,
        account: null,
        network: null,
        reason: null
    });

    // Replaced wholesale by every observation, never merged: each
    // observation is a fresh read.
    const bitcoinAnchorFundingState = reactive({
        observing: false,
        observation: null,
        error: null
    });
    const bitcoinAnchorFundingUtxosExpanded = ref(false);

    // The transaction under review. description is null until a plan is
    // constructed AND bridged to a signable PSBT; reason says why bridging
    // failed (e.g. an account whose scriptPubKey can't be decoded).
    const bitcoinAnchorTransactionReview = reactive({
        description: null,
        publicationId: null,
        reason: null
    });

    // Each pipeline result below is replaced wholesale by its own step and
    // reset to null whenever an earlier step runs again, so a new plan or
    // signature never inherits a later step's outcome from a previous
    // transaction.
    const bitcoinAnchorReviewedSigningOutcome = ref(null);

    const bitcoinAnchorSignedPsbtFinalizationOutcome = ref(null);

    // The exact finalized transaction ({ txid, rawTransaction, finalizedAt
    // }) a broadcast is bound to, kept separate from the finalization
    // outcome so a broadcast is always tied to one specific transaction,
    // never to whatever is on screen.
    const bitcoinAnchorFinalizedTransaction = ref(null);

    const bitcoinAnchorBroadcastOutcome = ref(null);

    // When this replica saw the broadcast settle. The broadcast outcome
    // carries no timestamp, so the page records one; the cross-domain
    // timeline uses it for the session's own broadcast only.
    const bitcoinAnchorBroadcastedAt = ref(null);

    // Result of the automatic publishBroadcastedAnchor() call made once,
    // right after a real BROADCASTED outcome.
    const bitcoinAnchorPublicationAttempt = ref(null);

    // Confirmation of this page's own broadcast txid, written only by an
    // explicit "Observe Confirmation" click. The history is append-only and
    // separate from the per-anchor "Reconcile" histories.
    const bitcoinAnchorBroadcastConfirmationOutcome = ref(null);
    const bitcoinAnchorBroadcastConfirmationHistory = ref([]);
    const bitcoinAnchorBroadcastConfirmationObserving = ref(false);
    const bitcoinAnchorBroadcastConfirmationError = ref(null);
    const bitcoinAnchorBroadcastConfirmationHistoryExpanded = ref(false);
    const bitcoinAnchorBroadcastConfirmationHistoryEntryExpanded = ref({});

    function retireBitcoinAnchorBroadcastConfirmationContext() {
        bitcoinAnchorBroadcastConfirmationOutcome.value = null;
        bitcoinAnchorBroadcastConfirmationHistory.value = [];
        bitcoinAnchorBroadcastConfirmationObserving.value = false;
        bitcoinAnchorBroadcastConfirmationError.value = null;
        bitcoinAnchorBroadcastConfirmationHistoryExpanded.value = false;
        bitcoinAnchorBroadcastConfirmationHistoryEntryExpanded.value = {};
    }

    // Only on an explicit "Connect Bitcoin Wallet" click, never on load.
    // The result is copied into reactive state (see
    // bitcoinWalletConnectionState).
    async function connectBitcoinWallet() {
        if (!bitcoinWalletConnection) return;
        bitcoinWalletConnectionState.status = BitcoinWalletConnectionState.CONNECTING;
        bitcoinWalletConnectionState.reason = null;
        let result;
        try {
            result = await bitcoinWalletConnection.connect();
        } catch (error) {
            // connect() throws only on a provider-contract violation; show
            // it as unavailable rather than "Connecting…" forever.
            bitcoinWalletConnectionState.status = bitcoinWalletConnection.status;
            bitcoinWalletConnectionState.account = null;
            bitcoinWalletConnectionState.network = null;
            bitcoinWalletConnectionState.reason = error.message;
            return;
        }
        bitcoinWalletConnectionState.status = bitcoinWalletConnection.status;
        bitcoinWalletConnectionState.account = bitcoinWalletConnection.account;
        bitcoinWalletConnectionState.network = bitcoinWalletConnection.network;
        bitcoinWalletConnectionState.reason = result.connected ? null : result.reason;
    }

    // Local-only: never claims to revoke the extension's own permission
    // grant.
    function disconnectBitcoinWallet() {
        if (!bitcoinWalletConnection) return;
        bitcoinWalletConnection.disconnect();
        bitcoinWalletConnectionState.status = bitcoinWalletConnection.status;
        bitcoinWalletConnectionState.account = null;
        bitcoinWalletConnectionState.network = null;
        bitcoinWalletConnectionState.reason = null;
    }

    // expectedNetwork is mainnet: this page anchors to Bitcoin mainnet
    // only, so any other wallet network is a mismatch.
    function bitcoinWalletConnectionView() {
        return describeBitcoinWalletConnection(bitcoinWalletConnectionState, { expectedNetwork: 'mainnet' });
    }

    function bitcoinWalletConnectionBadgeClass() {
        return BITCOIN_WALLET_CONNECTION_BADGE_CLASSES[bitcoinWalletConnectionView().state] || 'peer-badge--pending';
    }

    function isBitcoinWalletConnected() {
        return bitcoinWalletConnectionView().state === BitcoinWalletConnectionState.CONNECTED;
    }

    function isBitcoinWalletConnecting() {
        return bitcoinWalletConnectionView().state === BitcoinWalletConnectionState.CONNECTING;
    }

    // null when nothing is awaiting review.
    function bitcoinAnchorTransactionReviewView() {
        if (!bitcoinAnchorTransactionReview || !bitcoinAnchorTransactionReview.description) return null;
        return describeBitcoinAnchorTransactionReview(bitcoinAnchorTransactionReview.description);
    }

    // Checks the wallet against the review's own transaction network, not
    // the page-wide mainnet default. A mismatch is reported, never
    // resolved.
    function bitcoinAnchorTransactionReviewWalletMatchView() {
        const review = bitcoinAnchorTransactionReviewView();
        if (!review || !bitcoinWalletConnection) return null;
        return describeBitcoinWalletConnection(bitcoinWalletConnectionState, { expectedNetwork: review.network });
    }

    // Only on an explicit click, never on connect, load or a timer. Each
    // observation replaces the previous one wholesale.
    async function observeBitcoinAnchorFunding() {
        if (!bitcoinWalletFundingObserver || !isBitcoinWalletConnected()) return;
        bitcoinAnchorFundingState.observing = true;
        bitcoinAnchorFundingState.error = null;
        let observation;
        try {
            observation = await bitcoinWalletFundingObserver.observeFunding({
                account: bitcoinWalletConnectionState.account,
                network: bitcoinWalletConnectionState.network
            });
        } catch (error) {
            bitcoinAnchorFundingState.observing = false;
            bitcoinAnchorFundingState.error = error.message;
            return;
        }
        bitcoinAnchorFundingState.observing = false;
        bitcoinAnchorFundingState.observation = observation;
    }

    function toggleBitcoinAnchorFundingUtxosExpanded() {
        bitcoinAnchorFundingUtxosExpanded.value = !bitcoinAnchorFundingUtxosExpanded.value;
    }

    // expectedNetwork is the connected wallet's current network, so
    // reconnecting on another network after observing funding shows the
    // observation as stale.
    function bitcoinAnchorFundingView() {
        if (!bitcoinAnchorFundingState.observation) return null;
        return describeBitcoinAnchorFunding(bitcoinAnchorFundingState.observation, { expectedNetwork: bitcoinWalletConnectionState.network });
    }

    function bitcoinAnchorFundingBadgeClass() {
        const view = bitcoinAnchorFundingView();
        if (!view) return 'peer-badge--pending';
        return BITCOIN_ANCHOR_FUNDING_BADGE_CLASSES[view.state] || 'peer-badge--pending';
    }

    function isBitcoinAnchorFundingObserved() {
        const view = bitcoinAnchorFundingView();
        return Boolean(view && view.state === BitcoinAnchorFundingObservationState.OBSERVED);
    }

    // Only on an explicit click, one entry at a time. construct() is
    // synchronous; CONSTRUCTING is still set so the slot always holds a
    // named state. Uses the funding observation as last observed (staleness
    // is shown via networkMismatch, never fixed by re-observing). A thrown
    // error becomes FAILED.
    function constructBitcoinAnchorTransaction(entry) {
        if (!bitcoinAnchorTransactionConstructionCoordinator) return;
        entry.bitcoinAnchorTransactionConstruction = { state: BitcoinAnchorTransactionConstructionState.CONSTRUCTING, construction: null, reason: null };
        // A new construction clears the review and every later step.
        bitcoinAnchorTransactionReview.description = null;
        bitcoinAnchorTransactionReview.publicationId = null;
        bitcoinAnchorTransactionReview.reason = null;
        bitcoinAnchorReviewedSigningOutcome.value = null;
        bitcoinAnchorSignedPsbtFinalizationOutcome.value = null;
        bitcoinAnchorFinalizedTransaction.value = null;
        bitcoinAnchorBroadcastOutcome.value = null;
        bitcoinAnchorBroadcastedAt.value = null;
        bitcoinAnchorPublicationAttempt.value = null;
        retireBitcoinAnchorBroadcastConfirmationContext();
        try {
            entry.bitcoinAnchorTransactionConstruction = bitcoinAnchorTransactionConstructionCoordinator.construct({
                publicationId: entry.publication.id,
                contentHash: entry.publication.contentReference.hash,
                fundingObservation: bitcoinAnchorFundingState.observation
            });
        } catch (error) {
            entry.bitcoinAnchorTransactionConstruction = { state: BitcoinAnchorTransactionConstructionState.FAILED, construction: null, reason: error.message };
            return;
        }
        bridgeBitcoinAnchorTransactionToReview(entry);
    }

    // Runs right after a successful construction: reviewing touches no
    // wallet and commits to nothing, so it needs no separate click.
    function bridgeBitcoinAnchorTransactionToReview(entry) {
        if (entry.bitcoinAnchorTransactionConstruction.state !== BitcoinAnchorTransactionConstructionState.CONSTRUCTED) return;
        if (!bitcoinAnchorTransactionReviewCoordinator) return;
        let outcome;
        try {
            outcome = bitcoinAnchorTransactionReviewCoordinator.review({
                construction: entry.bitcoinAnchorTransactionConstruction.construction
            });
        } catch (error) {
            bitcoinAnchorTransactionReview.reason = error.message;
            return;
        }
        if (outcome.reviewable) {
            bitcoinAnchorTransactionReview.description = outcome.description;
            bitcoinAnchorTransactionReview.publicationId = entry.publication.id;
        } else {
            bitcoinAnchorTransactionReview.reason = outcome.reason;
        }
    }

    // Only on an explicit click. The PSBT hex is read from the review at
    // click time, so the bytes on screen are the bytes signed; the signer
    // re-serializes and compares them before asking the wallet. A thrown
    // error becomes FAILED.
    async function signBitcoinAnchorReviewedTransaction() {
        if (!bitcoinAnchorReviewedSigningCoordinator) return;
        const review = bitcoinAnchorTransactionReviewView();
        if (!review || !bitcoinAnchorTransactionReview.description) return;

        // A new signature clears the later steps' outcomes.
        bitcoinAnchorSignedPsbtFinalizationOutcome.value = null;
        bitcoinAnchorFinalizedTransaction.value = null;
        bitcoinAnchorBroadcastOutcome.value = null;
        bitcoinAnchorBroadcastedAt.value = null;
        bitcoinAnchorPublicationAttempt.value = null;
        retireBitcoinAnchorBroadcastConfirmationContext();
        bitcoinAnchorReviewedSigningOutcome.value = { state: BitcoinAnchorReviewedSigningState.SIGNING, psbt: null, signedInputs: null, reason: null };
        try {
            bitcoinAnchorReviewedSigningOutcome.value = await bitcoinAnchorReviewedSigningCoordinator.sign({
                wallet: bitcoinWalletConnection ? bitcoinWalletConnection.wallet : null,
                description: bitcoinAnchorTransactionReview.description,
                reviewedUnsignedPsbtHex: review.unsignedPsbtHex
            });
        } catch (error) {
            bitcoinAnchorReviewedSigningOutcome.value = { state: BitcoinAnchorReviewedSigningState.FAILED, psbt: null, signedInputs: null, reason: error.message };
        }
    }

    function bitcoinAnchorReviewedSigningView() {
        return describeBitcoinAnchorReviewedSigning(bitcoinAnchorReviewedSigningOutcome.value);
    }

    function bitcoinAnchorReviewedSigningBadgeClass() {
        return BITCOIN_ANCHOR_REVIEWED_SIGNING_BADGE_CLASSES[bitcoinAnchorReviewedSigningView().state] || 'peer-badge--pending';
    }

    function isBitcoinAnchorReviewedSigning() {
        return bitcoinAnchorReviewedSigningView().state === BitcoinAnchorReviewedSigningState.SIGNING;
    }

    // Only on an explicit click: a wallet-returned PSBT is untrusted until
    // verified and finalized here. The wallet's PSBT is passed unmodified.
    // Synchronous; a thrown error becomes FAILED.
    function finalizeBitcoinAnchorSignedPsbt() {
        if (!bitcoinAnchorSignedPsbtFinalizationCoordinator) return;
        const signing = bitcoinAnchorReviewedSigningView();
        if (signing.state !== BitcoinAnchorReviewedSigningState.SIGNED) return;
        const signedPsbt = bitcoinAnchorReviewedSigningOutcome.value ? bitcoinAnchorReviewedSigningOutcome.value.psbt : null;
        if (!signedPsbt || !bitcoinAnchorTransactionReview.description) return;

        // A new finalization clears the later steps' outcomes.
        bitcoinAnchorFinalizedTransaction.value = null;
        bitcoinAnchorBroadcastOutcome.value = null;
        bitcoinAnchorBroadcastedAt.value = null;
        bitcoinAnchorPublicationAttempt.value = null;
        retireBitcoinAnchorBroadcastConfirmationContext();
        bitcoinAnchorSignedPsbtFinalizationOutcome.value = { state: BitcoinAnchorSignedPsbtFinalizationState.FINALIZING, finalized: false, txid: null, rawTransaction: null, verifiedInputCount: null, reason: null };
        try {
            bitcoinAnchorSignedPsbtFinalizationOutcome.value = bitcoinAnchorSignedPsbtFinalizationCoordinator.finalize({
                description: bitcoinAnchorTransactionReview.description,
                signedPsbt
            });
        } catch (error) {
            bitcoinAnchorSignedPsbtFinalizationOutcome.value = { state: BitcoinAnchorSignedPsbtFinalizationState.FAILED, finalized: false, txid: null, rawTransaction: null, verifiedInputCount: null, reason: error.message };
            return;
        }

        // Capture the broadcast-eligible transaction from this exact
        // FINALIZED outcome.
        if (bitcoinAnchorSignedPsbtFinalizationOutcome.value.state === BitcoinAnchorSignedPsbtFinalizationState.FINALIZED) {
            bitcoinAnchorFinalizedTransaction.value = Object.freeze({
                txid: bitcoinAnchorSignedPsbtFinalizationOutcome.value.txid,
                rawTransaction: bitcoinAnchorSignedPsbtFinalizationOutcome.value.rawTransaction,
                finalizedAt: Date.now()
            });

            // Mint the durable publication identity here, once, at
            // successful finalization. anchorId is the txid; contentHash
            // comes from the publication, never from the PSBT.
            const finalizedEntry = findEntry(bitcoinAnchorTransactionReview.publicationId);
            if (finalizedEntry) {
                archiveBitcoinAnchorPublicationRecord({
                    anchorId: bitcoinAnchorSignedPsbtFinalizationOutcome.value.txid,
                    contentHash: finalizedEntry.publication.contentReference.hash,
                    txid: bitcoinAnchorSignedPsbtFinalizationOutcome.value.txid,
                    network: bitcoinAnchorTransactionReview.description.network,
                    createdAt: new Date()
                });
            }
        }
    }

    function bitcoinAnchorSignedPsbtFinalizationView() {
        return describeBitcoinAnchorSignedPsbtFinalization(bitcoinAnchorSignedPsbtFinalizationOutcome.value);
    }

    function bitcoinAnchorSignedPsbtFinalizationBadgeClass() {
        return BITCOIN_ANCHOR_SIGNED_PSBT_FINALIZATION_BADGE_CLASSES[bitcoinAnchorSignedPsbtFinalizationView().state] || 'peer-badge--pending';
    }

    // Only on an explicit click, with bitcoinAnchorFinalizedTransaction
    // (never whatever is on screen). No automatic retry; resubmitting the
    // same finalized bytes is safe. A thrown error becomes FAILED.
    async function broadcastBitcoinAnchorTransaction() {
        if (!bitcoinAnchorBroadcastCoordinator) return;
        const bound = bitcoinAnchorFinalizedTransaction.value;
        if (!bound) return;

        bitcoinAnchorBroadcastOutcome.value = { state: BitcoinAnchorBroadcastState.BROADCASTING, broadcasted: false, txid: null, reason: null };
        try {
            bitcoinAnchorBroadcastOutcome.value = await bitcoinAnchorBroadcastCoordinator.broadcast({
                finalized: true,
                txid: bound.txid,
                rawTransaction: bound.rawTransaction
            });
        } catch (error) {
            bitcoinAnchorBroadcastOutcome.value = { state: BitcoinAnchorBroadcastState.FAILED, broadcasted: false, txid: null, reason: error.message };
        }
        bitcoinAnchorBroadcastedAt.value = new Date();
        // Archived durably, keyed by txid.
        archiveBitcoinBroadcast({
            anchorId: bound.txid,
            txid: bitcoinAnchorBroadcastOutcome.value.txid,
            state: bitcoinAnchorBroadcastOutcome.value.state,
            reason: bitcoinAnchorBroadcastOutcome.value.reason,
            broadcastedAt: bitcoinAnchorBroadcastedAt.value
        });

        // Mint the anchor automatically, but only right after this attempt
        // reached a real BROADCASTED; never for a transaction the network
        // didn't accept.
        if (bitcoinAnchorPublicationCoordinator && bitcoinAnchorBroadcastOutcome.value.state === BitcoinAnchorBroadcastState.BROADCASTED) {
            const publicationId = bitcoinAnchorTransactionReview.publicationId;
            const network = bitcoinAnchorTransactionReview.description ? bitcoinAnchorTransactionReview.description.network : null;
            bitcoinAnchorPublicationAttempt.value = { creating: true, outcome: null, anchor: null, reason: null, error: null };
            try {
                const anchorResult = await bitcoinAnchorPublicationCoordinator.publishBroadcastedAnchor(publicationId, {
                    broadcasted: true,
                    txid: bitcoinAnchorBroadcastOutcome.value.txid,
                    network
                });
                bitcoinAnchorPublicationAttempt.value = {
                    creating: false, outcome: ExternalAnchorCreationOutcome.CREATED, anchor: anchorResult.anchor, reason: null, error: null
                };
                // Re-discover so the new anchor appears in the evidence
                // list.
                const broadcastEntry = findEntry(publicationId);
                if (broadcastEntry) {
                    loadEvidence(broadcastEntry);
                    broadcastEntry.evidenceExpanded = true;
                }
            } catch (error) {
                bitcoinAnchorPublicationAttempt.value = { creating: false, outcome: null, anchor: null, reason: null, error: error.message };
            }
        }
    }

    function bitcoinAnchorPublicationView() {
        return describeCreationAttempt(bitcoinAnchorPublicationAttempt.value);
    }

    function bitcoinAnchorPublicationBadgeClass() {
        return CREATION_BADGE_CLASSES[bitcoinAnchorPublicationView().state] || null;
    }

    function bitcoinAnchorBroadcastView() {
        return describeBitcoinAnchorBroadcast(bitcoinAnchorBroadcastOutcome.value);
    }

    function bitcoinAnchorBroadcastBadgeClass() {
        return BITCOIN_ANCHOR_BROADCAST_BADGE_CLASSES[bitcoinAnchorBroadcastView().state] || 'peer-badge--pending';
    }

    function isBitcoinAnchorBroadcasting() {
        return bitcoinAnchorBroadcastView().state === BitcoinAnchorBroadcastState.BROADCASTING;
    }

    // Only on an explicit click, with the txid bound to this page's own
    // BROADCASTED outcome (broadcasted: true is the proof the coordinator
    // checks). Every click appends a fresh observation, even when nothing
    // changed. A thrown error is shown, never swallowed.
    async function observeBitcoinAnchorBroadcastConfirmation() {
        if (!bitcoinAnchorConfirmationCoordinator) return;
        const broadcast = bitcoinAnchorBroadcastView();
        if (broadcast.state !== BitcoinAnchorBroadcastState.BROADCASTED || !broadcast.txid) return;

        bitcoinAnchorBroadcastConfirmationObserving.value = true;
        bitcoinAnchorBroadcastConfirmationError.value = null;
        try {
            const observation = await bitcoinAnchorConfirmationCoordinator.observeConfirmation({
                broadcasted: true,
                txid: broadcast.txid
            });
            bitcoinAnchorBroadcastConfirmationOutcome.value = observation;
            bitcoinAnchorBroadcastConfirmationHistory.value =
                appendBitcoinAnchorConfirmationObservationHistoryEntry(bitcoinAnchorBroadcastConfirmationHistory.value, observation);
            // Archived under the same txid as the broadcast.
            archiveBitcoinConfirmationObservation(broadcast.txid, observation);
        } catch (error) {
            bitcoinAnchorBroadcastConfirmationError.value = error.message;
        } finally {
            bitcoinAnchorBroadcastConfirmationObserving.value = false;
        }
    }

    // null until "Observe Confirmation" has completed for the current
    // broadcast.
    function bitcoinAnchorBroadcastConfirmationView() {
        return describeBitcoinAnchorConfirmationObservationDetail(bitcoinAnchorBroadcastConfirmationOutcome.value);
    }

    function bitcoinAnchorBroadcastConfirmationBadgeClass() {
        const view = bitcoinAnchorBroadcastConfirmationView();
        return view ? (BITCOIN_ANCHOR_CONFIRMATION_BADGE_CLASSES[view.state] || null) : null;
    }

    // Kept separate from the per-anchor "Reconcile" histories.
    function bitcoinAnchorBroadcastConfirmationHistoryView() {
        return describeBitcoinAnchorConfirmationObservationHistoryDetails(bitcoinAnchorBroadcastConfirmationHistory.value);
    }

    function toggleBitcoinAnchorBroadcastConfirmationHistory() {
        bitcoinAnchorBroadcastConfirmationHistoryExpanded.value = !bitcoinAnchorBroadcastConfirmationHistoryExpanded.value;
    }

    function toggleBitcoinAnchorBroadcastConfirmationHistoryEntry(index) {
        bitcoinAnchorBroadcastConfirmationHistoryEntryExpanded.value = {
            ...bitcoinAnchorBroadcastConfirmationHistoryEntryExpanded.value,
            [index]: !bitcoinAnchorBroadcastConfirmationHistoryEntryExpanded.value[index]
        };
    }

    function isBitcoinAnchorBroadcastConfirmationHistoryEntryExpanded(index) {
        return Boolean(bitcoinAnchorBroadcastConfirmationHistoryEntryExpanded.value[index]);
    }

    function bitcoinAnchorTransactionConstructionView(entry) {
        if (!entry.bitcoinAnchorTransactionConstruction) return null;
        return describeBitcoinAnchorTransactionConstruction(entry.bitcoinAnchorTransactionConstruction);
    }

    function bitcoinAnchorTransactionConstructionBadgeClass(entry) {
        const view = bitcoinAnchorTransactionConstructionView(entry);
        if (!view) return 'peer-badge--pending';
        return BITCOIN_ANCHOR_TRANSACTION_CONSTRUCTION_BADGE_CLASSES[view.state] || 'peer-badge--pending';
    }

    return {
        bitcoinWalletConnection, bitcoinWalletFundingObserver, bitcoinAnchorTransactionReviewCoordinator,
        bitcoinAnchorReviewedSigningCoordinator, bitcoinAnchorSignedPsbtFinalizationCoordinator,
        bitcoinAnchorBroadcastCoordinator, bitcoinAnchorConfirmationCoordinator,
        bitcoinAnchorPublicationCoordinator, bitcoinAnchorTransactionConstructionCoordinator,
        bitcoinWalletConnectionState, bitcoinAnchorFundingState, bitcoinAnchorFundingUtxosExpanded,
        bitcoinAnchorTransactionReview, bitcoinAnchorReviewedSigningOutcome,
        bitcoinAnchorSignedPsbtFinalizationOutcome, bitcoinAnchorFinalizedTransaction,
        bitcoinAnchorBroadcastOutcome, bitcoinAnchorBroadcastedAt, bitcoinAnchorPublicationAttempt,
        bitcoinAnchorBroadcastConfirmationOutcome, bitcoinAnchorBroadcastConfirmationHistory,
        bitcoinAnchorBroadcastConfirmationObserving, bitcoinAnchorBroadcastConfirmationError,
        bitcoinAnchorBroadcastConfirmationHistoryExpanded,
        bitcoinAnchorBroadcastConfirmationHistoryEntryExpanded,
        retireBitcoinAnchorBroadcastConfirmationContext, connectBitcoinWallet, disconnectBitcoinWallet,
        bitcoinWalletConnectionView, bitcoinWalletConnectionBadgeClass, isBitcoinWalletConnected,
        isBitcoinWalletConnecting, bitcoinAnchorTransactionReviewView,
        bitcoinAnchorTransactionReviewWalletMatchView, observeBitcoinAnchorFunding,
        toggleBitcoinAnchorFundingUtxosExpanded, bitcoinAnchorFundingView, bitcoinAnchorFundingBadgeClass,
        isBitcoinAnchorFundingObserved, constructBitcoinAnchorTransaction,
        bridgeBitcoinAnchorTransactionToReview, signBitcoinAnchorReviewedTransaction,
        bitcoinAnchorReviewedSigningView, bitcoinAnchorReviewedSigningBadgeClass,
        isBitcoinAnchorReviewedSigning, finalizeBitcoinAnchorSignedPsbt,
        bitcoinAnchorSignedPsbtFinalizationView, bitcoinAnchorSignedPsbtFinalizationBadgeClass,
        broadcastBitcoinAnchorTransaction, bitcoinAnchorPublicationView, bitcoinAnchorPublicationBadgeClass,
        bitcoinAnchorBroadcastView, bitcoinAnchorBroadcastBadgeClass, isBitcoinAnchorBroadcasting,
        observeBitcoinAnchorBroadcastConfirmation, bitcoinAnchorBroadcastConfirmationView,
        bitcoinAnchorBroadcastConfirmationBadgeClass, bitcoinAnchorBroadcastConfirmationHistoryView,
        toggleBitcoinAnchorBroadcastConfirmationHistory, toggleBitcoinAnchorBroadcastConfirmationHistoryEntry,
        isBitcoinAnchorBroadcastConfirmationHistoryEntryExpanded, bitcoinAnchorTransactionConstructionView,
        bitcoinAnchorTransactionConstructionBadgeClass
    };
}
