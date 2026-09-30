import { ref, computed, onMounted, onBeforeUnmount, inject } from 'vue';
import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { FriendshipState } from '../../core/FriendshipState.js';
import { LIFECYCLE_LABELS, LIFECYCLE_CLASSES, PROGRESSION_STEPS, formatDuration, shortId } from './peerConnections/presentation.js';
import { buildPeople, filterPeople, PEOPLE_FILTERS } from './peerConnections/people.js';
import { useKnownPeers } from './peerConnections/useKnownPeers.js';
import { useFriendships } from './peerConnections/useFriendships.js';
import { useBlockedPeers } from './peerConnections/useBlockedPeers.js';
import { useConnectionFlow } from './peerConnections/useConnectionFlow.js';
import { useFindPeer } from './peerConnections/useFindPeer.js';
import InvitationExchange from './peerConnections/InvitationExchange.js';

// Large template sections live in ./peerConnections/templates/ as strings
// interpolated into `template`; they share this component's scope.
import { attentionSectionTemplate } from './peerConnections/templates/attentionSection.js';
import { peopleSectionTemplate } from './peerConnections/templates/peopleSection.js';
import { connectSectionTemplate } from './peerConnections/templates/connectSection.js';
import PublicLobbyPanel from '../components/PublicLobbyPanel.js';
import { PUBLIC_LOBBY } from '../../core/LobbyCard.js';
import { errorText, formatDate as formatLocaleDate, t } from '../i18n/i18n.js';
import I18nText from '../i18n/I18nText.js';

const GUIDE_URL = 'https://github.com/bowo-prasetyo/forkbuild/blob/main/docs/user/07-PeerConnectionsAndFriends.md';

const CONNECT_TABS = [
    { key: 'invite', label: t('peerConnections.invite') },
    { key: 'paste', label: t('peerConnections.pasteAnInvitation') },
    { key: 'find', label: t('peerConnections.findById') },
    { key: 'lobby', label: t('peerConnections.publicLobby') }
];

// The Peers page: time-sensitive items first (connections in progress,
// friend requests), then one People list with a card per identity, then
// the ways to connect with someone new, then anyone blocked.
//
// Nothing here is a new state machine: badges read
// ConnectedPeer#getLifecycleState(), and Known Peers, friendships and
// blocks stay three separate records (see ./peerConnections/people.js for
// how the list merges them for display). Every connection, first-time or
// Reconnect, runs the full authentication handshake; a Reconnect or Find
// also closes the connection if it proves a different identity.
export default {
    name: 'PeerConnectionsView',
    components: { I18nText, PublicLobbyPanel, InvitationExchange },
    setup() {
        const identityUseCase = inject('identityUseCase');
        const peerSessionManager = inject('peerSessionManager');
        const peerRelationshipUseCase = inject('peerRelationshipUseCase');
        const peerReconnectionUseCase = inject('peerReconnectionUseCase');
        const friendRelationshipUseCase = inject('friendRelationshipUseCase');
        const identityLifecyclePropagationUseCase = inject('identityLifecyclePropagationUseCase');
        const peerBlockUseCase = inject('peerBlockUseCase');
        const followUseCase = inject('followUseCase', null);
        const findPeerUseCase = inject('findPeerUseCase');
        // Resolves an authorized device's connection to its parent identity,
        // so a friend connected from another device still shows as online.
        const peerPresenceUseCase = inject('peerPresenceUseCase');

        const isAuthenticated = ref(identityUseCase.isAuthenticated());
        // A locked identity can't sign a handshake proof, so say so up front
        // instead of letting a connection fail after the other side waits.
        const isIdentityLocked = ref(false);
        // The full identityId: what Find by ID and Be Discoverable key on.
        // Everything else on the page shows shortId(), which never matches.
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

        // Time since this connection attempt started, from the app-wide
        // registry, so it keeps counting across leaving and returning.
        function connectedFor(peer) {
            const since = peerSessionManager.connectedSince(peer.connectionId);
            return since ? formatDuration(now.value - since.getTime()) : '0s';
        }

        // Per-card lookups read indexes over the Known Peers, Friends and
        // Blocked lists, never storage: this page redraws every second.
        const {
            relationships, relationshipsById, relationshipError, refreshRelationships,
            rememberIdentity, forgetKnownPeer, updateKnownAlias,
            reconnectCreate, reconnectAccept, reconnectRejectedError
        } = useKnownPeers({ peerRelationshipUseCase, peerReconnectionUseCase, peerPresenceUseCase });

        const {
            friendships, friendshipError, refreshFriendships, remoteLifecycleFor, friendStatus, hasPendingIncomingRequest, hasSentRequest,
            sendFriendRequest, acceptFriendRequest, rejectFriendRequest, cancelFriendRequest, unfriendByIdentity,
            friendDisplayName
        } = useFriendships({ friendRelationshipUseCase, identityLifecyclePropagationUseCase, peerPresenceUseCase, relationshipsById, now });

        const {
            blocked, blockedIds, blockError, isBlockedIdentity, blockIdentity, unblockIdentity, refreshBlocked
        } = useBlockedPeers({ peerBlockUseCase });

        const {
            createInvitation, acceptInvitation, replyTexts, completeErrors, submitComplete, awaitingReply
        } = useConnectionFlow({ peerSessionManager });

        const {
            findImportText, findImportError, findImportSuccess, submitFindImport,
            findIdentityId, findCandidates, findSearched, findError, findConnectingId, findReplies, findDelivered,
            findRejectedError, submitFind, candidateExpiry, connectToCandidate,
            publishPending, publishError, isPublished, togglePublish
        } = useFindPeer({ findPeerUseCase, peers, now });

        // --- Needs your attention ---------------------------------------------
        const isAuthenticatedPeer = (peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED;
        const pendingPeers = computed(() => peers.value.filter((peer) => !isAuthenticatedPeer(peer)));
        const requestPeers = computed(() => peers.value.filter((peer) => isAuthenticatedPeer(peer)
            && hasPendingIncomingRequest(peer) && !isBlockedIdentity(peer.remoteIdentity.identityId)));
        const attentionHeading = computed(() => (
            requestPeers.value.length || pendingPeers.value.some((peer) => awaitingReply(peer) || peer.getLifecycleState() === PeerLifecycleState.FAILED)
                ? t('peerConnections.needsYourAttention')
                : t('peerConnections.connecting2')
        ));
        function peerName(peer) {
            const relationship = peer.remoteIdentity ? relationshipsById.value.get(peer.remoteIdentity.identityId) : null;
            return (relationship && relationship.alias) || peer.alias || (peer.remoteIdentity ? shortId(peer.remoteIdentity.identityId) : t('peerConnections.unknown'));
        }
        function progressStep(peer) {
            const state = peer.getLifecycleState();
            return PROGRESSION_STEPS.filter((step) => step.reached(state)).length;
        }
        function progressLabel(peer) {
            const state = peer.getLifecycleState();
            const reached = PROGRESSION_STEPS.filter((step) => step.reached(state));
            return reached.length ? reached[reached.length - 1].label : PROGRESSION_STEPS[0].label;
        }

        // --- People -------------------------------------------------------------
        const follows = ref(followUseCase ? followUseCase.getFollowing() : []);
        const followedIds = computed(() => new Set(follows.value.map((f) => f.identityId)));
        function refreshFollows() {
            follows.value = followUseCase ? followUseCase.getFollowing() : [];
        }
        function canFollow(person) {
            return Boolean(followUseCase && followUseCase.canFollow(person.identityId));
        }
        function toggleFollow(person) {
            relationshipError.value = '';
            try {
                if (person.isFollowing) {
                    followUseCase.unfollow(person.identityId);
                } else {
                    followUseCase.follow(person.identityId, { name: person.alias || null });
                }
            } catch (e) {
                relationshipError.value = errorText(e).replace(/^FollowUseCase:\s*/, '');
            }
        }
        const people = computed(() => buildPeople({
            relationships: relationships.value,
            friendships: friendships.value,
            blockedIds: blockedIds.value,
            followedIds: followedIds.value,
            authenticatedPeers: peers.value.filter(isAuthenticatedPeer),
            connectedPeersFor: (identityId) => {
                void peers.value;
                return peerPresenceUseCase.findConnectedPeers(identityId);
            }
        }));
        const peopleFilter = ref('all');
        const visiblePeople = computed(() => filterPeople(people.value, peopleFilter.value));

        function personMeta(person) {
            // An unnamed person's title is already their short ID.
            const parts = person.name === shortId(person.identityId) ? [] : ['…' + shortId(person.identityId)];
            if (person.isOnline) {
                parts.push(t('peerConnections.onlineFor', { elapsed: connectedFor(person.connectedPeer) }));
            } else if (person.relationship && person.relationship.lastAuthenticatedAt) {
                parts.push(t('peerConnections.lastConnected', { date: formatDate(person.relationship.lastAuthenticatedAt) }));
            } else if (person.friendship) {
                parts.push(t('peerConnections.friendsSince', { date: formatDate(person.friendship.updatedAt) }));
            }
            const meta = parts.join(' · ');
            return meta.charAt(0).toUpperCase() + meta.slice(1);
        }
        function formatDate(date) {
            return date instanceof Date ? formatLocaleDate(date) : '';
        }
        function canAddFriend(person) {
            const peer = person.connectedPeer;
            return !!peer && !person.isBlocked && friendStatus(peer) === FriendshipState.NONE && !hasPendingIncomingRequest(peer);
        }
        // What remembering or blocking someone needs: a verified identity
        // with its public key, from whichever record this card has.
        function identitySource(person) {
            return (person.connectedPeer && person.connectedPeer.remoteIdentity) || person.relationship || person.friendship;
        }
        function successorOf(person) {
            const lifecycle = remoteLifecycleFor(person.identityId);
            return lifecycle && lifecycle.successorIdentityId ? lifecycle.successorIdentityId : null;
        }
        function isRevoked(person) {
            const lifecycle = remoteLifecycleFor(person.identityId);
            return !!(lifecycle && lifecycle.isRevoked);
        }
        function lifecycleTitle(person) {
            const successor = successorOf(person);
            const base = isRevoked(person)
                ? t('peerConnections.thisIdentityWasRevokedA')
                : t('peerConnections.aSignedSuccessorDeclarationWas');
            return successor ? t('peerConnections.withSuccessor', { base, successor: shortId(successor) }) : base;
        }

        // An action's error shows on the card it came from, or above the
        // list when that card is filtered out or gone.
        const actionTargetId = ref(null);
        const actionError = computed(() => relationshipError.value || friendshipError.value || blockError.value || '');
        const actionTargetVisible = computed(() => visiblePeople.value.some((p) => p.identityId === actionTargetId.value));
        function act(identityId, fn) {
            actionTargetId.value = identityId;
            relationshipError.value = '';
            friendshipError.value = '';
            blockError.value = '';
            fn();
        }

        // The ⋯ menu is a <details>: keep only one open at a time, and close
        // it once one of its items runs.
        function onMenuToggle(event) {
            if (event.target.open) {
                closeMenus(event.target);
            }
        }
        // A <details> doesn't close on an outside click or Esc by itself.
        function closeMenus(except = null) {
            for (const menu of document.querySelectorAll('.peers-menu[open]')) {
                if (menu !== except) {
                    menu.removeAttribute('open');
                }
            }
        }
        function onDocumentClick(event) {
            closeMenus(event.target.closest ? event.target.closest('.peers-menu') : null);
        }
        function onDocumentKeydown(event) {
            if (event.key === 'Escape') {
                closeMenus();
            }
        }
        function menuAction(event, fn) {
            const menu = event.target.closest('details');
            if (menu) {
                menu.removeAttribute('open');
            }
            fn();
        }

        const renamingId = ref(null);
        const renameText = ref('');
        function startRename(person) {
            renamingId.value = person.identityId;
            renameText.value = person.alias || '';
        }
        function saveRename(person) {
            const alias = renameText.value.trim();
            act(person.identityId, () => {
                if (person.isKnown) {
                    updateKnownAlias(person.identityId, alias);
                } else {
                    rememberIdentity(identitySource(person), alias || undefined);
                }
            });
            if (!actionError.value) {
                renamingId.value = null;
            }
        }

        const reconnectTargetId = ref(null);
        function toggleReconnect(identityId) {
            reconnectRejectedError.value = '';
            reconnectTargetId.value = reconnectTargetId.value === identityId ? null : identityId;
        }

        function disconnectPerson(person) {
            for (const peer of person.connectedPeers) {
                disconnectPeer(peer);
            }
        }

        // --- Connect with someone new ------------------------------------------
        const connectTab = ref('invite');

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

        // --- copy-to-clipboard -----------------------------------------------
        const copiedKey = ref(null);
        async function copyText(text, key) {
            try {
                await navigator.clipboard.writeText(text);
                copiedKey.value = key;
                setTimeout(() => { if (copiedKey.value === key) copiedKey.value = null; }, 1500);
            } catch {
                // Clipboard API unavailable or denied — the text is already
                // shown in a selectable, readonly field for manual copy.
            }
        }

        let unsubscribePeers = null;
        let unsubscribeRelationships = null;
        let unsubscribeFriendships = null;
        let unsubscribeBlocked = null;
        let unsubscribeFollows = null;
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
            unsubscribeFollows = followUseCase ? followUseCase.onFollowingChanged(() => refreshFollows()) : null;
            unsubscribeSession = identityUseCase.onSessionChanged(() => {
                isAuthenticated.value = identityUseCase.isAuthenticated();
                refreshRelationships();
                refreshFriendships();
                refreshBlocked();
                refreshFollows();
                refreshLockState();
            });
            // Locking and unlocking never fire onSessionChanged.
            unsubscribeVaultLock = identityUseCase.onVaultLockChanged(() => refreshLockState());
            // By the time these fire the connection is already closed; they
            // only explain what happened.
            unsubscribeReconnectRejected = peerReconnectionUseCase.onReconnectRejected(({ target }) => {
                const label = (target && target.alias) || (target ? shortId(target.identityId) : 'them');
                reconnectRejectedError.value = `Reconnect stopped: whoever answered wasn't ${label}, so the connection was closed.`;
            });
            unsubscribeFindRejected = findPeerUseCase.onCandidateRejected(({ expectedIdentityId }) => {
                findRejectedError.value = t('peerConnections.connectionStoppedWrongIdentity', { id: shortId(expectedIdentityId) });
            });
            tickInterval = setInterval(() => { now.value = Date.now(); }, 1000);
            document.addEventListener('click', onDocumentClick);
            document.addEventListener('keydown', onDocumentKeydown);
        });
        onBeforeUnmount(() => {
            if (unsubscribePeers) unsubscribePeers();
            if (unsubscribeRelationships) unsubscribeRelationships();
            if (unsubscribeFriendships) unsubscribeFriendships();
            if (unsubscribeBlocked) unsubscribeBlocked();
            if (unsubscribeFollows) unsubscribeFollows();
            if (unsubscribeSession) unsubscribeSession();
            if (unsubscribeVaultLock) unsubscribeVaultLock();
            if (unsubscribeReconnectRejected) unsubscribeReconnectRejected();
            if (unsubscribeFindRejected) unsubscribeFindRejected();
            if (tickInterval) clearInterval(tickInterval);
            document.removeEventListener('click', onDocumentClick);
            document.removeEventListener('keydown', onDocumentKeydown);
        });

        return {
            formatDate,
            t,
            GUIDE_URL, CONNECT_TABS, PEOPLE_FILTERS, PUBLIC_LOBBY,
            isAuthenticated, isIdentityLocked, myIdentityId, peers, PeerLifecycleState, LIFECYCLE_LABELS, LIFECYCLE_CLASSES, PROGRESSION_STEPS,
            connectedFor, shortId,
            pendingPeers, requestPeers, attentionHeading, peerName, progressStep, progressLabel,
            replyTexts, completeErrors, submitComplete, awaitingReply,
            people, peopleFilter, visiblePeople, personMeta, canAddFriend, canFollow, toggleFollow, identitySource, successorOf, isRevoked, lifecycleTitle,
            actionTargetId, actionError, actionTargetVisible, act, onMenuToggle, menuAction,
            renamingId, renameText, startRename, saveRename,
            reconnectTargetId, toggleReconnect, reconnectCreate, reconnectAccept, reconnectRejectedError,
            rememberIdentity, forgetKnownPeer, disconnectPerson,
            hasSentRequest, hasPendingIncomingRequest, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, cancelFriendRequest, unfriendByIdentity,
            blocked, blockIdentity, unblockIdentity, friendDisplayName,
            createInvitation, acceptInvitation, connectTab,
            findImportText, findImportError, findImportSuccess, submitFindImport,
            findIdentityId, findCandidates, findSearched, findError, findConnectingId, findReplies, findDelivered,
            findRejectedError, submitFind, candidateExpiry, connectToCandidate,
            publishPending, publishError, isPublished, togglePublish,
            selectedPeer, openDetail, closeDetail, disconnectPeer,
            copiedKey, copyText
        };
    },
    template: `
        <section class="peer-connections-view">
            <header class="peers-header">
                <div>
                    <h1>{{ t('peerConnections.peers') }}</h1>
                    <p class="form-hint form-hint--neutral peers-intro">
                        {{ t('peerConnections.everyoneYouReConnectedTo') }}
                        <a :href="GUIDE_URL" target="_blank" rel="noopener">{{ t('peerConnections.howThisWorks') }}</a>
                    </p>
                </div>
                <div v-if="myIdentityId" class="peers-my-id">
                    <span class="form-label">{{ t('peerConnections.yourId') }}</span>
                    <code :title="myIdentityId">…{{ shortId(myIdentityId) }}</code>
                    <button class="action-btn action-btn--secondary" @click="copyText(myIdentityId, 'my-identity')">
                        {{ copiedKey === 'my-identity' ? t('peerConnections.copied') : t('peerConnections.copyFullId') }}
                    </button>
                </div>
            </header>

            <p v-if="!isAuthenticated" class="form-hint form-hint--neutral">
                <I18nText keypath="peerConnections.signInOn"><template #myIdentities><router-link to="/identity">{{ t('peerConnections.myIdentities') }}</router-link></template></I18nText>
            </p>
            <p v-else-if="isIdentityLocked" class="identity-unlock-error">
                <I18nText keypath="peerConnections.yourIdentityIsLockedUnlock"><template #myIdentities><router-link to="/identity">{{ t('peerConnections.myIdentities') }}</router-link></template></I18nText>
            </p>

            ${attentionSectionTemplate}

            ${peopleSectionTemplate}

            <template v-if="isAuthenticated">
                ${connectSectionTemplate}
            </template>

            <details v-if="blocked.length" class="peers-section peers-blocked">
                <summary class="peers-section-heading">{{ t('peerConnections.blocked') }} <span class="peers-count">{{ blocked.length }}</span></summary>
                <p class="form-hint form-hint--neutral">
                    {{ t('peerConnections.theyArenTToldThis') }}
                </p>
                <ul class="peers-rows">
                    <li v-for="block in blocked" :key="block.identityId" class="peers-row">
                        <div class="peers-row-main">
                            <span class="peers-row-title">{{ friendDisplayName(block.identityId) }}</span>
                            <div class="peers-row-actions">
                                <button class="action-btn action-btn--secondary" @click="unblockIdentity(block.identityId)">{{ t('peerConnections.unblock') }}</button>
                            </div>
                        </div>
                        <p class="peers-row-meta">…{{ shortId(block.identityId) }} · {{ t('peerConnections.blockedOn', { date: formatDate(block.createdAt) }) }}</p>
                    </li>
                </ul>
            </details>

            <div v-if="selectedPeer" role="dialog" :aria-label="t('peerConnections.peerIdentity')" class="modal-overlay" @click.self="closeDetail">
                <div class="modal-panel peer-detail-panel">
                    <h3>{{ t('peerConnections.peerIdentity2') }}</h3>

                    <div class="peer-detail-row">
                        <span class="form-label">{{ t('peerConnections.identity') }}</span>
                        <code class="peer-detail-value">{{ selectedPeer.remoteIdentity ? selectedPeer.remoteIdentity.identityId : t('peerConnections.notYetAuthenticated') }}</code>
                    </div>
                    <div class="peer-detail-row" v-if="selectedPeer.remoteIdentity">
                        <span class="form-label">{{ t('peerConnections.publicKey') }}</span>
                        <code class="peer-detail-value">{{ selectedPeer.remoteIdentity.publicKey }}</code>
                    </div>
                    <div class="peer-detail-row" v-if="selectedPeer.remoteIdentity">
                        <span class="form-label">{{ t('peerConnections.authentication') }}</span>
                        <span class="peer-detail-value">{{ selectedPeer.remoteIdentity.algorithm }}</span>
                    </div>
                    <div class="peer-detail-row">
                        <span class="form-label">{{ t('peerConnections.connection') }}</span>
                        <span class="peer-detail-value">{{ t('peerConnections.webrtc') }}</span>
                    </div>
                    <div class="peer-detail-row">
                        <span class="form-label">{{ t('peerConnections.authenticated') }}</span>
                        <span class="peer-detail-value">{{ selectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED ? t('peerConnections.yes') : t('peerConnections.no') }}</span>
                    </div>
                    <div class="peer-detail-row">
                        <span class="form-label">{{ t('peerConnections.session') }}</span>
                        <span class="peer-detail-value">{{ t('peerConnections.ephemeralGoneWhenThisConnection') }}</span>
                    </div>

                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--secondary" @click="closeDetail">{{ t('peerConnections.close') }}</button>
                        <button class="modal-btn modal-btn--primary" @click="disconnectPeer(selectedPeer)">{{ t('peerConnections.disconnect') }}</button>
                    </div>
                </div>
            </div>
        </section>
    `
};
