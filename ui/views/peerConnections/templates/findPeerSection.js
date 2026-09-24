// Peers page template: Find a Peer: add a candidate, be discoverable, find someone.
// It renders in PeerConnectionsView's scope, so it uses the names its setup() returns.
export const findPeerSectionTemplate = `<h2 class="peer-my-peers-heading">Find a Peer</h2>
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
                        <button class="modal-btn modal-btn--primary" @click="submitFindImport">Add Candidate</button>
                    </div>
                </div>

                <div class="peer-signal-box">
                    <h3>Be Discoverable</h3>
                    <p class="form-hint form-hint--neutral">
                        Publishes an offer for this device under your own identity to every rendezvous
                        network this app is configured with, so someone who only knows your identity can
                        find and connect to you without an invitation ever passing between you directly.
                        A publication answers at most one incoming connection — publish again once someone
                        connects if you want to be found for a next one.
                    </p>
                    <div v-if="myIdentityId" class="peer-signal-box peer-signal-box--nested">
                        <p class="form-hint form-hint--neutral">
                            <strong>Your Identity</strong> — this is what "Be Discoverable" publishes under,
                            and what someone needs to paste into their own <strong>Find Someone</strong> to
                            find you. It is NOT the shortened …{{ shortId(myIdentityId) }} shown elsewhere in
                            this app for telling cards apart at a glance — that shortened form will never
                            match a real search.
                        </p>
                        <textarea class="form-input peer-signal-json" rows="2" readonly :value="myIdentityId" @click="$event.target.select()"></textarea>
                        <button class="modal-btn modal-btn--primary" @click="copyText(myIdentityId, 'my-identity')">
                            {{ copiedKey === 'my-identity' ? 'Copied!' : 'Copy Your Identity' }}
                        </button>
                    </div>
                    <p v-if="publishError" class="identity-unlock-error">{{ publishError }}</p>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--primary" :disabled="publishPending" @click="togglePublish">
                            {{ publishPending ? 'Working…' : (isPublished ? 'Stop Being Discoverable' : 'Be Discoverable') }}
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
                </div>`;
