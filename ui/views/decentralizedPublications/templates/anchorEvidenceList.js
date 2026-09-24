// Publications page template: the Evidence tab's per-anchor evidence list.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const anchorEvidenceListTemplate = `<div v-if="entry.evidenceExpanded && entry.evidence.count > 0" class="evidence-list">
                            <div v-for="anchorView in entry.evidence.anchors" :key="anchorView.anchorId" class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">{{ humanizeAnchorType(anchorView.anchorType) }}</span>
                                    <span class="peer-badge" :class="evidenceBadgeClass(anchorView)">{{ anchorView.verificationLabel }}</span>
                                </div>
                                <p v-if="anchorView.verificationReason" class="form-hint form-hint--neutral">
                                    {{ anchorView.verificationReason }}
                                </p>
                                <p v-if="lifecycleNote(entry, anchorView)" class="form-hint form-hint--neutral">
                                    {{ lifecycleNote(entry, anchorView) }}
                                </p>
                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>Locator</dt><dd>{{ anchorView.locator }}</dd></div>
                                    <div class="evidence-field"><dt>Recorded</dt><dd>{{ formatWhen(anchorView.anchoredAt) }}</dd></div>
                                    <div class="evidence-field"><dt>Publication</dt><dd>{{ anchorView.publicationId }}</dd></div>
                                    <div class="evidence-field"><dt>Content hash</dt><dd>{{ anchorView.contentHash }}</dd></div>
                                    <div v-if="anchorView.anchorIdentityId" class="evidence-field">
                                        <dt>Attested by</dt><dd>{{ shortId(anchorView.anchorIdentityId) }}</dd>
                                    </div>
                                </dl>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--secondary" @click="toggleInspect(entry, anchorView)">
                                        {{ inspectionExpanded(entry, anchorView) ? 'Hide Details' : 'Inspect Evidence' }}
                                    </button>
                                    <button class="action-btn action-btn--secondary" :disabled="anchorView.checking"
                                            @click="verifyAnchor(entry, anchorView)">
                                        {{ anchorView.checking ? 'Verifying…' : (anchorView.verified ? 'Verify Again' : 'Verify Evidence') }}
                                    </button>
                                </div>

                                <!-- Wallet connection is independent of the
                                     reconciliation card below, which needs no
                                     wallet. -->
                                <div v-if="anchorView.anchorType === 'bitcoin-op-return' && bitcoinWalletConnection"
                                     class="evidence-inspection">
                                    <span class="evidence-inspection-title">Bitcoin Wallet</span>
                                    <div class="evidence-inspection-adapter">
                                        <span class="peer-badge" :class="bitcoinWalletConnectionBadgeClass()">
                                            {{ bitcoinWalletConnectionView().stateLabel }}
                                        </span>
                                        <dl v-if="isBitcoinWalletConnected()" class="evidence-fields">
                                            <div class="evidence-field"><dt>Account</dt><dd>{{ shortId(bitcoinWalletConnectionView().account) }}</dd></div>
                                            <div class="evidence-field"><dt>Network</dt><dd>{{ bitcoinWalletConnectionView().network }}</dd></div>
                                        </dl>
                                        <!-- A mismatch is named, never resolved
                                             on the person's behalf. -->
                                        <p v-if="bitcoinWalletConnectionView().networkMismatch" class="form-hint form-hint--neutral">
                                            Wallet network ({{ bitcoinWalletConnectionView().network }}) does not match this anchor's network ({{ bitcoinWalletConnectionView().expectedNetwork }}). Connect a wallet on the matching network to continue.
                                        </p>
                                        <p v-if="bitcoinWalletConnectionState.reason" class="form-hint form-hint--neutral">
                                            {{ bitcoinWalletConnectionState.reason }}
                                        </p>
                                    </div>
                                    <div class="identity-mgmt-actions">
                                        <button v-if="!isBitcoinWalletConnected()" class="action-btn action-btn--secondary"
                                                :disabled="isBitcoinWalletConnecting()"
                                                @click="connectBitcoinWallet()">
                                            {{ isBitcoinWalletConnecting() ? 'Connecting…' : 'Connect Bitcoin Wallet' }}
                                        </button>
                                        <button v-else class="action-btn action-btn--secondary" @click="disconnectBitcoinWallet()">
                                            Disconnect
                                        </button>
                                    </div>
                                </div>

                                <!-- Confirmation and content proof as reported
                                     now, side by side; a CONFIRMED transaction
                                     next to a HASH_MISMATCH proof is shown as
                                     is. -->
                                <div v-if="anchorView.anchorType === 'bitcoin-op-return' && bitcoinAnchorProofReconciliationView"
                                     class="evidence-inspection">
                                    <span class="evidence-inspection-title">Bitcoin Anchor</span>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field"><dt>Transaction</dt><dd>{{ anchorView.locator }}</dd></div>
                                        <div class="evidence-field"><dt>Content hash</dt><dd>{{ anchorView.contentHash }}</dd></div>
                                    </dl>

                                    <p v-if="!bitcoinAnchorReconciliationView(entry, anchorView).confirmation && !bitcoinAnchorReconciliationView(entry, anchorView).reconciling"
                                       class="form-hint form-hint--neutral">
                                        Not yet checked this session.
                                    </p>
                                    <p v-if="bitcoinAnchorReconciliationView(entry, anchorView).error" class="form-hint form-hint--neutral">
                                        {{ bitcoinAnchorReconciliationView(entry, anchorView).error }}
                                    </p>

                                    <div v-if="bitcoinAnchorReconciliationView(entry, anchorView).confirmation" class="evidence-inspection-adapter">
                                        <span class="evidence-inspection-adapter-title">Confirmation</span>
                                        <span class="peer-badge" :class="bitcoinAnchorConfirmationBadgeClass(entry, anchorView)">
                                            {{ bitcoinAnchorReconciliationView(entry, anchorView).confirmation.stateLabel }}
                                        </span>
                                        <dl v-if="bitcoinAnchorReconciliationView(entry, anchorView).confirmation.blockHeight !== null" class="evidence-fields">
                                            <div class="evidence-field"><dt>Block</dt><dd>{{ bitcoinAnchorReconciliationView(entry, anchorView).confirmation.blockHeight }}</dd></div>
                                            <div class="evidence-field"><dt>Confirmations</dt><dd>{{ bitcoinAnchorReconciliationView(entry, anchorView).confirmation.confirmationCount }}</dd></div>
                                        </dl>
                                        <p v-if="bitcoinAnchorReconciliationView(entry, anchorView).confirmation.reason" class="form-hint form-hint--neutral">
                                            {{ bitcoinAnchorReconciliationView(entry, anchorView).confirmation.reason }}
                                        </p>
                                    </div>

                                    <div v-if="bitcoinAnchorReconciliationView(entry, anchorView).contentProof" class="evidence-inspection-adapter">
                                        <span class="evidence-inspection-adapter-title">Content proof</span>
                                        <span class="peer-badge" :class="bitcoinAnchorContentProofBadgeClass(entry, anchorView)">
                                            {{ bitcoinAnchorReconciliationView(entry, anchorView).contentProof.stateLabel }}
                                        </span>
                                        <p v-if="bitcoinAnchorReconciliationView(entry, anchorView).contentProof.reason" class="form-hint form-hint--neutral">
                                            {{ bitcoinAnchorReconciliationView(entry, anchorView).contentProof.reason }}
                                        </p>
                                    </div>

                                    <div class="identity-mgmt-actions">
                                        <button class="action-btn action-btn--secondary"
                                                :disabled="bitcoinAnchorReconciliationView(entry, anchorView).reconciling"
                                                @click="reconcileBitcoinAnchor(entry, anchorView)">
                                            {{ bitcoinAnchorReconcileButtonLabel(entry, anchorView) }}
                                        </button>
                                        <button v-if="bitcoinAnchorConfirmationHistoryView(entry, anchorView).count > 0"
                                                class="action-btn action-btn--secondary"
                                                @click="toggleBitcoinAnchorConfirmationHistory(entry, anchorView)">
                                            {{ isBitcoinAnchorConfirmationHistoryExpanded(entry, anchorView) ? 'Hide Confirmation History' : 'Show Confirmation History' }}
                                        </button>
                                        <!-- Needs at least two observations to
                                             compare; a local re-derivation, no
                                             network call. -->
                                        <button v-if="(entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] || []).length > 1"
                                                class="action-btn action-btn--secondary"
                                                @click="toggleBitcoinAnchorChainPlacementComparison(entry, anchorView)">
                                            {{ isBitcoinAnchorChainPlacementComparisonExpanded(entry, anchorView) ? 'Hide Placement Comparison' : 'Compare Confirmation Observations' }}
                                        </button>
                                        <button v-if="(entry.bitcoinAnchorConfirmationHistories[anchorView.anchorId] || []).length > 1"
                                                class="action-btn action-btn--secondary"
                                                @click="toggleBitcoinAnchorObservationConsistency(entry, anchorView)">
                                            {{ isBitcoinAnchorObservationConsistencyExpanded(entry, anchorView) ? 'Hide Observation Consistency' : 'Observation Consistency' }}
                                        </button>
                                        <!-- Shown for any recorded fact (it
                                             also includes content proof);
                                             local, no network call. -->
                                        <button v-if="bitcoinAnchorObservationEvidenceView(entry, anchorView).confirmationObservations.count > 0
                                                       || bitcoinAnchorObservationEvidenceView(entry, anchorView).contentProofObservations.count > 0"
                                                class="action-btn action-btn--secondary"
                                                @click="toggleBitcoinAnchorObservationEvidence(entry, anchorView)">
                                            {{ isBitcoinAnchorObservationEvidenceExpanded(entry, anchorView) ? 'Hide Bitcoin Anchor Evidence' : 'Bitcoin Anchor Evidence' }}
                                        </button>
                                    </div>

                                    <!-- A changed placement is narrated
                                         neutrally, never labeled a
                                         reorganization. -->
                                    <div v-if="isBitcoinAnchorChainPlacementComparisonExpanded(entry, anchorView)">
                                        <p v-if="bitcoinAnchorChainPlacementComparisonView(entry, anchorView).count === 0" class="form-hint form-hint--neutral">
                                            Not enough confirmed observations exist yet to compare block placement.
                                        </p>
                                        <ul v-else class="replica-knowledge-claim-list">
                                            <li v-for="(comparison, index) in bitcoinAnchorChainPlacementComparisonView(entry, anchorView).comparisons" :key="index" class="replica-knowledge-claim">
                                                <p class="form-hint form-hint--neutral">{{ comparison.outcomeLabel }}</p>
                                                <dl v-if="comparison.previousBlock || comparison.laterBlock" class="evidence-fields">
                                                    <div v-if="comparison.previousBlock" class="evidence-field">
                                                        <dt>Previous block</dt>
                                                        <dd>
                                                            {{ comparison.previousBlock.blockHash || '(not confirmed)' }}
                                                            <span v-if="comparison.previousBlock.blockHeight !== null">— height {{ comparison.previousBlock.blockHeight }}, {{ comparison.previousBlock.confirmationCount }} confirmation(s)</span>
                                                            — observed {{ formatWhen(comparison.previousBlock.observedAt) }}
                                                        </dd>
                                                    </div>
                                                    <div v-if="comparison.laterBlock" class="evidence-field">
                                                        <dt>Later block</dt>
                                                        <dd>
                                                            {{ comparison.laterBlock.blockHash || '(not confirmed)' }}
                                                            <span v-if="comparison.laterBlock.blockHeight !== null">— height {{ comparison.laterBlock.blockHeight }}, {{ comparison.laterBlock.confirmationCount }} confirmation(s)</span>
                                                            — observed {{ formatWhen(comparison.laterBlock.observedAt) }}
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
                                            Not enough confirmed observations exist yet to analyze consistency.
                                        </p>
                                        <ul v-else class="replica-knowledge-claim-list">
                                            <li v-for="(finding, index) in bitcoinAnchorObservationConsistencyView(entry, anchorView).findings" :key="index" class="replica-knowledge-claim">
                                                <p class="form-hint form-hint--neutral">{{ finding.stateLabel }}</p>
                                                <dl v-if="finding.previousBlock || finding.laterBlock" class="evidence-fields">
                                                    <div v-if="finding.previousBlock" class="evidence-field">
                                                        <dt>Previous block</dt>
                                                        <dd>
                                                            {{ finding.previousBlock.blockHash || '(not confirmed)' }}
                                                            <span v-if="finding.previousBlock.blockHeight !== null">— height {{ finding.previousBlock.blockHeight }}, {{ finding.previousBlock.confirmationCount }} confirmation(s)</span>
                                                            — observed {{ formatWhen(finding.previousBlock.observedAt) }}
                                                        </dd>
                                                    </div>
                                                    <div v-if="finding.laterBlock" class="evidence-field">
                                                        <dt>Later block</dt>
                                                        <dd>
                                                            {{ finding.laterBlock.blockHash || '(not confirmed)' }}
                                                            <span v-if="finding.laterBlock.blockHeight !== null">— height {{ finding.laterBlock.blockHeight }}, {{ finding.laterBlock.confirmationCount }} confirmation(s)</span>
                                                            — observed {{ formatWhen(finding.laterBlock.observedAt) }}
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
                                                Broadcast observations: {{ bitcoinAnchorObservationEvidenceView(entry, anchorView).broadcastObservations.count }}
                                            </p>
                                            <ul v-if="bitcoinAnchorObservationEvidenceView(entry, anchorView).broadcastObservations.count > 0">
                                                <li v-for="item in bitcoinAnchorObservationEvidenceView(entry, anchorView).broadcastObservations.observations" :key="item.index">
                                                    {{ item.stateLabel }} — {{ item.broadcastedAt ? formatWhen(item.broadcastedAt) : 'no timestamp recorded' }}
                                                </li>
                                            </ul>
                                        </li>
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                Confirmation observations: {{ bitcoinAnchorObservationEvidenceView(entry, anchorView).confirmationObservations.count }}
                                            </p>
                                            <ul v-if="bitcoinAnchorObservationEvidenceView(entry, anchorView).confirmationObservations.count > 0">
                                                <li v-for="item in bitcoinAnchorObservationEvidenceView(entry, anchorView).confirmationObservations.observations" :key="item.index">
                                                    Confirmation observation #{{ item.index }} — {{ formatWhen(item.observedAt) }} — {{ item.stateLabel }}
                                                </li>
                                            </ul>
                                        </li>
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                Content-proof observations: {{ bitcoinAnchorObservationEvidenceView(entry, anchorView).contentProofObservations.count }}
                                            </p>
                                            <ul v-if="bitcoinAnchorObservationEvidenceView(entry, anchorView).contentProofObservations.count > 0">
                                                <li v-for="item in bitcoinAnchorObservationEvidenceView(entry, anchorView).contentProofObservations.observations" :key="item.index">
                                                    Content-proof observation #{{ item.index }} — {{ formatWhen(item.observedAt) }} — {{ item.stateLabel }}
                                                </li>
                                            </ul>
                                        </li>
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                Chain-placement comparisons: {{ bitcoinAnchorObservationEvidenceView(entry, anchorView).chainPlacementObservations.count }}
                                            </p>
                                        </li>
                                        <li class="replica-knowledge-claim">
                                            <p class="form-hint form-hint--neutral">
                                                Consistency findings: {{ bitcoinAnchorObservationEvidenceView(entry, anchorView).consistencyFindings.count }}
                                            </p>
                                        </li>
                                    </ul>

                                    <div v-if="isBitcoinAnchorConfirmationHistoryExpanded(entry, anchorView)">
                                        <ul class="replica-knowledge-claim-list">
                                            <li v-for="(item, index) in bitcoinAnchorConfirmationHistoryView(entry, anchorView).entries" :key="index" class="replica-knowledge-claim">
                                                <button class="action-btn action-btn--secondary"
                                                        @click="toggleBitcoinAnchorConfirmationHistoryEntry(entry, anchorView, index)">
                                                    {{ formatWhen(item.observedAt) }} — {{ item.stateShortLabel }}
                                                </button>
                                                <dl v-if="isBitcoinAnchorConfirmationHistoryEntryExpanded(entry, anchorView, index)" class="evidence-fields">
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

                                <!-- Local read; inspecting and verifying stay
                                     separate actions. -->
                                <div v-if="inspectionExpanded(entry, anchorView) && inspectionDetail(entry, anchorView)"
                                     class="evidence-inspection">
                                    <span class="evidence-inspection-title">External Evidence</span>
                                    <p class="form-hint form-hint--neutral">{{ inspectionDetail(entry, anchorView).bindingDescription }}</p>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field">
                                            <dt>{{ inspectionDetail(entry, anchorView).anchoredAtLabel }}</dt>
                                            <dd>{{ formatWhen(inspectionDetail(entry, anchorView).anchoredAt) }}</dd>
                                        </div>
                                        <div class="evidence-field"><dt>External locator</dt><dd>{{ inspectionDetail(entry, anchorView).locator }}</dd></div>
                                    </dl>

                                    <div v-if="inspectionTypeSpecific(entry, anchorView)" class="evidence-inspection-adapter">
                                        <span class="evidence-inspection-adapter-title">{{ inspectionTypeSpecific(entry, anchorView).summary }}</span>
                                        <dl class="evidence-fields">
                                            <div v-for="field in inspectionTypeSpecific(entry, anchorView).fields" :key="field.label" class="evidence-field">
                                                <dt>{{ field.label }}</dt><dd>{{ field.value }}</dd>
                                            </div>
                                        </dl>
                                        <a v-if="inspectionTypeSpecific(entry, anchorView).externalLocator"
                                           class="action-btn action-btn--secondary"
                                           :href="inspectionTypeSpecific(entry, anchorView).externalLocator.url"
                                           target="_blank" rel="noopener noreferrer">
                                            {{ inspectionTypeSpecific(entry, anchorView).externalLocator.label }}
                                        </a>
                                    </div>

                                    <details class="evidence-inspection-proof">
                                        <summary>Proof (raw, adapter-defined evidence)</summary>
                                        <pre class="evidence-inspection-proof-json">{{ JSON.stringify(inspectionDetail(entry, anchorView).proof, null, 2) }}</pre>
                                    </details>

                                    <!-- How this replica learned the claim;
                                         never names a peer or reads as a trust
                                         signal. -->
                                    <div v-if="inspectionKnowledge(entry, anchorView) && inspectionKnowledge(entry, anchorView).known"
                                         class="evidence-inspection-knowledge">
                                        <span class="evidence-inspection-title">Local Knowledge</span>
                                        <dl class="evidence-fields">
                                            <div class="evidence-field">
                                                <dt>Acquisition</dt>
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
