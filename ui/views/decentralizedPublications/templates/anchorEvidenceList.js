// Publications page template: the Evidence tab's per-anchor evidence list.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const anchorEvidenceListTemplate = `<div v-if="entry.evidenceExpanded && entry.evidence.count > 0" class="evidence-list">
                            <div v-for="anchorView in entry.evidence.anchors" :key="anchorView.anchorId" class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">{{ humanizeAnchorType(anchorView.anchorType) }}</span>
                                    <span v-if="isExperimentalAnchorType(anchorView.anchorType)" class="experimental-badge">{{ t('publications.experimental') }}</span>
                                    <span class="peer-badge" :class="evidenceBadgeClass(anchorView)">{{ displayText(anchorView.verificationLabel) }}</span>
                                </div>
                                <p v-if="anchorView.verificationReason" class="form-hint form-hint--neutral">
                                    {{ displayText(anchorView.verificationReason) }}
                                </p>
                                <p v-if="verificationNote(entry, anchorView)" class="form-hint form-hint--neutral">
                                    {{ displayText(verificationNote(entry, anchorView)) }}
                                </p>
                                <p v-if="lifecycleNote(entry, anchorView)" class="form-hint form-hint--neutral">
                                    {{ displayText(lifecycleNote(entry, anchorView)) }}
                                </p>
                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>{{ t('publications.locator') }}</dt><dd>{{ anchorView.locator }}</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.recorded') }}</dt><dd>{{ formatWhen(anchorView.anchoredAt) }}</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.publication') }}</dt><dd>{{ anchorView.publicationId }}</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.contentHash') }}</dt><dd>{{ anchorView.contentHash }}</dd></div>
                                    <div v-if="anchorView.anchorIdentityId" class="evidence-field">
                                        <dt>{{ t('publications.attestedBy') }}</dt><dd>{{ shortId(anchorView.anchorIdentityId) }}</dd>
                                    </div>
                                </dl>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--secondary" @click="toggleInspect(entry, anchorView)">
                                        {{ inspectionExpanded(entry, anchorView) ? t('publications.hideDetails') : t('publications.inspectEvidence') }}
                                    </button>
                                    <button class="action-btn action-btn--secondary" :disabled="anchorView.checking"
                                            @click="verifyAnchor(entry, anchorView)">
                                        {{ anchorView.checking ? t('publications.verifying') : (anchorView.verified ? t('publications.verifyAgain') : t('publications.verifyEvidence')) }}
                                    </button>
                                </div>


                                <!-- Confirmation and content proof as reported
                                     now, side by side; a CONFIRMED transaction
                                     next to a HASH_MISMATCH proof is shown as
                                     is. -->
                                <div v-if="anchorView.anchorType === 'bitcoin-op-return' && bitcoinAnchorProofReconciliationView"
                                     class="evidence-inspection">
                                    <span class="evidence-inspection-title">{{ t('publications.bitcoinAnchor') }}</span>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field"><dt>{{ t('publications.transaction') }}</dt><dd>{{ anchorView.locator }}</dd></div>
                                        <div class="evidence-field"><dt>{{ t('publications.contentHash') }}</dt><dd>{{ anchorView.contentHash }}</dd></div>
                                    </dl>

                                    <p v-if="!bitcoinAnchorReconciliationView(entry, anchorView).confirmation && !bitcoinAnchorReconciliationView(entry, anchorView).reconciling"
                                       class="form-hint form-hint--neutral">
                                        {{ t('publications.notYetCheckedThisSession') }}
                                    </p>
                                    <p v-if="bitcoinAnchorReconciliationView(entry, anchorView).error" class="form-hint form-hint--neutral">
                                        {{ bitcoinAnchorReconciliationView(entry, anchorView).error }}
                                    </p>

                                    <div v-if="bitcoinAnchorReconciliationView(entry, anchorView).confirmation" class="evidence-inspection-adapter">
                                        <span class="evidence-inspection-adapter-title">{{ t('publications.confirmation') }}</span>
                                        <span class="peer-badge" :class="bitcoinAnchorConfirmationBadgeClass(entry, anchorView)">
                                            {{ displayText(bitcoinAnchorReconciliationView(entry, anchorView).confirmation.stateLabel) }}
                                        </span>
                                        <dl v-if="bitcoinAnchorReconciliationView(entry, anchorView).confirmation.blockHeight !== null" class="evidence-fields">
                                            <div class="evidence-field"><dt>{{ t('publications.block') }}</dt><dd>{{ bitcoinAnchorReconciliationView(entry, anchorView).confirmation.blockHeight }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.confirmations') }}</dt><dd>{{ bitcoinAnchorReconciliationView(entry, anchorView).confirmation.confirmationCount }}</dd></div>
                                        </dl>
                                        <p v-if="bitcoinAnchorReconciliationView(entry, anchorView).confirmation.reason" class="form-hint form-hint--neutral">
                                            {{ displayText(bitcoinAnchorReconciliationView(entry, anchorView).confirmation.reason) }}
                                        </p>
                                    </div>

                                    <div v-if="bitcoinAnchorReconciliationView(entry, anchorView).contentProof" class="evidence-inspection-adapter">
                                        <span class="evidence-inspection-adapter-title">{{ t('publications.contentProof') }}</span>
                                        <span class="peer-badge" :class="bitcoinAnchorContentProofBadgeClass(entry, anchorView)">
                                            {{ displayText(bitcoinAnchorReconciliationView(entry, anchorView).contentProof.stateLabel) }}
                                        </span>
                                        <p v-if="bitcoinAnchorReconciliationView(entry, anchorView).contentProof.reason" class="form-hint form-hint--neutral">
                                            {{ displayText(bitcoinAnchorReconciliationView(entry, anchorView).contentProof.reason) }}
                                        </p>
                                    </div>

                                    <div class="identity-mgmt-actions">
                                        <button class="action-btn action-btn--secondary"
                                                :disabled="bitcoinAnchorReconciliationView(entry, anchorView).reconciling"
                                                @click="reconcileBitcoinAnchor(entry, anchorView)">
                                            {{ displayText(bitcoinAnchorReconcileButtonLabel(entry, anchorView)) }}
                                        </button>
                                        <button v-if="bitcoinAnchorConfirmationHistoryView(entry, anchorView).count > 0"
                                                class="action-btn action-btn--secondary"
                                                @click="toggleBitcoinAnchorConfirmationHistory(entry, anchorView)">
                                            {{ isBitcoinAnchorConfirmationHistoryExpanded(entry, anchorView) ? t('publications.hideConfirmationHistory') : t('publications.showConfirmationHistory') }}
                                        </button>
                                        <!-- Needs at least two observations to
                                             compare; a local re-derivation, no
                                             network call. -->
                                        <button v-if="(entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] || []).length > 1"
                                                class="action-btn action-btn--secondary"
                                                @click="toggleBitcoinAnchorChainPlacementComparison(entry, anchorView)">
                                            {{ isBitcoinAnchorChainPlacementComparisonExpanded(entry, anchorView) ? t('publications.hidePlacementComparison') : t('publications.compareConfirmationObservations') }}
                                        </button>
                                        <button v-if="(entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] || []).length > 1"
                                                class="action-btn action-btn--secondary"
                                                @click="toggleBitcoinAnchorObservationConsistency(entry, anchorView)">
                                            {{ isBitcoinAnchorObservationConsistencyExpanded(entry, anchorView) ? t('publications.hideObservationConsistency') : t('publications.observationConsistency2') }}
                                        </button>
                                        <!-- Shown for any recorded fact (it
                                             also includes content proof);
                                             local, no network call. -->
                                        <button v-if="bitcoinAnchorObservationEvidenceView(entry, anchorView).confirmationObservations.count > 0
                                                       || bitcoinAnchorObservationEvidenceView(entry, anchorView).contentProofObservations.count > 0"
                                                class="action-btn action-btn--secondary"
                                                @click="toggleBitcoinAnchorObservationEvidence(entry, anchorView)">
                                            {{ isBitcoinAnchorObservationEvidenceExpanded(entry, anchorView) ? t('publications.hideBitcoinAnchorEvidence') : t('publications.bitcoinAnchorEvidence') }}
                                        </button>
                                    </div>

                                    <!-- A changed placement is narrated
                                         neutrally, never labeled a
                                         reorganization. -->
                                    <div v-if="isBitcoinAnchorChainPlacementComparisonExpanded(entry, anchorView)">
                                        <p v-if="bitcoinAnchorChainPlacementComparisonView(entry, anchorView).count === 0" class="form-hint form-hint--neutral">
                                            {{ t('publications.notEnoughConfirmedObservationsExist') }}
                                        </p>
                                        <ul v-else class="replica-knowledge-claim-list">
                                            <li v-for="(comparison, index) in bitcoinAnchorChainPlacementComparisonView(entry, anchorView).comparisons" :key="index" class="replica-knowledge-claim">
                                                <p class="form-hint form-hint--neutral">{{ displayText(comparison.outcomeLabel) }}</p>
                                                <dl v-if="comparison.previousBlock || comparison.laterBlock" class="evidence-fields">
                                                    <div v-if="comparison.previousBlock" class="evidence-field">
                                                        <dt>{{ t('publications.previousBlock') }}</dt>
                                                        <dd>
                                                            {{ comparison.previousBlock.blockHash || t('publications.notConfirmed') }}
                                                            <span v-if="comparison.previousBlock.blockHeight !== null">{{ t('publications.heightConfirmationS', { blockHeight: comparison.previousBlock.blockHeight, count: comparison.previousBlock.confirmationCount }) }}</span>
                                                            {{ t('publications.observed3', { observedAt: formatWhen(comparison.previousBlock.observedAt) }) }}
                                                        </dd>
                                                    </div>
                                                    <div v-if="comparison.laterBlock" class="evidence-field">
                                                        <dt>{{ t('publications.laterBlock') }}</dt>
                                                        <dd>
                                                            {{ comparison.laterBlock.blockHash || t('publications.notConfirmed') }}
                                                            <span v-if="comparison.laterBlock.blockHeight !== null">{{ t('publications.heightConfirmationS', { blockHeight: comparison.laterBlock.blockHeight, count: comparison.laterBlock.confirmationCount }) }}</span>
                                                            {{ t('publications.observed3', { observedAt: formatWhen(comparison.laterBlock.observedAt) }) }}
                                                        </dd>
                                                    </div>
                                                </dl>
                                            </li>
                                        </ul>
                                    </div>

                                    <!-- An inconsistency is narrated neutrally,
                                         never labeled a reorganization or
                                         fraud. -->
                                    <div v-if="isBitcoinAnchorObservationConsistencyExpanded(entry, anchorView)">
                                        <p v-if="bitcoinAnchorObservationConsistencyView(entry, anchorView).count === 0" class="form-hint form-hint--neutral">
                                            {{ t('publications.notEnoughConfirmedObservationsExist2') }}
                                        </p>
                                        <ul v-else class="replica-knowledge-claim-list">
                                            <li v-for="(finding, index) in bitcoinAnchorObservationConsistencyView(entry, anchorView).findings" :key="index" class="replica-knowledge-claim">
                                                <p class="form-hint form-hint--neutral">{{ displayText(finding.stateLabel) }}</p>
                                                <dl v-if="finding.previousBlock || finding.laterBlock" class="evidence-fields">
                                                    <div v-if="finding.previousBlock" class="evidence-field">
                                                        <dt>{{ t('publications.previousBlock') }}</dt>
                                                        <dd>
                                                            {{ finding.previousBlock.blockHash || t('publications.notConfirmed') }}
                                                            <span v-if="finding.previousBlock.blockHeight !== null">{{ t('publications.heightConfirmationS', { blockHeight: finding.previousBlock.blockHeight, count: finding.previousBlock.confirmationCount }) }}</span>
                                                            {{ t('publications.observed3', { observedAt: formatWhen(finding.previousBlock.observedAt) }) }}
                                                        </dd>
                                                    </div>
                                                    <div v-if="finding.laterBlock" class="evidence-field">
                                                        <dt>{{ t('publications.laterBlock') }}</dt>
                                                        <dd>
                                                            {{ finding.laterBlock.blockHash || t('publications.notConfirmed') }}
                                                            <span v-if="finding.laterBlock.blockHeight !== null">{{ t('publications.heightConfirmationS', { blockHeight: finding.laterBlock.blockHeight, count: finding.laterBlock.confirmationCount }) }}</span>
                                                            {{ t('publications.observed3', { observedAt: formatWhen(finding.laterBlock.observedAt) }) }}
                                                        </dd>
                                                    </div>
                                                </dl>
                                            </li>
                                        </ul>
                                    </div>

                                    <!-- This anchor's independent facts side by
                                         side in their own vocabularies, never a
                                         combined verdict. -->
                                    <ul v-if="isBitcoinAnchorObservationEvidenceExpanded(entry, anchorView)" class="replica-knowledge-claim-list">
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                {{ t('publications.broadcastObservations', { broadcastObservationsCount: bitcoinAnchorObservationEvidenceView(entry, anchorView).broadcastObservations.count }) }}
                                            </p>
                                            <ul v-if="bitcoinAnchorObservationEvidenceView(entry, anchorView).broadcastObservations.count > 0">
                                                <li v-for="item in bitcoinAnchorObservationEvidenceView(entry, anchorView).broadcastObservations.observations" :key="item.index">
                                                    {{ displayText(item.stateLabel) }} — {{ item.broadcastedAt ? formatWhen(item.broadcastedAt) : t('publications.noTimestampRecorded') }}
                                                </li>
                                            </ul>
                                        </li>
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                {{ t('publications.confirmationObservations', { confirmationObservationsCount: bitcoinAnchorObservationEvidenceView(entry, anchorView).confirmationObservations.count }) }}
                                            </p>
                                            <ul v-if="bitcoinAnchorObservationEvidenceView(entry, anchorView).confirmationObservations.count > 0">
                                                <li v-for="item in bitcoinAnchorObservationEvidenceView(entry, anchorView).confirmationObservations.observations" :key="item.index">
                                                    {{ t('publications.confirmationObservation', { number: item.index, observedAt: formatWhen(item.observedAt), stateLabel: displayText(item.stateLabel) }) }}
                                                </li>
                                            </ul>
                                        </li>
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                {{ t('publications.contentProofObservations', { contentProofObservationsCount: bitcoinAnchorObservationEvidenceView(entry, anchorView).contentProofObservations.count }) }}
                                            </p>
                                            <ul v-if="bitcoinAnchorObservationEvidenceView(entry, anchorView).contentProofObservations.count > 0">
                                                <li v-for="item in bitcoinAnchorObservationEvidenceView(entry, anchorView).contentProofObservations.observations" :key="item.index">
                                                    {{ t('publications.contentProofObservation', { number: item.index, observedAt: formatWhen(item.observedAt), stateLabel: displayText(item.stateLabel) }) }}
                                                </li>
                                            </ul>
                                        </li>
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                {{ t('publications.chainPlacementComparisons2', { chainPlacementObservationsCount: bitcoinAnchorObservationEvidenceView(entry, anchorView).chainPlacementObservations.count }) }}
                                            </p>
                                        </li>
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                {{ t('publications.consistencyFindings', { consistencyFindingsCount: bitcoinAnchorObservationEvidenceView(entry, anchorView).consistencyFindings.count }) }}
                                            </p>
                                        </li>
                                    </ul>

                                    <div v-if="isBitcoinAnchorConfirmationHistoryExpanded(entry, anchorView)">
                                        <ul class="replica-knowledge-claim-list">
                                            <li v-for="(item, index) in bitcoinAnchorConfirmationHistoryView(entry, anchorView).entries" :key="index" class="replica-knowledge-claim">
                                                <button class="action-btn action-btn--secondary"
                                                        @click="toggleBitcoinAnchorConfirmationHistoryEntry(entry, anchorView, index)">
                                                    {{ formatWhen(item.observedAt) }} — {{ displayText(item.stateShortLabel) }}
                                                </button>
                                                <dl v-if="isBitcoinAnchorConfirmationHistoryEntryExpanded(entry, anchorView, index)" class="evidence-fields">
                                                    <div class="evidence-field"><dt>{{ t('publications.state') }}</dt><dd>{{ displayText(item.stateLabel) }}</dd></div>
                                                    <div class="evidence-field"><dt>{{ t('publications.transactionId') }}</dt><dd>{{ item.txid }}</dd></div>
                                                    <div v-if="item.blockHash" class="evidence-field"><dt>{{ t('publications.blockHash') }}</dt><dd>{{ item.blockHash }}</dd></div>
                                                    <div v-if="item.blockHeight !== null" class="evidence-field"><dt>{{ t('publications.blockHeight') }}</dt><dd>{{ item.blockHeight }}</dd></div>
                                                    <div v-if="item.confirmationCount !== null" class="evidence-field"><dt>{{ t('publications.confirmations') }}</dt><dd>{{ item.confirmationCount }}</dd></div>
                                                    <div v-if="item.reason" class="evidence-field"><dt>{{ t('publications.reason') }}</dt><dd>{{ displayText(item.reason) }}</dd></div>
                                                </dl>
                                            </li>
                                        </ul>
                                    </div>
                                </div>

                                <!-- Local read; inspecting and verifying stay
                                     separate actions. -->
                                <div v-if="inspectionExpanded(entry, anchorView) && inspectionDetail(entry, anchorView)"
                                     class="evidence-inspection">
                                    <span class="evidence-inspection-title">{{ t('publications.externalEvidence') }}</span>
                                    <p class="form-hint form-hint--neutral">{{ displayText(inspectionDetail(entry, anchorView).bindingDescription) }}</p>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field">
                                            <dt>{{ displayText(inspectionDetail(entry, anchorView).anchoredAtLabel) }}</dt>
                                            <dd>{{ formatWhen(inspectionDetail(entry, anchorView).anchoredAt) }}</dd>
                                        </div>
                                        <div class="evidence-field"><dt>{{ t('publications.externalLocator') }}</dt><dd>{{ displayText(inspectionDetail(entry, anchorView).locator) }}</dd></div>
                                    </dl>

                                    <div v-if="inspectionTypeSpecific(entry, anchorView)" class="evidence-inspection-adapter">
                                        <span class="evidence-inspection-adapter-title">{{ displayText(inspectionTypeSpecific(entry, anchorView).summary) }}</span>
                                        <dl class="evidence-fields">
                                            <div v-for="field in inspectionTypeSpecific(entry, anchorView).fields" :key="field.label" class="evidence-field">
                                                <dt>{{ displayText(field.label) }}</dt><dd>{{ field.value }}</dd>
                                            </div>
                                        </dl>
                                        <a v-if="inspectionTypeSpecific(entry, anchorView).externalLocator"
                                           class="action-btn action-btn--secondary"
                                           :href="inspectionTypeSpecific(entry, anchorView).externalLocator.url"
                                           target="_blank" rel="noopener noreferrer">
                                            {{ displayText(inspectionTypeSpecific(entry, anchorView).externalLocator.label) }}
                                        </a>
                                    </div>

                                    <details class="evidence-inspection-proof">
                                        <summary>{{ t('publications.proofRawAdapterDefinedEvidence') }}</summary>
                                        <pre class="evidence-inspection-proof-json">{{ JSON.stringify(inspectionDetail(entry, anchorView).proof, null, 2) }}</pre>
                                    </details>

                                    <!-- How this replica learned the claim;
                                         never names a peer or reads as a trust
                                         signal. -->
                                    <div v-if="inspectionKnowledge(entry, anchorView) && inspectionKnowledge(entry, anchorView).known"
                                         class="evidence-inspection-knowledge">
                                        <span class="evidence-inspection-title">{{ t('publications.localKnowledge') }}</span>
                                        <dl class="evidence-fields">
                                            <div class="evidence-field">
                                                <dt>{{ t('publications.acquisition') }}</dt>
                                                <dd>{{ inspectionKnowledge(entry, anchorView).acquisitionLabel }}</dd>
                                            </div>
                                            <div class="evidence-field">
                                                <dt>{{ inspectionKnowledge(entry, anchorView).firstSeenAtLabel }}</dt>
                                                <dd>{{ formatWhen(inspectionKnowledge(entry, anchorView).firstSeenAt) }}</dd>
                                            </div>
                                        </dl>
                                    </div>
                                </div>
                            </div>
                        </div>`;
