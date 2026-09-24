// Publications page template: the Evidence tab's Bitcoin and Base anchor transaction plans.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const anchorTransactionPlansTemplate = `<!-- Turns observed funding into an unsigned plan; needs
                             the funding panel's observation and never
                             re-observes it. -->
                        <div v-if="bitcoinAnchorTransactionConstructionCoordinator" class="evidence-list">
                            <div class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">Bitcoin Anchor Transaction</span>
                                    <span v-if="bitcoinAnchorTransactionConstructionView(entry)" class="peer-badge"
                                        :class="bitcoinAnchorTransactionConstructionBadgeClass(entry)">
                                        {{ bitcoinAnchorTransactionConstructionView(entry).stateLabel }}
                                    </span>
                                </div>
                                <p class="form-hint form-hint--neutral">
                                    Turns the wallet funding observed above into an unsigned transaction plan for
                                    THIS publication's own content hash. Nothing is signed or broadcast by
                                    constructing this — it only names which observed inputs would be spent, and
                                    what the resulting fee and change would be.
                                </p>
                                <p v-if="!isBitcoinAnchorFundingObserved()" class="form-hint form-hint--neutral">
                                    Observe wallet funding above before creating a transaction plan.
                                </p>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--primary"
                                            :disabled="!isBitcoinAnchorFundingObserved() || (bitcoinAnchorTransactionConstructionView(entry) && bitcoinAnchorTransactionConstructionView(entry).state === BitcoinAnchorTransactionConstructionState.CONSTRUCTING)"
                                            @click="constructBitcoinAnchorTransaction(entry)">
                                        Create Transaction Plan
                                    </button>
                                </div>

                                <template v-if="bitcoinAnchorTransactionConstructionView(entry)">
                                    <p v-if="bitcoinAnchorTransactionConstructionView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ bitcoinAnchorTransactionConstructionView(entry).reason }}
                                    </p>

                                    <template v-if="bitcoinAnchorTransactionConstructionView(entry).state === BitcoinAnchorTransactionConstructionState.CONSTRUCTED">
                                        <dl class="evidence-fields">
                                            <div class="evidence-field"><dt>Network</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).network }}</dd></div>
                                            <div class="evidence-field"><dt>Content hash</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).contentHash }}</dd></div>
                                            <div class="evidence-field"><dt>Selected inputs</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).selectedInputCount }}</dd></div>
                                            <div class="evidence-field"><dt>Fee</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).feeSats }} sat</dd></div>
                                            <div class="evidence-field"><dt>Change</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).changeSats }} sat</dd></div>
                                            <div class="evidence-field"><dt>Total inputs</dt><dd>{{ bitcoinAnchorTransactionConstructionView(entry).totalInputSats }} sat</dd></div>
                                        </dl>
                                        <div class="evidence-inspection-adapter">
                                            <span class="evidence-inspection-adapter-title">Inputs</span>
                                            <dl v-for="input in bitcoinAnchorTransactionConstructionView(entry).inputs" :key="input.txid + ':' + input.vout" class="evidence-fields">
                                                <div class="evidence-field"><dt>{{ shortId(input.txid) }}:{{ input.vout }}</dt><dd>{{ input.valueSats }} sat ({{ input.scriptType }})</dd></div>
                                            </dl>
                                        </div>
                                        <div class="evidence-inspection-adapter">
                                            <span class="evidence-inspection-adapter-title">Outputs</span>
                                            <dl v-for="(output, index) in bitcoinAnchorTransactionConstructionView(entry).outputs" :key="index" class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>{{ output.type === 'change' ? 'Change' : 'OP_RETURN' }}</dt>
                                                    <dd>{{ output.address ? shortId(output.address) + ' — ' : '' }}{{ output.valueSats }} sat</dd>
                                                </div>
                                            </dl>
                                        </div>
                                        <p class="form-hint form-hint--neutral">
                                            Funding observed {{ formatWhen(bitcoinAnchorTransactionConstructionView(entry).fundingObservedAt) }};
                                            plan constructed {{ formatWhen(bitcoinAnchorTransactionConstructionView(entry).constructedAt) }}.
                                            The observed funding may already be stale by now — this plan records what it was built from, it
                                            does not claim those inputs are still spendable.
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
                                    <span class="evidence-anchor-type">Base Publication Transaction</span>
                                    <span v-if="basePublicationTransactionPlanView(entry)" class="peer-badge"
                                        :class="basePublicationTransactionPlanBadgeClass(entry)">
                                        {{ basePublicationTransactionPlanView(entry).stateLabel }}
                                    </span>
                                </div>
                                <p class="form-hint form-hint--neutral">
                                    Turns the Base account observed above into an unsigned, self-transfer
                                    transaction plan carrying THIS publication's own content hash as raw
                                    transaction data. Nothing is signed or broadcast by constructing this — it
                                    only names the nonce, gas limit, and fee figures the account was observed
                                    with, and the exact bytes the transaction would carry.
                                </p>
                                <p v-if="!isBaseAccountObserved()" class="form-hint form-hint--neutral">
                                    Observe a Base account above before creating a transaction plan.
                                </p>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--primary"
                                            :disabled="!isBaseAccountObserved() || (basePublicationTransactionPlanView(entry) && basePublicationTransactionPlanView(entry).state === BasePublicationTransactionPlanState.CONSTRUCTING)"
                                            @click="constructBasePublicationTransaction(entry)">
                                        {{ basePublicationTransactionPlanView(entry) && basePublicationTransactionPlanView(entry).state === BasePublicationTransactionPlanState.CONSTRUCTING ? 'Constructing…' : 'Create Base Transaction Plan' }}
                                    </button>
                                </div>

                                <template v-if="basePublicationTransactionPlanView(entry)">
                                    <p v-if="basePublicationTransactionPlanView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ basePublicationTransactionPlanView(entry).reason }}
                                    </p>

                                    <template v-if="basePublicationTransactionPlanView(entry).state === BasePublicationTransactionPlanState.CONSTRUCTED">
                                        <dl class="evidence-fields">
                                            <div class="evidence-field"><dt>Network</dt><dd>{{ basePublicationTransactionPlanView(entry).network }}</dd></div>
                                            <div class="evidence-field"><dt>Chain ID</dt><dd>{{ basePublicationTransactionPlanView(entry).chainId }}</dd></div>
                                            <div class="evidence-field"><dt>Content hash</dt><dd>{{ basePublicationTransactionPlanView(entry).contentHash }}</dd></div>
                                            <div class="evidence-field"><dt>From</dt><dd>{{ shortId(basePublicationTransactionPlanView(entry).from) }}</dd></div>
                                            <div class="evidence-field"><dt>To</dt><dd>{{ shortId(basePublicationTransactionPlanView(entry).to) }} (self-transfer)</dd></div>
                                            <div class="evidence-field"><dt>Value</dt><dd>{{ basePublicationTransactionPlanView(entry).value }} wei</dd></div>
                                            <div class="evidence-field"><dt>Nonce</dt><dd>{{ basePublicationTransactionPlanView(entry).nonce }}</dd></div>
                                            <div class="evidence-field"><dt>Gas limit</dt><dd>{{ basePublicationTransactionPlanView(entry).gasLimit }}</dd></div>
                                            <div class="evidence-field"><dt>Max fee per gas</dt><dd>{{ basePublicationTransactionPlanView(entry).maxFeePerGas }} wei</dd></div>
                                            <div class="evidence-field"><dt>Priority fee</dt><dd>{{ basePublicationTransactionPlanView(entry).maxPriorityFeePerGas }} wei</dd></div>
                                            <div class="evidence-field"><dt>Data</dt><dd>{{ basePublicationTransactionPlanView(entry).data }}</dd></div>
                                        </dl>
                                        <p class="form-hint form-hint--neutral">
                                            Account observed {{ formatWhen(basePublicationTransactionPlanView(entry).accountObservedAt) }};
                                            plan constructed {{ formatWhen(basePublicationTransactionPlanView(entry).constructedAt) }}.
                                            The observed balance and fee figures may already be stale by now — this plan records what
                                            it was built from, it does not claim the network still prices gas this way.
                                        </p>
                                    </template>
                                </template>
                            </div>

                            <!-- Shown as soon as the plan is CONSTRUCTED;
                                 read-only. -->
                            <div v-if="basePublicationTransactionReviewView(entry)" class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">Base Transaction Review</span>
                                </div>
                                <p class="form-hint form-hint--neutral">
                                    The following transaction plan will be supplied to the signing capability if
                                    you explicitly continue. Reviewing it does not sign, broadcast, or validate it
                                    against the network — it names exactly what a wallet would be asked to sign,
                                    nothing more, and nothing assumed.
                                </p>
                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>From</dt><dd>{{ basePublicationTransactionReviewView(entry).from }}</dd></div>
                                    <div class="evidence-field"><dt>To</dt><dd>{{ basePublicationTransactionReviewView(entry).to }}</dd></div>
                                    <div class="evidence-field"><dt>Value</dt><dd>{{ basePublicationTransactionReviewView(entry).value }} wei</dd></div>
                                    <div class="evidence-field"><dt>Nonce</dt><dd>{{ basePublicationTransactionReviewView(entry).nonce }}</dd></div>
                                    <div class="evidence-field"><dt>Gas limit</dt><dd>{{ basePublicationTransactionReviewView(entry).gasLimit }}</dd></div>
                                    <div class="evidence-field"><dt>Max fee per gas</dt><dd>{{ basePublicationTransactionReviewView(entry).maxFeePerGas }} wei</dd></div>
                                    <div class="evidence-field"><dt>Priority fee</dt><dd>{{ basePublicationTransactionReviewView(entry).maxPriorityFeePerGas }} wei</dd></div>
                                </dl>
                                <div class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">Content Hash</span>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field"><dd>{{ basePublicationTransactionReviewView(entry).contentHash }}</dd></div>
                                    </dl>
                                </div>
                                <div class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">Transaction Data</span>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field"><dd>{{ basePublicationTransactionReviewView(entry).transactionData }}</dd></div>
                                    </dl>
                                </div>

                                <!-- One-click alternative to the step-by-step
                                     pipeline below; both stay usable. -->
                                <div v-if="baseAnchorPublisher" class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">Create Base Anchor</span>
                                    <p class="form-hint form-hint--neutral">
                                        Signs, finalizes, and broadcasts the exact transaction reviewed above in one
                                        step, then records a Base anchor for this publication — an alternative to
                                        signing it step by step below.
                                    </p>
                                    <button type="button" class="action-btn action-btn--secondary"
                                        :disabled="baseAnchorCreationView(entry).state === 'creating'"
                                        @click="createBaseAnchor(entry)">
                                        {{ baseAnchorCreationButtonLabel(entry) }}
                                    </button>
                                    <span v-if="baseAnchorCreationView(entry).label" class="peer-badge"
                                        :class="baseAnchorCreationBadgeClass(entry)">
                                        {{ baseAnchorCreationView(entry).label }}
                                    </span>
                                    <p v-if="baseAnchorCreationView(entry).message" class="form-hint form-hint--neutral">
                                        {{ baseAnchorCreationView(entry).message }}
                                    </p>
                                    <p v-if="baseAnchorCreationView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ baseAnchorCreationView(entry).reason }}
                                    </p>
                                </div>

                                <!-- The only Base signing action; hands over
                                     the exact plan and review shown. Signing
                                     does not broadcast. -->
                                <div v-if="baseReviewedSigningCoordinator" class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">Signing</span>
                                    <p class="form-hint form-hint--neutral">
                                        Signing authorizes the exact transaction reviewed above. It does not
                                        reconstruct or modify it, and it does not broadcast it.
                                    </p>
                                    <button type="button" class="action-btn action-btn--secondary"
                                        :disabled="isBaseReviewedTransactionSigning(entry)"
                                        @click="signBaseReviewedTransaction(entry)">
                                        {{ isBaseReviewedTransactionSigning(entry) ? 'Waiting for wallet…' : 'Sign Reviewed Transaction' }}
                                    </button>

                                    <span v-if="baseReviewedTransactionSigningView(entry).state !== BaseReviewedSigningState.IDLE" class="peer-badge"
                                        :class="baseReviewedTransactionSigningBadgeClass(entry)">
                                        {{ baseReviewedTransactionSigningView(entry).stateLabel }}
                                    </span>
                                    <p v-if="baseReviewedTransactionSigningView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ baseReviewedTransactionSigningView(entry).reason }}
                                    </p>

                                    <!-- SIGNED only means the wallet returned
                                         an artifact for the reviewed plan, not
                                         that it was verified or broadcast. -->
                                    <p v-if="baseReviewedTransactionSigningView(entry).state === BaseReviewedSigningState.SIGNED"
                                       class="form-hint form-hint--neutral">
                                        The wallet returned a signed transaction. ForkBuild has not yet
                                        inspected, verified, or broadcast it — those are separate, explicit
                                        steps.
                                    </p>
                                </div>

                                <!-- A wallet-returned artifact is untrusted
                                     until verified against the reviewed plan
                                     here. Finalizing does not broadcast. -->
                                <div v-if="baseSignedTransactionFinalizationCoordinator && baseReviewedTransactionSigningView(entry).state === BaseReviewedSigningState.SIGNED"
                                     class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">Verification & Finalization</span>
                                    <p class="form-hint form-hint--neutral">
                                        Finalizing independently, cryptographically verifies the signed
                                        transaction against the exact plan reviewed above — including
                                        recovering the actual signer from the signature itself. It does not
                                        broadcast it.
                                    </p>
                                    <button type="button" class="action-btn action-btn--secondary"
                                        @click="finalizeBaseSignedTransaction(entry)">
                                        Verify &amp; Finalize Transaction
                                    </button>

                                    <span v-if="baseSignedTransactionFinalizationView(entry).state !== BaseSignedTransactionFinalizationState.IDLE" class="peer-badge"
                                        :class="baseSignedTransactionFinalizationBadgeClass(entry)">
                                        {{ baseSignedTransactionFinalizationView(entry).stateLabel }}
                                    </span>
                                    <p v-if="baseSignedTransactionFinalizationView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ baseSignedTransactionFinalizationView(entry).reason }}
                                    </p>

                                    <!-- FINALIZED: decoded, matches the plan
                                         field for field, and signed by the
                                         plan's from account. Not broadcast or
                                         confirmed. -->
                                    <template v-if="baseSignedTransactionFinalizationView(entry).state === BaseSignedTransactionFinalizationState.FINALIZED">
                                        <dl class="evidence-fields">
                                            <div class="evidence-field"><dt>Recovered signer</dt><dd>{{ baseSignedTransactionFinalizationView(entry).from }}</dd></div>
                                            <div class="evidence-field"><dt>Transaction hash</dt><dd>{{ baseSignedTransactionFinalizationView(entry).transactionHash }}</dd></div>
                                        </dl>
                                        <p class="form-hint form-hint--neutral">
                                            The signed transaction matches the reviewed transaction and is
                                            ready for the separate broadcast step.
                                        </p>
                                    </template>
                                </div>

                                <!-- Submits the exact finalized raw
                                     transaction. BROADCASTED does not mean
                                     confirmed. -->
                                <div v-if="baseTransactionBroadcastCoordinator && baseSignedTransactionFinalizationView(entry).state === BaseSignedTransactionFinalizationState.FINALIZED"
                                     class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">Broadcast</span>
                                    <p class="form-hint form-hint--neutral">
                                        Broadcasting submits the exact finalized transaction above to Base's
                                        own network. It does not construct, sign, modify, or re-verify it —
                                        and broadcasting does not mean the transaction has been confirmed.
                                    </p>
                                    <button type="button" class="action-btn action-btn--secondary"
                                        :disabled="isBaseTransactionBroadcasting(entry)"
                                        @click="broadcastBaseTransaction(entry)">
                                        {{ isBaseTransactionBroadcasting(entry) ? 'Broadcasting…' : (baseTransactionBroadcastView(entry).state === BaseTransactionBroadcastState.IDLE ? 'Broadcast Transaction' : 'Broadcast Again') }}
                                    </button>

                                    <span v-if="baseTransactionBroadcastView(entry).state !== BaseTransactionBroadcastState.IDLE" class="peer-badge"
                                        :class="baseTransactionBroadcastBadgeClass(entry)">
                                        {{ baseTransactionBroadcastView(entry).stateLabel }}
                                    </span>
                                    <p v-if="baseTransactionBroadcastView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ baseTransactionBroadcastView(entry).reason }}
                                    </p>

                                    <dl v-if="baseTransactionBroadcastView(entry).state === BaseTransactionBroadcastState.BROADCASTED" class="evidence-fields">
                                        <div class="evidence-field"><dt>Transaction ID</dt><dd>{{ baseTransactionBroadcastView(entry).txid }}</dd></div>
                                    </dl>
                                </div>

                                <!-- Asks Base whether the broadcast hash is in
                                     a block, one fresh observation per click;
                                     every observation is kept and archived. -->
                                <div v-if="baseTransactionInclusionObservationCoordinator && baseTransactionBroadcastView(entry).state === BaseTransactionBroadcastState.BROADCASTED"
                                     class="evidence-inspection-adapter">
                                    <span class="evidence-inspection-adapter-title">Base Transaction Inclusion</span>
                                    <p class="form-hint form-hint--neutral">
                                        The network accepted this transaction for broadcast. Whether it has
                                        since been included in a block is a separate, later observation.
                                    </p>

                                    <button type="button" class="action-btn action-btn--secondary"
                                        :disabled="isBaseTransactionInclusionObserving(entry)"
                                        @click="observeBaseTransactionInclusion(entry)">
                                        {{ isBaseTransactionInclusionObserving(entry) ? 'Observing…' : (baseTransactionInclusionView(entry) ? 'Observe Transaction Again' : 'Observe Transaction') }}
                                    </button>
                                    <p v-if="entry.baseTransactionInclusionError" class="form-hint form-hint--neutral">
                                        {{ entry.baseTransactionInclusionError }}
                                    </p>

                                    <template v-if="baseTransactionInclusionView(entry)">
                                        <span class="peer-badge" :class="baseTransactionInclusionBadgeClass(entry)">
                                            {{ baseTransactionInclusionView(entry).stateLabel }}
                                        </span>

                                        <!-- INCLUDED only means a receipt
                                             exists now; a reorganization is
                                             still possible and is not detected. -->
                                        <dl v-if="baseTransactionInclusionView(entry).state === BaseTransactionInclusionObservationState.INCLUDED" class="evidence-fields">
                                            <div class="evidence-field"><dt>Block hash</dt><dd>{{ baseTransactionInclusionView(entry).blockHash }}</dd></div>
                                            <div class="evidence-field"><dt>Block number</dt><dd>{{ baseTransactionInclusionView(entry).blockNumber }}</dd></div>
                                            <div class="evidence-field"><dt>Transaction index</dt><dd>{{ baseTransactionInclusionView(entry).transactionIndex }}</dd></div>
                                            <div class="evidence-field"><dt>Confirmations</dt><dd>{{ baseTransactionInclusionView(entry).confirmationCount }}</dd></div>
                                            <div class="evidence-field"><dt>Observed</dt><dd>{{ formatWhen(baseTransactionInclusionView(entry).observedAt) }}</dd></div>
                                        </dl>
                                        <p v-else-if="baseTransactionInclusionView(entry).state === BaseTransactionInclusionObservationState.NOT_INCLUDED" class="form-hint form-hint--neutral">
                                            No receipt was returned for this transaction at this observation
                                            ({{ formatWhen(baseTransactionInclusionView(entry).observedAt) }}).
                                        </p>
                                        <p v-if="baseTransactionInclusionView(entry).reason" class="form-hint form-hint--neutral">
                                            {{ baseTransactionInclusionView(entry).reason }}
                                        </p>

                                        <button v-if="baseTransactionInclusionHistoryView(entry).count > 1" type="button" class="action-btn action-btn--secondary"
                                            @click="toggleBaseTransactionInclusionHistory(entry)">
                                            {{ entry.baseTransactionInclusionHistoryExpanded ? 'Hide Observation History' : ('Show Observation History (' + baseTransactionInclusionHistoryView(entry).count + ')') }}
                                        </button>
                                    </template>

                                    <div v-if="entry.baseTransactionInclusionHistoryExpanded">
                                        <ul class="replica-knowledge-claim-list">
                                            <li v-for="(item, index) in baseTransactionInclusionHistoryView(entry).observations" :key="index" class="replica-knowledge-claim">
                                                <dl class="evidence-fields">
                                                    <div class="evidence-field"><dt>Observed</dt><dd>{{ formatWhen(item.observedAt) }}</dd></div>
                                                    <div class="evidence-field"><dt>State</dt><dd>{{ item.stateShortLabel }}</dd></div>
                                                    <div v-if="item.blockHash" class="evidence-field"><dt>Block hash</dt><dd>{{ item.blockHash }}</dd></div>
                                                    <div v-if="item.blockNumber !== null" class="evidence-field"><dt>Block number</dt><dd>{{ item.blockNumber }}</dd></div>
                                                    <div v-if="item.confirmationCount !== null" class="evidence-field"><dt>Confirmations</dt><dd>{{ item.confirmationCount }}</dd></div>
                                                    <div v-if="item.reason" class="evidence-field"><dt>Reason</dt><dd>{{ item.reason }}</dd></div>
                                                </dl>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>`;
