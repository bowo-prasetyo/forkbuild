// Publications page template: the Archive Tools tab.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const archiveToolsTabTemplate = `<div v-show="publicationsToolsTab === 'archive'">
            <!-- The durable observation archive. Other actions only ever add to
                 it; "Clear Archive" is the only removal. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Observation Archive</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Publication and observation facts, kept durable across a page reload. Never a
                    wallet connection, a signing capability, a private key, or any other
                    credential — this archive never stores one, and reloading this page never
                    restores one.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Publications</dt><dd>{{ publicationObservationArchiveView().publicationCount }}</dd></div>
                    <div class="evidence-field"><dt>Observations</dt><dd>{{ publicationObservationArchiveView().observationCount }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationObservationArchive">
                        {{ publicationObservationArchiveExpanded ? 'Hide Archive' : 'Show Archive' }}
                    </button>
                    <button type="button" class="action-btn action-btn--danger"
                            :disabled="publicationObservationArchiveView().publicationCount === 0 && publicationObservationArchiveView().observationCount === 0"
                            @click="clearPublicationObservationArchive">
                        Clear Archive
                    </button>
                </div>
                <div v-if="publicationObservationArchiveExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Archived Observation Timeline</span>
                    <p v-if="publicationObservationArchiveView().entryCount === 0" class="form-hint form-hint--neutral">
                        Nothing archived yet. Publishing to IPFS, verifying content, broadcasting a
                        Bitcoin transaction, or observing a confirmation on this page adds to this
                        archive automatically.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="(item, archiveIndex) in publicationObservationArchiveView().entries"
                            :key="archiveIndex" class="replica-knowledge-claim">
                            <span class="peer-badge" :class="crossDomainPublicationObservationTimelineEntryBadgeClass(item)">
                                {{ formatWhen(item.observedAt) }} — {{ crossDomainPublicationObservationTimelineEntryDomainLabel(item) }} —
                                {{ item.kind === PublicationObservationTimelineEntryKind.IPFS_PUBLICATION ? 'Published' : item.stateLabel }}
                            </span>
                            <p class="form-hint form-hint--neutral">
                                {{ item.label }}
                                <template v-if="item.domain === PublicationObservationTimelineDomain.IPFS"> — {{ item.locator }}</template>
                                <template v-else-if="item.txid"> — txid {{ item.txid }}</template>
                            </p>
                            <p v-if="item.kind === PublicationObservationTimelineEntryKind.BITCOIN_CONFIRMATION && item.blockHeight != null" class="form-hint form-hint--neutral">
                                Block height {{ item.blockHeight }}
                            </p>
                            <p v-if="item.reason" class="form-hint form-hint--neutral">{{ item.reason }}</p>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Import replaces (never merges) after an explicit confirmation;
                 an invalid file is rejected. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Publication Archive</span>
                    <span class="peer-badge peer-badge--pending">Export / Import</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    A portable copy of the recorded facts above — publication identities and
                    observations only, never a wallet connection, a signing capability, a
                    private key, or any pinning-provider credential. Exporting performs no
                    network operation of its own. Importing REPLACES the current archive
                    entirely — it never merges with it.
                </p>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="exportPublicationArchive">
                        Export Archive
                    </button>
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationArchiveImportForm">
                        {{ showPublicationArchiveImportForm ? 'Cancel Import' : 'Import Archive' }}
                    </button>
                </div>
                <p class="form-hint form-hint--neutral">
                    Reconciling this archive against a peer's, authoring or exporting
                    your own signed leaderboard snapshot claim, and seeing publishers
                    ranked by their own recorded achievements all happen on the
                    <router-link to="/leaderboard">Leaderboard</router-link> page.
                </p>

                <div v-if="publicationArchiveExportedPackage.json" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Exported Archive</span>
                    <textarea class="form-input identity-export-json" rows="6" readonly :value="publicationArchiveExportedPackage.json"></textarea>
                    <div class="identity-mgmt-actions">
                        <a class="modal-btn modal-btn--primary" :href="publicationArchiveExportedPackage.downloadHref" :download="publicationArchiveExportedPackage.fileName">Download Archive Export</a>
                    </div>
                </div>

                <div v-if="showPublicationArchiveImportForm" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Import Archive</span>
                    <label class="form-field">
                        <span class="form-label">Exported archive file</span>
                        <input type="file" accept="application/json" @change="onPublicationArchiveImportFileChosen" class="form-input" />
                    </label>
                    <textarea v-model="publicationArchiveImportText" class="form-input identity-export-json" rows="6"
                              placeholder="…or paste the exported archive JSON here"></textarea>

                    <p v-if="publicationArchiveImportOutcome && publicationArchiveImportOutcome.outcome === PublicationObservationArchiveImportOutcome.INVALID_ARCHIVE"
                       class="identity-unlock-error">
                        This is not a valid publication archive export — nothing was changed.
                    </p>

                    <div v-if="publicationArchiveImportPreview" class="identity-import-preview">
                        <p><strong>Imported archive holds:</strong> {{ publicationArchiveImportPreview.publicationCount }} publication(s), {{ publicationArchiveImportPreview.observationCount }} observation(s).</p>
                        <p class="form-hint form-hint--neutral">
                            Replacing discards every fact currently in the Observation Archive above
                            ({{ publicationObservationArchiveView().publicationCount }} publication(s),
                            {{ publicationObservationArchiveView().observationCount }} observation(s)) — this cannot be undone.
                        </p>
                        <button type="button" class="action-btn action-btn--danger" @click="confirmPublicationArchiveImport">
                            Replace Current Archive
                        </button>
                    </div>
                </div>
            </div>

            <!-- Inspecting an external archive never touches the current one. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Inspect External Archive</span>
                    <span class="peer-badge peer-badge--pending">Read-only</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Look inside an exported archive file without importing it — the Observation
                    Archive above, and everything derived from it, stays exactly as it is. Nothing
                    here is fetched, verified, or reconciled against the current archive, and
                    nothing here can ever replace it.
                </p>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationArchiveInspectionForm">
                        {{ showPublicationArchiveInspectionForm ? 'Cancel Inspection' : 'Inspect Archive' }}
                    </button>
                </div>

                <div v-if="showPublicationArchiveInspectionForm" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Inspect Archive</span>
                    <label class="form-field">
                        <span class="form-label">Exported archive file</span>
                        <input type="file" accept="application/json" @change="onPublicationArchiveInspectionFileChosen" class="form-input" />
                    </label>
                    <textarea v-model="publicationArchiveInspectionText" @input="invalidatePublicationArchiveDifference"
                              class="form-input identity-export-json" rows="6"
                              placeholder="…or paste an exported archive JSON here"></textarea>

                    <p v-if="publicationArchiveInspectionOutcome && publicationArchiveInspectionOutcome.outcome === PublicationObservationArchiveInspectionOutcome.INVALID_ARCHIVE"
                       class="identity-unlock-error">
                        This is not a valid publication archive export — nothing to inspect.
                    </p>

                    <div v-if="publicationArchiveInspectionOutcome && publicationArchiveInspectionOutcome.outcome === PublicationObservationArchiveInspectionOutcome.INSPECTED"
                         class="identity-import-preview">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Schema version</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.schemaVersion }}</dd></div>
                            <div class="evidence-field"><dt>IPFS publication records</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.ipfsPublicationCount }}</dd></div>
                            <div class="evidence-field"><dt>IPFS verification observations</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.ipfsVerificationCount }}</dd></div>
                            <div class="evidence-field"><dt>Bitcoin broadcast observations</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.bitcoinBroadcastCount }}</dd></div>
                            <div class="evidence-field"><dt>Bitcoin confirmation observations</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.bitcoinConfirmationCount }}</dd></div>
                            <div class="evidence-field"><dt>Bitcoin content-proof observations</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.bitcoinContentProofCount }}</dd></div>
                            <div class="evidence-field"><dt>Bitcoin publication records</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.bitcoinAnchorPublicationRecordCount }}</dd></div>
                            <div class="evidence-field"><dt>Base transaction inclusion observations</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.baseTransactionInclusionObservationCount }}</dd></div>
                            <div class="evidence-field"><dt>Base publication records</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.baseAnchorPublicationRecordCount }}</dd></div>
                            <div class="evidence-field"><dt>Local facts</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.localFactCount }}</dd></div>
                            <div class="evidence-field"><dt>Imported facts</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.importedFactCount }}</dd></div>
                            <div class="evidence-field"><dt>Import events</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.archiveImportCount }}</dd></div>
                            <div class="evidence-field"><dt>Archive fingerprint</dt><dd>{{ publicationArchiveInspectionOutcome.inspection.fingerprint }}</dd></div>
                        </dl>
                        <p v-if="publicationArchiveInspectionOutcome.inspection.bitcoinAnchorIds.length > 0" class="form-hint form-hint--neutral">
                            Bitcoin anchor IDs: {{ publicationArchiveInspectionOutcome.inspection.bitcoinAnchorIds.join(', ') }}
                        </p>
                        <p v-if="publicationArchiveInspectionOutcome.inspection.ipfsPublicationRecordIndexes.length > 0" class="form-hint form-hint--neutral">
                            IPFS publication record indexes: {{ publicationArchiveInspectionOutcome.inspection.ipfsPublicationRecordIndexes.join(', ') }}
                        </p>
                        <p v-if="publicationArchiveInspectionOutcome.inspection.baseTransactionHashes.length > 0" class="form-hint form-hint--neutral">
                            Base transaction hashes: {{ publicationArchiveInspectionOutcome.inspection.baseTransactionHashes.join(', ') }}
                        </p>
                        <p class="form-hint form-hint--neutral">
                            This is a read-only look at the file above — it changes nothing about the
                            Observation Archive shown earlier on this page. Use "Import Archive" above
                            if you want this archive to replace it.
                        </p>

                        <!-- Difference is an explicit click; it never says
                             which archive is right. -->
                        <div class="identity-mgmt-actions">
                            <button type="button" class="action-btn action-btn--secondary" @click="comparePublicationArchiveDifference">
                                Compare With Current Archive
                            </button>
                        </div>

                        <div v-if="publicationArchiveDifferenceResult" class="evidence-inspection-adapter">
                            <span class="evidence-inspection-adapter-title">Archive Difference</span>
                            <p class="form-hint form-hint--neutral">
                                This describes which durable facts and provenance tags differ between the
                                current archive and the external archive above — it does not determine
                                which archive is correct.
                            </p>

                            <p v-if="!publicationArchiveDifferenceResult.hasFactDifference && !publicationArchiveDifferenceResult.hasProvenanceDifference"
                               class="form-hint form-hint--neutral">
                                These two archives hold identical durable facts and provenance.
                            </p>

                            <ul class="replica-knowledge-claim-list">
                                <li v-for="row in publicationArchiveDifferenceCollectionRows()" :key="row.label" class="replica-knowledge-claim">
                                    <span class="peer-badge peer-badge--pending">{{ row.label }}</span>
                                    <p class="form-hint form-hint--neutral">
                                        Same: {{ row.collection.unchangedCount }} ·
                                        Changed: {{ row.collection.changedCount }} ·
                                        Only in current: {{ row.collection.onlyInCurrentCount }} ·
                                        Only in external: {{ row.collection.onlyInExternalCount }} ·
                                        Different provenance: {{ row.collection.provenanceChangedCount }}
                                    </p>
                                </li>
                            </ul>

                            <p class="form-hint form-hint--neutral">
                                Import events: {{ publicationArchiveDifferenceResult.importEvents.currentCount }} current vs.
                                {{ publicationArchiveDifferenceResult.importEvents.externalCount }} external — not part of
                                the content fingerprint (0.8.84).
                            </p>

                            <!-- Review composes the difference; only "Replace
                                 Current Archive" changes anything. -->
                            <div class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--secondary" @click="reviewPublicationArchiveReplacement">
                                    Review Replacement
                                </button>
                            </div>

                            <div v-if="publicationArchiveReplacementReviewResult" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">Replacement Review</span>
                                <p class="form-hint form-hint--neutral">
                                    What replacing the current archive with the external archive above would
                                    change — the current archive stays exactly as it is until "Replace Current
                                    Archive" below is clicked explicitly.
                                </p>

                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>Current fingerprint</dt><dd>{{ publicationArchiveReplacementReviewResult.currentFingerprint }}</dd></div>
                                    <div class="evidence-field"><dt>External fingerprint</dt><dd>{{ publicationArchiveReplacementReviewResult.externalFingerprint }}</dd></div>
                                </dl>

                                <ul class="replica-knowledge-claim-list">
                                    <li class="replica-knowledge-claim">
                                        <span class="peer-badge peer-badge--pending">Facts</span>
                                        <p class="form-hint form-hint--neutral">
                                            Publications — current: {{ publicationArchiveReplacementReviewResult.current.publicationCount }},
                                            external: {{ publicationArchiveReplacementReviewResult.external.publicationCount }}
                                        </p>
                                        <p class="form-hint form-hint--neutral">
                                            Observations — current: {{ publicationArchiveReplacementReviewResult.current.observationCount }},
                                            external: {{ publicationArchiveReplacementReviewResult.external.observationCount }}
                                        </p>
                                    </li>
                                    <li class="replica-knowledge-claim">
                                        <span class="peer-badge peer-badge--pending">Provenance</span>
                                        <p class="form-hint form-hint--neutral">
                                            Local facts — current: {{ publicationArchiveReplacementReviewResult.current.localFactCount }},
                                            external: {{ publicationArchiveReplacementReviewResult.external.localFactCount }}
                                        </p>
                                        <p class="form-hint form-hint--neutral">
                                            Imported facts — current: {{ publicationArchiveReplacementReviewResult.current.importedFactCount }},
                                            external: {{ publicationArchiveReplacementReviewResult.external.importedFactCount }}
                                        </p>
                                    </li>
                                    <li class="replica-knowledge-claim">
                                        <span class="peer-badge peer-badge--pending">Import events</span>
                                        <p class="form-hint form-hint--neutral">
                                            Current: {{ publicationArchiveReplacementReviewResult.current.archiveImportCount }},
                                            external: {{ publicationArchiveReplacementReviewResult.external.archiveImportCount }}
                                        </p>
                                    </li>
                                </ul>

                                <p class="form-hint form-hint--neutral">
                                    Replacing restamps every fact in the external archive above IMPORTED
                                    (0.8.83) — the resulting current fingerprint will therefore differ from
                                    "External fingerprint" shown above, even though the underlying
                                    observations are identical.
                                </p>

                                <div class="identity-mgmt-actions">
                                    <button type="button" class="action-btn action-btn--secondary" @click="cancelPublicationArchiveReplacementReview">
                                        Cancel
                                    </button>
                                    <button type="button" class="action-btn action-btn--danger" @click="confirmPublicationArchiveReplacementFromReview">
                                        Replace Current Archive
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
                    <span class="identity-mgmt-name">Archive Provenance</span>
                    <span class="peer-badge peer-badge--pending">Where facts entered this archive</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    Local facts were observed by this replica directly. Imported facts entered
                    this archive through a prior "Replace Current Archive" import. Neither is
                    more trustworthy than the other — this only states where each fact came from.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Local facts</dt><dd>{{ publicationObservationArchiveProvenanceView().localFactCount }}</dd></div>
                    <div class="evidence-field"><dt>Imported facts</dt><dd>{{ publicationObservationArchiveProvenanceView().importedFactCount }}</dd></div>
                </dl>
                <div v-if="publicationObservationArchiveProvenanceView().archiveImportCount > 0" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Archive Imports</span>
                    <ul class="replica-knowledge-claim-list">
                        <li v-for="(event, importIndex) in publicationObservationArchiveProvenanceView().archiveImportEvents"
                            :key="importIndex" class="replica-knowledge-claim">
                            <span class="peer-badge peer-badge--pending">{{ formatWhen(event.importedAt) }}</span>
                            <p class="form-hint form-hint--neutral">
                                {{ event.importedEntryCount }} fact(s) imported (archive schema version {{ event.importedArchiveSchemaVersion }})
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
                    <span class="identity-mgmt-name">Archive Fingerprint</span>
                    <span class="peer-badge peer-badge--pending">{{ publicationObservationArchiveFingerprintView().algorithm }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    A deterministic digest of every fact and provenance tag recorded above.
                    Two replicas whose fingerprints match hold exactly the same durable archive
                    contents — this states nothing about whether those contents are authentic,
                    verified, or correct.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Fingerprint</dt><dd>{{ publicationObservationArchiveFingerprintView().fingerprint }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="copyArchiveFingerprint">
                        {{ archiveFingerprintCopied ? 'Copied!' : 'Copy Fingerprint' }}
                    </button>
                </div>

                <div class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Compare With Another Fingerprint</span>
                    <label class="form-field">
                        <span class="form-label">Fingerprint to compare</span>
                        <input type="text" class="form-input" v-model="archiveFingerprintComparisonInput"
                               @input="onArchiveFingerprintComparisonInputChanged"
                               placeholder="Paste a 64-character SHA-256 fingerprint" />
                    </label>
                    <div class="identity-mgmt-actions">
                        <button type="button" class="action-btn action-btn--secondary" @click="compareArchiveFingerprint">
                            Compare
                        </button>
                    </div>

                    <p v-if="archiveFingerprintComparisonResult === PublicationObservationArchiveFingerprintComparisonResult.MATCH"
                       class="form-hint form-hint--neutral">
                        Result: MATCH — the supplied fingerprint is equal to the digest computed from this
                        archive above. This states nothing about whether either archive's facts are correct.
                    </p>
                    <p v-else-if="archiveFingerprintComparisonResult === PublicationObservationArchiveFingerprintComparisonResult.DIFFERENT"
                       class="form-hint form-hint--neutral">
                        Result: DIFFERENT — the supplied fingerprint is not equal to the digest computed from
                        this archive above.
                    </p>
                    <p v-else-if="archiveFingerprintComparisonResult === PublicationObservationArchiveFingerprintComparisonResult.INVALID_FINGERPRINT"
                       class="identity-unlock-error">
                        This is not a well-formed 64-character SHA-256 fingerprint — nothing was compared.
                    </p>
                </div>
            </div>
            </div>`;
