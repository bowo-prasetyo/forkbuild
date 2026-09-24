import { describeWorldEncounterSelectionOutcomeFromRegistry } from '../../../application/WorldEncounterSelectionOutcome.js';
import { describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry } from '../../../application/DecentralizedWorldEncounterLeadSelection.js';
import { describeWorldEncounterPresentationSourceFamily, WorldEncounterPresentationSourceFamily } from '../../../application/WorldEncounterPresentation.js';
import { describeWorldEncounterMaterialLoadStatusLabel, describeWorldEncounterMaterialVerificationStatusLabel } from '../../../application/WorldEncounterMaterialInspectionView.js';
import { describeSnapshotResolutionOutcomeLabel, describeSnapshotAttributionOutcomeLabel } from '../../../application/SnapshotOutcomeInspectionView.js';

// WorldEncounterCanvas methods: selection and decentralized-lead outcomes, and their labels.
// Spread into the component's `methods`, so `this` is the component instance.

// Field-by-field comparison of two resolvedEncounterSelection-shaped values
// (or null), so an unrelated registry notification doesn't reload material.
export function resolvedEncounterSelectionsEqual(previousResolvedSelection, nextResolvedSelection) {
    if (previousResolvedSelection === nextResolvedSelection) {
        return true;
    }
    if (!previousResolvedSelection || !nextResolvedSelection) {
        return false;
    }
    return previousResolvedSelection.kind === nextResolvedSelection.kind
        && previousResolvedSelection.objectId === nextResolvedSelection.objectId
        && previousResolvedSelection.origin === nextResolvedSelection.origin;
}

// Presentation-only lookups for describeSelectionOriginLabel()/
// describeDecentralizedLeadUriLabel(), following
// ui/views/DecentralizedPublicationsView.js's STORAGE_TYPE_LABELS/shortId()/
// shortHash() convention without importing from another view.
const CONTENT_URI_SCHEME_LABELS = {
    ar: 'Arweave',
    ipfs: 'IPFS'
};

function shortIdentityId(identityId) {
    if (typeof identityId !== 'string' || identityId.length === 0) {
        return 'an unknown identity';
    }
    return identityId.length > 14 ? identityId.slice(-14) : identityId;
}

function shortContentHash(contentHash) {
    if (typeof contentHash !== 'string' || contentHash.length === 0) {
        return 'an unknown hash';
    }
    return contentHash.length > 18 ? `${contentHash.slice(0, 10)}…${contentHash.slice(-6)}` : contentHash;
}

export const selectionOutcomeMethods = {
    // The only writer of `selectionOutcome` and the only caller of
    // describeWorldEncounterSelectionOutcomeFromRegistry() for the primary
    // selection. Null without a selection or `registry`.
    refreshSelectionOutcome() {
        // Captured before `selectionOutcome` changes, to detect a genuine change.
        const previousResolvedSelection = this.resolvedEncounterSelection;

        if (!this.selectedEncounter || !this.registry) {
            this.selectionOutcome = null;
        } else {
            this.selectionOutcome = describeWorldEncounterSelectionOutcomeFromRegistry({
                selectedEncounter: this.selectedEncounter,
                registry: this.registry
            });
        }
        // Only a genuine change to the resolved selection reloads material; an
        // unrelated registry notification keeps the current `materialInspection`.
        //
        // A genuine change first clears `materialInspection`, so the previous
        // selection's material (and `distributablePublication`) can't be acted on
        // before the new one resolves. It also resets the Distribute/Snapshot
        // action state and bumps their request counters, as selectEncounter() does:
        // this path also runs from the registry subscription with no click (e.g. a
        // second source turning RESOLVED into AMBIGUOUS), and a late result from the
        // old resolution must not be written.
        if (!resolvedEncounterSelectionsEqual(previousResolvedSelection, this.resolvedEncounterSelection)) {
            this.materialInspection = null;
            this.distributionExecuting = false;
            this.distributionError = null;
            this.distributionRequestId += 1;
            this.snapshotDistributionExecuting = false;
            this.snapshotDistributionError = null;
            this.snapshotDistributionResult = null;
            this.snapshotDistributionRequestId += 1;
            this.distributionDialogOpen = false;
            this.snapshotDiscoveryExecuting = false;
            this.snapshotDiscoveryError = null;
            this.snapshotDiscoveryResult = null;
            this.snapshotAttributionResult = null;
            this.snapshotDiscoveryRequestId += 1;
            this.refreshMaterialInspection();
        }
    },
    // The only writer of `resolvedSelectionChoice`: stores one of the current
    // candidates verbatim, with no ranking.
    chooseSelectionOrigin(candidate) {
        this.resolvedSelectionChoice = candidate;
        // An explicit choice can change the resolved selection.
        this.refreshMaterialInspection();
    },
    // The only writer of `decentralizedLeadOutcome` and the only caller of
    // describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry().
    // Null without a selection or lead registry. Unlike refreshSelectionOutcome()
    // it never triggers material inspection itself; each call site does that
    // once, after both outcomes are current, so no source is loaded twice.
    refreshDecentralizedLeadOutcome() {
        if (!this.selectedEncounter || !this.worldDiscoveryLeadRegistry) {
            this.decentralizedLeadOutcome = null;
        } else {
            // A failing query (e.g. unreadable local storage) means no
            // evidence, never a broken selection — exactly the
            // UNAVAILABLE outcome an empty array already produces.
            let associations = this.decentralizedLeadAssociations;
            if (this.leadAssociationsQuery) {
                try {
                    associations = this.leadAssociationsQuery();
                } catch (error) {
                    console.error('Lead association evidence could not be read:', error);
                    associations = [];
                }
            }
            this.decentralizedLeadOutcome = describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry({
                selectedEncounter: this.selectedEncounter,
                registry: this.worldDiscoveryLeadRegistry,
                associations
            });
        }
    },
    // The only writer of `resolvedLeadChoice`; mirrors chooseSelectionOrigin().
    chooseDecentralizedLead(candidate) {
        this.resolvedLeadChoice = candidate;
        this.refreshMaterialInspection();
    },
    // Friendly label for a WorldDiscoverySource origin in the "Choose Source"/
    // "Source: …" panel, instead of raw 'local', 'peer:' + identityId, or
    // 'snapshot:<contentHash>:<publicationId>' strings. Reuses
    // describeWorldEncounterPresentationSourceFamily() for the family, and
    // disambiguates several candidates of one family with a short peer id or
    // content hash (the DecentralizedPublicationsView.js shortId()/shortHash()
    // convention). LOCAL is never truncated (there is at most one). An
    // unrecognized origin renders verbatim.
    describeSelectionOriginLabel(origin) {
        const family = describeWorldEncounterPresentationSourceFamily(origin);
        if (family === WorldEncounterPresentationSourceFamily.LOCAL) {
            return 'Local';
        }
        if (family === WorldEncounterPresentationSourceFamily.PEER) {
            const identityId = origin.slice('peer:'.length);
            return `Peer ${shortIdentityId(identityId)}`;
        }
        if (family === WorldEncounterPresentationSourceFamily.SNAPSHOT) {
            const contentHash = origin.slice('snapshot:'.length).split(':')[0];
            return `Snapshot ${shortContentHash(contentHash)}`;
        }
        return origin;
    },
    // Friendly label for a lead's core/ContentReference.js uri ('ipfs://' + CID or
    // 'ar://' + transactionId): STORAGE_TYPE_LABELS for the scheme plus the
    // truncated identifier. Unrecognized shapes render verbatim.
    describeDecentralizedLeadUriLabel(uri) {
        if (typeof uri !== 'string' || uri.length === 0) {
            return uri;
        }
        const schemeSeparator = uri.indexOf('://');
        if (schemeSeparator === -1) {
            return shortContentHash(uri);
        }
        const scheme = uri.slice(0, schemeSeparator);
        const identifier = uri.slice(schemeSeparator + 3);
        const schemeLabel = CONTENT_URI_SCHEME_LABELS[scheme] || scheme;
        return `${schemeLabel} ${shortContentHash(identifier)}`;
    },
    // Template-callable wrappers around
    // application/WorldEncounterMaterialInspectionView.js (the runtime-compiled
    // template can't call module imports). No logic of their own.
    describeMaterialLoadStatusLabel(status) {
        return describeWorldEncounterMaterialLoadStatusLabel(status);
    },
    describeMaterialVerificationStatusLabel(status) {
        return describeWorldEncounterMaterialVerificationStatusLabel(status);
    },
    // Same wrappers for application/SnapshotOutcomeInspectionView.js.
    describeSnapshotResolutionLabel(outcome) {
        return describeSnapshotResolutionOutcomeLabel(outcome);
    },
    describeSnapshotAttributionLabel(outcome) {
        return describeSnapshotAttributionOutcomeLabel(outcome);
    },
};
