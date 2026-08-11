import * as THREE from 'three';

// Purely visual half of the interactive transform gizmo (0.1.46).
// Handles, ring, pivot marker, hover/active highlighting, visibility —
// nothing else. This class never mutates the World, never creates
// commands, and never decides what a drag means; that is
// TransformGizmoController's job. Neither knows about Groups: the gizmo
// is anchored to { pivot, bounds } and nothing else.
//
// One compound gizmo, deliberately: three translation axis handles, a
// center free-move pad, and one Y-rotation ring are all visible at
// once. The handle you grab decides the gesture, so there is no mode
// switch for the UI to manage and no second gizmo state machine.
//
// Handles render with depthTest disabled and a high renderOrder so the
// gizmo stays visible through bricks, and the whole group is scaled by
// camera distance so it stays a usable screen size while orbiting.
const HANDLE_LENGTH = 1.4;
const SHAFT_RADIUS = 0.022;
const TIP_RADIUS = 0.075;
const TIP_LENGTH = 0.22;
const RING_RADIUS = 0.95;
const RING_TUBE = 0.028;
const PIVOT_RADIUS = 0.055;
const FREE_HANDLE_SIZE = 0.26;
const AXIS_COLORS = { x: 0xff5555, y: 0x66cc66, z: 0x5599ff };
const FREE_HANDLE_COLOR = 0xffcc44;
const ROTATE_HANDLE_COLOR = 0xbb77ff;
const PIVOT_COLOR = 0xffffff;
const BOUNDS_BOX_COLOR = 0xffffff;
const BOUNDS_BOX_OPACITY = 0.18;
// Below this span the bounds box would just retrace a single brick the
// selection highlight already marks, so it is only drawn when the
// selection actually spans meaningful space (i.e. multiple bricks).
const SINGLE_BRICK_BOUNDS_THRESHOLD = 1.5;
const MINIMUM_GIZMO_SCALE = 0.4;
const GIZMO_SCALE_FACTOR = 0.14;
const GIZMO_RENDER_ORDER = 999;
const HIGHLIGHT_WHITE = new THREE.Color(0xffffff);

export class TransformGizmoRenderer {
    constructor(renderer) {
        this._renderer = renderer;
        this._group = new THREE.Group();
        this._group.visible = false;
        this._handleMeshes = [];
        this._meshesByHandle = new Map();
        this._baseColors = new Map();
        this._hoveredHandleId = null;
        this._activeHandleId = null;
        this._boundsBox = null;
        this._build();
        this._renderer.add(this._group);
    }

    get visible() {
        return this._group.visible;
    }

    // Meshes the controller raycasts against. The pivot marker is
    // intentionally NOT pickable.
    getHandleMeshes() {
        return [...this._handleMeshes];
    }

    show({ pivot, bounds = null }) {
        this.setPivot(pivot);
        this._updateBoundsBox(bounds);
        this._group.visible = true;
    }

    hide() {
        this._group.visible = false;
        this.setHover(null);
        this.setActive(null);
    }

    // World-space pivot. During a translation drag the controller moves
    // this every pointer move so the gizmo follows the selection.
    setPivot(pivot) {
        this._group.position.set(pivot.x, pivot.y, pivot.z);
        this._updateScale(pivot);
    }

    setHover(handleId) {
        if (this._hoveredHandleId === handleId) {
            return;
        }
        this._hoveredHandleId = handleId;
        this._applyHighlight();
    }

    setActive(handleId) {
        if (this._activeHandleId === handleId) {
            return;
        }
        this._activeHandleId = handleId;
        this._applyHighlight();
    }

    dispose() {
        this.hide();
        this._renderer.remove(this._group);
        this._group.traverse((object) => {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                object.material.dispose();
            }
        });
    }

    // ------------------------------------------------------------- internal

    _build() {
        const pivotMesh = this._createMesh(new THREE.SphereGeometry(PIVOT_RADIUS, 16, 12), PIVOT_COLOR);
        this._group.add(pivotMesh);
        this._addAxisHandle('x');
        this._addAxisHandle('y');
        this._addAxisHandle('z');
        this._addFreeMoveHandle();
        this._addRotateHandle();
    }

    _createMesh(geometry, color) {
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.95,
            depthTest: false
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = GIZMO_RENDER_ORDER;
        return mesh;
    }

    _registerHandle(handleId, mesh, color) {
        mesh.userData.handleId = handleId;
        this._handleMeshes.push(mesh);
        if (!this._meshesByHandle.has(handleId)) {
            this._meshesByHandle.set(handleId, []);
        }
        this._meshesByHandle.get(handleId).push(mesh);
        this._baseColors.set(handleId, new THREE.Color(color));
    }

    _addAxisHandle(axisId) {
        const handleGroup = new THREE.Group();
        const shaftLength = HANDLE_LENGTH - TIP_LENGTH;
        const shaft = this._createMesh(
            new THREE.CylinderGeometry(SHAFT_RADIUS, SHAFT_RADIUS, shaftLength, 8),
            AXIS_COLORS[axisId]
        );
        shaft.position.y = shaftLength / 2;
        const tip = this._createMesh(
            new THREE.ConeGeometry(TIP_RADIUS, TIP_LENGTH, 12),
            AXIS_COLORS[axisId]
        );
        tip.position.y = shaftLength + TIP_LENGTH / 2;
        handleGroup.add(shaft, tip);
        if (axisId === 'x') {
            handleGroup.rotation.z = -Math.PI / 2;
        } else if (axisId === 'z') {
            handleGroup.rotation.x = Math.PI / 2;
        }
        this._group.add(handleGroup);
        this._registerHandle(axisId, shaft, AXIS_COLORS[axisId]);
        this._registerHandle(axisId, tip, AXIS_COLORS[axisId]);
    }

    _addFreeMoveHandle() {
        const mesh = this._createMesh(
            new THREE.PlaneGeometry(FREE_HANDLE_SIZE, FREE_HANDLE_SIZE),
            FREE_HANDLE_COLOR
        );
        mesh.material.side = THREE.DoubleSide;
        mesh.rotation.x = -Math.PI / 2;
        this._group.add(mesh);
        this._registerHandle('free', mesh, FREE_HANDLE_COLOR);
    }

    _addRotateHandle() {
        const mesh = this._createMesh(
            new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 8, 48),
            ROTATE_HANDLE_COLOR
        );
        mesh.rotation.x = Math.PI / 2;
        this._group.add(mesh);
        this._registerHandle('rotate', mesh, ROTATE_HANDLE_COLOR);
    }

    _updateBoundsBox(bounds) {
        if (this._boundsBox) {
            this._group.remove(this._boundsBox);
            if (this._boundsBox.geometry) {
                this._boundsBox.geometry.dispose();
            }
            if (this._boundsBox.material) {
                this._boundsBox.material.dispose();
            }
            this._boundsBox = null;
        }
        if (!bounds) {
            return;
        }
        const spansSpace = bounds.size.x > SINGLE_BRICK_BOUNDS_THRESHOLD
            || bounds.size.y > SINGLE_BRICK_BOUNDS_THRESHOLD
            || bounds.size.z > SINGLE_BRICK_BOUNDS_THRESHOLD;
        if (!spansSpace) {
            return;
        }
        // bounds arrive in the same coordinate frame as pivot; express
        // them relative to the pivot because the box lives inside the
        // pivot-positioned group.
        const box = new THREE.Box3(
            new THREE.Vector3(
                bounds.min.x - bounds.center.x,
                bounds.min.y - bounds.center.y,
                bounds.min.z - bounds.center.z
            ),
            new THREE.Vector3(
                bounds.max.x - bounds.center.x,
                bounds.max.y - bounds.center.y,
                bounds.max.z - bounds.center.z
            )
        );
        this._boundsBox = new THREE.Box3Helper(box, BOUNDS_BOX_COLOR);
        this._boundsBox.material.transparent = true;
        this._boundsBox.material.opacity = BOUNDS_BOX_OPACITY;
        this._boundsBox.material.depthTest = false;
        this._boundsBox.renderOrder = GIZMO_RENDER_ORDER - 1;
        this._group.add(this._boundsBox);
    }

    _updateScale(pivot) {
        const distance = this._renderer.camera.position.distanceTo(
            new THREE.Vector3(pivot.x, pivot.y, pivot.z)
        );
        this._group.scale.setScalar(Math.max(MINIMUM_GIZMO_SCALE, distance * GIZMO_SCALE_FACTOR));
    }

    _applyHighlight() {
        for (const [handleId, meshes] of this._meshesByHandle) {
            const base = this._baseColors.get(handleId);
            let amount = 0;
            if (handleId === this._activeHandleId) {
                amount = 0.6;
            } else if (handleId === this._hoveredHandleId) {
                amount = 0.35;
            }
            for (const mesh of meshes) {
                mesh.material.color.copy(base).lerp(HIGHLIGHT_WHITE, amount);
                mesh.material.opacity = amount > 0 ? 1 : 0.95;
            }
        }
    }
}
