// World view template: the Avatar section's client rendering preferences and camera perspective.
// It renders in WorldView's scope, so it uses the names its setup() returns.
export const avatarSectionTemplate = `<!--
                    Client rendering preferences. Control/Follow are explicit toggles, never
                    implied by focus. Show Other Avatars does not require an avatar of your own;
                    every other control here does, so without one only it and the hint show.
                -->
                <div class="world-view-section world-view-section--avatar">
                    <h4>{{ t('worldView.avatar') }}</h4>
                    <label v-if="hasLocalAvatar" class="world-view-avatar-toggle">
                        <input
                            type="checkbox"
                            :checked="showMyAvatar"
                            @change="toggleShowMyAvatar($event)"
                        />
                        {{ t('worldView.showMyAvatar') }}
                    </label>
                    <label class="world-view-avatar-toggle">
                        <input
                            type="checkbox"
                            :checked="showOtherAvatars"
                            @change="toggleShowOtherAvatars($event)"
                        />
                        {{ t('worldView.showOtherAvatars') }}
                    </label>
                    <!--
                        Diagnostics appear only here, never on an avatar: rendering presence and
                        trusting it stay separate.
                    -->
                    <p v-if="showOtherAvatars && remoteAvatarDiagnostics.total > 0" class="world-view-avatar-diagnostics">
                        {{ t('worldView.otherAvatars', { count: remoteAvatarDiagnostics.total }) }}
                        <span class="world-view-avatar-diagnostics-detail">
                            {{ t('worldView.otherAvatarsDetail', { parts: [
                                remoteAvatarDiagnostics.trusted ? t('worldView.avatarsTrusted', { count: remoteAvatarDiagnostics.trusted }) : null,
                                remoteAvatarDiagnostics.stale ? t('worldView.avatarsStale', { count: remoteAvatarDiagnostics.stale }) : null,
                                remoteAvatarDiagnostics.conflicting ? t('worldView.avatarsConflicting', { count: remoteAvatarDiagnostics.conflicting }) : null,
                                remoteAvatarDiagnostics.unavailable ? t('worldView.avatarsUnavailable', { count: remoteAvatarDiagnostics.unavailable }) : null
                            ].filter(Boolean) }) }}
                        </span>
                    </p>
                    <!-- A local geometric fact, never announced; shown with Show Other Avatars. -->
                    <NearbyAvatarsPanel
                        v-if="showOtherAvatars"
                        :entries="nearbyAvatars"
                        @select="selectNearbyAvatar"
                    />
                    <label v-if="hasLocalAvatar" class="world-view-avatar-toggle">
                        <input
                            type="checkbox"
                            :checked="avatarControlMode"
                            @change="toggleAvatarControlMode($event)"
                        />
                        {{ t('worldView.controlMyAvatarWasdShift') }}
                    </label>
                    <label v-if="hasLocalAvatar" class="world-view-avatar-toggle">
                        <input
                            type="checkbox"
                            :checked="followAvatar"
                            @change="toggleFollowAvatar($event)"
                        />
                        {{ t('worldView.followAvatar') }}
                    </label>
                    <!--
                        World Residents: people who live in the active World and stroll
                        around where they were added. Talk is the T key; Add/Remove the R key.
                    -->
                    <div v-if="hasLocalAvatar && residentInteractionState" class="world-view-residents">
                        <button
                            v-if="residentInteractionState.canTalk"
                            type="button"
                            class="action-btn"
                            :title="t('worldView.askTheResidentNextTo')"
                            @click="talkToResident"
                        >{{ t('worldView.talk') }}</button>
                        <button
                            v-if="residentInteractionState.canAdd || residentInteractionState.canRemove"
                            type="button"
                            class="action-btn"
                            :title="t(residentInteractionState.canRemove ? 'worldView.removeResidentHint' : 'worldView.addResidentHint')"
                            @click="toggleResidentHere"
                        >{{ t(residentInteractionState.canRemove ? 'worldView.removeResident' : 'worldView.addResident') }}</button>
                        <span v-else class="form-hint form-hint--neutral">
                            {{ residentRefusalLabel(residentInteractionState.refusal) }}
                        </span>
                    </div>
                    <p v-if="!hasLocalAvatar" class="form-hint form-hint--neutral">
                        {{ t('worldView.logInAndCreateAn') }}
                    </p>
                    <!--
                        Fixed offsets around the avatar; clicking the active one returns to Free.
                        Local only.
                    -->
                    <div v-if="hasLocalAvatar" class="world-view-camera-perspective">
                        <span class="world-view-camera-perspective-label">{{ t('worldView.camera') }}</span>
                        <div class="world-view-camera-perspective-buttons">
                            <button
                                type="button"
                                class="action-btn"
                                :class="{ 'action-btn--active': !cameraPerspective }"
                                @click="setCameraPerspective(null)"
                            >{{ t('worldView.free') }}</button>
                            <button
                                type="button"
                                class="action-btn"
                                :class="{ 'action-btn--active': cameraPerspective === CameraPerspective.FIRST_PERSON }"
                                @click="setCameraPerspective(CameraPerspective.FIRST_PERSON)"
                            >{{ t('worldView.firstPerson') }}</button>
                            <button
                                type="button"
                                class="action-btn"
                                :class="{ 'action-btn--active': cameraPerspective === CameraPerspective.THIRD_PERSON }"
                                @click="setCameraPerspective(CameraPerspective.THIRD_PERSON)"
                            >{{ t('worldView.thirdPerson') }}</button>
                            <button
                                type="button"
                                class="action-btn"
                                :class="{ 'action-btn--active': cameraPerspective === CameraPerspective.BIRD_EYE }"
                                @click="setCameraPerspective(CameraPerspective.BIRD_EYE)"
                            >{{ t('worldView.birdSEye') }}</button>
                        </div>
                    </div>
                </div>`;
