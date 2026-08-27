// 0.8.67 — Explicit Remote IPFS Publishing via a Pinning Provider.
//
// content/ContentStore.js's own header already draws the "capability
// should only be exposed where it genuinely exists" line for THIS
// codebase's one storage boundary (put/get/has). This is the identical
// discipline applied one layer further out, for the one capability
// content/IpfsRemotePinningContentStore.js actually needs from a remote
// pinning SERVICE — accepting bytes and handing back a CID — and nothing
// else. It is deliberately NOT a second content/ContentStore.js: a
// pinning provider is not addressed by a `storage`/`ContentReference`
// pair, never resolves anything, and is never registered into
// application/SnapshotPlacementStoreRegistry.js directly. content/
// IpfsRemotePinningContentStore.js is the adapter that bridges the two —
// see that file's own header.
//
// This is where ForkBuild's domain layer stops. A concrete subclass
// (content/HttpPinningProvider.js today) is where a specific commercial
// pinning service's own wire protocol, authentication scheme, and
// response shape live — NEVER here, and never in content/
// IpfsRemotePinningContentStore.js either. ForkBuild itself never imports
// or names Pinata, Filebase, web3.storage, or any other provider by
// brand; it only ever depends on this one abstract contract:
//
//   PinningProvider
//         │
//         ▼
//   put(bytes) -> Promise<{ cid }>
//
// `name` is a short, stable, self-identifying string a concrete provider
// supplies for itself — the same "the plugin names itself" discipline
// content/ContentStore.js's own `storage` getter already holds — used
// only in error messages and logs, never as a lookup key anywhere in
// this codebase.
//
// CREDENTIALS ARE NEVER THIS CLASS'S CONCERN. A concrete provider is
// constructed with whatever it needs to authenticate already injected —
// this base class defines no credential shape, no header format, no
// storage location for a secret, and never persists one on a caller's
// behalf. See content/HttpPinningProvider.js's own header for where that
// responsibility actually lives, and docs/Principles.md, "A Capability
// Is Exposed Only Where It Exists; A Credential Is Never Owned (0.8.67)."
export class PinningProvider {
    get name() { throw new Error('PinningProvider.name not implemented'); }

    // put(bytes) -> Promise<{ cid }>. Resolves with the CID the remote
    // service assigned to these bytes on success. Rejects — never
    // resolves with a null/empty CID or a "failed" flag — for every kind
    // of failure. A concrete provider is expected to distinguish, by the
    // ERROR TYPE it throws, a merely unreachable/transient failure from
    // the service's own definitive refusal — see content/
    // HttpPinningProvider.js for the one concrete example this codebase
    // ships.
    async put(bytes) { throw new Error('PinningProvider.put() not implemented'); }
}
