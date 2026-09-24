import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { EventBus } from '../../core/events/EventBus.js';
import { AvatarInventoryEntry, withEntryAdded, withEntryRemoved } from '../../core/AvatarInventory.js';
import { createId } from '../../core/createId.js';
import {
    AvatarInventoryTransferPeerMessageKind,
    toAvatarInventoryTransferOfferMessage,
    toAvatarInventoryTransferAcceptMessage,
    toAvatarInventoryTransferDeclineMessage,
    isValidAvatarInventoryTransferPeerMessage
} from './AvatarInventoryTransferPeerProtocol.js';

const OFFER_RECEIVED_EVENT = 'AvatarInventoryTransferOfferReceived';
const OFFER_ACCEPTED_EVENT = 'AvatarInventoryTransferOfferAccepted';
const OFFER_DECLINED_EVENT = 'AvatarInventoryTransferOfferDeclined';
const OFFER_WITHDRAWN_EVENT = 'AvatarInventoryTransferOfferWithdrawn';

// Send An Avatar Inventory Entry To Another Avatar's Inventory.
//
// The application/anchoring/PublicationAnchorPeerExchange.js shape, applied to one
// carried core/AvatarInventory.js entry instead of a signed anchor claim:
// attach to every application/peer/ConnectedPeerRegistry.js peer (now and in
// the future, via its own onChange), subscribe to this file's own
// DEFAULT_PROTOCOL, and route OFFER/ACCEPT/DECLINE traffic against the
// injected application/avatar/AvatarInventoryStore.js — the ONE owner of the
// local avatar's carried entries (see that file's own header). This class
// never decides what gets sent or when; a caller (ordinarily a future
// inventory panel) calls sendOffer()/acceptOffer()/declineOffer()
// explicitly, exactly the same "no policy of its own" restraint
// AvatarInventoryStore itself already holds.
//
// THERE IS NO SERVER HOLDING A PENDING TRANSFER. Unlike a real-world
// package, an entry offered here has nowhere to sit "in transit" — it
// either still belongs to the sender (nothing sent yet, or the recipient
// hasn't answered), or it belongs to the recipient (accepted), or it went
// back to the sender (declined, or the recipient disconnected before
// answering). This class enforces that with an ESCROW discipline:
// sendOffer() removes the entry from the sender's OWN inventory the
// moment the OFFER is actually sent — never earlier, never left in place
// — so the sender can never simultaneously deploy/release the same entry
// elsewhere while an offer for it is outstanding (which would otherwise
// let one carried entry become two, one on each device). The entry is
// restored to the sender's inventory if, and only if, the offer is
// DECLINEd or the recipient disconnects before answering (`_handleRegistryChange`
// below) — never merely because time passed.
//
// A KNOWN, DELIBERATELY ACCEPTED RACE: peer/PeerMessageBus.js gives no
// delivery guarantee beyond "the connection is still open." If a
// recipient's ACCEPT is sent but the connection drops before the sender
// receives it, the sender's disconnect handling restores its own escrowed
// entry — and the recipient, who already added the entry to their own
// inventory the moment they called acceptOffer(), keeps it too. The
// result is the same entry id counted twice, once on each device, until
// one side stores/deploys/catches/releases it and the mismatch becomes
// visible. This is the identical class of gap peer/PeerMessageBus.js's
// own header already accepts for every protocol built on it (no
// acknowledgement, retry, or exactly-once delivery of any kind) — closing
// it for real would mean a delivery-confirmed transport this codebase does
// not have, not a fix local to this one protocol.
//
// PEER IDENTITY IS INFORMATIONAL ONLY, the identical restraint application/
// PublicationAnchorPeerExchange.js's own header already draws: an incoming
// OFFER is accepted or declined on the strength of the connection being
// AUTHENTICATED (peer/PeerMessageBus.js's own gate — an unauthenticated
// peer has no message channel at all), never on any notion of "trusted
// peer" this class introduces. Anyone this device has a live authenticated
// connection to can offer it an entry; declining one is always available.
export class AvatarInventoryTransferPeerExchange {
    constructor(avatarInventoryStore, peerMessageBus, connectedPeerRegistry, {
        protocol = AvatarInventoryTransferPeerExchange.DEFAULT_PROTOCOL
    } = {}) {
        if (!avatarInventoryStore || typeof avatarInventoryStore.get !== 'function' || typeof avatarInventoryStore.set !== 'function') {
            throw new Error('AvatarInventoryTransferPeerExchange: an AvatarInventoryStore is required');
        }
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('AvatarInventoryTransferPeerExchange: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('AvatarInventoryTransferPeerExchange: a ConnectedPeerRegistry is required');
        }
        this._store = avatarInventoryStore;
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._protocol = protocol;
        this._eventBus = new EventBus();

        // offerId -> { entry: AvatarInventoryEntry, connectionId } — an
        // entry THIS device escrowed out of its own inventory and is
        // waiting on an ACCEPT/DECLINE for.
        this._pendingOutgoing = new Map();
        // offerId -> { entry: AvatarInventoryEntry, connectedPeer } — an
        // entry another device offered THIS one, waiting on this device's
        // own acceptOffer()/declineOffer() call.
        this._pendingIncoming = new Map();

        for (const peer of this._registry.list()) {
            this._bus.attach(peer);
        }
        this._unsubscribeRegistry = this._registry.onChange((peers) => this._handleRegistryChange(peers));
        this._unsubscribeBus = this._bus.subscribe(this._protocol, (payload, meta) => this._handleIncoming(payload, meta));
    }

    // Sends the carried entry named `entryId` to `peer`. `peer` must be a
    // ConnectedPeer this device is, right now, AUTHENTICATED with — the
    // same requirement peer/PeerMessageBus.js#send() would enforce anyway,
    // checked HERE first so a failure never leaves the entry escrowed out
    // of the sender's own inventory with nowhere for it to have gone.
    // Throws if `entryId` names nothing currently carried. Returns the new
    // offerId — a caller (ordinarily a future inventory panel) uses it only
    // to recognize which later onOfferAccepted()/onOfferDeclined()/
    // onOfferWithdrawn() event, if any, belongs to this particular send.
    sendOffer(peer, entryId) {
        if (!peer || typeof peer.getLifecycleState !== 'function' || !peer.connection) {
            throw new Error('AvatarInventoryTransferPeerExchange: sendOffer() requires a ConnectedPeer');
        }
        if (peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
            throw new Error('AvatarInventoryTransferPeerExchange: cannot send, peer is not AUTHENTICATED');
        }
        const inventory = this._store.get();
        const entry = inventory.get(entryId);
        if (!entry) {
            throw new Error(`AvatarInventoryTransferPeerExchange: no carried entry with id ${JSON.stringify(entryId)}`);
        }

        const offerId = createId();
        // Escrow FIRST — see this class's own header on why the sender
        // must never be able to use or re-send the same entry while an
        // offer for it is outstanding.
        this._store.set(withEntryRemoved(inventory, entryId));
        try {
            this._bus.send(peer, this._protocol, toAvatarInventoryTransferOfferMessage(offerId, entry.toJSON()));
        } catch (e) {
            // Never sent — give the entry straight back.
            this._store.set(withEntryAdded(this._store.get(), entry));
            throw e;
        }
        this._pendingOutgoing.set(offerId, { entry, connectionId: peer.connectionId });
        return offerId;
    }

    // Accepts a pending incoming offer, adding its entry to THIS device's
    // own inventory and telling the sender it was taken. Throws if
    // `offerId` names no pending incoming offer (already resolved, never
    // existed, or its sender has since disconnected — see
    // `_handleRegistryChange` below) or if this device is already, somehow,
    // carrying an entry with that same id. Returns the accepted
    // AvatarInventoryEntry.
    acceptOffer(offerId) {
        const pending = this._pendingIncoming.get(offerId);
        if (!pending) {
            throw new Error(`AvatarInventoryTransferPeerExchange: no pending incoming offer with id ${JSON.stringify(offerId)}`);
        }
        const inventory = this._store.get();
        if (inventory.has(pending.entry.id)) {
            this._pendingIncoming.delete(offerId);
            throw new Error(`AvatarInventoryTransferPeerExchange: already carrying an entry with id ${JSON.stringify(pending.entry.id)}`);
        }
        this._store.set(withEntryAdded(inventory, pending.entry));
        this._pendingIncoming.delete(offerId);
        try {
            this._bus.send(pending.connectedPeer, this._protocol, toAvatarInventoryTransferAcceptMessage(offerId));
        } catch {
            // The sender may have disconnected between OFFER and this
            // ACCEPT — the entry is already, correctly, ours regardless;
            // see this class's own header on the one race this leaves
            // unresolved rather than papering over.
        }
        return pending.entry;
    }

    // Declines a pending incoming offer, telling the sender to keep it.
    // This device's own inventory is never touched — an offer it never
    // accepted was never carried here. Throws under the identical
    // condition acceptOffer() does. Returns the declined AvatarInventoryEntry.
    declineOffer(offerId) {
        const pending = this._pendingIncoming.get(offerId);
        if (!pending) {
            throw new Error(`AvatarInventoryTransferPeerExchange: no pending incoming offer with id ${JSON.stringify(offerId)}`);
        }
        this._pendingIncoming.delete(offerId);
        try {
            this._bus.send(pending.connectedPeer, this._protocol, toAvatarInventoryTransferDeclineMessage(offerId));
        } catch {
            // The sender may already be gone — nothing further to tell
            // them, and this device was never holding the entry anyway.
        }
        return pending.entry;
    }

    // Fires with `{ offerId, entry, connectedPeer }` whenever a
    // structurally valid OFFER arrives from an AUTHENTICATED peer. Purely
    // informational — this class never auto-accepts or auto-declines on a
    // caller's behalf; see this file's own header. Returns an unsubscribe
    // function, the same contract every other `on*` method on this class
    // returns.
    onOfferReceived(callback) {
        const subscription = this._eventBus.subscribe(OFFER_RECEIVED_EVENT, callback);
        return () => subscription.unsubscribe();
    }

    dispose() {
        if (this._unsubscribeRegistry) {
            this._unsubscribeRegistry();
            this._unsubscribeRegistry = null;
        }
        if (this._unsubscribeBus) {
            this._unsubscribeBus();
            this._unsubscribeBus = null;
        }
        // Deliberately does NOT dispose the injected peerMessageBus,
        // connectedPeerRegistry, or avatarInventoryStore — all three are
        // shared/owning collaborators this class never owns, the same
        // restraint application/anchoring/PublicationAnchorPeerExchange.js#dispose()
        // already documents for the identical reason.
    }

    // The ingestion boundary, dispatching on `kind`. A malformed wrapper —
    // including anything from a peer not currently AUTHENTICATED, already
    // filtered out one layer down by peer/PeerMessageBus.js itself — is
    // dropped here, silently, exactly like application/
    // PublicationAnchorPeerExchange.js#_handleIncoming() drops a malformed
    // anchor gossip message.
    _handleIncoming(payload, meta) {
        if (!isValidAvatarInventoryTransferPeerMessage(payload)) {
            return;
        }
        if (payload.kind === AvatarInventoryTransferPeerMessageKind.OFFER) {
            this._handleOffer(payload, meta);
            return;
        }
        if (payload.kind === AvatarInventoryTransferPeerMessageKind.ACCEPT) {
            this._handleAccept(payload);
            return;
        }
        this._handleDecline(payload);
    }

    // A malformed `entry` (fails AvatarInventoryEntry construction) is
    // dropped silently, never crashing the bus and never surfacing a
    // half-formed offer to a caller — the identical "structurally valid
    // wrapper, semantically invalid payload -> silently dropped" shape
    // application/anchoring/PublicationAnchorPeerExchange.js already applies to a
    // forged anchor envelope. A second OFFER reusing an offerId this
    // device already has pending is also dropped — offerId identifies ONE
    // offer, never a resend that should replace it.
    _handleOffer(payload, meta) {
        if (this._pendingIncoming.has(payload.offerId)) {
            return;
        }
        let entry;
        try {
            entry = AvatarInventoryEntry.fromJSON(payload.entry);
        } catch {
            return;
        }
        this._pendingIncoming.set(payload.offerId, { entry, connectedPeer: meta.connectedPeer });
        this._eventBus.publish(OFFER_RECEIVED_EVENT, { offerId: payload.offerId, entry, connectedPeer: meta.connectedPeer });
    }

    // An ACCEPT naming an offerId this device has no outgoing record of
    // (already resolved, withdrawn, or simply never sent) is dropped
    // silently, never throws — a peer replaying or forging one can never
    // crash this device's own bus.
    _handleAccept(payload) {
        const pending = this._pendingOutgoing.get(payload.offerId);
        if (!pending) {
            return;
        }
        this._pendingOutgoing.delete(payload.offerId);
        this._eventBus.publish(OFFER_ACCEPTED_EVENT, { offerId: payload.offerId, entry: pending.entry });
    }

    // The mirror image of _handleAccept(): restores the escrowed entry to
    // this device's own inventory — unless, defensively, an entry with
    // that id has somehow already been re-acquired, in which case the
    // restore is skipped rather than throwing AvatarInventory's own
    // duplicate-id error.
    _handleDecline(payload) {
        const pending = this._pendingOutgoing.get(payload.offerId);
        if (!pending) {
            return;
        }
        this._pendingOutgoing.delete(payload.offerId);
        const inventory = this._store.get();
        if (!inventory.has(pending.entry.id)) {
            this._store.set(withEntryAdded(inventory, pending.entry));
        }
        this._eventBus.publish(OFFER_DECLINED_EVENT, { offerId: payload.offerId, entry: pending.entry });
    }

    // Fires with `{ offerId, entry }` on the SENDING side once the
    // recipient actually accepts — the escrowed entry is already gone from
    // this device's own inventory by this point (removed at sendOffer()
    // time); this event exists purely so a caller can update its own UI
    // ("delivered") for an offer it made.
    onOfferAccepted(callback) {
        const subscription = this._eventBus.subscribe(OFFER_ACCEPTED_EVENT, callback);
        return () => subscription.unsubscribe();
    }

    // Fires with `{ offerId, entry }` on the SENDING side once the
    // recipient declines — by the time this fires, the escrowed entry has
    // already been restored to this device's own inventory.
    onOfferDeclined(callback) {
        const subscription = this._eventBus.subscribe(OFFER_DECLINED_EVENT, callback);
        return () => subscription.unsubscribe();
    }

    // Fires with `{ offerId, entry }` whenever a pending offer resolves
    // not through an explicit ACCEPT/DECLINE, but because the OTHER side
    // of it disconnected first: an outgoing offer whose recipient vanished
    // (its escrowed entry is restored, exactly like a DECLINE), or an
    // incoming offer whose sender vanished (simply forgotten — this device
    // was never holding it). See this class's own header on why "the
    // connection is gone" is the one other terminal state an offer can
    // reach, alongside ACCEPT and DECLINE.
    onOfferWithdrawn(callback) {
        const subscription = this._eventBus.subscribe(OFFER_WITHDRAWN_EVENT, callback);
        return () => subscription.unsubscribe();
    }

    // Attaches every peer the registry already knows about (unchanged
    // behavior), then resolves every pending offer, outgoing or incoming,
    // whose other end is no longer among the registry's own live
    // connections — see this class's own header and onOfferWithdrawn()'s
    // own doc comment above.
    _handleRegistryChange(peers) {
        for (const peer of peers) {
            this._bus.attach(peer);
        }
        const liveConnectionIds = new Set(peers.map((peer) => peer.connectionId));

        for (const [offerId, pending] of Array.from(this._pendingOutgoing.entries())) {
            if (liveConnectionIds.has(pending.connectionId)) {
                continue;
            }
            this._pendingOutgoing.delete(offerId);
            const inventory = this._store.get();
            if (!inventory.has(pending.entry.id)) {
                this._store.set(withEntryAdded(inventory, pending.entry));
            }
            this._eventBus.publish(OFFER_WITHDRAWN_EVENT, { offerId, entry: pending.entry });
        }

        for (const [offerId, pending] of Array.from(this._pendingIncoming.entries())) {
            if (liveConnectionIds.has(pending.connectedPeer.connectionId)) {
                continue;
            }
            this._pendingIncoming.delete(offerId);
            this._eventBus.publish(OFFER_WITHDRAWN_EVENT, { offerId, entry: pending.entry });
        }
    }
}

// Namespaced so it can never collide with chat/presence/profile/
// interaction/identity-lifecycle/device-authorization/publication/content/
// anchor traffic multiplexed over the same connection — see application/
// PublicationAnchorPeerExchange.js's own DEFAULT_PROTOCOL.
AvatarInventoryTransferPeerExchange.DEFAULT_PROTOCOL = 'forkbuild:avatar-inventory-transfer';
