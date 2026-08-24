import { PublicationResolutionOutcome } from './PublicationResolutionOutcome.js';
import { PeerContentRetrievalCoordinator } from './PeerContentRetrievalCoordinator.js';

// 0.7.5 — Decentralized Publication UX & Resolution.
// 0.7.6 — Multi-Peer Publication Retrieval & Replication.
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
//                   ├── no candidates supplied ────→ return, unchanged
//                   │
//                   └── ask each caller-chosen candidate IN ORDER
//                       (PeerContentRetrievalCoordinator, 0.7.6),
//                       bounded by a timeout PER CANDIDATE
//                             │
//                       ┌─────┴─────┐
//                       │           │
//                    arrived     every candidate
//                       │        timed out
//                  resolve again   return the ORIGINAL
//                  (may still fail  CONTENT_UNAVAILABLE result,
//                   for a reason    unchanged
//                   unrelated to
//                   availability)
//
// THE CENTRAL RESTRAINT this milestone's own design conversation
// insisted on: peer retrieval only ever happens for a publication a
// caller explicitly hands in, together with a peer (or peers) the
// caller explicitly chose to ask — never automatically, never for every
// entry application/LocalPublicationCatalog.js happens to hold. `peer`/
// `peers` are REQUIRED, per-call arguments, not a default this class
// picks for itself — a caller that wants "ask every connected peer"
// implements that policy itself, one layer up (see ui/views/
// DecentralizedPublicationsView.js), exactly the way application/
// PeerContentExchange.js's own header already refuses to reinvent "how
// do bytes actually move."
//
// 0.7.5 shipped this class asking exactly ONE caller-chosen peer,
// naming and declining multi-peer fallback as its own future milestone
// (0.7.6). 0.7.6 is that milestone: `resolve()` now also accepts
// `peers`, an ORDERED list of candidates, tried one at a time by a new
// application/PeerContentRetrievalCoordinator.js this class builds
// around whatever `peerContentExchange` it was constructed with. `peer`
// (singular) still works, unchanged, as a one-candidate shorthand — see
// `resolve()` below. What did NOT change: this class still never
// chooses a candidate itself, still never races or ranks them (they are
// tried strictly in the order the caller supplied), and still invents
// no new application/PublicationResolutionOutcome.js value — see
// application/PeerContentRetrievalCoordinator.js's own header for why
// its retrieval result is carried alongside the outcome, on a separate
// `retrieval` field, never merged into it.
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
        // still construct this class and call resolve() with `peer`/
        // `peers` always omitted; see `resolve()` below. Wrapped in a
        // fresh application/PeerContentRetrievalCoordinator.js — never a
        // second ContentStore or catalog, only a thin sequencing layer
        // around the SAME peerContentExchange this replica already uses
        // everywhere else (see ui/main.js).
        this._retrievalCoordinator = peerContentExchange ? new PeerContentRetrievalCoordinator(peerContentExchange) : null;
    }

    // Runs application/PublicationResolver.js#resolve() unchanged. If the
    // outcome is anything other than CONTENT_UNAVAILABLE, that result is
    // returned exactly as received — this class adds nothing to a
    // publication that is already resolved, or that is invalid for a
    // reason no amount of peer retrieval could ever fix.
    //
    // Only when the outcome IS CONTENT_UNAVAILABLE, and only when the
    // caller supplied at least one candidate — `peers`, an ORDERED
    // array, or `peer`, a one-candidate shorthand that behaves exactly
    // as it did before 0.7.6 — does it hand those candidates to a fresh
    // application/PeerContentRetrievalCoordinator.js#retrieve() call,
    // which tries each one in turn, up to `timeoutMs` per candidate,
    // until a verified RESPONSE for the exact hash arrives or every
    // candidate is exhausted. Only if one arrives does this method call
    // application/PublicationResolver.js#resolve() a SECOND time. That
    // second call re-runs the full ten-step discipline from scratch; a
    // publication whose bytes just arrived from a peer gets no less
    // scrutiny than one already sitting in this replica's own
    // ContentStore. Exhausting every candidate, an empty/missing
    // `peers`/`peer`, or no `peerContentExchange` at construction all
    // return the ORIGINAL CONTENT_UNAVAILABLE result, unchanged — never
    // a different outcome invented for "I tried and it didn't work."
    //
    // Either way, the RETURNED result carries one extra field this
    // class never had before 0.7.6: `retrieval`, the exact `{ retrieved,
    // hash, attemptedPeers, peer?, reason? }` application/
    // PeerContentRetrievalCoordinator.js#retrieve() produced — present
    // only when a retrieval was actually attempted (i.e. never on a
    // RESOLVED/INVALID_* first result, and never when no candidate was
    // supplied). See that class's own header on why this is a SEPARATE
    // field, never folded into `outcome`.
    async resolve(publicationJson, kindPlugin, {
        peer = null, peers = null, timeoutMs = PublicationResolutionCoordinator.DEFAULT_TIMEOUT_MS
    } = {}) {
        const first = await this._resolver.resolve(publicationJson, kindPlugin);
        if (first.outcome !== PublicationResolutionOutcome.CONTENT_UNAVAILABLE) {
            return first;
        }
        const candidates = (Array.isArray(peers) && peers.length) ? peers : (peer ? [peer] : []);
        if (!candidates.length || !this._retrievalCoordinator) {
            return first;
        }
        const hash = first.publication && first.publication.contentReference && first.publication.contentReference.hash;
        if (!hash) {
            return first;
        }

        const retrieval = await this._retrievalCoordinator.retrieve(hash, candidates, { timeoutMs });
        if (!retrieval.retrieved) {
            return { ...first, retrieval };
        }
        const second = await this._resolver.resolve(publicationJson, kindPlugin);
        return { ...second, retrieval };
    }
}

// Long enough for a real peer round trip over an authenticated WebRTC
// data channel; short enough that a UI action never hangs indefinitely
// waiting on a peer that will never answer. A caller with a different
// need (a slow network, an impatient UI) overrides this per call via
// `resolve()`'s own `timeoutMs` option — never a reason to change this
// default for everyone.
PublicationResolutionCoordinator.DEFAULT_TIMEOUT_MS = 8000;
