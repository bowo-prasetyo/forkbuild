import { ref, reactive, computed } from 'vue';
import { PublicationObservationArchive } from '../../../application/PublicationObservationArchive.js';
import {
    CreateBitcoinAnchorPublicationRecordUseCase
} from '../../../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import {
    CreateBaseAnchorPublicationRecordUseCase
} from '../../../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { describePublicationObservationArchive } from '../../../application/PublicationObservationArchiveView.js';
import {
    describePublicationObservationArchiveProvenance
} from '../../../application/PublicationObservationArchiveProvenanceView.js';
import {
    describePublicationObservationArchiveFingerprint
} from '../../../application/PublicationObservationArchiveFingerprintView.js';
import {
    comparePublicationObservationArchiveFingerprint
} from '../../../application/PublicationObservationArchiveFingerprintComparison.js';
import {
    exportPublicationObservationArchive, importPublicationObservationArchive,
    PublicationObservationArchiveImportOutcome, recordPublicationObservationArchiveImport
} from '../../../application/PublicationObservationArchiveExport.js';
import {
    inspectPublicationObservationArchive, PublicationObservationArchiveInspectionOutcome
} from '../../../application/PublicationObservationArchiveInspection.js';
import {
    describePublicationObservationArchiveDifference
} from '../../../application/PublicationObservationArchiveDifference.js';
import {
    describePublicationObservationArchiveReplacementReview
} from '../../../application/PublicationObservationArchiveReplacementReview.js';

// The publication observation archive: the one durable record this page keeps.
// Records publish/verify/broadcast/confirmation observations and anchor
// publication records, and offers fingerprint, export, import, inspection and
// replacement review over it.
export function usePublicationObservationArchive({
    publicationObservationArchiveStorage
}) {
    // The durable, cross-domain observation archive, loaded at mount and
    // saved by every archiveXxx() helper. The per-entry histories on this
    // page stay ephemeral; each append site writes both, side by side.
    const publicationObservationArchive = ref(PublicationObservationArchive.empty());
    const publicationObservationArchiveExpanded = ref(false);

    // Best-effort: a failed save (a full or disabled localStorage) is
    // never allowed to interrupt the in-memory fact this page just
    // observed, or the explicit action that produced it — it only
    // means this one fact will not survive a reload.
    function persistPublicationObservationArchive() {
        try {
            publicationObservationArchiveStorage.save(publicationObservationArchive.value);
        } catch {
            // Intentionally swallowed — see this function's own comment above.
        }
    }

    // Remembers where the record landed in the shared archive (a different
    // index from localIndex, since the archive holds every entry's records)
    // so a later verification can find it.
    function archivePublishIpfsRecord(entry, localIndex, record) {
        publicationObservationArchive.value = publicationObservationArchive.value.appendIpfsPublicationRecord(record);
        entry.archiveIpfsRecordIndexByLocalIndex[localIndex] = publicationObservationArchive.value.ipfsPublicationRecords.length - 1;
        persistPublicationObservationArchive();
    }

    // A record this page never archived (e.g. discovered elsewhere) gets no
    // archived verification; the archive position is never guessed.
    function archiveIpfsVerificationObservation(entry, localIndex, observation) {
        const archiveIndex = entry.archiveIpfsRecordIndexByLocalIndex[localIndex];
        if (!Number.isInteger(archiveIndex)) return;
        publicationObservationArchive.value = publicationObservationArchive.value.appendIpfsContentVerificationObservation(archiveIndex, observation);
        persistPublicationObservationArchive();
    }

    // recordIndex is always null: which IPFS record a Bitcoin anchor
    // corresponds to is not tracked, and is never guessed from a shared
    // contentHash.
    function archiveBitcoinBroadcast({ anchorId, txid, state, reason, broadcastedAt }) {
        publicationObservationArchive.value = publicationObservationArchive.value.appendBitcoinBroadcastRecord({
            recordIndex: null, anchorId, txid, state, reason, broadcastedAt
        });
        persistPublicationObservationArchive();
    }

    function archiveBitcoinConfirmationObservation(anchorId, observation) {
        publicationObservationArchive.value = publicationObservationArchive.value.appendBitcoinConfirmationObservation(anchorId, observation);
        persistPublicationObservationArchive();
    }

    function archiveBitcoinContentProofObservation(anchorId, observation) {
        publicationObservationArchive.value = publicationObservationArchive.value.appendBitcoinContentProofObservation(anchorId, observation);
        persistPublicationObservationArchive();
    }

    const createBitcoinAnchorPublicationRecordUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();

    // Called once, when finalization succeeds. Mints this replica's durable
    // identity for the publication attempt; a later broadcast failure never
    // erases it.
    function archiveBitcoinAnchorPublicationRecord({ anchorId, contentHash, txid, network, createdAt }) {
        publicationObservationArchive.value = createBitcoinAnchorPublicationRecordUseCase.execute(publicationObservationArchive.value, {
            anchorId, contentHash, txid, network, createdAt
        });
        persistPublicationObservationArchive();
    }

    // Appended automatically after every explicit "Observe Transaction",
    // keyed by txid, as with every other observation kind.
    function archiveBaseTransactionInclusionObservation(transactionHash, observation) {
        publicationObservationArchive.value = publicationObservationArchive.value.appendBaseTransactionInclusionObservation(transactionHash, observation);
        persistPublicationObservationArchive();
    }

    const createBaseAnchorPublicationRecordUseCase = new CreateBaseAnchorPublicationRecordUseCase();

    // Called once, when finalization succeeds; same as the Bitcoin record
    // above.
    function archiveBaseAnchorPublicationRecord({ contentHash, txid, network, createdAt }) {
        publicationObservationArchive.value = createBaseAnchorPublicationRecordUseCase.execute(publicationObservationArchive.value, {
            contentHash, txid, network, createdAt
        });
        persistPublicationObservationArchive();
    }

    function publicationObservationArchiveView() {
        return describePublicationObservationArchive(publicationObservationArchive.value);
    }

    function publicationObservationArchiveProvenanceView() {
        return describePublicationObservationArchiveProvenance(publicationObservationArchive.value);
    }

    function publicationObservationArchiveFingerprintView() {
        return describePublicationObservationArchiveFingerprint(publicationObservationArchive.value);
    }

    // Copy-to-clipboard for the fingerprint only — mirrors ui/views/
    // PeerConnectionsView.js's own `copyText()`/`copiedKey` pattern
    // exactly, scoped to this one value since it is the only thing on
    // this page a person copies verbatim.
    const archiveFingerprintCopied = ref(false);
    async function copyArchiveFingerprint() {
        try {
            await navigator.clipboard.writeText(publicationObservationArchiveFingerprintView().fingerprint);
            archiveFingerprintCopied.value = true;
            setTimeout(() => { archiveFingerprintCopied.value = false; }, 1500);
        } catch {
            // Clipboard API unavailable or denied — the fingerprint is
            // already shown as selectable text for manual copy.
        }
    }

    // Compared only on the explicit "Compare" click, never automatically.
    const archiveFingerprintComparisonInput = ref('');
    const archiveFingerprintComparisonResult = ref(null);

    function onArchiveFingerprintComparisonInputChanged() {
        // A result for text that has since changed would misrepresent what
        // was compared.
        archiveFingerprintComparisonResult.value = null;
    }

    function compareArchiveFingerprint() {
        archiveFingerprintComparisonResult.value = comparePublicationObservationArchiveFingerprint(
            publicationObservationArchive.value,
            archiveFingerprintComparisonInput.value
        );
    }

    function togglePublicationObservationArchive() {
        publicationObservationArchiveExpanded.value = !publicationObservationArchiveExpanded.value;
    }

    // The only destructive action on the archive, reached only from the
    // "Clear Archive" button.
    function clearPublicationObservationArchive() {
        publicationObservationArchive.value = PublicationObservationArchive.empty();
        publicationObservationArchiveStorage.clear();
    }

    // Export produces a data: URI the person clicks to download, never a
    // programmatic download.
    const publicationArchiveExportedPackage = reactive({ json: '', fileName: '', downloadHref: '' });

    function exportPublicationArchive() {
        const json = JSON.stringify(exportPublicationObservationArchive(publicationObservationArchive.value), null, 2);
        publicationArchiveExportedPackage.json = json;
        publicationArchiveExportedPackage.fileName = 'publication-observation-archive-export.json';
        publicationArchiveExportedPackage.downloadHref = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    }

    // The import preview re-validates on every change without touching the
    // archive; only confirmPublicationArchiveImport() replaces it.
    const showPublicationArchiveImportForm = ref(false);
    const publicationArchiveImportText = ref('');

    function togglePublicationArchiveImportForm() {
        showPublicationArchiveImportForm.value = !showPublicationArchiveImportForm.value;
        publicationArchiveImportText.value = '';
    }

    function onPublicationArchiveImportFileChosen(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { publicationArchiveImportText.value = String(reader.result || ''); };
        reader.readAsText(file);
    }

    const publicationArchiveImportOutcome = computed(() => {
        const text = publicationArchiveImportText.value.trim();
        if (!text) return null;
        return importPublicationObservationArchive(text);
    });

    const publicationArchiveImportPreview = computed(() => {
        const outcome = publicationArchiveImportOutcome.value;
        if (!outcome || outcome.outcome !== PublicationObservationArchiveImportOutcome.IMPORTED) return null;
        return describePublicationObservationArchive(outcome.archive);
    });

    // Replaces (never merges) the archive. Re-checks the outcome instead of
    // trusting the preview, so a stale click can never import something
    // invalid.
    function confirmPublicationArchiveImport() {
        const outcome = publicationArchiveImportOutcome.value;
        if (!outcome || outcome.outcome !== PublicationObservationArchiveImportOutcome.IMPORTED) return;
        // The import event is minted when the archive is actually replaced,
        // not at preview time.
        publicationObservationArchive.value = recordPublicationObservationArchiveImport(outcome.archive, { importedAt: new Date() });
        persistPublicationObservationArchive();
        showPublicationArchiveImportForm.value = false;
        publicationArchiveImportText.value = '';
    }

    // Inspecting an external archive never touches the current one, so
    // there is nothing to confirm.
    const showPublicationArchiveInspectionForm = ref(false);
    const publicationArchiveInspectionText = ref('');

    // Written only by the explicit "Compare With Current Archive" click.
    // Any change to the inspected text clears a stale result, and a stale
    // difference also clears the replacement review computed from it.
    const publicationArchiveDifferenceResult = ref(null);

    const publicationArchiveReplacementReviewResult = ref(null);

    function invalidatePublicationArchiveDifference() {
        publicationArchiveDifferenceResult.value = null;
        publicationArchiveReplacementReviewResult.value = null;
    }

    function togglePublicationArchiveInspectionForm() {
        showPublicationArchiveInspectionForm.value = !showPublicationArchiveInspectionForm.value;
        publicationArchiveInspectionText.value = '';
        invalidatePublicationArchiveDifference();
    }

    function onPublicationArchiveInspectionFileChosen(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { publicationArchiveInspectionText.value = String(reader.result || ''); };
        reader.readAsText(file);
        invalidatePublicationArchiveDifference();
    }

    const publicationArchiveInspectionOutcome = computed(() => {
        const text = publicationArchiveInspectionText.value.trim();
        if (!text) return null;
        return inspectPublicationObservationArchive(text);
    });

    // Reconstructs the external archive from the already-validated
    // inspection text; touches neither archive.
    function comparePublicationArchiveDifference() {
        const outcome = publicationArchiveInspectionOutcome.value;
        if (!outcome || outcome.outcome !== PublicationObservationArchiveInspectionOutcome.INSPECTED) return;
        const externalArchive = PublicationObservationArchive.fromJSON(JSON.parse(publicationArchiveInspectionText.value.trim()));
        publicationArchiveDifferenceResult.value = describePublicationObservationArchiveDifference(
            publicationObservationArchive.value,
            externalArchive
        );
        // A fresh comparison invalidates whatever review was shown for
        // a previous one — the identical "any change invalidates a
        // stale result" discipline this whole card already holds.
        publicationArchiveReplacementReviewResult.value = null;
    }

    function publicationArchiveDifferenceCollectionRows() {
        const difference = publicationArchiveDifferenceResult.value;
        if (!difference) return [];
        return [
            { label: 'IPFS publication records', collection: difference.ipfsPublicationRecords },
            { label: 'IPFS verification observations', collection: difference.ipfsContentVerificationObservationsByRecordIndex },
            { label: 'Bitcoin broadcast observations', collection: difference.bitcoinBroadcastRecords },
            { label: 'Bitcoin confirmation observations', collection: difference.bitcoinConfirmationObservationsByAnchorId },
            { label: 'Bitcoin content-proof observations', collection: difference.bitcoinContentProofObservationsByAnchorId },
            { label: 'Bitcoin publication records', collection: difference.bitcoinAnchorPublicationRecords },
            { label: 'Base transaction inclusion observations', collection: difference.baseTransactionInclusionObservationsByTransactionHash }
        ];
    }

    // A review composes existing information; it never decides whether
    // replacement should happen.
    function reviewPublicationArchiveReplacement() {
        const outcome = publicationArchiveInspectionOutcome.value;
        if (!outcome || outcome.outcome !== PublicationObservationArchiveInspectionOutcome.INSPECTED) return;
        const externalArchive = PublicationObservationArchive.fromJSON(JSON.parse(publicationArchiveInspectionText.value.trim()));
        publicationArchiveReplacementReviewResult.value = describePublicationObservationArchiveReplacementReview(
            publicationObservationArchive.value,
            externalArchive
        );
    }

    function cancelPublicationArchiveReplacementReview() {
        publicationArchiveReplacementReviewResult.value = null;
    }

    // Replaces through the existing import path, re-validating the reviewed
    // text rather than trusting the review.
    function confirmPublicationArchiveReplacementFromReview() {
        const outcome = importPublicationObservationArchive(publicationArchiveInspectionText.value.trim());
        if (!outcome || outcome.outcome !== PublicationObservationArchiveImportOutcome.IMPORTED) return;
        publicationObservationArchive.value = recordPublicationObservationArchiveImport(outcome.archive, { importedAt: new Date() });
        persistPublicationObservationArchive();
        publicationArchiveReplacementReviewResult.value = null;
        publicationArchiveDifferenceResult.value = null;
        showPublicationArchiveInspectionForm.value = false;
        publicationArchiveInspectionText.value = '';
    }

    return {
        publicationObservationArchive, publicationObservationArchiveExpanded,
        persistPublicationObservationArchive, archivePublishIpfsRecord, archiveIpfsVerificationObservation,
        archiveBitcoinBroadcast, archiveBitcoinConfirmationObservation, archiveBitcoinContentProofObservation,
        createBitcoinAnchorPublicationRecordUseCase, archiveBitcoinAnchorPublicationRecord,
        archiveBaseTransactionInclusionObservation, createBaseAnchorPublicationRecordUseCase,
        archiveBaseAnchorPublicationRecord, publicationObservationArchiveView,
        publicationObservationArchiveProvenanceView, publicationObservationArchiveFingerprintView,
        archiveFingerprintCopied, copyArchiveFingerprint, archiveFingerprintComparisonInput,
        archiveFingerprintComparisonResult, onArchiveFingerprintComparisonInputChanged,
        compareArchiveFingerprint, togglePublicationObservationArchive, clearPublicationObservationArchive,
        publicationArchiveExportedPackage, exportPublicationArchive, showPublicationArchiveImportForm,
        publicationArchiveImportText, togglePublicationArchiveImportForm, onPublicationArchiveImportFileChosen,
        publicationArchiveImportOutcome, publicationArchiveImportPreview, confirmPublicationArchiveImport,
        showPublicationArchiveInspectionForm, publicationArchiveInspectionText,
        publicationArchiveDifferenceResult, publicationArchiveReplacementReviewResult,
        invalidatePublicationArchiveDifference, togglePublicationArchiveInspectionForm,
        onPublicationArchiveInspectionFileChosen, publicationArchiveInspectionOutcome,
        comparePublicationArchiveDifference, publicationArchiveDifferenceCollectionRows,
        reviewPublicationArchiveReplacement, cancelPublicationArchiveReplacementReview,
        confirmPublicationArchiveReplacementFromReview
    };
}
