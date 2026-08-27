import { ContentStore } from './ContentStore.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';

const IPFS_URI_PREFIX = 'ipfs://';

// 0.8.67 — Explicit Remote IPFS Publishing via a Pinning Provider.
//
// content/IpfsGatewayContentStore.js's own 0.8.66 header drew this line
// deliberately: "Local Kubo (content/IpfsContentStore.js) — resolve,
// publish. Remote Gateway — resolve only." This class is that same
// line's other half, held with the identical symmetry, inverted:
//
//   Remote Gateway  (content/IpfsGatewayContentStore.js, 0.8.66) — resolve only
//   Remote Pinning  (this class, 0.8.67)                         — publish only
//
// A public HTTPS gateway genuinely cannot accept content; a remote
// pinning service genuinely does not serve arbitrary reads the way a
// gateway does (it is reached to publish, not to browse). Neither class
// pretends to be the other, and neither is a replacement for content/
// IpfsContentStore.js (0.7.1), which keeps BOTH capabilities a real Kubo
// node genuinely has. `get()`/`has()` are therefore NOT overridden here
// — they inherit content/ContentStore.js's own unimplemented throw, the
// exact same signal content/IpfsGatewayContentStore.js's own put()
// already gives for the capability it does not have, never a second,
// competing "not supported" concept.
//
// An ordinary person resolving an already-placed `ipfs://` locator keeps
// using content/IpfsGatewayContentStore.js, completely unchanged by this
// milestone — this class only ever widens who can PLACE new content:
// previously only a locally running Kubo node could; now an injected,
// provider-neutral content/PinningProvider.js can too, with no daemon
// installed or running.
//
// PROVIDER-NEUTRAL BY CONSTRUCTION. This class never imports, names, or
// special-cases a particular commercial pinning service — it depends on
// nothing but the content/PinningProvider.js contract (`put(bytes) ->
// { cid }`), injected at construction, the identical "generic pipeline,
// concrete plugin wired outside it" split every registry in this
// codebase already holds (see application/SnapshotPlacementStoreRegistry
// .js's own header). Swapping which commercial service backs a given
// instance never touches this file.
//
// THE CID STAYS A LOCATOR. `put()` computes its returned
// ContentReference's `hash` the same way every other content/
// ContentStore.js implementation in this codebase already does — a
// local, deterministic hash of the bytes THIS REPLICA is looking at,
// computed BEFORE the provider is ever consulted — and only ever puts
// the CID the provider hands back into `uri`. A caller who only ever
// reads `contentReference.hash` cannot tell whether the bytes were
// placed by a local Kubo node or by a remote pinning provider — that
// indistinguishability is the entire point, exactly as content/
// IpfsContentStore.js's own header already states one adapter over.
//
// NO CACHING OF ANY PROVIDER FAILURE, NO RETRY, NO FALLBACK TO A SECOND
// PROVIDER. `put()` calls the injected provider's own `put()` exactly
// once and propagates whatever it does — resolve with a CID, or reject —
// completely unchanged. A caller (application/
// CreateExternalSnapshotPlacementUseCase.js today) that catches a
// rejection decides for itself whether and when to try again; this class
// never decides that on a caller's behalf. See content/
// HttpPinningProvider.js's own header for the two distinct failure types
// a provider may throw (ContentUnavailableError vs. PinningRejectedError)
// — this class does not inspect or reclassify either one.
export class IpfsRemotePinningContentStore extends ContentStore {
    constructor({ provider } = {}) {
        super();
        if (!provider || typeof provider.put !== 'function') {
            throw new Error('IpfsRemotePinningContentStore: a PinningProvider with a put() method is required');
        }
        this._provider = provider;
    }

    get provider() { return this._provider; }

    // Matches the `storage: 'ipfs'` content/IpfsContentStore.js and
    // content/IpfsGatewayContentStore.js already stamp/key themselves
    // under — an `ipfs://` locator names a SCHEME, not which particular
    // backend produced or resolves it. Because application/
    // SnapshotPlacementStoreRegistry.js keys one store per storage name
    // per registry instance, offering this store as an EXPLICIT
    // alternative to Kubo (never a silent replacement, never an
    // automatic fallback) requires a second, separately constructed
    // registry — the identical "two explicit registries, never one
    // silent overwrite" shape content/IpfsGatewayContentStore.js's own
    // 0.8.66 wiring already established for resolution vs. creation, one
    // level deeper here, for two different CREATION backends. See
    // docs/Roadmap.md, 0.8.67, for why that wiring is deliberately left
    // for its own future milestone rather than built here.
    get storage() { return 'ipfs'; }

    // put(bytes) -> Promise<ContentReference>. Rejects with whatever the
    // injected provider's own put() rejected with — never caught,
    // reclassified, or retried here.
    async put(bytes) {
        const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
        const hash = computeContentHash(text);

        const result = await this._provider.put(text);
        const cid = result && result.cid;
        if (!cid || typeof cid !== 'string') {
            throw new Error('IpfsRemotePinningContentStore: pinning provider resolved with no CID');
        }

        return new ContentReference({
            hash,
            algorithm: 'fnv1a-32',
            mediaType: 'application/json',
            size: text.length,
            uri: IPFS_URI_PREFIX + cid,
            storage: 'ipfs'
        });
    }
}
