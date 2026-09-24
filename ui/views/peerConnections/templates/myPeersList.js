// Peers page template: the My Peers cards for live connections.
// It renders in PeerConnectionsView's scope, so it uses the names its setup() returns.
export const myPeersListTemplate = `<div v-if="peers.length" class="identity-mgmt-list">
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
                            :class="{ 'peer-progression-step--done': step.reached(peer.getLifecycleState()) }">
                            {{ step.label }}
                        </li>
                    </ol>
                    <p v-if="peer.getLifecycleState() === PeerLifecycleState.FAILED" class="identity-unlock-error">
                        {{ peer.authenticationSession.failureReason || 'Authentication failed.' }}
                    </p>

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

                    <template v-if="peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED">
                        <p v-if="relationshipFor(peer)" class="form-hint form-hint--neutral">
                            ✓ Known Peer{{ relationshipFor(peer).alias ? ' — ' + relationshipFor(peer).alias : '' }}
                        </p>
                        <p v-if="friendStatus(peer) === FriendshipState.FRIEND" class="form-hint form-hint--neutral">
                            ✓ Friend
                        </p>
                        <p v-else-if="hasPendingIncomingRequest(peer)" class="form-hint form-hint--neutral">
                            {{ peer.alias || shortId(peer.remoteIdentity.identityId) }} sent you a friend request.
                        </p>
                        <p v-else-if="hasSentRequest(peer)" class="form-hint form-hint--neutral">
                            Friend request sent — waiting for them to accept.
                        </p>
                        <p v-if="isBlockedIdentity(peer.remoteIdentity.identityId)" class="form-hint form-hint--neutral">
                            ⛔ Blocked — this device refuses social interaction from this identity.
                        </p>
                    </template>

                    <div class="identity-mgmt-actions">
                        <template v-if="peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED">
                            <button v-if="!relationshipFor(peer)" class="action-btn action-btn--secondary" @click="rememberPeer(peer)">
                                Remember
                            </button>
                            <button v-else class="action-btn action-btn--secondary" @click="forgetKnownPeer(peer.remoteIdentity.identityId)">
                                Forget
                            </button>
                            <button v-if="friendStatus(peer) === FriendshipState.NONE"
                                    class="action-btn action-btn--secondary" @click="sendFriendRequest(peer)">
                                Send Friend Request
                            </button>
                            <template v-if="hasPendingIncomingRequest(peer)">
                                <button class="action-btn action-btn--primary" @click="acceptFriendRequest(peer)">
                                    Accept Friend Request
                                </button>
                                <button class="action-btn action-btn--secondary" @click="rejectFriendRequest(peer)">
                                    Reject Friend Request
                                </button>
                            </template>
                            <button v-if="hasSentRequest(peer)" class="action-btn action-btn--secondary" @click="cancelFriendRequest(peer)">
                                Cancel Friend Request
                            </button>
                            <button v-if="friendStatus(peer) === FriendshipState.FRIEND"
                                    class="action-btn action-btn--secondary" @click="unfriendPeer(peer)">
                                Unfriend
                            </button>
                            <button v-if="!isBlockedIdentity(peer.remoteIdentity.identityId)"
                                    class="action-btn action-btn--danger" @click="blockIdentity(peer.remoteIdentity)">
                                Block
                            </button>
                            <button v-else class="action-btn action-btn--secondary" @click="unblockIdentity(peer.remoteIdentity.identityId)">
                                Unblock
                            </button>
                        </template>
                        <button class="action-btn action-btn--secondary" @click="openDetail(peer)">Details</button>
                        <button class="action-btn action-btn--danger" @click="disconnectPeer(peer)">Disconnect</button>
                    </div>
                </div>
            </div>`;
