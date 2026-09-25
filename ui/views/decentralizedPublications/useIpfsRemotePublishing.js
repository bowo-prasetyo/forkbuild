import {
    recallIpfsRemotePublishingCredential, rememberIpfsRemotePublishingCredential
} from '../../../application/ipfs/IpfsRemotePublishingCredentialMemory.js';
import { IpfsRemotePublishingConfiguration } from '../../../application/ipfs/IpfsRemotePublishingConfiguration.js';
import { IpfsRemotePublicationState } from '../../../application/ipfs/IpfsRemotePublicationState.js';
import {
    describeIpfsRemotePublishingConfiguration, describeIpfsRemotePublication
} from '../../../application/ipfs/IpfsRemotePublicationView.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../../../application/ipfs/IpfsPublicationRecord.js';
import { appendIpfsPublicationRecordHistoryEntry } from '../../../application/ipfs/IpfsPublicationRecordHistory.js';
import {
    IPFS_REMOTE_PUBLICATION_BADGE_CLASSES, IPFS_PUBLICATION_CONTENT_VERIFICATION_BADGE_CLASSES
} from './presentation.js';
import {
    IpfsPublicationContentVerificationCoordinatorState
} from '../../../application/ipfs/IpfsPublicationContentVerificationCoordinatorState.js';
import {
    describeIpfsPublicationContentVerification
} from '../../../application/ipfs/IpfsPublicationContentVerificationView.js';
import { describeIpfsPublicationRecordHistory } from '../../../application/ipfs/IpfsPublicationRecordHistoryView.js';
import {
    appendIpfsPublicationContentVerificationHistoryEntry, latestIpfsPublicationContentVerification
} from '../../../application/ipfs/IpfsPublicationContentVerificationHistory.js';
import {
    describeIpfsPublicationContentVerificationHistory
} from '../../../application/ipfs/IpfsPublicationContentVerificationHistoryView.js';
import {
    describeIpfsPublicationObservationTimeline, IpfsPublicationObservationTimelineEntryKind
} from '../../../application/ipfs/IpfsPublicationObservationTimelineView.js';

// Remote IPFS publishing: the pinning-service configuration form, publishing
// an entry's content, verifying what was published, and the per-entry record,
// verification and observation histories.
export function useIpfsRemotePublishing({
    archiveIpfsVerificationObservation, archivePublishIpfsRecord,
    ipfsPublicationContentVerificationCoordinator, ipfsRemotePublicationCoordinator, publicationContentStore,
    snapshotDiscoveryPublisher
}) {
    // Opening the form only seeds draft fields; nothing is configured until
    // "Save Configuration". Reopening for an existing configuration always
    // blanks the credential (a saved credential is never shown again); a
    // new entry's form may prefill it from the tab-lifetime, in-memory
    // credential memory.
    function openIpfsRemotePublishingConfigureForm(entry) {
        const existing = entry.ipfsRemotePublishingConfiguration;
        entry.ipfsRemotePublishingDraft = {
            endpoint: existing ? existing.endpoint : '',
            credential: existing ? '' : (recallIpfsRemotePublishingCredential() || ''),
            requestField: existing ? (existing.requestField || '') : '',
            responseField: existing ? (existing.responseField || '') : ''
        };
        entry.ipfsRemotePublishingConfigureFormOpen = true;
    }

    function cancelIpfsRemotePublishingConfigureForm(entry) {
        entry.ipfsRemotePublishingConfigureFormOpen = false;
    }

    function toggleIpfsRemotePublishingConfigureForm(entry) {
        if (entry.ipfsRemotePublishingConfigureFormOpen) {
            cancelIpfsRemotePublishingConfigureForm(entry);
        } else {
            openIpfsRemotePublishingConfigureForm(entry);
        }
    }

    // The only place a remote IPFS configuration is built. A new
    // configuration clears the previous publication outcome.
    function saveIpfsRemotePublishingConfiguration(entry) {
        const draft = entry.ipfsRemotePublishingDraft;
        try {
            entry.ipfsRemotePublishingConfiguration = new IpfsRemotePublishingConfiguration({
                endpoint: draft.endpoint,
                credential: draft.credential || null,
                requestField: draft.requestField || null,
                responseField: draft.responseField || null
            });
        } catch (error) {
            entry.ipfsRemotePublicationOutcome = { state: IpfsRemotePublicationState.FAILED, published: false, contentHash: null, locator: null, endpoint: null, publishedAt: null, reason: error.message };
            entry.ipfsPublicationRecord = null;
            entry.ipfsPublicationContentVerification = null;
            // The record history is kept on purpose; see
            // clearIpfsRemotePublishingConfiguration().
            return;
        }
        entry.ipfsRemotePublicationOutcome = null;
        entry.ipfsPublicationRecord = null;
        entry.ipfsPublicationContentVerification = null;
        entry.ipfsRemotePublishingConfigureFormOpen = false;
        // Tab-lifetime, in-memory only.
        rememberIpfsRemotePublishingCredential(draft.credential);
    }

    // Discards the configuration and the current publication/verification
    // state. The record history is kept: past publications stay facts
    // whatever provider is configured next.
    function clearIpfsRemotePublishingConfiguration(entry) {
        entry.ipfsRemotePublishingConfiguration = null;
        entry.ipfsRemotePublicationOutcome = null;
        entry.ipfsPublicationRecord = null;
        entry.ipfsPublicationContentVerification = null;
        entry.ipfsRemotePublishingConfigureFormOpen = false;
    }

    function ipfsRemotePublishingConfigurationView(entry) {
        return describeIpfsRemotePublishingConfiguration(entry.ipfsRemotePublishingConfiguration);
    }

    // Only on an explicit click, never on save. Bytes are integrity-checked
    // against the claimed hash and resolved the same way
    // CreateExternalSnapshotPlacementUseCase does, without cataloging a
    // placement. A thrown error becomes FAILED.
    async function publishToRemoteIpfs(entry) {
        if (!ipfsRemotePublicationCoordinator || !publicationContentStore) return;
        const configuration = entry.ipfsRemotePublishingConfiguration;
        if (!configuration) return;

        entry.ipfsRemotePublicationOutcome = { state: IpfsRemotePublicationState.PUBLISHING, published: false, contentHash: null, locator: null, endpoint: null, publishedAt: null, reason: null };
        // A new publish starts unverified: clear the previous record and
        // verification.
        entry.ipfsPublicationRecord = null;
        entry.ipfsPublicationContentVerification = null;
        entry.ipfsRemoteSnapshotAnnouncement = null;
        try {
            const bytes = await publicationContentStore.get(entry.publication.contentReference);
            if (bytes === null || bytes === undefined) {
                throw new Error('local snapshot bytes are not available — refusing to publish it externally');
            }
            const isValid = entry.publication.contentReference.verify(bytes);
            if (!isValid) {
                throw new Error('local snapshot integrity check failed — refusing to publish it externally');
            }
            entry.ipfsRemotePublicationOutcome = await ipfsRemotePublicationCoordinator.publish({ bytes, configuration });
            // Build the record only from a real PUBLISHED outcome.
            if (entry.ipfsRemotePublicationOutcome.state === IpfsRemotePublicationState.PUBLISHED) {
                entry.ipfsPublicationRecord = new IpfsPublicationRecord({
                    contentHash: entry.ipfsRemotePublicationOutcome.contentHash,
                    locator: entry.ipfsRemotePublicationOutcome.locator,
                    publishedAt: entry.ipfsRemotePublicationOutcome.publishedAt,
                    publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
                });
                // Also append to the history, even for an identical
                // contentHash: each publish is its own record.
                entry.ipfsPublicationRecordHistory = appendIpfsPublicationRecordHistoryEntry(
                    entry.ipfsPublicationRecordHistory, entry.ipfsPublicationRecord
                );
                // And archive it durably.
                archivePublishIpfsRecord(entry, entry.ipfsPublicationRecordHistory.length - 1, entry.ipfsPublicationRecord);

                // Announce the published snapshot on Nostr through the same
                // snapshotDiscoveryPublisher "Distribute Snapshot" uses.
                // Called directly rather than through
                // SnapshotDistributionCommand, which would upload the
                // already-pinned bytes again. No publicationId: an envelope
                // needs a publicationId and a claimed position together or
                // neither, and there is no position here. A Nostr failure
                // never turns the PUBLISHED result into FAILED, hence this
                // inner try/catch.
                if (snapshotDiscoveryPublisher) {
                    try {
                        const announcement = await snapshotDiscoveryPublisher.publish({
                            contentHash: entry.ipfsRemotePublicationOutcome.contentHash,
                            locator: entry.ipfsRemotePublicationOutcome.locator,
                            storage: 'ipfs'
                        });
                        entry.ipfsRemoteSnapshotAnnouncement = { announced: announcement !== null, announcement, error: null };
                    } catch (error) {
                        entry.ipfsRemoteSnapshotAnnouncement = { announced: false, announcement: null, error: error.message };
                    }
                }
            }
        } catch (error) {
            entry.ipfsRemotePublicationOutcome = { state: IpfsRemotePublicationState.FAILED, published: false, contentHash: null, locator: null, endpoint: null, publishedAt: null, reason: error.message };
        }
    }

    function ipfsRemotePublicationView(entry) {
        return describeIpfsRemotePublication(entry.ipfsRemotePublicationOutcome);
    }

    function ipfsRemotePublicationBadgeClass(entry) {
        return IPFS_REMOTE_PUBLICATION_BADGE_CLASSES[ipfsRemotePublicationView(entry).state] || 'peer-badge--pending';
    }

    function isIpfsRemotePublishing(entry) {
        return ipfsRemotePublicationView(entry).state === IpfsRemotePublicationState.PUBLISHING;
    }

    // Only on an explicit click. Verifies entry.ipfsPublicationRecord
    // itself, never a CID/hash rebuilt from what's on screen, so one
    // publication's locator is never checked against another's hash. A
    // thrown error becomes FAILED.
    async function verifyIpfsPublicationContent(entry) {
        if (!ipfsPublicationContentVerificationCoordinator) return;
        const record = entry.ipfsPublicationRecord;
        if (!record) return;

        entry.ipfsPublicationContentVerification = {
            state: IpfsPublicationContentVerificationCoordinatorState.VERIFYING,
            contentHash: null, locator: null, reason: null, observedAt: null
        };
        try {
            entry.ipfsPublicationContentVerification = await ipfsPublicationContentVerificationCoordinator.verify(record);
        } catch (error) {
            entry.ipfsPublicationContentVerification = {
                state: IpfsPublicationContentVerificationCoordinatorState.FAILED,
                contentHash: null, locator: null, reason: error.message, observedAt: new Date()
            };
        }
    }

    function ipfsPublicationContentVerificationView(entry) {
        return describeIpfsPublicationContentVerification(entry.ipfsPublicationContentVerification);
    }

    function ipfsPublicationContentVerificationBadgeClass(entry) {
        return IPFS_PUBLICATION_CONTENT_VERIFICATION_BADGE_CLASSES[ipfsPublicationContentVerificationView(entry).state] || 'peer-badge--pending';
    }

    function isVerifyingIpfsPublicationContent(entry) {
        return ipfsPublicationContentVerificationView(entry).state === IpfsPublicationContentVerificationCoordinatorState.VERIFYING;
    }

    function ipfsPublicationContentVerifyButtonLabel(entry) {
        if (isVerifyingIpfsPublicationContent(entry)) return 'Verifying…';
        return entry.ipfsPublicationContentVerification ? 'Verify Again' : 'Verify IPFS Content';
    }

    function ipfsPublicationRecordHistoryView(entry) {
        return describeIpfsPublicationRecordHistory(entry.ipfsPublicationRecordHistory);
    }

    function toggleIpfsPublicationRecordHistory(entry) {
        entry.ipfsPublicationRecordHistoryExpanded = !entry.ipfsPublicationRecordHistoryExpanded;
    }

    // Inspect is a local read of one record; verifying is a separate
    // action.
    function toggleIpfsPublicationRecordInspection(entry, index) {
        entry.ipfsPublicationRecordInspectionExpanded[index] = !entry.ipfsPublicationRecordInspectionExpanded[index];
    }

    function isIpfsPublicationRecordInspectionExpanded(entry, index) {
        return Boolean(entry.ipfsPublicationRecordInspectionExpanded[index]);
    }

    // Verifies exactly the record at this history index, never one rebuilt
    // from the screen or the "current" record. The outcome (including a
    // thrown-error FAILED) is appended to that record's own history; the
    // in-flight flag is never recorded.
    async function verifyIpfsPublicationRecordHistoryEntry(entry, index) {
        if (!ipfsPublicationContentVerificationCoordinator) return;
        const record = entry.ipfsPublicationRecordHistory[index];
        if (!record) return;

        entry.ipfsPublicationRecordVerifyingByRecordIndex[index] = true;
        let outcome;
        try {
            outcome = await ipfsPublicationContentVerificationCoordinator.verify(record);
        } catch (error) {
            outcome = {
                state: IpfsPublicationContentVerificationCoordinatorState.FAILED,
                contentHash: null, locator: null, reason: error.message, observedAt: new Date()
            };
        }
        entry.ipfsPublicationRecordVerifyingByRecordIndex[index] = false;
        entry.ipfsPublicationVerificationHistoriesByRecordIndex[index] = appendIpfsPublicationContentVerificationHistoryEntry(
            entry.ipfsPublicationVerificationHistoriesByRecordIndex[index], outcome
        );
        // And archive it durably.
        archiveIpfsVerificationObservation(entry, index, outcome);
    }

    function isVerifyingIpfsPublicationRecordHistoryEntry(entry, index) {
        return Boolean(entry.ipfsPublicationRecordVerifyingByRecordIndex[index]);
    }

    function ipfsPublicationRecordVerificationHistoryView(entry, index) {
        return describeIpfsPublicationContentVerificationHistory(entry.ipfsPublicationVerificationHistoriesByRecordIndex[index]);
    }

    // The newest observation on file for this record (never a live
    // re-check), for the "Latest: …" badge.
    function latestIpfsPublicationRecordVerificationView(entry, index) {
        return describeIpfsPublicationContentVerification(
            latestIpfsPublicationContentVerification(entry.ipfsPublicationVerificationHistoriesByRecordIndex[index])
        );
    }

    function ipfsPublicationRecordVerificationBadgeClass(entry, index) {
        return IPFS_PUBLICATION_CONTENT_VERIFICATION_BADGE_CLASSES[latestIpfsPublicationRecordVerificationView(entry, index).state] || 'peer-badge--pending';
    }

    function ipfsPublicationVerificationEntryBadgeClass(verification) {
        return IPFS_PUBLICATION_CONTENT_VERIFICATION_BADGE_CLASSES[verification.state] || 'peer-badge--pending';
    }

    function ipfsPublicationRecordVerifyButtonLabel(entry, index) {
        if (isVerifyingIpfsPublicationRecordHistoryEntry(entry, index)) return 'Verifying…';
        return ipfsPublicationRecordVerificationHistoryView(entry, index).count > 0 ? 'Verify Again' : 'Verify Content';
    }

    // Only shows the history; never triggers a verification.
    function toggleIpfsPublicationRecordVerificationHistory(entry, index) {
        entry.ipfsPublicationVerificationHistoryExpandedByRecordIndex[index] = !entry.ipfsPublicationVerificationHistoryExpandedByRecordIndex[index];
    }

    function isIpfsPublicationRecordVerificationHistoryExpanded(entry, index) {
        return Boolean(entry.ipfsPublicationVerificationHistoryExpandedByRecordIndex[index]);
    }

    // A chronological read of the publication and verification histories;
    // fetches and appends nothing.
    function ipfsPublicationObservationTimelineView(entry) {
        return describeIpfsPublicationObservationTimeline(
            entry.ipfsPublicationRecordHistory, entry.ipfsPublicationVerificationHistoriesByRecordIndex
        );
    }

    // No refresh or polling: new rows only come from explicit
    // publish/verify actions.
    function toggleIpfsPublicationObservationTimeline(entry) {
        entry.ipfsPublicationObservationTimelineExpanded = !entry.ipfsPublicationObservationTimelineExpanded;
    }

    function ipfsPublicationObservationTimelineEntryBadgeClass(item) {
        if (item.kind !== IpfsPublicationObservationTimelineEntryKind.CONTENT_VERIFICATION) return 'peer-badge--pending';
        return IPFS_PUBLICATION_CONTENT_VERIFICATION_BADGE_CLASSES[item.state] || 'peer-badge--pending';
    }

    return {
        openIpfsRemotePublishingConfigureForm, cancelIpfsRemotePublishingConfigureForm,
        toggleIpfsRemotePublishingConfigureForm, saveIpfsRemotePublishingConfiguration,
        clearIpfsRemotePublishingConfiguration, ipfsRemotePublishingConfigurationView, publishToRemoteIpfs,
        ipfsRemotePublicationView, ipfsRemotePublicationBadgeClass, isIpfsRemotePublishing,
        verifyIpfsPublicationContent, ipfsPublicationContentVerificationView,
        ipfsPublicationContentVerificationBadgeClass, isVerifyingIpfsPublicationContent,
        ipfsPublicationContentVerifyButtonLabel, ipfsPublicationRecordHistoryView,
        toggleIpfsPublicationRecordHistory, toggleIpfsPublicationRecordInspection,
        isIpfsPublicationRecordInspectionExpanded, verifyIpfsPublicationRecordHistoryEntry,
        isVerifyingIpfsPublicationRecordHistoryEntry, ipfsPublicationRecordVerificationHistoryView,
        latestIpfsPublicationRecordVerificationView, ipfsPublicationRecordVerificationBadgeClass,
        ipfsPublicationVerificationEntryBadgeClass, ipfsPublicationRecordVerifyButtonLabel,
        toggleIpfsPublicationRecordVerificationHistory, isIpfsPublicationRecordVerificationHistoryExpanded,
        ipfsPublicationObservationTimelineView, toggleIpfsPublicationObservationTimeline,
        ipfsPublicationObservationTimelineEntryBadgeClass
    };
}
