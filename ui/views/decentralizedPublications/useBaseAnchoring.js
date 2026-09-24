import { inject, reactive } from 'vue';
import { BaseWalletConnectionState } from '../../../application/BaseWalletConnectionState.js';
import { describeBaseWalletConnection } from '../../../application/BaseWalletConnectionView.js';
import {
    BASE_WALLET_CONNECTION_BADGE_CLASSES, BASE_ACCOUNT_OBSERVATION_BADGE_CLASSES,
    BASE_PUBLICATION_TRANSACTION_PLAN_BADGE_CLASSES, CREATION_BADGE_CLASSES,
    BASE_REVIEWED_SIGNING_BADGE_CLASSES, BASE_SIGNED_TRANSACTION_FINALIZATION_BADGE_CLASSES,
    BASE_TRANSACTION_BROADCAST_BADGE_CLASSES, BASE_TRANSACTION_INCLUSION_BADGE_CLASSES
} from './presentation.js';
import { describeBaseAccountObservation } from '../../../application/BaseAccountObservationView.js';
import { BaseNetworkObservationState } from '../../../application/BaseNetworkObservationState.js';
import { BasePublicationTransactionPlanState } from '../../../application/BasePublicationTransactionPlanState.js';
import { describeBasePublicationTransactionPlan } from '../../../application/BasePublicationTransactionPlanView.js';
import { describeBasePublicationTransactionReview } from '../../../application/BasePublicationTransactionReview.js';
import { ExternalAnchorCreationOutcome } from '../../../application/ExternalAnchorCreationOutcome.js';
import {
    describeCreationAttempt, describeCreationButtonLabel
} from '../../../application/PublicationAnchorCreationView.js';
import { ExternalAnchorCreationUiState } from '../../../application/ExternalAnchorCreationUiState.js';
import { BaseReviewedSigningState } from '../../../application/BaseReviewedSigningState.js';
import { describeBaseReviewedSigning } from '../../../application/BaseReviewedSigningView.js';
import { BaseSignedTransactionFinalizationState } from '../../../application/BaseSignedTransactionFinalizationState.js';
import {
    describeBaseSignedTransactionFinalization
} from '../../../application/BaseSignedTransactionFinalizationView.js';
import { BaseTransactionBroadcastState } from '../../../application/BaseTransactionBroadcastState.js';
import { describeBaseTransactionBroadcast } from '../../../application/BaseTransactionBroadcastView.js';
import {
    appendBaseTransactionInclusionObservationHistoryEntry
} from '../../../application/BaseTransactionInclusionObservationHistory.js';
import {
    describeBaseTransactionInclusionObservation, describeBaseTransactionInclusionObservationHistory
} from '../../../application/BaseTransactionInclusionObservationView.js';

// Base anchoring for the Decentralized Publications page: wallet connection,
// account observation, and the per-entry plan / sign / finalize / broadcast /
// inclusion pipeline (or the one-step baseAnchorPublisher path). Every step runs
// only on an explicit click.
export function useBaseAnchoring({
    archiveBaseAnchorPublicationRecord, archiveBaseTransactionInclusionObservation, loadEvidence,
    persistPublicationObservationArchive, publicationObservationArchive
}) {
    // Page-level and unrelated to the Bitcoin wallet. A Base wallet
    // connection exposes an account address only, never a signing
    // capability; network observations are fresh, explicitly-triggered
    // reads.
    const baseWalletConnection = inject('baseWalletConnection', null);
    const baseNetworkObserver = inject('baseNetworkObserver', null);
    // Requires an already-observed baseAccountObservationState.observation;
    // the coordinator never observes an account itself.
    const basePublicationTransactionPlanCoordinator = inject('basePublicationTransactionPlanCoordinator', null);
    // A signing capability kept separate from baseWalletConnection, which
    // only ever exposes an account.
    const baseInjectedProviderWalletTransactionSigner = inject('baseInjectedProviderWalletTransactionSigner', null);
    const baseReviewedSigningCoordinator = inject('baseReviewedSigningCoordinator', null);
    const baseSignedTransactionFinalizationCoordinator = inject('baseSignedTransactionFinalizationCoordinator', null);
    const baseTransactionBroadcastCoordinator = inject('baseTransactionBroadcastCoordinator', null);
    const baseTransactionInclusionObservationCoordinator = inject('baseTransactionInclusionObservationCoordinator', null);
    // anchoring/BaseAnchorPublisher.js's review-preserving path; the UI
    // never assembles its own sign/finalize/broadcast sequence.
    const baseAnchorPublisher = inject('baseAnchorPublisher', null);

    const baseWalletConnectionState = reactive({
        status: BaseWalletConnectionState.DISCONNECTED,
        account: null,
        reason: null
    });

    const baseAccountObservationState = reactive({
        observing: false,
        observation: null,
        error: null
    });

    // Only on an explicit click; no auto-connect or polling.
    async function connectBaseWallet() {
        if (!baseWalletConnection) return;
        baseWalletConnectionState.status = BaseWalletConnectionState.CONNECTING;
        baseWalletConnectionState.reason = null;
        let result;
        try {
            result = await baseWalletConnection.connect();
        } catch (error) {
            baseWalletConnectionState.status = baseWalletConnection.status;
            baseWalletConnectionState.account = null;
            baseWalletConnectionState.reason = error.message;
            return;
        }
        baseWalletConnectionState.status = baseWalletConnection.status;
        baseWalletConnectionState.account = baseWalletConnection.account;
        baseWalletConnectionState.reason = result.connected ? null : result.reason;
    }

    // Local-only (see base/BaseWalletConnection.js).
    function disconnectBaseWallet() {
        if (!baseWalletConnection) return;
        baseWalletConnection.disconnect();
        baseWalletConnectionState.status = baseWalletConnection.status;
        baseWalletConnectionState.account = null;
        baseWalletConnectionState.reason = null;
        // The last observation stays visible as a dated fact, but is never
        // re-fetched for the next wallet.
    }

    function baseWalletConnectionView() {
        return describeBaseWalletConnection(baseWalletConnectionState);
    }

    function baseWalletConnectionBadgeClass() {
        return BASE_WALLET_CONNECTION_BADGE_CLASSES[baseWalletConnectionView().state] || 'peer-badge--pending';
    }

    function isBaseWalletConnected() {
        return baseWalletConnectionView().state === BaseWalletConnectionState.CONNECTED;
    }

    function isBaseWalletConnecting() {
        return baseWalletConnectionView().state === BaseWalletConnectionState.CONNECTING;
    }

    // Only on an explicit click. Each observation replaces the previous one
    // wholesale.
    async function observeBaseAccount() {
        if (!baseNetworkObserver || !isBaseWalletConnected()) return;
        baseAccountObservationState.observing = true;
        baseAccountObservationState.error = null;
        let observation;
        try {
            observation = await baseNetworkObserver.observeAccount({ address: baseWalletConnectionState.account });
        } catch (error) {
            baseAccountObservationState.observing = false;
            baseAccountObservationState.error = error.message;
            return;
        }
        baseAccountObservationState.observing = false;
        baseAccountObservationState.observation = observation;
    }

    function baseAccountObservationView() {
        if (!baseAccountObservationState.observation) return null;
        return describeBaseAccountObservation(baseAccountObservationState.observation);
    }

    function baseAccountObservationBadgeClass() {
        const view = baseAccountObservationView();
        if (!view) return 'peer-badge--pending';
        return BASE_ACCOUNT_OBSERVATION_BADGE_CLASSES[view.state] || 'peer-badge--pending';
    }

    function isBaseAccountObserved() {
        const view = baseAccountObservationView();
        return Boolean(view && view.state === BaseNetworkObservationState.OBSERVED);
    }

    // Only on an explicit click, one entry at a time; this awaits real Base
    // RPC reads. Uses the account observation exactly as last observed,
    // never re-observing on the entry's behalf. A thrown error (e.g. no
    // account observed yet) becomes a FAILED outcome here.
    async function constructBasePublicationTransaction(entry) {
        if (!basePublicationTransactionPlanCoordinator) return;
        entry.basePublicationTransactionConstruction = { state: BasePublicationTransactionPlanState.CONSTRUCTING, construction: null, reason: null };
        // A new plan starts unsigned, unfinalized and unbroadcast; clear
        // the later steps' outcomes.
        entry.baseReviewedTransactionSigningOutcome = null;
        entry.baseSignedTransactionFinalizationOutcome = null;
        entry.baseTransactionBroadcastOutcome = null;
        entry.baseTransactionInclusionOutcome = null;
        entry.baseTransactionInclusionHistory = [];
        entry.baseTransactionInclusionObserving = false;
        entry.baseTransactionInclusionError = null;
        try {
            entry.basePublicationTransactionConstruction = await basePublicationTransactionPlanCoordinator.construct({
                publicationId: entry.publication.id,
                contentHash: entry.publication.contentReference.hash,
                accountObservation: baseAccountObservationState.observation
            });
        } catch (error) {
            entry.basePublicationTransactionConstruction = { state: BasePublicationTransactionPlanState.FAILED, construction: null, reason: error.message };
        }
    }

    function basePublicationTransactionPlanView(entry) {
        if (!entry.basePublicationTransactionConstruction) return null;
        return describeBasePublicationTransactionPlan(entry.basePublicationTransactionConstruction);
    }

    function basePublicationTransactionPlanBadgeClass(entry) {
        const view = basePublicationTransactionPlanView(entry);
        if (!view) return 'peer-badge--pending';
        return BASE_PUBLICATION_TRANSACTION_PLAN_BADGE_CLASSES[view.state] || 'peer-badge--pending';
    }

    // Reviewing a Base plan needs no extra step or collaborator: the
    // constructed plan already carries everything, so the review is a pure
    // projection, available as soon as construction reaches CONSTRUCTED.
    function basePublicationTransactionReviewView(entry) {
        if (!entry.basePublicationTransactionConstruction) return null;
        if (entry.basePublicationTransactionConstruction.state !== BasePublicationTransactionPlanState.CONSTRUCTED) return null;
        return describeBasePublicationTransactionReview(entry.basePublicationTransactionConstruction.construction.plan);
    }

    // An alternative to the granular sign/finalize/broadcast pipeline
    // below, not a replacement. Hands baseAnchorPublisher.publish() the
    // exact plan and reviewedTransaction the review card rendered (never a
    // bare contentHash); the publisher signs, finalizes, broadcasts and
    // catalogs the anchor. Outcomes use the same creation vocabulary as the
    // other anchor types.
    async function createBaseAnchor(entry) {
        if (!baseAnchorPublisher) return;
        const review = basePublicationTransactionReviewView(entry);
        if (!review || entry.basePublicationTransactionConstruction.state !== BasePublicationTransactionPlanState.CONSTRUCTED) return;
        const plan = entry.basePublicationTransactionConstruction.construction.plan;

        entry.baseAnchorCreationAttempt = { creating: true, outcome: null, anchor: null, reason: null, error: null };
        try {
            const result = await baseAnchorPublisher.publish(entry.publication.id, {
                contentHash: entry.publication.contentReference.hash,
                wallet: baseInjectedProviderWalletTransactionSigner,
                plan,
                reviewedTransaction: review,
                archive: publicationObservationArchive.value
            });

            if (result.published) {
                // result.archive is a new archive that already holds the
                // Base publication record.
                publicationObservationArchive.value = result.archive;
                persistPublicationObservationArchive();
                entry.baseAnchorCreationAttempt = {
                    creating: false, outcome: ExternalAnchorCreationOutcome.CREATED, anchor: result.anchor, reason: null, error: null
                };
                // Re-discover so the new anchor appears in the evidence
                // list.
                loadEvidence(entry);
                entry.evidenceExpanded = true;
            } else {
                const outcome = result.unavailable ? ExternalAnchorCreationOutcome.PUBLISH_UNAVAILABLE : ExternalAnchorCreationOutcome.PUBLISH_REJECTED;
                entry.baseAnchorCreationAttempt = { creating: false, outcome, anchor: null, reason: result.reason, error: null };
            }
        } catch (error) {
            // A thrown error (e.g. the plan drifted from what was reviewed)
            // never reached a wallet or the network.
            entry.baseAnchorCreationAttempt = { creating: false, outcome: null, anchor: null, reason: null, error: error.message };
        }
    }

    function baseAnchorCreationView(entry) {
        return describeCreationAttempt(entry.baseAnchorCreationAttempt);
    }

    function baseAnchorCreationBadgeClass(entry) {
        return CREATION_BADGE_CLASSES[baseAnchorCreationView(entry).state] || null;
    }

    function baseAnchorCreationButtonLabel(entry) {
        const view = baseAnchorCreationView(entry);
        const hasExisting = entry.evidenceAnchors.some((anchor) => anchor.anchorType === 'base');
        return describeCreationButtonLabel('Base', { creating: view.state === ExternalAnchorCreationUiState.CREATING, hasExisting });
    }

    // The only place this page signs a Base transaction, on an explicit
    // click, with the exact plan and reviewed transaction on screen (the
    // signer refuses a plan that drifted from the review). Every click is a
    // fresh attempt: no automatic retry, reconnect or re-construction.
    async function signBaseReviewedTransaction(entry) {
        if (!baseReviewedSigningCoordinator) return;
        const review = basePublicationTransactionReviewView(entry);
        if (!review || entry.basePublicationTransactionConstruction.state !== BasePublicationTransactionPlanState.CONSTRUCTED) return;
        const plan = entry.basePublicationTransactionConstruction.construction.plan;

        // A new signature clears the later steps' outcomes.
        entry.baseSignedTransactionFinalizationOutcome = null;
        entry.baseTransactionBroadcastOutcome = null;
        entry.baseTransactionInclusionOutcome = null;
        entry.baseTransactionInclusionHistory = [];
        entry.baseTransactionInclusionObserving = false;
        entry.baseTransactionInclusionError = null;
        entry.baseReviewedTransactionSigningOutcome = { state: BaseReviewedSigningState.SIGNING, rawTransaction: null, reason: null };
        try {
            entry.baseReviewedTransactionSigningOutcome = await baseReviewedSigningCoordinator.sign({
                wallet: baseInjectedProviderWalletTransactionSigner,
                plan,
                reviewedTransaction: review
            });
        } catch (error) {
            entry.baseReviewedTransactionSigningOutcome = { state: BaseReviewedSigningState.FAILED, rawTransaction: null, reason: error.message };
        }
    }

    function baseReviewedTransactionSigningView(entry) {
        return describeBaseReviewedSigning(entry.baseReviewedTransactionSigningOutcome || null);
    }

    function baseReviewedTransactionSigningBadgeClass(entry) {
        return BASE_REVIEWED_SIGNING_BADGE_CLASSES[baseReviewedTransactionSigningView(entry).state] || 'peer-badge--pending';
    }

    function isBaseReviewedTransactionSigning(entry) {
        return baseReviewedTransactionSigningView(entry).state === BaseReviewedSigningState.SIGNING;
    }

    // Only on an explicit click, never automatically after SIGNED: a
    // wallet's signature is untrusted until verified. The wallet's raw
    // transaction is passed unmodified with the plan it was signed against.
    // Synchronous; a thrown error becomes FAILED.
    function finalizeBaseSignedTransaction(entry) {
        if (!baseSignedTransactionFinalizationCoordinator) return;
        const signing = baseReviewedTransactionSigningView(entry);
        if (signing.state !== BaseReviewedSigningState.SIGNED) return;
        if (!entry.basePublicationTransactionConstruction || entry.basePublicationTransactionConstruction.state !== BasePublicationTransactionPlanState.CONSTRUCTED) return;
        const plan = entry.basePublicationTransactionConstruction.construction.plan;
        const rawTransaction = entry.baseReviewedTransactionSigningOutcome ? entry.baseReviewedTransactionSigningOutcome.rawTransaction : null;
        if (!rawTransaction) return;

        // A new finalization clears the later steps' outcomes.
        entry.baseTransactionBroadcastOutcome = null;
        entry.baseTransactionInclusionOutcome = null;
        entry.baseTransactionInclusionHistory = [];
        entry.baseTransactionInclusionObserving = false;
        entry.baseTransactionInclusionError = null;
        entry.baseSignedTransactionFinalizationOutcome = { state: BaseSignedTransactionFinalizationState.FINALIZING, finalized: false, finalizedTransaction: null, reason: null };
        try {
            entry.baseSignedTransactionFinalizationOutcome = baseSignedTransactionFinalizationCoordinator.finalize({ plan, rawTransaction });
        } catch (error) {
            entry.baseSignedTransactionFinalizationOutcome = { state: BaseSignedTransactionFinalizationState.FAILED, finalized: false, finalizedTransaction: null, reason: error.message };
            return;
        }

        // Mint the durable Base publication identity here, once, at
        // successful finalization. txid is the finalizer's own computed
        // transactionHash, never a network-returned value; contentHash is
        // the entry's known content reference.
        if (entry.baseSignedTransactionFinalizationOutcome.state === BaseSignedTransactionFinalizationState.FINALIZED) {
            archiveBaseAnchorPublicationRecord({
                contentHash: entry.publication.contentReference.hash,
                txid: entry.baseSignedTransactionFinalizationOutcome.finalizedTransaction.transactionHash,
                network: plan.network,
                createdAt: new Date()
            });
        }
    }

    function baseSignedTransactionFinalizationView(entry) {
        return describeBaseSignedTransactionFinalization(entry.baseSignedTransactionFinalizationOutcome || null);
    }

    function baseSignedTransactionFinalizationBadgeClass(entry) {
        return BASE_SIGNED_TRANSACTION_FINALIZATION_BADGE_CLASSES[baseSignedTransactionFinalizationView(entry).state] || 'peer-badge--pending';
    }

    // Only on an explicit click, with this entry's own finalized
    // transaction. No automatic retry; resubmitting the same finalized
    // bytes is safe. A thrown error becomes FAILED.
    async function broadcastBaseTransaction(entry) {
        if (!baseTransactionBroadcastCoordinator) return;
        const finalization = baseSignedTransactionFinalizationView(entry);
        if (finalization.state !== BaseSignedTransactionFinalizationState.FINALIZED) return;
        const finalizedTransaction = entry.baseSignedTransactionFinalizationOutcome
            ? entry.baseSignedTransactionFinalizationOutcome.finalizedTransaction
            : null;
        if (!finalizedTransaction) return;

        // A new broadcast makes earlier inclusion observations stale.
        entry.baseTransactionInclusionOutcome = null;
        entry.baseTransactionInclusionHistory = [];
        entry.baseTransactionInclusionObserving = false;
        entry.baseTransactionInclusionError = null;
        entry.baseTransactionBroadcastOutcome = { state: BaseTransactionBroadcastState.BROADCASTING, broadcasted: false, txid: null, reason: null };
        try {
            entry.baseTransactionBroadcastOutcome = await baseTransactionBroadcastCoordinator.broadcast({
                finalized: true,
                finalizedTransaction
            });
        } catch (error) {
            entry.baseTransactionBroadcastOutcome = { state: BaseTransactionBroadcastState.FAILED, broadcasted: false, txid: null, reason: error.message };
        }
    }

    function baseTransactionBroadcastView(entry) {
        return describeBaseTransactionBroadcast(entry.baseTransactionBroadcastOutcome || null);
    }

    function baseTransactionBroadcastBadgeClass(entry) {
        return BASE_TRANSACTION_BROADCAST_BADGE_CLASSES[baseTransactionBroadcastView(entry).state] || 'peer-badge--pending';
    }

    function isBaseTransactionBroadcasting(entry) {
        return baseTransactionBroadcastView(entry).state === BaseTransactionBroadcastState.BROADCASTING;
    }

    // Only on an explicit click, with the txid bound to this entry's own
    // BROADCASTED outcome (broadcasted: true is the proof the coordinator
    // checks). Every click appends a fresh observation, even when nothing
    // changed.
    async function observeBaseTransactionInclusion(entry) {
        if (!baseTransactionInclusionObservationCoordinator) return;
        const broadcast = baseTransactionBroadcastView(entry);
        if (broadcast.state !== BaseTransactionBroadcastState.BROADCASTED || !broadcast.txid) return;

        entry.baseTransactionInclusionObserving = true;
        entry.baseTransactionInclusionError = null;
        try {
            const observation = await baseTransactionInclusionObservationCoordinator.observeInclusion({
                broadcasted: true,
                txid: broadcast.txid
            });
            entry.baseTransactionInclusionOutcome = observation;
            entry.baseTransactionInclusionHistory =
                appendBaseTransactionInclusionObservationHistoryEntry(entry.baseTransactionInclusionHistory || [], observation);
            // Archived under the same txid as the broadcast.
            archiveBaseTransactionInclusionObservation(broadcast.txid, observation);
        } catch (error) {
            entry.baseTransactionInclusionError = error.message;
        } finally {
            entry.baseTransactionInclusionObserving = false;
        }
    }

    function baseTransactionInclusionView(entry) {
        return describeBaseTransactionInclusionObservation(entry.baseTransactionInclusionOutcome || null);
    }

    function baseTransactionInclusionBadgeClass(entry) {
        const view = baseTransactionInclusionView(entry);
        return view ? (BASE_TRANSACTION_INCLUSION_BADGE_CLASSES[view.state] || null) : null;
    }

    function isBaseTransactionInclusionObserving(entry) {
        return Boolean(entry.baseTransactionInclusionObserving);
    }

    function baseTransactionInclusionHistoryView(entry) {
        return describeBaseTransactionInclusionObservationHistory(entry.baseTransactionInclusionHistory || []);
    }

    function toggleBaseTransactionInclusionHistory(entry) {
        entry.baseTransactionInclusionHistoryExpanded = !entry.baseTransactionInclusionHistoryExpanded;
    }

    return {
        baseWalletConnection, baseNetworkObserver, basePublicationTransactionPlanCoordinator,
        baseInjectedProviderWalletTransactionSigner, baseReviewedSigningCoordinator,
        baseSignedTransactionFinalizationCoordinator, baseTransactionBroadcastCoordinator,
        baseTransactionInclusionObservationCoordinator, baseAnchorPublisher, baseWalletConnectionState,
        baseAccountObservationState, connectBaseWallet, disconnectBaseWallet, baseWalletConnectionView,
        baseWalletConnectionBadgeClass, isBaseWalletConnected, isBaseWalletConnecting, observeBaseAccount,
        baseAccountObservationView, baseAccountObservationBadgeClass, isBaseAccountObserved,
        constructBasePublicationTransaction, basePublicationTransactionPlanView,
        basePublicationTransactionPlanBadgeClass, basePublicationTransactionReviewView, createBaseAnchor,
        baseAnchorCreationView, baseAnchorCreationBadgeClass, baseAnchorCreationButtonLabel,
        signBaseReviewedTransaction, baseReviewedTransactionSigningView,
        baseReviewedTransactionSigningBadgeClass, isBaseReviewedTransactionSigning,
        finalizeBaseSignedTransaction, baseSignedTransactionFinalizationView,
        baseSignedTransactionFinalizationBadgeClass, broadcastBaseTransaction, baseTransactionBroadcastView,
        baseTransactionBroadcastBadgeClass, isBaseTransactionBroadcasting, observeBaseTransactionInclusion,
        baseTransactionInclusionView, baseTransactionInclusionBadgeClass, isBaseTransactionInclusionObserving,
        baseTransactionInclusionHistoryView, toggleBaseTransactionInclusionHistory
    };
}
