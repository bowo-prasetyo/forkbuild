import { Position } from '../../core/Position.js';
import { DEFAULT_WORLD_SEED } from '../../core/TerrainHeightField.js';
import { distanceBetween } from '../../core/SpatialQuery.js';
import { DEFAULT_AVATAR_TEMPLATE_ID } from '../../core/AvatarProfile.js';
import { STREAMING_RADIUS } from './constants.js';

// WorldNavigationSession read-only state: selection, hover, inspection,
// avatar and camera positions, the spatial state summary and loaded documents.

const NAVIGATION_RADIUS = 80;

export const stateQueryMethods = {
    getSpatialSelection() {
        return this._spatialSelection;
    },

    getSpatialHover() {
        return this._spatialHover;
    },

    getSpatialInspection() {
        return this._spatialInspection;
    },

    // The raw AvatarInteractionState, a separate slice from the spatial
    // selection (see docs/Principles.md, "Avatars Are Never Document
    // Selection").
    getAvatarInteraction() {
        return this._avatarInteraction;
    },

    // Read-only presentation data for the current avatar target, for
    // ui/components/AvatarInfoPanel.js, from the local avatar's profile/presence
    // or a remote avatar's known presence (see docs/Principles.md, "Looking At
    // Something Is Never The Same As Acting On It"). Null with no target or
    // when the target's presence expired.
    getAvatarInfo() {
        if (!this._avatarInteraction || this._avatarInteraction.isEmpty) {
            return null;
        }
        const avatarId = this._avatarInteraction.avatarId;
        return this.isLocalAvatarId(avatarId)
            ? this._inspectLocalAvatar()
            : this._inspectRemoteAvatar(avatarId);
    },

    // Whether `avatarId` is THIS session's own local avatar — never a
    // trust/authorization check, purely "which of the two data sources
    // getAvatarInfo() should read from."
    isLocalAvatarId(avatarId) {
        return Boolean(this._avatarPresenceSession) && this._avatarPresenceSession.current.avatarId === avatarId;
    },

    // A lighter-weight alternative to getSpatialState().cameraPosition
    // for callers (getAvatarInfo(), follow-avatar) that only need the
    // camera's position, not a full findVisibleDocuments() pass.
    getCameraPosition() {
        if (!this._spatialCameraController) {
            return null;
        }
        const state = this._spatialCameraController.getSpatialCameraState();
        return { x: state.position.x, y: state.position.y, z: state.position.z };
    },

    // The local avatar's live world position, WorldSpatialContextService's
    // primary "where am I" signal (see docs/Principles.md, "Exploration Is
    // Derived From Place, Not Stored As Place"). Null without an
    // avatarPresenceSession; callers fall back to getCameraPosition().
    getAvatarPosition() {
        if (!this._avatarPresenceSession) {
            return null;
        }
        const { x, y, z } = this._avatarPresenceSession.current.position;
        return { x, y, z };
    },

    // The one live seed (DEFAULT_WORLD_SEED), so spatial context never invents
    // its own.
    getWorldSeed() {
        return DEFAULT_WORLD_SEED;
    },

    _inspectLocalAvatar() {
        if (!this._avatarProfileUseCase || !this._avatarPresenceSession) {
            return null;
        }
        const { profile, template } = this._avatarProfileUseCase.getEffectiveAvatar();
        const presence = this._avatarPresenceSession.current;
        const cameraPosition = this.getCameraPosition();
        return {
            avatarId: presence.avatarId,
            isLocal: true,
            displayName: profile.displayName || profile.ownerIdentity || 'You',
            ownerIdentity: profile.ownerIdentity,
            templateLabel: template ? template.displayLabel : null,
            // The local avatar always has its own chosen template.
            templatePlaceholder: false,
            position: { x: presence.position.x, y: presence.position.y, z: presence.position.z },
            rotation: { ...presence.rotation },
            animation: presence.animation,
            // Trust describes a RECEIVED claim about someone else;
            // there is no such claim about yourself, and lifecycle
            // (PRESENT/STALE/ABSENT) is a judgment a RECEIVER makes
            // about elapsed time since last heard from — neither
            // question is meaningful applied to your own, always-live
            // presence.
            lifecycleState: null,
            trustStatus: null,
            distance: cameraPosition ? distanceBetween(presence.position, cameraPosition) : null
        };
    },

    _inspectRemoteAvatar(avatarId) {
        if (!this._presenceSyncService) {
            return null;
        }
        const known = this._presenceSyncService.listKnownPresences(Date.now());
        const entry = known.find((k) => k.advertisement.avatarId === avatarId);
        if (!entry) {
            return null;
        }
        const defaultTemplate = this._avatarTemplateRegistry
            ? this._avatarTemplateRegistry.get(DEFAULT_AVATAR_TEMPLATE_ID)
            : null;
        const cameraPosition = this.getCameraPosition();
        return {
            avatarId,
            isLocal: false,
            // A remote displayName is distributed with the profile;
            // getAvatarDisplayName() falls back to ownerIdentity, then avatarId.
            displayName: this.getAvatarDisplayName(avatarId),
            ownerIdentity: entry.advertisement.ownerIdentity,
            templateLabel: defaultTemplate ? defaultTemplate.displayLabel : null,
            templatePlaceholder: true,
            position: { ...entry.advertisement.position },
            rotation: { ...entry.advertisement.rotation },
            animation: entry.advertisement.animation,
            lifecycleState: entry.lifecycleState,
            trustStatus: entry.trustObservation ? entry.trustObservation.status : null,
            distance: cameraPosition ? distanceBetween(entry.advertisement.position, cameraPosition) : null
        };
    },

    getSpatialEditingContext() {
        return this._spatialEditingContext;
    },

    getSpatialState() {
        if (!this._session) {
            return {
                loaded: [],
                visible: [],
                nearby: [],
                failed: [],
                cameraPosition: null
            };
        }
        const cameraState = this._spatialCameraController.getSpatialCameraState();
        const cameraPos = new Position(
            cameraState.position.x,
            cameraState.position.y,
            cameraState.position.z
        );
        const visible = this._worldLayoutProvider.findVisibleDocuments(
            cameraPos,
            STREAMING_RADIUS
        );
        const nearby = this._worldLayoutProvider.findVisibleDocuments(
            cameraPos,
            NAVIGATION_RADIUS
        );
        return {
            loaded: Array.from(this._loadedDocuments.keys()),
            visible,
            nearby,
            failed: this._getFailedIds(),
            cameraPosition: cameraPos
        };
    },

    getLoadedDocuments() {
        return Array.from(this._loadedDocuments.values());
    },

    getDocument(documentId) {
        return this._loadedDocuments.get(documentId) || null;
    },

    getDocumentPosition(documentId) {
        return this._getWorldPosition(documentId);
    }
};
