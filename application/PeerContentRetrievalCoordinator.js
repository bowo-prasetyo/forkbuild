// 0.7.6 — Multi-Peer Publication Retrieval & Replication.
//
// 0.7.4's application/PeerContentExchange.js#request() asks exactly one
// peer, chosen by its caller, for one hash. 0.7.5's application/
// PublicationResolutionCoordinator.js then hard-coded that caller down to
// exactly one — its own `peer` option — and its own header named the
// obvious next step and declined to build it: "asking more than one peer
// per call, sequentially or concurrently, would be exactly [0.7.6's own]
// fallback policy, arriving one milestone early." This class is that
// policy, arriving on time.
//
//   RetrievalCoordinator.retrieve(hash, peers, options)
//         │
//         ├── peers[0] ── request() ── timeout? ──┐
//         │                                        │
//         ├── peers[1] ── request() ── timeout? ──┤  try the next
//         │                                        │  candidate
//         ├── peers[2] ── request() ── arrived! ───┘
//         │
//         └── { retrieved: true, peer: peers[2], hash, attemptedPeers }
//
// Candidates are tried IN ORDER, one at a time, never concurrently — see
// "Deliberately excluded" below for why racing several peers at once is
// still not built here. The first candidate whose RESPONSE arrives and
// verifies (application/PeerContentExchange.js#onContentReceived() only
// ever fires for a hash-verified RESPONSE — see that class's own central
// security rule) ends the search; every candidate before it is recorded
// in `attemptedPeers`, never silently dropped from the result.
//
// THE CENTRAL RESTRAINT this milestone's own design conversation
// insisted on, stated once here because it governs this entire class:
// peer IDENTITY never determines content validity, and trying peer N
// before peer N+1 is never a ranking of one peer over another — it is
// only ever the ORDER a caller happened to hand candidates in (see
// ui/views/DecentralizedPublicationsView.js for the one policy this
// codebase actually applies: every currently authenticated peer, in
// registry order). Peer A's bytes and peer D's bytes are equally
// unproven until application/PeerContentExchange.js's own hash check
// passes; this class introduces no field anywhere that could hold an
// opinion about which peer is more trustworthy, "preferred," or
// "canonical" — the identical restraint application/
// PublicationResolutionCoordinator.js's own header already applies to a
// single peer, extended here to a list of them.
//
// Returns an OPERATION result, deliberately never a application/
// PublicationResolutionOutcome.js value: `{ retrieved, hash,
// attemptedPeers, peer?, reason? }`. "Did this attempt obtain bytes for
// this hash" and "what is the state of this publication" are two
// different questions — see docs/Principles.md, "Resolution Asks What;
// Retrieval Asks Whether (0.7.6)" — and collapsing them would force
// every caller of application/PublicationResolver.js#resolve() to also
// understand peer-retrieval bookkeeping it may not have asked for.
// application/PublicationResolutionCoordinator.js is the one place that
// still combines them, and only ever by carrying this class's own result
// alongside its own outcome, never by merging the two shapes into one.
export class PeerContentRetrievalCoordinator {
    constructor(peerContentExchange) {
        if (!peerContentExchange
            || typeof peerContentExchange.request !== 'function'
            || typeof peerContentExchange.onContentReceived !== 'function') {
            throw new Error('PeerContentRetrievalCoordinator: a PeerContentExchange is required');
        }
        this._exchange = peerContentExchange;
    }

    // Tries each of `peers` (already-authenticated ConnectedPeer
    // instances — this class picks none of them, and applies no
    // authentication check of its own; that stays application/
    // PeerContentExchange.js#request()'s own job, unchanged) in order,
    // up to `timeoutMs` per candidate, until one RESPONSE for exactly
    // `hash` arrives and verifies, or every candidate has been tried.
    // `peers` may be empty — a caller with no live peer to offer gets
    // `{ retrieved: false, attemptedPeers: [], reason: 'no peer
    // candidates were supplied' }`, never an error, the identical
    // "zero connected peers is never an error" restraint application/
    // PublicationPeerExchange.js#announce() already applies one call
    // away.
    //
    // Never re-tries a candidate that already timed out within the same
    // call, and never retries the whole list — a caller that wants a
    // second attempt (a peer reconnected, more time has passed) calls
    // retrieve() again, exactly the "always safe, always re-derives from
    // scratch" posture application/PublicationResolutionCoordinator.js's
    // own header already holds itself to.
    async retrieve(hash, peers, { timeoutMs = PeerContentRetrievalCoordinator.DEFAULT_TIMEOUT_MS } = {}) {
        if (!hash) {
            throw new Error('PeerContentRetrievalCoordinator: a content hash is required');
        }
        const candidates = Array.isArray(peers) ? peers.filter(Boolean) : [];
        const attemptedPeers = [];
        if (!candidates.length) {
            return { retrieved: false, hash, attemptedPeers, reason: 'no peer candidates were supplied' };
        }

        for (const peer of candidates) {
            attemptedPeers.push(peer);
            const arrived = await this._requestFrom(peer, hash, timeoutMs);
            if (arrived) {
                return { retrieved: true, hash, peer, attemptedPeers };
            }
        }
        return {
            retrieved: false, hash, attemptedPeers,
            reason: `none of ${candidates.length} candidate peer(s) responded with verified content before their own timeout`
        };
    }

    // Identical wait-for-one-verified-response shape to application/
    // PublicationResolutionCoordinator.js#_requestFromPeer() — a bounded
    // Promise<boolean> over the same fire-and-forget request()/
    // onContentReceived() pair, duplicated rather than shared because the
    // two classes have no other collaborator in common and neither
    // should import the other merely to reuse nine lines.
    _requestFrom(peer, hash, timeoutMs) {
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
            const unsubscribe = this._exchange.onContentReceived(({ hash: receivedHash }) => {
                if (receivedHash === hash) {
                    finish(true);
                }
            });
            timer = setTimeout(() => finish(false), timeoutMs);
            try {
                this._exchange.request(peer, hash);
            } catch {
                finish(false);
            }
        });
    }
}

// Same default as application/PublicationResolutionCoordinator.js's own
// DEFAULT_TIMEOUT_MS, applied here PER CANDIDATE rather than once per
// call — trying three peers sequentially can therefore take up to 3x as
// long as asking one, the direct, honest cost of "ask several peers"
// over "ask one." A caller that cannot afford that (an impatient UI
// with many candidates) overrides `timeoutMs` per call.
PeerContentRetrievalCoordinator.DEFAULT_TIMEOUT_MS = 8000;
