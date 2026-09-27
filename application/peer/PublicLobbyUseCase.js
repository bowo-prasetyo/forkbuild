import { LobbyCard, DEFAULT_LOBBY_CARD_TTL_MS, isValidLobby, normalizeDisplayName } from '../../core/LobbyCard.js';
import { EventBus } from '../../core/events/EventBus.js';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { signLobbyCard, signLobbyLeave } from '../../peer/LobbyCardSigning.js';
import { signingIdentityId } from '../../peer/RendezvousPublicationSigning.js';
import { LocalAuthorizationVerifier } from '../../identity/LocalAuthorizationVerifier.js';
import * as Ed25519 from '../../identity/Ed25519.js';

const CHANGED_EVENT = 'PublicLobbyChanged';
const DISPLAY_NAME_KEY = 'public-lobby-display-name';
const DEFAULT_TICK_INTERVAL_MS = 30 * 1000;
// A card is renewed once it has less than this left, so it never lapses
// between two ticks.
const RENEW_MARGIN_MS = 3 * 60 * 1000;

// The public lobby: an opt-in list of people open to connections from
// strangers, one global lobby plus one per World.
//
// Joining signs a core/LobbyCard.js and sends it to every configured
// rendezvous server, then keeps this device discoverable: the lobby lists
// who is present, never how to reach them, so a stranger connects through
// this device's own rendezvous publication (PeerSessionManager#publishSelf)
// and the answer mailbox, exactly as Find Someone does. One publication
// answers one connection, so it is republished whenever one is spent,
// without asking for a TURN relay credential (see
// PeerSessionManager#createInvitation's `prepareRelay`).
//
// Nothing here is automatic beyond that: listing never connects, and
// connect() is one person's click. A lobby connection is an ordinary
// authenticated peer; friendship still gates chat and voice, the presence
// and profile visibility settings still apply, and blocked identities are
// never listed.
//
// Joining lasts for this session only and is never restored at startup.
export class PublicLobbyUseCase {
    constructor({
        transports = [],
        identityProvider,
        peerSessionManager,
        findPeerUseCase,
        peerBlockUseCase = null,
        storageProvider = null,
        verifier = new LocalAuthorizationVerifier(),
        cardTtlMs = DEFAULT_LOBBY_CARD_TTL_MS,
        tickIntervalMs = DEFAULT_TICK_INTERVAL_MS,
        now = () => new Date()
    } = {}) {
        if (!identityProvider) {
            throw new Error('PublicLobbyUseCase: identityProvider is required');
        }
        if (!peerSessionManager || !findPeerUseCase) {
            throw new Error('PublicLobbyUseCase: peerSessionManager and findPeerUseCase are required');
        }
        this._transports = transports.filter((transport) => transport && typeof transport.joinLobby === 'function');
        this._identityProvider = identityProvider;
        this._peerSessionManager = peerSessionManager;
        this._findPeerUseCase = findPeerUseCase;
        this._peerBlockUseCase = peerBlockUseCase;
        this._storageProvider = storageProvider;
        this._verifier = verifier;
        this._cardTtlMs = cardTtlMs;
        this._tickIntervalMs = tickIntervalMs;
        this._now = now;
        this._eventBus = new EventBus();
        this._joined = new Map(); // lobby -> signed LobbyCard
        this._ownsPublication = false;
        this._republishing = null;
        this._timer = null;
        this._unsubscribePeers = null;
    }

    isAvailable() {
        return this._transports.length > 0;
    }

    isJoined(lobby) {
        return this._joined.has(lobby);
    }

    joinedLobbies() {
        return Array.from(this._joined.keys());
    }

    // The display name this device is listed under in `lobby`, or null
    // when it has not joined it.
    joinedDisplayName(lobby) {
        const card = this._joined.get(lobby);
        return card ? card.displayName : null;
    }

    // Identities this device holds an authenticated connection to right
    // now, so a listing can mark who is already connected.
    connectedIdentityIds() {
        return this._authenticatedIdentityIds();
    }

    // Returns an unsubscribe function. Fires whenever a connection opens,
    // authenticates or closes.
    onConnectionsChanged(callback) {
        return this._peerSessionManager.onPeersChanged(() => callback());
    }

    // The display name used last time, so the join form can offer it again.
    rememberedDisplayName() {
        if (!this._storageProvider) {
            return '';
        }
        try {
            return normalizeDisplayName(this._storageProvider.load(DISPLAY_NAME_KEY) || '');
        } catch {
            return '';
        }
    }

    // Joins `lobby` as the signed-in identity under `displayName`, on every
    // rendezvous server that accepts it, and makes this device
    // discoverable. Rejects when the identity cannot sign or no server
    // accepts the card.
    async join(lobby, { displayName = '' } = {}) {
        if (!isValidLobby(lobby)) {
            throw new Error('PublicLobbyUseCase: that is not a lobby');
        }
        if (!this.isAvailable()) {
            throw new Error('PublicLobbyUseCase: no rendezvous server is configured; add one under Network Settings');
        }
        const identityId = signingIdentityId(this._identityProvider);
        if (!identityId) {
            throw new Error('PublicLobbyUseCase: unlock your identity to join the lobby');
        }
        const name = normalizeDisplayName(displayName);
        const card = await this._sendCard(LobbyCard.create({ identityId, lobby, displayName: name, ttlMs: this._cardTtlMs, now: this._now() }));
        this._joined.set(lobby, card);
        this._rememberDisplayName(name);
        this._start();
        await this._ensureDiscoverable();
        this._emit();
        return card;
    }

    // Withdraws this device's card from `lobby` everywhere, best effort.
    // Leaving the last lobby also withdraws the publication the lobby made.
    async leave(lobby) {
        const card = this._joined.get(lobby);
        if (!card) {
            return false;
        }
        this._joined.delete(lobby);
        const signature = signLobbyLeave(card, this._identityProvider);
        if (signature) {
            await Promise.allSettled(this._transports.map((transport) =>
                transport.leaveLobby({ identityId: card.identityId, lobby: card.lobby, cardId: card.cardId, signature })));
        }
        if (this._joined.size === 0) {
            await this._stop();
        }
        this._emit();
        return true;
    }

    async leaveAll() {
        for (const lobby of this.joinedLobbies()) {
            await this.leave(lobby);
        }
    }

    // The people currently in `lobby`: every card any server lists, kept
    // only when it verifies by its own signature, has not expired, names
    // `lobby`, and is neither this identity nor a blocked one. One entry
    // per identity (its newest card). `total` is the largest count any
    // server reported, which can exceed the sample a server returns.
    async list(lobby) {
        if (!isValidLobby(lobby)) {
            throw new Error('PublicLobbyUseCase: that is not a lobby');
        }
        const now = this._now();
        const self = signingIdentityId(this._identityProvider);
        const settled = await Promise.allSettled(this._transports.map((transport) => transport.listLobby(lobby)));
        const newest = new Map();
        let total = 0;
        let reachable = 0;
        for (const outcome of settled) {
            if (outcome.status !== 'fulfilled' || !outcome.value) {
                continue;
            }
            reachable++;
            total = Math.max(total, Number.isFinite(outcome.value.total) ? outcome.value.total : 0);
            for (const raw of outcome.value.cards || []) {
                const card = this._acceptCard(raw, lobby, now, self);
                const kept = card && newest.get(card.identityId);
                if (card && (!kept || card.publishedAt.getTime() > kept.publishedAt.getTime())) {
                    newest.set(card.identityId, card);
                }
            }
        }
        if (reachable === 0 && this._transports.length > 0) {
            throw new Error('PublicLobbyUseCase: no rendezvous server answered; try again in a moment');
        }
        const connected = this.connectedIdentityIds();
        const members = Array.from(newest.values())
            .map((card) => ({
                identityId: card.identityId,
                displayName: card.displayName,
                lobby: card.lobby,
                publishedAt: card.publishedAt,
                expiresAt: card.expiresAt,
                connected: connected.has(card.identityId)
            }))
            .sort((a, b) => (a.displayName || '￿').localeCompare(b.displayName || '￿') || a.identityId.localeCompare(b.identityId));
        return { members, total: Math.max(total, members.length) };
    }

    // Connects to a lobby member through their rendezvous publication.
    // Resolves to { connectedPeer, alreadyConnected }.
    async connect(identityId) {
        if (!identityId || typeof identityId !== 'string') {
            throw new Error('PublicLobbyUseCase: identityId is required');
        }
        if (this._peerBlockUseCase && this._peerBlockUseCase.isBlocked(identityId)) {
            throw new Error('PublicLobbyUseCase: you have blocked this identity');
        }
        const existing = this._peerSessionManager.listPeers().find((peer) => isAuthenticatedAs(peer, identityId));
        if (existing) {
            return { connectedPeer: existing, alreadyConnected: true };
        }
        const candidates = await this._findPeerUseCase.search(identityId);
        if (!candidates.length) {
            throw new Error('PublicLobbyUseCase: they are not reachable right now (they may be connecting with someone else); try again in a moment');
        }
        const { connectedPeer, delivered } = await this._findPeerUseCase.connect(candidates[0], identityId);
        if (!delivered) {
            connectedPeer.close();
            throw new Error('PublicLobbyUseCase: the rendezvous server could not pass your reply on; unlock your identity and try again');
        }
        return { connectedPeer, alreadyConnected: false };
    }

    // Blocks a lobby member. They were never authenticated, so the public
    // key comes from their did:key id, the same key their card is signed
    // with.
    block(identityId) {
        if (!this._peerBlockUseCase) {
            throw new Error('PublicLobbyUseCase: blocking is not available');
        }
        const publicKeyBytes = Ed25519.didKeyToPublicKey(identityId);
        if (!publicKeyBytes) {
            throw new Error('PublicLobbyUseCase: that is not a did:key identity');
        }
        return this._peerBlockUseCase.block({ identityId, publicKey: Ed25519.bytesToHex(publicKeyBytes), algorithm: 'Ed25519' });
    }

    // Returns an unsubscribe function. Fires whenever the set of joined
    // lobbies changes.
    onChange(callback) {
        const subscription = this._eventBus.subscribe(CHANGED_EVENT, () => callback(this.joinedLobbies()));
        return () => subscription.unsubscribe();
    }

    dispose() {
        this._clearTimer();
        if (this._unsubscribePeers) {
            this._unsubscribePeers();
            this._unsubscribePeers = null;
        }
        this._joined.clear();
    }

    _acceptCard(raw, lobby, now, self) {
        let card;
        try {
            card = raw instanceof LobbyCard ? raw : LobbyCard.fromJSON(raw);
        } catch {
            return null;
        }
        if (card.lobby !== lobby || card.isExpired(now) || card.identityId === self) {
            return null;
        }
        if (this._peerBlockUseCase && this._peerBlockUseCase.isBlocked(card.identityId)) {
            return null;
        }
        return this._verifier.verifyLobbyCard(card).valid ? card : null;
    }

    async _sendCard(unsigned) {
        const card = signLobbyCard(unsigned, this._identityProvider);
        if (!card) {
            throw new Error('PublicLobbyUseCase: unlock your identity to join the lobby');
        }
        const settled = await Promise.allSettled(this._transports.map((transport) => transport.joinLobby(card)));
        if (!settled.some((outcome) => outcome.status === 'fulfilled')) {
            const failure = settled.find((outcome) => outcome.status === 'rejected');
            throw new Error('PublicLobbyUseCase: ' + stripTransportPrefix(failure && failure.reason && failure.reason.message));
        }
        return card;
    }

    // Keeps a publication waiting while any lobby is joined. Concurrent
    // calls share one attempt.
    async _ensureDiscoverable() {
        if (this._joined.size === 0 || this._peerSessionManager.isPublishing()) {
            return;
        }
        if (!this._republishing) {
            // Assigned before publishSelf() runs: it adds a pending peer
            // synchronously, and the onPeersChanged listener must already
            // see this attempt rather than start another.
            this._republishing = Promise.resolve().then(async () => {
                try {
                    const published = await this._peerSessionManager.publishSelf({ prepareRelay: false });
                    if (published && this._joined.size === 0) {
                        // Every lobby was left while this offer was being
                        // prepared: withdraw it rather than stay findable.
                        await this._peerSessionManager.stopPublishing();
                    } else if (published) {
                        this._ownsPublication = true;
                    }
                } catch {
                    // Retried on the next tick.
                } finally {
                    this._republishing = null;
                }
            });
        }
        await this._republishing;
    }

    async _renewCards() {
        const now = this._now().getTime();
        for (const [lobby, card] of this._joined) {
            if (card.expiresAt.getTime() - now > RENEW_MARGIN_MS) {
                continue;
            }
            try {
                const renewed = await this._sendCard(LobbyCard.create({
                    identityId: card.identityId,
                    lobby,
                    displayName: card.displayName,
                    ttlMs: this._cardTtlMs,
                    now: this._now()
                }));
                if (this._joined.has(lobby)) {
                    this._joined.set(lobby, renewed);
                }
            } catch {
                // Tried again on the next tick; the old card is still listed until it expires.
            }
        }
    }

    _start() {
        if (!this._unsubscribePeers) {
            // A spent publication (someone connected) is replaced at once
            // rather than on the next tick.
            this._unsubscribePeers = this._peerSessionManager.onPeersChanged(() => {
                if (this._joined.size > 0 && !this._republishing && !this._peerSessionManager.isPublishing()) {
                    this._ensureDiscoverable();
                }
            });
        }
        if (!this._timer) {
            this._schedule();
        }
    }

    _schedule() {
        this._timer = setTimeout(async () => {
            this._timer = null;
            if (this._joined.size === 0) {
                return;
            }
            await this._renewCards();
            await this._ensureDiscoverable();
            if (this._joined.size > 0 && !this._timer) {
                this._schedule();
            }
        }, this._tickIntervalMs);
        // Never keeps a Node test process alive on its own.
        if (this._timer && typeof this._timer.unref === 'function') {
            this._timer.unref();
        }
    }

    async _stop() {
        this._clearTimer();
        if (this._unsubscribePeers) {
            this._unsubscribePeers();
            this._unsubscribePeers = null;
        }
        // An attempt still in flight withdraws its own offer when it lands
        // (see _ensureDiscoverable), so leaving never waits for ICE gathering.
        if (this._ownsPublication) {
            this._ownsPublication = false;
            try {
                await this._peerSessionManager.stopPublishing();
            } catch {
                // Best effort, like every other withdrawal.
            }
        }
    }

    _clearTimer() {
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
    }

    _authenticatedIdentityIds() {
        const ids = new Set();
        for (const peer of this._peerSessionManager.listPeers()) {
            if (peer.remoteIdentity && peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED) {
                ids.add(peer.remoteIdentity.identityId);
            }
        }
        return ids;
    }

    _rememberDisplayName(name) {
        if (!this._storageProvider) {
            return;
        }
        try {
            this._storageProvider.save(DISPLAY_NAME_KEY, name);
        } catch {
            // Remembering the name is a convenience only.
        }
    }

    _emit() {
        this._eventBus.publish(CHANGED_EVENT, {});
    }
}

function isAuthenticatedAs(peer, identityId) {
    return peer.remoteIdentity
        && peer.remoteIdentity.identityId === identityId
        && peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED;
}

function stripTransportPrefix(message) {
    return String(message || 'no rendezvous server accepted the lobby card')
        .replace(/^WebSocketRendezvousTransport:\s*/, '')
        .replace(/^JOIN_LOBBY:\s*/, '');
}
