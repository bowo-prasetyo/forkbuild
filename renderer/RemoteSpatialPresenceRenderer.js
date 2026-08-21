import * as THREE from 'three';

const MARKER_HEIGHT = 1.9; // roughly eye height — reads as "a camera is here," not a full avatar
const OUTLINE_COLOR_FALLBACK = 0xffffff;
const OUTLINE_OPACITY = 0.55;
const LABEL_WIDTH = 256;
const LABEL_HEIGHT = 64;

// A stable, deterministic identityId -> hue mapping — never random, so
// the SAME identity always reads as the SAME color across every
// replica, every session, with zero coordination needed (no "color
// registry" to synchronize). Purely a presentation convenience, exactly
// like renderer/AvatarRenderer.js's own SKIN_TONE_COLORS lookup — never
// itself a fact about the identity.
function hashHue(identityId) {
    let hash = 0;
    for (let i = 0; i < identityId.length; i++) {
        hash = (hash * 31 + identityId.charCodeAt(i)) >>> 0;
    }
    return hash % 360;
}

function colorForIdentity(identityId) {
    return new THREE.Color(`hsl(${hashHue(identityId)}, 70%, 55%)`);
}

function buildLabelSprite(text, colorCss) {
    const canvas = document.createElement('canvas');
    canvas.width = LABEL_WIDTH;
    canvas.height = LABEL_HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, LABEL_HEIGHT * 0.55, LABEL_WIDTH, LABEL_HEIGHT * 0.45);
    ctx.fillStyle = colorCss;
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, LABEL_WIDTH / 2, LABEL_HEIGHT * 0.78);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.6, 0.4, 1);
    sprite.position.y = MARKER_HEIGHT + 0.5;
    return { sprite, canvas, ctx, texture };
}

// 0.3.0 — Collaborative Spatial Presence.
//
// The renderer facade's counterpart to renderer/SpatialSelectionRenderer.js
// (local selection) and renderer/AvatarRenderer.js (local/remote
// avatars) — but for a DIFFERENT kind of fact: not "who is this
// identity's avatar body," but "where is a remote participant's OWN
// CAMERA, and what have they selected." Deliberately understated, per
// this milestone's own design conversation, "Remote cursors should be
// visually subtle" — a small marker, a faint name/activity label, and
// (only when something is actually selected) a translucent bounding-box
// outline in that participant's own identity color. The World itself
// stays the star; this never competes with it for visual weight the way
// a full second avatar body would.
//
// Keyed by `deviceId` (application/WorldSpatialPresenceUseCase.js's own
// per-device roster shape — see that class's own header, "Device
// aggregation must continue") — Bob's Desktop and Bob's Tablet each get
// their OWN marker when both report different positions, exactly the
// "genuinely different places" case that milestone's design conversation
// called out. A caller (application/WorldNavigationSession.js, through
// application/RenderWorldViewUseCase.js's own facade) decides what
// label text to show — this class has no idea what a "display name" is,
// mirroring every other renderer in this codebase staying presentation-
// only, never identity-resolving.
//
// Selection outlines are computed directly from already-built meshes —
// via the SAME meshRegistry/placementMeshRegistry
// renderer/SpatialSelectionRenderer.js already reads — never from a
// second, independent geometry source. A brickId or placementId this
// renderer doesn't recognize (streamed out, or belonging to a document
// this replica hasn't loaded) simply shows no outline; the marker and
// label are unaffected.
export class RemoteSpatialPresenceRenderer {
    constructor(meshRegistry, placementMeshRegistry = null, terrainHeightAt = null) {
        this._meshRegistry = meshRegistry;
        this._placementMeshRegistry = placementMeshRegistry;
        this._terrainHeightAt = typeof terrainHeightAt === 'function' ? terrainHeightAt : () => 0;
        this._entries = new Map(); // deviceId -> { group, marker, label, outline, sprite }
    }

    // `presence`: { identityId, label, position: {x,z}|null, heading:
    // number|null, selection: WorldSpatialSelection|null, activity:
    // string|null }. A null/undefined position removes the marker
    // entirely (nothing to draw yet) rather than leaving it frozen at a
    // stale origin.
    setPresence(deviceId, presence) {
        if (!presence || !presence.position) {
            this.removePresence(deviceId);
            return;
        }
        let entry = this._entries.get(deviceId);
        const color = colorForIdentity(presence.identityId || deviceId);
        if (!entry) {
            const group = new THREE.Group();
            const marker = new THREE.Mesh(
                new THREE.ConeGeometry(0.16, 0.4, 8),
                new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 })
            );
            marker.position.y = MARKER_HEIGHT;
            marker.rotation.x = Math.PI / 2; // tip points along -Z by default, matches heading 0 == +Z convention via yaw below
            group.add(marker);
            const { sprite } = buildLabelSprite(presence.label || '', `hsl(${hashHue(presence.identityId || deviceId)}, 70%, 70%)`);
            group.add(sprite);
            entry = { group, marker, sprite, outline: null };
            this._entries.set(deviceId, entry);
        }
        const groundY = this._terrainHeightAt(presence.position.x, presence.position.z);
        entry.group.position.set(presence.position.x, groundY, presence.position.z);
        if (Number.isFinite(presence.heading)) {
            // core/CompassHeading.js's own convention: 0 faces +Z, 90
            // faces +X, clockwise from above — matches THREE's own
            // right-handed Y-up rotation when negated.
            entry.marker.rotation.z = THREE.MathUtils.degToRad(-presence.heading);
        }
        this._applySelectionOutline(entry, presence.selection, color);
        return entry.group;
    }

    // Every currently-tracked marker's root Object3D — the caller (see
    // application/RenderWorldViewUseCase.js's own facade pattern) adds
    // each one to the scene exactly once, on first creation.
    getObject(deviceId) {
        const entry = this._entries.get(deviceId);
        return entry ? entry.group : null;
    }

    removePresence(deviceId) {
        const entry = this._entries.get(deviceId);
        if (!entry) {
            return;
        }
        this._disposeEntry(entry);
        this._entries.delete(deviceId);
    }

    // Every deviceId currently rendered — lets a caller diff against a
    // freshly-fetched roster and remove markers for devices that
    // disappeared (disconnected, or left the World).
    trackedDeviceIds() {
        return Array.from(this._entries.keys());
    }

    clear() {
        for (const deviceId of Array.from(this._entries.keys())) {
            this.removePresence(deviceId);
        }
    }

    dispose() {
        this.clear();
    }

    _applySelectionOutline(entry, selection, color) {
        if (entry.outline) {
            entry.group.remove(entry.outline);
            entry.outline.geometry.dispose();
            entry.outline.material.dispose();
            entry.outline = null;
        }
        if (!selection || selection.isEmpty) {
            return;
        }
        const meshes = selection.kind === 'placement' && this._placementMeshRegistry
            ? this._placementMeshRegistry.getMeshes(selection.placementId)
            : (selection.kind === 'brick' && this._meshRegistry
                ? [this._meshRegistry.getMesh(selection.brickId)].filter(Boolean)
                : []);
        if (!meshes || meshes.length === 0) {
            return; // not a known local mesh — nothing to outline yet
        }
        const worldBox = new THREE.Box3();
        for (const mesh of meshes) {
            worldBox.expandByObject(mesh);
        }
        if (worldBox.isEmpty()) {
            return;
        }
        // entry.group is itself positioned at the marker's own world
        // position — a Box3Helper's vertices are literal min/max
        // coordinates, so the box must be re-expressed RELATIVE to that
        // position before becoming a child of the group, exactly the
        // same "pivot-relative bounds" translation
        // renderer/TransformGizmoRenderer.js's own bounds box already
        // does, or the group's own position offset would be applied
        // twice.
        const groupPosition = entry.group.position;
        const localBox = new THREE.Box3(
            worldBox.min.clone().sub(groupPosition),
            worldBox.max.clone().sub(groupPosition)
        );
        const helper = new THREE.Box3Helper(localBox, color || OUTLINE_COLOR_FALLBACK);
        helper.material.transparent = true;
        helper.material.opacity = OUTLINE_OPACITY;
        helper.material.depthTest = false;
        entry.group.add(helper);
        entry.outline = helper;
    }

    _disposeEntry(entry) {
        if (entry.outline) {
            entry.outline.geometry.dispose();
            entry.outline.material.dispose();
        }
        entry.group.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material && object.material.map) object.material.map.dispose();
            if (object.material) object.material.dispose();
        });
    }
}
