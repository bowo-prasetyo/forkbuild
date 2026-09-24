// Peers page template: the Known Peers cards, with Reconnect.
// It renders in PeerConnectionsView's scope, so it uses the names its setup() returns.
export const knownPeersListTemplate = `<div v-if="relationships.length" class="identity-mgmt-list">
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
                    <p v-if="remoteLifecycleFor(relationship.identityId) && remoteLifecycleFor(relationship.identityId).isRevoked" class="form-hint form-hint--neutral">
                        <span class="identity-revoked-badge">⚠ Revoked</span> — a signed revocation for this identity
                        was received and verified.
                        <template v-if="remoteLifecycleFor(relationship.identityId).successorIdentityId">
                            Remembered successor: …{{ shortId(remoteLifecycleFor(relationship.identityId).successorIdentityId) }}.
                        </template>
                        This is informational only — the Known Peer record above is untouched; nothing about
                        this identity's past connections or relationship is changed automatically.
                    </p>
                    <p v-else-if="remoteLifecycleFor(relationship.identityId) && remoteLifecycleFor(relationship.identityId).successorIdentityId" class="form-hint form-hint--neutral">
                        A signed successor declaration was received and verified — remembered successor:
                        …{{ shortId(remoteLifecycleFor(relationship.identityId).successorIdentityId) }}.
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
            </div>`;
