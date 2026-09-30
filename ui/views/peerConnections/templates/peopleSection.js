// Peers page template: the People list, one card per identity (see
// ../people.js), with one or two main actions and the rest in a ⋯ menu.
// It renders in PeerConnectionsView's scope, so it uses the names its setup() returns.
export const peopleSectionTemplate = `<section class="peers-section" aria-labelledby="peers-people-heading">
                <div class="peers-section-header">
                    <h2 id="peers-people-heading" class="peers-section-heading">{{ t('peerConnections.people') }} <span v-if="people.length" class="peers-count">{{ people.length }}</span></h2>
                    <div v-if="people.length" class="peers-filter" role="group" :aria-label="t('peerConnections.show')">
                        <button v-for="option in PEOPLE_FILTERS" :key="option.key" type="button"
                                :class="['peers-filter-btn', { 'peers-filter-btn--active': peopleFilter === option.key }]"
                                :aria-pressed="peopleFilter === option.key ? 'true' : 'false'"
                                @click="peopleFilter = option.key">{{ option.label }}</button>
                    </div>
                </div>

                <p v-if="reconnectRejectedError" class="identity-unlock-error">{{ reconnectRejectedError }}</p>
                <p v-if="actionError && !actionTargetVisible" class="identity-unlock-error">{{ actionError }}</p>

                <p v-if="!people.length" class="form-hint form-hint--neutral">
                    {{ t('peerConnections.nobodyHereYetConnectWith') }}
                </p>
                <p v-else-if="!visiblePeople.length" class="form-hint form-hint--neutral">
                    {{ t('peerConnections.nobodyMatchesThisFilter') }}
                </p>

                <ul v-if="visiblePeople.length" class="peers-rows">
                    <li v-for="person in visiblePeople" :key="person.identityId"
                        :class="['peers-row', 'peers-person', { 'peers-person--offline': !person.isOnline }]">
                        <div class="peers-row-main">
                            <span :class="['peers-presence', person.isOnline ? 'peers-presence--online' : 'peers-presence--offline']"
                                  :title="person.isOnline ? t('peerConnections.online') : t('peerConnections.offline')"></span>
                            <div class="peers-person-text">
                                <div class="peers-person-name-row">
                                    <span class="peers-row-title">{{ person.name }}</span>
                                    <span v-if="person.isFriend" class="peers-tag peers-tag--friend">{{ t('peerConnections.friend') }}</span>
                                    <span v-else-if="person.isKnown" class="peers-tag">{{ t('peerConnections.remembered') }}</span>
                                    <span v-if="person.isFollowing" class="peers-tag peers-tag--following">{{ t('peerConnections.following') }}</span>
                                    <span v-if="person.isBlocked" class="peers-tag peers-tag--blocked">{{ t('peerConnections.blocked2') }}</span>
                                    <span v-if="isRevoked(person)" class="peers-tag peers-tag--warning" :title="lifecycleTitle(person)">{{ t('peerConnections.revoked') }}</span>
                                    <span v-else-if="successorOf(person)" class="peers-tag" :title="lifecycleTitle(person)">{{ t('peerConnections.newIdentityDeclared') }}</span>
                                    <span v-if="person.connectedPeer && hasSentRequest(person.connectedPeer)" class="peers-tag">{{ t('peerConnections.requestSent') }}</span>
                                    <span v-else-if="person.connectedPeer && !person.isFriend && hasPendingIncomingRequest(person.connectedPeer)" class="peers-tag">{{ t('peerConnections.wantsToBeFriends') }}</span>
                                </div>
                                <p class="peers-row-meta">{{ personMeta(person) }}</p>
                            </div>
                            <div class="peers-row-actions">
                                <router-link v-if="person.isFriend && !person.isBlocked" :to="'/chat/' + person.identityId"
                                             class="action-btn action-btn--primary">{{ t('peerConnections.chat') }}</router-link>
                                <button v-if="!person.isOnline"
                                        class="action-btn action-btn--secondary"
                                        :aria-expanded="reconnectTargetId === person.identityId ? 'true' : 'false'"
                                        @click="toggleReconnect(person.identityId)">{{ reconnectTargetId === person.identityId ? t('peerConnections.close2') : t('peerConnections.reconnect') }}</button>
                                <button v-if="canAddFriend(person)" class="action-btn action-btn--primary"
                                        @click="act(person.identityId, () => sendFriendRequest(person.connectedPeer))">{{ t('peerConnections.addFriend') }}</button>
                                <details class="peers-menu" @toggle="onMenuToggle">
                                    <summary class="peers-menu-trigger" :aria-label="t('peerConnections.moreActionsFor') + person.name">⋯</summary>
                                    <div class="peers-menu-list">
                                        <button type="button" class="peers-menu-item" @click="menuAction($event, () => startRename(person))">
                                            {{ person.isKnown ? t('peerConnections.rename') : t('peerConnections.nameRemember') }}
                                        </button>
                                        <button v-if="!person.isKnown" type="button" class="peers-menu-item"
                                                @click="menuAction($event, () => act(person.identityId, () => rememberIdentity(identitySource(person))))">{{ t('peerConnections.remember') }}</button>
                                        <button v-else type="button" class="peers-menu-item"
                                                @click="menuAction($event, () => act(person.identityId, () => forgetKnownPeer(person.identityId)))">{{ t('peerConnections.forget') }}</button>
                                        <button v-if="person.connectedPeer && hasSentRequest(person.connectedPeer)" type="button" class="peers-menu-item"
                                                @click="menuAction($event, () => act(person.identityId, () => cancelFriendRequest(person.connectedPeer)))">{{ t('peerConnections.cancelFriendRequest') }}</button>
                                        <button v-if="person.isFriend" type="button" class="peers-menu-item"
                                                :disabled="!person.isOnline"
                                                :title="person.isOnline ? '' : t('peerConnections.reconnectFirstTheyNeedTo')"
                                                @click="menuAction($event, () => act(person.identityId, () => unfriendByIdentity(person.identityId)))">
                                            {{ t('peerConnections.unfriend') }}<span v-if="!person.isOnline" class="peers-menu-note"> {{ t('peerConnections.reconnectFirst') }}</span>
                                        </button>
                                        <button v-if="person.isFollowing || canFollow(person)" type="button" class="peers-menu-item"
                                                @click="menuAction($event, () => act(person.identityId, () => toggleFollow(person)))">{{ person.isFollowing ? t('peerConnections.unfollow') : t('peerConnections.follow') }}</button>
                                        <button v-if="person.connectedPeer" type="button" class="peers-menu-item"
                                                @click="menuAction($event, () => openDetail(person.connectedPeer))">{{ t('peerConnections.connectionDetails') }}</button>
                                        <button v-if="person.connectedPeer" type="button" class="peers-menu-item"
                                                @click="menuAction($event, () => disconnectPerson(person))">{{ t('peerConnections.disconnect2') }}</button>
                                        <button v-if="!person.isBlocked" type="button" class="peers-menu-item peers-menu-item--danger"
                                                @click="menuAction($event, () => act(person.identityId, () => blockIdentity(identitySource(person))))">{{ t('peerConnections.block') }}</button>
                                        <button v-else type="button" class="peers-menu-item"
                                                @click="menuAction($event, () => act(person.identityId, () => unblockIdentity(person.identityId)))">{{ t('peerConnections.unblock2') }}</button>
                                    </div>
                                </details>
                            </div>
                        </div>

                        <form v-if="renamingId === person.identityId" class="peers-rename" @submit.prevent="saveRename(person)">
                            <label class="form-label" :for="'rename-' + person.identityId">{{ t('peerConnections.nameOnlyOnThisDevice') }}</label>
                            <div class="peers-rename-row">
                                <input :id="'rename-' + person.identityId" v-model="renameText" type="text" class="form-input"
                                       :placeholder="t('peerConnections.eGBob')" @keydown.esc="renamingId = null" />
                                <button type="submit" class="action-btn action-btn--primary">{{ t('peerConnections.save') }}</button>
                                <button type="button" class="action-btn action-btn--secondary" @click="renamingId = null">{{ t('peerConnections.cancel') }}</button>
                            </div>
                            <p v-if="!person.isKnown" class="form-hint form-hint--neutral">{{ t('peerConnections.savingANameAlsoRemembers') }}</p>
                        </form>

                        <div v-if="reconnectTargetId === person.identityId" class="peers-reconnect">
                            <p class="form-hint form-hint--neutral">
                                {{ t('peerConnections.reconnectingStartsANewConnection', { name: person.name }) }}
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
