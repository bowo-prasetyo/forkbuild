import { IpfsRemotePublicationState } from './IpfsRemotePublicationState.js';
import { HttpPinningProvider, PinningRejectedError } from '../content/HttpPinningProvider.js';
import { IpfsRemotePinningContentStore } from '../content/IpfsRemotePinningContentStore.js';
import { ContentUnavailableError } from '../content/IpfsContentStore.js';

// 0.8.68 — Explicit Remote IPFS Publishing Configuration & UX.
//
// content/IpfsRemotePinningContentStore.js (0.8.67) already carries EVERY
// invariant this milestone exists to expose behind an explicit button —
// the CID stays a locator, the content hash is computed locally before
// the provider is ever consulted, no retry, no fallback to a second
// provider. Nothing about that class changes here — this coordinator is
// a deliberately thin wiring on top of it, mirroring EXACTLY the shape
// application/BitcoinAnchorBroadcastCoordinator.js (0.8.64) already
// established for a different external boundary:
//
//   { bytes, configuration }
//           │
//           │ explicit "Publish to Remote IPFS" click
//           ▼
//   IpfsRemotePublicationCoordinator.publish()   (THIS FILE — new)
//           │
//           ├── content/HttpPinningProvider.js          (0.8.67, UNCHANGED)
//           │       — constructed FRESH from `configuration`, every call
//           ▼
//   content/IpfsRemotePinningContentStore.js#put()   (0.8.67, UNCHANGED)
//           │
//           ▼
//   ContentReference{ hash, uri: 'ipfs://<cid>' }        ──► PUBLISHED
// | PinningRejectedError                                 ──► REJECTED
// | ContentUnavailableError                               ──► UNAVAILABLE
// | anything else (including a thrown caller-contract      ──► FAILED
//   violation from content/IpfsRemotePinningContentStore.js
//   itself, e.g. a provider that resolves with no CID)
//
// A FRESH PROVIDER AND STORE FOR EVERY CALL, NEVER A REMEMBERED ONE —
// THE IDENTICAL RESTRAINT application/BitcoinAnchorReviewedSigningCoordinator.js
// (0.8.62) ALREADY HOLDS FOR A WALLET. This class never holds onto a
// `configuration`, a provider, or a store across calls — `publish()`
// takes `configuration` as an explicit argument every time and
// constructs a brand-new content/HttpPinningProvider.js (via the
// injectable `createPinningProvider`, defaulting to the real 0.8.67
// class) for that one call alone. A caller that reconfigures a
// different endpoint or credential between two publish attempts gets
// exactly that configuration consulted next time — never a stale
// capability from whichever configuration happened to be in effect when
// this coordinator was first constructed. See application/
// IpfsRemotePublishingConfiguration.js's own header, and
// anchoring/BitcoinWalletConnection.js's own header, "A CAPABILITY,
// NEVER A SECRET."
//
// NO NEW IPFS OR PINNING LOGIC BELONGS HERE, AND NONE IS ADDED. This
// class computes no content hash of its own (content/
// IpfsRemotePinningContentStore.js#put() already does, exactly once,
// before the provider is ever consulted — see that file's own header,
// "THE CID STAYS A LOCATOR"), retries nothing, never selects a
// different provider, never silently substitutes local Kubo or a
// gateway for the remote pinning service a person explicitly
// configured, never caches a CID anywhere, and never treats a CID as
// this content's identity — `contentHash` on a PUBLISHED outcome is
// always content/ContentReference.js's own `hash`, never `locator`
// (the CID). See docs/Principles.md, "The CID Stays A Locator (0.8.67),"
// held here completely unchanged.
//
// ONE PROVIDER CALL PER EXPLICIT CLICK — NO RETRY OF ANY KIND. A
// REJECTED or UNAVAILABLE result is the end of this publish attempt:
// this class never re-submits, never waits and tries again, and never
// substitutes a different provider. A person clicks "Publish Again",
// explicitly, to make another attempt with whatever configuration is
// currently in effect.
//
// FAILED IS FOR AN UNACCEPTABLE OR UNVERIFIABLE PROVIDER RESPONSE, NEVER
// FOR THIS COORDINATOR'S OWN CALLER-CONTRACT VIOLATIONS. Exactly as
// application/BitcoinAnchorBroadcastCoordinator.js's own header already
// draws this line: missing `bytes`, or a `configuration` with no
// `endpoint`, is a UI-layer bug — the caller never reaches this method
// without first having real bytes and a real configuration in hand —
// and is refused by throwing, checked before any provider is ever
// constructed. A thrown content/IpfsRemotePinningContentStore.js
// contract violation (a provider that resolves successfully but names
// no CID at all) is a genuinely unacceptable PROVIDER answer, not a
// caller mistake, so it is caught here and reported as FAILED — unlike
// application/BitcoinAnchorBroadcastCoordinator.js's own FAILED, this
// one is honestly reachable, because content/HttpPinningProvider.js's
// generic, provider-neutral wire contract makes a malformed remote
// response a real, expected possibility rather than a theoretical one.
export class IpfsRemotePublicationCoordinator {
    constructor({ createPinningProvider = (options) => new HttpPinningProvider(options) } = {}) {
        if (typeof createPinningProvider !== 'function') {
            throw new Error('IpfsRemotePublicationCoordinator: createPinningProvider must be a function');
        }
        this._createPinningProvider = createPinningProvider;
    }

    // Resolves to exactly one of:
    //
    //   { state: PUBLISHED, published: true, contentHash, locator, endpoint, publishedAt, reason: null }
    //   { state: REJECTED, published: false, ..., reason }
    //   { state: UNAVAILABLE, published: false, ..., reason }
    //   { state: FAILED, published: false, ..., reason }
    //
    // Throws only for a caller-contract violation checked BEFORE any
    // provider is ever constructed — missing/empty `bytes`, or a
    // `configuration` with no non-empty `endpoint` — see this file's own
    // header.
    async publish({ bytes, configuration } = {}) {
        if (typeof bytes !== 'string' && !(bytes instanceof Uint8Array)) {
            throw new Error('IpfsRemotePublicationCoordinator: bytes is required — nothing to publish');
        }
        if (!configuration || typeof configuration.endpoint !== 'string' || !configuration.endpoint.trim()) {
            throw new Error('IpfsRemotePublicationCoordinator: a configuration with a non-empty endpoint is required — configure remote publishing before ever requesting a publish');
        }

        const providerOptions = { endpoint: configuration.endpoint, credential: configuration.credential || null };
        if (configuration.requestField) providerOptions.fileFieldName = configuration.requestField;
        if (configuration.responseField) providerOptions.cidField = configuration.responseField;

        const provider = this._createPinningProvider(providerOptions);
        const store = new IpfsRemotePinningContentStore({ provider });

        let contentReference;
        try {
            contentReference = await store.put(bytes);
        } catch (error) {
            if (error instanceof PinningRejectedError) {
                return this._outcome(IpfsRemotePublicationState.REJECTED, { reason: error.message });
            }
            if (error instanceof ContentUnavailableError) {
                return this._outcome(IpfsRemotePublicationState.UNAVAILABLE, { reason: error.message });
            }
            return this._outcome(IpfsRemotePublicationState.FAILED, { reason: error.message });
        }

        return this._outcome(IpfsRemotePublicationState.PUBLISHED, {
            published: true,
            contentHash: contentReference.hash,
            locator: contentReference.uri,
            endpoint: configuration.endpoint,
            publishedAt: new Date().toISOString()
        });
    }

    _outcome(state, { published = false, contentHash = null, locator = null, endpoint = null, publishedAt = null, reason = null } = {}) {
        return Object.freeze({ state, published, contentHash, locator, endpoint, publishedAt, reason });
    }
}
