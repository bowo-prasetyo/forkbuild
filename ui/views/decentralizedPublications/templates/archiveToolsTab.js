// Publications page template: the Archive Tools tab.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const archiveToolsTabTemplate = `<div v-show="publicationsToolsTab === 'archive'">
            <!-- The durable observation archive. Other actions only ever add to
                 it; "Clear Archive" is the only removal. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">{{ t('publications.observationArchive') }}</span>
                    <span class="peer-badge peer-badge--pending">{{ t('publications.persistedLocally2') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('publications.publicationAndObservationFactsKept') }}
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>{{ t('publications.publications3') }}</dt><dd>{{ publicationObservationArchiveView().publicationCount }}</dd></div>
                    <div class="evidence-field"><dt>{{ t('publications.observations') }}</dt><dd>{{ publicationObservationArchiveView().observationCount }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationObservationArchive">
                        {{ publicationObservationArchiveExpanded ? t('publications.hideArchive') : t('publications.showArchive') }}
                    </button>
                    <button type="button" class="action-btn action-btn--danger"
                            :disabled="publicationObservationArchiveView().publicationCount === 0 && publicationObservationArchiveView().observationCount === 0"
                            @click="clearPublicationObservationArchive">
                        {{ t('publications.clearArchive') }}
                    </button>
                </div>
                <div v-if="publicationObservationArchiveExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.archivedObservationTimeline') }}</span>
                    <p v-if="publicationObservationArchiveView().entryCount === 0" class="form-hint form-hint--neutral">
                        {{ t('publications.nothingArchivedYetPublishingTo') }}
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="(item, archiveIndex) in publicationObservationArchiveView().entries"
                            :key="archiveIndex" class="replica-knowledge-claim">
                            <span class="peer-badge" :class="crossDomainPublicationObservationTimelineEntryBadgeClass(item)">
                                {{ formatWhen(item.observedAt) }} — {{ displayText(crossDomainPublicationObservationTimelineEntryDomainLabel(item)) }} —
                                {{ item.kind === PublicationObservationTimelineEntryKind.IPFS_PUBLICATION ? t('publications.published') : item.stateLabel }}
                            </span>
                            <p class="form-hint form-hint--neutral">
                                {{ displayText(item.label) }}
                                <template v-if="item.domain === PublicationObservationTimelineDomain.IPFS"> — {{ item.locator }}</template>
                                <template v-else-if="item.txid">{{ ' ' + t('publications.txid2', { txid: item.txid }) }}</template>
                            </p>
                            <p v-if="item.kind === PublicationObservationTimelineEntryKind.BITCOIN_CONFIRMATION && item.blockHeight != null" class="form-hint form-hint--neutral">
                                {{ t('publications.blockHeight3', { blockHeight: item.blockHeight }) }}
                            </p>
                            <p v-if="item.reason" class="form-hint form-hint--neutral">{{ displayText(item.reason) }}</p>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Import replaces (never merges) after an explicit confirmation;
                 an invalid file is rejected. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">{{ t('publications.publicationArchive') }}</span>
                    <span class="peer-badge peer-badge--pending">{{ t('publications.exportImport') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('publications.aPortableCopyOfThe') }}
                </p>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="exportPublicationArchive">
                        {{ t('publications.exportArchive') }}
                    </button>
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationArchiveImportForm">
                        {{ showPublicationArchiveImportForm ? t('publications.cancelImport') : t('publications.importArchive2') }}
                    </button>
                </div>

                <div v-if="publicationArchiveExportedPackage.json" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.exportedArchive') }}</span>
                    <textarea class="form-input identity-export-json" rows="6" readonly :value="publicationArchiveExportedPackage.json"></textarea>
                    <div class="identity-mgmt-actions">
                        <a class="modal-btn modal-btn--primary" :href="publicationArchiveExportedPackage.downloadHref" :download="publicationArchiveExportedPackage.fileName">{{ t('publications.downloadArchiveExport') }}</a>
                    </div>
                </div>

                <div v-if="showPublicationArchiveImportForm" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.importArchive') }}</span>
                    <label class="form-field">
                        <span class="form-label">{{ t('publications.exportedArchiveFile') }}</span>
                        <input type="file" accept="application/json" @change="onPublicationArchiveImportFileChosen" class="form-input" />
                    </label>
                    <textarea v-model="publicationArchiveImportText" class="form-input identity-export-json" rows="6"
                              :placeholder="t('publications.orPasteTheExportedArchive')"></textarea>

                    <p v-if="publicationArchiveImportOutcome && publicationArchiveImportOutcome.outcome === PublicationObservationArchiveImportOutcome.INVALID_ARCHIVE"
                       class="identity-unlock-error">
                        {{ t('publications.thisIsNotAValid') }}
                    </p>

                    <div v-if="publicationArchiveImportPreview" class="identity-import-preview">
                        <p><strong>{{ t('publications.importedArchiveHolds') }}</strong> {{ t('publications.publicationsAndObservations', { publications: t('publications.nPublications', { count: publicationArchiveImportPreview.publicationCount }), observations: t('publications.nObservations', { count: publicationArchiveImportPreview.observationCount }) }) }}</p>
                        <p class="form-hint form-hint--neutral">
                            {{ t('publications.replacingDiscardsEveryFactCurrently', { publications: t('publications.nPublications', { count: publicationObservationArchiveView().publicationCount }), observations: t('publications.nObservations', { count: publicationObservationArchiveView().observationCount }) }) }}
                        </p>
                        <button type="button" class="action-btn action-btn--danger" @click="confirmPublicationArchiveImport">
                            {{ t('publications.replaceCurrentArchive') }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Inspecting an external archive never touches the current one. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">{{ t('publications.inspectExternalArchive') }}</span>
                    <span class="peer-badge peer-badge--pending">{{ t('publications.readOnly') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('publications.lookInsideAnExportedArchive') }}
                </p>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationArchiveInspectionForm">
                        {{ showPublicationArchiveInspectionForm ? t('publications.cancelInspection') : t('publications.inspectArchive2') }}
                    </button>
                </div>

                <div v-if="showPublicationArchiveInspectionForm" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.inspectArchive') }}</span>
                    <label class="form-field">
                        <span class="form-label">{{ t('publications.exportedArchiveFile') }}</span>
                        <input type="file" accept="application/json" @change="onPublicationArchiveInspectionFileChosen" class="form-input" />
                    </label>
                    <textarea v-model="publicationArchiveInspectionText" @input="invalidatePublicationArchiveDifference"
                              class="form-input identity-export-json" rows="6"
                              :placeholder="t('publications.orPasteAnExportedArchive')"></textarea>

                    <p v-if="publicationArchiveInspectionOutcome && publicationArchiveInspectionOutcome.outcome === PublicationObservationArchiveInspectionOutcome.INVALID_ARCHIVE"
                       class="identity-unlock-error">
                        {{ t('publications.thisIsNotAValid2') }}
                    </p>

                    <div v-if="publicationArchiveInspectionOutcome && publicationArchiveInspectionOutcome.outcome === PublicationObservationArchiveInspectionOutcome.INSPECTED"
                         class="identity-import-preview">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>{{ t('publications.schemaVersion') }}</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.schemaVersion }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.ipfsPublicationRecords') }}</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.ipfsPublicationCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.ipfsVerificationObservations') }}</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.ipfsVerificationCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.bitcoinBroadcastObservations') }}</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.bitcoinBroadcastCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.bitcoinConfirmationObservations') }}</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.bitcoinConfirmationCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.bitcoinContentProofObservations') }}</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.bitcoinContentProofCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.bitcoinPublicationRecords') }}</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.bitcoinAnchorPublicationRecordCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.baseTransactionInclusionObservations') }}</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.baseTransactionInclusionObservationCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.basePublicationRecords') }}</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.baseAnchorPublicationRecordCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.localFacts') }}</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.localFactCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.importedFacts') }}</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.importedFactCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.importEvents') }}</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.archiveImportCount }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.archiveFingerprint') }}</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.fingerprint }}</dd></div>
                        </dl>
                        <p v-if="publicationArchiveInspectionOutcome.inspection.bitcoinAnchorIds.length > 0" class="form-hint form-hint--neutral">
                            {{ t('publications.bitcoinAnchorIds', { bitcoinAnchorIds: publicationArchiveInspectionOutcome.inspection.bitcoinAnchorIds.join(', ') }) }}
                        </p>
                        <p v-if="publicationArchiveInspectionOutcome.inspection.ipfsPublicationRecordIndexes.length > 0" class="form-hint form-hint--neutral">
                            {{ t('publications.ipfsPublicationRecordIndexes', { ipfsPublicationRecordIndexes: publicationArchiveInspectionOutcome.inspection.ipfsPublicationRecordIndexes.join(', ') }) }}
                        </p>
                        <p v-if="publicationArchiveInspectionOutcome.inspection.baseTransactionHashes.length > 0" class="form-hint form-hint--neutral">
                            {{ t('publications.baseTransactionHashes', { baseTransactionHashes: publicationArchiveInspectionOutcome.inspection.baseTransactionHashes.join(', ') }) }}
                        </p>
                        <p class="form-hint form-hint--neutral">
                            {{ t('publications.thisIsAReadOnly') }}
                        </p>

                        <!-- Difference is an explicit click; it never says
                             which archive is right. -->
                        <div class="identity-mgmt-actions">
                            <button type="button" class="action-btn action-btn--secondary" @click="comparePublicationArchiveDifference">
                                {{ t('publications.compareWithCurrentArchive') }}
                            </button>
                        </div>

                        <div v-if="publicationArchiveDifferenceResult" class="evidence-inspection-adapter">
                            <span class="evidence-inspection-adapter-title">{{ t('publications.archiveDifference') }}</span>
                            <p class="form-hint form-hint--neutral">
                                {{ t('publications.thisDescribesWhichDurableFacts') }}
                            </p>

                            <p v-if="!publicationArchiveDifferenceResult.hasFactDifference && !publicationArchiveDifferenceResult.hasProvenanceDifference"
                               class="form-hint form-hint--neutral">
                                {{ t('publications.theseTwoArchivesHoldIdentical') }}
                            </p>

                            <ul class="replica-knowledge-claim-list">
                                <li v-for="row in publicationArchiveDifferenceCollectionRows()" :key="row.label" class="replica-knowledge-claim">
                                    <span class="peer-badge peer-badge--pending">{{ displayText(row.label) }}</span>
                                    <p class="form-hint form-hint--neutral">
                                        {{ t('publications.sameChangedOnlyInCurrent', { unchangedCount: row.collection.unchangedCount, changedCount: row.collection.changedCount, onlyInCurrentCount: row.collection.onlyInCurrentCount, onlyInExternalCount: row.collection.onlyInExternalCount, provenanceChangedCount: row.collection.provenanceChangedCount }) }}
                                    </p>
                                </li>
                            </ul>

                            <p class="form-hint form-hint--neutral">
                                {{ t('publications.importEventsCurrentVsExternal', { currentCount: publicationArchiveDifferenceResult.importEvents.currentCount, externalCount: publicationArchiveDifferenceResult.importEvents.externalCount }) }}
                            </p>

                            <!-- Review composes the difference; only "Replace
                                 Current Archive" changes anything. -->
                            <div class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--secondary" @click="reviewPublicationArchiveReplacement">
                                    {{ t('publications.reviewReplacement') }}
                                </button>
                            </div>

                            <div v-if="publicationArchiveReplacementReviewResult" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">{{ t('publications.replacementReview') }}</span>
                                <p class="form-hint form-hint--neutral">
                                    {{ t('publications.whatReplacingTheCurrentArchive') }}
                                </p>

                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>{{ t('publications.currentFingerprint') }}</dt><dd>{{ publicationArchiveReplacementReviewResult.currentFingerprint }}</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.externalFingerprint') }}</dt><dd>{{ publicationArchiveReplacementReviewResult.externalFingerprint }}</dd></div>
                                </dl>

                                <ul class="replica-knowledge-claim-list">
                                    <li class="replica-knowledge-claim">
                                        <span class="peer-badge peer-badge--pending">{{ t('publications.facts') }}</span>
                                        <p class="form-hint form-hint--neutral">
                                            {{ t('publications.publicationsCurrentExternal', { publicationCount: publicationArchiveReplacementReviewResult.current.publicationCount, publicationCount2: publicationArchiveReplacementReviewResult.external.publicationCount }) }}
                                        </p>
                                        <p class="form-hint form-hint--neutral">
                                            {{ t('publications.observationsCurrentExternal', { observationCount: publicationArchiveReplacementReviewResult.current.observationCount, observationCount2: publicationArchiveReplacementReviewResult.external.observationCount }) }}
                                        </p>
                                    </li>
                                    <li class="replica-knowledge-claim">
                                        <span class="peer-badge peer-badge--pending">{{ t('publications.provenance') }}</span>
                                        <p class="form-hint form-hint--neutral">
                                            {{ t('publications.localFactsCurrentExternal', { localFactCount: publicationArchiveReplacementReviewResult.current.localFactCount, localFactCount2: publicationArchiveReplacementReviewResult.external.localFactCount }) }}
                                        </p>
                                        <p class="form-hint form-hint--neutral">
                                            {{ t('publications.importedFactsCurrentExternal', { importedFactCount: publicationArchiveReplacementReviewResult.current.importedFactCount, importedFactCount2: publicationArchiveReplacementReviewResult.external.importedFactCount }) }}
                                        </p>
                                    </li>
                                    <li class="replica-knowledge-claim">
                                        <span class="peer-badge peer-badge--pending">{{ t('publications.importEvents') }}</span>
                                        <p class="form-hint form-hint--neutral">
                                            {{ t('publications.currentExternal', { archiveImportCount: publicationArchiveReplacementReviewResult.current.archiveImportCount, archiveImportCount2: publicationArchiveReplacementReviewResult.external.archiveImportCount }) }}
                                        </p>
                                    </li>
                                </ul>

                                <p class="form-hint form-hint--neutral">
                                    {{ t('publications.replacingRestampsEveryFactIn') }}
                                </p>

                                <div class="identity-mgmt-actions">
                                    <button type="button" class="action-btn action-btn--secondary" @click="cancelPublicationArchiveReplacementReview">
                                        {{ t('publications.cancel2') }}
                                    </button>
                                    <button type="button" class="action-btn action-btn--danger" @click="confirmPublicationArchiveReplacementFromReview">
                                        {{ t('publications.replaceCurrentArchive') }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Provenance says where a fact entered the archive, not whether
                 it is true. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">{{ t('publications.archiveProvenance') }}</span>
                    <span class="peer-badge peer-badge--pending">{{ t('publications.whereFactsEnteredThisArchive') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('publications.localFactsWereObservedBy') }}
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>{{ t('publications.localFacts') }}</dt><dd>{{ publicationObservationArchiveProvenanceView().localFactCount }}</dd></div>
                    <div class="evidence-field"><dt>{{ t('publications.importedFacts') }}</dt><dd>{{ publicationObservationArchiveProvenanceView().importedFactCount }}</dd></div>
                </dl>
                <div v-if="publicationObservationArchiveProvenanceView().archiveImportCount > 0" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.archiveImports') }}</span>
                    <ul class="replica-knowledge-claim-list">
                        <li v-for="(event, importIndex) in publicationObservationArchiveProvenanceView().archiveImportEvents"
                            :key="importIndex" class="replica-knowledge-claim">
                            <span class="peer-badge peer-badge--pending">{{ formatWhen(event.importedAt) }}</span>
                            <p class="form-hint form-hint--neutral">
                                {{ t('publications.factSImportedArchiveSchema', { count: event.importedEntryCount, importedArchiveSchemaVersion: event.importedArchiveSchemaVersion }) }}
                            </p>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Fingerprint: SHA-256 of the archive's canonical facts.
                 Comparing runs only on the "Compare" click; a match means
                 identical contents, nothing more. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">{{ t('publications.archiveFingerprint2') }}</span>
                    <span class="peer-badge peer-badge--pending">{{ publicationObservationArchiveFingerprintView().algorithm }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('publications.aDeterministicDigestOfEvery') }}
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>{{ t('publications.fingerprint') }}</dt><dd>{{ publicationObservationArchiveFingerprintView().fingerprint }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="copyArchiveFingerprint">
                        {{ archiveFingerprintCopied ? t('publications.copied') : t('publications.copyFingerprint') }}
                    </button>
                </div>

                <div class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.compareWithAnotherFingerprint') }}</span>
                    <label class="form-field">
                        <span class="form-label">{{ t('publications.fingerprintToCompare') }}</span>
                        <input type="text" class="form-input" v-model="archiveFingerprintComparisonInput"
                               @input="onArchiveFingerprintComparisonInputChanged"
                               :placeholder="t('publications.pasteA64CharacterSha')" />
                    </label>
                    <div class="identity-mgmt-actions">
                        <button type="button" class="action-btn action-btn--secondary" @click="compareArchiveFingerprint">
                            {{ t('publications.compare') }}
                        </button>
                    </div>

                    <p v-if="archiveFingerprintComparisonResult === PublicationObservationArchiveFingerprintComparisonResult.MATCH"
                       class="form-hint form-hint--neutral">
                        {{ t('publications.resultMatchTheSuppliedFingerprint') }}
                    </p>
                    <p v-else-if="archiveFingerprintComparisonResult === PublicationObservationArchiveFingerprintComparisonResult.DIFFERENT"
                       class="form-hint form-hint--neutral">
                        {{ t('publications.resultDifferentTheSuppliedFingerprint') }}
                    </p>
                    <p v-else-if="archiveFingerprintComparisonResult === PublicationObservationArchiveFingerprintComparisonResult.INVALID_FINGERPRINT"
                       class="identity-unlock-error">
                        {{ t('publications.thisIsNotAWell') }}
                    </p>
                </div>
            </div>
            </div>`;
