import { PresenceSyncService } from '../PresenceSyncService.js';
import { LocalPresenceStore } from '../LocalPresenceStore.js';
import { PresenceTrustBoundary } from '../PresenceTrustBoundary.js';
import { RemoteAvatarRegistry } from '../RemoteAvatarRegistry.js';
import { DEFAULT_AVATAR_TEMPLATE_ID } from '../../core/AvatarProfile.js';
import { AvatarProfileSyncService } from '../AvatarProfileSyncService.js';
import { LocalAvatarProfileStore } from '../LocalAvatarProfileStore.js';
import { AvatarProfileTrustBoundary } from '../AvatarProfileTrustBoundary.js';
import { RemoteAvatarAppearanceRegistry } from '../RemoteAvatarAppearanceRegistry.js';
import { AvatarInteractionSyncService } from '../AvatarInteractionSyncService.js';
import { AvatarInteractionTrustBoundary } from '../AvatarInteractionTrustBoundary.js';
import { summarizePresenceDiagnostics } from '../../core/PresenceDiagnosticsSummary.js';
import { computeNearbyAvatars } from '../../core/AvatarProximity.js';
import { AvatarInteractionState } from '../spatial-state/AvatarInteractionState.js';
import { SpatialSelectionState } from '../spatial-state/SpatialSelectionState.js';
import { isValidInteractionKind, AvatarInteractionKind } from '../../core/AvatarInteractionKind.js';
import { canPerformInteraction } from '../../core/AvatarInteractionCooldown.js';
import { toAvatarInteractionAdvertisement } from '../../core/AvatarInteractionAdvertisement.js';
import { signAvatarInteractionAdvertisement } from '../AvatarInteractionSigning.js';
import { toAvatarProfileAdvertisement } from '../../core/AvatarProfileAdvertisement.js';
import { signAvatarProfileAdvertisement } from '../AvatarProfileSigning.js';
import { computeCameraFraming, isValidCameraPerspective } from '../../core/CameraPerspective.js';
import { computeFacingYawDegrees } from '../../core/AvatarFacing.js';

// Default radius for getNearbyAvatars(). Separate from NEARBY_RADIUS: that
// asks "is a document at this camera position", this asks "who is close
// enough to interact with".
const DEFAULT_NEARBY_AVATAR_RADIUS = 15;

// How long a local GREET/WAVE/POINT gesture plays before returning to NONE.
// A gesture is a momentary beat, never a mode the user must turn off.
const GESTURE_DURATION_MS = 1800;

// WorldNavigationSession methods for avatar presence and interaction: remote
// avatars and their profiles and gestures, nearby avatars, local gestures and
// their publication, following an avatar, camera perspectives and facing.
export const avatarPresenceMethods = {
    // -----------------------------------------------------------------
    // Remote Avatar Presence
    // -----------------------------------------------------------------
    //
    // Independent of hasLocalAvatar(): a logged-out viewer still sees other
    // avatars (see docs/Principles.md, "Watching Presence Never Requires Having
    // One"). PresenceSyncService owns transport and ingestion;
    // RemoteAvatarRegistry owns reconciliation and interpolation. This method
    // only decides when pull()/sync()/tick() run (once per frame) and never
    // touches the render facade itself.
    _setupRemoteAvatars() {
        if (!this._presenceBroadcastProvider) {
            return;
        }
        const localAvatarId = this._avatarPresenceSession ? this._avatarPresenceSession.current.avatarId : null;
        // Each trust boundary gets its own instance with the same `isBlocked`
        // predicate: presence, profile and interaction authority stay independently
        // established.
        const isBlocked = this._isBlocked || (() => false);
        this._presenceSyncService = new PresenceSyncService(this._presenceBroadcastProvider, {
            localAvatarId,
            store: new LocalPresenceStore({ trustBoundary: new PresenceTrustBoundary({ isBlocked }) })
        });

        // Placeholder template+appearance for remote avatars until a profile
        // arrives, resolved here rather than in the renderer (see
        // docs/Principles.md, "A Template Is A Closed Vocabulary, Not An Asset
        // Loader"). Without a registry, presence is still synced but produces no
        // visual.
        let defaultTemplate = null;
        let defaultAppearance = null;
        if (this._avatarTemplateRegistry) {
            defaultTemplate = this._avatarTemplateRegistry.get(DEFAULT_AVATAR_TEMPLATE_ID);
            defaultAppearance = defaultTemplate ? defaultTemplate.defaultAppearance : null;
        }

        // Without a profile provider, remote avatars keep the placeholder. See
        // docs/Principles.md, "Appearance And Position Are Different Lifecycles,
        // Never One Message."
        if (this._avatarProfileBroadcastProvider) {
            this._avatarProfileSyncService = new AvatarProfileSyncService(this._avatarProfileBroadcastProvider, {
                localAvatarId,
                store: new LocalAvatarProfileStore({ trustBoundary: new AvatarProfileTrustBoundary({ isBlocked }) })
            });
            this._remoteAvatarAppearanceRegistry = new RemoteAvatarAppearanceRegistry(
                this._session, this._avatarProfileSyncService, this._avatarTemplateRegistry,
                { defaultTemplate, defaultAppearance }
            );
        }

        // Without an interaction provider, received gestures are never played. See
        // docs/Principles.md, "Presence Describes An Avatar's Current State;
        // Interaction Describes An Event That Happened."
        if (this._avatarInteractionBroadcastProvider) {
            this._avatarInteractionSyncService = new AvatarInteractionSyncService(this._avatarInteractionBroadcastProvider, {
                localAvatarId,
                trustBoundary: new AvatarInteractionTrustBoundary({ isBlocked })
            });
        }

        this._remoteAvatarRegistry = new RemoteAvatarRegistry(this._session, {
            defaultTemplate, defaultAppearance,
            appearanceResolver: this._remoteAvatarAppearanceRegistry
        });
        if (typeof this._session.setRemoteAvatarsVisible === 'function') {
            this._session.setRemoteAvatarsVisible(this._remoteAvatarsVisible);
        }

        if (typeof this._session.onAnimationFrame === 'function') {
            this._remoteAvatarFrameSubscription = this._session.onAnimationFrame(() => {
                const now = Date.now();
                // Drain profiles before presence sync creates new visuals. The two
                // transports race, so a profile that arrived this frame must be in
                // LocalAvatarProfileStore before RemoteAvatarRegistry.sync() resolves a new
                // avatar's appearance, or it renders the placeholder needlessly.
                if (this._avatarProfileSyncService) {
                    this._avatarProfileSyncService.pull();
                }
                const knownPresences = this._presenceSyncService.pull(now);
                this._remoteAvatarRegistry.sync(knownPresences, now);
                this._remoteAvatarRegistry.tick(now);
                // Both reuse this frame's knownPresences; no extra query.
                this._pruneAvatarInteractionIfGone(knownPresences);
                this._followRemoteAvatarIfEnabled(now);
                // After sync() settles which avatars exist, apply changed profileRevisions
                // to avatars that already had a visual.
                if (this._avatarProfileSyncService) {
                    this._remoteAvatarAppearanceRegistry.sync(this._remoteAvatarRegistry.knownAvatarIds());
                }
                // Plays newly accepted interaction events, then expires finished ones. An
                // event is rendered once and forgotten, never a "known list".
                if (this._avatarInteractionSyncService) {
                    for (const event of this._avatarInteractionSyncService.pull()) {
                        this._applyRemoteAvatarInteraction(event, now);
                    }
                }
                this._expireRemoteAvatarGestures(now);
            });
        }
    },

    // Plays one accepted interaction on the sender's own avatar, keyed by
    // `event.avatarId`, never `targetAvatarId`: a wave is rendered on the
    // waver (see core/AvatarInteractionAdvertisement.js). No-op if the sender
    // isn't a known remote avatar or the facade lacks gestures.
    _applyRemoteAvatarInteraction(event, now) {
        if (!this._remoteAvatarRegistry || !this._remoteAvatarRegistry.has(event.avatarId)) {
            return;
        }
        if (!this._session || typeof this._session.setRemoteAvatarGesture !== 'function') {
            return;
        }
        this._session.setRemoteAvatarGesture(event.avatarId, event.kind);
        this._remoteAvatarGestureExpiry.set(event.avatarId, now + GESTURE_DURATION_MS);
    },

    // Clears a received gesture after GESTURE_DURATION_MS, with no stop message
    // from the sender (see docs/Principles.md, "Presence Describes An Avatar's
    // Current State; Interaction Describes An Event That Happened"). Same
    // duration as a local gesture, so everyone sees it for the same time.
    _expireRemoteAvatarGestures(now) {
        if (this._remoteAvatarGestureExpiry.size === 0) {
            return;
        }
        if (!this._session || typeof this._session.setRemoteAvatarGesture !== 'function') {
            return;
        }
        for (const [avatarId, expiresAt] of this._remoteAvatarGestureExpiry) {
            if (now >= expiresAt) {
                this._remoteAvatarGestureExpiry.delete(avatarId);
                this._session.setRemoteAvatarGesture(avatarId, null);
            }
        }
    },

    // How many OTHER avatars this replica currently believes are
    // present/stale (never counts the local avatar) — a debug/UI
    // surface, not something anything internal reads.
    getKnownRemoteAvatarCount() {
        return this._remoteAvatarRegistry ? this._remoteAvatarRegistry.size : 0;
    },

    // Trusted/stale/conflicting/unavailable counts over the known-presences
    // list. Reads listKnownPresences(), never pull(), so the UI never drains the
    // per-frame loop's inbox.
    getRemoteAvatarDiagnostics() {
        if (!this._presenceSyncService) {
            return summarizePresenceDiagnostics([]);
        }
        return summarizePresenceDiagnostics(this._presenceSyncService.listKnownPresences(Date.now()));
    },

    // "Who is near me?" as a derived, local fact (see docs/Principles.md,
    // "Proximity Is Derived, Never Announced"), over the same trusted list that
    // drives rendering. Requires a local avatar; returns [] otherwise.
    getNearbyAvatars(radius = DEFAULT_NEARBY_AVATAR_RADIUS) {
        if (!this._avatarPresenceSession || !this._presenceSyncService) {
            return [];
        }
        const localPosition = this._avatarPresenceSession.current.position;
        const knownPresences = this._presenceSyncService.listKnownPresences(Date.now());
        return computeNearbyAvatars({ localPosition, knownPresences, radius });
    },

    // The one place a friendly name is resolved for any avatarId. Falls back in
    // order: displayName, ownerIdentity, avatarId, then "You" for the local
    // avatar. Never throws or returns an empty string.
    getAvatarDisplayName(avatarId) {
        if (this.isLocalAvatarId(avatarId)) {
            const profile = this._avatarProfileUseCase ? this._avatarProfileUseCase.getProfile() : null;
            return (profile && (profile.displayName || profile.ownerIdentity)) || 'You';
        }
        const knownProfile = this._avatarProfileSyncService ? this._avatarProfileSyncService.getKnownProfile(avatarId) : null;
        if (knownProfile && knownProfile.displayName) {
            return knownProfile.displayName;
        }
        const known = this._presenceSyncService ? this._presenceSyncService.listKnownPresences(Date.now()) : [];
        const entry = known.find((k) => k.advertisement.avatarId === avatarId);
        return (entry && entry.advertisement.ownerIdentity) || avatarId;
    },

    // Targets `avatarId` without a screen-space pick, for the Nearby Avatars
    // panel; same outcome as pick()'s avatar branch (see docs/Principles.md,
    // "Avatars Are Never Document Selection"). Unlike a raycast hit, a UI id can
    // be stale, so it must be known first. Returns the new state, or null.
    targetAvatar(avatarId) {
        const known = this.isLocalAvatarId(avatarId)
            || Boolean(this._remoteAvatarRegistry && this._remoteAvatarRegistry.has(avatarId));
        if (!known) {
            return null;
        }
        this._setAvatarInteraction(AvatarInteractionState.avatar(avatarId));
        this._setSpatialSelection(SpatialSelectionState.empty());
        if (this._session) {
            this._session.clearSelection();
            this._session.clearHover();
        }
        this._refreshGizmo();
        return this._avatarInteraction;
    },

    // GREET/WAVE/POINT at the current target: a local, presentation-only
    // gesture (see docs/Principles.md, "Observation Does Not Imply Authority,
    // And Interaction Does Not Imply Control"). It never touches AvatarPresence;
    // it is rendered on the performer's own avatar.
    //
    // Requires a remote target and is rate-limited by
    // core/AvatarInteractionCooldown.js. Returns true when accepted, false when
    // there's no target, the kind is invalid, or it's on cooldown.
    performAvatarInteraction(kind) {
        if (this._avatarInteraction.isEmpty || this.isLocalAvatarId(this._avatarInteraction.avatarId)) {
            return false;
        }
        if (!isValidInteractionKind(kind) || kind === AvatarInteractionKind.NONE) {
            return false;
        }
        const now = Date.now();
        if (!canPerformInteraction(this._lastInteractionPerformedAt, now)) {
            return false;
        }
        const targetAvatarId = this._avatarInteraction.avatarId;
        this._lastInteractionPerformedAt = now;
        this._setAvatarInteraction(this._avatarInteraction.withInteraction(kind, now));
        // Publishing never changes the return value: a gesture that fails to
        // publish still happened locally.
        this._publishAvatarInteraction(kind, targetAvatarId, now);
        return true;
    },

    // The one place a gesture is signed and sent. Uses the same visibility gate
    // as presence (see docs/Principles.md, "Presence And Profile Share One
    // Publication Gate"): HIDDEN/empty-FRIENDS never reaches the transport. One
    // fire-and-forget publish, never republished; a late joiner shouldn't catch
    // up on a missed gesture.
    _publishAvatarInteraction(kind, targetAvatarId, now) {
        if (!this._avatarInteractionSyncService || !this._avatarPresenceSession) {
            return;
        }
        const canAdvertise = this._presenceVisibilityUseCase
            ? this._presenceVisibilityUseCase.getPolicy().shouldAdvertise(this._hasFriendContext())
            : true;
        if (!canAdvertise) {
            return;
        }
        this._localInteractionSequence += 1;
        const presence = this._avatarPresenceSession.current;
        const advertisement = toAvatarInteractionAdvertisement({
            avatarId: presence.avatarId,
            ownerIdentity: presence.ownerIdentity,
            kind,
            targetAvatarId,
            sequence: this._localInteractionSequence,
            timestamp: now
        });
        this._avatarInteractionSyncService.publish(signAvatarInteractionAdvertisement(advertisement, this._identityProvider));
    },

    // A pure client rendering preference, exactly like
    // isLocalAvatarVisible/setLocalAvatarVisible — never touches
    // presence sync, the known-remote-avatar set, or anything
    // persisted; only which already-built visuals are actually in the
    // scene.
    isRemoteAvatarsVisible() {
        return this._remoteAvatarsVisible;
    },

    setRemoteAvatarsVisible(visible) {
        this._remoteAvatarsVisible = Boolean(visible);
        if (this._session && typeof this._session.setRemoteAvatarsVisible === 'function') {
            this._session.setRemoteAvatarsVisible(this._remoteAvatarsVisible);
        }
    },

    // The one place a profile advertisement is signed and sent: on an explicit
    // edit (immediately) and from the periodic republish tick. When
    // avatarProfileVisibilityUseCase is wired, profile uses its own gate,
    // independent of presence (see docs/Principles.md, "Profile Gets Its Own
    // Publication Gate, Superseding The Shared One"); otherwise it falls back to
    // the shared gate.
    _publishLocalAvatarProfile(profile, now) {
        this._lastProfilePublishAt = now;
        if (!this._avatarProfileSyncService) {
            return;
        }
        const canAdvertise = this._avatarProfileVisibilityUseCase
            ? this._avatarProfileVisibilityUseCase.getPolicy().shouldAdvertise(this._hasFriendContext())
            : (this._presenceVisibilityUseCase ? this._presenceVisibilityUseCase.getPolicy().shouldAdvertise(this._hasFriendContext()) : true);
        if (!canAdvertise) {
            return;
        }
        const advertisement = toAvatarProfileAdvertisement(profile);
        this._avatarProfileSyncService.publish(signAvatarProfileAdvertisement(advertisement, this._identityProvider));
    },

    // The one place `_hasFriend` becomes the `{ hasFriend }` context both
    // visibility policies accept. Called fresh every time, never cached.
    _hasFriendContext() {
        return { hasFriend: this._hasFriend ? Boolean(this._hasFriend()) : false };
    },

    // Shifts the camera by the avatar's movement delta via moveCamera() only
    // (see docs/Principles.md, "Following The Avatar Never Redefines What The
    // Camera Is Looking At"), so following never changes the focused/active
    // document or forks anything. Always tracks the position; only moves the
    // camera when follow is enabled.
    _followAvatarIfEnabled(presence) {
        const previous = this._lastAvatarFollowPosition;
        this._lastAvatarFollowPosition = presence.position;
        // A selected Camera Perspective takes over on every presence update with a
        // fixed offset from the avatar, superseding plain follow (see
        // core/CameraPerspective.js and docs/Principles.md, "Camera Perspective
        // Determines An Offset; It Never Replaces The Camera Machinery"). Applies
        // whether or not `_followAvatarEnabled` is set.
        if (this._cameraPerspective && this._spatialCameraController) {
            this._applyCameraPerspectiveFraming(presence.position, presence.rotation ? presence.rotation.y : null);
            return;
        }
        if (!this._followAvatarEnabled || !this._spatialCameraController || !previous) {
            return;
        }
        const delta = {
            x: presence.position.x - previous.x,
            y: presence.position.y - previous.y,
            z: presence.position.z - previous.z
        };
        if (delta.x === 0 && delta.y === 0 && delta.z === 0) {
            return;
        }
        this._spatialCameraController.moveCamera(delta);
    },

    // Applied instantly each update rather than through _beginCameraFocus()'s
    // one-shot glide; per-update framing is already smooth tracking.
    _applyCameraPerspectiveFraming(position, headingDegrees) {
        const framing = computeCameraFraming(this._cameraPerspective, position, headingDegrees);
        if (framing) {
            this._spatialCameraController.applyFraming(framing);
        }
    },

    // Whether the camera currently follows the local avatar's
    // movement — see _followAvatarIfEnabled above. A pure client
    // camera preference, exactly like "Show My Avatar": never touches
    // AvatarProfile, AvatarPresence, _focusedDocumentId, or
    // _activeDocumentId.
    isFollowingAvatar() {
        return this._followAvatarEnabled;
    },

    setFollowAvatar(enabled) {
        this._followAvatarEnabled = Boolean(enabled);
        if (this._followAvatarEnabled && this._avatarPresenceSession) {
            // Re-anchor to the CURRENT position rather than whatever
            // was last recorded while follow was off — otherwise the
            // first movement after re-enabling follow would yank the
            // camera through every step the avatar took while
            // unobserved.
            this._lastAvatarFollowPosition = this._avatarPresenceSession.current.position;
            // There is one camera: following your own avatar and a remote one are
            // mutually exclusive. See followAvatarId().
            this._stopFollowingRemoteAvatarInternal();
        }
    },

    // The current Camera Perspective, or `null` for the free/orbit camera.
    getCameraPerspective() {
        return this._cameraPerspective;
    },

    // Sets the Camera Perspective (a core/CameraPerspective.js value), or clears
    // it with `null`. Anything else is rejected (returns false).
    //
    // Turning one on re-frames immediately, so choosing "Bird's-Eye" while
    // standing still moves the camera. Turning it off
    // does NOT snap the camera anywhere; the orbit camera resumes from where the
    // perspective left it. Independent of
    // `_followAvatarEnabled`, but a set perspective always wins.
    setCameraPerspective(perspective) {
        if (perspective !== null && !isValidCameraPerspective(perspective)) {
            return false;
        }
        this._cameraPerspective = perspective;
        if (perspective && this._avatarPresenceSession) {
            const presence = this._avatarPresenceSession.current;
            this._applyCameraPerspectiveFraming(presence.position, presence.rotation ? presence.rotation.y : null);
        }
        return true;
    },

    // Following a remote avatar. A separate surface from setFollowAvatar/
    // isFollowingAvatar rather than a generalized replacement; both follow
    // moveCamera()-only (see docs/Principles.md, "Following The Avatar Never
    // Redefines What The Camera Is Looking At").
    getFollowedRemoteAvatarId() {
        return this._followedRemoteAvatarId;
    },

    // Starts following avatarId's camera position. A no-op (returns
    // false) if avatarId isn't currently a known remote avatar — most
    // commonly because it's the LOCAL avatar (use setFollowAvatar for
    // that) or because its presence already expired. Turns OFF
    // local-avatar-follow, for the same one-camera reason
    // setFollowAvatar turns this off.
    followAvatarId(avatarId) {
        if (!this._remoteAvatarRegistry || !this._remoteAvatarRegistry.has(avatarId)) {
            return false;
        }
        this._followedRemoteAvatarId = avatarId;
        this._lastFollowedRemotePosition = this._remoteAvatarRegistry.currentPosition(avatarId, Date.now());
        this._followAvatarEnabled = false;
        return true;
    },

    stopFollowingRemoteAvatar() {
        this._stopFollowingRemoteAvatarInternal();
    },

    _stopFollowingRemoteAvatarInternal() {
        this._followedRemoteAvatarId = null;
        this._lastFollowedRemotePosition = null;
    },

    // Same delta-only camera shift _followAvatarIfEnabled uses for the
    // local avatar, driven from the SAME interpolated position
    // RemoteAvatarRegistry.tick() already pushes to the renderer every
    // frame — following sees exactly what's on screen, never a
    // separately-computed value. Gracefully stops following (rather
    // than throwing or camera-jumping) the moment the target avatar is
    // no longer known — e.g. its presence expired.
    _followRemoteAvatarIfEnabled(now) {
        if (!this._followedRemoteAvatarId || !this._spatialCameraController || !this._remoteAvatarRegistry) {
            return;
        }
        if (!this._remoteAvatarRegistry.has(this._followedRemoteAvatarId)) {
            this._stopFollowingRemoteAvatarInternal();
            return;
        }
        const position = this._remoteAvatarRegistry.currentPosition(this._followedRemoteAvatarId, now);
        const previous = this._lastFollowedRemotePosition;
        this._lastFollowedRemotePosition = position;
        if (!previous || !position) {
            return;
        }
        const delta = {
            x: position.x - previous.x,
            y: position.y - previous.y,
            z: position.z - previous.z
        };
        if (delta.x === 0 && delta.y === 0 && delta.z === 0) {
            return;
        }
        this._spatialCameraController.moveCamera(delta);
    },

    // When a targeted avatar's presence expires, the interaction target and any
    // follow clear rather than point at nothing. `knownPresences` is this
    // frame's pull()/sync() result; no extra query.
    _pruneAvatarInteractionIfGone(knownPresences) {
        if (this._avatarInteraction.isEmpty || this.isLocalAvatarId(this._avatarInteraction.avatarId)) {
            return;
        }
        const stillKnown = knownPresences.some((k) => k.advertisement.avatarId === this._avatarInteraction.avatarId);
        if (!stillKnown) {
            this._setAvatarInteraction(AvatarInteractionState.empty());
        }
    },

    // Runs every frame after movement: expires a finished gesture, then pushes
    // gesture kind and facing override to the render facade. Local presentation
    // only (see core/AvatarGesturePoseOffsets.js, core/AvatarFacing.js).
    _updateLocalAvatarInteractionPresentation(now) {
        if (!this._session || typeof this._session.setLocalAvatarGesture !== 'function') {
            return;
        }
        if (this._avatarInteraction.isGesturing
            && now - this._avatarInteraction.interactionStartedAt >= GESTURE_DURATION_MS) {
            this._setAvatarInteraction(this._avatarInteraction.withInteraction(AvatarInteractionKind.NONE, null));
        }
        this._session.setLocalAvatarGesture(this._avatarInteraction.isGesturing ? this._avatarInteraction.interaction : null);
        this._applyAvatarFacing(now);
    },

    // See docs/Principles.md, "A Gesture Is Presentation, Never Presence": faces
    // the local avatar toward its interaction target, but only while the player
    // isn't steering; active input always wins.
    _applyAvatarFacing(now) {
        if (!this._session || typeof this._session.setLocalAvatarFacing !== 'function' || !this._avatarPresenceSession) {
            return;
        }
        const targetPosition = this._facingTargetPosition(now);
        const isMoving = Boolean(this._avatarMovementController && this._avatarMovementController.hasMovementInput());
        if (!targetPosition || isMoving) {
            this._session.setLocalAvatarFacing(null);
            return;
        }
        const localPosition = this._avatarPresenceSession.current.position;
        this._session.setLocalAvatarFacing(computeFacingYawDegrees(localPosition, targetPosition));
    },

    // The CURRENT interaction target's position, or null when there is
    // no target, the target is the local avatar itself (facing
    // yourself is meaningless), or the target's presence isn't known
    // to `_remoteAvatarRegistry` (e.g. it expired this same frame,
    // before `_pruneAvatarInteractionIfGone` got to it) — gracefully
    // "no facing override" in every case, never a thrown error.
    _facingTargetPosition(now) {
        if (this._avatarInteraction.isEmpty || this.isLocalAvatarId(this._avatarInteraction.avatarId)) {
            return null;
        }
        return this._remoteAvatarRegistry
            ? this._remoteAvatarRegistry.currentPosition(this._avatarInteraction.avatarId, now)
            : null;
    },
};
