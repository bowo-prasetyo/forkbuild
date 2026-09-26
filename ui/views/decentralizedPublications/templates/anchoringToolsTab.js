// Publications page template: the Blockchain Anchoring tools tab.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const anchoringToolsTabTemplate = `<div v-show="publicationsToolsTab === 'anchoring'">
            <!-- Batch anchoring: one external recording (one wallet
                 approval) for several publications, for each anchorType
                 whose publisher can (Steem). Each publication still gets its
                 own signed anchor. -->
            <div v-for="batchType in batchAnchorTypes" :key="'batch-' + batchType.anchorType" class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Anchor Several Publications on {{ humanizeAnchorType(batchType.anchorType) }}</span>
                    <span v-if="batchCreationView(batchType.anchorType).label" class="peer-badge" :class="batchCreationBadgeClass(batchType.anchorType)">
                        {{ batchCreationView(batchType.anchorType).label }}
                    </span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Pick publications to anchor together: one transaction carries the Merkle root of their content
                    hashes, so you approve it once, and each publication gets its own signed anchor with its path
                    to that root<template v-if="batchType.maxBatchSize"> (at most {{ batchType.maxBatchSize }} at once)</template>.
                    <template v-if="batchType.anchorType === 'steem'"> Steem anchors are attested by Steem witnesses,
                    not proof of work: use them next to Bitcoin anchors, not instead of them.</template>
                </p>
                <p v-if="entries.length === 0" class="form-hint form-hint--neutral">No publications are cataloged yet.</p>
                <div v-else class="batch-anchoring-list">
                    <label v-for="entry in entries" :key="'batch-' + batchType.anchorType + '-' + entry.publication.id" class="anchor-provider-option">
                        <input type="checkbox" v-model="batchAnchoring[batchType.anchorType].selected[entry.publication.id]" />
                        {{ humanizeContentKind(entry.publication.contentKind) }} · {{ shortHash(entry.publication.contentReference.hash) }}
                        · by {{ shortId(entry.publication.publisherIdentity && entry.publication.publisherIdentity.id) }}
                        <span v-if="hasAnchorOfType(entry, batchType.anchorType)" class="form-hint form-hint--neutral">(already has a {{ humanizeAnchorType(batchType.anchorType) }} anchor)</span>
                    </label>
                </div>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="selectUnanchoredForBatch(batchType.anchorType)">Select Unanchored</button>
                    <button type="button" class="action-btn action-btn--secondary" @click="clearBatchSelection(batchType.anchorType)">Clear</button>
                    <button type="button" class="action-btn action-btn--primary" :disabled="batchButtonDisabled(batchType.anchorType)"
                            @click="createBatchAnchors(batchType.anchorType)">
                        {{ batchButtonLabel(batchType.anchorType) }}
                    </button>
                </div>
                <p v-if="batchSelectedIds(batchType.anchorType).length > batchLimit(batchType.anchorType)" class="form-hint form-hint--neutral">
                    Pick at most {{ batchLimit(batchType.anchorType) }} publications for one transaction.
                </p>
                <p v-if="batchCreationView(batchType.anchorType).message" class="form-hint form-hint--neutral">
                    {{ batchCreationView(batchType.anchorType).message }}
                </p>
                <p v-if="batchCreationView(batchType.anchorType).reason" class="form-hint form-hint--neutral">
                    {{ batchCreationView(batchType.anchorType).reason }}
                </p>
                <p v-if="batchFinality(batchType.anchorType)" class="form-hint form-hint--neutral">
                    <strong>{{ batchFinality(batchType.anchorType).label }}:</strong> {{ batchFinality(batchType.anchorType).message }}
                </p>
            </div>

            <!-- Bitcoin funding: page-level, for a transaction not built yet.
                 Selects and spends nothing. -->
            <div v-if="bitcoinWalletFundingObserver && isBitcoinWalletConnected()" class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Bitcoin Funding</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    What the connected wallet's own account can currently spend, as of the moment this was last
                    observed. Nothing is selected, spent, or committed by observing this — it is a fact about a
                    moment, not a promise about right now.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Network</dt><dd>{{ bitcoinWalletConnectionState.network }}</dd></div>
                    <div class="evidence-field"><dt>Account</dt><dd>{{ shortId(bitcoinWalletConnectionState.account) }}</dd></div>
                </dl>
                <button type="button" class="action-btn action-btn--secondary" :disabled="bitcoinAnchorFundingState.observing" @click="observeBitcoinAnchorFunding">
                    {{ bitcoinAnchorFundingState.observing ? 'Observing…' : (bitcoinAnchorFundingView() ? 'Refresh Funding' : 'Observe Wallet Funding') }}
                </button>
                <p v-if="bitcoinAnchorFundingState.error" class="form-hint form-hint--neutral">{{ bitcoinAnchorFundingState.error }}</p>

                <div v-if="bitcoinAnchorFundingView()" class="evidence-inspection-adapter">
                    <span class="peer-badge" :class="bitcoinAnchorFundingBadgeClass()">{{ bitcoinAnchorFundingView().stateLabel }}</span>

                    <p v-if="bitcoinAnchorFundingView().networkMismatch" class="form-hint form-hint--neutral">
                        ⚠ This funding was observed on {{ bitcoinAnchorFundingView().network }}, but the connected
                        wallet is now on {{ bitcoinAnchorFundingView().expectedNetwork }}. Refresh funding before
                        relying on it.
                    </p>
                    <p v-else-if="bitcoinAnchorFundingView().reason" class="form-hint form-hint--neutral">
                        {{ bitcoinAnchorFundingView().reason }}
                    </p>

                    <dl v-if="isBitcoinAnchorFundingObserved()" class="evidence-fields">
                        <div class="evidence-field"><dt>UTXOs observed</dt><dd>{{ bitcoinAnchorFundingView().utxoCount }}</dd></div>
                        <div class="evidence-field"><dt>Total</dt><dd>{{ bitcoinAnchorFundingView().totalValueSats }} sat</dd></div>
                        <div class="evidence-field"><dt>Script type</dt><dd>{{ bitcoinAnchorFundingView().scriptType }}</dd></div>
                    </dl>

                    <button v-if="bitcoinAnchorFundingView().utxoCount > 0" type="button" class="action-btn action-btn--secondary"
                        @click="toggleBitcoinAnchorFundingUtxosExpanded">
                        {{ bitcoinAnchorFundingUtxosExpanded ? 'Hide Funding Inputs' : 'Show Funding Inputs' }}
                    </button>
                    <template v-if="bitcoinAnchorFundingUtxosExpanded">
                        <dl v-for="utxo in bitcoinAnchorFundingView().utxos" :key="utxo.txid + ':' + utxo.vout" class="evidence-fields">
                            <div class="evidence-field">
                                <dt>{{ shortId(utxo.txid) }}:{{ utxo.vout }}</dt>
                                <dd>{{ utxo.valueSats }} sat ({{ utxo.scriptType }}{{ utxo.confirmed ? '' : ', unconfirmed' }})</dd>
                            </div>
                        </dl>
                    </template>

                    <dl v-if="isBitcoinAnchorFundingObserved()" class="evidence-fields">
                        <div class="evidence-field"><dt>Change destination</dt><dd>{{ shortId(bitcoinAnchorFundingView().changeAccount) }}</dd></div>
                    </dl>
                    <p v-if="isBitcoinAnchorFundingObserved()" class="form-hint form-hint--neutral">
                        Change returns to the connected wallet's own account — no separate change address is
                        requested from the wallet.
                    </p>
                </div>
            </div>

            <!-- Base network and account: page-level, observation only (no
                 signing capability). -->
            <div v-if="baseWalletConnection" class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Base Network</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Observing an account here never constructs, signs, or broadcasts a transaction — it is a fact
                    about a moment, read fresh every time this is asked.
                </p>

                <div class="evidence-inspection-adapter">
                    <span class="peer-badge" :class="baseWalletConnectionBadgeClass()">
                        {{ baseWalletConnectionView().stateLabel }}
                    </span>
                    <dl v-if="isBaseWalletConnected()" class="evidence-fields">
                        <div class="evidence-field"><dt>Account</dt><dd>{{ shortId(baseWalletConnectionView().address) }}</dd></div>
                    </dl>
                    <p v-if="baseWalletConnectionState.reason" class="form-hint form-hint--neutral">
                        {{ baseWalletConnectionState.reason }}
                    </p>
                </div>
                <div class="identity-mgmt-actions">
                    <button v-if="!isBaseWalletConnected()" class="action-btn action-btn--secondary"
                            :disabled="isBaseWalletConnecting()"
                            @click="connectBaseWallet()">
                        {{ isBaseWalletConnecting() ? 'Connecting…' : 'Connect Base Wallet' }}
                    </button>
                    <button v-else class="action-btn action-btn--secondary" @click="disconnectBaseWallet()">
                        Disconnect
                    </button>
                </div>

                <template v-if="baseNetworkObserver && isBaseWalletConnected()">
                    <button type="button" class="action-btn action-btn--secondary" :disabled="baseAccountObservationState.observing" @click="observeBaseAccount">
                        {{ baseAccountObservationState.observing ? 'Observing…' : (baseAccountObservationView() ? 'Refresh Observation' : 'Observe Base Account') }}
                    </button>
                    <p v-if="baseAccountObservationState.error" class="form-hint form-hint--neutral">{{ baseAccountObservationState.error }}</p>

                    <div v-if="baseAccountObservationView()" class="evidence-inspection-adapter">
                        <span class="peer-badge" :class="baseAccountObservationBadgeClass()">{{ baseAccountObservationView().stateLabel }}</span>

                        <dl v-if="baseAccountObservationView().state === BaseNetworkObservationState.OBSERVED" class="evidence-fields">
                            <div class="evidence-field"><dt>Network</dt><dd>{{ baseAccountObservationView().network }}</dd></div>
                            <div class="evidence-field"><dt>Chain ID</dt><dd>{{ baseAccountObservationView().chainId }}</dd></div>
                            <div class="evidence-field"><dt>Account</dt><dd>{{ shortId(baseAccountObservationView().address) }}</dd></div>
                            <div class="evidence-field"><dt>Native balance</dt><dd>{{ baseAccountObservationView().nativeBalanceWei }} wei</dd></div>
                            <div class="evidence-field"><dt>Observed at</dt><dd>{{ baseAccountObservationView().observedAt }}</dd></div>
                        </dl>

                        <!-- A non-Base network is shown with its actual chain
                             id, never relabeled. -->
                        <dl v-else-if="baseAccountObservationView().state === BaseNetworkObservationState.CHAIN_MISMATCH" class="evidence-fields">
                            <div class="evidence-field"><dt>Chain ID</dt><dd>{{ baseAccountObservationView().chainId }}</dd></div>
                        </dl>

                        <p v-if="baseAccountObservationView().reason" class="form-hint form-hint--neutral">
                            {{ baseAccountObservationView().reason }}
                        </p>
                    </div>
                </template>
            </div>

            <!-- Bitcoin transaction review: page-level, before anything is
                 published. -->
            <p v-if="bitcoinAnchorTransactionReview.reason && !bitcoinAnchorTransactionReviewView()" class="form-hint form-hint--neutral">
                {{ bitcoinAnchorTransactionReview.reason }}
            </p>
            <div v-if="bitcoinAnchorTransactionReviewView()" class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Review Bitcoin Anchor Transaction</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Nothing is signed or published by viewing this review. It names exactly what a wallet
                    would be asked to sign — nothing more, and nothing assumed.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Network</dt><dd>{{ bitcoinAnchorTransactionReviewView().network }}</dd></div>
                    <div class="evidence-field"><dt>Content hash</dt><dd>{{ bitcoinAnchorTransactionReviewView().contentHash }}</dd></div>
                    <div class="evidence-field"><dt>Fee</dt><dd>{{ bitcoinAnchorTransactionReviewView().feeSats }} sat</dd></div>
                    <div class="evidence-field"><dt>Change</dt><dd>{{ bitcoinAnchorTransactionReviewView().changeSats }} sat</dd></div>
                    <div class="evidence-field"><dt>Total input</dt><dd>{{ bitcoinAnchorTransactionReviewView().totalInputSats }} sat</dd></div>
                </dl>
                <div class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Inputs</span>
                    <dl v-for="input in bitcoinAnchorTransactionReviewView().inputs" :key="input.txid + ':' + input.vout" class="evidence-fields">
                        <div class="evidence-field"><dt>{{ shortId(input.txid) }}:{{ input.vout }}</dt><dd>{{ input.valueSats }} sat ({{ input.scriptType }})</dd></div>
                    </dl>
                </div>
                <div class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Outputs</span>
                    <dl v-for="(output, index) in bitcoinAnchorTransactionReviewView().outputs" :key="index" class="evidence-fields">
                        <div class="evidence-field">
                            <dt>{{ output.type === 'change' ? 'Change' : 'OP_RETURN' }}</dt>
                            <dd>{{ output.address ? shortId(output.address) + ' — ' : '' }}{{ output.valueSats }} sat</dd>
                        </div>
                    </dl>
                </div>

                <!-- A network mismatch is named, never auto-corrected. -->
                <div v-if="bitcoinAnchorTransactionReviewWalletMatchView()" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Wallet</span>
                    <span class="peer-badge" :class="bitcoinWalletConnectionBadgeClass()">
                        {{ bitcoinAnchorTransactionReviewWalletMatchView().stateLabel }}
                    </span>
                    <dl v-if="isBitcoinWalletConnected()" class="evidence-fields">
                        <div class="evidence-field"><dt>Account</dt><dd>{{ shortId(bitcoinAnchorTransactionReviewWalletMatchView().account) }}</dd></div>
                        <div class="evidence-field"><dt>Wallet network</dt><dd>{{ bitcoinAnchorTransactionReviewWalletMatchView().network }}</dd></div>
                        <div class="evidence-field"><dt>Transaction network</dt><dd>{{ bitcoinAnchorTransactionReviewWalletMatchView().expectedNetwork }}</dd></div>
                    </dl>
                    <p v-if="bitcoinAnchorTransactionReviewWalletMatchView().networkMismatch" class="form-hint form-hint--neutral">
                        ⚠ Wallet network ({{ bitcoinAnchorTransactionReviewWalletMatchView().network }}) does not match this
                        transaction's network ({{ bitcoinAnchorTransactionReviewWalletMatchView().expectedNetwork }}).
                        Signing is unavailable until a wallet on the matching network is connected.
                    </p>
                    <p v-else-if="isBitcoinWalletConnected()" class="form-hint form-hint--neutral">
                        ✓ Network matches.
                    </p>
                </div>

                <!-- The only signing action. A connected wallet is a
                     capability, not permission; the reviewed PSBT is handed
                     over byte for byte. -->
                <div class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Signing</span>
                    <button type="button" class="action-btn action-btn--secondary"
                        :disabled="!isBitcoinWalletConnected() || (bitcoinAnchorTransactionReviewWalletMatchView() && bitcoinAnchorTransactionReviewWalletMatchView().networkMismatch) || isBitcoinAnchorReviewedSigning()"
                        @click="signBitcoinAnchorReviewedTransaction">
                        {{ isBitcoinAnchorReviewedSigning() ? 'Waiting for wallet…' : 'Sign Reviewed Transaction' }}
                    </button>

                    <span v-if="bitcoinAnchorReviewedSigningView().state !== BitcoinAnchorReviewedSigningState.IDLE" class="peer-badge"
                        :class="bitcoinAnchorReviewedSigningBadgeClass()">
                        {{ bitcoinAnchorReviewedSigningView().stateLabel }}
                    </span>
                    <p v-if="bitcoinAnchorReviewedSigningView().reason" class="form-hint form-hint--neutral">
                        {{ bitcoinAnchorReviewedSigningView().reason }}
                    </p>

                    <!-- SIGNED only means the wallet returned signing material
                         for this transaction, not that it has been verified. -->
                    <template v-if="bitcoinAnchorReviewedSigningView().state === BitcoinAnchorReviewedSigningState.SIGNED">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Signed inputs</dt><dd>{{ bitcoinAnchorReviewedSigningView().signedInputCount }}</dd></div>
                        </dl>
                        <p class="form-hint form-hint--neutral">
                            The wallet returned a signed PSBT. ForkBuild has not yet cryptographically verified
                            or finalized it — that is a separate, explicit step.
                        </p>
                    </template>
                </div>

                <!-- A wallet-returned PSBT is untrusted until verified and
                     finalized here. -->
                <div v-if="bitcoinAnchorReviewedSigningView().state === BitcoinAnchorReviewedSigningState.SIGNED" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Verification &amp; Finalization</span>
                    <p class="form-hint form-hint--neutral">
                        The wallet returned signing material. ForkBuild has not yet accepted it as a valid
                        signature.
                    </p>
                    <button type="button" class="action-btn action-btn--secondary" @click="finalizeBitcoinAnchorSignedPsbt">
                        Verify &amp; Finalize Transaction
                    </button>

                    <span v-if="bitcoinAnchorSignedPsbtFinalizationView().state !== BitcoinAnchorSignedPsbtFinalizationState.IDLE" class="peer-badge"
                        :class="bitcoinAnchorSignedPsbtFinalizationBadgeClass()">
                        {{ bitcoinAnchorSignedPsbtFinalizationView().stateLabel }}
                    </span>
                    <p v-if="bitcoinAnchorSignedPsbtFinalizationView().reason" class="form-hint form-hint--neutral">
                        {{ bitcoinAnchorSignedPsbtFinalizationView().reason }}
                    </p>

                    <template v-if="bitcoinAnchorSignedPsbtFinalizationView().state === BitcoinAnchorSignedPsbtFinalizationState.FINALIZED">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Signature verification</dt><dd>✓ Verified</dd></div>
                            <div class="evidence-field">
                                <dt>Verified inputs</dt>
                                <dd>{{ bitcoinAnchorSignedPsbtFinalizationView().verifiedInputCount }} / {{ bitcoinAnchorReviewedSigningView().signedInputCount }}</dd>
                            </div>
                            <div class="evidence-field"><dt>Transaction ID</dt><dd>{{ bitcoinAnchorSignedPsbtFinalizationView().txid }}</dd></div>
                        </dl>
                        <details class="evidence-inspection-proof">
                            <summary>Raw transaction bytes</summary>
                            <pre class="evidence-inspection-proof-json">{{ bitcoinAnchorSignedPsbtFinalizationView().rawTransactionHex }}</pre>
                        </details>
                        <p class="form-hint form-hint--neutral">
                            Transaction finalized. Broadcasting it is a separate, explicit step.
                        </p>
                    </template>
                </div>

                <!-- The only step that reaches the network. BROADCASTED means
                     accepted, not confirmed; no automatic retry. -->
                <div v-if="bitcoinAnchorFinalizedTransaction" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Broadcast</span>
                    <dl class="evidence-fields">
                        <div class="evidence-field"><dt>Transaction ID</dt><dd>{{ bitcoinAnchorFinalizedTransaction.txid }}</dd></div>
                        <div class="evidence-field"><dt>Finalized transaction</dt><dd>{{ bitcoinAnchorFinalizedTransaction.rawTransaction.bytes.length }} bytes</dd></div>
                    </dl>
                    <p class="form-hint form-hint--neutral">
                        This is the exact transaction that was reviewed, signed, and cryptographically verified.
                        Broadcasting submits it; it does not decide whether the network will accept it.
                    </p>
                    <button type="button" class="action-btn action-btn--secondary"
                        :disabled="isBitcoinAnchorBroadcasting()"
                        @click="broadcastBitcoinAnchorTransaction">
                        {{ isBitcoinAnchorBroadcasting() ? 'Broadcasting…' : (bitcoinAnchorBroadcastView().state === BitcoinAnchorBroadcastState.IDLE ? 'Broadcast Transaction' : 'Broadcast Again') }}
                    </button>

                    <span v-if="bitcoinAnchorBroadcastView().state !== BitcoinAnchorBroadcastState.IDLE" class="peer-badge"
                        :class="bitcoinAnchorBroadcastBadgeClass()">
                        {{ bitcoinAnchorBroadcastView().stateLabel }}
                    </span>
                    <p v-if="bitcoinAnchorBroadcastView().reason" class="form-hint form-hint--neutral">
                        {{ bitcoinAnchorBroadcastView().reason }}
                    </p>

                    <template v-if="bitcoinAnchorBroadcastView().state === BitcoinAnchorBroadcastState.BROADCASTED">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Transaction ID</dt><dd>{{ bitcoinAnchorBroadcastView().txid }}</dd></div>
                        </dl>
                        <details class="evidence-inspection-proof">
                            <summary>Raw transaction bytes</summary>
                            <pre class="evidence-inspection-proof-json">{{ bitcoinAnchorFinalizedTransaction.rawTransaction.hex }}</pre>
                        </details>
                        <p class="form-hint form-hint--neutral">
                            Transaction broadcasted. This is not yet confirmation — observing confirmation is a
                            separate, explicit step.
                        </p>

                        <!-- Anchor minted automatically after BROADCASTED. -->
                        <template v-if="bitcoinAnchorPublicationCoordinator">
                            <span v-if="bitcoinAnchorPublicationView().label" class="peer-badge"
                                :class="bitcoinAnchorPublicationBadgeClass()">
                                {{ bitcoinAnchorPublicationView().label }}
                            </span>
                            <p v-if="bitcoinAnchorPublicationView().message" class="form-hint form-hint--neutral">
                                {{ bitcoinAnchorPublicationView().message }}
                            </p>
                            <p v-if="bitcoinAnchorPublicationView().reason" class="form-hint form-hint--neutral">
                                {{ bitcoinAnchorPublicationView().reason }}
                            </p>
                            <dl v-if="bitcoinAnchorPublicationView().anchor" class="evidence-fields">
                                <div class="evidence-field"><dt>Publication Anchor</dt><dd>{{ bitcoinAnchorPublicationView().anchor.id }}</dd></div>
                            </dl>
                        </template>
                    </template>
                </div>

                <!-- Confirmation is a separate explicit action; each click
                     appends to the history. -->
                <div v-if="bitcoinAnchorBroadcastView().state === BitcoinAnchorBroadcastState.BROADCASTED" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Confirmation</span>
                    <p class="form-hint form-hint--neutral">
                        The network accepted this transaction for broadcast. Whether it has since been mined
                        into a block is a separate, later observation.
                    </p>

                    <button type="button" class="action-btn action-btn--secondary"
                        :disabled="bitcoinAnchorBroadcastConfirmationObserving"
                        @click="observeBitcoinAnchorBroadcastConfirmation">
                        {{ bitcoinAnchorBroadcastConfirmationObserving ? 'Observing…' : (bitcoinAnchorBroadcastConfirmationView() ? 'Observe Confirmation Again' : 'Observe Confirmation') }}
                    </button>
                    <p v-if="bitcoinAnchorBroadcastConfirmationError" class="form-hint form-hint--neutral">
                        {{ bitcoinAnchorBroadcastConfirmationError }}
                    </p>

                    <template v-if="bitcoinAnchorBroadcastConfirmationView()">
                        <span class="peer-badge" :class="bitcoinAnchorBroadcastConfirmationBadgeClass()">
                            {{ bitcoinAnchorBroadcastConfirmationView().stateLabel }}
                        </span>
                        <dl v-if="bitcoinAnchorBroadcastConfirmationView().blockHeight !== null" class="evidence-fields">
                            <div class="evidence-field"><dt>Block height</dt><dd>{{ bitcoinAnchorBroadcastConfirmationView().blockHeight }}</dd></div>
                            <div class="evidence-field"><dt>Block hash</dt><dd>{{ bitcoinAnchorBroadcastConfirmationView().blockHash }}</dd></div>
                            <div class="evidence-field"><dt>Confirmations</dt><dd>{{ bitcoinAnchorBroadcastConfirmationView().confirmationCount }}</dd></div>
                        </dl>
                        <p v-if="bitcoinAnchorBroadcastConfirmationView().reason" class="form-hint form-hint--neutral">
                            {{ bitcoinAnchorBroadcastConfirmationView().reason }}
                        </p>

                        <button v-if="bitcoinAnchorBroadcastConfirmationHistoryView().count > 0" type="button" class="action-btn action-btn--secondary"
                            @click="toggleBitcoinAnchorBroadcastConfirmationHistory">
                            {{ bitcoinAnchorBroadcastConfirmationHistoryExpanded ? 'Hide Confirmation History' : 'Show Confirmation History' }}
                        </button>
                    </template>

                    <!-- Confirmations of this broadcast, separate from the
                         per-anchor "Reconcile" history. -->
                    <div v-if="bitcoinAnchorBroadcastConfirmationHistoryExpanded">
                        <ul class="replica-knowledge-claim-list">
                            <li v-for="(item, index) in bitcoinAnchorBroadcastConfirmationHistoryView().entries" :key="index" class="replica-knowledge-claim">
                                <button type="button" class="action-btn action-btn--secondary"
                                    @click="toggleBitcoinAnchorBroadcastConfirmationHistoryEntry(index)">
                                    {{ formatWhen(item.observedAt) }} — {{ item.stateShortLabel }}
                                </button>
                                <dl v-if="isBitcoinAnchorBroadcastConfirmationHistoryEntryExpanded(index)" class="evidence-fields">
                                    <div class="evidence-field"><dt>State</dt><dd>{{ item.stateLabel }}</dd></div>
                                    <div class="evidence-field"><dt>Transaction ID</dt><dd>{{ item.txid }}</dd></div>
                                    <div v-if="item.blockHash" class="evidence-field"><dt>Block hash</dt><dd>{{ item.blockHash }}</dd></div>
                                    <div v-if="item.blockHeight !== null" class="evidence-field"><dt>Block height</dt><dd>{{ item.blockHeight }}</dd></div>
                                    <div v-if="item.confirmationCount !== null" class="evidence-field"><dt>Confirmations</dt><dd>{{ item.confirmationCount }}</dd></div>
                                    <div v-if="item.reason" class="evidence-field"><dt>Reason</dt><dd>{{ item.reason }}</dd></div>
                                </dl>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- Bitcoin anchor evidence rebuilt from the durable archive; no
                 network access. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Historical Bitcoin Anchor Evidence</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Every Bitcoin anchor this archive holds a durable fact for, organized by its own
                    explicit anchorId. Counts below describe how much this replica has recorded for
                    each anchor — never how complete, reliable, or trustworthy that anchor's own
                    evidence is.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Anchors</dt><dd>{{ historicalBitcoinAnchorArchiveView().anchorCount }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="toggleHistoricalBitcoinAnchors">
                        {{ historicalBitcoinAnchorsExpanded ? 'Hide Historical Anchors' : 'Show Historical Anchors' }}
                    </button>
                </div>
                <div v-if="historicalBitcoinAnchorsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Archived Bitcoin Anchors</span>
                    <p v-if="historicalBitcoinAnchorArchiveView().anchorCount === 0" class="form-hint form-hint--neutral">
                        No Bitcoin anchor facts archived yet. Broadcasting a Bitcoin transaction,
                        observing a confirmation, or recording a content-proof observation elsewhere
                        on this page adds to this archive automatically.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="anchorRow in historicalBitcoinAnchorArchiveView().anchors" :key="anchorRow.anchorId" class="replica-knowledge-claim">
                            <button type="button" class="action-btn action-btn--secondary" @click="toggleHistoricalBitcoinAnchorEntry(anchorRow.anchorId)">
                                {{ anchorRow.anchorId }}
                            </button>
                            <p class="form-hint form-hint--neutral">
                                Broadcast observations: {{ anchorRow.broadcastObservationCount }} ·
                                Confirmation observations: {{ anchorRow.confirmationObservationCount }} ·
                                Content-proof observations: {{ anchorRow.contentProofObservationCount }} ·
                                Chain-placement comparisons: {{ anchorRow.chainPlacementComparisonCount }} ·
                                Consistency findings: {{ anchorRow.consistencyFindingCount }}
                            </p>

                            <div v-if="isHistoricalBitcoinAnchorEntryExpanded(anchorRow.anchorId) && historicalBitcoinAnchorEvidenceView(anchorRow.anchorId)" class="evidence-list">
                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Broadcast History</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).broadcastObservations.count === 0" class="form-hint form-hint--neutral">No broadcast observations recorded.</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="item in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).broadcastObservations.observations" :key="item.index" class="replica-knowledge-claim">
                                            {{ item.stateLabel }} — {{ item.broadcastedAt ? formatWhen(item.broadcastedAt) : 'no timestamp recorded' }}
                                            <template v-if="item.txid"> — txid {{ item.txid }}</template>
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Confirmation History</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).confirmationObservations.count === 0" class="form-hint form-hint--neutral">No confirmation observations recorded.</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="item in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).confirmationObservations.observations" :key="item.index" class="replica-knowledge-claim">
                                            Confirmation observation #{{ item.index }} — {{ formatWhen(item.observedAt) }} — {{ item.stateLabel }}
                                            <template v-if="item.blockHeight !== null && item.blockHeight !== undefined"> — height {{ item.blockHeight }}</template>
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Content-Proof History</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).contentProofObservations.count === 0" class="form-hint form-hint--neutral">No content-proof observations recorded.</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="item in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).contentProofObservations.observations" :key="item.index" class="replica-knowledge-claim">
                                            Content-proof observation #{{ item.index }} — {{ formatWhen(item.observedAt) }} — {{ item.stateLabel }}
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Chain Placement Comparisons</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).chainPlacementObservations.count === 0" class="form-hint form-hint--neutral">Not enough confirmed observations exist yet to compare block placement.</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="(comparison, index) in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).chainPlacementObservations.comparisons" :key="index" class="replica-knowledge-claim">
                                            {{ comparison.outcomeLabel }}
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Observation Consistency</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).consistencyFindings.count === 0" class="form-hint form-hint--neutral">Not enough confirmed observations exist yet to analyze consistency.</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="(finding, index) in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).consistencyFindings.findings" :key="index" class="replica-knowledge-claim">
                                            {{ finding.stateLabel }}
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">Combined Evidence</span>
                                    <p class="form-hint form-hint--neutral">
                                        Broadcast: {{ historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).broadcastObservations.count }} ·
                                        Confirmation: {{ historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).confirmationObservations.count }} ·
                                        Content-proof: {{ historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).contentProofObservations.count }} ·
                                        Chain-placement: {{ historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).chainPlacementObservations.count }} ·
                                        Consistency: {{ historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).consistencyFindings.count }}
                                    </p>
                                    <p class="form-hint form-hint--neutral">
                                        This is a correlation of independently recorded facts by explicit anchorId — not a verdict.
                                    </p>
                                </div>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Only anchors this replica minted a publication identity for. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Bitcoin Anchor Publications</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Every Bitcoin anchor publication attempt this replica has minted a durable identity
                    for — created the moment a transaction is finalized, independent of whether its
                    broadcast later succeeds. A publication record names WHAT was published, AS WHICH
                    transaction, and on WHICH network — never whether it was later confirmed.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Publications</dt><dd>{{ bitcoinAnchorPublicationRecordHistoryView().count }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="toggleBitcoinAnchorPublications">
                        {{ bitcoinAnchorPublicationsExpanded ? 'Hide Publications' : 'Show Publications' }}
                    </button>
                </div>
                <div v-if="bitcoinAnchorPublicationsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Publication Identities</span>
                    <p v-if="bitcoinAnchorPublicationRecordHistoryView().count === 0" class="form-hint form-hint--neutral">
                        No Bitcoin anchor publication identity minted yet. Finalizing a Bitcoin anchor
                        transaction elsewhere on this page creates one automatically.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="publicationRow in bitcoinAnchorPublicationRecordHistoryView().records" :key="publicationRow.anchorId" class="replica-knowledge-claim">
                            <button type="button" class="action-btn action-btn--secondary" @click="toggleBitcoinAnchorPublicationInspection(publicationRow.anchorId)">
                                {{ publicationRow.anchorId }}
                            </button>
                            <p class="form-hint form-hint--neutral">
                                Content hash: {{ publicationRow.contentHash }} ·
                                Txid: {{ publicationRow.txid }} ·
                                Network: {{ publicationRow.network }} ·
                                Created: {{ formatWhen(publicationRow.createdAt) }}
                            </p>

                            <div v-if="isBitcoinAnchorPublicationInspectionExpanded(publicationRow.anchorId) && bitcoinAnchorPublicationInspectionView(publicationRow.anchorId)" class="evidence-list">
                                <span class="evidence-convergence-title">Inspect Observations</span>
                                <p class="form-hint form-hint--neutral">
                                    Broadcast: {{ bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.broadcastObservations.count }} ·
                                    Confirmation: {{ bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.confirmationObservations.count }} ·
                                    Content-proof: {{ bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.contentProofObservations.count }} ·
                                    Chain-placement: {{ bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.chainPlacementObservations.count }} ·
                                    Consistency: {{ bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.consistencyFindings.count }}
                                </p>
                                <p class="form-hint form-hint--neutral">
                                    This is a correlation of independently recorded facts by explicit anchorId — not a
                                    verdict. See "Historical Bitcoin Anchor Evidence" above for the full, per-observation
                                    breakdown of this same anchorId.
                                </p>
                            </div>

                            <!-- Missing stages produce no row, never a
                                 fabricated "missing" entry. -->
                            <button type="button" class="action-btn action-btn--secondary" @click="toggleBitcoinAnchorPublicationLifecycle(publicationRow.anchorId)">
                                {{ isBitcoinAnchorPublicationLifecycleExpanded(publicationRow.anchorId) ? 'Hide Publication Lifecycle' : 'Show Publication Lifecycle' }}
                            </button>
                            <div v-if="isBitcoinAnchorPublicationLifecycleExpanded(publicationRow.anchorId)" class="evidence-list">
                                <span class="evidence-convergence-title">Publication Lifecycle</span>
                                <p v-if="!bitcoinAnchorPublicationLifecycleTimelineView(publicationRow.anchorId)" class="form-hint form-hint--neutral">
                                    No lifecycle timeline available for this anchorId.
                                </p>
                                <ul v-else class="replica-knowledge-claim-list">
                                    <li v-for="(item, timelineIndex) in bitcoinAnchorPublicationLifecycleTimelineView(publicationRow.anchorId).entries"
                                        :key="timelineIndex" class="replica-knowledge-claim">
                                        <span class="peer-badge peer-badge--pending">
                                            {{ formatWhen(item.observedAt) }} — {{ item.label }}
                                        </span>
                        <p class="form-hint form-hint--neutral">{{ bitcoinAnchorPublicationLifecycleEntryDetail(item) }}</p>
                                        <p v-if="item.reason" class="form-hint form-hint--neutral">{{ item.reason }}</p>
                                    </li>
                                </ul>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Only txids this replica minted a Base publication identity for. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Base Anchor Publications</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Every Base publication attempt this replica has minted a durable identity for —
                    created the moment a transaction is finalized, independent of whether its broadcast
                    later succeeds. A publication record names WHAT was published, AS WHICH transaction,
                    and on WHICH network — never whether it was later included in a block.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Publications</dt><dd>{{ baseAnchorPublicationRecordHistoryView().count }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="toggleBaseAnchorPublications">
                        {{ baseAnchorPublicationsExpanded ? 'Hide Publications' : 'Show Publications' }}
                    </button>
                </div>
                <div v-if="baseAnchorPublicationsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Publication Identities</span>
                    <p v-if="baseAnchorPublicationRecordHistoryView().count === 0" class="form-hint form-hint--neutral">
                        No Base publication identity minted yet. Finalizing a Base transaction elsewhere on
                        this page creates one automatically.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="publicationRow in baseAnchorPublicationRecordHistoryView().records" :key="publicationRow.txid" class="replica-knowledge-claim">
                            <span class="peer-badge peer-badge--pending">{{ publicationRow.txid }}</span>
                            <p class="form-hint form-hint--neutral">
                                Content hash: {{ publicationRow.contentHash }} ·
                                Txid: {{ publicationRow.txid }} ·
                                Network: {{ publicationRow.network }} ·
                                Created: {{ formatWhen(publicationRow.createdAt) }}
                            </p>

                            <button type="button" class="action-btn action-btn--secondary" @click="toggleBaseAnchorPublicationLifecycle(publicationRow.txid)">
                                {{ isBaseAnchorPublicationLifecycleExpanded(publicationRow.txid) ? 'Hide Publication Lifecycle' : 'Show Publication Lifecycle' }}
                            </button>
                            <div v-if="isBaseAnchorPublicationLifecycleExpanded(publicationRow.txid)" class="evidence-list">
                                <span class="evidence-convergence-title">Publication Lifecycle</span>
                                <p v-if="!baseAnchorPublicationLifecycleTimelineView(publicationRow.txid)" class="form-hint form-hint--neutral">
                                    No lifecycle timeline available for this txid.
                                </p>
                                <ul v-else class="replica-knowledge-claim-list">
                                    <li v-for="(item, timelineIndex) in baseAnchorPublicationLifecycleTimelineView(publicationRow.txid).entries"
                                        :key="timelineIndex" class="replica-knowledge-claim">
                                        <span class="peer-badge peer-badge--pending">
                                            {{ formatWhen(item.observedAt) }} — {{ item.label }}
                                        </span>
                                        <p class="form-hint form-hint--neutral">{{ baseAnchorPublicationLifecycleEntryDetail(item) }}</p>
                                        <p v-if="item.reason" class="form-hint form-hint--neutral">{{ item.reason }}</p>
                                    </li>
                                </ul>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
            </div>`;
