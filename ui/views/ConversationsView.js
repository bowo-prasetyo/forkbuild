import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { FriendshipState } from '../../core/FriendshipState.js';

// 0.2.70 — Presence & Conversation Lifecycle.
//
// The "aggregate conversation-list/inbox UI" 0.2.69 named and
// deliberately declined to build (see docs/Roadmap.md, "to keep the
// change reviewable") — reading exactly the data that milestone's own
// header pointed at (`application/ChatUseCase.js#getConversations()`
// "now genuinely returns every persisted conversation on construction,
// and a future UI could read it directly"), now joined with
// `application/PeerPresenceUseCase.js`'s own reconciliation so a row
// here answers a genuinely richer question than "what did we talk
// about": is this identity known, are we friends, are they connected
// RIGHT NOW, how many messages are unread, and how many are still
// waiting in the outbox to be delivered.
//
// Deliberately reads `peerPresenceUseCase` only — never
// `connectedPeerRegistry`/`peerRelationshipUseCase`/
// `friendRelationshipUseCase`/`chatOutbox`/`conversationStore` directly.
// Every fact this view shows is already reconciled one layer down; this
// component's only job is presentation and the "mark read on open"
// gesture.
export default {
    name: 'ConversationsView',
    setup() {
        const identityUseCase = inject('identityUseCase');
        const peerPresenceUseCase = inject('peerPresenceUseCase');
        const chatUseCase = inject('chatUseCase');

        const isAuthenticated = ref(identityUseCase.isAuthenticated());
        const conversations = ref(isAuthenticated.value ? peerPresenceUseCase.list() : []);

        function refresh(list) {
            conversations.value = list || peerPresenceUseCase.list();
        }

        function shortId(identityId) {
            return identityId ? identityId.slice(-14) : '';
        }

        function displayName(summary) {
            return summary.alias || shortId(summary.identityId);
        }

        function friendshipLabel(summary) {
            switch (summary.friendshipState) {
                case FriendshipState.FRIEND: return 'Friend';
                case FriendshipState.REQUESTED: return 'Friend request pending';
                default: return summary.relationship ? 'Known peer' : 'Not connected before';
            }
        }

        function formatWhen(date) {
            return date instanceof Date ? date.toLocaleString() : 'No messages yet';
        }

        // Chat itself requires a mutual friendship — see
        // application/ChatUseCase.js#canChat() — so this view never
        // offers "Open Chat" for anyone this device isn't (yet) friends
        // with, even if a conversation happens to exist from before an
        // unfriend (history is never deleted — see
        // application/ConversationStore.js's own header).
        function canOpenChat(summary) {
            return summary.friendshipState === FriendshipState.FRIEND;
        }

        let unsubscribePresence = null;
        let unsubscribeMessages = null;
        let unsubscribeSession = null;
        onMounted(() => {
            refresh();
            unsubscribePresence = peerPresenceUseCase.onChange((list) => refresh(list));
            // A new/updated message never fires PeerPresenceUseCase's own
            // onChange (see that class's own header) — subscribed here
            // separately so an unread count or a "last active" timestamp
            // updates live while this list is open, exactly the same
            // "subscribe to more than one source, refresh on either"
            // pattern ui/views/PeerConnectionsView.js already uses.
            unsubscribeMessages = chatUseCase.onMessage(() => refresh());
            unsubscribeSession = identityUseCase.onSessionChanged(() => {
                isAuthenticated.value = identityUseCase.isAuthenticated();
                refresh();
            });
        });
        onBeforeUnmount(() => {
            if (unsubscribePresence) unsubscribePresence();
            if (unsubscribeMessages) unsubscribeMessages();
            if (unsubscribeSession) unsubscribeSession();
        });

        return {
            isAuthenticated, conversations, FriendshipState,
            shortId, displayName, friendshipLabel, formatWhen, canOpenChat
        };
    },
    template: `
        <section class="conversations-view">
            <h1>Conversations</h1>
            <p class="form-hint form-hint--neutral">
                A peer being offline never hides their identity, relationship, friendship, or
                conversation history — only whether they're connected right now, shown below
                independently of everything else this device already knows about them.
            </p>

            <p v-if="!isAuthenticated" class="form-hint form-hint--neutral">
                Sign in to an identity (see <router-link to="/identity">My Identities</router-link>) to see your conversations.
            </p>

            <template v-else>
                <div v-if="conversations.length" class="identity-mgmt-list">
                    <div v-for="summary in conversations" :key="summary.identityId" class="identity-mgmt-card">
                        <div class="identity-mgmt-card-header">
                            <span class="identity-mgmt-name">{{ displayName(summary) }}</span>
                            <span class="peer-badge" :class="summary.isConnectedNow ? 'peer-badge--authenticated' : 'peer-badge--pending'">
                                {{ summary.isConnectedNow ? 'Online' : 'Offline' }}
                            </span>
                        </div>
                        <p class="identity-mgmt-status">
                            {{ shortId(summary.identityId) }} · {{ friendshipLabel(summary) }}
                        </p>
                        <p class="conversation-summary-line">
                            <span v-if="summary.conversation.unreadCount > 0" class="conversation-unread-badge">
                                {{ summary.conversation.unreadCount }} unread
                            </span>
                            <span v-if="summary.conversation.pendingOutboxCount > 0" class="form-hint form-hint--neutral">
                                {{ summary.conversation.pendingOutboxCount }} message{{ summary.conversation.pendingOutboxCount === 1 ? '' : 's' }} waiting to send
                            </span>
                            <span v-if="summary.conversation.messageCount === 0" class="form-hint form-hint--neutral">
                                {{ summary.friendshipState === FriendshipState.FRIEND ? 'Conversation available — no messages yet' : 'No conversation yet' }}
                            </span>
                        </p>
                        <p v-if="summary.conversation.lastActivityAt" class="form-hint form-hint--neutral">
                            Last activity {{ formatWhen(summary.conversation.lastActivityAt) }}
                        </p>

                        <div class="identity-mgmt-actions">
                            <router-link v-if="canOpenChat(summary)" :to="'/chat/' + summary.identityId" class="action-btn action-btn--primary">
                                Open Chat
                            </router-link>
                            <span v-else class="form-hint form-hint--neutral">
                                Chat requires a mutual friendship — see <router-link to="/peers">Peers</router-link>.
                            </span>
                        </div>
                    </div>
                </div>
                <p v-else class="form-hint form-hint--neutral">
                    No conversations yet. Send or accept a friend request from
                    <router-link to="/peers">Peers</router-link>, then start chatting.
                </p>
            </template>
        </section>
    `
};
