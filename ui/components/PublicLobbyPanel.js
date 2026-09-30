import { ref, watch, onMounted, onBeforeUnmount, inject } from 'vue';
import { MAX_DISPLAY_NAME_LENGTH } from '../../core/LobbyCard.js';
import { t } from '../i18n/i18n.js';

const REFRESH_INTERVAL_MS = 30 * 1000;

// The last 14 characters, as the Peers page shows identities.
function shortId(identityId) {
    return identityId ? identityId.slice(-14) : '';
}

function stripPrefix(message) {
    return String(message || '').replace(/^PublicLobbyUseCase:\s*/, '');
}

// One public lobby: join or leave it, see who else is in it, and connect.
// Used on the Peers page for the global lobby and in World View for the
// open World's lobby. Everything it shows comes from
// application/peer/PublicLobbyUseCase.js, which verifies each card.
export default {
    name: 'PublicLobbyPanel',
    props: {
        // 'public', or a `world:<documentId>` lobby (core/LobbyCard.js).
        lobby: { type: String, required: true },
        // Defaults to "Public Lobby" in the chosen language.
        title: { type: String, default: null }
    },
    setup(props) {
        const publicLobbyUseCase = inject('publicLobbyUseCase');
        const available = publicLobbyUseCase.isAvailable();
        const displayName = ref(publicLobbyUseCase.rememberedDisplayName());
        const joined = ref(publicLobbyUseCase.isJoined(props.lobby));
        const joinedName = ref(publicLobbyUseCase.joinedDisplayName(props.lobby));
        const joinPending = ref(false);
        const joinError = ref('');
        const members = ref([]);
        const total = ref(0);
        const loading = ref(false);
        const listError = ref('');
        const connectingId = ref(null);
        const connectError = ref('');
        // Connections started here that have not authenticated yet.
        const connectingIds = ref(new Set());

        async function refresh() {
            if (!available) {
                return;
            }
            loading.value = true;
            listError.value = '';
            try {
                const result = await publicLobbyUseCase.list(props.lobby);
                members.value = result.members;
                markConnections();
                total.value = result.total;
            } catch (e) {
                listError.value = stripPrefix(e.message);
            } finally {
                loading.value = false;
            }
        }

        function syncJoined() {
            joined.value = publicLobbyUseCase.isJoined(props.lobby);
            joinedName.value = publicLobbyUseCase.joinedDisplayName(props.lobby);
        }

        // Re-reads who is connected without asking the servers again.
        function markConnections() {
            const connected = publicLobbyUseCase.connectedIdentityIds();
            members.value = members.value.map((m) => ({ ...m, connected: connected.has(m.identityId) }));
            connectingIds.value = new Set([...connectingIds.value].filter((id) => !connected.has(id)));
        }

        async function toggleJoin() {
            joinError.value = '';
            joinPending.value = true;
            try {
                if (joined.value) {
                    await publicLobbyUseCase.leave(props.lobby);
                } else {
                    await publicLobbyUseCase.join(props.lobby, { displayName: displayName.value });
                }
            } catch (e) {
                joinError.value = stripPrefix(e.message);
            } finally {
                syncJoined();
                joinPending.value = false;
            }
            refresh();
        }

        async function connect(member) {
            connectError.value = '';
            connectingId.value = member.identityId;
            try {
                const { alreadyConnected } = await publicLobbyUseCase.connect(member.identityId);
                if (!alreadyConnected) {
                    connectingIds.value = new Set([...connectingIds.value, member.identityId]);
                }
                markConnections();
            } catch (e) {
                connectError.value = stripPrefix(e.message);
            } finally {
                connectingId.value = null;
            }
        }

        function block(member) {
            connectError.value = '';
            try {
                publicLobbyUseCase.block(member.identityId);
                members.value = members.value.filter((m) => m.identityId !== member.identityId);
            } catch (e) {
                connectError.value = stripPrefix(e.message);
            }
        }

        function memberName(member) {
            return member.displayName || t('publicLobbyPanel.unnamed');
        }

        let unsubscribe = null;
        let unsubscribeConnections = null;
        let refreshTimer = null;
        onMounted(() => {
            unsubscribe = publicLobbyUseCase.onChange(syncJoined);
            unsubscribeConnections = publicLobbyUseCase.onConnectionsChanged(markConnections);
            refreshTimer = setInterval(refresh, REFRESH_INTERVAL_MS);
            refresh();
        });
        onBeforeUnmount(() => {
            if (unsubscribe) unsubscribe();
            if (unsubscribeConnections) unsubscribeConnections();
            if (refreshTimer) clearInterval(refreshTimer);
        });
        watch(() => props.lobby, () => {
            syncJoined();
            members.value = [];
            total.value = 0;
            refresh();
        });

        return {
            t,
            available, displayName, joined, joinedName, joinPending, joinError, members, total, loading, listError,
            connectingId, connectError, connectingIds, refresh, toggleJoin, connect, block, memberName, shortId,
            MAX_DISPLAY_NAME_LENGTH
        };
    },
    template: `
        <div class="peer-signal-box public-lobby-panel">
            <h3>{{ title || t('publicLobbyPanel.title') }}</h3>
            <p v-if="!available" class="form-hint form-hint--neutral">
                {{ t('publicLobbyPanel.theLobbyNeedsARendezvous') }} <strong>{{ t('publicLobbyPanel.networkSettings') }}</strong>.
            </p>
            <template v-else>
                <p class="form-hint form-hint--neutral">
                    {{ t('publicLobbyPanel.joiningListsYourNameAnd') }}
                </p>
                <div v-if="!joined" class="public-lobby-join">
                    <label class="peer-alias-field">
                        <span class="form-label">{{ t('publicLobbyPanel.displayName') }}</span>
                        <input type="text" class="form-input" v-model="displayName" :maxlength="MAX_DISPLAY_NAME_LENGTH"
                               :placeholder="t('publicLobbyPanel.howOthersSeeYouHere')" @keyup.enter="toggleJoin" />
                    </label>
                    <p class="form-hint form-hint--neutral">{{ t('publicLobbyPanel.anyoneCanChooseAnyName') }}</p>
                </div>
                <p v-if="joined" class="form-hint form-hint--neutral">
                    {{ t('publicLobbyPanel.youReInThisLobby') }}<template v-if="joinedName">{{ ' ' + t('publicLobbyPanel.as') }} <strong>{{ joinedName }}</strong></template>.
                </p>
                <p v-if="joinError" class="identity-unlock-error">{{ joinError }}</p>
                <div class="modal-actions">
                    <button class="modal-btn modal-btn--primary" :disabled="joinPending" @click="toggleJoin">
                        {{ joinPending ? t('publicLobbyPanel.working') : t(joined ? 'publicLobbyPanel.leave' : 'publicLobbyPanel.join') }}
                    </button>
                    <button class="modal-btn" :disabled="loading" @click="refresh">{{ loading ? t('publicLobbyPanel.refreshing') : t('publicLobbyPanel.refresh') }}</button>
                </div>

                <p v-if="listError" class="identity-unlock-error">{{ listError }}</p>
                <p v-if="connectError" class="identity-unlock-error">{{ connectError }}</p>
                <p v-if="members.length" class="form-hint form-hint--neutral">
                    {{ total > members.length ? t('publicLobbyPanel.sampleHere', { count: members.length, total }) : t('publicLobbyPanel.here', { count: members.length }) }}
                </p>
                <div v-if="members.length" class="identity-mgmt-list">
                    <div v-for="member in members" :key="member.identityId" class="identity-mgmt-card">
                        <div class="identity-mgmt-card-header">
                            <span class="identity-mgmt-name">{{ memberName(member) }}</span>
                            <span v-if="member.connected" class="peer-badge peer-badge--authenticated">{{ t('publicLobbyPanel.connected') }}</span>
                            <span v-else-if="connectingIds.has(member.identityId)" class="peer-badge peer-badge--pending">{{ t('publicLobbyPanel.connecting') }}</span>
                        </div>
                        <p class="identity-mgmt-status">…{{ shortId(member.identityId) }}</p>
                        <div class="identity-mgmt-actions">
                            <button v-if="!member.connected && !connectingIds.has(member.identityId)" class="action-btn action-btn--primary"
                                    :disabled="connectingId === member.identityId" @click="connect(member)">
                                {{ connectingId === member.identityId ? t('publicLobbyPanel.connecting') : t('publicLobbyPanel.connect') }}
                            </button>
                            <button class="action-btn" @click="block(member)">{{ t('publicLobbyPanel.block') }}</button>
                        </div>
                    </div>
                </div>
                <p v-else-if="!loading && !listError" class="form-hint form-hint--neutral">
                    {{ t('publicLobbyPanel.nobodyElseIsHereRight') }}
                </p>
            </template>
        </div>
    `
};
