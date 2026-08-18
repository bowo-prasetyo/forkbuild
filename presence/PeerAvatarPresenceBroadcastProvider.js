import { AvatarPresenceBroadcastProvider } from './AvatarPresenceBroadcastProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PresenceVisibilityPolicy } from '../core/PresenceVisibilityPolicy.js';

// 0.2.53 — the SECOND real implementation of
// presence/AvatarPresenceBroadcastProvider.js's interface, alongside
// presence/LocalAvatarPresenceBroadcastProvider.js's BroadcastChannel
// one: "Replace BroadcastChannel as the primary remote-presence
// transport with authenticated peer messaging, while preserving the
// entire 0.2.38 presence trust model." Nothing above this file's
// interface changed to make that true — application/PresenceSyncService.js,
// application/LocalPresenceStore.js, application/PresenceTrustBoundary.js,
// core/PresenceIngestion.js, core/PresenceAuthority.js,
// core/PresenceReplayWindow.js, core/PresenceEquivocation.js, and
// core/PresenceFreshness.js are every one of them completely
// untouched by this milestone — the same "transport is a pluggable
// substitution, not a redesign" contract 0.2.37 already established
// when BroadcastChannel itself was introduced.
//
// Sits on peer/PeerMessageBus.js and application/ConnectedPeerRegistry.js
// — nothing lower. Never imports peer/PeerConnection.js,
// peer/WebRtcPeerConnection.js, or peer/LocalPeerConnectionProvider.js
// directly, exactly like every other PeerMessageBus consumer (see
// docs/Principles.md, "A Peer Connection Transports Messages; It Does
// Not Interpret Them," 0.2.52) — this class has no idea, and no need
// to know, whether the connection underneath is in-process or a real
// RTCDataChannel.
//
// The one genuinely new architectural fact a point-to-point transport
// introduces: presence is no longer a single broadcast to "everyone on
// this origin," it is N independent one-to-one sends, one per
// AUTHENTICATED peer connection this replica currently has — and
// WHICH of those N sends actually happens is decided HERE, per peer,
// by core/PresenceVisibilityPolicy.js#shouldAdvertiseToPeer(), never
// inside AvatarPresenceAdvertisement (the wire shape stays exactly
// what 0.2.37 defined — no recipient, no visibility tier, no friend
// list ever travels on it) and never inside PresenceSyncService/
// WorldNavigationSession (which still only ever call publish(
// advertisement) — see docs/Principles.md, "Peer Selection Is A
// Transport Concern, Never A Presence-Core Concern"). The coarse,
// parameter-free shouldAdvertise() gate WorldNavigationSession already
// consults BEFORE calling publish() at all (0.2.40, unchanged) still
// applies first — HIDDEN and an empty FRIENDS list still mean publish()
// is never even called; this class's per-peer check is a SECOND,
// finer-grained gate that only matters once publish() has already
// decided there is something to send.
export class PeerAvatarPresenceBroadcastProvider extends AvatarPresenceBroadcastProvider {
    // peerMessageBus / connectedPeerRegistry: this replica's OWN
    // peer/PeerMessageBus.js and application/ConnectedPeerRegistry.js
    // — shared, injected collaborators this class never owns and never
    // disposes (see dispose() below), because a future Peer-Based
    // Avatar Profile/Interaction transport (0.2.54/0.2.55, proposed)
    // attaches those exact same peers to that exact same bus.
    //
    // getVisibilityPolicy: a zero-argument function returning the
    // CURRENT PresenceVisibilityPolicy, called fresh on every
    // advertise() — never cached — so a policy edit (switching FRIENDS
    // to PUBLIC, adding an authorized peer) takes effect on the very
    // next movement, exactly like WorldNavigationSession's own
    // `_presenceVisibilityUseCase.getPolicy()` call already does one
    // layer up. Defaults to PresenceVisibilityPolicy.default() (PUBLIC,
    // nobody excluded) — a caller that wires this transport without a
    // real policy gets the exact same "advertise to everyone eligible"
    // behavior 0.2.37 had before visibility existed at all, matching
    // presence's own established "no policy wired = always advertise"
    // backward-compatible default (see WorldNavigationSession's E4
    // test in tests/AvatarPresenceVisibility.test.js).
    //
    // protocol: the peer/PeerMessage.js protocol name this transport
    // sends/subscribes under. Defaults to the SAME string
    // LocalAvatarPresenceBroadcastProvider's own default BroadcastChannel
    // name already uses — one wire shape, one logical protocol
    // identity, travelling over two different transports; there is no
    // reason for it to be spelled two different ways.
    //
    // isFriend: 0.2.58 addition — a zero-arg-per-call function
    // `(peerIdentityId) => boolean`, called fresh on every advertise()
    // for every candidate peer, never cached, mirroring
    // getVisibilityPolicy's own "always current, never stale" contract.
    // This transport never imports core/FriendshipRecord.js,
    // core/FriendshipState.js, or application/FriendRelationshipUseCase.js
    // itself — it only knows how to ask the injected predicate and pass
    // its answer straight through as `shouldAdvertiseToPeer`'s
    // `{ isFriend }` context, keeping the actual friendship STORE
    // entirely the caller's concern (see docs/Principles.md, "Peer
    // Selection Is A Transport Concern, Never A Presence-Core Concern,"
    // extended here one layer further: even THIS transport, which does
    // do peer selection, never reads a friendship store directly — it
    // reads a predicate its caller closed over one). Defaults to
    // `() => false` — a caller that never wires friendship awareness
    // gets EXACTLY 0.2.53's own behavior: FRIENDS still works via
    // authorizedPeerIdentities alone, nothing silently changes.
    constructor({
        peerMessageBus,
        connectedPeerRegistry,
        getVisibilityPolicy = () => PresenceVisibilityPolicy.default(),
        isFriend = () => false,
        protocol = PeerAvatarPresenceBroadcastProvider.DEFAULT_PROTOCOL
    } = {}) {
        super();
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('PeerAvatarPresenceBroadcastProvider: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('PeerAvatarPresenceBroadcastProvider: a ConnectedPeerRegistry is required');
        }
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._getVisibilityPolicy = getVisibilityPolicy;
        this._isFriend = isFriend;
        this._protocol = protocol;

        // Every peer already connected when this transport is built,
        // and every one that connects afterward, is attached to the
        // shared bus. attach() is idempotent per connectionId (a
        // second attach() for the same peer is a no-op — see
        // peer/PeerMessageBus.js's own header) and self-detaches the
        // instant a peer's lifecycle reaches CLOSED/FAILED, so this
        // never needs to be undone by hand and never double-delivers.
        for (const peer of this._registry.list()) {
            this._bus.attach(peer);
        }
        this._unsubscribeRegistry = this._registry.onChange((peers) => {
            for (const peer of peers) {
                this._bus.attach(peer);
            }
        });
    }

    // ADVERTISE (see application/PresenceSyncService.js's own header):
    // fans ONE local advertisement out to zero or more of this
    // replica's currently-AUTHENTICATED peer connections. Discovery is
    // never performed here and no connection is ever opened as a side
    // effect of publishing — see docs/Principles.md, "Presence Never
    // Establishes A Connection" — this method only ever iterates
    // connections that already exist, right now, in
    // connectedPeerRegistry.list().
    //
    // Never puts recipient, visibility tier, or the authorized-peer
    // list on the wire: every peer that IS selected receives the
    // IDENTICAL `advertisement` object PresenceSyncService.publish()
    // was called with, byte-for-byte the same shape
    // presence/LocalAvatarPresenceBroadcastProvider.js already sends
    // over BroadcastChannel.
    //
    // Fire-and-forget per peer, exactly like every other
    // AvatarPresenceBroadcastProvider — a single peer's connection
    // dropping between the AUTHENTICATED check and send() never blocks
    // or throws for the caller, and never stops the fan-out to the
    // remaining peers.
    advertise(advertisement) {
        const policy = this._getVisibilityPolicy();
        for (const peer of this._registry.list()) {
            if (typeof peer.getLifecycleState !== 'function' || peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
                continue;
            }
            const peerIdentity = peer.remoteIdentity;
            const peerIdentityId = peerIdentity ? peerIdentity.identityId : null;
            const isFriend = peerIdentityId ? Boolean(this._isFriend(peerIdentityId)) : false;
            if (!policy.shouldAdvertiseToPeer(peerIdentityId, { isFriend })) {
                continue;
            }
            try {
                this._bus.send(peer, this._protocol, advertisement);
            } catch {
                // A peer's lifecycle can change between the check above
                // and this call (e.g. the connection closes mid-loop);
                // PeerMessageBus.send() throws rather than queuing, and
                // this transport degrades that into exactly the silent,
                // best-effort drop a BroadcastChannel send already is.
            }
        }
    }

    // Registers to receive every future advertisement arriving under
    // this transport's protocol, from ANY attached, authenticated peer
    // — PeerMessageBus.subscribe() already supports multiple
    // concurrent handlers per protocol, so calling onAdvertisement()
    // more than once on the same instance works exactly like
    // LocalAvatarPresenceBroadcastProvider's own Set-of-listeners does.
    // `meta` (sender identity, protocol, messageId) is deliberately
    // dropped here — PresenceSyncService's own inbox only ever wanted
    // the raw advertisement, matching the BroadcastChannel transport's
    // event.data-only callback shape exactly.
    onAdvertisement(callback) {
        return this._bus.subscribe(this._protocol, (payload) => callback(payload));
    }

    dispose() {
        if (this._unsubscribeRegistry) {
            this._unsubscribeRegistry();
            this._unsubscribeRegistry = null;
        }
        // Deliberately does NOT dispose the injected peerMessageBus or
        // connectedPeerRegistry — both are shared collaborators that
        // outlive any one protocol's transport wrapper; this class only
        // ever releases what IT subscribed.
    }
}

// Deliberately the SAME string LocalAvatarPresenceBroadcastProvider's
// own DEFAULT_CHANNEL_NAME already uses — one logical protocol
// identity for avatar presence, regardless of which transport carries
// it.
PeerAvatarPresenceBroadcastProvider.DEFAULT_PROTOCOL = 'forkbuild:avatar-presence';
