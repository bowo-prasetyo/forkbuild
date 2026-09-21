import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { RoleAwareProviderResolver } from './RoleAwareProviderResolver.js';
import { ResolvePreferredRoleProviderUseCase } from './ResolvePreferredRoleProviderUseCase.js';
import { PreferredPublicationAnchorCreationCoordinator } from './PreferredPublicationAnchorCreationCoordinator.js';

// Preferred Proof & Anchoring Provider Creation Integration.
//
// The PROOF_AND_ANCHORING mirror of application/
// CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js (0.9.299) —
// wires an already-constructed application/
// PublicationAnchorCreationCoordinator.js (0.8.11) and its own
// `publisherRegistry` (application/ExternalAnchorPublisherRegistry.js,
// already built by application/CreateExternalPublicationAnchorOrchestratorUseCase.js)
// into a real application/RoleAwareProviderResolver.js +
// application/ResolvePreferredRoleProviderUseCase.js pair, and returns a
// PreferredPublicationAnchorCreationCoordinator — the identical
// "composition-root wires it, ui/ never imports the internals directly"
// shape the CONTENT-role use case already established.
//
// `proofRegistry` MUST be the SAME ExternalAnchorPublisherRegistry instance
// already passed to `publicationAnchorCreationCoordinator`'s own underlying
// application/CreateExternalPublicationAnchorUseCase.js — never a second,
// disconnected registry. That is what guarantees a RESOLVED preference's
// own `providerKey` is always an anchorType the wrapped coordinator can
// also look up successfully; two independently-populated registries could
// drift and report RESOLVED for a key the actual anchor-creation pipeline
// then refuses.
//
// CONTENT AND DISCOVERY ARE STRUCTURALLY REQUIRED, NEVER OPERATIONALLY
// CONSULTED — the identical restraint application/
// CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js's own header
// already documents, one role over. application/RoleAwareProviderResolver.js
// 's own constructor requires one keyed registry per RoleProviderRole; this
// class only ever resolves `RoleProviderRole.PROOF_AND_ANCHORING` (see
// application/PreferredPublicationAnchorCreationCoordinator.js's own
// header), so `discoveryRegistry`/`contentRegistry` are satisfied here with
// a minimal, inert stand-in — `{ get: () => null }` — never queried by
// anything this file returns.
//
// `preferenceStore` defaults to a fresh `RoleProviderPreferenceStore`
// (0.9.294), which itself defaults to storage/LocalStorageProvider.js — the
// same default every other unconfigured RoleProviderPreferenceStore in this
// codebase already takes. A caller wanting a shared instance (e.g. the SAME
// store ui/main.js already threads through the CONTENT and
// ANNOUNCEMENT_AND_DISCOVERY preference chains, so all three roles persist
// under the one `role-provider-preference:by-role` storage key) passes its
// own.
export class CreatePreferredPublicationAnchorCreationCoordinatorUseCase {
    execute({ publicationAnchorCreationCoordinator, proofRegistry, preferenceStore = new RoleProviderPreferenceStore() } = {}) {
        if (!publicationAnchorCreationCoordinator || typeof publicationAnchorCreationCoordinator.create !== 'function') {
            throw new Error('CreatePreferredPublicationAnchorCreationCoordinatorUseCase: a PublicationAnchorCreationCoordinator is required');
        }
        if (!proofRegistry || typeof proofRegistry.get !== 'function') {
            throw new Error('CreatePreferredPublicationAnchorCreationCoordinatorUseCase: an ExternalAnchorPublisherRegistry is required');
        }

        // Never queried — see this file's own header, "Content and
        // Discovery are structurally required, never operationally
        // consulted."
        const inertRegistry = { get: () => null };

        const resolver = new RoleAwareProviderResolver({
            preferenceStore,
            discoveryRegistry: inertRegistry,
            contentRegistry: inertRegistry,
            proofRegistry
        });
        const resolvePreferredRoleProviderUseCase = new ResolvePreferredRoleProviderUseCase({ preferenceStore, resolver });
        const coordinator = new PreferredPublicationAnchorCreationCoordinator(
            publicationAnchorCreationCoordinator, resolvePreferredRoleProviderUseCase
        );

        return { coordinator, preferenceStore, resolver, resolvePreferredRoleProviderUseCase };
    }
}
