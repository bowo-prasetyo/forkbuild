import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';

// The builds you helped make (HelpedBuildsStore.js), on each of your devices:
// whenever another device of yours is connected (a sibling: its connection
// resolves to the same identity this device acts for, as
// application/chat/DeviceConversationSyncUseCase.js decides), each sends the
// other its list, and each build noted later goes to the siblings connected
// then. Lists only ever go to your own devices, and only lists for the
// identity you share are taken in. Your Data's backup and copy carry the list
// too, for a device that is never connected at the same time.

export const HELPED_BUILDS_PROTOCOL = 'forkbuild:helped-builds';
const MAX_SENT = 100;

export class HelpedBuildsSyncUseCase {
    constructor({ peerMessageBus, connectedPeerRegistry, deviceAuthorization, store, protocol = HELPED_BUILDS_PROTOCOL }) {
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function') {
            throw new Error('HelpedBuildsSyncUseCase: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function') {
            throw new Error('HelpedBuildsSyncUseCase: a ConnectedPeerRegistry is required');
        }
        if (!deviceAuthorization || typeof deviceAuthorization.resolveConnectionIdentity !== 'function' || typeof deviceAuthorization.resolveOwnSocialIdentity !== 'function') {
            throw new Error('HelpedBuildsSyncUseCase: a DeviceAuthorizationPropagationUseCase is required');
        }
        if (!store || typeof store.merge !== 'function' || typeof store.onNoted !== 'function') {
            throw new Error('HelpedBuildsSyncUseCase: a HelpedBuildsStore is required');
        }
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._deviceAuth = deviceAuthorization;
        this._store = store;
        this._protocol = protocol;
        // Connections already sent the whole list.
        this._sentTo = new WeakSet();

        const attachAll = (peers) => {
            for (const peer of peers) {
                if (typeof this._bus.attach === 'function') this._bus.attach(peer);
                this._sendListIfSibling(peer);
            }
        };
        attachAll(this._registry.list());
        this._unsubscribeRegistry = typeof this._registry.onChange === 'function' ? this._registry.onChange(attachAll) : null;
        this._unsubscribeBus = this._bus.subscribe(this._protocol, (payload, meta) => this._receive(payload, meta && meta.connectedPeer));
        this._unsubscribeStore = this._store.onNoted((identityId, entry) => this._shareNoted(identityId, entry));
    }

    // The identity this device acts for (its own, or the one it is an
    // authorized device of): the key the list is kept under.
    ownIdentityId() {
        try {
            return this._deviceAuth.resolveOwnSocialIdentity()?.identityId || null;
        } catch {
            return null;
        }
    }

    dispose() {
        if (this._unsubscribeRegistry) this._unsubscribeRegistry();
        if (this._unsubscribeBus) this._unsubscribeBus();
        if (this._unsubscribeStore) this._unsubscribeStore();
        this._unsubscribeRegistry = this._unsubscribeBus = this._unsubscribeStore = null;
    }

    _isSibling(peer) {
        if (!peer || typeof peer.getLifecycleState !== 'function' || peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED || !peer.remoteIdentity) return false;
        const own = this.ownIdentityId();
        let remote = null;
        try {
            remote = this._deviceAuth.resolveConnectionIdentity(peer);
        } catch {
            remote = null;
        }
        return Boolean(own) && Boolean(remote) && remote.identityId === own;
    }

    _sendListIfSibling(peer) {
        if (this._sentTo.has(peer) || !this._isSibling(peer)) return;
        const identityId = this.ownIdentityId();
        const entries = this._store.list(identityId).slice(0, MAX_SENT);
        this._sentTo.add(peer);
        if (entries.length > 0) this._send(peer, { kind: 'list', identityId, entries });
    }

    _shareNoted(identityId, entry) {
        if (!identityId || identityId !== this.ownIdentityId()) return;
        for (const peer of this._registry.list()) {
            if (this._isSibling(peer)) this._send(peer, { kind: 'list', identityId, entries: [entry] });
        }
    }

    _receive(payload, peer) {
        if (!payload || payload.kind !== 'list' || !Array.isArray(payload.entries) || !this._isSibling(peer)) return;
        const identityId = this.ownIdentityId();
        if (payload.identityId !== identityId) return;
        this._store.merge(identityId, payload.entries);
        // A sibling that connected before this one had anything to send
        // still gets the list once.
        this._sendListIfSibling(peer);
    }

    _send(peer, message) {
        try {
            this._bus.send(peer, this._protocol, message);
        } catch {
            // It catches up on the next connection.
        }
    }
}
