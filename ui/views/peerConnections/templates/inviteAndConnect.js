// Peers page template: Invite Someone and Connect to Peer.
// It renders in PeerConnectionsView's scope, so it uses the names its setup() returns.
export const inviteAndConnectTemplate = `<div class="peer-actions">
                    <button class="action-btn action-btn--primary" :disabled="invitePending || isIdentityLocked" @click="startInvite">
                        {{ invitePending ? 'Creating…' : 'Invite Someone' }}
                    </button>
                    <button class="action-btn action-btn--secondary" :disabled="isIdentityLocked" @click="showAcceptForm = !showAcceptForm">
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
                </div>`;
