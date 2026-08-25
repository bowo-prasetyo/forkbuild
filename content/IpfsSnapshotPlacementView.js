const IPFS_URI_PREFIX = 'ipfs://';

// 0.8.20 — Snapshot Placement Inspection & Explicit Resolution UX.
//
// content/IpfsContentStore.js (creation/retrieval, 0.7.1/0.8.18) is this
// codebase's existing IPFS-specific adapter. This is a second, narrower
// one: a PRESENTATION adapter, registered into application/
// SnapshotPlacementViewRegistry.js under the identical storage name
// (`ipfs`) content/IpfsContentStore.js already self-identifies as,
// answering a much smaller question than either — "how should an
// `ipfs://<cid>` locator read on a screen, and where does 'view on a
// gateway' go?" — never anything about whether the CID is pinned,
// reachable, or actually serves the claimed bytes.
//
// THIS CLASS NEVER RESOLVES. It never calls a gateway, never checks
// pin/replication status, never decides whether `locator` currently
// serves anything — all three stay application/
// SnapshotPlacementResolver.js's own job, unchanged. `describe()` is a
// pure string/URL transform over whatever `locator` the placement
// already carries, exactly as synchronous and side-effect-free as
// application/PublicationSnapshotPlacementDetailView.js's own
// `publicationSnapshotPlacementDetailView()`.
//
// A malformed or missing `locator` (a peer-supplied placement this
// replica has never independently resolved, or one whose placer never
// used the `ipfs://` scheme) is described HONESTLY, never guessed at —
// `fields`/`externalLocator` degrade to "not available," never a
// fabricated CID.
export class IpfsSnapshotPlacementView {
    get storage() { return 'ipfs'; }

    // Returns:
    //
    //   { summary: 'IPFS',
    //     fields: [{ label, value }, ...],
    //     externalLocator: { label: 'View on IPFS gateway', url } | null }
    //
    // `externalLocator` is null whenever `locator` is not a recognizable
    // `ipfs://<cid>` string — there is nothing honest to link to. The
    // gateway URL construction lives HERE and nowhere else — never in
    // application/PublicationSnapshotPlacementDetailView.js, whose own
    // header states it never reinterprets `locator` at all.
    describe(placement) {
        const locator = placement && typeof placement.locator === 'string' ? placement.locator : '';
        const cid = locator.startsWith(IPFS_URI_PREFIX) ? locator.slice(IPFS_URI_PREFIX.length).trim() : '';

        return {
            summary: 'IPFS',
            fields: [
                { label: 'CID', value: cid || 'not available' }
            ],
            externalLocator: cid ? { label: 'View on IPFS gateway', url: `https://ipfs.io/ipfs/${cid}` } : null
        };
    }
}
