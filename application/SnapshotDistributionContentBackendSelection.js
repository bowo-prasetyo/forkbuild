// 0.9.506 — Snapshot Distribution Content Backend Selection.
//
// application/SnapshotDistributionCommand.js already accepts any content/
// ContentStore.js implementation as its own `contentStore` collaborator —
// tests/SnapshotContentStorageChoiceCapabilityBoundaryAudit.test.js's own
// Section H already proved that, live, by substituting a real
// IpfsContentStore for the real ArweaveContentStore with zero change to the
// command. The gap that same audit's Section G named was never the
// command — it was that ui/main.js's own Distribution composition site
// never let a caller CHOOSE which store to hand it; it always built
// exactly one ArweaveContentStore for itself, unconditionally.
//
// This file is that missing selection seam — and it is deliberately NOT a
// new registry. application/SnapshotPlacementStoreRegistry.js already IS a
// `storage -> ContentStore` lookup, already populated (by ui/main.js) with
// 'local'/'ipfs'/'ar', and already shared between Placement's own creation
// and resolution coordinators. Reusing that SAME registry for Distribution
// keeps exactly one shared source of truth for "which ContentStore backs
// which storage name" — never a second, independently constructed map that
// could drift from the first. This file never imports
// SnapshotPlacementStoreRegistry, ArweaveContentStore, or IpfsContentStore
// — every function below is duck-typed against "anything exposing
// has(storage)/get(storage)," the same restraint application/
// RoleAwareProviderResolver.js's own requireKeyedRegistry() already holds.
//
// REGISTRY MEMBERSHIP DOES NOT BY ITSELF MAKE A STORAGE NAME A LEGITIMATE
// DISTRIBUTION TARGET. 'local' is a fully valid Placement backend — any
// replica can always read its own local bytes back — but distributing a
// Snapshot means making it reachable to OTHER replicas over a real
// network; a 'local' "distribution" would announce a locator nothing else
// could ever resolve. SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES is the
// one place that product decision lives: a fixed, closed allowlist, never
// derived from whatever a registry happens to have registered.
export const SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES = Object.freeze(['ipfs', 'ar']);

function isKeyedRegistry(registry) {
    return Boolean(registry) && typeof registry.get === 'function' && typeof registry.has === 'function';
}

// Every storage this replica could currently distribute a Snapshot onto —
// the eligible list, above, narrowed to whatever `storeRegistry` (an
// application/SnapshotPlacementStoreRegistry.js instance, or anything
// duck-typed the same way) actually has a real ContentStore registered for
// right now. Always in SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES's own
// fixed order, never the registry's own insertion order, so a caller
// rendering a picker gets a stable, predictable option order. Empty is a
// perfectly ordinary result — no eligible store configured on this device
// yet — never this function's job to explain why, only to report it.
export function availableSnapshotDistributionStorageTypes(storeRegistry) {
    if (!isKeyedRegistry(storeRegistry)) {
        return [];
    }
    return SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES.filter((storage) => storeRegistry.has(storage));
}

// Resolves `storage` into the real, registered ContentStore a caller
// should hand to executeSnapshotDistributionCommand()'s own `contentStore`
// parameter. Throws — never returns null — for a `storage` outside the
// closed eligible list above (including the entirely ordinary 'local'; see
// this file's own header) or for an eligible storage nothing is currently
// registered for; both are genuine caller/configuration errors, thrown
// synchronously before any I/O, the same discipline application/
// SnapshotDistributionCommand.js's own header already holds one layer up
// for its own collaborator-contract checks.
export function resolveSnapshotDistributionContentStore(storeRegistry, storage) {
    if (!SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES.includes(storage)) {
        throw new Error(`resolveSnapshotDistributionContentStore: "${storage}" is not an eligible Snapshot Distribution content backend (eligible: ${SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES.join(', ')})`);
    }
    if (!isKeyedRegistry(storeRegistry)) {
        throw new Error('resolveSnapshotDistributionContentStore: a keyed ContentStore registry (get()/has()) is required');
    }
    const contentStore = storeRegistry.get(storage);
    if (!contentStore) {
        throw new Error(`resolveSnapshotDistributionContentStore: no ContentStore is currently registered for "${storage}"`);
    }
    return contentStore;
}
