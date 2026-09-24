import { ref, reactive } from 'vue';
import {
    CreatePublicationReferenceRecordUseCase
} from '../../../application/CreatePublicationReferenceRecordUseCase.js';
import { sortOptionsByLabel } from '../../../utils/sortOptionsByLabel.js';
import { shortId } from './presentation.js';
import {
    describePublicationReferenceRecordHistory
} from '../../../application/PublicationReferenceRecordHistoryView.js';
import { reconstructPublicationReferenceGraph } from '../../../application/PublicationReferenceGraphView.js';

// Publication references: recording that one known publication references
// another (into the archive), and browsing the resulting reference graph.
export function usePublicationReferences({
    persistPublicationObservationArchive, publicationObservationArchive
}) {
    // References are recorded only by an explicit "Record Reference" click,
    // never from another flow. Both sides are picked from identities this
    // archive already holds durably (via
    // toBlockchainPublicationIdentity()), never typed by hand.
    const publicationReferencesExpanded = ref(false);
    const publicationReferenceSourceKey = ref('');
    const publicationReferenceReferencedKey = ref('');
    const publicationReferenceError = ref('');

    function togglePublicationReferences() {
        publicationReferencesExpanded.value = !publicationReferencesExpanded.value;
    }

    // key is blockchain:chainReference, the pair
    // BlockchainPublicationIdentity.sameAs() treats as identity (never
    // contentHash).
    function knownPublicationIdentityOptions() {
        const bitcoinOptions = publicationObservationArchive.value.bitcoinAnchorPublicationRecords.map((record) => {
            const identity = record.toBlockchainPublicationIdentity();
            return { key: `${identity.blockchain}:${identity.chainReference}`, identity, label: `Bitcoin — ${shortId(identity.chainReference)} — content ${shortId(identity.contentHash)}` };
        });
        const baseOptions = publicationObservationArchive.value.baseAnchorPublicationRecords.map((record) => {
            const identity = record.toBlockchainPublicationIdentity();
            return { key: `${identity.blockchain}:${identity.chainReference}`, identity, label: `Base — ${shortId(identity.chainReference)} — content ${shortId(identity.contentHash)}` };
        });
        return Object.freeze(sortOptionsByLabel([...bitcoinOptions, ...baseOptions]));
    }

    function findKnownPublicationIdentity(key) {
        const match = knownPublicationIdentityOptions().find((option) => option.key === key);
        return match ? match.identity : null;
    }

    const createPublicationReferenceRecordUseCase = new CreatePublicationReferenceRecordUseCase();

    // PublicationReferenceRecord's constructor is the only validation; its
    // error is shown as a message.
    function recordPublicationReference() {
        publicationReferenceError.value = '';
        const sourceIdentity = findKnownPublicationIdentity(publicationReferenceSourceKey.value);
        const referencedIdentity = findKnownPublicationIdentity(publicationReferenceReferencedKey.value);
        if (!sourceIdentity || !referencedIdentity) {
            publicationReferenceError.value = 'Choose a source and a referenced publication first.';
            return;
        }
        try {
            publicationObservationArchive.value = createPublicationReferenceRecordUseCase.execute(publicationObservationArchive.value, {
                sourcePublicationIdentity: sourceIdentity,
                referencedPublicationIdentity: referencedIdentity
            });
            persistPublicationObservationArchive();
            publicationReferenceSourceKey.value = '';
            publicationReferenceReferencedKey.value = '';
        } catch (error) {
            publicationReferenceError.value = error.message;
        }
    }

    function publicationReferenceRecordHistoryView() {
        return describePublicationReferenceRecordHistory(publicationObservationArchive.value.publicationReferenceRecords);
    }

    // Read-only graph of the recorded references. No network access.
    const publicationReferenceGraphExpanded = ref(false);
    const publicationReferenceGraphNodeExpanded = reactive({});

    function togglePublicationReferenceGraph() {
        publicationReferenceGraphExpanded.value = !publicationReferenceGraphExpanded.value;
    }

    function publicationReferenceGraphView() {
        return reconstructPublicationReferenceGraph(publicationObservationArchive.value);
    }

    function publicationReferenceGraphNodeKey(node) {
        return `${node.identity.blockchain}:${node.identity.chainReference}`;
    }

    function togglePublicationReferenceGraphNode(node) {
        const key = publicationReferenceGraphNodeKey(node);
        publicationReferenceGraphNodeExpanded[key] = !publicationReferenceGraphNodeExpanded[key];
    }

    function isPublicationReferenceGraphNodeExpanded(node) {
        return Boolean(publicationReferenceGraphNodeExpanded[publicationReferenceGraphNodeKey(node)]);
    }

    return {
        publicationReferencesExpanded, publicationReferenceSourceKey, publicationReferenceReferencedKey,
        publicationReferenceError, togglePublicationReferences, knownPublicationIdentityOptions,
        findKnownPublicationIdentity, createPublicationReferenceRecordUseCase, recordPublicationReference,
        publicationReferenceRecordHistoryView, publicationReferenceGraphExpanded,
        publicationReferenceGraphNodeExpanded, togglePublicationReferenceGraph, publicationReferenceGraphView,
        publicationReferenceGraphNodeKey, togglePublicationReferenceGraphNode,
        isPublicationReferenceGraphNodeExpanded
    };
}
