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

        function send() {
            sendError.value = '';
            if (!connectedPeer.value) {
                sendError.value = 'Not connected — reconnect to this peer to chat';
                return;
            }
            try {
                chatUseCase.sendMessage(connectedPeer.value, draft.value);
                draft.value = '';
            } catch (e) {
                sendError.value = e.message.replace(/^ChatUseCase:\s*/, '');
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
            send, formatTime
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
                    Not connected right now — messages only travel over a live connection; nothing is
                    queued for later delivery. Reconnect from <router-link to="/peers">Peers</router-link>.
                </p>

                <div ref="messageListEl" class="chat-message-list">
                    <p v-if="!messages.length" class="form-hint form-hint--neutral">No messages yet.</p>
                    <div v-for="message in messages" :key="message.messageId"
                         class="chat-message" :class="'chat-message--' + message.direction">
                        <span class="chat-message-author">{{ message.direction === 'outgoing' ? 'You' : displayName() }}</span>
                        <span class="chat-message-body">{{ message.body }}</span>
                        <span class="chat-message-time">{{ formatTime(message.timestamp) }}</span>
                    </div>
                </div>

                <p v-if="sendError" class="identity-unlock-error">{{ sendError }}</p>

                <form class="chat-compose" @submit.prevent="send">
                    <input type="text" class="form-input chat-compose-input" v-model="draft"
                           :disabled="!canChat || !isConnected"
                           placeholder="Type a message…" maxlength="4000" />
                    <button type="submit" class="action-btn action-btn--primary"
                            :disabled="!canChat || !isConnected || !draft.trim()">
                        Send
                    </button>
                </form>
            </template>
        </section>
    `
};
