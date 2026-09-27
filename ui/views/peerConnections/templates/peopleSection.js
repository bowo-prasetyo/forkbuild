// Peers page template: the People list, one card per identity (see
// ../people.js), with one or two main actions and the rest in a ⋯ menu.
// It renders in PeerConnectionsView's scope, so it uses the names its setup() returns.
export const peopleSectionTemplate = `<section class="peers-section" aria-labelledby="peers-people-heading">
                <div class="peers-section-header">
                    <h2 id="peers-people-heading" class="peers-section-heading">People <span v-if="people.length" class="peers-count">{{ people.length }}</span></h2>
                    <div v-if="people.length" class="peers-filter" role="group" aria-label="Show">
                        <button v-for="option in PEOPLE_FILTERS" :key="option.key" type="button"
                                :class="['peers-filter-btn', { 'peers-filter-btn--active': peopleFilter === option.key }]"
                                :aria-pressed="peopleFilter === option.key ? 'true' : 'false'"
                                @click="peopleFilter = option.key">{{ option.label }}</button>
                    </div>
                </div>

                <p v-if="reconnectRejectedError" class="identity-unlock-error">{{ reconnectRejectedError }}</p>
                <p v-if="actionError && !actionTargetVisible" class="identity-unlock-error">{{ actionError }}</p>

                <p v-if="!people.length" class="form-hint form-hint--neutral">
                    Nobody here yet. Connect with someone below; once you're connected you can add them as a friend
                    or remember them on this device.
                </p>
                <p v-else-if="!visiblePeople.length" class="form-hint form-hint--neutral">
                    Nobody matches this filter.
                </p>

                <ul v-if="visiblePeople.length" class="peers-rows">
                    <li v-for="person in visiblePeople" :key="person.identityId"
                        :class="['peers-row', 'peers-person', { 'peers-person--offline': !person.isOnline }]">
                        <div class="peers-row-main">
                            <span :class="['peers-presence', person.isOnline ? 'peers-presence--online' : 'peers-presence--offline']"
                                  :title="person.isOnline ? 'Online' : 'Offline'"></span>
                            <div class="peers-person-text">
                                <div class="peers-person-name-row">
                                    <span class="peers-row-title">{{ person.name }}</span>
                                    <span v-if="person.isFriend" class="peers-tag peers-tag--friend">Friend</span>
                                    <span v-else-if="person.isKnown" class="peers-tag">Remembered</span>
                                    <span v-if="person.isBlocked" class="peers-tag peers-tag--blocked">Blocked</span>
                                    <span v-if="isRevoked(person)" class="peers-tag peers-tag--warning" :title="lifecycleTitle(person)">Revoked</span>
                                    <span v-else-if="successorOf(person)" class="peers-tag" :title="lifecycleTitle(person)">New identity declared</span>
                                    <span v-if="person.connectedPeer && hasSentRequest(person.connectedPeer)" class="peers-tag">Request sent</span>
                                    <span v-else-if="person.connectedPeer && !person.isFriend && hasPendingIncomingRequest(person.connectedPeer)" class="peers-tag">Wants to be friends</span>
                                </div>
                                <p class="peers-row-meta">{{ personMeta(person) }}</p>
                            </div>
                            <div class="peers-row-actions">
                                <router-link v-if="person.isFriend && !person.isBlocked" :to="'/chat/' + person.identityId"
                                             class="action-btn action-btn--primary">Chat</router-link>
                                <button v-if="!person.isOnline"
                                        class="action-btn action-btn--secondary"
                                        :aria-expanded="reconnectTargetId === person.identityId ? 'true' : 'false'"
                                        @click="toggleReconnect(person.identityId)">{{ reconnectTargetId === person.identityId ? 'Close' : 'Reconnect' }}</button>
                                <button v-if="canAddFriend(person)" class="action-btn action-btn--primary"
                                        @click="act(person.identityId, () => sendFriendRequest(person.connectedPeer))">Add Friend</button>
                                <details class="peers-menu" @toggle="onMenuToggle">
                                    <summary class="peers-menu-trigger" :aria-label="'More actions for ' + person.name">⋯</summary>
                                    <div class="peers-menu-list">
                                        <button type="button" class="peers-menu-item" @click="menuAction($event, () => startRename(person))">
                                            {{ person.isKnown ? 'Rename' : 'Name & Remember' }}
                                        </button>
                                        <button v-if="!person.isKnown" type="button" class="peers-menu-item"
                                                @click="menuAction($event, () => act(person.identityId, () => rememberIdentity(identitySource(person))))">Remember</button>
                                        <button v-else type="button" class="peers-menu-item"
                                                @click="menuAction($event, () => act(person.identityId, () => forgetKnownPeer(person.identityId)))">Forget</button>
                                        <button v-if="person.connectedPeer && hasSentRequest(person.connectedPeer)" type="button" class="peers-menu-item"
                                                @click="menuAction($event, () => act(person.identityId, () => cancelFriendRequest(person.connectedPeer)))">Cancel Friend Request</button>
                                        <button v-if="person.isFriend" type="button" class="peers-menu-item"
                                                :disabled="!person.isOnline"
                                                :title="person.isOnline ? '' : 'Reconnect first: they need to receive it'"
                                                @click="menuAction($event, () => act(person.identityId, () => unfriendByIdentity(person.identityId)))">
                                            Unfriend<span v-if="!person.isOnline" class="peers-menu-note"> (reconnect first)</span>
                                        </button>
                                        <button v-if="person.connectedPeer" type="button" class="peers-menu-item"
                                                @click="menuAction($event, () => openDetail(person.connectedPeer))">Connection Details</button>
                                        <button v-if="person.connectedPeer" type="button" class="peers-menu-item"
                                                @click="menuAction($event, () => disconnectPerson(person))">Disconnect</button>
                                        <button v-if="!person.isBlocked" type="button" class="peers-menu-item peers-menu-item--danger"
                                                @click="menuAction($event, () => act(person.identityId, () => blockIdentity(identitySource(person))))">Block</button>
                                        <button v-else type="button" class="peers-menu-item"
                                                @click="menuAction($event, () => act(person.identityId, () => unblockIdentity(person.identityId)))">Unblock</button>
                                    </div>
                                </details>
                            </div>
                        </div>

                        <form v-if="renamingId === person.identityId" class="peers-rename" @submit.prevent="saveRename(person)">
                            <label class="form-label" :for="'rename-' + person.identityId">Name (only on this device)</label>
                            <div class="peers-rename-row">
                                <input :id="'rename-' + person.identityId" v-model="renameText" type="text" class="form-input"
                                       placeholder="e.g. Bob" @keydown.esc="renamingId = null" />
                                <button type="submit" class="action-btn action-btn--primary">Save</button>
                                <button type="button" class="action-btn action-btn--secondary" @click="renamingId = null">Cancel</button>
                            </div>
                            <p v-if="!person.isKnown" class="form-hint form-hint--neutral">Saving a name also remembers them on this device.</p>
                        </form>

                        <div v-if="reconnectTargetId === person.identityId" class="peers-reconnect">
                            <p class="form-hint form-hint--neutral">
                                Reconnecting starts a new connection. It only goes through if the other side proves
                                they're {{ person.name }}.
                            </p>
                            <InvitationExchange
                                :create="reconnectCreate(person.identityId)"
                                :accept="reconnectAccept(person.identityId)"
                                :recipient="person.name"
                                :disabled="isIdentityLocked"
                            />
                        </div>

                        <p v-if="actionError && actionTargetId === person.identityId" class="identity-unlock-error">{{ actionError }}</p>
                    </li>
                </ul>
            </section>`;
