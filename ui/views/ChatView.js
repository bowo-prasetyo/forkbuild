import { ref, computed, onMounted, onBeforeUnmount, inject, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { FriendshipState } from '../../core/FriendshipState.js';
import { VoiceSessionState } from '../../core/VoiceSessionState.js';
import { VoiceCallEndReason } from '../../core/VoiceCallEndReason.js';

// 0.2.74 — a call that ends for a reason the person placing/receiving it
// would not otherwise notice (BUSY/TIMEOUT/REJECTED/a media or
// negotiation failure) says so, briefly, through the SAME `voiceError`
// line startCall()/acceptCall() already use for a synchronous refusal —
// never a second notification mechanism. LOCAL_HANGUP/REMOTE_HANGUP/
// PEER_DISCONNECTED/BLOCKED/UNFRIENDED say nothing here: the call bar
// disappearing IS the explanation for an ordinary hangup or a connection
// dying, exactly as it already did in 0.2.73. Heavier voice UX (a proper
// toast, a "missed call" affordance) is real future work — see
// docs/Roadmap.md's own 0.2.75 "Voice UX / Device Controls" milestone;
// this stays exactly as small as reusing the existing `voiceError` line.
const VOICE_END_REASON_MESSAGE = Object.freeze({
    [VoiceCallEndReason.REJECTED]: 'Call declined.',
    [VoiceCallEndReason.BUSY]: 'They’re already on another call.',
    [VoiceCallEndReason.TIMEOUT]: 'No answer.',
    [VoiceCallEndReason.MEDIA_FAILED]: 'Couldn’t access your microphone.',
    [VoiceCallEndReason.NEGOTIATION_FAILED]: 'Call failed to connect.'
});

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
//
// 0.2.70 — a "Show details" toggle surfaces application/
// PeerPresenceUseCase.js's own reconciled snapshot (identity/
// relationship/friendship/connection/conversation, five independent
// facts, five independent lines — see that class's own header) rather
// than collapsing all five into the existing `statusLabel` badge, which
// stays exactly as terse as 0.2.61 left it. Opening this view is also
// this device's own "I looked" gesture — every mount and every incoming
// message for this peer calls `peerPresenceUseCase.markRead()`, which
// is a purely local, unsigned, never-transmitted note (see
// core/ConversationReadMarker.js's own header on why this is never a
// read RECEIPT); the other participant has no way to observe it.
//
// 0.2.71 — the SAME "I looked" moment now ALSO calls
// `chatUseCase.sendReadReceipt()`, a deliberately separate call to a
// deliberately separate use case: `peerPresenceUseCase.markRead()`
// still only ever updates this device's own LOCAL, unsigned marker,
// exactly as it always did, and has no idea a network acknowledgement
// exists. `sendReadReceipt()` independently recomputes the same
// "highest incoming sequence" fact from `chatUseCase`'s own live
// conversation and queues/transmits it — see
// application/ChatUseCase.js's own header on why these are two
// genuinely independent computations, never one derived from the
// other. Each outgoing bubble now also shows a "Seen" mark once
// `chatUseCase.getPeerReadThroughSequence()` reports the peer has
// acknowledged reading that far.
//
// 0.2.73 — a "Call" button next to the compose box, reusing the SAME
// `connectedPeer`/`canChat` gates already computed above (voice requires
// the identical eligibility chat does — see application/VoiceUseCase.js's
// own header) plus one new one, `application/VoiceUseCase.js#supportsVoice()`,
// which is false for anything but a real WebRTC connection. The call bar
// (incoming banner, or in-progress controls) is deliberately keyed on
// `activeCall.value.peerIdentityId === peerIdentityId` — application/
// VoiceUseCase.js tracks at most ONE call for the whole device, so a call
// with a DIFFERENT peer shows here only as a disabled "Call" button, never
// as this peer's own call bar.
//
// 0.2.75 — Voice UX & Device Controls. Three additions, all presentation
// over application/VoiceUseCase.js's own 0.2.75 surface, never a new
// state machine of their own:
// (1) the Hang Up button reads "Cancel" while CALLING (an outgoing call
//     nobody has answered yet) and "Hang Up" once media is actually
//     attached — endCall() itself is unchanged; only the LABEL is derived
//     from `callForThisPeer.value.state`, per the design doc's own
//     instruction not to invent new VoiceSessionState values for UI
//     presentation;
// (2) a microphone picker and (if `<audio>#setSinkId` exists in this
//     browser) a speaker picker appear once `hasMediaAttached` — the
//     microphone one calls `voiceUseCase.setInputDevice()`, the speaker
//     one calls `remoteAudioEl.value.setSinkId()` DIRECTLY and never
//     touches voiceUseCase at all, exactly matching that file's own
//     header, "Output Device Selection Never Enters This Class";
// (3) `voiceUseCase.onMicrophoneUnavailable()` surfaces a small, dismissible-
//     by-refresh banner ("your microphone disappeared") without ever
//     touching `callForThisPeer`/`isInCallWithThisPeer` — the call bar
//     keeps showing exactly the same controls throughout, because the
//     call itself never ended.
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
        const peerPresenceUseCase = inject('peerPresenceUseCase');
        const voiceUseCase = inject('voiceUseCase');

        const isAuthenticated = ref(identityUseCase.isAuthenticated());
        const peers = ref(peerSessionManager.listPeers());
        const messages = ref(chatUseCase.getConversation(peerIdentityId));
        const draft = ref('');
        const sendError = ref('');
        const messageListEl = ref(null);
        // 0.2.70 — a reconciled snapshot of everything this device knows
        // about this one identity, independent of connection state — see
        // application/PeerPresenceUseCase.js's own header. Refreshed
        // alongside `messages`/`peers` below, never a separate polling
        // loop of its own.
        const presence = ref(peerPresenceUseCase.getSummary(peerIdentityId));
        // 0.2.71 — "through which of MY OWN outgoing sequence numbers has
        // the peer told me they've read?" Refreshed alongside `presence`
        // below and on every `chatUseCase.onReadReceipt()` event.
        const peerReadThroughSequence = ref(chatUseCase.getPeerReadThroughSequence(peerIdentityId));
        // 0.2.73 — application/VoiceUseCase.js's own single, device-wide
        // call snapshot — see this view's own header on why the call bar
        // only renders for a call whose peerIdentityId matches this route.
        const activeCall = ref(voiceUseCase ? voiceUseCase.getActiveCall() : null);
        const isMuted = ref(voiceUseCase ? voiceUseCase.isMuted() : false);
        const voiceError = ref('');
        const remoteAudioEl = ref(null);
        // 0.2.75 — Voice UX & Device Controls. `inputDevices`/`outputDevices`
        // are refreshed once media is actually attached (see
        // refreshInputDevices()/refreshOutputDevices() below) rather than
        // eagerly on mount — enumerateDevices() needs no permission, but
        // there is nothing useful to pick a device FOR until a call
        // reaches CONNECTING/ACTIVE. `selectedInputDeviceId` mirrors
        // application/VoiceUseCase.js#getInputDevice() (this device's own
        // STANDING preference); `selectedOutputDeviceId` is pure UI state
        // — see this view's own header on why output selection never
        // reaches voiceUseCase at all.
        const inputDevices = ref([]);
        const outputDevices = ref([]);
        const selectedInputDeviceId = ref('');
        const selectedOutputDeviceId = ref('');
        const micProblem = ref('');

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
        // 0.2.73 — this view's own call bar only ever concerns a call
        // with THIS route's peer; a call the device has with someone
        // else is deliberately invisible here beyond disabling "Call".
        const callForThisPeer = computed(() => (activeCall.value && activeCall.value.peerIdentityId === peerIdentityId) ? activeCall.value : null);
        const isRinging = computed(() => callForThisPeer.value && callForThisPeer.value.state === VoiceSessionState.RINGING);
        const isInCallWithThisPeer = computed(() => callForThisPeer.value
            && [VoiceSessionState.CALLING, VoiceSessionState.CONNECTING, VoiceSessionState.ACTIVE].includes(callForThisPeer.value.state));
        // 0.2.75 — see this view's own header, item (1)/(2). Neither of
        // these is a new lifecycle concept — both are pure derivations of
        // the SAME `callForThisPeer.value.state` isInCallWithThisPeer
        // above already reads.
        const isOutgoingRinging = computed(() => callForThisPeer.value && callForThisPeer.value.state === VoiceSessionState.CALLING);
        const hasMediaAttached = computed(() => callForThisPeer.value
            && [VoiceSessionState.CONNECTING, VoiceSessionState.ACTIVE].includes(callForThisPeer.value.state));
        const canCall = computed(() => Boolean(voiceUseCase) && !activeCall.value && isConnected.value
            && voiceUseCase.canCall(peerIdentityId) && voiceUseCase.supportsVoice(connectedPeer.value));
        const callStatusLabel = computed(() => {
            if (!callForThisPeer.value) return '';
            switch (callForThisPeer.value.state) {
                case VoiceSessionState.CALLING: return 'Calling…';
                case VoiceSessionState.RINGING: return 'Incoming call';
                case VoiceSessionState.CONNECTING: return 'Connecting…';
                case VoiceSessionState.ACTIVE: return 'On call';
                default: return '';
            }
        });

        const statusLabel = computed(() => {
            if (isBlocked.value) return 'Blocked';
            if (!isFriend.value) return 'Not friends';
            return isConnected.value ? 'Online · Friend' : 'Offline · Friend';
        });

        function refreshPeers(list) {
            peers.value = list || peerSessionManager.listPeers();
            refreshPresence();
        }

        // 0.2.70 — re-reads the reconciled snapshot, then marks
        // everything currently stored for this peer as read: this view
        // being open and rendering `messages` IS "the owner looked," the
        // same moment `application/PeerPresenceUseCase.js#markRead()`'s
        // own header describes. Harmless to call repeatedly — marking
        // read is a monotonic high-water mark (core/
        // ConversationReadMarker.js), never a toggle.
        function refreshPresence() {
            peerPresenceUseCase.markRead(peerIdentityId);
            presence.value = peerPresenceUseCase.getSummary(peerIdentityId);
            // 0.2.71 — a deliberately separate call: see this view's own
            // header on why the local marker above and the network
            // acknowledgement below are two independent computations,
            // never one transmitting the other.
            chatUseCase.sendReadReceipt(peerIdentityId);
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
            refreshPresence();
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
            // 0.2.71 — "Seen" takes priority over "Delivered": the peer
            // acknowledging they READ this message is strictly stronger
            // evidence than the transport-level delivery ack alone, and
            // is only ever reachable once DELIVERED already happened.
            if (message.deliveryState === 'DELIVERED' && message.sequence <= peerReadThroughSequence.value) {
                return 'Seen';
            }
            switch (message.deliveryState) {
                case 'QUEUED': return 'Queued — will send once they reconnect';
                case 'SENT': return 'Sent';
                case 'DELIVERED': return 'Delivered';
                case 'EXPIRED': return 'Undelivered — expired';
                case 'CANCELLED': return 'Undelivered — cancelled';
                default: return '';
            }
        }

        function formatTime(timestamp) {
            return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        const showDetail = ref(false);

        // 0.2.73 — re-reads application/VoiceUseCase.js's own snapshot;
        // called from every voiceUseCase event, mirroring
        // refreshPeers()/refreshMessages()'s own "re-derive, never
        // locally mutate" discipline.
        function refreshVoice() {
            if (!voiceUseCase) return;
            activeCall.value = voiceUseCase.getActiveCall();
            isMuted.value = voiceUseCase.isMuted();
            if (remoteAudioEl.value) {
                const stream = activeCall.value ? voiceUseCase.getRemoteStream(activeCall.value.callId) : null;
                if (remoteAudioEl.value.srcObject !== stream) {
                    remoteAudioEl.value.srcObject = stream;
                }
            }
            // 0.2.75 — the call bar (and any device problem it was
            // showing) is entirely about a call THIS peer is in; once
            // that's no longer true, both reset rather than lingering
            // stale until the next call happens to overwrite them.
            if (!callForThisPeer.value) {
                micProblem.value = '';
            }
        }

        function call() {
            voiceError.value = '';
            try {
                voiceUseCase.startCall(connectedPeer.value);
                refreshVoice();
            } catch (e) {
                voiceError.value = e.message.replace(/^VoiceUseCase:\s*/, '');
            }
        }

        async function acceptIncomingCall() {
            voiceError.value = '';
            try {
                await voiceUseCase.acceptCall(callForThisPeer.value.callId);
                // 0.2.75 — media is only actually attached once
                // acceptCall() resolves; listing devices any earlier
                // would show a picker with nothing yet to act on.
                await Promise.all([refreshInputDevices(), refreshOutputDevices()]);
            } catch (e) {
                voiceError.value = e.message.replace(/^(VoiceUseCase|LocalAudioTrackProvider):\s*/, '');
            }
            refreshVoice();
        }

        function rejectIncomingCall() {
            voiceUseCase.rejectCall(callForThisPeer.value.callId);
            refreshVoice();
        }

        function hangUp() {
            voiceUseCase.endCall(callForThisPeer.value.callId);
            refreshVoice();
        }

        function toggleMute() {
            voiceUseCase.setMuted(!isMuted.value);
            isMuted.value = voiceUseCase.isMuted();
        }

        // 0.2.75 — "what could setInputDevice() below choose among?" A
        // plain call to application/VoiceUseCase.js's own pass-through;
        // this view invents no device vocabulary of its own.
        async function refreshInputDevices() {
            if (!voiceUseCase) return;
            inputDevices.value = await voiceUseCase.listInputDevices();
            selectedInputDeviceId.value = voiceUseCase.getInputDevice() || '';
        }

        // 0.2.75 — deliberately calls `navigator.mediaDevices` DIRECTLY,
        // never through voiceUseCase — see this view's own header and
        // application/VoiceUseCase.js's own header, "Output Device
        // Selection Never Enters This Class." Degrades to an empty list
        // (no picker shown) in a browser without device enumeration.
        async function refreshOutputDevices() {
            if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
                outputDevices.value = [];
                return;
            }
            const devices = await navigator.mediaDevices.enumerateDevices();
            outputDevices.value = devices.filter((d) => d.kind === 'audiooutput').map((d) => ({ deviceId: d.deviceId, label: d.label }));
        }

        async function changeInputDevice(event) {
            const deviceId = event.target.value || null;
            voiceError.value = '';
            try {
                await voiceUseCase.setInputDevice(deviceId);
            } catch (e) {
                voiceError.value = e.message.replace(/^(VoiceUseCase|LocalAudioTrackProvider):\s*/, '');
            }
            // Re-reads the STANDING preference regardless of success —
            // on failure this restores the dropdown to whatever device is
            // actually still attached, per application/VoiceUseCase.js
            // #setInputDevice()'s own "never partially switched" contract.
            selectedInputDeviceId.value = voiceUseCase.getInputDevice() || '';
        }

        // A speaker choice is only ever meaningful once `<audio
        // ref="remoteAudioEl">` actually exists AND this browser supports
        // `setSinkId()` — both feature-detected here rather than assumed;
        // see this view's own header on why this never touches
        // voiceUseCase at all.
        async function changeOutputDevice(event) {
            const deviceId = event.target.value || '';
            if (!remoteAudioEl.value || typeof remoteAudioEl.value.setSinkId !== 'function') {
                return;
            }
            voiceError.value = '';
            try {
                await remoteAudioEl.value.setSinkId(deviceId);
                selectedOutputDeviceId.value = deviceId;
            } catch {
                voiceError.value = 'Could not switch to that speaker.';
            }
        }

        let unsubscribePeers = null;
        let unsubscribeMessages = null;
        let unsubscribeSession = null;
        let unsubscribePresence = null;
        let unsubscribeReadReceipt = null;
        let unsubscribeVoiceState = null;
        let unsubscribeIncomingCall = null;
        let unsubscribeMicrophoneUnavailable = null;
        onMounted(() => {
            refreshPeers();
            refreshMessages();
            unsubscribePeers = peerSessionManager.onPeersChanged((list) => refreshPeers(list));
            unsubscribeMessages = chatUseCase.onMessage((senderPeerIdentityId) => {
                if (senderPeerIdentityId === peerIdentityId) {
                    refreshMessages();
                }
            });
            // 0.2.70 — a relationship/friendship change (e.g. an
            // unfriend completed from another tab) reconciles here too,
            // not only a new message or a connection change already
            // covered by refreshPeers()/refreshMessages() above.
            unsubscribePresence = peerPresenceUseCase.onChange(() => { presence.value = peerPresenceUseCase.getSummary(peerIdentityId); });
            // 0.2.71 — a peer's read receipt arriving for THIS
            // conversation refreshes `peerReadThroughSequence` so
            // deliveryLabel() can show "Seen" without a manual refresh.
            unsubscribeReadReceipt = chatUseCase.onReadReceipt((senderPeerIdentityId, readThroughSequence) => {
                if (senderPeerIdentityId === peerIdentityId) {
                    peerReadThroughSequence.value = readThroughSequence;
                }
            });
            unsubscribeSession = identityUseCase.onSessionChanged(() => {
                isAuthenticated.value = identityUseCase.isAuthenticated();
            });
            // 0.2.73 — every call-state transition (this peer's own, or
            // any other's — refreshVoice() re-reads the device-wide
            // snapshot either way, so a call ending with someone else
            // correctly re-enables this view's own "Call" button too)
            // and every incoming INVITE refresh the same snapshot.
            if (voiceUseCase) {
                refreshVoice();
                unsubscribeVoiceState = voiceUseCase.onCallStateChanged((callId, state, info) => {
                    // 0.2.74 — see VOICE_END_REASON_MESSAGE's own header.
                    // Only surfaced for a call that was with THIS route's
                    // peer — a call ending elsewhere never overwrites this
                    // view's own voiceError.
                    if (state === VoiceSessionState.ENDED && info && info.peerIdentityId === peerIdentityId) {
                        voiceError.value = VOICE_END_REASON_MESSAGE[info.reason] || '';
                    }
                    // 0.2.75 — the CALLER side only ever reaches
                    // CONNECTING/ACTIVE asynchronously, once the callee
                    // accepts — this is the one moment call() itself
                    // cannot refresh device lists from directly (unlike
                    // acceptIncomingCall(), which awaits its own
                    // acceptance). ACTIVE only — CONNECTING still has no
                    // remote stream yet, and refreshing twice in a row is
                    // pure waste.
                    if (state === VoiceSessionState.ACTIVE && info && info.peerIdentityId === peerIdentityId) {
                        refreshInputDevices();
                        refreshOutputDevices();
                    }
                    refreshVoice();
                });
                unsubscribeIncomingCall = voiceUseCase.onIncomingCall(() => refreshVoice());
                // 0.2.75 — see this view's own header, item (3).
                unsubscribeMicrophoneUnavailable = voiceUseCase.onMicrophoneUnavailable((callId, peerId) => {
                    if (callForThisPeer.value && callForThisPeer.value.callId === callId && peerId === peerIdentityId) {
                        micProblem.value = 'Your microphone disappeared — the call continues without your audio.';
                    }
                });
            }
            scrollToBottom();
        });
        onBeforeUnmount(() => {
            if (unsubscribePeers) unsubscribePeers();
            if (unsubscribeMessages) unsubscribeMessages();
            if (unsubscribePresence) unsubscribePresence();
            if (unsubscribeReadReceipt) unsubscribeReadReceipt();
            if (unsubscribeSession) unsubscribeSession();
            if (unsubscribeVoiceState) unsubscribeVoiceState();
            if (unsubscribeIncomingCall) unsubscribeIncomingCall();
            if (unsubscribeMicrophoneUnavailable) unsubscribeMicrophoneUnavailable();
        });

        return {
            peerIdentityId, isAuthenticated, messages, draft, sendError, messageListEl,
            displayName, shortId, isConnected, isBlocked, isFriend, canChat, statusLabel,
            send, formatTime, deliveryLabel, presence, showDetail,
            // 0.2.73
            callForThisPeer, isRinging, isInCallWithThisPeer, canCall, callStatusLabel,
            isMuted, voiceError, remoteAudioEl,
            call, acceptIncomingCall, rejectIncomingCall, hangUp, toggleMute,
            // 0.2.75
            isOutgoingRinging, hasMediaAttached, inputDevices, outputDevices,
            selectedInputDeviceId, selectedOutputDeviceId, micProblem,
            changeInputDevice, changeOutputDevice
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
                    <!-- 0.2.73 -->
                    <button v-if="!callForThisPeer" type="button" class="action-btn call-btn"
                            :disabled="!canCall" @click="call" title="Start a voice call">
                        📞 Call
                    </button>
                </header>
                <p class="identity-mgmt-status">
                    {{ shortId(peerIdentityId) }}
                    <button type="button" class="chat-detail-toggle" @click="showDetail = !showDetail">
                        {{ showDetail ? 'Hide details' : 'Show details' }}
                    </button>
                </p>

                <!-- 0.2.73 — the device's own single call bar, shown ONLY
                     when the active call belongs to THIS peer — see this
                     view's own header. -->
                <div v-if="callForThisPeer" class="call-bar">
                    <span class="call-bar-status">{{ callStatusLabel }}</span>
                    <template v-if="isRinging">
                        <button type="button" class="action-btn action-btn--primary" @click="acceptIncomingCall">Accept</button>
                        <button type="button" class="action-btn" @click="rejectIncomingCall">Decline</button>
                    </template>
                    <template v-else-if="isInCallWithThisPeer">
                        <!-- 0.2.75 — device pickers only once media is
                             actually attached; see this view's own header. -->
                        <template v-if="hasMediaAttached">
                            <select v-if="inputDevices.length" class="call-device-select" v-model="selectedInputDeviceId"
                                    @change="changeInputDevice" title="Microphone">
                                <option value="">System default mic</option>
                                <option v-for="d in inputDevices" :key="d.deviceId" :value="d.deviceId">{{ d.label || 'Microphone' }}</option>
                            </select>
                            <select v-if="outputDevices.length" class="call-device-select" v-model="selectedOutputDeviceId"
                                    @change="changeOutputDevice" title="Speaker">
                                <option value="">System default speaker</option>
                                <option v-for="d in outputDevices" :key="d.deviceId" :value="d.deviceId">{{ d.label || 'Speaker' }}</option>
                            </select>
                            <button type="button" class="action-btn" @click="toggleMute">{{ isMuted ? 'Unmute' : 'Mute' }}</button>
                        </template>
                        <button type="button" class="action-btn call-btn--end" @click="hangUp">{{ isOutgoingRinging ? 'Cancel' : 'Hang Up' }}</button>
                    </template>
                    <audio ref="remoteAudioEl" autoplay></audio>
                </div>
                <p v-if="micProblem" class="call-bar-note">{{ micProblem }}</p>
                <p v-if="voiceError" class="identity-unlock-error">{{ voiceError }}</p>

                <!-- 0.2.70 — the reconciled view: identity/relationship/
                     friendship/connection/conversation are five
                     independent facts, shown as five independent lines
                     rather than collapsed into the one-word statusLabel
                     badge above — see application/PeerPresenceUseCase.js's
                     own header on why offline never implies any of the
                     other four are also gone. -->
                <div v-if="showDetail" class="peer-detail-row chat-detail-panel">
                    <p class="identity-mgmt-status">Identity: known ({{ shortId(peerIdentityId) }})</p>
                    <p class="identity-mgmt-status">Relationship: {{ presence.relationship ? 'remembered' : 'not remembered' }}</p>
                    <p class="identity-mgmt-status">Friendship: {{ presence.friendshipState }}</p>
                    <p class="identity-mgmt-status">Connection: {{ presence.isConnectedNow ? 'CONNECTED' : 'DISCONNECTED' }}</p>
                    <p class="identity-mgmt-status">
                        Conversation: {{ presence.conversation.messageCount }} message{{ presence.conversation.messageCount === 1 ? '' : 's' }}
                        <template v-if="presence.conversation.pendingOutboxCount > 0">
                            · {{ presence.conversation.pendingOutboxCount }} waiting to send
                        </template>
                    </p>
                </div>

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
