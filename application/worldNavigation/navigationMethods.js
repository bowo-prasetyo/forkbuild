import { ORIGIN_LOCATION_ID } from '../world/WorldLocationDirectory.js';
import { CameraFocusAnimator } from '../editor/CameraFocusAnimator.js';
import { computeCompassHeading } from '../../core/CompassHeading.js';
import { LOCATION_FOCUS_OFFSET } from './constants.js';

// WorldNavigationSession navigation: focusing documents, selections and
// locations, going home, the compass, and the animated camera glide. None of
// it changes a document (see docs/Principles.md, "Navigation Never Implies
// Editing").

// HOME_CAMERA_FRAMING is renderer/CameraState.js's own default framing, so
// goHome() returns to the same pose every session starts from.
// LOCATION_FOCUS_OFFSET matches focusSelection()'s placement-focus offset, so
// both land on the same framing for the same target. The focus glide is short
// so hopping through a Locations list never feels sluggish.
const HOME_CAMERA_FRAMING = { position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 } };
const CAMERA_FOCUS_DURATION_MS = 900;

export const navigationMethods = {
    // Advances any in-flight goHome()/focusLocation() animation once per frame.
    // Without onAnimationFrame, camera focus applies instantly (see
    // _beginCameraFocus()).
    _setupCameraFocusAnimation() {
        if (typeof this._session.onAnimationFrame !== 'function') {
            return;
        }
        this._cameraFocusFrameSubscription = this._session.onAnimationFrame(() => {
            this._tickCameraFocus(Date.now());
        });
    },

    // Glides toward `framing` when this session can tick frames, otherwise
    // applies it instantly. The final framing is the same either way.
    _beginCameraFocus(framing) {
        if (!this._spatialCameraController) {
            return;
        }
        if (!this._cameraFocusFrameSubscription) {
            this._spatialCameraController.applyFraming(framing);
            return;
        }
        const current = this._spatialCameraController.getSpatialCameraState();
        this._activeCameraFocus = {
            // Explicit {x,y,z} copies, never the WorldPosition instances
            // themselves — CameraFocusAnimator spreads its `from`/`to`
            // inputs (`{ ...from.position }`), and WorldPosition's x/y/z
            // are prototype getters that a plain object spread would
            // silently drop, leaving an animator with no coordinates at
            // all. See core/WorldPosition.js.
            animator: new CameraFocusAnimator({
                from: {
                    position: { x: current.position.x, y: current.position.y, z: current.position.z },
                    target: { x: current.target.x, y: current.target.y, z: current.target.z }
                },
                to: framing,
                durationMs: CAMERA_FOCUS_DURATION_MS
            }),
            startedAt: Date.now()
        };
    },

    _tickCameraFocus(now) {
        if (!this._activeCameraFocus || !this._spatialCameraController) {
            return;
        }
        const { animator, startedAt } = this._activeCameraFocus;
        const state = animator.stateAt(now - startedAt);
        this._spatialCameraController.applyFraming(state);
        if (state.complete) {
            this._activeCameraFocus = null;
        }
    },

    // Moves the camera and, by default, makes `documentId` the active document
    // too, which is what search/Nearby Worlds/"Focus" mean. Pass
    // `{ setActive: false }` for a camera-only move (see docs/Principles.md,
    // "Navigation Never Implies Editing").
    focusDocument(documentId, { setActive = true } = {}) {
        this._focusedDocumentId = documentId;
        if (setActive) {
            this.setActiveDocument(documentId);
        }
        const layoutPos = this._getWorldPosition(documentId);
        this._spawnAvatarNear(documentId, layoutPos);
        this._spatialCameraController.focusDocument(documentId, layoutPos);
        return this.updateSpatialView();
    },

    // Makes `documentId` active without moving the camera (e.g. two
    // publications sharing a coordinate). A selection in a different document is
    // cleared, or the next transform would fork a document that isn't the active
    // one (see docs/Principles.md, "Only The Active Document Is An Editing
    // Target").
    setActiveDocument(documentId) {
        if (this._spatialSelection && !this._spatialSelection.isEmpty
            && this._spatialSelection.documentId !== documentId) {
            this.clearSelection();
        }
        this._activeDocumentId = documentId;
        return this._activeDocumentId;
    },

    // Where the camera is currently navigated to; see getActiveDocumentId() for where an
    // edit would land.
    getFocusedDocumentId() {
        return this._focusedDocumentId;
    },

    focusSelection() {
        if (!this._spatialInspection || this._spatialInspection.isEmpty) {
            return;
        }
        const data = this._spatialInspection.data;
        if (data?.worldPosition) {
            this._spatialCameraController.focusTarget(
                {
                    x: data.worldPosition.x,
                    y: data.worldPosition.y,
                    z: data.worldPosition.z
                },
                { x: 12, y: 12, z: 12 }
            );
        }
    },

    navigateToDocument(documentId) {
        return this.focusDocument(documentId);
    },

    // Moves the camera to a WorldLocation (LOCATION_FOCUS_OFFSET for a
    // STRUCTURE, HOME_CAMERA_FRAMING for ORIGIN), animated when possible. Never
    // touches the active document, selection or inspection (see
    // docs/Principles.md, "Navigation Never Implies Editing"). Returns false for
    // an unknown id, e.g. a stale panel entry.
    focusLocation(locationId) {
        const location = this._worldLocationDirectory.find(locationId);
        if (!location) {
            return false;
        }
        if (location.isOrigin) {
            this._beginCameraFocus(HOME_CAMERA_FRAMING);
            return true;
        }
        const { x, y, z } = location.position;
        this._beginCameraFocus({
            position: { x: x + LOCATION_FOCUS_OFFSET.x, y: y + LOCATION_FOCUS_OFFSET.y, z: z + LOCATION_FOCUS_OFFSET.z },
            target: { x, y, z }
        });
        return true;
    },

    // "Home" returns the camera and the local avatar to the user's own world.
    // World origin is reachable through the ORIGIN_LOCATION_ID entry, but a
    // published world sits somewhere on a huge shared grid, so origin is almost
    // never near the user's content.
    //
    // Moving the avatar is a deliberate exception to "navigation never
    // relocates a participant": leaving it behind would show the user's world
    // while WASD moves an avatar somewhere off-screen.
    //
    // Uses focusDocument() for the camera, active document and streaming, then
    // repositions the avatar. Falls back to origin only when no document has
    // ever been focused.
    //
    // Reads _homeDocumentId, not _focusedDocumentId, and doesn't require the
    // document to be loaded: wandering far enough to unload it is exactly when
    // Home is needed. focusDocument() reloads it synchronously, so
    // _safeSpawnPosition() measures real bounds.
    goHome() {
        const documentId = this._homeDocumentId;
        if (!documentId) {
            return this.focusLocation(ORIGIN_LOCATION_ID);
        }
        // focusDocument() returns updateSpatialView()'s { loaded, visible, failed };
        // goHome() keeps its boolean contract.
        this.focusDocument(documentId);
        const layoutPos = this._getWorldPosition(documentId);
        if (this._avatarPresenceSession && layoutPos) {
            // Uses the bounds-aware spawn point so Home never lands inside a structure
            // built around its own origin. _safeSpawnPosition() falls back to the fixed
            // offset if the reload failed.
            this._avatarPresenceSession.update({
                position: this._safeSpawnPosition(documentId, layoutPos)
            });
        }
        return true;
    },

    // Which way the camera is looking, derived fresh from position/target (see
    // core/CompassHeading.js). Null before start() or when position and target
    // coincide.
    getCompassHeading() {
        if (!this._spatialCameraController) {
            return null;
        }
        const state = this._spatialCameraController.getSpatialCameraState();
        return computeCompassHeading(state.position, state.target);
    },

    moveCamera(delta) {
        this._spatialCameraController.moveCamera(delta);
        return this.updateSpatialView();
    }
};
