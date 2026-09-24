

// Local avatar controls: visibility, control mode, follow, camera perspective,
// interactions, remote avatar visibility and avatar keyboard input.
export function useAvatarControls({
    avatarControlMode, blurCheckbox, cameraPerspective, followAvatar, followedRemoteAvatarId, refreshSpatialUI,
    session, showMyAvatar, showOtherAvatars
}) {
    function toggleShowMyAvatar(event) {
        showMyAvatar.value = !showMyAvatar.value;
        session.setLocalAvatarVisible(showMyAvatar.value);
        blurCheckbox(event);
    }

    // An explicit toggle, never implied by clicks or focus, so typing never walks
    // the avatar away. Turning it off releases held keys.
    function toggleAvatarControlMode(event) {
        avatarControlMode.value = !avatarControlMode.value;
        session.setAvatarControlMode(avatarControlMode.value);
        blurCheckbox(event);
    }

    function toggleFollowAvatar(event) {
        followAvatar.value = !followAvatar.value;
        session.setFollowAvatar(followAvatar.value);
        // Following your own avatar and a remote one are mutually exclusive.
        if (followAvatar.value) {
            followedRemoteAvatarId.value = null;
        }
        blurCheckbox(event);
    }

    // `perspective` is a CameraPerspective or null ("Free"); the session decides.
    function setCameraPerspective(perspective) {
        const next = cameraPerspective.value === perspective ? null : perspective;
        if (session.setCameraPerspective(next)) {
            cameraPerspective.value = next;
        }
    }

    // Follows the targeted REMOTE avatar, a separate capability from following your
    // own.
    function followAvatarFromPanel(avatarId) {
        if (session.followAvatarId(avatarId)) {
            followedRemoteAvatarId.value = avatarId;
            followAvatar.value = false;
        }
    }

    function stopFollowingAvatarFromPanel() {
        session.stopFollowingRemoteAvatar();
        followedRemoteAvatarId.value = null;
    }

    // The session owns every decision (docs/Principles.md, "Observation Does Not
    // Imply Authority, And Interaction Does Not Imply Control").
    function performAvatarInteraction(kind) {
        session.performAvatarInteraction(kind);
    }

    // Opens the same Avatar Info panel as clicking the avatar in the viewport.
    function selectNearbyAvatar(avatarId) {
        session.targetAvatar(avatarId);
        refreshSpatialUI();
    }

    function toggleShowOtherAvatars(event) {
        showOtherAvatars.value = !showOtherAvatars.value;
        session.setRemoteAvatarsVisible(showOtherAvatars.value);
        blurCheckbox(event);
    }

    // -----------------------------------------------------------------
    // Avatar movement keys
    // -----------------------------------------------------------------
    //
    // Only while Avatar Control Mode is on, and only after text inputs have been
    // excluded, so fields never fight the avatar for keys.
    function onAvatarKeyDown(event) {
        if (!avatarControlMode.value) {
            return false;
        }
        if (session.avatarKeyDown(event.key)) {
            event.preventDefault();
            return true;
        }
        return false;
    }

    function onAvatarKeyUp(event) {
        // Always forwarded, so a captured key still releases after the mode changes or
        // focus moves.
        if (session.avatarKeyUp(event.key)) {
            event.preventDefault();
        }
    }

    // A blur can swallow a keyup, so release every held key. The mode itself stays
    // on: losing focus is not the user turning it off.
    function onWindowBlur() {
        session.releaseAvatarMovementKeys();
    }

    return {
        toggleShowMyAvatar, toggleAvatarControlMode, toggleFollowAvatar, setCameraPerspective,
        followAvatarFromPanel, stopFollowingAvatarFromPanel, performAvatarInteraction, selectNearbyAvatar,
        toggleShowOtherAvatars, onAvatarKeyDown, onAvatarKeyUp, onWindowBlur
    };
}
