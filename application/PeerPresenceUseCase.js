import { EventBus } from '../core/events/EventBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { FriendshipState } from '../core/FriendshipState.js';
import { resolveDirectSocialIdentity } from './SocialIdentityResolver.js';

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
//
// 0.2.85 — Multi-Device Presence Semantics.
//
// 0.2.78/0.2.79 already answered "once Bob has a live, authenticated
// connection, who does it represent?" (`application/
// DeviceAuthorizationPropagationUseCase.js#resolveConnectionIdentity()`)
// for friendship/chat/voice — this class was the one 0.2.79-era social
// surface that never took the same `resolveSocialIdentity` collaborator,
// so it kept matching a connection's RAW authenticated key against
// `identityId` even after every other social use case had moved on to
// resolved identity. That meant "Alice is online" here literally could
// not see a live connection from an authorized DEVICE of Alice's — only
// a connection whose own key happened to equal Alice's parent identity
// directly. This milestone closes that gap the same way every other
// 0.2.79 caller already did: an optional `resolveSocialIdentity`
// collaborator (default: `application/SocialIdentityResolver.js#resolveDirectSocialIdentity`,
// byte-identical to 0.2.70 through 0.2.84's own behavior for anyone who
// never wires device authorization), consulted fresh on every call,
// never cached.
//
// Three concepts this class now keeps genuinely distinct, none of them
// a new store, all of them derived exactly like `isConnectedNow` always
// was — see docs/Principles.md, "Identity Presence Is An Aggregate Of
// Authorized Device Observations, Never A Fourth Store":
//   Connection Presence — one `ConnectedPeer`'s own
//     `getLifecycleState() === AUTHENTICATED`. Unchanged since 0.2.50.
//   Device Presence     — one live, AUTHENTICATED connection whose
//     RESOLVED social identity's `deviceIdentityId` names one specific
//     authorized device. `_liveConnectedPeers()` below is this, as a
//     list.
//   Identity Presence   — `isConnectedNow`: true iff AT LEAST ONE
//     currently-live, currently-authorized device of this identity is
//     reachable — `_liveConnectedPeers(identityId).length > 0`. Never a
//     single connection's own liveness, and never collapsed into a
//     single boolean cached anywhere: a stale disconnect on one of
//     several live connections simply shrinks the list, it never flips
//     this to false on its own, and a revoked device's connection
//     stops resolving to this identity at all the moment
//     `resolveConnectionIdentity()` itself stops recognizing it — no
//     separate revocation check needed here.
//
// Multiple simultaneously-live connections for one identity are the
// expected case, not an edge case: `_liveConnectedPeers()` is a
// `.filter()`, never a `.find()` — Alice's Phone and Laptop can both be
// live at once, and `connectedDeviceCount`/`connectedDeviceIdentityIds`
// below expose that aggregate WITHOUT the UI needing to change at all
// (`isConnectedNow` stays one boolean; see `ui/views/ChatView.js`'s own
// unchanged "Online · Friend" label). Deliberately NOT synchronized
// between Alice's own devices, and deliberately no fan-out delivery
// logic lives here — this class only ever answers what THIS local
// device currently observes, the same "each observer derives what it
// currently knows" boundary `application/ChatUseCase.js#_findAuthenticatedPeer()`
// already draws for picking ONE device to deliver to (still a `.find()`,
// unchanged, and deliberately NOT rebuilt on top of this class's own
// aggregate — delivery-target selection and presence aggregation stay
// two different questions).
export class PeerPresenceUseCase {
    constructor({
        connectedPeerRegistry,
        peerRelationshipUseCase,
        friendRelationshipUseCase,
        conversationStore,
        chatOutbox,
        conversationReadTracker,
        resolveSocialIdentity = resolveDirectSocialIdentity
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
        this._resolveSocialIdentity = resolveSocialIdentity;
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
        // 0.2.85 — every currently-live, currently-authorized device of
        // `identityId`, never just the first one — see this class's own
        // header on why `isConnectedNow` is an aggregate, not a single
        // connection's own liveness.
        const liveConnectedPeers = this._liveConnectedPeers(identityId);
        const connectedDeviceIdentityIds = Array.from(new Set(
            liveConnectedPeers.map((peer) => this._resolvePeerSocialIdentity(peer).deviceIdentityId)
        ));
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
            isConnectedNow: liveConnectedPeers.length > 0,
            lifecycleState: liveConnectedPeers.length > 0 ? PeerLifecycleState.AUTHENTICATED : null,
            // 0.2.85 — how many, and which, of identityId's authorized
            // devices this local device currently observes as reachable
            // — additive data the underlying model now carries so a
            // later UX milestone can decide whether to surface it; today
            // no UI reads either field, `isConnectedNow` stays the one
            // boolean every existing surface already renders.
            connectedDeviceCount: connectedDeviceIdentityIds.length,
            connectedDeviceIdentityIds,
            conversation: {
                messageCount: entries.length,
                lastActivityAt,
                unreadCount,
                pendingOutboxCount: this._outbox.list(identityId).length
            }
        };
    }

    // 0.2.85 — the one live, AUTHENTICATED connection whose RESOLVED
    // social identity is `identityId`, or null. For a caller that needs
    // an actual `ConnectedPeer` to act through (e.g. `ui/views/ChatView.js`'s
    // own voice-call gate, which needs a real connection to test
    // `voiceUseCase.supportsVoice()` against) — never a fan-out, exactly
    // the same "first matching device, never more than one" contract
    // `application/ChatUseCase.js#_findAuthenticatedPeer()` already
    // established; this is the ONE place that logic now lives for
    // presence-adjacent UI, so `ui/views/ChatView.js` and `ui/views/
    // PeerConnectionsView.js` no longer each re-derive it with their own
    // raw-key match.
    findConnectedPeer(identityId) {
        return this._liveConnectedPeers(identityId)[0] || null;
    }

    // 0.2.85 — the Identity Presence boolean on its own, for a caller
    // that only needs "online or not" (e.g. a peer-list badge) without
    // the rest of getSummary()'s relationship/friendship/conversation
    // work.
    isIdentityOnline(identityId) {
        return this._liveConnectedPeers(identityId).length > 0;
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

    // 0.2.85 — every live, AUTHENTICATED connection whose RESOLVED
    // social identity matches `identityId`, in registry order. A
    // `.filter()`, not a `.find()`, on purpose: Alice's Phone and Laptop
    // can both be live at once, and this is the one place that fact is
    // actually visible rather than collapsed to "the first one found."
    _liveConnectedPeers(identityId) {
        return this._registry.list().filter((peer) => {
            if (!peer.remoteIdentity || peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
                return false;
            }
            return this._resolvePeerSocialIdentity(peer).identityId === identityId;
        });
    }

    // Resolves `connectedPeer`'s own SOCIAL identity via the injected
    // `resolveSocialIdentity` collaborator — the exact same fallback
    // shape `application/ChatUseCase.js#_resolvePeerSocialIdentity()`
    // already established, mirrored here rather than imported so this
    // class still never depends on ChatUseCase itself (see this file's
    // own header on why presence takes no ChatUseCase dependency).
    _resolvePeerSocialIdentity(connectedPeer) {
        return this._resolveSocialIdentity(connectedPeer) || resolveDirectSocialIdentity(connectedPeer);
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
