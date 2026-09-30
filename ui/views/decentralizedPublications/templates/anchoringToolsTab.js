// Publications page template: the Blockchain Anchoring tools tab.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const anchoringToolsTabTemplate = `<div v-show="publicationsToolsTab === 'anchoring'">
            <!-- Batch anchoring: one external recording (one wallet
                 approval) for several publications, for each anchorType
                 whose publisher can (Steem). Each publication still gets its
                 own signed anchor. -->
            <div v-for="batchType in batchAnchorTypes" :key="'batch-' + batchType.anchorType" class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">{{ t('publications.anchorSeveralPublicationsOn', { anchorType: humanizeAnchorType(batchType.anchorType) }) }}</span>
                    <span v-if="batchCreationView(batchType.anchorType).label" class="peer-badge" :class="batchCreationBadgeClass(batchType.anchorType)">
                        {{ displayText(batchCreationView(batchType.anchorType).label) }}
                    </span>
                </div>
                <p class="form-hint form-hint--neutral">
                    <template v-if="batchType.maxBatchSize">{{ t('publications.pickPublicationsToAnchorTogetherAtMost', { count: batchType.maxBatchSize }) }}</template><template v-else>{{ t('publications.pickPublicationsToAnchorTogether') }}</template>
                    <template v-if="batchType.anchorType === 'steem'">{{ ' ' + t('publications.steemAnchorsAreAttestedBy') }}</template>
                </p>
                <p v-if="usableEntries.length === 0" class="form-hint form-hint--neutral">
                    <template v-if="failedEntries.length > 0">{{ t('publications.noPublicationHereCanBeFailed', { count: failedEntries.length }) }}</template><template v-else>{{ t('publications.noPublicationHereCanBe') }}</template>
                </p>
                <div v-else class="batch-anchoring-list">
                    <label v-for="entry in usableEntries" :key="'batch-' + batchType.anchorType + '-' + entry.publication.id" class="anchor-provider-option">
                        <input type="checkbox" v-model="batchAnchoring[batchType.anchorType].selected[entry.publication.id]" />
                        <template v-if="publicationTitle(entry)">{{ displayText(publicationTitle(entry)) }} ·</template>
                        {{ humanizeContentKind(entry.publication.contentKind) }} · {{ shortHash(entry.publication.contentReference.hash) }}
                        · {{ t('forkTree.byAuthor', { author: shortId(entry.publication.publisherIdentity && entry.publication.publisherIdentity.id) }) }}
                        <span v-if="hasAnchorOfType(entry, batchType.anchorType)" class="form-hint form-hint--neutral">{{ t('publications.alreadyHasAAnchor', { anchorType: humanizeAnchorType(batchType.anchorType) }) }}</span>
                    </label>
                </div>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="selectUnanchoredForBatch(batchType.anchorType)">{{ t('publications.selectUnanchored') }}</button>
                    <button type="button" class="action-btn action-btn--secondary" @click="clearBatchSelection(batchType.anchorType)">{{ t('publications.clear') }}</button>
                    <button type="button" class="action-btn action-btn--primary" :disabled="batchButtonDisabled(batchType.anchorType)"
                            @click="createBatchAnchors(batchType.anchorType)">
                        {{ displayText(batchButtonLabel(batchType.anchorType)) }}
                    </button>
                </div>
                <p v-if="batchSelectedIds(batchType.anchorType).length > batchLimit(batchType.anchorType)" class="form-hint form-hint--neutral">
                    {{ t('publications.pickAtMostPublicationsFor', { limit: batchLimit(batchType.anchorType) }) }}
                </p>
                <p v-if="batchCreationView(batchType.anchorType).message" class="form-hint form-hint--neutral">
                    {{ displayText(batchCreationView(batchType.anchorType).message) }}
                </p>
                <p v-if="batchCreationView(batchType.anchorType).reason" class="form-hint form-hint--neutral">
                    {{ displayText(batchCreationView(batchType.anchorType).reason) }}
                </p>
                <p v-if="batchFinality(batchType.anchorType)" class="form-hint form-hint--neutral">
                    <strong>{{ displayText(batchFinality(batchType.anchorType).label) }}:</strong> {{ displayText(batchFinality(batchType.anchorType).message) }}
                </p>
            </div>

            <!-- Bitcoin wallet: page-level, like Base Network below, so a first
                 anchor needs no existing one to reach it. This page anchors to
                 Bitcoin mainnet only. -->
            <div v-if="bitcoinWalletConnection" class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">{{ t('publications.bitcoinWallet') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('publications.connectABitcoinWalletTo') }}
                </p>
                <div class="evidence-inspection-adapter">
                    <span class="peer-badge" :class="bitcoinWalletConnectionBadgeClass()">
                        {{ displayText(bitcoinWalletConnectionView().stateLabel) }}
                    </span>
                    <dl v-if="isBitcoinWalletConnected()" class="evidence-fields">
                        <div class="evidence-field"><dt>{{ t('publications.account') }}</dt><dd>{{ shortId(bitcoinWalletConnectionView().account) }}</dd></div>
                        <div class="evidence-field"><dt>{{ t('publications.network2') }}</dt><dd>{{ bitcoinWalletConnectionView().network }}</dd></div>
                    </dl>
                    <!-- A mismatch is named, never resolved on the person's behalf. -->
                    <p v-if="bitcoinWalletConnectionView().networkMismatch" class="form-hint form-hint--neutral">
                        {{ t('publications.walletNetworkIsNotBitcoin', { network: bitcoinWalletConnectionView().network, expectedNetwork: bitcoinWalletConnectionView().expectedNetwork }) }}
                    </p>
                    <p v-if="bitcoinWalletConnectionState.reason" class="form-hint form-hint--neutral">
                        {{ displayText(bitcoinWalletConnectionState.reason) }}
                    </p>
                </div>
                <div class="identity-mgmt-actions">
                    <button v-if="!isBitcoinWalletConnected()" class="action-btn action-btn--secondary"
                            :disabled="isBitcoinWalletConnecting()"
                            @click="connectBitcoinWallet()">
                        {{ isBitcoinWalletConnecting() ? t('publications.connecting') : t('publications.connectBitcoinWallet') }}
                    </button>
                    <button v-else class="action-btn action-btn--secondary" @click="disconnectBitcoinWallet()">
                        {{ t('publications.disconnect') }}
                    </button>
                </div>
            </div>

            <!-- Bitcoin funding: page-level, for a transaction not built yet.
                 Selects and spends nothing. -->
            <div v-if="bitcoinWalletFundingObserver && isBitcoinWalletConnected()" class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">{{ t('publications.bitcoinFunding') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('publications.whatTheConnectedWalletS') }}
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>{{ t('publications.network2') }}</dt><dd>{{ bitcoinWalletConnectionState.network }}</dd></div>
                    <div class="evidence-field"><dt>{{ t('publications.account') }}</dt><dd>{{ shortId(bitcoinWalletConnectionState.account) }}</dd></div>
                </dl>
                <button type="button" class="action-btn action-btn--secondary" :disabled="bitcoinAnchorFundingState.observing" @click="observeBitcoinAnchorFunding">
                    {{ bitcoinAnchorFundingState.observing ? t('publications.observing') : (bitcoinAnchorFundingView() ? t('publications.refreshFunding') : t('publications.observeWalletFunding')) }}
                </button>
                <p v-if="bitcoinAnchorFundingState.error" class="form-hint form-hint--neutral">{{ bitcoinAnchorFundingState.error }}</p>

                <div v-if="bitcoinAnchorFundingView()" class="evidence-inspection-adapter">
                    <span class="peer-badge" :class="bitcoinAnchorFundingBadgeClass()">{{ displayText(bitcoinAnchorFundingView().stateLabel) }}</span>

                    <p v-if="bitcoinAnchorFundingView().networkMismatch" class="form-hint form-hint--neutral">
                        {{ t('publications.thisFundingWasObservedOn', { network: bitcoinAnchorFundingView().network, expectedNetwork: bitcoinAnchorFundingView().expectedNetwork }) }}
                    </p>
                    <p v-else-if="bitcoinAnchorFundingView().reason" class="form-hint form-hint--neutral">
                        {{ displayText(bitcoinAnchorFundingView().reason) }}
                    </p>

                    <dl v-if="isBitcoinAnchorFundingObserved()" class="evidence-fields">
                        <div class="evidence-field"><dt>{{ t('publications.utxosObserved') }}</dt><dd>{{ bitcoinAnchorFundingView().utxoCount }}</dd></div>
                        <div class="evidence-field"><dt>{{ t('publications.total') }}</dt><dd>{{ bitcoinAnchorFundingView().totalValueSats }} sat</dd></div>
                        <div class="evidence-field"><dt>{{ t('publications.scriptType') }}</dt><dd>{{ bitcoinAnchorFundingView().scriptType }}</dd></div>
                    </dl>

                    <button v-if="bitcoinAnchorFundingView().utxoCount > 0" type="button" class="action-btn action-btn--secondary"
                        @click="toggleBitcoinAnchorFundingUtxosExpanded">
                        {{ bitcoinAnchorFundingUtxosExpanded ? t('publications.hideFundingInputs') : t('publications.showFundingInputs') }}
                    </button>
                    <template v-if="bitcoinAnchorFundingUtxosExpanded">
                        <dl v-for="utxo in bitcoinAnchorFundingView().utxos" :key="utxo.txid + ':' + utxo.vout" class="evidence-fields">
                            <div class="evidence-field">
                                <dt>{{ shortId(utxo.txid) }}:{{ utxo.vout }}</dt>
                                <dd>{{ utxo.valueSats }} sat ({{ utxo.scriptType }}{{ utxo.confirmed ? '' : t('publications.unconfirmed') }})</dd>
                            </div>
                        </dl>
                    </template>

                    <dl v-if="isBitcoinAnchorFundingObserved()" class="evidence-fields">
                        <div class="evidence-field"><dt>{{ t('publications.changeDestination') }}</dt><dd>{{ shortId(bitcoinAnchorFundingView().changeAccount) }}</dd></div>
                    </dl>
                    <p v-if="isBitcoinAnchorFundingObserved()" class="form-hint form-hint--neutral">
                        {{ t('publications.changeReturnsToTheConnected') }}
                    </p>
                </div>
            </div>

            <!-- Base network and account: page-level, observation only (no
                 signing capability). -->
            <div v-if="baseWalletConnection" class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">{{ t('publications.baseNetwork') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('publications.observingAnAccountHereNever') }}
                </p>

                <div class="evidence-inspection-adapter">
                    <span class="peer-badge" :class="baseWalletConnectionBadgeClass()">
                        {{ displayText(baseWalletConnectionView().stateLabel) }}
                    </span>
                    <dl v-if="isBaseWalletConnected()" class="evidence-fields">
                        <div class="evidence-field"><dt>{{ t('publications.account') }}</dt><dd>{{ shortId(baseWalletConnectionView().address) }}</dd></div>
                    </dl>
                    <p v-if="baseWalletConnectionState.reason" class="form-hint form-hint--neutral">
                        {{ displayText(baseWalletConnectionState.reason) }}
                    </p>
                </div>
                <div class="identity-mgmt-actions">
                    <button v-if="!isBaseWalletConnected()" class="action-btn action-btn--secondary"
                            :disabled="isBaseWalletConnecting()"
                            @click="connectBaseWallet()">
                        {{ isBaseWalletConnecting() ? t('publications.connecting') : t('publications.connectBaseWallet') }}
                    </button>
                    <button v-else class="action-btn action-btn--secondary" @click="disconnectBaseWallet()">
                        {{ t('publications.disconnect') }}
                    </button>
                </div>

                <template v-if="baseNetworkObserver && isBaseWalletConnected()">
                    <button type="button" class="action-btn action-btn--secondary" :disabled="baseAccountObservationState.observing" @click="observeBaseAccount">
                        {{ baseAccountObservationState.observing ? t('publications.observing') : (baseAccountObservationView() ? t('publications.refreshObservation') : t('publications.observeBaseAccount')) }}
                    </button>
                    <p v-if="baseAccountObservationState.error" class="form-hint form-hint--neutral">{{ baseAccountObservationState.error }}</p>

                    <div v-if="baseAccountObservationView()" class="evidence-inspection-adapter">
                        <span class="peer-badge" :class="baseAccountObservationBadgeClass()">{{ displayText(baseAccountObservationView().stateLabel) }}</span>

                        <dl v-if="baseAccountObservationView().state === BaseNetworkObservationState.OBSERVED" class="evidence-fields">
                            <div class="evidence-field"><dt>{{ t('publications.network2') }}</dt><dd>{{ baseAccountObservationView().network }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.chainId2') }}</dt><dd>{{ baseAccountObservationView().chainId }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.account') }}</dt><dd>{{ shortId(baseAccountObservationView().address) }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.nativeBalance') }}</dt><dd>{{ baseAccountObservationView().nativeBalanceWei }} wei</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.observedAt') }}</dt><dd>{{ baseAccountObservationView().observedAt }}</dd></div>
                        </dl>

                        <!-- A non-Base network is shown with its actual chain
                             id, never relabeled. -->
                        <dl v-else-if="baseAccountObservationView().state === BaseNetworkObservationState.CHAIN_MISMATCH" class="evidence-fields">
                            <div class="evidence-field"><dt>{{ t('publications.chainId2') }}</dt><dd>{{ baseAccountObservationView().chainId }}</dd></div>
                        </dl>

                        <p v-if="baseAccountObservationView().reason" class="form-hint form-hint--neutral">
                            {{ displayText(baseAccountObservationView().reason) }}
                        </p>
                    </div>
                </template>
            </div>

            <!-- Bitcoin transaction review: page-level, before anything is
                 published. -->
            <p v-if="bitcoinAnchorTransactionReview.reason && !bitcoinAnchorTransactionReviewView()" class="form-hint form-hint--neutral">
                {{ displayText(bitcoinAnchorTransactionReview.reason) }}
            </p>
            <div v-if="bitcoinAnchorTransactionReviewView()" class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">{{ t('publications.reviewBitcoinAnchorTransaction') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('publications.nothingIsSignedOrPublished') }}
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>{{ t('publications.network2') }}</dt><dd>{{ bitcoinAnchorTransactionReviewView().network }}</dd></div>
                    <div class="evidence-field"><dt>{{ t('publications.contentHash4') }}</dt><dd>{{ bitcoinAnchorTransactionReviewView().contentHash }}</dd></div>
                    <div class="evidence-field"><dt>{{ t('publications.fee2') }}</dt><dd>{{ bitcoinAnchorTransactionReviewView().feeSats }} sat</dd></div>
                    <div class="evidence-field"><dt>{{ t('publications.change2') }}</dt><dd>{{ bitcoinAnchorTransactionReviewView().changeSats }} sat</dd></div>
                    <div class="evidence-field"><dt>{{ t('publications.totalInput') }}</dt><dd>{{ bitcoinAnchorTransactionReviewView().totalInputSats }} sat</dd></div>
                </dl>
                <div class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.inputs2') }}</span>
                    <dl v-for="input in bitcoinAnchorTransactionReviewView().inputs" :key="input.txid + ':' + input.vout" class="evidence-fields">
                        <div class="evidence-field"><dt>{{ shortId(input.txid) }}:{{ input.vout }}</dt><dd>{{ input.valueSats }} sat ({{ input.scriptType }})</dd></div>
                    </dl>
                </div>
                <div class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.outputs2') }}</span>
                    <dl v-for="(output, index) in bitcoinAnchorTransactionReviewView().outputs" :key="index" class="evidence-fields">
                        <div class="evidence-field">
                            <dt>{{ output.type === 'change' ? t('publications.change3') : 'OP_RETURN' }}</dt>
                            <dd>{{ output.address ? shortId(output.address) + ' — ' : '' }}{{ output.valueSats }} sat</dd>
                        </div>
                    </dl>
                </div>

                <!-- A network mismatch is named, never auto-corrected. -->
                <div v-if="bitcoinAnchorTransactionReviewWalletMatchView()" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.wallet') }}</span>
                    <span class="peer-badge" :class="bitcoinWalletConnectionBadgeClass()">
                        {{ displayText(bitcoinAnchorTransactionReviewWalletMatchView().stateLabel) }}
                    </span>
                    <dl v-if="isBitcoinWalletConnected()" class="evidence-fields">
                        <div class="evidence-field"><dt>{{ t('publications.account') }}</dt><dd>{{ shortId(bitcoinAnchorTransactionReviewWalletMatchView().account) }}</dd></div>
                        <div class="evidence-field"><dt>{{ t('publications.walletNetwork') }}</dt><dd>{{ bitcoinAnchorTransactionReviewWalletMatchView().network }}</dd></div>
                        <div class="evidence-field"><dt>{{ t('publications.transactionNetwork') }}</dt><dd>{{ bitcoinAnchorTransactionReviewWalletMatchView().expectedNetwork }}</dd></div>
                    </dl>
                    <p v-if="bitcoinAnchorTransactionReviewWalletMatchView().networkMismatch" class="form-hint form-hint--neutral">
                        {{ t('publications.walletNetworkDoesNotMatch', { network: bitcoinAnchorTransactionReviewWalletMatchView().network, expectedNetwork: bitcoinAnchorTransactionReviewWalletMatchView().expectedNetwork }) }}
                    </p>
                    <p v-else-if="isBitcoinWalletConnected()" class="form-hint form-hint--neutral">
                        {{ t('publications.networkMatches') }}
                    </p>
                </div>

                <!-- The only signing action. A connected wallet is a
                     capability, not permission; the reviewed PSBT is handed
                     over byte for byte. -->
                <div class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.signing2') }}</span>
                    <button type="button" class="action-btn action-btn--secondary"
                        :disabled="!isBitcoinWalletConnected() || (bitcoinAnchorTransactionReviewWalletMatchView() && bitcoinAnchorTransactionReviewWalletMatchView().networkMismatch) || isBitcoinAnchorReviewedSigning()"
                        @click="signBitcoinAnchorReviewedTransaction">
                        {{ isBitcoinAnchorReviewedSigning() ? t('publications.waitingForWallet') : t('publications.signReviewedTransaction') }}
                    </button>

                    <span v-if="bitcoinAnchorReviewedSigningView().state !== BitcoinAnchorReviewedSigningState.IDLE" class="peer-badge"
                        :class="bitcoinAnchorReviewedSigningBadgeClass()">
                        {{ displayText(bitcoinAnchorReviewedSigningView().stateLabel) }}
                    </span>
                    <p v-if="bitcoinAnchorReviewedSigningView().reason" class="form-hint form-hint--neutral">
                        {{ displayText(bitcoinAnchorReviewedSigningView().reason) }}
                    </p>

                    <!-- SIGNED only means the wallet returned signing material
                         for this transaction, not that it has been verified. -->
                    <template v-if="bitcoinAnchorReviewedSigningView().state === BitcoinAnchorReviewedSigningState.SIGNED">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>{{ t('publications.signedInputs') }}</dt><dd>{{ bitcoinAnchorReviewedSigningView().signedInputCount }}</dd></div>
                        </dl>
                        <p class="form-hint form-hint--neutral">
                            {{ t('publications.theWalletReturnedASigned2') }}
                        </p>
                    </template>
                </div>

                <!-- A wallet-returned PSBT is untrusted until verified and
                     finalized here. -->
                <div v-if="bitcoinAnchorReviewedSigningView().state === BitcoinAnchorReviewedSigningState.SIGNED" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.verificationFinalization2') }}</span>
                    <p class="form-hint form-hint--neutral">
                        {{ t('publications.theWalletReturnedSigningMaterial') }}
                    </p>
                    <button type="button" class="action-btn action-btn--secondary" @click="finalizeBitcoinAnchorSignedPsbt">
                        {{ t('publications.verifyFinalizeTransaction2') }}
                    </button>

                    <span v-if="bitcoinAnchorSignedPsbtFinalizationView().state !== BitcoinAnchorSignedPsbtFinalizationState.IDLE" class="peer-badge"
                        :class="bitcoinAnchorSignedPsbtFinalizationBadgeClass()">
                        {{ displayText(bitcoinAnchorSignedPsbtFinalizationView().stateLabel) }}
                    </span>
                    <p v-if="bitcoinAnchorSignedPsbtFinalizationView().reason" class="form-hint form-hint--neutral">
                        {{ displayText(bitcoinAnchorSignedPsbtFinalizationView().reason) }}
                    </p>

                    <template v-if="bitcoinAnchorSignedPsbtFinalizationView().state === BitcoinAnchorSignedPsbtFinalizationState.FINALIZED">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>{{ t('publications.signatureVerification') }}</dt><dd>{{ t('publications.verified') }}</dd></div>
                            <div class="evidence-field">
                                <dt>{{ t('publications.verifiedInputs') }}</dt>
                                <dd>{{ bitcoinAnchorSignedPsbtFinalizationView().verifiedInputCount }} / {{ bitcoinAnchorReviewedSigningView().signedInputCount }}</dd>
                            </div>
                            <div class="evidence-field"><dt>{{ t('publications.transactionId3') }}</dt><dd>{{ bitcoinAnchorSignedPsbtFinalizationView().txid }}</dd></div>
                        </dl>
                        <details class="evidence-inspection-proof">
                            <summary>{{ t('publications.rawTransactionBytes') }}</summary>
                            <pre class="evidence-inspection-proof-json">{{ bitcoinAnchorSignedPsbtFinalizationView().rawTransactionHex }}</pre>
                        </details>
                        <p class="form-hint form-hint--neutral">
                            {{ t('publications.transactionFinalizedBroadcastingItIs') }}
                        </p>
                    </template>
                </div>

                <!-- The only step that reaches the network. BROADCASTED means
                     accepted, not confirmed; no automatic retry. -->
                <div v-if="bitcoinAnchorFinalizedTransaction" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.broadcast2') }}</span>
                    <dl class="evidence-fields">
                        <div class="evidence-field"><dt>{{ t('publications.transactionId3') }}</dt><dd>{{ bitcoinAnchorFinalizedTransaction.txid }}</dd></div>
                        <div class="evidence-field"><dt>{{ t('publications.finalizedTransaction') }}</dt><dd>{{ t('publications.bytes', { bytesCount: bitcoinAnchorFinalizedTransaction.rawTransaction.bytes.length }) }}</dd></div>
                    </dl>
                    <p class="form-hint form-hint--neutral">
                        {{ t('publications.thisIsTheExactTransaction') }}
                    </p>
                    <button type="button" class="action-btn action-btn--secondary"
                        :disabled="isBitcoinAnchorBroadcasting()"
                        @click="broadcastBitcoinAnchorTransaction">
                        {{ isBitcoinAnchorBroadcasting() ? t('publications.broadcasting') : (bitcoinAnchorBroadcastView().state === BitcoinAnchorBroadcastState.IDLE ? t('publications.broadcastTransaction') : t('publications.broadcastAgain')) }}
                    </button>

                    <span v-if="bitcoinAnchorBroadcastView().state !== BitcoinAnchorBroadcastState.IDLE" class="peer-badge"
                        :class="bitcoinAnchorBroadcastBadgeClass()">
                        {{ displayText(bitcoinAnchorBroadcastView().stateLabel) }}
                    </span>
                    <p v-if="bitcoinAnchorBroadcastView().reason" class="form-hint form-hint--neutral">
                        {{ displayText(bitcoinAnchorBroadcastView().reason) }}
                    </p>

                    <template v-if="bitcoinAnchorBroadcastView().state === BitcoinAnchorBroadcastState.BROADCASTED">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>{{ t('publications.transactionId3') }}</dt><dd>{{ bitcoinAnchorBroadcastView().txid }}</dd></div>
                        </dl>
                        <details class="evidence-inspection-proof">
                            <summary>{{ t('publications.rawTransactionBytes') }}</summary>
                            <pre class="evidence-inspection-proof-json">{{ bitcoinAnchorFinalizedTransaction.rawTransaction.hex }}</pre>
                        </details>
                        <p class="form-hint form-hint--neutral">
                            {{ t('publications.transactionBroadcastedThisIsNot') }}
                        </p>

                        <!-- Anchor minted automatically after BROADCASTED. -->
                        <template v-if="bitcoinAnchorPublicationCoordinator">
                            <span v-if="bitcoinAnchorPublicationView().label" class="peer-badge"
                                :class="bitcoinAnchorPublicationBadgeClass()">
                                {{ displayText(bitcoinAnchorPublicationView().label) }}
                            </span>
                            <p v-if="bitcoinAnchorPublicationView().message" class="form-hint form-hint--neutral">
                                {{ displayText(bitcoinAnchorPublicationView().message) }}
                            </p>
                            <p v-if="bitcoinAnchorPublicationView().reason" class="form-hint form-hint--neutral">
                                {{ displayText(bitcoinAnchorPublicationView().reason) }}
                            </p>
                            <dl v-if="bitcoinAnchorPublicationView().anchor" class="evidence-fields">
                                <div class="evidence-field"><dt>{{ t('publications.publicationAnchor') }}</dt><dd>{{ bitcoinAnchorPublicationView().anchor.id }}</dd></div>
                            </dl>
                        </template>
                    </template>
                </div>

                <!-- Confirmation is a separate explicit action; each click
                     appends to the history. -->
                <div v-if="bitcoinAnchorBroadcastView().state === BitcoinAnchorBroadcastState.BROADCASTED" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.confirmation2') }}</span>
                    <p class="form-hint form-hint--neutral">
                        {{ t('publications.theNetworkAcceptedThisTransaction2') }}
                    </p>

                    <button type="button" class="action-btn action-btn--secondary"
                        :disabled="bitcoinAnchorBroadcastConfirmationObserving"
                        @click="observeBitcoinAnchorBroadcastConfirmation">
                        {{ bitcoinAnchorBroadcastConfirmationObserving ? t('publications.observing') : (bitcoinAnchorBroadcastConfirmationView() ? t('publications.observeConfirmationAgain') : t('publications.observeConfirmation')) }}
                    </button>
                    <p v-if="bitcoinAnchorBroadcastConfirmationError" class="form-hint form-hint--neutral">
                        {{ bitcoinAnchorBroadcastConfirmationError }}
                    </p>

                    <template v-if="bitcoinAnchorBroadcastConfirmationView()">
                        <span class="peer-badge" :class="bitcoinAnchorBroadcastConfirmationBadgeClass()">
                            {{ displayText(bitcoinAnchorBroadcastConfirmationView().stateLabel) }}
                        </span>
                        <dl v-if="bitcoinAnchorBroadcastConfirmationView().blockHeight !== null" class="evidence-fields">
                            <div class="evidence-field"><dt>{{ t('publications.blockHeight2') }}</dt><dd>{{ bitcoinAnchorBroadcastConfirmationView().blockHeight }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.blockHash3') }}</dt><dd>{{ bitcoinAnchorBroadcastConfirmationView().blockHash }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.confirmations3') }}</dt><dd>{{ bitcoinAnchorBroadcastConfirmationView().confirmationCount }}</dd></div>
                        </dl>
                        <p v-if="bitcoinAnchorBroadcastConfirmationView().reason" class="form-hint form-hint--neutral">
                            {{ displayText(bitcoinAnchorBroadcastConfirmationView().reason) }}
                        </p>

                        <button v-if="bitcoinAnchorBroadcastConfirmationHistoryView().count > 0" type="button" class="action-btn action-btn--secondary"
                            @click="toggleBitcoinAnchorBroadcastConfirmationHistory">
                            {{ bitcoinAnchorBroadcastConfirmationHistoryExpanded ? t('publications.hideConfirmationHistory') : t('publications.showConfirmationHistory') }}
                        </button>
                    </template>

                    <!-- Confirmations of this broadcast, separate from the
                         per-anchor "Reconcile" history. -->
                    <div v-if="bitcoinAnchorBroadcastConfirmationHistoryExpanded">
                        <ul class="replica-knowledge-claim-list">
                            <li v-for="(item, index) in bitcoinAnchorBroadcastConfirmationHistoryView().entries" :key="index" class="replica-knowledge-claim">
                                <button type="button" class="action-btn action-btn--secondary"
                                    @click="toggleBitcoinAnchorBroadcastConfirmationHistoryEntry(index)">
                                    {{ formatWhen(item.observedAt) }} — {{ displayText(item.stateShortLabel) }}
                                </button>
                                <dl v-if="isBitcoinAnchorBroadcastConfirmationHistoryEntryExpanded(index)" class="evidence-fields">
                                    <div class="evidence-field"><dt>{{ t('publications.state3') }}</dt><dd>{{ displayText(item.stateLabel) }}</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.transactionId3') }}</dt><dd>{{ item.txid }}</dd></div>
                                    <div v-if="item.blockHash" class="evidence-field"><dt>{{ t('publications.blockHash3') }}</dt><dd>{{ item.blockHash }}</dd></div>
                                    <div v-if="item.blockHeight !== null" class="evidence-field"><dt>{{ t('publications.blockHeight2') }}</dt><dd>{{ item.blockHeight }}</dd></div>
                                    <div v-if="item.confirmationCount !== null" class="evidence-field"><dt>{{ t('publications.confirmations3') }}</dt><dd>{{ item.confirmationCount }}</dd></div>
                                    <div v-if="item.reason" class="evidence-field"><dt>{{ t('publications.reason3') }}</dt><dd>{{ displayText(item.reason) }}</dd></div>
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
                    <span class="identity-mgmt-name">{{ t('publications.historicalBitcoinAnchorEvidence') }}</span>
                    <span class="peer-badge peer-badge--pending">{{ t('publications.persistedLocally') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('publications.everyBitcoinAnchorThisArchive') }}
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>{{ t('publications.anchors') }}</dt><dd>{{ historicalBitcoinAnchorArchiveView().anchorCount }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="toggleHistoricalBitcoinAnchors">
                        {{ historicalBitcoinAnchorsExpanded ? t('publications.hideHistoricalAnchors') : t('publications.showHistoricalAnchors') }}
                    </button>
                </div>
                <div v-if="historicalBitcoinAnchorsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.archivedBitcoinAnchors') }}</span>
                    <p v-if="historicalBitcoinAnchorArchiveView().anchorCount === 0" class="form-hint form-hint--neutral">
                        {{ t('publications.noBitcoinAnchorFactsArchived') }}
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="anchorRow in historicalBitcoinAnchorArchiveView().anchors" :key="anchorRow.anchorId" class="replica-knowledge-claim">
                            <button type="button" class="action-btn action-btn--secondary" @click="toggleHistoricalBitcoinAnchorEntry(anchorRow.anchorId)">
                                {{ anchorRow.anchorId }}
                            </button>
                            <p class="form-hint form-hint--neutral">
                                {{ t('publications.broadcastObservationsConfirmationObservationsContent', { broadcastObservationCount: anchorRow.broadcastObservationCount, confirmationObservationCount: anchorRow.confirmationObservationCount, contentProofObservationCount: anchorRow.contentProofObservationCount, chainPlacementComparisonCount: anchorRow.chainPlacementComparisonCount, consistencyFindingCount: anchorRow.consistencyFindingCount }) }}
                            </p>

                            <div v-if="isHistoricalBitcoinAnchorEntryExpanded(anchorRow.anchorId) && historicalBitcoinAnchorEvidenceView(anchorRow.anchorId)" class="evidence-list">
                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">{{ t('publications.broadcastHistory') }}</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).broadcastObservations.count === 0" class="form-hint form-hint--neutral">{{ t('publications.noBroadcastObservationsRecorded') }}</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="item in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).broadcastObservations.observations" :key="item.index" class="replica-knowledge-claim">
                                            {{ displayText(item.stateLabel) }} — {{ item.broadcastedAt ? formatWhen(item.broadcastedAt) : t('publications.noTimestampRecorded') }}
                                            <template v-if="item.txid">{{ ' ' + t('publications.txid2', { txid: item.txid }) }}</template>
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">{{ t('publications.confirmationHistory') }}</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).confirmationObservations.count === 0" class="form-hint form-hint--neutral">{{ t('publications.noConfirmationObservationsRecorded') }}</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="item in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).confirmationObservations.observations" :key="item.index" class="replica-knowledge-claim">
                                            {{ t('publications.confirmationObservation', { number: item.index, observedAt: formatWhen(item.observedAt), stateLabel: displayText(item.stateLabel) }) }}
                                            <template v-if="item.blockHeight !== null && item.blockHeight !== undefined">{{ ' ' + t('publications.height', { blockHeight: item.blockHeight }) }}</template>
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">{{ t('publications.contentProofHistory') }}</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).contentProofObservations.count === 0" class="form-hint form-hint--neutral">{{ t('publications.noContentProofObservationsRecorded') }}</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="item in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).contentProofObservations.observations" :key="item.index" class="replica-knowledge-claim">
                                            {{ t('publications.contentProofObservation', { number: item.index, observedAt: formatWhen(item.observedAt), stateLabel: displayText(item.stateLabel) }) }}
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">{{ t('publications.chainPlacementComparisons') }}</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).chainPlacementObservations.count === 0" class="form-hint form-hint--neutral">{{ t('publications.notEnoughConfirmedObservationsExist3') }}</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="(comparison, index) in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).chainPlacementObservations.comparisons" :key="index" class="replica-knowledge-claim">
                                            {{ displayText(comparison.outcomeLabel) }}
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">{{ t('publications.observationConsistency') }}</span>
                                    <p v-if="historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).consistencyFindings.count === 0" class="form-hint form-hint--neutral">{{ t('publications.notEnoughConfirmedObservationsExist4') }}</p>
                                    <ul v-else class="replica-knowledge-claim-list">
                                        <li v-for="(finding, index) in historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).consistencyFindings.findings" :key="index" class="replica-knowledge-claim">
                                            {{ displayText(finding.stateLabel) }}
                                        </li>
                                    </ul>
                                </div>

                                <div class="evidence-list">
                                    <span class="evidence-convergence-title">{{ t('publications.combinedEvidence') }}</span>
                                    <p class="form-hint form-hint--neutral">
                                        {{ t('publications.broadcastConfirmationContentProofChain', { broadcastObservationsCount: historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).broadcastObservations.count, confirmationObservationsCount: historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).confirmationObservations.count, contentProofObservationsCount: historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).contentProofObservations.count, chainPlacementObservationsCount: historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).chainPlacementObservations.count, consistencyFindingsCount: historicalBitcoinAnchorEvidenceView(anchorRow.anchorId).consistencyFindings.count }) }}
                                    </p>
                                    <p class="form-hint form-hint--neutral">
                                        {{ t('publications.thisIsACorrelationOf') }}
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
                    <span class="identity-mgmt-name">{{ t('publications.bitcoinAnchorPublications') }}</span>
                    <span class="peer-badge peer-badge--pending">{{ t('publications.persistedLocally') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('publications.everyBitcoinAnchorPublicationAttempt') }}
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>{{ t('publications.publications2') }}</dt><dd>{{ bitcoinAnchorPublicationRecordHistoryView().count }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="toggleBitcoinAnchorPublications">
                        {{ bitcoinAnchorPublicationsExpanded ? t('publications.hidePublications') : t('publications.showPublications') }}
                    </button>
                </div>
                <div v-if="bitcoinAnchorPublicationsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.publicationIdentities') }}</span>
                    <p v-if="bitcoinAnchorPublicationRecordHistoryView().count === 0" class="form-hint form-hint--neutral">
                        {{ t('publications.noBitcoinAnchorPublicationIdentity') }}
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="publicationRow in bitcoinAnchorPublicationRecordHistoryView().records" :key="publicationRow.anchorId" class="replica-knowledge-claim">
                            <button type="button" class="action-btn action-btn--secondary" @click="toggleBitcoinAnchorPublicationInspection(publicationRow.anchorId)">
                                {{ publicationRow.anchorId }}
                            </button>
                            <p class="form-hint form-hint--neutral">
                                {{ t('publications.contentHashTxidNetworkCreated', { contentHash: publicationRow.contentHash, txid: publicationRow.txid, network: publicationRow.network, createdAt: formatWhen(publicationRow.createdAt) }) }}
                            </p>

                            <div v-if="isBitcoinAnchorPublicationInspectionExpanded(publicationRow.anchorId) && bitcoinAnchorPublicationInspectionView(publicationRow.anchorId)" class="evidence-list">
                                <span class="evidence-convergence-title">{{ t('publications.inspectObservations') }}</span>
                                <p class="form-hint form-hint--neutral">
                                    {{ t('publications.broadcastConfirmationContentProofChain', { broadcastObservationsCount: bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.broadcastObservations.count, confirmationObservationsCount: bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.confirmationObservations.count, contentProofObservationsCount: bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.contentProofObservations.count, chainPlacementObservationsCount: bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.chainPlacementObservations.count, consistencyFindingsCount: bitcoinAnchorPublicationInspectionView(publicationRow.anchorId).evidence.consistencyFindings.count }) }}
                                </p>
                                <p class="form-hint form-hint--neutral">
                                    {{ t('publications.thisIsACorrelationOf2') }}
                                </p>
                            </div>

                            <!-- Missing stages produce no row, never a
                                 fabricated "missing" entry. -->
                            <button type="button" class="action-btn action-btn--secondary" @click="toggleBitcoinAnchorPublicationLifecycle(publicationRow.anchorId)">
                                {{ isBitcoinAnchorPublicationLifecycleExpanded(publicationRow.anchorId) ? t('publications.hidePublicationLifecycle') : t('publications.showPublicationLifecycle') }}
                            </button>
                            <div v-if="isBitcoinAnchorPublicationLifecycleExpanded(publicationRow.anchorId)" class="evidence-list">
                                <span class="evidence-convergence-title">{{ t('publications.publicationLifecycle') }}</span>
                                <p v-if="!bitcoinAnchorPublicationLifecycleTimelineView(publicationRow.anchorId)" class="form-hint form-hint--neutral">
                                    {{ t('publications.noLifecycleTimelineAvailableFor') }}
                                </p>
                                <ul v-else class="replica-knowledge-claim-list">
                                    <li v-for="(item, timelineIndex) in bitcoinAnchorPublicationLifecycleTimelineView(publicationRow.anchorId).entries"
                                        :key="timelineIndex" class="replica-knowledge-claim">
                                        <span class="peer-badge peer-badge--pending">
                                            {{ formatWhen(item.observedAt) }} — {{ displayText(item.label) }}
                                        </span>
                        <p class="form-hint form-hint--neutral">{{ displayText(bitcoinAnchorPublicationLifecycleEntryDetail(item)) }}</p>
                                        <p v-if="item.reason" class="form-hint form-hint--neutral">{{ displayText(item.reason) }}</p>
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
                    <span class="identity-mgmt-name">{{ t('publications.baseAnchorPublications') }}</span>
                    <span class="peer-badge peer-badge--pending">{{ t('publications.persistedLocally') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('publications.everyBasePublicationAttemptThis') }}
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>{{ t('publications.publications2') }}</dt><dd>{{ baseAnchorPublicationRecordHistoryView().count }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="toggleBaseAnchorPublications">
                        {{ baseAnchorPublicationsExpanded ? t('publications.hidePublications') : t('publications.showPublications') }}
                    </button>
                </div>
                <div v-if="baseAnchorPublicationsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.publicationIdentities') }}</span>
                    <p v-if="baseAnchorPublicationRecordHistoryView().count === 0" class="form-hint form-hint--neutral">
                        {{ t('publications.noBasePublicationIdentityMinted') }}
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="publicationRow in baseAnchorPublicationRecordHistoryView().records" :key="publicationRow.txid" class="replica-knowledge-claim">
                            <span class="peer-badge peer-badge--pending">{{ publicationRow.txid }}</span>
                            <p class="form-hint form-hint--neutral">
                                {{ t('publications.contentHashTxidNetworkCreated', { contentHash: publicationRow.contentHash, txid: publicationRow.txid, network: publicationRow.network, createdAt: formatWhen(publicationRow.createdAt) }) }}
                            </p>

                            <button type="button" class="action-btn action-btn--secondary" @click="toggleBaseAnchorPublicationLifecycle(publicationRow.txid)">
                                {{ isBaseAnchorPublicationLifecycleExpanded(publicationRow.txid) ? t('publications.hidePublicationLifecycle') : t('publications.showPublicationLifecycle') }}
                            </button>
                            <div v-if="isBaseAnchorPublicationLifecycleExpanded(publicationRow.txid)" class="evidence-list">
                                <span class="evidence-convergence-title">{{ t('publications.publicationLifecycle') }}</span>
                                <p v-if="!baseAnchorPublicationLifecycleTimelineView(publicationRow.txid)" class="form-hint form-hint--neutral">
                                    {{ t('publications.noLifecycleTimelineAvailableFor2') }}
                                </p>
                                <ul v-else class="replica-knowledge-claim-list">
                                    <li v-for="(item, timelineIndex) in baseAnchorPublicationLifecycleTimelineView(publicationRow.txid).entries"
                                        :key="timelineIndex" class="replica-knowledge-claim">
                                        <span class="peer-badge peer-badge--pending">
                                            {{ formatWhen(item.observedAt) }} — {{ displayText(item.label) }}
                                        </span>
                                        <p class="form-hint form-hint--neutral">{{ displayText(baseAnchorPublicationLifecycleEntryDetail(item)) }}</p>
                                        <p v-if="item.reason" class="form-hint form-hint--neutral">{{ displayText(item.reason) }}</p>
                                    </li>
                                </ul>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
            </div>`;
