import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { FriendshipState } from '../../core/FriendshipState.js';
import { LIFECYCLE_LABELS, LIFECYCLE_CLASSES, PROGRESSION_STEPS, formatDuration, shortId, formatWhen } from './peerConnections/presentation.js';
import { useKnownPeers } from './peerConnections/useKnownPeers.js';
import { useFriendships } from './peerConnections/useFriendships.js';
import { useBlockedPeers } from './peerConnections/useBlockedPeers.js';
import { useConnectionFlow } from './peerConnections/useConnectionFlow.js';
import { useFindPeer } from './peerConnections/useFindPeer.js';

// Large template sections live in ./peerConnections/templates/ as strings
// interpolated into `template`; they share this component's scope.
import { inviteAndConnectTemplate } from './peerConnections/templates/inviteAndConnect.js';
import { findPeerSectionTemplate } from './peerConnections/templates/findPeerSection.js';
import { myPeersListTemplate } from './peerConnections/templates/myPeersList.js';
import { knownPeersListTemplate } from './peerConnections/templates/knownPeersList.js';

// 0.2.60 — Friendship Revocation, Blocking & Privacy Withdrawal adds:
//   - Reject/Cancel on a pending request (the terminal counterparts to
//     Send/Accept, both still on an AUTHENTICATED "My Peers" card only
//     — see application/identity/FriendRelationshipUseCase.js's own header on
//     why every friendship gesture requires a live, proven connection
//     to actually deliver its signed advertisement).
//   - Unfriend, on a FRIEND — available from "My Peers" when connected,
//     and from the "Friends" list itself when that friend happens to
//     be connected right now (cross-referenced the same way
//     "Connected now" already is).
//   - Block/Unblock, backed entirely by application/peer/PeerBlockUseCase.js
//     — a FOURTH, independent list ("Blocked"), never requiring a live
//     connection at all (see core/PeerBlockRecord.js's own header):
//     available on any card this device already holds identityId/
//     publicKey for — My Peers, Known Peers, or Friends alike.

// 0.2.55 — Peer Connections & Rendezvous UI: the first live surface over
// everything 0.2.49 through 0.2.54 built underneath. Answers the one
// question the app still had no answer for — "okay, I have an identity,
// how do I actually connect to another person?" — through nothing but
// application/peer/PeerSessionManager.js, itself nothing but a thin composition
// of application/peer/ConnectToPeerUseCase.js and application/
// DiscoverPeersUseCase.js. This view invents no new state machine: every
// badge below is peer.getLifecycleState() (peer/PeerLifecycleState.js),
// read straight off the SAME application/peer/ConnectedPeer.js / peer/
// PeerAuthenticationSession.js this codebase has had since 0.2.49/0.2.50.
//
// No chat (peer/PeerMessageBus.js is still not touched anywhere in this
// file). An alias typed into a peer's CARD — the "Local alias" field
// below — is exactly what application/peer/ConnectedPeer.js already documents
// it as: a local note, never sent, never surviving a reconnect.
//
// 0.2.56 adds the persistent counterpart 0.2.55 deliberately declined to
// add: "Known Peers," backed entirely by application/
// PeerRelationshipUseCase.js. The two lists on this page answer two
// different questions and are never merged into one: "My Peers" is
// exactly as ephemeral as it always was — every row disappears the
// instant application/peer/ConnectedPeerRegistry.js says the connection is
// gone — while "Known Peers" is exactly as durable as
// application/peer/PeerRelationshipUseCase.js's own storage, surviving a
// disconnect, a reload, and the app restarting. A peer only ever crosses
// from the first list into the second by an explicit "Remember" click —
// see docs/Principles.md, "Remembering A Peer Is A Deliberate Act, Never
// A Side Effect Of Authentication" (0.2.56) — never automatically.
//
// 0.2.57 adds a THIRD, independent list, "Friends," and a matching pair
// of actions on an authenticated peer's card: "Send Friend Request" and
// "Accept Friend Request." Backed entirely by application/
// FriendRelationshipUseCase.js, never by PeerRelationshipUseCase — a
// Known Peer and a Friend answer genuinely different questions (see
// docs/Principles.md, "Friendship Is Mutual Consent, Never A Unilateral
// Claim") and this view never conflates the two: a friend request can
// be sent to, and accepted from, a peer this device has never
// "Remembered" at all.
//
// 0.2.64 adds "Find a Peer": an identity search over candidates this
// device has discovered (imported invitations it hasn't necessarily
// connected to yet — see application/peer/FindPeerUseCase.js), entirely
// distinct from "My Peers"/"Known Peers" below. A candidate card is
// always labeled "Discovered," never a name — this page never displays
// an identity as an established fact before peer/
// PeerAuthenticationSession.js's own handshake actually proves it, and a
// mismatch is rejected and closed automatically, the exact same shape
// 0.2.62's Reconnect rejection already established one section down.
//
// 0.2.62 adds Reconnect to a Known Peer card that isn't connected right
// now. It is deliberately NOT a new transport or a remembered address —
// application/peer/PeerReconnectionUseCase.js walks the exact same
// invitation dance "Invite Someone"/"Connect to Peer" already do, just
// scoped to one remembered identityId so the fresh handshake's result
// is VERIFIED against who this device expects, not merely accepted
// because someone authenticated. A rejected reconnect (a valid
// invitation that authenticates as a different identity) is surfaced
// as an explicit error, never a silently-vanishing card — see
// reconnectRejectedError below.

// Each section's state and actions live in ./peerConnections/ as
// composables; this view wires them to the injected use cases and owns
// the page-wide subscriptions and the one-second tick.
export default {
    name: 'PeerConnectionsView',
    setup() {
        const identityUseCase = inject('identityUseCase');
        const peerSessionManager = inject('peerSessionManager');
        const peerRelationshipUseCase = inject('peerRelationshipUseCase');
        const peerReconnectionUseCase = inject('peerReconnectionUseCase');
        const friendRelationshipUseCase = inject('friendRelationshipUseCase');
        const identityLifecyclePropagationUseCase = inject('identityLifecyclePropagationUseCase');
        const peerBlockUseCase = inject('peerBlockUseCase');
        const findPeerUseCase = inject('findPeerUseCase');
        // 0.2.85 — the SAME resolved-social-identity lookup application/
        // PeerPresenceUseCase.js already exposes, so a Known Peer/Friend
        // connected from an authorized DEVICE (not just their own literal
        // key) is recognized here too — see isConnectedNow()/
        // unfriendByIdentity() below.
        const peerPresenceUseCase = inject('peerPresenceUseCase');

        const isAuthenticated = ref(identityUseCase.isAuthenticated());
        // 0.2.74 — a signed-in identity that is PASSPHRASE-LOCKED cannot
        // sign a peer-authentication PROOF any more than it can sign
        // anything else (identity/LocalIdentityProvider.js's own
        // _requireAuthenticatedIdentity() refuses both the same way,
        // peer/PeerAuthenticationSession.js reuses that check unmodified
        // — see that file's own header). Previously the ONLY way to find
        // this out was starting a real handshake and watching it fail —
        // for the offering side, only after the far end's own timeout, up
        // to DEFAULT_HANDSHAKE_TIMEOUT_MS later, with the reason buried on
        // a Failed card. This surfaces it up front instead, before either
        // "Invite Someone" or "Connect to Peer" is even attempted.
        const isIdentityLocked = ref(false);
        // 0.3.8 — "Your Identity": the signed-in identity's FULL
        // identityId, or null. Refreshed by refreshLockState() below on
        // every onSessionChanged() — never derived from isAuthenticated
        // alone, which stays true across a direct switch from one
        // identity to another (LoginModal's Unlock → Cancel → pick
        // someone else) and would leave this showing the previous one.
        // Exists because the ONLY
        // identity string ever shown elsewhere in this app — here, in
        // Known Peers/Friends/Blocked cards, in My Identities — is
        // shortId()'s own truncated LAST 14 CHARACTERS, deliberately
        // legible for telling cards apart at a glance, never meant to be
        // copied and shared as a whole identity. "Be Discoverable"'s own
        // publication and "Find Someone"'s own LOOKUP both key on the
        // FULL identityId — the `did:key:...` the "Find Someone" input's
        // own placeholder already asks for — so without a full-ID display
        // SOMEWHERE, "be discoverable enough for someone else to actually
        // find you" had no working path through this UI at all: a person
        // could only ever hand out the shortened display string, which a
        // real search() — application/peer/DiscoverPeersUseCase.js's own exact
        // string match — will never match.
        const myIdentityId = ref(null);
        // Reads the whole session, not only the lock: which identity is
        // signed in (myIdentityId) and whether it is locked.
        function refreshLockState() {
            if (!identityUseCase.isAuthenticated()) {
                myIdentityId.value = null;
                isIdentityLocked.value = false;
                return;
            }
            const identityId = identityUseCase.currentSession().identityId;
            myIdentityId.value = identityId;
            isIdentityLocked.value = !identityUseCase.isUnlocked(identityId);
        }
        refreshLockState();

        const peers = ref(peerSessionManager.listPeers());
        const now = ref(Date.now());
        function refreshPeers(list) {
            peers.value = list || peerSessionManager.listPeers();
        }

        // Time since this connection attempt started on this device, read
        // from the app-wide registry (application/peer/ConnectedPeerRegistry.js
        // #connectedSince) — so it keeps counting across leaving and
        // returning to this page, rather than restarting at 0s.
        function connectedFor(peer) {
            const since = peerSessionManager.connectedSince(peer.connectionId);
            return since ? formatDuration(now.value - since.getTime()) : '0s';
        }

        // Every per-card lookup reads indexes over the Known Peers,
        // Friends and Blocked lists, never storage. Those lists are
        // refreshed by their use cases' own change events (every save
        // publishes one) and by onSessionChanged, so an index over them is
        // exactly as current as a fresh storage read — without re-parsing
        // storage for every card on every one-second `now` tick, which
        // redraws this whole page.
        const {
            relationships, relationshipsById, relationshipError, refreshRelationships, relationshipFor, isConnectedNow,
            rememberPeer, forgetKnownPeer, updateKnownAlias,
            reconnectTargetId, reconnectInvitePending, reconnectInviteError, reconnectInvitation,
            reconnectImportText, reconnectAcceptError, reconnectReply, reconnectRejectedError,
            toggleReconnect, submitReconnectInvite, submitReconnectAccept
        } = useKnownPeers({ peerRelationshipUseCase, peerReconnectionUseCase, peerPresenceUseCase });

        const {
            friendshipError, refreshFriendships, remoteLifecycleFor, friends, friendStatus, hasPendingIncomingRequest, hasSentRequest,
            sendFriendRequest, acceptFriendRequest, rejectFriendRequest, cancelFriendRequest, unfriendPeer, unfriendByIdentity,
            friendDisplayName
        } = useFriendships({ friendRelationshipUseCase, identityLifecyclePropagationUseCase, peerPresenceUseCase, relationshipsById, now });

        const {
            blocked, blockError, isBlockedIdentity, blockIdentity, unblockIdentity, refreshBlocked
        } = useBlockedPeers({ peerBlockUseCase });

        const {
            invitePending, inviteError, pendingInvitation, startInvite, dismissInvitation,
            showAcceptForm, importText, acceptError, acceptReply, submitAcceptInvitation, closeAcceptForm,
            completingConnectionId, completeReplyText, completeError, startComplete, submitComplete, awaitingReply
        } = useConnectionFlow({ peerSessionManager });

        const {
            findImportText, findImportError, findImportSuccess, submitFindImport,
            findIdentityId, findCandidates, findSearched, findError, findConnectingId, findReplies,
            findRejectedError, submitFind, candidateExpiry, connectToCandidate,
            publishPending, publishError, isPublished, togglePublish
        } = useFindPeer({ findPeerUseCase, peers, now });

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

        let unsubscribePeers = null;
        let unsubscribeRelationships = null;
        let unsubscribeFriendships = null;
        let unsubscribeBlocked = null;
        let unsubscribeSession = null;
        let unsubscribeVaultLock = null;
        let unsubscribeReconnectRejected = null;
        let unsubscribeFindRejected = null;
        let tickInterval = null;
        onMounted(() => {
            unsubscribePeers = peerSessionManager.onPeersChanged((list) => refreshPeers(list));
            unsubscribeRelationships = peerRelationshipUseCase.onRelationshipsChanged((list) => refreshRelationships(list));
            unsubscribeFriendships = friendRelationshipUseCase.onRelationshipsChanged((list) => refreshFriendships(list));
            unsubscribeBlocked = peerBlockUseCase.onBlockedChanged((list) => refreshBlocked(list));
            unsubscribeSession = identityUseCase.onSessionChanged(() => {
                isAuthenticated.value = identityUseCase.isAuthenticated();
                refreshRelationships();
                refreshFriendships();
                refreshBlocked();
                refreshLockState();
            });
            // Locking/unlocking never fires onSessionChanged — see
            // application/identity/IdentityUseCase.js's own header: being
            // authenticated and being unlocked are different questions,
            // deliberately signaled separately. This is what keeps
            // isIdentityLocked current if the user unlocks (or a vault
            // timeout re-locks) their identity on "My Identities" while
            // this page is still open.
            unsubscribeVaultLock = identityUseCase.onVaultLockChanged(() => refreshLockState());
            // 0.2.62 — a reconnect that authenticates as someone other
            // than the identity this device expected is never silently
            // dropped: application/peer/ConnectToPeerUseCase.js has already
            // closed the connection by the time this fires (see
            // application/peer/PeerReconnectionUseCase.js's own header), so
            // this is purely explaining what happened, never a chance to
            // still accept it.
            unsubscribeReconnectRejected = peerReconnectionUseCase.onReconnectRejected(({ relationship }) => {
                const label = (relationship && relationship.alias) || (relationship ? shortId(relationship.identityId) : 'the known peer');
                reconnectRejectedError.value = `Reconnect rejected: the connection authenticated as a different identity than ${label} — it has been closed.`;
            });
            // 0.2.64 — a "Find a Peer" connect() that authenticates as
            // someone other than the identity Alice searched for is
            // never silently dropped either: the connection is already
            // closed by application/peer/ConnectToPeerUseCase.js by the time
            // this fires (see application/peer/FindPeerUseCase.js's own
            // header) — this only explains what happened.
            unsubscribeFindRejected = findPeerUseCase.onCandidateRejected(({ expectedIdentityId }) => {
                findRejectedError.value = `Connection rejected: whoever answered at that candidate's endpoint was not ${shortId(expectedIdentityId)} — the connection has been closed.`;
            });
            tickInterval = setInterval(() => { now.value = Date.now(); }, 1000);
        });
        onBeforeUnmount(() => {
            if (unsubscribePeers) unsubscribePeers();
            if (unsubscribeRelationships) unsubscribeRelationships();
            if (unsubscribeFriendships) unsubscribeFriendships();
            if (unsubscribeBlocked) unsubscribeBlocked();
            if (unsubscribeSession) unsubscribeSession();
            if (unsubscribeVaultLock) unsubscribeVaultLock();
            if (unsubscribeReconnectRejected) unsubscribeReconnectRejected();
            if (unsubscribeFindRejected) unsubscribeFindRejected();
            if (tickInterval) clearInterval(tickInterval);
        });

        return {
            isAuthenticated, isIdentityLocked, myIdentityId, peers, PeerLifecycleState, LIFECYCLE_LABELS, LIFECYCLE_CLASSES, PROGRESSION_STEPS,
            connectedFor, shortId,
            invitePending, inviteError, pendingInvitation, startInvite, dismissInvitation,
            showAcceptForm, importText, acceptError, acceptReply, submitAcceptInvitation, closeAcceptForm,
            completingConnectionId, completeReplyText, completeError, startComplete, submitComplete, awaitingReply,
            selectedPeer, openDetail, closeDetail, disconnectPeer, updateAlias,
            copiedKey, copyText,
            relationships, relationshipError, relationshipFor, isConnectedNow,
            rememberPeer, forgetKnownPeer, updateKnownAlias, formatWhen,
            reconnectTargetId, reconnectInvitePending, reconnectInviteError, reconnectInvitation,
            reconnectImportText, reconnectAcceptError, reconnectReply, reconnectRejectedError,
            toggleReconnect, submitReconnectInvite, submitReconnectAccept,
            remoteLifecycleFor,
            FriendshipState, friends, friendshipError, friendStatus, hasPendingIncomingRequest, hasSentRequest,
            sendFriendRequest, acceptFriendRequest, friendDisplayName,
            rejectFriendRequest, cancelFriendRequest, unfriendPeer, unfriendByIdentity,
            blocked, blockError, isBlockedIdentity, blockIdentity, unblockIdentity,
            findImportText, findImportError, findImportSuccess, submitFindImport,
            findIdentityId, findCandidates, findSearched, findError, findConnectingId, findReplies,
            findRejectedError, submitFind, candidateExpiry, connectToCandidate,
            publishPending, publishError, isPublished, togglePublish
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
                <p v-if="isIdentityLocked" class="identity-unlock-error">
                    Your identity is locked (see <router-link to="/identity">My Identities</router-link>) —
                    unlock it with its passphrase first. A locked identity cannot sign the proof a
                    handshake needs, so inviting or connecting now would only fail once the other side
                    is waiting on you — for them, only after their own handshake eventually times out.
                </p>

                ${inviteAndConnectTemplate}

                ${findPeerSectionTemplate}
            </template>

            <h2 class="peer-my-peers-heading">My Peers</h2>
            ${myPeersListTemplate}
            <p v-else class="form-hint form-hint--neutral">No peers connected right now.</p>

            <p v-if="relationshipError" class="identity-unlock-error">{{ relationshipError }}</p>
            <p v-if="friendshipError" class="identity-unlock-error">{{ friendshipError }}</p>
            <p v-if="blockError" class="identity-unlock-error">{{ blockError }}</p>

            <h2 class="peer-my-peers-heading">Known Peers</h2>
            <p class="form-hint form-hint--neutral">
                A known peer remembers an IDENTITY, never a connection or an address. Reconnecting to a
                known peer always re-authenticates from nothing before this device treats the result as the
                same person again — "Connected now" below is read live from My Peers, never stored here.
                Use <strong>Reconnect</strong> on a peer that isn't connected right now; this device verifies
                the fresh handshake proves the SAME identity before ever treating it as them again — a valid
                invitation from someone else is closed, not accepted.
            </p>
            <p v-if="reconnectRejectedError" class="identity-unlock-error">{{ reconnectRejectedError }}</p>
            ${knownPeersListTemplate}
            <p v-else class="form-hint form-hint--neutral">
                No known peers yet. Authenticate a connection above, then click <strong>Remember</strong> on
                their card to keep a local record of who they are.
            </p>

            <h2 class="peer-my-peers-heading">Friends</h2>
            <p class="form-hint form-hint--neutral">
                A friend is mutual consent, proven — never a local note like a Known Peer. This
                device only shows someone here once it holds a signed request from one side and a
                signed acceptance from the other. "Connected now" below is read live from My Peers,
                the same as Known Peers above; reconnecting always re-authenticates from nothing
                first.
            </p>
            <div v-if="friends.length" class="identity-mgmt-list">
                <div v-for="friend in friends" :key="friend.identityId" class="identity-mgmt-card">
                    <div class="identity-mgmt-card-header">
                        <span class="identity-mgmt-name">{{ friendDisplayName(friend.identityId) }}</span>
                        <span class="peer-badge" :class="isConnectedNow(friend.identityId) ? 'peer-badge--authenticated' : 'peer-badge--pending'">
                            {{ isConnectedNow(friend.identityId) ? 'Connected now' : 'Not connected' }}
                        </span>
                    </div>
                    <p class="identity-mgmt-status">
                        {{ shortId(friend.identityId) }} · friends since {{ formatWhen(friend.updatedAt) }}
                    </p>
                    <p v-if="isBlockedIdentity(friend.identityId)" class="form-hint form-hint--neutral">
                        ⛔ Blocked — friendship stands, but this device refuses social interaction from
                        this identity anyway. Friendship and blocking are independent facts.
                    </p>
                    <p v-if="remoteLifecycleFor(friend.identityId) && remoteLifecycleFor(friend.identityId).isRevoked" class="form-hint form-hint--neutral">
                        <span class="identity-revoked-badge">⚠ Revoked</span> — friendship stands as a durable local
                        record, but a signed revocation for this identity was received and verified.
                        <template v-if="remoteLifecycleFor(friend.identityId).successorIdentityId">
                            Remembered successor: …{{ shortId(remoteLifecycleFor(friend.identityId).successorIdentityId) }}.
                        </template>
                    </p>

                    <div class="identity-mgmt-actions">
                        <router-link v-if="!isBlockedIdentity(friend.identityId)"
                                     :to="'/chat/' + friend.identityId" class="action-btn action-btn--primary">
                            Chat
                        </router-link>
                        <button v-if="isConnectedNow(friend.identityId)"
                                class="action-btn action-btn--secondary" @click="unfriendByIdentity(friend.identityId)">
                            Unfriend
                        </button>
                        <span v-else class="form-hint form-hint--neutral">Reconnect to unfriend</span>
                        <button v-if="!isBlockedIdentity(friend.identityId)"
                                class="action-btn action-btn--danger" @click="blockIdentity(friend)">
                            Block
                        </button>
                        <button v-else class="action-btn action-btn--secondary" @click="unblockIdentity(friend.identityId)">
                            Unblock
                        </button>
                    </div>
                </div>
            </div>
            <p v-else class="form-hint form-hint--neutral">
                No friends yet. Send a friend request from an authenticated peer's card above, or
                accept one they sent you.
            </p>

            <h2 class="peer-my-peers-heading">Blocked</h2>
            <p class="form-hint form-hint--neutral">
                A blocked identity is never told — see core/PeerBlockRecord.js. Blocking stops this
                device from sending it presence, profile, or interaction updates, and rejects
                anything it sends here, regardless of friendship. Unblocking restores only the
                ability to be heard again — it never recreates a friendship on its own.
            </p>
            <div v-if="blocked.length" class="identity-mgmt-list">
                <div v-for="block in blocked" :key="block.identityId" class="identity-mgmt-card">
                    <div class="identity-mgmt-card-header">
                        <span class="identity-mgmt-name">{{ friendDisplayName(block.identityId) }}</span>
                        <span class="peer-badge peer-badge--pending">Blocked</span>
                    </div>
                    <p class="identity-mgmt-status">
                        {{ shortId(block.identityId) }} · blocked since {{ formatWhen(block.createdAt) }}
                    </p>
                    <div class="identity-mgmt-actions">
                        <button class="action-btn action-btn--secondary" @click="unblockIdentity(block.identityId)">Unblock</button>
                    </div>
                </div>
            </div>
            <p v-else class="form-hint form-hint--neutral">
                Nobody is blocked. Use <strong>Block</strong> on a peer, known peer, or friend's card
                above to stop hearing from them.
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
