// Peers page template: Connect with someone new — invite, paste an
// invitation, find by ID (with Be Discoverable), or the public lobby, one
// tab at a time.
// It renders in PeerConnectionsView's scope, so it uses the names its setup() returns.
export const connectSectionTemplate = `<section class="peers-section" aria-labelledby="peers-connect-heading">
                <h2 id="peers-connect-heading" class="peers-section-heading">Connect with someone new</h2>
                <div class="peers-tabs" role="tablist" aria-label="How to connect">
                    <button v-for="tab in CONNECT_TABS" :key="tab.key" type="button" role="tab"
                            :id="'peers-tab-' + tab.key"
                            :aria-selected="connectTab === tab.key ? 'true' : 'false'"
                            :aria-controls="'peers-panel-' + tab.key"
                            :class="['peers-tab', { 'peers-tab--active': connectTab === tab.key }]"
                            @click="connectTab = tab.key">{{ tab.label }}</button>
                </div>

                <div v-if="connectTab === 'invite'" id="peers-panel-invite" role="tabpanel" aria-labelledby="peers-tab-invite" class="peers-tab-panel">
                    <InvitationExchange :modes="['invite']" :create="createInvitation" :accept="acceptInvitation" :disabled="isIdentityLocked" />
                </div>

                <div v-else-if="connectTab === 'paste'" id="peers-panel-paste" role="tabpanel" aria-labelledby="peers-tab-paste" class="peers-tab-panel">
                    <InvitationExchange :modes="['paste']" :create="createInvitation" :accept="acceptInvitation" :disabled="isIdentityLocked" />
                </div>

                <div v-else-if="connectTab === 'find'" id="peers-panel-find" role="tabpanel" aria-labelledby="peers-tab-find" class="peers-tab-panel">
                    <h4 class="invitation-exchange-heading">Find someone by their ID</h4>
                    <div class="peers-find-row">
                        <input type="text" class="form-input" v-model="findIdentityId" aria-label="Their full ID"
                               placeholder="did:key:…" @keyup.enter="submitFind" />
                        <button class="action-btn action-btn--primary" :disabled="!findIdentityId.trim()" @click="submitFind">Find</button>
                    </div>
                    <p class="form-hint form-hint--neutral">Ask them for their full ID. They can copy it from the top of their own Peers page.</p>
                    <p v-if="findError" class="identity-unlock-error">{{ findError }}</p>
                    <p v-if="findRejectedError" class="identity-unlock-error">{{ findRejectedError }}</p>

                    <ul v-if="findCandidates.length" class="peers-rows">
                        <li v-for="record in findCandidates" :key="record.peerDiscoveryId" class="peers-row">
                            <div class="peers-row-main">
                                <span class="peers-row-title">…{{ shortId(findIdentityId) }}</span>
                                <span class="peers-tag">Found · not yet verified</span>
                                <div class="peers-row-actions">
                                    <button v-if="!findDelivered[record.peerDiscoveryId] && !findReplies[record.peerDiscoveryId]"
                                            class="action-btn action-btn--primary"
                                            :disabled="findConnectingId === record.peerDiscoveryId"
                                            @click="connectToCandidate(record)">
                                        {{ findConnectingId === record.peerDiscoveryId ? 'Connecting…' : 'Connect' }}
                                    </button>
                                </div>
                            </div>
                            <p class="peers-row-meta">Via {{ record.source }} · expires in {{ candidateExpiry(record) }}</p>
                            <p v-if="findDelivered[record.peerDiscoveryId]" class="form-hint form-hint--neutral">
                                Connecting on its own; watch <strong>Needs your attention</strong> above.
                            </p>
                            <div v-else-if="findReplies[record.peerDiscoveryId]" class="peers-reply">
                                <p class="form-hint form-hint--neutral">
                                    Send this reply to whoever gave you this invitation. The connection finishes once they paste it in.
                                </p>
                                <textarea class="form-input peer-signal-json" rows="4" readonly :value="findReplies[record.peerDiscoveryId]"></textarea>
                                <div class="modal-actions">
                                    <button class="modal-btn modal-btn--primary"
                                            @click="copyText(findReplies[record.peerDiscoveryId], 'find-reply-' + record.peerDiscoveryId)">
                                        {{ copiedKey === ('find-reply-' + record.peerDiscoveryId) ? 'Copied!' : 'Copy Reply' }}
                                    </button>
                                </div>
                            </div>
                        </li>
                    </ul>
                    <p v-else-if="findSearched" class="form-hint form-hint--neutral">
                        Nothing found for that ID. They may need to turn on <strong>Be discoverable</strong>, or send you an invitation instead.
                    </p>

                    <h4 class="invitation-exchange-heading">Let others find you</h4>
                    <p class="form-hint form-hint--neutral">
                        Anyone with your full ID can then connect without an invitation. It answers one connection;
                        turn it on again for the next.
                    </p>
                    <p v-if="publishError" class="identity-unlock-error">{{ publishError }}</p>
                    <p v-else-if="isIdentityLocked && !isPublished" class="form-hint form-hint--neutral">
                        Unlock your identity on <router-link to="/identity">My Identities</router-link> first.
                    </p>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--primary" :disabled="publishPending || (isIdentityLocked && !isPublished)" @click="togglePublish">
                            {{ publishPending ? 'Working…' : (isPublished ? 'Stop Being Discoverable' : 'Be Discoverable') }}
                        </button>
                    </div>

                    <details class="peers-more">
                        <summary>Save an invitation for later</summary>
                        <p class="form-hint form-hint--neutral">
                            Adds an invitation to this device's search results without connecting. Find it later by the sender's ID.
                        </p>
                        <textarea v-model="findImportText" class="form-input peer-signal-json" rows="3"
                                  placeholder="Paste the invitation here" aria-label="Invitation to save"></textarea>
                        <p v-if="findImportError" class="identity-unlock-error">{{ findImportError }}</p>
                        <p v-if="findImportSuccess" class="form-hint form-hint--neutral">{{ findImportSuccess }}</p>
                        <div class="modal-actions">
                            <button class="modal-btn modal-btn--secondary" :disabled="!findImportText.trim()" @click="submitFindImport">Save Invitation</button>
                        </div>
                    </details>
                </div>

                <div v-else id="peers-panel-lobby" role="tabpanel" aria-labelledby="peers-tab-lobby" class="peers-tab-panel">
                    <p class="form-hint form-hint--neutral">
                        Meet people you don't know yet. Each World also has its own lobby, under <strong>Lobby</strong> in World View.
                    </p>
                    <PublicLobbyPanel :lobby="PUBLIC_LOBBY" :title="t('publicLobbyPanel.everyone')" />
                </div>
            </section>`;
