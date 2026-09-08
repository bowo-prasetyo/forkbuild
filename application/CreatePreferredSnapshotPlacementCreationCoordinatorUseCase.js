import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { RoleAwareProviderResolver } from './RoleAwareProviderResolver.js';
import { ResolvePreferredRoleProviderUseCase } from './ResolvePreferredRoleProviderUseCase.js';
import { PreferredSnapshotPlacementCreationCoordinator } from './PreferredSnapshotPlacementCreationCoordinator.js';

// 0.9.299 — Content Creation Provider Preference Integration.
//
// Wires an already-constructed application/
// SnapshotPlacementCreationCoordinator.js (0.8.25) and its own
// `storeRegistry` (application/SnapshotPlacementStoreRegistry.js,
// already built by application/CreateSnapshotPlacementOrchestratorUseCase.js)
// into a real application/RoleAwareProviderResolver.js +
// application/ResolvePreferredRoleProviderUseCase.js pair, and returns a
// PreferredSnapshotPlacementCreationCoordinator — the identical
// "composition-root wires it, ui/ never imports the internals directly"
// shape application/CreateSnapshotPlacementCreationCoordinatorUseCase.js
// itself already established one milestone earlier.
//
// `contentRegistry` MUST be the SAME SnapshotPlacementStoreRegistry
// instance already passed to `snapshotPlacementCreationCoordinator`'s own
// underlying application/CreateExternalSnapshotPlacementUseCase.js — never
// a second, disconnected registry. That is what guarantees a RESOLVED
// preference's own `providerKey` is always a storage name the wrapped
// coordinator can also look up successfully; two independently-populated
// registries could drift and report RESOLVED for a key the actual
// placement pipeline then refuses.
//
// DISCOVERY AND PROOF ARE STRUCTURALLY REQUIRED, NEVER OPERATIONALLY
// CONSULTED. application/RoleAwareProviderResolver.js's own constructor
// requires one keyed registry per RoleProviderRole — a real, uniform
// per-role Discovery registry does not exist in production yet (0.9.292's
// own Section F, gap #3, still open, still unscheduled — this milestone
// does not build it), and this milestone deliberately excludes any real
// Proof & Anchoring integration. So this file satisfies the resolver's
// own shape check with a minimal, inert stand-in — `{ get: () =>
// null }` — for both roles: something exposing `get(providerKey)`,
// nothing more. This class only ever resolves `RoleProviderRole.CONTENT`
// (see application/PreferredSnapshotPlacementCreationCoordinator.js's own
// header) — `discoveryRegistry`/`proofRegistry` are NEVER queried by
// anything this file returns, and a stored Discovery or Proof preference
// can never reach this seam at all. This is plumbing to satisfy an
// unmodified collaborator's own constructor contract, never a Discovery
// or Proof capability of any kind.
//
// `preferenceStore` defaults to a fresh `RoleProviderPreferenceStore`
// (0.9.294), which itself defaults to storage/LocalStorageProvider.js —
// the same default every other unconfigured RoleProviderPreferenceStore
// in this codebase already takes. A caller wanting a shared instance
// (e.g. one a future settings UI also reads/writes) passes its own.
export class CreatePreferredSnapshotPlacementCreationCoordinatorUseCase {
    execute({ snapshotPlacementCreationCoordinator, contentRegistry, preferenceStore = new RoleProviderPreferenceStore() } = {}) {
        if (!snapshotPlacementCreationCoordinator || typeof snapshotPlacementCreationCoordinator.create !== 'function') {
            throw new Error('CreatePreferredSnapshotPlacementCreationCoordinatorUseCase: a SnapshotPlacementCreationCoordinator is required');
        }
        if (!contentRegistry || typeof contentRegistry.get !== 'function') {
            throw new Error('CreatePreferredSnapshotPlacementCreationCoordinatorUseCase: a SnapshotPlacementStoreRegistry is required');
        }

        // Never queried — see this file's own header, "Discovery and
        // Proof are structurally required, never operationally
        // consulted."
        const inertRegistry = { get: () => null };

        const resolver = new RoleAwareProviderResolver({
            preferenceStore,
            discoveryRegistry: inertRegistry,
            contentRegistry,
            proofRegistry: inertRegistry
        });
        const resolvePreferredRoleProviderUseCase = new ResolvePreferredRoleProviderUseCase({ preferenceStore, resolver });
        const coordinator = new PreferredSnapshotPlacementCreationCoordinator(
            snapshotPlacementCreationCoordinator, resolvePreferredRoleProviderUseCase
        );

        return { coordinator, preferenceStore, resolver, resolvePreferredRoleProviderUseCase };
    }
}
