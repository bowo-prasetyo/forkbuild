import { ref, computed, onMounted, onBeforeUnmount, inject, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { FriendshipState } from '../../core/FriendshipState.js';

// 0.2.61 — Direct Peer Messaging & Live Chat.
//
// Deliberately modest, per the design doc: one peer, one live
// transcript, a compose box, a Send button. No typing indicators, no
// read receipts, no reactions, no editing/deleting, no attachments, no
// notification framework — see application/ChatUseCase.js's own header
// on why 0.2.61 ships exactly one message kind and nothing to persist.
//
// Routed at /chat/:identityId — reached from the Friends list on
// ui/views/PeerConnectionsView.js's own "Chat" button, never a
// standalone top-nav destination (the same "contextual, not global"
// navigation /world/:documentId already uses). `identityId` is the
// PEER's — never carried in the URL as anything requiring trust; every
// actual authorization decision is re-derived here, live, from
// application/ChatUseCase.js/application/FriendRelationshipUseCase.js/
// application/PeerBlockUseCase.js, exactly the way this view finds its
// own ConnectedPeer fresh from peerSessionManager rather than trusting
// anything the route itself claims.
//
// 0.2.63 — the compose box now calls chatUseCase.sendOrQueue(), never
// sendMessage(): a message typed here is meant to reach the recipient
// eventually even if they're offline right now, not merely if they
// happen to be connected THIS instant — see application/ChatUseCase.js's
// own header. `isConnected` no longer gates the compose box at all;
// only `canChat` (friend, not blocked) does. Each outgoing bubble shows
// its own deliveryLabel() (Queued/Sent/Delivered/Undelivered), read
// straight off the `deliveryState` application/ChatUseCase.js's
// onMessage() already attaches — this view never talks to
// application/ChatOutbox.js directly.
export default {
    name: 'ChatView',
    setup() {
        const route = useRoute();
        const peerIdentityId = route.params.identityId;

        const identityUseCase = inject('identityUseCase');
        const peerSessionManager = inject('peerSessionManager');
        const peerRelationshipUseCase = inject('peerRelationshipUseCase');
        const friendRelationshipUseCase = inject('friendRelationshipUseCase');
        const peerBlockUseCase = inject('peerBlockUseCase');
        const chatUseCase = inject('chatUseCase');

        const isAuthenticated = ref(identityUseCase.isAuthenticated());
        const peers = ref(peerSessionManager.listPeers());
        const messages = ref(chatUseCase.getConversation(peerIdentityId));
        const draft = ref('');
        const sendError = ref('');
        const messageListEl = ref(null);

        function shortId(identityId) {
            return identityId ? identityId.slice(-14) : '';
        }

        function displayName() {
            const relationship = peerRelationshipUseCase.getRelationship(peerIdentityId);
            return (relationship && relationship.alias) || shortId(peerIdentityId);
        }

        // The live, AUTHENTICATED ConnectedPeer for this identity, or
        // null — never cached, always re-derived from the SAME live
        // "My Peers" list ui/views/PeerConnectionsView.js's own
        // connectedPeerFor() already reads the identical way from.
        const connectedPeer = computed(() => peers.value.find((p) => p.remoteIdentity
            && p.remoteIdentity.identityId === peerIdentityId
            && p.getLifecycleState() === PeerLifecycleState.AUTHENTICATED) || null);

        const isConnected = computed(() => connectedPeer.value !== null);
        const isBlocked = computed(() => peerBlockUseCase.isBlocked(peerIdentityId));
        const friendState = computed(() => friendRelationshipUseCase.getState(peerIdentityId));
        const isFriend = computed(() => friendState.value === FriendshipState.FRIEND);
        // The exact same gate application/ChatUseCase.js#canChat()
        // itself applies — read here purely to decide what the compose
        // box shows; sendMessage() below re-checks everything anyway.
        const canChat = computed(() => chatUseCase.canChat(peerIdentityId));

        const statusLabel = computed(() => {
            if (isBlocked.value) return 'Blocked';
            if (!isFriend.value) return 'Not friends';
            return isConnected.value ? 'Online · Friend' : 'Offline · Friend';
        });

        function refreshPeers(list) {
            peers.value = list || peerSessionManager.listPeers();
        }

        function scrollToBottom() {
            nextTick(() => {
                if (messageListEl.value) {
                    messageListEl.value.scrollTop = messageListEl.value.scrollHeight;
                }
            });
        }

        function refreshMessages() {
            messages.value = chatUseCase.getConversation(peerIdentityId);
            scrollToBottom();
        }

        // 0.2.63 — uses sendOrQueue(), not sendMessage(): a message typed
        // here is a deliberate, durable "Send," not merely a live one —
        // see application/ChatUseCase.js's own header, "Send Means Live
        // Delivery; SendOrQueue Means Deliberate Durability." No
        // isConnected check gates this anymore; sendOrQueue() itself
        // decides whether to transmit immediately or queue.
        function send() {
            sendError.value = '';
            try {
                chatUseCase.sendOrQueue(peerIdentityId, draft.value);
                draft.value = '';
            } catch (e) {
                sendError.value = e.message.replace(/^ChatUseCase:\s*/, '');
            }
        }

        function deliveryLabel(message) {
            if (message.direction !== 'outgoing' || !message.deliveryState) return '';
            switch (message.deliveryState) {
                case 'QUEUED': return 'Queued — will send once they reconnect';
                case 'SENT': return 'Sent';
                case 'DELIVERED': return 'Delivered';
                case 'EXPIRED': return 'Undelivered — expired';
                default: return '';
            }
        }

        function formatTime(timestamp) {
            return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        let unsubscribePeers = null;
        let unsubscribeMessages = null;
        let unsubscribeSession = null;
        onMounted(() => {
            refreshPeers();
            refreshMessages();
            unsubscribePeers = peerSessionManager.onPeersChanged((list) => refreshPeers(list));
            unsubscribeMessages = chatUseCase.onMessage((senderPeerIdentityId) => {
                if (senderPeerIdentityId === peerIdentityId) {
                    refreshMessages();
                }
            });
            unsubscribeSession = identityUseCase.onSessionChanged(() => {
                isAuthenticated.value = identityUseCase.isAuthenticated();
            });
            scrollToBottom();
        });
        onBeforeUnmount(() => {
            if (unsubscribePeers) unsubscribePeers();
            if (unsubscribeMessages) unsubscribeMessages();
            if (unsubscribeSession) unsubscribeSession();
        });

        return {
            peerIdentityId, isAuthenticated, messages, draft, sendError, messageListEl,
            displayName, shortId, isConnected, isBlocked, isFriend, canChat, statusLabel,
            send, formatTime, deliveryLabel
        };
    },
    template: `
        <section class="chat-view">
            <p v-if="!isAuthenticated" class="form-hint form-hint--neutral">
                Sign in to an identity (see <router-link to="/identity">My Identities</router-link>) to chat.
            </p>
            <template v-else>
                <header class="chat-header">
                    <h1>{{ displayName() }}</h1>
                    <span class="peer-badge" :class="isConnected && isFriend ? 'peer-badge--authenticated' : 'peer-badge--pending'">
                        {{ statusLabel }}
                    </span>
                </header>
                <p class="identity-mgmt-status">{{ shortId(peerIdentityId) }}</p>

                <p v-if="isBlocked" class="form-hint form-hint--neutral">
                    ⛔ This identity is blocked — unblock it from <router-link to="/peers">Peers</router-link> to chat again.
                </p>
                <p v-else-if="!isFriend" class="form-hint form-hint--neutral">
                    Chat requires a mutual friendship — send or accept a friend request from
                    <router-link to="/peers">Peers</router-link> first.
                </p>
                <p v-else-if="!isConnected" class="form-hint form-hint--neutral">
                    Not connected right now — a message you send will be queued locally and
                    delivered once they reconnect.
                </p>

                <div ref="messageListEl" class="chat-message-list">
                    <p v-if="!messages.length" class="form-hint form-hint--neutral">No messages yet.</p>
                    <div v-for="message in messages" :key="message.messageId"
                         class="chat-message" :class="'chat-message--' + message.direction">
                        <span class="chat-message-author">{{ message.direction === 'outgoing' ? 'You' : displayName() }}</span>
                        <span class="chat-message-body">{{ message.body }}</span>
                        <span class="chat-message-time">{{ formatTime(message.timestamp) }}</span>
                        <span v-if="deliveryLabel(message)" class="chat-message-delivery">{{ deliveryLabel(message) }}</span>
                    </div>
                </div>

                <p v-if="sendError" class="identity-unlock-error">{{ sendError }}</p>

                <form class="chat-compose" @submit.prevent="send">
                    <input type="text" class="form-input chat-compose-input" v-model="draft"
                           :disabled="!canChat"
                           placeholder="Type a message…" maxlength="4000" />
                    <button type="submit" class="action-btn action-btn--primary"
                            :disabled="!canChat || !draft.trim()">
                        Send
                    </button>
                </form>
            </template>
        </section>
    `
};
