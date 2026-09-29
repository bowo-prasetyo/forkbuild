// Publications page template: the Evidence tab's Bitcoin and Base anchor transaction plans.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const anchorTransactionPlansTemplate = `<!-- Turns observed funding into an unsigned plan; needs
                             the funding panel's observation and never
                             re-observes it. -->
                        <div v-if="bitcoinAnchorTransactionConstructionCoordinator" class="evidence-list">
                            <div class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">{{ t('publications.bitcoinAnchorTransaction') }}</span>
                                    <span v-if="bitcoinAnchorTransactionConstructionView(entry)" class="peer-badge"
                                        :class="bitcoinAnchorTransactionConstructionBadgeClass(entry)">
                                        {{ displayText(bitcoinAnchorTransactionConstructionView(entry).stateLabel) }}
                                    </span>
                                </div>
                                <p class="form-hint form-hint--neutral">
                                    {{ t('publications.turnsTheWalletFundingObserved') }}
                                </p>
                                <p v-if="!isBitcoinAnchorFundingObserved()" class="form-hint form-hint--neutral">
                                    <I18nText keypath="publications.firstObserveWalletFundingIn">
                                        <template #tools><button type="button" class="inline-link-btn" @click="openPublicationsTools('anchoring')">{{ t('publications.walletArchivePublisherTools') }}</button></template>
                                    </I18nText>
                                </p>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--primary"
                                            :disabled="!isBitcoinAnchorFundingObserved() || (bitcoinAnchorTransactionConstructionView(entry) && bitcoinAnchorTransactionConstructionView(entry).state === BitcoinAnchorTransactionConstructionState.CONSTRUCTING)"
                                            @click="constructBitcoinAnchorTransaction(entry)">
                                        {{ t('publications.buildTransactionPlan') }}
                                    </button>
                                </div>

                                <template v-if="bitcoinAnchorTransactionConstructionView(entry)">
                                    <p v-if="bitcoinAnchorTransactionConstructionView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ displayText(bitcoinAnchorTransactionConstructionView(entry).reason) }}
                                    </p>

                                    <template v-if="bitcoinAnchorTransactionConstructionView(entry).state === BitcoinAnchorTransactionConstructionState.CONSTRUCTED">
                                        <dl class="evidence-fields">
                                            <div class="evidence-field"><dt>{{ t('publications.network') }}</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).network }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.contentHash2') }}</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).contentHash }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.selectedInputs') }}</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).selectedInputCount }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.fee') }}</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).feeSats }} sat</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.change') }}</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).changeSats }} sat</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.totalInputs') }}</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).totalInputSats }} sat</dd></div>
                                        </dl>
                                        <div class="evidence-inspection-adapter">
                                            <span class="evidence-inspection-adapter-title">{{ t('publications.inputs') }}</span>
                                            <dl v-for="input in bitcoinAnchorTransactionConstructionView(entry).inputs" :key="input.txid + ':' + input.vout" class="evidence-fields">
                                                <div class="evidence-field"><dt>{{ shortId(input.txid) }}:{{ input.vout }}</dt><dd>{{ input.valueSats }} sat ({{ input.scriptType }})</dd></div>
                                            </dl>
                                        </div>
                                        <div class="evidence-inspection-adapter">
                                            <span class="evidence-inspection-adapter-title">{{ t('publications.outputs') }}</span>
                                            <dl v-for="(output, index) in bitcoinAnchorTransactionConstructionView(entry).outputs" :key="index" class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>{{ output.type === 'change' ? t('publications.change3') : 'OP_RETURN' }}</dt>
                                                    <dd>{{ output.address ? shortId(output.address) + ' — ' : '' }}{{ output.valueSats }} sat</dd>
                                                </div>
                                            </dl>
                                        </div>
                                        <p class="form-hint form-hint--neutral">
                                            {{ t('publications.fundingObservedPlanConstructedThe', { fundingObservedAt: formatWhen(bitcoinAnchorTransactionConstructionView(entry).fundingObservedAt), constructedAt: formatWhen(bitcoinAnchorTransactionConstructionView(entry).constructedAt) }) }}
                                        </p>
                                    </template>
                                </template>
                            </div>
                        </div>

                        <!-- Turns an observed Base account into an unsigned
                             plan; needs the account observation and never
                             re-observes it. -->
                        <div v-if="basePublicationTransactionPlanCoordinator" class="evidence-list">
                            <div class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">{{ t('publications.basePublicationTransaction') }}</span>
                                    <span v-if="basePublicationTransactionPlanView(entry)" class="peer-badge"
                                        :class="basePublicationTransactionPlanBadgeClass(entry)">
                                        {{ displayText(basePublicationTransactionPlanView(entry).stateLabel) }}
                                    </span>
                                </div>
                                <p class="form-hint form-hint--neutral">
                                    {{ t('publications.turnsTheBaseAccountObserved') }}
                                </p>
                                <p v-if="!isBaseAccountObserved()" class="form-hint form-hint--neutral">
                                    <I18nText keypath="publications.firstObserveABaseAccount">
                                        <template #tools><button type="button" class="inline-link-btn" @click="openPublicationsTools('anchoring')">{{ t('publications.walletArchivePublisherTools') }}</button></template>
                                    </I18nText>
                                </p>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--primary"
                                            :disabled="!isBaseAccountObserved() || (basePublicationTransactionPlanView(entry) && basePublicationTransactionPlanView(entry).state === BasePublicationTransactionPlanState.CONSTRUCTING)"
                                            @click="constructBasePublicationTransaction(entry)">
                                        {{ basePublicationTransactionPlanView(entry) && basePublicationTransactionPlanView(entry).state === BasePublicationTransactionPlanState.CONSTRUCTING ? t('publications.constructing') : t('publications.createBaseTransactionPlan') }}
                                    </button>
                                </div>

                                <template v-if="basePublicationTransactionPlanView(entry)">
                                    <p v-if="basePublicationTransactionPlanView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ displayText(basePublicationTransactionPlanView(entry).reason) }}
                                    </p>

                                    <template v-if="basePublicationTransactionPlanView(entry).state === BasePublicationTransactionPlanState.CONSTRUCTED">
                                        <dl class="evidence-fields">
                                            <div class="evidence-field"><dt>{{ t('publications.network') }}</dt><dd>{{ basePublicationTransactionPlanView(entry).network }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.chainId') }}</dt><dd>{{ basePublicationTransactionPlanView(entry).chainId }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.contentHash2') }}</dt><dd>{{ basePublicationTransactionPlanView(entry).contentHash }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.from') }}</dt><dd>{{ shortId(basePublicationTransactionPlanView(entry).from) }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.to') }}</dt><dd>{{ t('publications.selfTransfer', { to: shortId(basePublicationTransactionPlanView(entry).to) }) }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.value') }}</dt><dd>{{ basePublicationTransactionPlanView(entry).value }} wei</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.nonce') }}</dt><dd>{{ basePublicationTransactionPlanView(entry).nonce }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.gasLimit') }}</dt><dd>{{ basePublicationTransactionPlanView(entry).gasLimit }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.maxFeePerGas') }}</dt><dd>{{ basePublicationTransactionPlanView(entry).maxFeePerGas }} wei</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.priorityFee') }}</dt><dd>{{ basePublicationTransactionPlanView(entry).maxPriorityFeePerGas }} wei</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.data') }}</dt><dd>{{ basePublicationTransactionPlanView(entry).data }}</dd></div>
                                        </dl>
                                        <p class="form-hint form-hint--neutral">
                                            {{ t('publications.accountObservedPlanConstructedThe', { accountObservedAt: formatWhen(basePublicationTransactionPlanView(entry).accountObservedAt), constructedAt: formatWhen(basePublicationTransactionPlanView(entry).constructedAt) }) }}
                                        </p>
                                    </template>
                                </template>
                            </div>

                            <!-- Shown as soon as the plan is CONSTRUCTED;
                                 read-only. -->
                            <div v-if="basePublicationTransactionReviewView(entry)" class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">{{ t('publications.baseTransactionReview') }}</span>
                                </div>
                                <p class="form-hint form-hint--neutral">
                                    {{ t('publications.theFollowingTransactionPlanWill') }}
                                </p>
                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>{{ t('publications.from') }}</dt><dd>{{ basePublicationTransactionReviewView(entry).from }}</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.to') }}</dt><dd>{{ basePublicationTransactionReviewView(entry).to }}</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.value') }}</dt><dd>{{ basePublicationTransactionReviewView(entry).value }} wei</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.nonce') }}</dt><dd>{{ basePublicationTransactionReviewView(entry).nonce }}</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.gasLimit') }}</dt><dd>{{ basePublicationTransactionReviewView(entry).gasLimit }}</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.maxFeePerGas') }}</dt><dd>{{ basePublicationTransactionReviewView(entry).maxFeePerGas }} wei</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.priorityFee') }}</dt><dd>{{ basePublicationTransactionReviewView(entry).maxPriorityFeePerGas }} wei</dd></div>
                                </dl>
                                <div class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">{{ t('publications.contentHash3') }}</span>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field"><dd>{{ basePublicationTransactionReviewView(entry).contentHash }}</dd></div>
                                    </dl>
                                </div>
                                <div class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">{{ t('publications.transactionData') }}</span>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field"><dd>{{ basePublicationTransactionReviewView(entry).transactionData }}</dd></div>
                                    </dl>
                                </div>

                                <!-- One-click alternative to the step-by-step
                                     pipeline below; both stay usable. -->
                                <div v-if="baseAnchorPublisher" class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">{{ t('publications.createBaseAnchor') }}</span>
                                    <p class="form-hint form-hint--neutral">
                                        {{ t('publications.signsFinalizesAndBroadcastsThe') }}
                                    </p>
                                    <button type="button" class="action-btn action-btn--secondary"
                                        :disabled="baseAnchorCreationView(entry).state === 'creating'"
                                        @click="createBaseAnchor(entry)">
                                        {{ displayText(baseAnchorCreationButtonLabel(entry)) }}
                                    </button>
                                    <span v-if="baseAnchorCreationView(entry).label" class="peer-badge"
                                        :class="baseAnchorCreationBadgeClass(entry)">
                                        {{ displayText(baseAnchorCreationView(entry).label) }}
                                    </span>
                                    <p v-if="baseAnchorCreationView(entry).message" class="form-hint form-hint--neutral">
                                        {{ displayText(baseAnchorCreationView(entry).message) }}
                                    </p>
                                    <p v-if="baseAnchorCreationView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ displayText(baseAnchorCreationView(entry).reason) }}
                                    </p>
                                </div>

                                <!-- The only Base signing action; hands over
                                     the exact plan and review shown. Signing
                                     does not broadcast. -->
                                <div v-if="baseReviewedSigningCoordinator" class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">{{ t('publications.signing') }}</span>
                                    <p class="form-hint form-hint--neutral">
                                        {{ t('publications.signingAuthorizesTheExactTransaction') }}
                                    </p>
                                    <button type="button" class="action-btn action-btn--secondary"
                                        :disabled="isBaseReviewedTransactionSigning(entry)"
                                        @click="signBaseReviewedTransaction(entry)">
                                        {{ isBaseReviewedTransactionSigning(entry) ? t('publications.waitingForWallet') : t('publications.signReviewedTransaction') }}
                                    </button>

                                    <span v-if="baseReviewedTransactionSigningView(entry).state !== BaseReviewedSigningState.IDLE" class="peer-badge"
                                        :class="baseReviewedTransactionSigningBadgeClass(entry)">
                                        {{ displayText(baseReviewedTransactionSigningView(entry).stateLabel) }}
                                    </span>
                                    <p v-if="baseReviewedTransactionSigningView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ displayText(baseReviewedTransactionSigningView(entry).reason) }}
                                    </p>

                                    <!-- SIGNED only means the wallet returned
                                         an artifact for the reviewed plan, not
                                         that it was verified or broadcast. -->
                                    <p v-if="baseReviewedTransactionSigningView(entry).state === BaseReviewedSigningState.SIGNED"
                                       class="form-hint form-hint--neutral">
                                        {{ t('publications.theWalletReturnedASigned') }}
                                    </p>
                                </div>

                                <!-- A wallet-returned artifact is untrusted
                                     until verified against the reviewed plan
                                     here. Finalizing does not broadcast. -->
                                <div v-if="baseSignedTransactionFinalizationCoordinator && baseReviewedTransactionSigningView(entry).state === BaseReviewedSigningState.SIGNED"
                                     class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">{{ t('publications.verificationFinalization') }}</span>
                                    <p class="form-hint form-hint--neutral">
                                        {{ t('publications.finalizingIndependentlyCryptographicallyVerifiesThe') }}
                                    </p>
                                    <button type="button" class="action-btn action-btn--secondary"
                                        @click="finalizeBaseSignedTransaction(entry)">
                                        {{ t('publications.verifyFinalizeTransaction') }}
                                    </button>

                                    <span v-if="baseSignedTransactionFinalizationView(entry).state !== BaseSignedTransactionFinalizationState.IDLE" class="peer-badge"
                                        :class="baseSignedTransactionFinalizationBadgeClass(entry)">
                                        {{ displayText(baseSignedTransactionFinalizationView(entry).stateLabel) }}
                                    </span>
                                    <p v-if="baseSignedTransactionFinalizationView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ displayText(baseSignedTransactionFinalizationView(entry).reason) }}
                                    </p>

                                    <!-- FINALIZED: decoded, matches the plan
                                         field for field, and signed by the
                                         plan's from account. Not broadcast or
                                         confirmed. -->
                                    <template v-if="baseSignedTransactionFinalizationView(entry).state === BaseSignedTransactionFinalizationState.FINALIZED">
                                        <dl class="evidence-fields">
                                            <div class="evidence-field"><dt>{{ t('publications.recoveredSigner') }}</dt><dd>{{ baseSignedTransactionFinalizationView(entry).from }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.transactionHash') }}</dt><dd>{{ baseSignedTransactionFinalizationView(entry).transactionHash }}</dd></div>
                                        </dl>
                                        <p class="form-hint form-hint--neutral">
                                            {{ t('publications.theSignedTransactionMatchesThe') }}
                                        </p>
                                    </template>
                                </div>

                                <!-- Submits the exact finalized raw
                                     transaction. BROADCASTED does not mean
                                     confirmed. -->
                                <div v-if="baseTransactionBroadcastCoordinator && baseSignedTransactionFinalizationView(entry).state === BaseSignedTransactionFinalizationState.FINALIZED"
                                     class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">{{ t('publications.broadcast') }}</span>
                                    <p class="form-hint form-hint--neutral">
                                        {{ t('publications.broadcastingSubmitsTheExactFinalized') }}
                                    </p>
                                    <button type="button" class="action-btn action-btn--secondary"
                                        :disabled="isBaseTransactionBroadcasting(entry)"
                                        @click="broadcastBaseTransaction(entry)">
                                        {{ isBaseTransactionBroadcasting(entry) ? t('publications.broadcasting') : (baseTransactionBroadcastView(entry).state === BaseTransactionBroadcastState.IDLE ? t('publications.broadcastTransaction') : t('publications.broadcastAgain')) }}
                                    </button>

                                    <span v-if="baseTransactionBroadcastView(entry).state !== BaseTransactionBroadcastState.IDLE" class="peer-badge"
                                        :class="baseTransactionBroadcastBadgeClass(entry)">
                                        {{ displayText(baseTransactionBroadcastView(entry).stateLabel) }}
                                    </span>
                                    <p v-if="baseTransactionBroadcastView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ displayText(baseTransactionBroadcastView(entry).reason) }}
                                    </p>

                                    <dl v-if="baseTransactionBroadcastView(entry).state === BaseTransactionBroadcastState.BROADCASTED" class="evidence-fields">
                                        <div class="evidence-field"><dt>{{ t('publications.transactionId2') }}</dt><dd>{{ baseTransactionBroadcastView(entry).txid }}</dd></div>
                                    </dl>
                                </div>

                                <!-- Asks Base whether the broadcast hash is in
                                     a block, one fresh observation per click;
                                     every observation is kept and archived. -->
                                <div v-if="baseTransactionInclusionObservationCoordinator && baseTransactionBroadcastView(entry).state === BaseTransactionBroadcastState.BROADCASTED"
                                     class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">{{ t('publications.baseTransactionInclusion') }}</span>
                                    <p class="form-hint form-hint--neutral">
                                        {{ t('publications.theNetworkAcceptedThisTransaction') }}
                                    </p>

                                    <button type="button" class="action-btn action-btn--secondary"
                                        :disabled="isBaseTransactionInclusionObserving(entry)"
                                        @click="observeBaseTransactionInclusion(entry)">
                                        {{ isBaseTransactionInclusionObserving(entry) ? t('publications.observing') : (baseTransactionInclusionView(entry) ? t('publications.observeTransactionAgain') : t('publications.observeTransaction')) }}
                                    </button>
                                    <p v-if="entry.baseTransactionInclusionError" class="form-hint form-hint--neutral">
                                        {{ entry.baseTransactionInclusionError }}
                                    </p>

                                    <template v-if="baseTransactionInclusionView(entry)">
                                        <span class="peer-badge" :class="baseTransactionInclusionBadgeClass(entry)">
                                            {{ displayText(baseTransactionInclusionView(entry).stateLabel) }}
                                        </span>

                                        <!-- INCLUDED only means a receipt
                                             exists now; a reorganization is
                                             still possible and is not detected. -->
                                        <dl v-if="baseTransactionInclusionView(entry).state === BaseTransactionInclusionObservationState.INCLUDED" class="evidence-fields">
                                            <div class="evidence-field"><dt>{{ t('publications.blockHash2') }}</dt><dd>{{ baseTransactionInclusionView(entry).blockHash }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.blockNumber') }}</dt><dd>{{ baseTransactionInclusionView(entry).blockNumber }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.transactionIndex') }}</dt><dd>{{ baseTransactionInclusionView(entry).transactionIndex }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.confirmations2') }}</dt><dd>{{ baseTransactionInclusionView(entry).confirmationCount }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.observed') }}</dt><dd>{{ formatWhen(baseTransactionInclusionView(entry).observedAt) }}</dd></div>
                                        </dl>
                                        <p v-else-if="baseTransactionInclusionView(entry).state === BaseTransactionInclusionObservationState.NOT_INCLUDED" class="form-hint form-hint--neutral">
                                            {{ t('publications.noReceiptWasReturnedFor', { observedAt: formatWhen(baseTransactionInclusionView(entry).observedAt) }) }}
                                        </p>
                                        <p v-if="baseTransactionInclusionView(entry).reason" class="form-hint form-hint--neutral">
                                            {{ displayText(baseTransactionInclusionView(entry).reason) }}
                                        </p>

                                        <button v-if="baseTransactionInclusionHistoryView(entry).count > 1" type="button" class="action-btn action-btn--secondary"
                                            @click="toggleBaseTransactionInclusionHistory(entry)">
                                            {{ entry.baseTransactionInclusionHistoryExpanded ? t('publications.hideObservationHistory') : t('publications.showObservationHistoryCount', { count: baseTransactionInclusionHistoryView(entry).count }) }}
                                        </button>
                                    </template>

                                    <div v-if="entry.baseTransactionInclusionHistoryExpanded">
                                        <ul class="replica-knowledge-claim-list">
                                            <li v-for="(item, index) in baseTransactionInclusionHistoryView(entry).observations" :key="index" class="replica-knowledge-claim">
                                                <dl class="evidence-fields">
                                                    <div class="evidence-field"><dt>{{ t('publications.observed') }}</dt><dd>{{ formatWhen(item.observedAt) }}</dd></div>
                                                    <div class="evidence-field"><dt>{{ t('publications.state2') }}</dt><dd>{{ displayText(item.stateShortLabel) }}</dd></div>
                                                    <div v-if="item.blockHash" class="evidence-field"><dt>{{ t('publications.blockHash2') }}</dt><dd>{{ item.blockHash }}</dd></div>
                                                    <div v-if="item.blockNumber !== null" class="evidence-field"><dt>{{ t('publications.blockNumber') }}</dt><dd>{{ item.blockNumber }}</dd></div>
                                                    <div v-if="item.confirmationCount !== null" class="evidence-field"><dt>{{ t('publications.confirmations2') }}</dt><dd>{{ item.confirmationCount }}</dd></div>
                                                    <div v-if="item.reason" class="evidence-field"><dt>{{ t('publications.reason2') }}</dt><dd>{{ displayText(item.reason) }}</dd></div>
                                                </dl>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>`;
