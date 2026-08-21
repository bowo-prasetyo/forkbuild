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
    execute(container, registry, eventBus = null, { gestureService = null, structureResolver = null } = {}) {
        const renderer = new Renderer(container);
        // 0.2.90 — structureResolver is threaded through for symmetry
        // with RenderWorldUseCase and so WorldRenderer's own placement-
        // rendering path is uniform across both modes (see its header),
        // but no World View bootstrap wires a real one yet: resolving a
        // structure placement against DECENTRALIZED/published content
        // (application/PublicationContentCache.js et al.) is a
        // different resolution path than the local-storage-by-
        // documentId one application/StructureDocumentResolver.js
        // implements, and nothing in 0.2.90's own flagship exercises
        // it. Named and deferred, not silently dropped — a null
        // resolver here means World View renders a placed structure's
        // OWN document (if it happens to be open) fine, but skips
        // placements inside any OTHER document it streams in, exactly
        // the same graceful-absence behavior a missing resolver already
        // has everywhere else.
        const worldRenderer = new WorldRenderer(renderer, registry, undefined, undefined, structureResolver, TransformMath);
        if (eventBus) {
            worldRenderer.subscribe(eventBus);
        }
        renderer.start();
        const pickingService = new PickingService(
            renderer.camera,
            renderer.domElement,
            worldRenderer.meshRegistry,
            // 0.2.93 — a second, separate mesh source so a placement can
            // be picked back to its placementId, never a brickId. See
            // renderer/PickingService.js's own constructor note and
            // renderer/WorldRenderer.js's 0.2.90 header on why this
            // stays a distinct registry rather than merged in. Mirrors
            // application/RenderWorldUseCase.js's identical wiring for
            // the Editor.
            worldRenderer.placementMeshRegistry
        );
        // 0.2.39 — a completely separate raycast target set from
        // pickingService above; see docs/Principles.md, "Avatars Are
        // Never Document Selection."
        const avatarPickingService = new AvatarPickingService(renderer.camera, renderer.domElement);
        const spatialSelectionRenderer = new SpatialSelectionRenderer(
            worldRenderer.meshRegistry,
            // 0.2.93 — enables selectPlacement() below: the World View
            // counterpart to renderer/SelectionRenderer.js's own
            // highlightPlacement(), reusing the SAME PlacementMeshRegistry
            // instance pickingService just picked against.
            worldRenderer.placementMeshRegistry
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

        // 0.2.76 — avatar ground placement: a purely RENDERING-time lift
        // added on top of whatever AvatarPresence.position.y already
        // means (ground level = 0, plus a transient jump offset —
        // core/AvatarMovementSimulation.js is completely untouched by
        // this milestone) — never written back to AvatarPresence, never
        // touching movement/collision. See docs/Principles.md, "Terrain
        // Elevation Is A Rendering-Time Offset, Never A Presence Or
        // Placement Fact."
        function withGroundElevation(position) {
            return {
                x: position.x,
                y: position.y + renderer.terrainHeightAt(position.x, position.z),
                z: position.z
            };
        }

        return {
            pick: (screenX, screenY) => pickingService.pickRich(screenX, screenY),
            pickGround: (screenX, screenY) => {
                const pos = pickingService.pickGroundPosition(screenX, screenY);
                return pos ? { type: 'ground', position: pos } : null;
            },
            // 0.2.93 — resolves a screen position to { placementId,
            // point, distance } | null, completely independent of
            // pick()'s brick raycast — mirrors
            // application/RenderWorldUseCase.js's identical Editor-side
            // surface.
            pickPlacement: (screenX, screenY) => pickingService.pickPlacement(screenX, screenY),
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
            // 0.2.93 — highlights every mesh of ONE StructurePlacement,
            // the whole-instance-glow World View counterpart to
            // selectBrick/selectBricks above. Pass null to clear it.
            selectPlacement: (placementId) => spatialSelectionRenderer.selectPlacement(placementId),
            clearSelection: () => spatialSelectionRenderer.clearSelection(),
            hoverBrick: (brickId) => spatialSelectionRenderer.hover(brickId),
            clearHover: () => spatialSelectionRenderer.clearHover(),
            showPreview: (definitionId, position, rotation, valid = true) =>
                spatialPreviewRenderer.show(definitionId, position, rotation, valid),
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
                visual.setPose(withGroundElevation(presence.position), presence.rotation);
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
                localAvatarVisual.setPose(withGroundElevation(presence.position), presence.rotation);
                localAvatarVisual.setAnimation(presence.animation);
            },
            // 0.2.44 — see renderer/AvatarVisual.js's own header: a
            // temporary, LOCAL-ONLY yaw override, never touching
            // AvatarPresence. A no-op before the local avatar exists
            // (nothing to face with yet).
            setLocalAvatarFacing: (yawDegrees) => {
                if (!localAvatarVisual) {
                    return;
                }
                localAvatarVisual.setFacingOverride(yawDegrees);
            },
            // 0.2.44 — GREET/WAVE/POINT: a purely local, rendering-only
            // pose overlay on Bob's OWN avatar — see
            // application/WorldNavigationSession.js's
            // performAvatarInteraction() for the full picture. Never
            // called for a remote avatar: 0.2.44 explicitly does not
            // network gestures (see docs/Roadmap.md).
            setLocalAvatarGesture: (interactionKind) => {
                if (!localAvatarVisual) {
                    return;
                }
                localAvatarVisual.setGesture(interactionKind);
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
                visual.setPose(withGroundElevation(presenceLike.position), presenceLike.rotation);
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
                visual.setPose(withGroundElevation(presenceLike.position), presenceLike.rotation);
                visual.setAnimation(presenceLike.animation);
            },
            // 0.2.41 — the remote-avatar counterpart to
            // updateLocalAvatarAppearance: called only by
            // application/RemoteAvatarAppearanceRegistry.js, only when
            // a profile update actually arrives (rare — never once per
            // frame like updateRemoteAvatarPresence above). A no-op if
            // the avatar has no presence-driven visual yet — appearance
            // never creates a remote avatar on its own.
            updateRemoteAvatarAppearance: (avatarId, template, appearance) => {
                const visual = remoteAvatarVisuals.get(avatarId);
                if (!visual) {
                    return;
                }
                visual.setAppearance(template, appearance);
            },
            // 0.2.45 — the remote-avatar counterpart to
            // setLocalAvatarGesture: reuses AvatarVisual.setGesture()
            // directly on a REMOTE avatar's own visual (see
            // renderer/AvatarVisual.js — already generic, nothing
            // local-only baked into its own logic despite 0.2.44 only
            // ever calling it for the local avatar until now). Called
            // by application/WorldNavigationSession.js the moment a
            // trusted AvatarInteractionAdvertisement is accepted, and
            // again with `null` once the gesture's own short lifetime
            // expires — see docs/Principles.md, "Interaction Is
            // Rendered, Never Retained." A no-op if the avatarId has no
            // presence-driven visual yet — exactly
            // updateRemoteAvatarAppearance's own "appearance never
            // creates a remote avatar on its own" rule, applied to a
            // gesture instead.
            setRemoteAvatarGesture: (avatarId, interactionKind) => {
                const visual = remoteAvatarVisuals.get(avatarId);
                if (!visual) {
                    return;
                }
                visual.setGesture(interactionKind);
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
