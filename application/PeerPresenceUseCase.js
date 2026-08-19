import { EventBus } from '../core/events/EventBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { FriendshipState } from '../core/FriendshipState.js';

const PRESENCE_CHANGED_EVENT = 'PeerPresenceChanged';

// 0.2.70 — Presence & Conversation Lifecycle.
//
// "What does this application know about the other participant when
// there is no active connection?" 0.2.56 through 0.2.69 each answered
// one slice of that question, and each slice already lives in its own
// independently-durable (or independently-ephemeral) store, on purpose:
//
//   Identity           peer/PeerIdentity.js            live connection only
//   PeerRelationship    application/PeerRelationshipUseCase.js   durable
//   FriendshipRecord    application/FriendRelationshipUseCase.js  durable
//   Presence/Connection application/ConnectedPeerRegistry.js      ephemeral
//   Conversation        application/ConversationStore.js          durable
//   Outbox              application/ChatOutbox.js                 durable
//   Read state          application/ConversationReadTracker.js    durable
//
// This class adds NO new store of its own beyond the one, tiny write
// (`markRead`, delegated straight to `application/
// ConversationReadTracker.js`). It exists ONLY to answer, for one
// identity at a time, "reconcile everything the app currently knows
// about them into one read" — the exact same "computed, never stored"
// discipline `peer/PeerLifecycleState.js#derivePeerLifecycleState()`
// already established for a single connection's own two-state-machine
// summary, applied one layer up, across FIVE independent sources
// instead of two. See docs/Principles.md, "A Peer Presence Summary
// Reconciles Independent Lifetimes; It Is Never A Fourth Store"
// (0.2.70): `getSummary()`/`list()` below read every collaborator fresh
// on every call and cache nothing — there is no "presence" object
// sitting in storage anywhere that could ever drift out of sync with
// the sources it summarizes, because there is no such object at all.
//
// OFFLINE ≠ conversation unavailable. OFFLINE ≠ relationship removed.
// OFFLINE ≠ friendship removed. OFFLINE ≠ identity unavailable. Every
// one of those four facts is read from its own independent, already-
// existing store; `isConnectedNow` is the ONE fact this class derives
// fresh from `application/ConnectedPeerRegistry.js`, exactly the way
// `ui/views/ChatView.js`'s own `connectedPeer` computed and
// `ui/views/PeerConnectionsView.js`'s own `isConnectedNow()` already do
// — this class introduces no new way of answering that one question,
// only a single place that answers it ALONGSIDE the other four instead
// of a UI having to ask five different collaborators separately.
//
// Deliberately NOT a new connection-lifecycle enum (CONNECTING /
// AUTHENTICATING / CONNECTED / DISCONNECTED / FAILED): `peer/
// PeerLifecycleState.js` already IS that vocabulary, and inventing a
// second one here would be exactly the mistake that file's own header
// already warns against — "what happens when it disagrees with the two
// real state machines it's supposed to be summarizing?" A live
// `ConnectedPeer`'s own `getLifecycleState()` is exposed here verbatim
// when one exists; "no live ConnectedPeer for this identity right now"
// is the one new fact worth naming, and `isConnectedNow: false` says
// exactly that without minting a redundant DISCONNECTED value nothing
// else in this codebase would ever produce or consume.
export class PeerPresenceUseCase {
    constructor({
        connectedPeerRegistry,
        peerRelationshipUseCase,
        friendRelationshipUseCase,
        conversationStore,
        chatOutbox,
        conversationReadTracker
    } = {}) {
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('PeerPresenceUseCase: a ConnectedPeerRegistry is required');
        }
        if (!peerRelationshipUseCase || typeof peerRelationshipUseCase.getRelationship !== 'function') {
            throw new Error('PeerPresenceUseCase: a PeerRelationshipUseCase is required');
        }
        if (!friendRelationshipUseCase || typeof friendRelationshipUseCase.getState !== 'function') {
            throw new Error('PeerPresenceUseCase: a FriendRelationshipUseCase is required');
        }
        if (!conversationStore || typeof conversationStore.list !== 'function') {
            throw new Error('PeerPresenceUseCase: a ConversationStore is required');
        }
        if (!chatOutbox || typeof chatOutbox.list !== 'function') {
            throw new Error('PeerPresenceUseCase: a ChatOutbox is required');
        }
        if (!conversationReadTracker || typeof conversationReadTracker.markRead !== 'function') {
            throw new Error('PeerPresenceUseCase: a ConversationReadTracker is required');
        }
        this._registry = connectedPeerRegistry;
        this._relationships = peerRelationshipUseCase;
        this._friends = friendRelationshipUseCase;
        this._conversations = conversationStore;
        this._outbox = chatOutbox;
        this._readTracker = conversationReadTracker;
        this._eventBus = new EventBus();

        // Republish on every source this summary is built from EXCEPT
        // new/updated messages themselves — a UI that also cares about
        // those already has `application/ChatUseCase.js#onMessage()` to
        // subscribe to directly (see that method's own header); this
        // class deliberately avoids taking a ChatUseCase dependency of
        // its own, reading `conversationStore`/`chatOutbox` directly
        // instead, so it never needs to know about live sends/receives,
        // only about their already-durable write-through.
        this._unsubscribeRegistry = this._registry.onChange(() => this._publishChange());
        this._unsubscribeRelationships = this._relationships.onRelationshipsChanged(() => this._publishChange());
        this._unsubscribeFriends = this._friends.onRelationshipsChanged(() => this._publishChange());
    }

    // A reconciled snapshot for exactly one identity — safe to call for
    // an identity this device has no relationship, no friendship, and no
    // conversation with at all (every field simply reads as "nothing on
    // record" rather than throwing), so a caller never needs a separate
    // existence check first.
    getSummary(identityId) {
        const relationship = this._relationships.getRelationship(identityId);
        const friendshipState = this._friends.getState(identityId);
        const connectedPeer = this._liveConnectedPeer(identityId);
        const entries = this._conversations.list(identityId);
        const lastReadSequence = this._readTracker.getLastReadSequence(identityId);
        const unreadCount = entries.filter((entry) => entry.direction === 'incoming' && entry.message.sequence > lastReadSequence).length;
        const lastActivityAt = entries.length
            ? entries.reduce((latest, entry) => (entry.recordedAt > latest ? entry.recordedAt : latest), entries[0].recordedAt)
            : null;

        return {
            identityId,
            relationship,
            alias: relationship ? relationship.alias : null,
            friendshipState,
            isConnectedNow: connectedPeer !== null,
            lifecycleState: connectedPeer ? connectedPeer.getLifecycleState() : null,
            conversation: {
                messageCount: entries.length,
                lastActivityAt,
                unreadCount,
                pendingOutboxCount: this._outbox.list(identityId).length
            }
        };
    }

    // Every identity this device has ANY reason to show on a
    // conversations/presence surface — the union of "remembered as a
    // Known Peer," "any friendship record at all" (REQUESTED as well as
    // FRIEND — a pending request is still something worth surfacing),
    // and "any stored conversation history" — deduplicated, each reduced
    // through getSummary() above, ordered by most recently active
    // conversation first (an identity with no conversation yet sorts
    // after every identity that has one, then by alias/identityId for a
    // stable order). Mirrors `application/ConversationStore.js#conversations()`'s
    // own "most recently active first" ordering, extended to identities
    // that have no conversation at all yet.
    list() {
        const identityIds = new Set([
            ...this._relationships.getRelationships().map((r) => r.identityId),
            ...this._friends.getRelationships().map((r) => r.identityId),
            ...this._conversations.conversations().map((c) => c.peerIdentityId)
        ]);
        return Array.from(identityIds)
            .map((identityId) => this.getSummary(identityId))
            .sort((a, b) => {
                const aTime = a.conversation.lastActivityAt ? a.conversation.lastActivityAt.getTime() : -1;
                const bTime = b.conversation.lastActivityAt ? b.conversation.lastActivityAt.getTime() : -1;
                if (aTime !== bTime) {
                    return bTime - aTime;
                }
                return (a.alias || a.identityId).localeCompare(b.alias || b.identityId);
            });
    }

    // Alice's "I opened this conversation and looked" gesture — the
    // ONE place in this codebase that computes "the highest incoming
    // sequence this device currently holds for this peer" and hands it
    // to `application/ConversationReadTracker.js#markRead()`, so that
    // class never needs to read conversation CONTENT itself. Reads from
    // the DURABLE `conversationStore`, never the live, session-only
    // transcript, so marking read is correct even for a conversation
    // whose messages were all received in a PRIOR session. Harmless to
    // call for a peer with no stored history at all (marks read up
    // through 0, a no-op).
    markRead(identityId) {
        const entries = this._conversations.list(identityId);
        const highestIncoming = entries.reduce(
            (max, entry) => (entry.direction === 'incoming' && entry.message.sequence > max ? entry.message.sequence : max),
            0
        );
        this._readTracker.markRead(identityId, highestIncoming);
        this._publishChange();
    }

    // Returns an unsubscribe function. Fires with the full current
    // `list()` on every connection change, relationship change, or
    // friendship change — deliberately NOT on every new chat message
    // (see this class's own header on why); a caller that also wants
    // that subscribes to `application/ChatUseCase.js#onMessage()`
    // separately, exactly like `markRead()`'s own caller
    // (`ui/views/ChatView.js`) already does for refreshing the open
    // transcript.
    onChange(callback) {
        const subscription = this._eventBus.subscribe(PRESENCE_CHANGED_EVENT, () => callback(this.list()));
        return () => subscription.unsubscribe();
    }

    dispose() {
        if (this._unsubscribeRegistry) { this._unsubscribeRegistry(); this._unsubscribeRegistry = null; }
        if (this._unsubscribeRelationships) { this._unsubscribeRelationships(); this._unsubscribeRelationships = null; }
        if (this._unsubscribeFriends) { this._unsubscribeFriends(); this._unsubscribeFriends = null; }
        // Deliberately does NOT dispose connectedPeerRegistry,
        // peerRelationshipUseCase, friendRelationshipUseCase,
        // conversationStore, chatOutbox, or conversationReadTracker —
        // every one of them is a shared collaborator that outlives this
        // one reconciliation view, exactly like
        // application/ChatUseCase.js's own dispose().
    }

    _liveConnectedPeer(identityId) {
        return this._registry.list().find((peer) => peer.remoteIdentity
            && peer.remoteIdentity.identityId === identityId
            && peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED) || null;
    }

    _publishChange() {
        this._eventBus.publish(PRESENCE_CHANGED_EVENT, {});
    }
}

// Re-exported purely for a UI's convenience (the same "closed
// vocabulary a template can reference directly" reason
// ui/views/PeerConnectionsView.js already imports FriendshipState/
// PeerLifecycleState itself) — this module never adds a value FriendshipState
// doesn't already define.
export { FriendshipState };
