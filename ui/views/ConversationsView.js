import { ref, onMounted, onBeforeUnmount, inject } from 'vue';
import { FriendshipState } from '../../core/FriendshipState.js';

// 0.2.70 — Presence & Conversation Lifecycle.
//
// The "aggregate conversation-list/inbox UI" 0.2.69 named and
// deliberately declined to build (see docs/Roadmap.md, "to keep the
// change reviewable") — reading exactly the data that milestone's own
// header pointed at (`application/chat/ChatUseCase.js#getConversations()`
// "now genuinely returns every persisted conversation on construction,
// and a future UI could read it directly"), now joined with
// `application/presence/PeerPresenceUseCase.js`'s own reconciliation so a row
// here answers a genuinely richer question than "what did we talk
// about": is this identity known, are we friends, are they connected
// RIGHT NOW, how many messages are unread, and how many are still
// waiting in the outbox to be delivered. (It reads
// `peerPresenceUseCase.list()`, not `getConversations()` itself — the
// former already covers every identity that method would return.)
//
// Deliberately reads `peerPresenceUseCase` for every row fact — never
// `connectedPeerRegistry`/`peerRelationshipUseCase`/
// `friendRelationshipUseCase`/`chatOutbox`/`conversationStore` directly.
// Every fact this view shows is already reconciled one layer down; this
// component's only job is presentation. The one exception is the chat
// gate, answered by `chatUseCase.canChat()` (with `peerBlockUseCase`
// only to explain a blocked row), so this list never disagrees with
// ChatView about who can be chatted with. Marking a conversation read
// happens in ui/views/ChatView.js, not here.
export default {
    name: 'ConversationsView',
    setup() {
        const identityUseCase = inject('identityUseCase');
        const peerPresenceUseCase = inject('peerPresenceUseCase');
        const chatUseCase = inject('chatUseCase');
        const peerBlockUseCase = inject('peerBlockUseCase');

        const isAuthenticated = ref(identityUseCase.isAuthenticated());
        const conversations = ref(isAuthenticated.value ? peerPresenceUseCase.list() : []);

        function refresh() {
            conversations.value = peerPresenceUseCase.list();
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

        // Only ever called for a non-null `lastActivityAt`, which
        // PeerPresenceUseCase always reports as a Date.
        function formatWhen(date) {
            return date.toLocaleString();
        }

        // Delegates to application/chat/ChatUseCase.js#canChat() — a mutual
        // friendship AND not blocked — so this view never offers
        // "Open Chat" for anyone ChatView would refuse to send to: not
        // for a non-friend (even if a conversation exists from before an
        // unfriend; history is never deleted — see
        // application/chat/ConversationStore.js's own header), and not for a
        // friend this device has blocked (blocking never ends the
        // friendship — see application/peer/PeerBlockUseCase.js).
        function canOpenChat(summary) {
            return chatUseCase.canChat(summary.identityId);
        }

        function isBlocked(summary) {
            return peerBlockUseCase.isBlocked(summary.identityId);
        }

        // `conversations` above is already fresh at setup time, so
        // mounting only subscribes — no second list() pass.
        let unsubscribePresence = null;
        let unsubscribeMessages = null;
        let unsubscribeBlocks = null;
        let unsubscribeSession = null;
        onMounted(() => {
            unsubscribePresence = peerPresenceUseCase.onChange(() => refresh());
            // A new/updated message never fires PeerPresenceUseCase's own
            // onChange (see that class's own header) — subscribed here
            // separately so an unread count or a "last active" timestamp
            // updates live while this list is open, exactly the same
            // "subscribe to more than one source, refresh on either"
            // pattern ui/views/PeerConnectionsView.js already uses.
            unsubscribeMessages = chatUseCase.onMessage(() => refresh());
            // Blocking/unblocking changes canOpenChat() without touching
            // any source PeerPresenceUseCase republishes on.
            unsubscribeBlocks = peerBlockUseCase.onBlockedChanged(() => refresh());
            unsubscribeSession = identityUseCase.onSessionChanged(() => {
                isAuthenticated.value = identityUseCase.isAuthenticated();
                refresh();
            });
        });
        onBeforeUnmount(() => {
            if (unsubscribePresence) unsubscribePresence();
            if (unsubscribeMessages) unsubscribeMessages();
            if (unsubscribeBlocks) unsubscribeBlocks();
            if (unsubscribeSession) unsubscribeSession();
        });

        return {
            isAuthenticated, conversations,
            shortId, displayName, friendshipLabel, formatWhen, canOpenChat, isBlocked
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
                                {{ canOpenChat(summary) ? 'Conversation available — no messages yet' : 'No conversation yet' }}
                            </span>
                        </p>
                        <p v-if="summary.conversation.lastActivityAt" class="form-hint form-hint--neutral">
                            Last activity {{ formatWhen(summary.conversation.lastActivityAt) }}
                        </p>

                        <div class="identity-mgmt-actions">
                            <router-link v-if="canOpenChat(summary)" :to="'/chat/' + summary.identityId" class="action-btn action-btn--primary">
                                Open Chat
                            </router-link>
                            <span v-else-if="isBlocked(summary)" class="form-hint form-hint--neutral">
                                ⛔ Blocked — unblock from <router-link to="/peers">Peers</router-link> to chat again.
                            </span>
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
