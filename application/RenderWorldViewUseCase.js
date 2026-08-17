import { Renderer } from '../renderer/Renderer.js';
import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { PickingService } from '../renderer/PickingService.js';
import { AvatarPickingService } from '../renderer/AvatarPickingService.js';
import { SpatialSelectionRenderer } from '../renderer/SpatialSelectionRenderer.js';
import { SpatialPreviewRenderer } from '../renderer/SpatialPreviewRenderer.js';
import { TransformGizmoRenderer } from '../renderer/TransformGizmoRenderer.js';
import { TransformGizmoController } from '../renderer/TransformGizmoController.js';
import { TransformMath } from './TransformMath.js';
import { AvatarRenderer } from '../renderer/AvatarRenderer.js';
import { AvatarVisual } from '../renderer/AvatarVisual.js';

// World View's render wiring. Exposes the same narrow gizmo surface
// RenderWorldUseCase does — one shared TransformGizmoController design,
// one shared gesture contract, no second gizmo implementation.
// WorldNavigationSession passes its SpatialEditingService as
// gestureService; TransformMath is injected so the gizmo drag preview
// and the committed TransformSelectionCommand are computed from
// identical definitions. As of 0.1.47 the pointer move/up functions
// carry modifier state down (precision mode) and gesture feedback up.
export class RenderWorldViewUseCase {
    execute(container, registry, eventBus = null, { gestureService = null } = {}) {
        const renderer = new Renderer(container);
        const worldRenderer = new WorldRenderer(renderer, registry);
        if (eventBus) {
            worldRenderer.subscribe(eventBus);
        }
        renderer.start();
        const pickingService = new PickingService(
            renderer.camera,
            renderer.domElement,
            worldRenderer.meshRegistry
        );
        // 0.2.39 — a completely separate raycast target set from
        // pickingService above; see docs/Principles.md, "Avatars Are
        // Never Document Selection."
        const avatarPickingService = new AvatarPickingService(renderer.camera, renderer.domElement);
        const spatialSelectionRenderer = new SpatialSelectionRenderer(
            worldRenderer.meshRegistry
        );
        const spatialPreviewRenderer = new SpatialPreviewRenderer(renderer);
        const transformGizmoRenderer = new TransformGizmoRenderer(renderer);
        const transformGizmoController = new TransformGizmoController({
            camera: renderer.camera,
            domElement: renderer.domElement,
            gizmoRenderer: transformGizmoRenderer,
            gestureService,
            controlsEnabler: renderer.cameraController,
            transformMath: TransformMath
        });

        // 0.2.35 — the local user's own avatar. Built lazily (on the
        // first setLocalAvatar call) rather than unconditionally here,
        // so a viewport with nobody logged in never even constructs
        // the object graph.
        const avatarRenderer = new AvatarRenderer();
        let localAvatarVisual = null;
        let localAvatarVisible = true;
        // 0.2.39 — tracked purely so pickAvatar() can include the
        // local avatar's root under its own avatarId; nothing else in
        // this facade needs to know it (setLocalAvatar/updatePresence/
        // etc. never read it back).
        let localAvatarId = null;

        function ensureLocalAvatarVisual() {
            if (!localAvatarVisual) {
                localAvatarVisual = new AvatarVisual(avatarRenderer);
            }
            return localAvatarVisual;
        }

        // 0.2.37 — every OTHER participant's avatar, keyed by
        // avatarId. Reuses the exact same AvatarRenderer/AvatarVisual
        // classes 0.2.35/0.2.36 already built for the local avatar —
        // to this facade, a remote avatar is just another AvatarVisual
        // that happens to be driven by application/
        // RemoteAvatarRegistry.js instead of local movement input.
        const remoteAvatarVisuals = new Map(); // avatarId -> AvatarVisual
        let remoteAvatarsVisible = true;

        // 0.2.36 — keeps WALKING/RUNNING swinging every render frame,
        // independent of how often a new AvatarPresence actually
        // arrives (see renderer/AvatarVisual.js's own header). Covers
        // the local avatar and every known remote one; a cheap no-op
        // whenever none exist yet.
        renderer.addFrameListener((deltaSeconds) => {
            if (localAvatarVisual) {
                localAvatarVisual.tick(deltaSeconds);
            }
            for (const visual of remoteAvatarVisuals.values()) {
                visual.tick(deltaSeconds);
            }
        });

        return {
            pick: (screenX, screenY) => pickingService.pickRich(screenX, screenY),
            pickGround: (screenX, screenY) => {
                const pos = pickingService.pickGroundPosition(screenX, screenY);
                return pos ? { type: 'ground', position: pos } : null;
            },
            // 0.2.39 — a completely separate pickable set from pick()
            // above: only avatar roots CURRENTLY IN THE SCENE (never a
            // hidden local avatar, never a remote avatar hidden by
            // "Show Other Avatars"), built fresh on every call so
            // visibility toggles take effect immediately with no
            // separate cache to keep in sync. Returns
            // { type: 'avatar', avatarId, isLocal, distance } or null
            // — never a brick-shaped hit, and never mixed into the
            // same result shape pick() returns, so nothing downstream
            // can accidentally treat an avatar hit as a brick hit.
            pickAvatar: (screenX, screenY) => {
                const roots = new Map();
                if (localAvatarVisual && localAvatarVisible && localAvatarId) {
                    roots.set(localAvatarId, localAvatarVisual.root);
                }
                if (remoteAvatarsVisible) {
                    for (const [avatarId, visual] of remoteAvatarVisuals) {
                        roots.set(avatarId, visual.root);
                    }
                }
                const hit = avatarPickingService.pick(screenX, screenY, roots);
                if (!hit) {
                    return null;
                }
                return {
                    type: 'avatar',
                    avatarId: hit.avatarId,
                    isLocal: hit.avatarId === localAvatarId,
                    distance: hit.distance
                };
            },
            getCameraState: () => renderer.cameraController.getState(),
            setCameraState: (state) => renderer.cameraController.setState(state),
            setControlsEnabled: (enabled) => renderer.cameraController.setEnabled(enabled),
            addWorld: (world, documentId, layoutPosition) => worldRenderer.addWorld(world, documentId, layoutPosition),
            removeWorld: (world, documentId) => worldRenderer.removeWorld(world, documentId),
            selectBrick: (brickId) => spatialSelectionRenderer.select(brickId),
            selectBricks: (brickIds, primaryBrickId = null) => spatialSelectionRenderer.selectMany(brickIds, primaryBrickId),
            clearSelection: () => spatialSelectionRenderer.clearSelection(),
            hoverBrick: (brickId) => spatialSelectionRenderer.hover(brickId),
            clearHover: () => spatialSelectionRenderer.clearHover(),
            showPreview: (definitionId, position, rotation) => spatialPreviewRenderer.show(definitionId, position, rotation),
            hidePreview: () => spatialPreviewRenderer.hide(),
            showGizmo: (pivot, bounds) => transformGizmoController.show(pivot, bounds),
            hideGizmo: () => transformGizmoController.hide(),
            gizmoHitTest: (screenX, screenY) =>
                transformGizmoController.hitTest(screenX, screenY),
            gizmoPointerDown: (screenX, screenY, selection) =>
                transformGizmoController.onPointerDown(screenX, screenY, selection),
            gizmoPointerMove: (screenX, screenY, selection, modifiers = null) =>
                transformGizmoController.onPointerMove(screenX, screenY, selection, modifiers),
            gizmoPointerUp: (screenX, screenY, selection, modifiers = null) =>
                transformGizmoController.onPointerUp(screenX, screenY, selection, modifiers),
            gizmoKeyDown: (keyEvent, selection) =>
                transformGizmoController.onKeyDown(keyEvent, selection),
            cancelGizmoGesture: () => transformGizmoController.cancelGesture(),
            isGizmoDragging: () => transformGizmoController.isDragging,

            // 0.2.35 — see docs/Principles.md, "An Avatar's Location
            // Comes From Presence, Never From The Avatar Itself." This
            // facade only ever COMBINES a template+appearance with a
            // presence; it never computes either one, and never
            // touches worldRenderer/addWorld's document/placement
            // machinery — an avatar and a published World are rendered
            // through entirely separate code paths that happen to
            // share one scene.
            setLocalAvatar: (template, appearance, presence) => {
                const visual = ensureLocalAvatarVisual();
                localAvatarId = presence.avatarId;
                visual.setAppearance(template, appearance);
                visual.setPose(presence.position, presence.rotation);
                visual.setAnimation(presence.animation);
                if (localAvatarVisible) {
                    renderer.add(visual.root);
                }
            },
            updateLocalAvatarAppearance: (template, appearance) => {
                if (!localAvatarVisual) {
                    return;
                }
                localAvatarVisual.setAppearance(template, appearance);
            },
            updateLocalAvatarPresence: (presence) => {
                if (!localAvatarVisual) {
                    return;
                }
                localAvatarVisual.setPose(presence.position, presence.rotation);
                localAvatarVisual.setAnimation(presence.animation);
            },
            // A pure client rendering preference (see docs/Principles.md)
            // — toggling it never touches AvatarProfile, AvatarPresence,
            // or anything persisted; it only adds/removes an already-
            // built Object3D from the scene.
            setLocalAvatarVisible: (visible) => {
                localAvatarVisible = visible;
                if (!localAvatarVisual) {
                    return;
                }
                if (visible) {
                    renderer.add(localAvatarVisual.root);
                } else {
                    renderer.remove(localAvatarVisual.root);
                }
            },
            removeLocalAvatar: () => {
                if (!localAvatarVisual) {
                    return;
                }
                renderer.remove(localAvatarVisual.root);
                localAvatarVisual.dispose();
                localAvatarVisual = null;
                localAvatarId = null;
            },
            // 0.2.36 — lets application/AvatarMovementController.js
            // (via WorldNavigationSession) tick its own kinematics
            // simulation once per render frame, real elapsed seconds,
            // through the SAME frame loop the avatar's own gait clock
            // above already uses. Just a pass-through to Renderer's
            // generic listener registry — see its own header for why
            // this stays deliberately generic rather than
            // avatar-specific.
            onAnimationFrame: (callback) => renderer.addFrameListener(callback),

            // 0.2.37 — the remote-avatar counterpart to setLocalAvatar/
            // updateLocalAvatarPresence/removeLocalAvatar. Called only
            // by application/RemoteAvatarRegistry.js, never directly by
            // a broadcast transport — see docs/Principles.md, "Never
            // Let A Transport Callback Write Directly Into Session
            // State." `presenceLike` is a plain
            // { position, rotation, animation } shape (an
            // AvatarPresenceAdvertisement, or RemoteAvatarInterpolator's
            // interpolated output) — this facade has no opinion about
            // where it came from.
            setRemoteAvatar: (avatarId, template, appearance, presenceLike) => {
                let visual = remoteAvatarVisuals.get(avatarId);
                if (!visual) {
                    visual = new AvatarVisual(avatarRenderer);
                    remoteAvatarVisuals.set(avatarId, visual);
                    if (remoteAvatarsVisible) {
                        renderer.add(visual.root);
                    }
                }
                visual.setAppearance(template, appearance);
                visual.setPose(presenceLike.position, presenceLike.rotation);
                visual.setAnimation(presenceLike.animation);
            },
            // The cheap per-frame path — pose/animation only, never
            // touches appearance. Called every interpolation tick, so
            // it must stay as cheap as updateLocalAvatarPresence
            // already is.
            updateRemoteAvatarPresence: (avatarId, presenceLike) => {
                const visual = remoteAvatarVisuals.get(avatarId);
                if (!visual) {
                    return;
                }
                visual.setPose(presenceLike.position, presenceLike.rotation);
                visual.setAnimation(presenceLike.animation);
            },
            removeRemoteAvatar: (avatarId) => {
                const visual = remoteAvatarVisuals.get(avatarId);
                if (!visual) {
                    return;
                }
                renderer.remove(visual.root);
                visual.dispose();
                remoteAvatarVisuals.delete(avatarId);
            },
            // A pure client rendering preference, exactly like
            // setLocalAvatarVisible — never touches presence sync or
            // the known-remote-avatar set, only which already-built
            // Object3Ds are actually in the scene.
            setRemoteAvatarsVisible: (visible) => {
                remoteAvatarsVisible = visible;
                for (const visual of remoteAvatarVisuals.values()) {
                    if (visible) {
                        renderer.add(visual.root);
                    } else {
                        renderer.remove(visual.root);
                    }
                }
            },
            dispose() {
                transformGizmoController.dispose();
                transformGizmoRenderer.dispose();
                spatialPreviewRenderer.dispose();
                spatialSelectionRenderer.clear();
                if (localAvatarVisual) {
                    localAvatarVisual.dispose();
                    localAvatarVisual = null;
                }
                for (const visual of remoteAvatarVisuals.values()) {
                    visual.dispose();
                }
                remoteAvatarVisuals.clear();
                renderer.dispose();
            }
        };
    }
}
