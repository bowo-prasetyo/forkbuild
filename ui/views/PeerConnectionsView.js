import { ref, reactive, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';

// 0.2.55 — Peer Connections & Rendezvous UI: the first live surface over
// everything 0.2.49 through 0.2.54 built underneath. Answers the one
// question the app still had no answer for — "okay, I have an identity,
// how do I actually connect to another person?" — through nothing but
// application/PeerSessionManager.js, itself nothing but a thin composition
// of application/ConnectToPeerUseCase.js and application/
// DiscoverPeersUseCase.js. This view invents no new state machine: every
// badge below is peer.getLifecycleState() (peer/PeerLifecycleState.js),
// read straight off the SAME application/ConnectedPeer.js / peer/
// PeerAuthenticationSession.js this codebase has had since 0.2.49/0.2.50.
//
// No chat (peer/PeerMessageBus.js is still not touched anywhere in this
// file). An alias typed into a peer's CARD — the "Local alias" field
// below — is exactly what application/ConnectedPeer.js already documents
// it as: a local note, never sent, never surviving a reconnect.
//
// 0.2.56 adds the persistent counterpart 0.2.55 deliberately declined to
// add: "Known Peers," backed entirely by application/
// PeerRelationshipUseCase.js. The two lists on this page answer two
// different questions and are never merged into one: "My Peers" is
// exactly as ephemeral as it always was — every row disappears the
// instant application/ConnectedPeerRegistry.js says the connection is
// gone — while "Known Peers" is exactly as durable as
// application/PeerRelationshipUseCase.js's own storage, surviving a
// disconnect, a reload, and the app restarting. A peer only ever crosses
// from the first list into the second by an explicit "Remember" click —
// see docs/Principles.md, "Remembering A Peer Is A Deliberate Act, Never
// A Side Effect Of Authentication" (0.2.56) — never automatically.
const LIFECYCLE_LABELS = {
    [PeerLifecycleState.CONNECTING]: 'Connecting…',
    [PeerLifecycleState.CONNECTED]: 'Connected — not yet authenticated',
    [PeerLifecycleState.AUTHENTICATING]: 'Authenticating…',
    [PeerLifecycleState.AUTHENTICATED]: 'Authenticated',
    [PeerLifecycleState.FAILED]: 'Failed'
};

const LIFECYCLE_CLASSES = {
    [PeerLifecycleState.CONNECTING]: 'peer-badge--pending',
    [PeerLifecycleState.CONNECTED]: 'peer-badge--pending',
    [PeerLifecycleState.AUTHENTICATING]: 'peer-badge--pending',
    [PeerLifecycleState.AUTHENTICATED]: 'peer-badge--authenticated',
    [PeerLifecycleState.FAILED]: 'peer-badge--failed'
};

// The five-step progression the design doc asked for. Rendezvous and
// WebRTC-connecting are folded into "not yet CONNECTED" here, since a
// real WebRtcPeerConnection has no separately-observable "rendezvous
// discovered" moment beyond having imported the invitation at all.
const PROGRESSION_STEPS = [
    { label: 'Rendezvous discovered', reached: () => true },
    { label: 'WebRTC connecting', reached: (state) => state !== null },
    { label: 'Peer connected', reached: (state) => state && state !== PeerLifecycleState.CONNECTING && state !== PeerLifecycleState.FAILED },
    { label: 'Authenticating identity', reached: (state) => state === PeerLifecycleState.AUTHENTICATING || state === PeerLifecycleState.AUTHENTICATED },
    { label: 'Authenticated', reached: (state) => state === PeerLifecycleState.AUTHENTICATED }
];

function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function stripPrefix(message) {
    return message.replace(/^(PeerSessionManager|PeerRelationshipUseCase|LocalPeerDiscoveryProvider|WebRtcPeerConnectionProvider|WebRtcPeerConnection|PeerInvitation|PeerConnectionOffer|PeerConnectionAnswer):\s*/, '');
}

export default {
    name: 'PeerConnectionsView',
    setup() {
        const identityUseCase = inject('identityUseCase');
        const peerSessionManager = inject('peerSessionManager');
        const peerRelationshipUseCase = inject('peerRelationshipUseCase');

        const isAuthenticated = ref(identityUseCase.isAuthenticated());
        const peers = ref(peerSessionManager.listPeers());
        const relationships = ref(isAuthenticated.value ? peerRelationshipUseCase.getRelationships() : []);
        const relationshipError = ref('');
        const now = ref(Date.now());
        // Purely local, view-only bookkeeping for "connected duration" —
        // application/ConnectedPeer.js itself has no createdAt, on purpose
        // (see its own header: it is exactly as durable as the connection
        // it wraps, nothing more). Never read by anything but this display.
        const firstSeenAt = new Map();

        function refreshPeers(list) {
            const snapshot = list || peerSessionManager.listPeers();
            for (const peer of snapshot) {
                if (!firstSeenAt.has(peer.connectionId)) {
                    firstSeenAt.set(peer.connectionId, Date.now());
                }
            }
            peers.value = snapshot;
        }

        function connectedFor(peer) {
            const since = firstSeenAt.get(peer.connectionId);
            return since ? formatDuration(now.value - since) : '0s';
        }

        // --- Known Peers (0.2.56) ----------------------------------------
        function refreshRelationships(list) {
            relationships.value = list || peerRelationshipUseCase.getRelationships();
        }

        // A relationship is looked up ONLY by a peer's already-verified
        // remoteIdentity — see application/PeerRelationshipUseCase.js's
        // own header on why an invitation hint is never eligible here.
        function relationshipFor(peer) {
            return peer.remoteIdentity ? peerRelationshipUseCase.getRelationship(peer.remoteIdentity.identityId) : null;
        }

        // "Is this known peer connected right now?" is never stored on
        // the relationship itself — see core/PeerRelationshipStatus.js's
        // own header — it is derived, fresh, from the SAME live `peers`
        // list "My Peers" already renders above.
        function isConnectedNow(identityId) {
            return peers.value.some((p) => p.remoteIdentity
                && p.remoteIdentity.identityId === identityId
                && p.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
        }

        function rememberPeer(peer) {
            relationshipError.value = '';
            try {
                peerRelationshipUseCase.rememberPeer(peer.remoteIdentity, { alias: peer.alias || undefined });
            } catch (e) {
                relationshipError.value = stripPrefix(e.message);
            }
        }

        function forgetKnownPeer(identityId) {
            relationshipError.value = '';
            try {
                peerRelationshipUseCase.forgetPeer(identityId);
            } catch (e) {
                relationshipError.value = stripPrefix(e.message);
            }
        }

        function updateKnownAlias(identityId, event) {
            peerRelationshipUseCase.updateAlias(identityId, event.target.value);
        }

        function formatWhen(date) {
            return date instanceof Date ? date.toLocaleString() : '';
        }

        // --- Invite Someone ---------------------------------------------
        const invitePending = ref(false);
        const inviteError = ref('');
        const pendingInvitation = reactive({ json: '', expiresAt: null, connectionId: null });

        async function startInvite() {
            inviteError.value = '';
            pendingInvitation.json = '';
            invitePending.value = true;
            try {
                const { invitation, connectedPeer } = await peerSessionManager.createInvitation();
                pendingInvitation.json = JSON.stringify(invitation.toJSON(), null, 2);
                pendingInvitation.expiresAt = invitation.expiresAt;
                pendingInvitation.connectionId = connectedPeer.connectionId;
            } catch (e) {
                inviteError.value = stripPrefix(e.message);
            } finally {
                invitePending.value = false;
            }
        }
        function dismissInvitation() {
            pendingInvitation.json = '';
            pendingInvitation.expiresAt = null;
            pendingInvitation.connectionId = null;
        }

        // --- Connect to Peer ----------------------------------------------
        const showAcceptForm = ref(false);
        const importText = ref('');
        const acceptError = ref('');
        const acceptReply = ref('');
        async function submitAcceptInvitation() {
            acceptError.value = '';
            if (!importText.value.trim()) {
                return;
            }
            try {
                const { reply } = await peerSessionManager.acceptInvitation(importText.value.trim());
                acceptReply.value = reply;
                importText.value = '';
            } catch (e) {
                acceptError.value = stripPrefix(e.message);
            }
        }
        function closeAcceptForm() {
            showAcceptForm.value = false;
            importText.value = '';
            acceptError.value = '';
            acceptReply.value = '';
        }

        // --- Complete Connection (the inviter's second, closing step) ------
        const completingConnectionId = ref(null);
        const completeReplyText = ref('');
        const completeError = ref('');
        function startComplete(peer) {
            completingConnectionId.value = peer.connectionId;
            completeReplyText.value = '';
            completeError.value = '';
        }
        async function submitComplete(peer) {
            completeError.value = '';
            if (!completeReplyText.value.trim()) {
                return;
            }
            try {
                await peerSessionManager.completeConnection(peer.connectionId, completeReplyText.value.trim());
                completingConnectionId.value = null;
                completeReplyText.value = '';
            } catch (e) {
                completeError.value = stripPrefix(e.message);
            }
        }
        function awaitingReply(peer) {
            // Only the offering side of a real WebRTC handshake ever needs
            // a second, manual paste — see peer/WebRtcPeerConnection.js's
            // own header. Bob's side (role "answerer") completes the moment
            // ICE finds a path; there is nothing for him to paste.
            return peer.connection && peer.connection.role === 'offerer' && peer.getLifecycleState() === PeerLifecycleState.CONNECTING;
        }

        // --- Peer Identity panel --------------------------------------------
        const selectedConnectionId = ref(null);
        const selectedPeer = computed(() => peers.value.find((p) => p.connectionId === selectedConnectionId.value) || null);
        function openDetail(peer) { selectedConnectionId.value = peer.connectionId; }
        function closeDetail() { selectedConnectionId.value = null; }

        function disconnectPeer(peer) {
            peerSessionManager.disconnect(peer.connectionId);
            if (selectedConnectionId.value === peer.connectionId) {
                closeDetail();
            }
        }

        function updateAlias(peer, event) {
            peer.setAlias(event.target.value);
        }

        // --- copy-to-clipboard -----------------------------------------------
        const copiedKey = ref(null);
        async function copyText(text, key) {
            try {
                await navigator.clipboard.writeText(text);
                copiedKey.value = key;
                setTimeout(() => { if (copiedKey.value === key) copiedKey.value = null; }, 1500);
            } catch {
                // Clipboard API unavailable or denied — the text is already
                // shown in a selectable, readonly textarea for manual copy.
            }
        }

        function shortId(identityId) {
            return identityId ? identityId.slice(-14) : '';
        }

        function progressionState(peer) {
            return peer ? peer.getLifecycleState() : null;
        }

        let unsubscribePeers = null;
        let unsubscribeRelationships = null;
        let unsubscribeSession = null;
        let tickInterval = null;
        onMounted(() => {
            refreshPeers();
            refreshRelationships();
            unsubscribePeers = peerSessionManager.onPeersChanged((list) => refreshPeers(list));
            unsubscribeRelationships = peerRelationshipUseCase.onRelationshipsChanged((list) => refreshRelationships(list));
            unsubscribeSession = identityUseCase.onSessionChanged(() => {
                isAuthenticated.value = identityUseCase.isAuthenticated();
                refreshRelationships();
            });
            tickInterval = setInterval(() => { now.value = Date.now(); }, 1000);
        });
        onBeforeUnmount(() => {
            if (unsubscribePeers) unsubscribePeers();
            if (unsubscribeRelationships) unsubscribeRelationships();
            if (unsubscribeSession) unsubscribeSession();
            if (tickInterval) clearInterval(tickInterval);
        });

        return {
            isAuthenticated, peers, PeerLifecycleState, LIFECYCLE_LABELS, LIFECYCLE_CLASSES, PROGRESSION_STEPS,
            connectedFor, shortId, progressionState,
            invitePending, inviteError, pendingInvitation, startInvite, dismissInvitation,
            showAcceptForm, importText, acceptError, acceptReply, submitAcceptInvitation, closeAcceptForm,
            completingConnectionId, completeReplyText, completeError, startComplete, submitComplete, awaitingReply,
            selectedPeer, openDetail, closeDetail, disconnectPeer, updateAlias,
            copiedKey, copyText,
            relationships, relationshipError, relationshipFor, isConnectedNow,
            rememberPeer, forgetKnownPeer, updateKnownAlias, formatWhen
        };
    },
    template: `
        <section class="peer-connections-view">
            <h1>Connected Peers</h1>
            <p class="form-hint form-hint--neutral">
                A peer in "My Peers" below is a live, authenticated WebRTC connection —
                nothing more. Closing it makes the peer disappear from this list; that alone
                never saves anything. Choosing <strong>Remember</strong> on an authenticated peer
                is the one deliberate way to keep a local record of who they are — see
                "Known Peers" further down. Either way, reconnecting always re-authenticates
                from nothing; nothing about a past connection itself is ever reused.
            </p>

            <p v-if="!isAuthenticated" class="form-hint form-hint--neutral">
                Sign in to an identity (see <router-link to="/identity">My Identities</router-link>) before
                inviting or connecting to a peer — a connection authenticates a real key, and
                there is nothing of yours to authenticate with until you do.
            </p>

            <template v-else>
                <div class="peer-actions">
                    <button class="action-btn action-btn--primary" :disabled="invitePending" @click="startInvite">
                        {{ invitePending ? 'Creating…' : 'Invite Someone' }}
                    </button>
                    <button class="action-btn action-btn--secondary" @click="showAcceptForm = !showAcceptForm">
                        Connect to Peer
                    </button>
                </div>

                <p v-if="inviteError" class="identity-unlock-error">{{ inviteError }}</p>

                <div v-if="pendingInvitation.json" class="peer-signal-box">
                    <h2>Invitation</h2>
                    <p class="form-hint form-hint--neutral">
                        Expires {{ new Date(pendingInvitation.expiresAt).toLocaleTimeString() }}. This is a
                        rendezvous hint, not proof of who you are — send it to the person you want to
                        connect with over any channel you already trust to reach them.
                    </p>
                    <textarea class="form-input peer-signal-json" rows="6" readonly :value="pendingInvitation.json"></textarea>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--secondary" @click="dismissInvitation">Dismiss</button>
                        <button class="modal-btn modal-btn--primary" @click="copyText(pendingInvitation.json, 'invitation')">
                            {{ copiedKey === 'invitation' ? 'Copied!' : 'Copy Invitation' }}
                        </button>
                    </div>
                    <p class="form-hint form-hint--neutral">
                        Once they reply, find this pending connection below in <strong>My Peers</strong> and paste
                        their reply there to finish connecting.
                    </p>
                </div>

                <div v-if="showAcceptForm" class="peer-signal-box">
                    <h2>Connect to Peer</h2>
                    <textarea v-model="importText" class="form-input peer-signal-json" rows="6"
                              placeholder="Paste an invitation here"></textarea>
                    <p v-if="acceptError" class="identity-unlock-error">{{ acceptError }}</p>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--secondary" @click="closeAcceptForm">Cancel</button>
                        <button class="modal-btn modal-btn--primary" @click="submitAcceptInvitation">Connect</button>
                    </div>

                    <div v-if="acceptReply" class="peer-signal-box peer-signal-box--nested">
                        <p class="form-hint form-hint--neutral">
                            Send this reply back to whoever invited you — the connection will not
                            complete until they paste it in.
                        </p>
                        <textarea class="form-input peer-signal-json" rows="6" readonly :value="acceptReply"></textarea>
                        <button class="modal-btn modal-btn--primary" @click="copyText(acceptReply, 'reply')">
                            {{ copiedKey === 'reply' ? 'Copied!' : 'Copy Reply' }}
                        </button>
                    </div>
                </div>
            </template>

            <h2 class="peer-my-peers-heading">My Peers</h2>
            <div v-if="peers.length" class="identity-mgmt-list">
                <div v-for="peer in peers" :key="peer.connectionId" class="identity-mgmt-card">
                    <div class="identity-mgmt-card-header">
                        <span class="identity-mgmt-name">{{ peer.alias || (peer.remoteIdentity ? shortId(peer.remoteIdentity.identityId) : 'Unknown peer') }}</span>
                        <span class="peer-badge" :class="LIFECYCLE_CLASSES[peer.getLifecycleState()]">
                            {{ LIFECYCLE_LABELS[peer.getLifecycleState()] || peer.getLifecycleState() }}
                        </span>
                    </div>
                    <p class="identity-mgmt-status">
                        WebRTC · connected {{ connectedFor(peer) }}
                        <template v-if="peer.remoteIdentity"> · {{ shortId(peer.remoteIdentity.identityId) }}</template>
                    </p>

                    <ol class="peer-progression" v-if="peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED">
                        <li v-for="step in PROGRESSION_STEPS" :key="step.label"
                            :class="{ 'peer-progression-step--done': step.reached(progressionState(peer)) }">
                            {{ step.label }}
                        </li>
                    </ol>

                    <label class="peer-alias-field">
                        <span class="form-label">Local alias (never shared)</span>
                        <input type="text" class="form-input" :value="peer.alias || ''"
                               placeholder="e.g. Bob"
                               @change="updateAlias(peer, $event)" />
                    </label>

                    <div v-if="awaitingReply(peer)" class="peer-complete-box">
                        <template v-if="completingConnectionId === peer.connectionId">
                            <textarea v-model="completeReplyText" class="form-input peer-signal-json" rows="5"
                                      placeholder="Paste their reply here"></textarea>
                            <p v-if="completeError" class="identity-unlock-error">{{ completeError }}</p>
                            <div class="modal-actions">
                                <button class="modal-btn modal-btn--secondary" @click="completingConnectionId = null">Cancel</button>
                                <button class="modal-btn modal-btn--primary" @click="submitComplete(peer)">Complete Connection</button>
                            </div>
                        </template>
                        <button v-else class="action-btn action-btn--secondary" @click="startComplete(peer)">
                            Paste Reply to Complete
                        </button>
                    </div>

                    <p v-if="peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && relationshipFor(peer)" class="form-hint form-hint--neutral">
                        ✓ Known Peer{{ relationshipFor(peer).alias ? ' — ' + relationshipFor(peer).alias : '' }}
                    </p>

                    <div class="identity-mgmt-actions">
                        <button v-if="peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && !relationshipFor(peer)"
                                class="action-btn action-btn--secondary" @click="rememberPeer(peer)">
                            Remember
                        </button>
                        <button v-if="peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && relationshipFor(peer)"
                                class="action-btn action-btn--secondary" @click="forgetKnownPeer(peer.remoteIdentity.identityId)">
                            Forget
                        </button>
                        <button class="action-btn action-btn--secondary" @click="openDetail(peer)">Details</button>
                        <button class="action-btn action-btn--danger" @click="disconnectPeer(peer)">Disconnect</button>
                    </div>
                </div>
            </div>
            <p v-else class="form-hint form-hint--neutral">No peers connected right now.</p>

            <p v-if="relationshipError" class="identity-unlock-error">{{ relationshipError }}</p>

            <h2 class="peer-my-peers-heading">Known Peers</h2>
            <p class="form-hint form-hint--neutral">
                A known peer remembers an IDENTITY, never a connection or an address. Reconnecting to a
                known peer always re-authenticates from nothing before this device treats the result as the
                same person again — "Connected now" below is read live from My Peers, never stored here.
            </p>
            <div v-if="relationships.length" class="identity-mgmt-list">
                <div v-for="relationship in relationships" :key="relationship.identityId" class="identity-mgmt-card">
                    <div class="identity-mgmt-card-header">
                        <span class="identity-mgmt-name">{{ relationship.alias || shortId(relationship.identityId) }}</span>
                        <span class="peer-badge" :class="isConnectedNow(relationship.identityId) ? 'peer-badge--authenticated' : 'peer-badge--pending'">
                            {{ isConnectedNow(relationship.identityId) ? 'Connected now' : 'Not connected' }}
                        </span>
                    </div>
                    <p class="identity-mgmt-status">
                        {{ shortId(relationship.identityId) }} · known since {{ formatWhen(relationship.createdAt) }}
                        <br />last authenticated {{ formatWhen(relationship.lastAuthenticatedAt) }}
                    </p>

                    <label class="peer-alias-field">
                        <span class="form-label">Alias</span>
                        <input type="text" class="form-input" :value="relationship.alias || ''"
                               placeholder="e.g. Bob"
                               @change="updateKnownAlias(relationship.identityId, $event)" />
                    </label>

                    <div class="identity-mgmt-actions">
                        <button class="action-btn action-btn--danger" @click="forgetKnownPeer(relationship.identityId)">Forget</button>
                    </div>
                </div>
            </div>
            <p v-else class="form-hint form-hint--neutral">
                No known peers yet. Authenticate a connection above, then click <strong>Remember</strong> on
                their card to keep a local record of who they are.
            </p>

            <div v-if="selectedPeer" role="dialog" aria-label="Peer identity" class="modal-overlay" @click.self="closeDetail">
                <div class="modal-panel peer-detail-panel">
                    <h3>Peer Identity</h3>

                    <div class="peer-detail-row">
                        <span class="form-label">Identity</span>
                        <code class="peer-detail-value">{{ selectedPeer.remoteIdentity ? selectedPeer.remoteIdentity.identityId : 'Not yet authenticated' }}</code>
                    </div>
                    <div class="peer-detail-row" v-if="selectedPeer.remoteIdentity">
                        <span class="form-label">Public Key</span>
                        <code class="peer-detail-value">{{ selectedPeer.remoteIdentity.publicKey }}</code>
                    </div>
                    <div class="peer-detail-row" v-if="selectedPeer.remoteIdentity">
                        <span class="form-label">Authentication</span>
                        <span class="peer-detail-value">{{ selectedPeer.remoteIdentity.algorithm }}</span>
                    </div>
                    <div class="peer-detail-row">
                        <span class="form-label">Connection</span>
                        <span class="peer-detail-value">WebRTC</span>
                    </div>
                    <div class="peer-detail-row">
                        <span class="form-label">Authenticated</span>
                        <span class="peer-detail-value">{{ selectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED ? 'Yes' : 'No' }}</span>
                    </div>
                    <div class="peer-detail-row">
                        <span class="form-label">Session</span>
                        <span class="peer-detail-value">Ephemeral — gone when this connection closes</span>
                    </div>

                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--secondary" @click="closeDetail">Close</button>
                        <button class="modal-btn modal-btn--primary" @click="disconnectPeer(selectedPeer)">Disconnect</button>
                    </div>
                </div>
            </div>
        </section>
    `
};
