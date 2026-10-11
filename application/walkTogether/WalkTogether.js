import { openOneOffPeerSession } from '../peer/OneOffPeerSession.js';
import { PartAssembler, sendInParts } from '../peer/ChunkedPeerTransfer.js';
import { decodePublicationLinkPayload, encodePublicationLinkPayload } from '../publication/sharing/PublicationLinkPayload.js';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { signingIdentityId } from '../../peer/RendezvousPublicationSigning.js';
import { EphemeralIdentityProvider } from '../../identity/EphemeralIdentityProvider.js';
import { createWalkTogetherCode, parseWalkTogetherCode } from '../../core/WalkTogetherCode.js';

// "Walk here with me" (docs/Pillars.md, "Your work is yours, and lives in a
// world"): a link that brings a friend into the World you are standing in,
// with no Peers page, no lobby and no invitation to paste back.
//
//   the host, in World View                 a guest, opening the link
//   ───────────────────────                 ─────────────────────────
//   a one-off identity publishes a
//   standing offer on the rendezvous
//   servers; the link names its key ──────► finds the offer by that key and
//   (core/WalkTogetherCode.js)               connects, accepting only that key
//   sends, in parts: its name, the
//   World (its Signed Claim and build,
//   as a link-only share carries
//   them) and an invitation from its
//   own peer session                ──────► checks the World's signature and
//                                            build and keeps it (`openWorld`,
//                                            as a shared link is opened), then
//                                            accepts the invitation with its
//                                            own peer session, expecting the
//                                            host's identity
//   completes that connection       ◄────── sends its reply and its name
//   the two peer sessions authenticate each other's real identities, and
//   avatars, gestures and vehicles travel over that connection as for any
//   connected peer (each side's presence visibility still decides); the
//   one-off connection closes
//
// Only the meeting uses one-off keys (application/peer/OneOffPeerSession.js):
// the rendezvous servers never see either person's identity, and neither is
// made discoverable. The connection that remains is an ordinary peer
// connection, exactly as if an invitation had been pasted on Peers.
//
// One link serves any number of guests while it lasts (WALK_LINK_TTL_MS):
// each standing offer answers one connection, so the host publishes a new
// one as each is taken. A World can be walked together only once it is
// published and signed, since that is what a guest can check.

export const WALK_TOGETHER_PROTOCOL = 'forkbuild:walk-together';
export const WALK_LINK_TTL_MS = 30 * 60 * 1000;
export const JOIN_TIMEOUT_MS = 45 * 1000;
// How long the invitation each guest receives stays open.
const GUEST_INVITATION_TTL_MS = 5 * 60 * 1000;
const SETTLE_BEFORE_CLOSE_MS = 2000;
// Guests still arriving at once; a link someone floods with connections
// turns the rest away until these settle.
const MAX_ARRIVING_GUESTS = 4;
const MAX_NAME_LENGTH = 60;
// What a welcome may be: a link-only World is at most a few megabytes
// packed (PublicationLinkPayload.js unpacks no more than 4 MB).
const MAX_WELCOME_LENGTH = 8 * 1024 * 1024;

export const WalkTogetherStatus = Object.freeze({
    STARTING: 'starting',
    // Host: the link works; guests may come.
    WAITING: 'waiting',
    // Guest: finding the host and receiving the World.
    CONNECTING: 'connecting',
    // Guest: checking the World and connecting the two peer sessions.
    JOINING: 'joining',
    // Guest: walking with the host.
    JOINED: 'joined',
    EXPIRED: 'expired',
    FAILED: 'failed'
});

export const WalkTogetherFailure = Object.freeze({
    // The rendezvous servers can't be reached (or none is configured).
    UNREACHABLE: 'unreachable',
    // Host: not signed in with an identity that can sign.
    NOT_SIGNED_IN: 'notSignedIn',
    // Host: the World isn't a signed, published build this device holds.
    NOT_PUBLISHED: 'notPublished',
    // Guest: the link isn't a walk link.
    INVALID_CODE: 'invalidCode',
    // Guest: nobody is waiting behind this link any more.
    NOT_FOUND: 'notFound',
    // The connection didn't open, or dropped part-way.
    CONNECTION: 'connection',
    // Guest: the World that arrived doesn't check out.
    WORLD_NOT_VERIFIED: 'worldNotVerified'
});

export const WalkTogetherGuestStatus = Object.freeze({
    ARRIVING: 'arriving',
    JOINED: 'joined',
    FAILED: 'failed'
});

export class WalkTogether {
    // peerSessionManager: the app's own, whose connections carry presence.
    // identityProvider: the app's, signed in to walk.
    // peerConnectionProvider / rendezvousTransports: the app's, borrowed for
    //   the one-off meeting.
    constructor({
        peerSessionManager, identityProvider, peerConnectionProvider, rendezvousTransports,
        ttlMs = WALK_LINK_TTL_MS, joinTimeoutMs = JOIN_TIMEOUT_MS, answerPollIntervalMs, answerWatchIntervalMs
    }) {
        if (!peerSessionManager) throw new Error('WalkTogether: peerSessionManager is required');
        if (!identityProvider) throw new Error('WalkTogether: identityProvider is required');
        if (!peerConnectionProvider) throw new Error('WalkTogether: peerConnectionProvider is required');
        this._peerSessionManager = peerSessionManager;
        this._identityProvider = identityProvider;
        this._peerConnectionProvider = peerConnectionProvider;
        this._rendezvousTransports = Array.from(rendezvousTransports || []);
        this._ttlMs = ttlMs;
        this._joinTimeoutMs = joinTimeoutMs;
        this._pollIntervals = {
            ...(answerPollIntervalMs !== undefined ? { answerPollIntervalMs } : {}),
            ...(answerWatchIntervalMs !== undefined ? { answerWatchIntervalMs } : {})
        };
    }

    get available() {
        return this._rendezvousTransports.length > 0;
    }

    // Whether the signed-in identity can walk with someone: the peer
    // connection that carries presence authenticates it.
    canWalk() {
        return Boolean(signingIdentityId(this._identityProvider));
    }

    // Invites guests into `world`: { claim, snapshotText }, the World's
    // signed Publication (its JSON) and its build exactly as the claim's
    // hash covers it. `hostName` is shown to guests. Call start().
    createHost({ world, hostName }) {
        return new WalkTogetherHost(this, { world, hostName });
    }

    // Joins the host behind `code`. `openWorld({ claim, snapshotText })`
    // checks and keeps the World as opening a link-only share does,
    // resolving to { opened, documentId }. `guestName` is shown to the
    // host. Call start().
    createGuest(code, { openWorld, guestName }) {
        return new WalkTogetherGuest(this, code, { openWorld, guestName });
    }

    _openMeeting(identityProvider) {
        return openOneOffPeerSession({
            identityProvider,
            peerConnectionProvider: this._peerConnectionProvider,
            rendezvousTransports: this._rendezvousTransports,
            pollIntervals: this._pollIntervals
        });
    }
}

class WalkSide {
    constructor(walk) {
        this._walk = walk;
        this._listeners = new Set();
        this._timers = new Set();
        this._meeting = null;
        this._closed = false;
        this.state = Object.freeze({ status: WalkTogetherStatus.STARTING });
    }

    // callback(state) on every change. Returns an unsubscribe function.
    onChange(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    // Ends the meeting (the link stops working). Connections already made
    // to the app's own peer session stay. Safe to call twice.
    close() {
        if (this._closed) return;
        this._closed = true;
        for (const timer of this._timers) clearTimeout(timer);
        this._timers.clear();
        if (this._meeting) this._meeting.close();
        this._meeting = null;
    }

    _set(state) {
        this.state = Object.freeze(state);
        for (const listener of Array.from(this._listeners)) listener(this.state);
    }

    _fail(failure) {
        if (this._closed) return;
        this._set({ ...this.state, status: WalkTogetherStatus.FAILED, failure });
        this.close();
    }

    _later(ms, callback) {
        const timer = setTimeout(() => {
            this._timers.delete(timer);
            callback();
        }, ms);
        if (typeof timer.unref === 'function') timer.unref();
        this._timers.add(timer);
    }
}

export class WalkTogetherHost extends WalkSide {
    constructor(walk, { world, hostName }) {
        super(walk);
        this._world = world;
        this._hostName = cleanText(hostName, MAX_NAME_LENGTH);
        // Per one-off connection: { guest, mainConnectionId }.
        this._arrivals = new Map();
        this._guests = [];
    }

    async start() {
        if (!this._walk.available) return this._fail(WalkTogetherFailure.UNREACHABLE);
        if (!this._walk.canWalk()) return this._fail(WalkTogetherFailure.NOT_SIGNED_IN);
        try {
            this._worldPayload = await encodeWorld(this._world);
        } catch {
            this._worldPayload = null;
        }
        if (!this._worldPayload) return this._fail(WalkTogetherFailure.NOT_PUBLISHED);
        if (this._closed) return;
        const identity = new EphemeralIdentityProvider();
        this._meeting = this._walk._openMeeting(identity);
        const { manager, bus } = this._meeting;
        bus.subscribe(WALK_TOGETHER_PROTOCOL, (payload, { connectedPeer }) => this._receive(connectedPeer, payload));
        if (!(await this._publish())) return this._fail(WalkTogetherFailure.UNREACHABLE);
        if (this._closed) return;
        this._expiresAt = new Date(Date.now() + this._walk._ttlMs);
        this._code = createWalkTogetherCode(identity.identityId);
        this._update();
        manager.onPeersChanged((peers) => {
            for (const peer of peers) {
                if (peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && !this._arrivals.has(peer)) this._welcome(peer);
            }
            // Each standing offer answers one guest: put out the next.
            if (!this._closed && !manager.isPublishing() && !this._publishing) this._publish();
        });
        this._later(this._walk._ttlMs, () => {
            this._set({ ...this.state, status: WalkTogetherStatus.EXPIRED });
            this.close();
        });
    }

    // Withdraws the standing offer from the rendezvous servers before the
    // meeting closes, so the link stops working at once rather than when
    // the offer expires.
    close() {
        if (this._closed) return;
        const meeting = this._meeting;
        this._meeting = null;
        super.close();
        if (meeting) {
            meeting.manager.stopPublishing().catch(() => {}).finally(() => meeting.close());
        }
    }

    async _publish() {
        this._publishing = true;
        try {
            const remaining = this._expiresAt ? this._expiresAt.getTime() - Date.now() : this._walk._ttlMs;
            if (remaining <= 0) return false;
            const published = await this._meeting.manager.publishSelf({ ttlMs: remaining });
            return Array.isArray(published) ? published.length > 0 : Boolean(published);
        } catch {
            return false;
        } finally {
            this._publishing = false;
        }
    }

    _update() {
        if (this._closed) return;
        this._set({
            status: WalkTogetherStatus.WAITING,
            code: this._code,
            expiresAt: this._expiresAt,
            guests: this._guests.map((guest) => Object.freeze({ ...guest }))
        });
    }

    async _welcome(peer) {
        if (this._guests.filter((entry) => entry.status === WalkTogetherGuestStatus.ARRIVING).length >= MAX_ARRIVING_GUESTS) {
            this._arrivals.set(peer, null);
            peer.close();
            return;
        }
        const guest = { id: peer.connectionId, name: null, status: WalkTogetherGuestStatus.ARRIVING };
        const arrival = { guest, mainConnectionId: null };
        this._arrivals.set(peer, arrival);
        this._guests.push(guest);
        this._update();
        const { bus } = this._meeting;
        bus.attach(peer);
        peer.onStateChange((state) => {
            if ((state === PeerLifecycleState.CLOSED || state === PeerLifecycleState.FAILED) && guest.status === WalkTogetherGuestStatus.ARRIVING) {
                this._guestFailed(arrival);
            }
        });
        let invitation;
        try {
            const created = await this._walk._peerSessionManager.createInvitation({ ttlMs: GUEST_INVITATION_TTL_MS });
            invitation = created.invitation;
            arrival.mainConnectionId = created.connectedPeer.connectionId;
        } catch {
            return this._guestFailed(arrival, peer);
        }
        if (this._closed) return;
        const welcome = JSON.stringify({ hostName: this._hostName, world: this._worldPayload, invitation: invitation.toJSON() });
        const sent = await sendInParts(bus, peer, WALK_TOGETHER_PROTOCOL, welcome, (part) => ({ type: 'part', ...part }));
        if (!sent) this._guestFailed(arrival, peer);
    }

    async _receive(peer, payload) {
        const arrival = this._arrivals.get(peer);
        if (!arrival || !payload || arrival.guest.status !== WalkTogetherGuestStatus.ARRIVING) return;
        if (payload.type === 'failed') return this._guestFailed(arrival, peer);
        if (payload.type !== 'reply' || typeof payload.reply !== 'string' || !arrival.mainConnectionId || arrival.replied) return;
        arrival.replied = true;
        arrival.guest.name = cleanText(payload.name, MAX_NAME_LENGTH);
        let mainPeer;
        try {
            mainPeer = await this._walk._peerSessionManager.completeConnection(arrival.mainConnectionId, payload.reply);
        } catch {
            return this._guestFailed(arrival, peer);
        }
        whenAuthenticated(mainPeer, this._walk._joinTimeoutMs).then((authenticated) => {
            if (authenticated) {
                arrival.guest.status = WalkTogetherGuestStatus.JOINED;
                this._update();
                this._later(SETTLE_BEFORE_CLOSE_MS, () => peer.close());
            } else {
                this._guestFailed(arrival, peer);
            }
        });
        this._update();
    }

    _guestFailed(arrival, peer = null) {
        if (arrival.guest.status !== WalkTogetherGuestStatus.ARRIVING) return;
        arrival.guest.status = WalkTogetherGuestStatus.FAILED;
        if (arrival.mainConnectionId) {
            const pending = this._walk._peerSessionManager.registry.get(arrival.mainConnectionId);
            if (pending && pending.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
                this._walk._peerSessionManager.disconnect(arrival.mainConnectionId);
            }
        }
        if (peer) peer.close();
        this._update();
    }
}

export class WalkTogetherGuest extends WalkSide {
    constructor(walk, code, { openWorld, guestName }) {
        super(walk);
        this._code = parseWalkTogetherCode(code);
        this._openWorld = openWorld;
        this._guestName = cleanText(guestName, MAX_NAME_LENGTH);
        this._assembler = new PartAssembler({ maxConcurrentTransfers: 1 });
    }

    async start() {
        if (!this._code) return this._fail(WalkTogetherFailure.INVALID_CODE);
        if (!this._walk.available) return this._fail(WalkTogetherFailure.UNREACHABLE);
        this._set({ status: WalkTogetherStatus.CONNECTING });
        this._meeting = this._walk._openMeeting(new EphemeralIdentityProvider());
        this._meeting.bus.subscribe(WALK_TOGETHER_PROTOCOL, (payload, { connectedPeer }) => {
            if (connectedPeer === this._peer && payload && payload.type === 'part') this._acceptPart(payload);
        });
        // Two guests can race for one standing offer; the one that loses
        // finds the next.
        for (let attempt = 0; attempt < 2 && !this._closed; attempt++) {
            const outcome = await this._connect();
            if (outcome !== WalkTogetherFailure.CONNECTION) {
                if (outcome) this._fail(outcome);
                return;
            }
        }
        this._fail(WalkTogetherFailure.CONNECTION);
    }

    // Resolves once a welcome is arriving (null), or to a failure.
    async _connect() {
        const { manager, bus } = this._meeting;
        let records;
        try {
            records = await manager.discoverCandidates(this._code.identityId);
        } catch {
            records = [];
        }
        if (this._closed) return null;
        if (!records || records.length === 0) return WalkTogetherFailure.NOT_FOUND;
        let connected;
        try {
            connected = await manager.connectToDiscovered(records[0], { expectedIdentityId: this._code.identityId });
        } catch {
            connected = null;
        }
        if (this._closed) {
            if (connected) connected.connectedPeer.close();
            return null;
        }
        if (!connected || !connected.delivered) return WalkTogetherFailure.CONNECTION;
        const peer = connected.connectedPeer;
        this._peer = peer;
        bus.attach(peer);
        const welcomed = await new Promise((resolve) => {
            let settled = false;
            const settle = (value) => {
                if (settled) return;
                settled = true;
                unsubscribe();
                resolve(value);
            };
            const unsubscribe = peer.onStateChange((state) => {
                if (state === PeerLifecycleState.CLOSED || state === PeerLifecycleState.FAILED) settle(false);
            });
            this._onWelcomeStarted = () => settle(true);
            this._later(this._walk._joinTimeoutMs, () => settle(false));
        });
        if (this._closed) return null;
        if (welcomed) {
            // The host leaving part-way, or a welcome that never finishes,
            // must end in a failure, not a page that waits for ever.
            peer.onStateChange((state) => {
                if ((state === PeerLifecycleState.CLOSED || state === PeerLifecycleState.FAILED) && this.state.status === WalkTogetherStatus.CONNECTING) {
                    this._fail(WalkTogetherFailure.CONNECTION);
                }
            });
            this._later(this._walk._joinTimeoutMs * 4, () => {
                if (this.state.status === WalkTogetherStatus.CONNECTING) this._fail(WalkTogetherFailure.CONNECTION);
            });
            return null;
        }
        peer.close();
        this._peer = null;
        return WalkTogetherFailure.CONNECTION;
    }

    _acceptPart(part) {
        if (this.state.status !== WalkTogetherStatus.CONNECTING) return;
        if (this._onWelcomeStarted) {
            this._onWelcomeStarted();
            this._onWelcomeStarted = null;
        }
        const result = this._assembler.accept(this._peer.connectionId, part);
        if (result.status === 'rejected' || (result.totalLength && result.totalLength > MAX_WELCOME_LENGTH)) {
            this._reply({ type: 'failed' });
            return this._fail(WalkTogetherFailure.CONNECTION);
        }
        if (result.status === 'complete') this._join(result.text);
    }

    async _join(text) {
        const welcome = parseWelcome(text);
        if (!welcome) {
            this._reply({ type: 'failed' });
            return this._fail(WalkTogetherFailure.CONNECTION);
        }
        this._set({ status: WalkTogetherStatus.JOINING, hostName: welcome.hostName });
        const linkOnly = await decodePublicationLinkPayload(welcome.world);
        let opened = null;
        try {
            opened = linkOnly ? await this._openWorld(linkOnly) : null;
        } catch {
            opened = null;
        }
        if (this._closed) return;
        if (!opened || !opened.opened || !opened.documentId) {
            this._reply({ type: 'failed' });
            return this._fail(WalkTogetherFailure.WORLD_NOT_VERIFIED);
        }
        let accepted;
        try {
            accepted = await this._walk._peerSessionManager.acceptInvitation(welcome.invitation, {
                expectedIdentityId: welcome.invitation.identityHint || null
            });
        } catch {
            accepted = null;
        }
        if (this._closed) {
            if (accepted) accepted.connectedPeer.close();
            return;
        }
        if (!accepted) {
            this._reply({ type: 'failed' });
            return this._fail(WalkTogetherFailure.CONNECTION);
        }
        this._reply({ type: 'reply', reply: accepted.reply, name: this._guestName });
        const authenticated = await whenAuthenticated(accepted.connectedPeer, this._walk._joinTimeoutMs);
        if (this._closed) return;
        if (!authenticated) {
            accepted.connectedPeer.close();
            return this._fail(WalkTogetherFailure.CONNECTION);
        }
        this._set({ status: WalkTogetherStatus.JOINED, hostName: welcome.hostName, documentId: opened.documentId });
        this._later(SETTLE_BEFORE_CLOSE_MS, () => this.close());
    }

    _reply(payload) {
        try {
            this._meeting.bus.send(this._peer, WALK_TOGETHER_PROTOCOL, payload);
        } catch {
            // The host learns nothing more; it sees the connection close.
        }
    }
}

// The World as a link-only payload: the same packing and the same checks
// as a build shared inside a link.
async function encodeWorld(world) {
    if (!world || !world.claim || typeof world.snapshotText !== 'string' || !world.snapshotText) return null;
    const claim = typeof world.claim.toJSON === 'function' ? world.claim.toJSON() : world.claim;
    if (!claim.signature || !claim.publisherIdentity) return null;
    return encodePublicationLinkPayload({ claim, snapshotText: world.snapshotText });
}

function parseWelcome(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.world !== 'string' || !parsed.world) return null;
    if (!parsed.invitation || typeof parsed.invitation !== 'object' || Array.isArray(parsed.invitation)) return null;
    return {
        hostName: cleanText(parsed.hostName, MAX_NAME_LENGTH),
        world: parsed.world,
        invitation: parsed.invitation
    };
}

// Resolves true once `connectedPeer` is authenticated, false when it
// closes, fails or `timeoutMs` passes first.
function whenAuthenticated(connectedPeer, timeoutMs) {
    return new Promise((resolve) => {
        if (connectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED) return resolve(true);
        let settled = false;
        const settle = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            unsubscribe();
            resolve(value);
        };
        const timer = setTimeout(() => settle(false), timeoutMs);
        if (typeof timer.unref === 'function') timer.unref();
        const unsubscribe = connectedPeer.onStateChange((state) => {
            if (state === PeerLifecycleState.AUTHENTICATED) settle(true);
            else if (state === PeerLifecycleState.CLOSED || state === PeerLifecycleState.FAILED) settle(false);
        });
    });
}

function cleanText(value, maxLength) {
    if (typeof value !== 'string') return null;
    const text = value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
    return text || null;
}
