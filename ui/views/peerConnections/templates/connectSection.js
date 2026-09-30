// Peers page template: Connect with someone new — invite, paste an
// invitation, find by ID (with Be Discoverable), or the public lobby, one
// tab at a time.
// It renders in PeerConnectionsView's scope, so it uses the names its setup() returns.
export const connectSectionTemplate = `<section class="peers-section" aria-labelledby="peers-connect-heading">
                <h2 id="peers-connect-heading" class="peers-section-heading">{{ t('peerConnections.connectWithSomeoneNew') }}</h2>
                <div class="peers-tabs" role="tablist" :aria-label="t('peerConnections.howToConnect')">
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
                    <h4 class="invitation-exchange-heading">{{ t('peerConnections.findSomeoneByTheirId') }}</h4>
                    <div class="peers-find-row">
                        <input type="text" class="form-input" v-model="findIdentityId" :aria-label="t('peerConnections.theirFullId')"
                               placeholder="did:key:…" @keyup.enter="submitFind" />
                        <button class="action-btn action-btn--primary" :disabled="!findIdentityId.trim()" @click="submitFind">{{ t('peerConnections.find') }}</button>
                    </div>
                    <p class="form-hint form-hint--neutral">{{ t('peerConnections.askThemForTheirFull') }}</p>
                    <p v-if="findError" class="identity-unlock-error">{{ findError }}</p>
                    <p v-if="findRejectedError" class="identity-unlock-error">{{ findRejectedError }}</p>

                    <ul v-if="findCandidates.length" class="peers-rows">
                        <li v-for="record in findCandidates" :key="record.peerDiscoveryId" class="peers-row">
                            <div class="peers-row-main">
                                <span class="peers-row-title">…{{ shortId(findIdentityId) }}</span>
                                <span class="peers-tag">{{ t('peerConnections.foundNotYetVerified') }}</span>
                                <div class="peers-row-actions">
                                    <button v-if="!findDelivered[record.peerDiscoveryId] && !findReplies[record.peerDiscoveryId]"
                                            class="action-btn action-btn--primary"
                                            :disabled="findConnectingId === record.peerDiscoveryId"
                                            @click="connectToCandidate(record)">
                                        {{ findConnectingId === record.peerDiscoveryId ? t('peerConnections.connecting') : t('peerConnections.connect') }}
                                    </button>
                                </div>
                            </div>
                            <p class="peers-row-meta">{{ t('peerConnections.viaExpiresIn', { source: record.source, expiry: candidateExpiry(record) }) }}</p>
                            <p v-if="findDelivered[record.peerDiscoveryId]" class="form-hint form-hint--neutral">
                                <I18nText keypath="peerConnections.connectingOnItsOwnWatch"><template #needsYourAttention><strong>{{ t('peerConnections.needsYourAttention2') }}</strong></template></I18nText>
                            </p>
                            <div v-else-if="findReplies[record.peerDiscoveryId]" class="peers-reply">
                                <p class="form-hint form-hint--neutral">
                                    {{ t('peerConnections.sendThisReplyToWhoever') }}
                                </p>
                                <textarea class="form-input peer-signal-json" rows="4" readonly :value="findReplies[record.peerDiscoveryId]"></textarea>
                                <div class="modal-actions">
                                    <button class="modal-btn modal-btn--primary"
                                            @click="copyText(findReplies[record.peerDiscoveryId], 'find-reply-' + record.peerDiscoveryId)">
                                        {{ copiedKey === ('find-reply-' + record.peerDiscoveryId) ? t('peerConnections.copied') : t('peerConnections.copyReply') }}
                                    </button>
                                </div>
                            </div>
                        </li>
                    </ul>
                    <p v-else-if="findSearched" class="form-hint form-hint--neutral">
                        <I18nText keypath="peerConnections.nothingFoundForThatId"><template #beDiscoverable><strong>{{ t('peerConnections.beDiscoverable') }}</strong></template></I18nText>
                    </p>

                    <h4 class="invitation-exchange-heading">{{ t('peerConnections.letOthersFindYou') }}</h4>
                    <p class="form-hint form-hint--neutral">
                        {{ t('peerConnections.anyoneWithYourFullId') }}
                    </p>
                    <p v-if="publishError" class="identity-unlock-error">{{ publishError }}</p>
                    <p v-else-if="isIdentityLocked && !isPublished" class="form-hint form-hint--neutral">
                        <I18nText keypath="peerConnections.unlockYourIdentityOn"><template #myIdentities><router-link to="/identity">{{ t('peerConnections.myIdentities2') }}</router-link></template></I18nText>
                    </p>
                    <div class="modal-actions">
                        <button class="modal-btn modal-btn--primary" :disabled="publishPending || (isIdentityLocked && !isPublished)" @click="togglePublish">
                            {{ publishPending ? t('peerConnections.working') : (isPublished ? t('peerConnections.stopBeingDiscoverable') : t('peerConnections.beDiscoverable2')) }}
                        </button>
                    </div>

                    <details class="peers-more">
                        <summary>{{ t('peerConnections.saveAnInvitationForLater') }}</summary>
                        <p class="form-hint form-hint--neutral">
                            {{ t('peerConnections.addsAnInvitationToThis') }}
                        </p>
                        <textarea v-model="findImportText" class="form-input peer-signal-json" rows="3"
                                  :placeholder="t('peerConnections.pasteTheInvitationHere2')" :aria-label="t('peerConnections.invitationToSave')"></textarea>
                        <p v-if="findImportError" class="identity-unlock-error">{{ findImportError }}</p>
                        <p v-if="findImportSuccess" class="form-hint form-hint--neutral">{{ findImportSuccess }}</p>
                        <div class="modal-actions">
                            <button class="modal-btn modal-btn--secondary" :disabled="!findImportText.trim()" @click="submitFindImport">{{ t('peerConnections.saveInvitation') }}</button>
                        </div>
                    </details>
                </div>

                <div v-else id="peers-panel-lobby" role="tabpanel" aria-labelledby="peers-tab-lobby" class="peers-tab-panel">
                    <p class="form-hint form-hint--neutral">
                        <I18nText keypath="peerConnections.meetPeopleYouDonT"><template #lobby><strong>{{ t('peerConnections.lobby') }}</strong></template></I18nText>
                    </p>
                    <PublicLobbyPanel :lobby="PUBLIC_LOBBY" :title="t('publicLobbyPanel.everyone')" />
                </div>
            </section>`;
