// World view template: the Avatar section's client rendering preferences and camera perspective.
// It renders in WorldView's scope, so it uses the names its setup() returns.
export const avatarSectionTemplate = `<!--
                    Client rendering preferences. Control/Follow are explicit toggles, never
                    implied by focus. Show Other Avatars does not require an avatar of your own.
                -->
                <div class="world-view-section world-view-section--avatar">
                    <h4>Avatar</h4>
                    <label class="world-view-avatar-toggle">
                        <input
                            type="checkbox"
                            :checked="showMyAvatar"
                            :disabled="!hasLocalAvatar"
                            @change="toggleShowMyAvatar($event)"
                        />
                        Show My Avatar
                    </label>
                    <label class="world-view-avatar-toggle">
                        <input
                            type="checkbox"
                            :checked="showOtherAvatars"
                            @change="toggleShowOtherAvatars($event)"
                        />
                        Show Other Avatars
                    </label>
                    <!--
                        Diagnostics appear only here, never on an avatar: rendering presence and
                        trusting it stay separate.
                    -->
                    <p v-if="showOtherAvatars && remoteAvatarDiagnostics.total > 0" class="world-view-avatar-diagnostics">
                        Other Avatars: {{ remoteAvatarDiagnostics.total }}
                        <span class="world-view-avatar-diagnostics-detail">
                            (<template v-if="remoteAvatarDiagnostics.trusted">{{ remoteAvatarDiagnostics.trusted }} trusted</template><template v-if="remoteAvatarDiagnostics.stale">{{ remoteAvatarDiagnostics.trusted ? ', ' : '' }}{{ remoteAvatarDiagnostics.stale }} stale</template><template v-if="remoteAvatarDiagnostics.conflicting">{{ (remoteAvatarDiagnostics.trusted || remoteAvatarDiagnostics.stale) ? ', ' : '' }}{{ remoteAvatarDiagnostics.conflicting }} conflicting</template><template v-if="remoteAvatarDiagnostics.unavailable">{{ (remoteAvatarDiagnostics.trusted || remoteAvatarDiagnostics.stale || remoteAvatarDiagnostics.conflicting) ? ', ' : '' }}{{ remoteAvatarDiagnostics.unavailable }} unavailable</template>)
                        </span>
                    </p>
                    <!-- A local geometric fact, never announced; shown with Show Other Avatars. -->
                    <NearbyAvatarsPanel
                        v-if="showOtherAvatars"
                        :entries="nearbyAvatars"
                        @select="selectNearbyAvatar"
                    />
                    <label class="world-view-avatar-toggle">
                        <input
                            type="checkbox"
                            :checked="avatarControlMode"
                            :disabled="!hasLocalAvatar"
                            @change="toggleAvatarControlMode($event)"
                        />
                        Control My Avatar (WASD, Shift, Space)
                    </label>
                    <label class="world-view-avatar-toggle">
                        <input
                            type="checkbox"
                            :checked="followAvatar"
                            :disabled="!hasLocalAvatar"
                            @change="toggleFollowAvatar($event)"
                        />
                        Follow Avatar
                    </label>
                    <p v-if="!hasLocalAvatar" class="form-hint form-hint--neutral">
                        Log in and create an avatar (My Avatar) to appear here.
                    </p>
                    <!--
                        Fixed offsets around the avatar; clicking the active one returns to Free.
                        Local only.
                    -->
                    <div class="world-view-camera-perspective">
                        <span class="world-view-camera-perspective-label">Camera</span>
                        <div class="world-view-camera-perspective-buttons">
                            <button
                                type="button"
                                class="action-btn"
                                :class="{ 'action-btn--active': !cameraPerspective }"
                                :disabled="!hasLocalAvatar"
                                @click="setCameraPerspective(null)"
                            >Free</button>
                            <button
                                type="button"
                                class="action-btn"
                                :class="{ 'action-btn--active': cameraPerspective === CameraPerspective.FIRST_PERSON }"
                                :disabled="!hasLocalAvatar"
                                @click="setCameraPerspective(CameraPerspective.FIRST_PERSON)"
                            >First Person</button>
                            <button
                                type="button"
                                class="action-btn"
                                :class="{ 'action-btn--active': cameraPerspective === CameraPerspective.THIRD_PERSON }"
                                :disabled="!hasLocalAvatar"
                                @click="setCameraPerspective(CameraPerspective.THIRD_PERSON)"
                            >Third Person</button>
                            <button
                                type="button"
                                class="action-btn"
                                :class="{ 'action-btn--active': cameraPerspective === CameraPerspective.BIRD_EYE }"
                                :disabled="!hasLocalAvatar"
                                @click="setCameraPerspective(CameraPerspective.BIRD_EYE)"
                            >Bird's-Eye</button>
                        </div>
                    </div>
                </div>`;
