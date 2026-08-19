import { ref, reactive, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { FriendshipState } from '../../core/FriendshipState.js';
import { FriendshipAction } from '../../core/FriendshipAdvertisement.js';

// 0.2.60 — Friendship Revocation, Blocking & Privacy Withdrawal adds:
//   - Reject/Cancel on a pending request (the terminal counterparts to
//     Send/Accept, both still on an AUTHENTICATED "My Peers" card only
//     — see application/FriendRelationshipUseCase.js's own header on
//     why every friendship gesture requires a live, proven connection
//     to actually deliver its signed advertisement).
//   - Unfriend, on a FRIEND — available from "My Peers" when connected,
//     and from the "Friends" list itself when that friend happens to
//     be connected right now (cross-referenced the same way
//     "Connected now" already is).
//   - Block/Unblock, backed entirely by application/PeerBlockUseCase.js
//     — a FOURTH, independent list ("Blocked"), never requiring a live
//     connection at all (see core/PeerBlockRecord.js's own header):
//     available on any card this device already holds identityId/
//     publicKey for — My Peers, Known Peers, or Friends alike.

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
// connected to yet — see application/FindPeerUseCase.js), entirely
// distinct from "My Peers"/"Known Peers" below. A candidate card is
// always labeled "Discovered," never a name — this page never displays
// an identity as an established fact before peer/
// PeerAuthenticationSession.js's own handshake actually proves it, and a
// mismatch is rejected and closed automatically, the exact same shape
// 0.2.62's Reconnect rejection already established one section down.
//
// 0.2.62 adds Reconnect to a Known Peer card that isn't connected right
// now. It is deliberately NOT a new transport or a remembered address —
// application/PeerReconnectionUseCase.js walks the exact same
// invitation dance "Invite Someone"/"Connect to Peer" already do, just
// scoped to one remembered identityId so the fresh handshake's result
// is VERIFIED against who this device expects, not merely accepted
// because someone authenticated. A rejected reconnect (a valid
// invitation that authenticates as a different identity) is surfaced
// as an explicit error, never a silently-vanishing card — see
// reconnectRejectedError below.
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
    return message.replace(/^(PeerSessionManager|PeerRelationshipUseCase|PeerReconnectionUseCase|FindPeerUseCase|FriendRelationshipUseCase|PeerBlockUseCase|LocalPeerDiscoveryProvider|WebRtcPeerConnectionProvider|WebRtcPeerConnection|PeerInvitation|PeerConnectionOffer|PeerConnectionAnswer):\s*/, '');
}

export default {
    name: 'PeerConnectionsView',
    setup() {
        const identityUseCase = inject('identityUseCase');
        const peerSessionManager = inject('peerSessionManager');
        const peerRelationshipUseCase = inject('peerRelationshipUseCase');
        const peerReconnectionUseCase = inject('peerReconnectionUseCase');
        const friendRelationshipUseCase = inject('friendRelationshipUseCase');
        const peerBlockUseCase = inject('peerBlockUseCase');
        const findPeerUseCase = inject('findPeerUseCase');

        const isAuthenticated = ref(identityUseCase.isAuthenticated());
        const peers = ref(peerSessionManager.listPeers());
        const relationships = ref(isAuthenticated.value ? peerRelationshipUseCase.getRelationships() : []);
        const relationshipError = ref('');
        const friendships = ref(isAuthenticated.value ? friendRelationshipUseCase.getRelationships() : []);
        const friendshipError = ref('');
        const blocked = ref(isAuthenticated.value ? peerBlockUseCase.getBlocked() : []);
        const blockError = ref('');
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

        // --- Reconnect (0.2.62) --------------------------------------------
        // A "Known Peer" that isn't connected right now (isConnectedNow()
        // above) gets a Reconnect gesture — the exact same two-step
        // invitation dance "Invite Someone"/"Connect to Peer" already walk
        // a FIRST connection through, scoped to one remembered identity via
        // application/PeerReconnectionUseCase.js so the fresh handshake is
        // verified against who this device actually expects, not merely
        // accepted because SOMEONE authenticated. Completing the offering
        // side's handshake (pasting the far end's reply) reuses the
        // existing "My Peers" awaitingReply()/startComplete() flow below
        // unmodified — a reconnect's pending connection is an ordinary
        // pending ConnectedPeer, nothing more.
        const reconnectTargetId = ref(null);
        const reconnectInvitePending = ref(false);
        const reconnectInviteError = ref('');
        const reconnectInvitation = reactive({ json: '', expiresAt: null });
        const reconnectImportText = ref('');
        const reconnectAcceptError = ref('');
        const reconnectReply = ref('');
        const reconnectRejectedError = ref('');

        function toggleReconnect(identityId) {
            reconnectRejectedError.value = '';
            if (reconnectTargetId.value === identityId) {
                reconnectTargetId.value = null;
                return;
            }
            reconnectTargetId.value = identityId;
            reconnectInviteError.value = '';
            reconnectAcceptError.value = '';
            reconnectInvitation.json = '';
            reconnectInvitation.expiresAt = null;
            reconnectImportText.value = '';
            reconnectReply.value = '';
        }

        async function submitReconnectInvite(identityId) {
            reconnectInviteError.value = '';
            reconnectInvitePending.value = true;
            try {
                const { invitation } = await peerReconnectionUseCase.reconnectAsInviter(identityId);
                reconnectInvitation.json = JSON.stringify(invitation.toJSON(), null, 2);
                reconnectInvitation.expiresAt = invitation.expiresAt;
            } catch (e) {
                reconnectInviteError.value = stripPrefix(e.message);
            } finally {
                reconnectInvitePending.value = false;
            }
        }

        async function submitReconnectAccept(identityId) {
            reconnectAcceptError.value = '';
            if (!reconnectImportText.value.trim()) {
                return;
            }
            try {
                const { reply } = await peerReconnectionUseCase.reconnectViaInvitation(identityId, reconnectImportText.value.trim());
                reconnectReply.value = reply;
                reconnectImportText.value = '';
            } catch (e) {
                reconnectAcceptError.value = stripPrefix(e.message);
            }
        }

        // --- Friends (0.2.57) ---------------------------------------------
        // Looked up ONLY by a peer's already-verified remoteIdentity —
        // the exact same discipline relationshipFor() above already
        // applies, for the exact same reason: an unauthenticated
        // invitation hint is never eligible to stand in for a proven
        // identity.
        function friendshipFor(peer) {
            return peer.remoteIdentity ? friendRelationshipUseCase.getRelationship(peer.remoteIdentity.identityId) : null;
        }

        function friendStatus(peer) {
            const record = friendshipFor(peer);
            return record ? record.status : FriendshipState.NONE;
        }

        function hasPendingIncomingRequest(peer) {
            const record = friendshipFor(peer);
            return Boolean(record && !record.outgoingAction
                && record.incomingAction && record.incomingAction.action === FriendshipAction.REQUEST);
        }

        function hasSentRequest(peer) {
            const record = friendshipFor(peer);
            return Boolean(record && record.status !== FriendshipState.FRIEND
                && record.outgoingAction && record.outgoingAction.action === FriendshipAction.REQUEST);
        }

        function sendFriendRequest(peer) {
            friendshipError.value = '';
            try {
                friendRelationshipUseCase.sendFriendRequest(peer);
            } catch (e) {
                friendshipError.value = stripPrefix(e.message);
            }
        }

        function acceptFriendRequest(peer) {
            friendshipError.value = '';
            try {
                friendRelationshipUseCase.acceptFriendRequest(peer);
            } catch (e) {
                friendshipError.value = stripPrefix(e.message);
            }
        }

        // 0.2.60 — the terminal counterpart to acceptFriendRequest:
        // declines a pending incoming request instead of answering it.
        function rejectFriendRequest(peer) {
            friendshipError.value = '';
            try {
                friendRelationshipUseCase.rejectFriendRequest(peer);
            } catch (e) {
                friendshipError.value = stripPrefix(e.message);
            }
        }

        // 0.2.60 — withdraws OUR OWN pending outgoing request.
        function cancelFriendRequest(peer) {
            friendshipError.value = '';
            try {
                friendRelationshipUseCase.cancelFriendRequest(peer);
            } catch (e) {
                friendshipError.value = stripPrefix(e.message);
            }
        }

        // 0.2.60 — ends a currently-FRIEND relationship. `peer` must be
        // a live, AUTHENTICATED ConnectedPeer — see
        // application/FriendRelationshipUseCase.js#unfriend's own
        // header: the other side has to actually receive the signed
        // UNFRIEND for the relationship to end on both devices, not
        // just this one.
        function unfriendPeer(peer) {
            friendshipError.value = '';
            try {
                friendRelationshipUseCase.unfriend(peer);
            } catch (e) {
                friendshipError.value = stripPrefix(e.message);
            }
        }

        // The live, AUTHENTICATED "My Peers" entry for a given
        // identityId, or null — the same live cross-reference
        // isConnectedNow() already performs, reused here so the
        // "Friends" list's own Unfriend button can find a real
        // ConnectedPeer to send through without duplicating that
        // lookup's logic.
        function connectedPeerFor(identityId) {
            return peers.value.find((p) => p.remoteIdentity
                && p.remoteIdentity.identityId === identityId
                && p.getLifecycleState() === PeerLifecycleState.AUTHENTICATED) || null;
        }

        function unfriendByIdentity(identityId) {
            const peer = connectedPeerFor(identityId);
            if (peer) {
                unfriendPeer(peer);
            }
        }

        function refreshFriendships(list) {
            friendships.value = list || friendRelationshipUseCase.getRelationships();
        }

        // A friend never carries its own alias — see core/
        // FriendshipRecord.js's own header on why it stores only signed
        // evidence, never a local note. This cross-references the SAME
        // application/PeerRelationshipUseCase.js alias "Known Peers"
        // already renders, falling back to a shortened identityId for a
        // friend this device never separately chose to "Remember."
        function friendDisplayName(identityId) {
            const relationship = peerRelationshipUseCase.getRelationship(identityId);
            return (relationship && relationship.alias) || shortId(identityId);
        }

        const friends = computed(() => friendships.value.filter((f) => f.status === FriendshipState.FRIEND));

        // --- Blocked (0.2.60) ---------------------------------------------
        // Entirely local, never requires a live connection — see
        // core/PeerBlockRecord.js's own header. Available from any card
        // this device already holds identityId/publicKey for: an
        // AUTHENTICATED "My Peers" entry, a Known Peer, or a Friend —
        // `identity` is duck-typed (identityId/publicKey[/algorithm]),
        // so all three shapes work unmodified.
        function isBlockedIdentity(identityId) {
            return peerBlockUseCase.isBlocked(identityId);
        }

        function blockIdentity(identity) {
            blockError.value = '';
            try {
                peerBlockUseCase.block(identity);
            } catch (e) {
                blockError.value = stripPrefix(e.message);
            }
        }

        function unblockIdentity(identityId) {
            blockError.value = '';
            try {
                peerBlockUseCase.unblock(identityId);
            } catch (e) {
                blockError.value = stripPrefix(e.message);
            }
        }

        function refreshBlocked(list) {
            blocked.value = list || peerBlockUseCase.getBlocked();
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

        // --- Find a Peer (0.2.64) -------------------------------------------
        // "Discovered" is never "Authenticated" — see application/
        // FindPeerUseCase.js's own header. A candidate below is exactly
        // as untrusted as any invitation this device has ever imported;
        // clicking Connect starts a REAL connection through the exact
        // same WebRTC + 0.2.49 handshake pipeline every other card on
        // this page already goes through, and the result shows up in
        // "My Peers" above like any other pending connection — this
        // section never renders a second, competing progression display
        // for it.
        const findImportText = ref('');
        const findImportPending = ref(false);
        const findImportError = ref('');
        const findImportSuccess = ref('');
        async function submitFindImport() {
            findImportError.value = '';
            findImportSuccess.value = '';
            if (!findImportText.value.trim()) {
                return;
            }
            findImportPending.value = true;
            try {
                const record = findPeerUseCase.importCandidate(findImportText.value.trim());
                findImportSuccess.value = record.identityHint
                    ? `Candidate added — claims to be ${shortId(record.identityHint)}.`
                    : 'Candidate added — no identity hint was included.';
                findImportText.value = '';
            } catch (e) {
                findImportError.value = stripPrefix(e.message);
            } finally {
                findImportPending.value = false;
            }
        }

        const findIdentityId = ref('');
        const findCandidates = ref([]);
        const findSearched = ref(false);
        const findError = ref('');
        const findConnectingId = ref(null);
        const findReplies = reactive({});
        const findRejectedError = ref('');

        function submitFind() {
            findError.value = '';
            findRejectedError.value = '';
            const identityId = findIdentityId.value.trim();
            if (!identityId) {
                return;
            }
            try {
                findCandidates.value = findPeerUseCase.search(identityId);
                findSearched.value = true;
            } catch (e) {
                findError.value = stripPrefix(e.message);
            }
        }

        function candidateExpiry(record) {
            return formatDuration(Math.max(0, record.expiresAt.getTime() - now.value));
        }

        async function connectToCandidate(record) {
            findError.value = '';
            findConnectingId.value = record.peerDiscoveryId;
            try {
                const { reply } = await findPeerUseCase.connect(record, findIdentityId.value.trim());
                findReplies[record.peerDiscoveryId] = reply;
            } catch (e) {
                findError.value = stripPrefix(e.message);
            } finally {
                findConnectingId.value = null;
            }
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
        let unsubscribeFriendships = null;
        let unsubscribeBlocked = null;
        let unsubscribeSession = null;
        let unsubscribeReconnectRejected = null;
        let unsubscribeFindRejected = null;
        let tickInterval = null;
        onMounted(() => {
            refreshPeers();
            refreshRelationships();
            refreshFriendships();
            refreshBlocked();
            unsubscribePeers = peerSessionManager.onPeersChanged((list) => refreshPeers(list));
            unsubscribeRelationships = peerRelationshipUseCase.onRelationshipsChanged((list) => refreshRelationships(list));
            unsubscribeFriendships = friendRelationshipUseCase.onRelationshipsChanged((list) => refreshFriendships(list));
            unsubscribeBlocked = peerBlockUseCase.onBlockedChanged((list) => refreshBlocked(list));
            unsubscribeSession = identityUseCase.onSessionChanged(() => {
                isAuthenticated.value = identityUseCase.isAuthenticated();
                refreshRelationships();
                refreshFriendships();
                refreshBlocked();
            });
            // 0.2.62 — a reconnect that authenticates as someone other
            // than the identity this device expected is never silently
            // dropped: application/ConnectToPeerUseCase.js has already
            // closed the connection by the time this fires (see
            // application/PeerReconnectionUseCase.js's own header), so
            // this is purely explaining what happened, never a chance to
            // still accept it.
            unsubscribeReconnectRejected = peerReconnectionUseCase.onReconnectRejected(({ relationship }) => {
                const label = (relationship && relationship.alias) || (relationship ? shortId(relationship.identityId) : 'the known peer');
                reconnectRejectedError.value = `Reconnect rejected: the connection authenticated as a different identity than ${label} — it has been closed.`;
            });
            // 0.2.64 — a "Find a Peer" connect() that authenticates as
            // someone other than the identity Alice searched for is
            // never silently dropped either: the connection is already
            // closed by application/ConnectToPeerUseCase.js by the time
            // this fires (see application/FindPeerUseCase.js's own
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
            if (unsubscribeReconnectRejected) unsubscribeReconnectRejected();
            if (unsubscribeFindRejected) unsubscribeFindRejected();
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
            rememberPeer, forgetKnownPeer, updateKnownAlias, formatWhen,
            reconnectTargetId, reconnectInvitePending, reconnectInviteError, reconnectInvitation,
            reconnectImportText, reconnectAcceptError, reconnectReply, reconnectRejectedError,
            toggleReconnect, submitReconnectInvite, submitReconnectAccept,
            FriendshipState, friends, friendshipError, friendStatus, hasPendingIncomingRequest, hasSentRequest,
            sendFriendRequest, acceptFriendRequest, friendDisplayName,
            rejectFriendRequest, cancelFriendRequest, unfriendPeer, unfriendByIdentity, connectedPeerFor,
            blocked, blockError, isBlockedIdentity, blockIdentity, unblockIdentity,
            findImportText, findImportPending, findImportError, findImportSuccess, submitFindImport,
            findIdentityId, findCandidates, findSearched, findError, findConnectingId, findReplies,
            findRejectedError, submitFind, candidateExpiry, connectToCandidate
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

                <h2 class="peer-my-peers-heading">Find a Peer</h2>
                <p class="form-hint form-hint--neutral">
                    Discovery only ever finds a <strong>candidate</strong> — never a proven identity. Add
                    invitations you've received here without connecting to them yet, then search by identity
                    to find one worth attempting. Connecting still runs the full WebRTC + authentication
                    handshake every other connection on this page does; if whoever actually answers isn't the
                    identity you searched for, the connection is rejected and closed automatically, exactly
                    like a rejected <strong>Reconnect</strong> above.
                </p>

                <div class="peer-signal-box">
                    <h3>Add a Candidate</h3>
                    <p class="form-hint form-hint--neutral">
                        Paste an invitation someone sent you to add it to this device's discovery pool — this
                        does not connect to it.
                    </p>
                    <textarea v-model="findImportText" class="form-input peer-signal-json" rows="4"
                              placeholder="Paste an invitation here"></textarea>
                    <p v-if="findImportError" class="identity-unlock-error">{{ findImportError }}</p>
                    <p v-if="findImportSuccess" class="form-hint form-hint--neutral">{{ findImportSuccess }}</p>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--primary" :disabled="findImportPending" @click="submitFindImport">
                            {{ findImportPending ? 'Adding…' : 'Add Candidate' }}
                        </button>
                    </div>
                </div>

                <div class="peer-signal-box">
                    <h3>Find Someone</h3>
                    <label class="peer-alias-field">
                        <span class="form-label">Identity</span>
                        <input type="text" class="form-input" v-model="findIdentityId"
                               placeholder="did:key:..." @keyup.enter="submitFind" />
                    </label>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--primary" @click="submitFind">Discover</button>
                    </div>
                    <p v-if="findError" class="identity-unlock-error">{{ findError }}</p>
                    <p v-if="findRejectedError" class="identity-unlock-error">{{ findRejectedError }}</p>

                    <div v-if="findCandidates.length" class="identity-mgmt-list">
                        <div v-for="record in findCandidates" :key="record.peerDiscoveryId" class="identity-mgmt-card">
                            <div class="identity-mgmt-card-header">
                                <span class="identity-mgmt-name">Candidate — {{ shortId(findIdentityId) }}</span>
                                <span class="peer-badge peer-badge--pending">Discovered</span>
                            </div>
                            <p class="identity-mgmt-status">
                                Source: {{ record.source }} · expires in {{ candidateExpiry(record) }}
                            </p>
                            <p class="form-hint form-hint--neutral">
                                This is only a claim — connecting proves (or disproves) it.
                            </p>

                            <div v-if="findReplies[record.peerDiscoveryId]" class="peer-signal-box peer-signal-box--nested">
                                <p class="form-hint form-hint--neutral">
                                    Send this reply back to whoever gave you this candidate — the connection
                                    will not complete until they paste it in. Check <strong>My Peers</strong>
                                    above for live progress.
                                </p>
                                <textarea class="form-input peer-signal-json" rows="5" readonly :value="findReplies[record.peerDiscoveryId]"></textarea>
                                <button class="modal-btn modal-btn--primary"
                                        @click="copyText(findReplies[record.peerDiscoveryId], 'find-reply-' + record.peerDiscoveryId)">
                                    {{ copiedKey === ('find-reply-' + record.peerDiscoveryId) ? 'Copied!' : 'Copy Reply' }}
                                </button>
                            </div>
                            <div v-else class="identity-mgmt-actions">
                                <button class="action-btn action-btn--primary"
                                        :disabled="findConnectingId === record.peerDiscoveryId"
                                        @click="connectToCandidate(record)">
                                    {{ findConnectingId === record.peerDiscoveryId ? 'Connecting…' : 'Connect' }}
                                </button>
                            </div>
                        </div>
                    </div>
                    <p v-else-if="findSearched" class="form-hint form-hint--neutral">
                        No fresh candidates for that identity yet. Add one above, or ask them to send you an
                        invitation.
                    </p>
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
                    <p v-if="peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && friendStatus(peer) === FriendshipState.FRIEND" class="form-hint form-hint--neutral">
                        ✓ Friend
                    </p>
                    <p v-else-if="peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && hasPendingIncomingRequest(peer)" class="form-hint form-hint--neutral">
                        {{ peer.alias || shortId(peer.remoteIdentity.identityId) }} sent you a friend request.
                    </p>
                    <p v-else-if="peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && hasSentRequest(peer)" class="form-hint form-hint--neutral">
                        Friend request sent — waiting for them to accept.
                    </p>
                    <p v-if="peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && peer.remoteIdentity && isBlockedIdentity(peer.remoteIdentity.identityId)" class="form-hint form-hint--neutral">
                        ⛔ Blocked — this device refuses social interaction from this identity.
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
                        <button v-if="peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && friendStatus(peer) === FriendshipState.NONE && !hasPendingIncomingRequest(peer)"
                                class="action-btn action-btn--secondary" @click="sendFriendRequest(peer)">
                            Send Friend Request
                        </button>
                        <button v-if="peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && hasPendingIncomingRequest(peer)"
                                class="action-btn action-btn--primary" @click="acceptFriendRequest(peer)">
                            Accept Friend Request
                        </button>
                        <button v-if="peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && hasPendingIncomingRequest(peer)"
                                class="action-btn action-btn--secondary" @click="rejectFriendRequest(peer)">
                            Reject Friend Request
                        </button>
                        <button v-if="peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && hasSentRequest(peer)"
                                class="action-btn action-btn--secondary" @click="cancelFriendRequest(peer)">
                            Cancel Friend Request
                        </button>
                        <button v-if="peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && friendStatus(peer) === FriendshipState.FRIEND"
                                class="action-btn action-btn--secondary" @click="unfriendPeer(peer)">
                            Unfriend
                        </button>
                        <button v-if="peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && peer.remoteIdentity && !isBlockedIdentity(peer.remoteIdentity.identityId)"
                                class="action-btn action-btn--danger" @click="blockIdentity(peer.remoteIdentity)">
                            Block
                        </button>
                        <button v-if="peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED && peer.remoteIdentity && isBlockedIdentity(peer.remoteIdentity.identityId)"
                                class="action-btn action-btn--secondary" @click="unblockIdentity(peer.remoteIdentity.identityId)">
                            Unblock
                        </button>
                        <button class="action-btn action-btn--secondary" @click="openDetail(peer)">Details</button>
                        <button class="action-btn action-btn--danger" @click="disconnectPeer(peer)">Disconnect</button>
                    </div>
                </div>
            </div>
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

                    <p v-if="isBlockedIdentity(relationship.identityId)" class="form-hint form-hint--neutral">
                        ⛔ Blocked — this device refuses social interaction from this identity.
                    </p>

                    <div class="identity-mgmt-actions">
                        <button v-if="!isConnectedNow(relationship.identityId)"
                                class="action-btn action-btn--primary" @click="toggleReconnect(relationship.identityId)">
                            {{ reconnectTargetId === relationship.identityId ? 'Close Reconnect' : 'Reconnect' }}
                        </button>
                        <button v-if="!isBlockedIdentity(relationship.identityId)"
                                class="action-btn action-btn--danger" @click="blockIdentity(relationship)">
                            Block
                        </button>
                        <button v-else class="action-btn action-btn--secondary" @click="unblockIdentity(relationship.identityId)">
                            Unblock
                        </button>
                        <button class="action-btn action-btn--danger" @click="forgetKnownPeer(relationship.identityId)">Forget</button>
                    </div>

                    <div v-if="reconnectTargetId === relationship.identityId" class="peer-signal-box peer-signal-box--nested">
                        <p class="form-hint form-hint--neutral">
                            Reconnecting always starts a brand-new invitation and a brand-new handshake — nothing
                            about any past connection to {{ relationship.alias || shortId(relationship.identityId) }}
                            is reused. Either create a fresh invitation to send them, or paste one they already sent you.
                        </p>
                        <div class="peer-actions">
                            <button class="action-btn action-btn--secondary" :disabled="reconnectInvitePending"
                                    @click="submitReconnectInvite(relationship.identityId)">
                                {{ reconnectInvitePending ? 'Creating…' : 'Create Invitation' }}
                            </button>
                        </div>
                        <p v-if="reconnectInviteError" class="identity-unlock-error">{{ reconnectInviteError }}</p>
                        <div v-if="reconnectInvitation.json" class="peer-signal-box peer-signal-box--nested">
                            <p class="form-hint form-hint--neutral">
                                Send this to {{ relationship.alias || shortId(relationship.identityId) }}. Once they
                                reply, find this pending connection in <strong>My Peers</strong> above and paste
                                their reply there to finish connecting.
                            </p>
                            <textarea class="form-input peer-signal-json" rows="5" readonly :value="reconnectInvitation.json"></textarea>
                            <button class="modal-btn modal-btn--primary"
                                    @click="copyText(reconnectInvitation.json, 'reconnect-invite-' + relationship.identityId)">
                                {{ copiedKey === ('reconnect-invite-' + relationship.identityId) ? 'Copied!' : 'Copy Invitation' }}
                            </button>
                        </div>

                        <p class="form-hint form-hint--neutral">Or, if they already sent you an invitation:</p>
                        <textarea v-model="reconnectImportText" class="form-input peer-signal-json" rows="5"
                                  placeholder="Paste their invitation here"></textarea>
                        <div class="modal-actions">
                            <button class="modal-btn modal-btn--primary" @click="submitReconnectAccept(relationship.identityId)">Connect</button>
                        </div>
                        <p v-if="reconnectAcceptError" class="identity-unlock-error">{{ reconnectAcceptError }}</p>
                        <div v-if="reconnectReply" class="peer-signal-box peer-signal-box--nested">
                            <p class="form-hint form-hint--neutral">
                                Send this reply back to {{ relationship.alias || shortId(relationship.identityId) }} —
                                the connection completes once they paste it in.
                            </p>
                            <textarea class="form-input peer-signal-json" rows="5" readonly :value="reconnectReply"></textarea>
                            <button class="modal-btn modal-btn--primary"
                                    @click="copyText(reconnectReply, 'reconnect-reply-' + relationship.identityId)">
                                {{ copiedKey === ('reconnect-reply-' + relationship.identityId) ? 'Copied!' : 'Copy Reply' }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
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
