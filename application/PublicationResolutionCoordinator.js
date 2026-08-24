import { PublicationResolutionOutcome } from './PublicationResolutionOutcome.js';

// 0.7.5 — Decentralized Publication UX & Resolution.
//
// 0.7.0 through 0.7.4 built a complete pipeline —
//
//   Peer -> PublicationPeerExchange -> PublicationCatalog
//        -> PublicationResolver -> ContentStore
//        -> (0.7.4) PeerContentExchange, for the CONTENT_UNAVAILABLE case
//
// — and left every one of those five classes deliberately unaware of
// the other four's existence beyond the one collaborator each already
// takes by constructor injection. That separation was correct and stays
// unchanged here. What none of them ever answered is the question a
// PERSON actually has when looking at one cataloged publication: "can I
// see this, and if not, can you go get it?" Answering that requires
// calling TWO of them in sequence — application/PublicationResolver.js#
// resolve(), and, only if that reports CONTENT_UNAVAILABLE, application/
// PeerContentExchange.js#request() — and reacting to an asynchronous
// event neither class raises on its own behalf. This class is that
// sequencing, and nothing more: it owns no storage, no catalog, no
// state of its own, and introduces no new persisted concept anywhere.
//
//   resolve locally
//         │
//         ├── RESOLVED / INVALID_* ──────────────→ return, unchanged
//         │
//         └── CONTENT_UNAVAILABLE
//                   │
//                   ├── no peer supplied ─────────→ return, unchanged
//                   │
//                   └── ask exactly ONE caller-chosen peer, bounded by
//                       a timeout
//                             │
//                       ┌─────┴─────┐
//                       │           │
//                    arrived     timed out
//                       │           │
//                  resolve again   return the ORIGINAL
//                  (may still fail  CONTENT_UNAVAILABLE result,
//                   for a reason    unchanged
//                   unrelated to
//                   availability)
//
// THE CENTRAL RESTRAINT this milestone's own design conversation
// insisted on: peer retrieval only ever happens for a publication a
// caller explicitly hands in, together with a peer the caller
// explicitly chose to ask — never automatically, never for every entry
// application/LocalPublicationCatalog.js happens to hold, never racing
// or falling back across more than one peer. `peer` is a REQUIRED,
// per-call argument, not a default this class picks for itself — a
// caller that wants "try the first connected peer" implements that
// policy itself, one layer up (see ui/views/DecentralizedPublicationsView.js),
// exactly the way application/PeerContentExchange.js's own header
// already refuses to reinvent "how do bytes actually move." Multi-peer
// racing or fallback is explicitly out of scope here too — see
// docs/Roadmap.md, 0.7.4, "Deliberately excluded," which already sized
// that as its own future milestone (0.7.6); asking more than one peer
// per call, sequentially or concurrently, would be exactly that
// fallback policy, arriving one milestone early.
//
// Never stores a resolution outcome anywhere, never memoizes across
// calls, never ranks or races candidate peers — the identical restraint
// application/LocalPublicationCatalog.js's own header already applies to
// itself, extended here to the one new axis this class adds. Calling
// resolve() twice for the same publication is always safe and always
// re-derives its answer from scratch; see docs/Principles.md, "Discovery
// Is Not Resolution (0.7.2)," for why a cached verdict would be exactly
// the shortcut this codebase has refused since 0.7.0.
export class PublicationResolutionCoordinator {
    constructor(publicationResolver, peerContentExchange = null) {
        if (!publicationResolver || typeof publicationResolver.resolve !== 'function') {
            throw new Error('PublicationResolutionCoordinator: a PublicationResolver is required');
        }
        this._resolver = publicationResolver;
        // OPTIONAL — a caller with no live peer transport at all (an
        // offline replica, a test exercising local resolution only) can
        // still construct this class and call resolve() with `peer`
        // always omitted; see `resolve()` below.
        this._peerContentExchange = peerContentExchange;
    }

    // Runs application/PublicationResolver.js#resolve() unchanged. If the
    // outcome is anything other than CONTENT_UNAVAILABLE, that result is
    // returned exactly as received — this class adds nothing to a
    // publication that is already resolved, or that is invalid for a
    // reason no amount of peer retrieval could ever fix.
    //
    // Only when the outcome IS CONTENT_UNAVAILABLE, and only when the
    // caller supplied a `peer` (a live, already-authenticated
    // ConnectedPeer this class never chooses on its own — see this
    // class's own header), does it ask that one peer for the bytes by
    // hash over application/PeerContentExchange.js#request(), wait up to
    // `timeoutMs` for a verified application/PeerContentExchange.js#
    // onContentReceived() matching that exact hash, and — only if one
    // arrives — call application/PublicationResolver.js#resolve() a
    // SECOND time. That second call re-runs the full ten-step discipline
    // from scratch; a publication whose bytes just arrived from a peer
    // gets no less scrutiny than one already sitting in this replica's
    // own ContentStore. A timeout, a missing `peer`, or no
    // `peerContentExchange` at construction all return the ORIGINAL
    // CONTENT_UNAVAILABLE result, unchanged — never a different outcome
    // invented for "I tried and it didn't work."
    async resolve(publicationJson, kindPlugin, { peer = null, timeoutMs = PublicationResolutionCoordinator.DEFAULT_TIMEOUT_MS } = {}) {
        const first = await this._resolver.resolve(publicationJson, kindPlugin);
        if (first.outcome !== PublicationResolutionOutcome.CONTENT_UNAVAILABLE) {
            return first;
        }
        if (!peer || !this._peerContentExchange) {
            return first;
        }
        const hash = first.publication && first.publication.contentReference && first.publication.contentReference.hash;
        if (!hash) {
            return first;
        }

        const retrieved = await this._requestFromPeer(peer, hash, timeoutMs);
        if (!retrieved) {
            return first;
        }
        return this._resolver.resolve(publicationJson, kindPlugin);
    }

    // Wraps application/PeerContentExchange.js#request()/onContentReceived()
    // — an intentionally fire-and-forget, event-driven pair — in a single
    // bounded Promise<boolean>: true the moment a RESPONSE for exactly
    // `hash` is verified and stored, false on timeout or if `request()`
    // itself throws (e.g. `peer` is not AUTHENTICATED — see that
    // method's own header). Never resolves true for any OTHER hash's
    // arrival; two calls to this method for two different hashes, even
    // concurrently, never cross-resolve one another, since application/
    // PeerContentExchange.js#onContentReceived() fires `{ hash }` per
    // event, filtered here explicitly.
    _requestFromPeer(peer, hash, timeoutMs) {
        return new Promise((resolve) => {
            let settled = false;
            let timer = null;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                unsubscribe();
                resolve(result);
            };
            const unsubscribe = this._peerContentExchange.onContentReceived(({ hash: receivedHash }) => {
                if (receivedHash === hash) {
                    finish(true);
                }
            });
            timer = setTimeout(() => finish(false), timeoutMs);
            try {
                this._peerContentExchange.request(peer, hash);
            } catch {
                finish(false);
            }
        });
    }
}

// Long enough for a real peer round trip over an authenticated WebRTC
// data channel; short enough that a UI action never hangs indefinitely
// waiting on a peer that will never answer. A caller with a different
// need (a slow network, an impatient UI) overrides this per call via
// `resolve()`'s own `timeoutMs` option — never a reason to change this
// default for everyone.
PublicationResolutionCoordinator.DEFAULT_TIMEOUT_MS = 8000;
