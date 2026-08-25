// 0.8.20 — Snapshot Placement Inspection & Explicit Resolution UX.
//
// The `local` sibling of content/IpfsSnapshotPlacementView.js — a
// PRESENTATION adapter for a placement whose `storage` is `local`,
// registered into application/SnapshotPlacementViewRegistry.js under
// the identical name content/LocalContentStore.js already
// self-identifies as (0.8.18).
//
// A `local` locator names a key on THIS DEVICE's own storage — there is
// no external system to link to, and inventing one (a fake gateway URL,
// a file:// path that would never actually resolve on another replica)
// would be exactly the kind of guess content/
// IpfsSnapshotPlacementView.js's own header already refuses to make.
// `externalLocator` is therefore always null here, honestly: "local"
// means "ask application/SnapshotPlacementResolver.js to resolve it,"
// never "follow a link."
export class LocalSnapshotPlacementView {
    get storage() { return 'local'; }

    // Returns { summary: 'Local Device', fields: [{ label, value }, ...], externalLocator: null }.
    describe(placement) {
        const locator = placement && typeof placement.locator === 'string' && placement.locator.trim()
            ? placement.locator
            : null;
        return {
            summary: 'Local Device',
            fields: [
                { label: 'Storage Key', value: locator || 'not available' }
            ],
            externalLocator: null
        };
    }
}
