import { PeerDiscoveryProvider } from './PeerDiscoveryProvider.js';
import { LocalPeerDiscoveryProvider } from './LocalPeerDiscoveryProvider.js';

// 0.2.65 — the bootstrap problem, made explicit rather than solved: "how
// does Alice find the rendezvous network at all, without already knowing
// someone in it?" This class does not answer that question with one
// permanent, hard-coded authority — it answers it by making "which
// discovery mechanisms this device currently trusts enough to ask" an
// explicit, inspectable, and CHANGEABLE list, itself just another
// PeerDiscoveryProvider — so application/FindPeerUseCase.js and
// application/PeerSessionManager.js never have to know or care how many
// mechanisms are behind it, exactly the same seam peer/
// PeerDiscoveryProvider.js's own header already promised for LAN, a
// rendezvous service, or a DHT.
//
//   DiscoveryBootstrap
//       - localProvider          "manual" — an out-of-band invitation
//                                 (QR code, copy/paste), imported the
//                                 exact same way 0.2.50 always has. This
//                                 IS "an imported bootstrap invitation":
//                                 nothing new is needed for it, because a
//                                 bootstrap peer is just a peer.
//       - bootstrapProviders     "configured bootstrap peers" — zero or
//                                 more OTHER PeerDiscoveryProvider
//                                 instances (today: peer/
//                                 RendezvousDiscoveryProvider.js, one per
//                                 configured rendezvous node; tomorrow:
//                                 LAN, a DHT, anything satisfying the same
//                                 contract) that this device additionally
//                                 asks on every discover().
//
// Every method here is pure fan-out-and-merge: importInvitation() always
// goes to the local provider (out-of-band relay never touches "the
// network," see peer/PeerDiscoverySource.js), while list()/discover() ask
// EVERY configured provider and merge their results. A bootstrap provider
// that throws or times out (a rendezvous node that is temporarily
// unreachable) is skipped for that call, never allowed to fail the whole
// search — the same "one bad source degrades the result, never breaks it"
// posture peer/RendezvousDiscoveryProvider.js already established one
// layer down, now applied across SOURCES rather than within one. See
// docs/Principles.md, "A Bootstrap List Is Configuration, Never An
// Authority" (0.2.65).
export class DiscoveryBootstrap extends PeerDiscoveryProvider {
    constructor({ localProvider = new LocalPeerDiscoveryProvider(), bootstrapProviders = [] } = {}) {
        super();
        if (!localProvider || typeof localProvider.discover !== 'function') {
            throw new Error('DiscoveryBootstrap: a localProvider (a PeerDiscoveryProvider) is required');
        }
        this._localProvider = localProvider;
        this._discoveredListeners = new Set();
        this._bootstrapUnsubscribes = new Map(); // provider -> unsubscribe
        this._localUnsubscribe = this._wireListener(this._localProvider);
        for (const provider of bootstrapProviders) {
            this.addBootstrapProvider(provider);
        }
    }

    get localProvider() { return this._localProvider; }
    get bootstrapProviders() { return Array.from(this._bootstrapUnsubscribes.keys()); }

    addBootstrapProvider(provider) {
        if (!provider || typeof provider.discover !== 'function') {
            throw new Error('DiscoveryBootstrap: a bootstrap provider must be a PeerDiscoveryProvider');
        }
        if (this._bootstrapUnsubscribes.has(provider)) {
            return;
        }
        this._bootstrapUnsubscribes.set(provider, this._wireListener(provider));
    }

    removeBootstrapProvider(provider) {
        const unsubscribe = this._bootstrapUnsubscribes.get(provider);
        if (!unsubscribe) {
            return;
        }
        unsubscribe();
        this._bootstrapUnsubscribes.delete(provider);
    }

    // Manual/QR/out-of-band path — always the local provider, exactly like
    // 0.2.50 and 0.2.64 already established. An invitation someone hands
    // Alice to a BOOTSTRAP peer is imported no differently than any other
    // — see this file's own header on why nothing new was needed here.
    importInvitation(invitation) {
        return this._localProvider.importInvitation(invitation);
    }

    // Every currently-fresh record any configured provider (local or
    // bootstrap) currently holds in ITS OWN cache — never a live network
    // hit; see discover() below for that. Merged by peerDiscoveryId, which
    // every provider mints independently, so a collision across two
    // different providers is not a realistic concern.
    list() {
        const merged = new Map();
        for (const record of this._localProvider.list()) {
            merged.set(record.peerDiscoveryId, record);
        }
        for (const provider of this._bootstrapUnsubscribes.keys()) {
            for (const record of provider.list()) {
                merged.set(record.peerDiscoveryId, record);
            }
        }
        return Array.from(merged.values());
    }

    // Fans `identityId` out to the local provider AND every configured
    // bootstrap provider, tolerating any one of them throwing OR (0.2.66)
    // rejecting (a rendezvous node that is down, or simply doesn't
    // recognize `identityId`) without losing the others' results. TWO
    // DIFFERENT providers legitimately returning two different candidates
    // for the same identityId are BOTH kept, unmerged — exactly the same
    // "a different endpoint claiming the same identity is never silently
    // collapsed" discipline docs/Principles.md already established for a
    // single provider under 0.2.64, now holding across providers too: a
    // malicious or merely stale bootstrap node's answer is never allowed
    // to crowd out an honest one, or vice versa. Only application/
    // FindPeerUseCase.js's authentication step ever decides between them.
    //
    // 0.2.66 — async, and every bootstrap provider is asked CONCURRENTLY
    // (Promise.allSettled), never one after another: a real network round
    // trip to peer/WebSocketRendezvousTransport.js has real latency, and
    // querying N configured rendezvous nodes should cost roughly the
    // slowest ONE of them, not their sum. The local provider is still
    // read first and synchronously — it never touches a transport, so
    // there is nothing to gain by including it in the same fan-out.
    async discover(identityId) {
        if (!identityId || typeof identityId !== 'string') {
            throw new Error('DiscoveryBootstrap: identityId is required');
        }
        const merged = new Map();
        for (const record of this._localProvider.discover(identityId)) {
            merged.set(record.peerDiscoveryId, record);
        }
        const providers = Array.from(this._bootstrapUnsubscribes.keys());
        // A provider whose discover() throws SYNCHRONOUSLY (every
        // PeerDiscoveryProvider before 0.2.66 did, and a hand-rolled fake
        // still might — see tests/DistributedPeerRendezvous.test.js's own
        // `brokenProvider`) must degrade exactly like one that rejects
        // asynchronously; wrapping the call in Promise.resolve()/reject()
        // here is what keeps Promise.allSettled() itself from ever seeing
        // that throw escape .map() before it can even run.
        const settled = await Promise.allSettled(providers.map((provider) => {
            try {
                return Promise.resolve(provider.discover(identityId));
            } catch (e) {
                return Promise.reject(e);
            }
        }));
        for (const outcome of settled) {
            if (outcome.status !== 'fulfilled') {
                continue; // one unreachable/misbehaving bootstrap provider never blocks the others
            }
            for (const record of outcome.value) {
                merged.set(record.peerDiscoveryId, record);
            }
        }
        return Array.from(merged.values()).sort((a, b) => b.discoveredAt.getTime() - a.discoveredAt.getTime());
    }

    forget(peerDiscoveryId) {
        this._localProvider.forget(peerDiscoveryId);
        for (const provider of this._bootstrapUnsubscribes.keys()) {
            provider.forget(peerDiscoveryId);
        }
    }

    onDiscovered(callback) {
        this._discoveredListeners.add(callback);
        return () => this._discoveredListeners.delete(callback);
    }

    // "Be discoverable, everywhere configured." Pushes `invitationInput`
    // to every bootstrap provider that knows how to PUBLISH (see peer/
    // RendezvousDiscoveryProvider.js#publish) — silently skips any
    // provider that doesn't support publication (a future receive-only
    // LAN provider, say). Never touches the local provider: publishing is
    // "make ME findable," a completely different act from
    // importInvitation()'s "make THIS invitation of SOMEONE ELSE'S
    // findable to me." Returns every publication actually made. Async —
    // publish() itself is (see peer/RendezvousDiscoveryProvider.js's own
    // header) — and, unlike discover() above, deliberately NOT tolerant
    // of one provider's publish() failing: "be discoverable" is a
    // deliberate act a caller should learn about failing, never a
    // best-effort background refresh the way a LOOKUP degrading is.
    async publishToAll(invitationInput, options) {
        const publications = [];
        for (const provider of this._bootstrapUnsubscribes.keys()) {
            if (typeof provider.publish === 'function') {
                publications.push(await provider.publish(invitationInput, options));
            }
        }
        return publications;
    }

    // 0.2.66 — the fan-out counterpart to publishToAll() above: withdraws
    // this device's own publication from every configured bootstrap
    // provider that supports unpublish(). Tolerates any one provider
    // failing to confirm withdrawal — unlike publishToAll() (a deliberate
    // act worth surfacing a failure for), a best-effort "stop being
    // findable" is still worth attempting everywhere else even when one
    // node cannot be reached, exactly the same degrade-not-fail posture
    // discover() above already applies to LOOKUP.
    async unpublishFromAll() {
        for (const provider of this._bootstrapUnsubscribes.keys()) {
            if (typeof provider.unpublish === 'function') {
                try { await provider.unpublish(); } catch { /* one node failing to confirm withdrawal never blocks the others */ }
            }
        }
    }

    dispose() {
        this._localUnsubscribe();
        for (const unsubscribe of this._bootstrapUnsubscribes.values()) {
            unsubscribe();
        }
        this._bootstrapUnsubscribes.clear();
        this._discoveredListeners.clear();
    }

    _wireListener(provider) {
        return provider.onDiscovered((record) => {
            for (const listener of this._discoveredListeners) {
                listener(record);
            }
        });
    }
}
