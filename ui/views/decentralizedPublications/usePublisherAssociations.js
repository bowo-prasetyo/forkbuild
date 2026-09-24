import { ref } from 'vue';
import {
    CreatePublisherPublicationAssociationRecordUseCase
} from '../../../application/publisher/CreatePublisherPublicationAssociationRecordUseCase.js';
import {
    describePublisherPublicationAssociationRecordHistory
} from '../../../application/publisher/PublisherPublicationAssociationRecordHistoryView.js';
import { sortLabels } from '../../../utils/sortOptionsByLabel.js';
import {
    reconstructDistinctPublisherIdentifiers, reconstructPublisherAssociatedPublications
} from '../../../application/publisher/PublisherAssociationView.js';
import { PublisherIdentityRecord } from '../../../application/publisher/PublisherIdentityRecord.js';

// Publisher-publication associations: recording which publisher identifier a
// known publication is associated with, and the per-publisher profile view.
export function usePublisherAssociations({
    findKnownPublicationIdentity, persistPublicationObservationArchive, publicationObservationArchive
}) {
    // Associations are recorded only by an explicit "Add Publication"
    // click. A publisher identifier is a bare label, not a cryptographic
    // identity, and is never normalized ("Publisher A" and "publisher a"
    // differ).
    const publisherAssociationsExpanded = ref(false);
    const publisherAssociationPublisherId = ref('');
    const publisherAssociationPublicationKey = ref('');
    const publisherAssociationError = ref('');
    const publisherAssociationSelectedPublisherId = ref('');

    function togglePublisherAssociations() {
        publisherAssociationsExpanded.value = !publisherAssociationsExpanded.value;
    }

    function publisherPublicationAssociationRecordHistoryView() {
        return describePublisherPublicationAssociationRecordHistory(publicationObservationArchive.value.publisherPublicationAssociationRecords);
    }

    function distinctPublisherIdentifiersView() {
        return sortLabels(reconstructDistinctPublisherIdentifiers(publicationObservationArchive.value));
    }

    const createPublisherPublicationAssociationRecordUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

    // The record constructors are the only validation; their errors are
    // shown as a message.
    function recordPublisherAssociation() {
        publisherAssociationError.value = '';
        const publicationIdentity = findKnownPublicationIdentity(publisherAssociationPublicationKey.value);
        if (!publisherAssociationPublisherId.value.trim() || !publicationIdentity) {
            publisherAssociationError.value = 'Type a publisher identifier and choose a publication first.';
            return;
        }
        try {
            publicationObservationArchive.value = createPublisherPublicationAssociationRecordUseCase.execute(publicationObservationArchive.value, {
                publisherId: publisherAssociationPublisherId.value,
                publicationIdentity
            });
            persistPublicationObservationArchive();
            publisherAssociationPublisherId.value = '';
            publisherAssociationPublicationKey.value = '';
        } catch (error) {
            publisherAssociationError.value = error.message;
        }
    }

    // null with no publisher selected; never guessed from a shared content
    // hash or wallet.
    function publisherAssociationProfileView() {
        if (!publisherAssociationSelectedPublisherId.value) return null;
        return reconstructPublisherAssociatedPublications(
            publicationObservationArchive.value,
            new PublisherIdentityRecord({ publisherId: publisherAssociationSelectedPublisherId.value })
        );
    }

    return {
        publisherAssociationsExpanded, publisherAssociationPublisherId, publisherAssociationPublicationKey,
        publisherAssociationError, publisherAssociationSelectedPublisherId, togglePublisherAssociations,
        publisherPublicationAssociationRecordHistoryView, distinctPublisherIdentifiersView,
        createPublisherPublicationAssociationRecordUseCase, recordPublisherAssociation,
        publisherAssociationProfileView
    };
}
