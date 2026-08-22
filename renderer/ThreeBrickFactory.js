import * as THREE from 'three';
import { DEFAULT_STAIR_STEP_COUNT } from '../core/WalkableSurface.js';

// The renderer-side counterpart to core/BrickRegistry: it knows nothing
// about what a brick *means*, only how to turn one specific definitionId
// into a mesh. These are still placeholder shapes (a real Brick Library
// pass will give each core:* id its true geometry) — but the important part
// is the pattern: one factory function per id, looked up by id. A future
// library's renderer-side factories register here exactly the same way.
//
// 0.2.80 — Expanded Brick Vocabulary adds eleven new factories alongside
// the original four. Every factory below builds its geometry CENTERED at
// the origin (the same convention BoxGeometry already used for the
// original four) and, where a factory needs a static orientation (the
// hip roof), bakes it into the GEOMETRY itself via geometry.rotateY(),
// never into mesh.rotation — renderer/BrickRenderer.js SETS
// mesh.rotation.y from the brick's own placement rotation on every
// createMesh() call, so anything a factory left on mesh.rotation would
// simply be overwritten the moment a brick is actually placed.
const DEFAULT_COLOR = 0x4caf7d;

function boxMeshFactory(color, size) {
    return () => {
        const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
        const material = new THREE.MeshStandardMaterial({ color });
        return new THREE.Mesh(geometry, material);
    };
}

// A slender cylinder — core:column. Centered at the origin, same as
// CylinderGeometry's own default.
function columnMeshFactory(color, radius, height) {
    return () => {
        const geometry = new THREE.CylinderGeometry(radius, radius, height, 16);
        const material = new THREE.MeshStandardMaterial({ color });
        return new THREE.Mesh(geometry, material);
    };
}

// A four-sided pyramid — core:roof_hip. ConeGeometry with radialSegments=4
// places its vertices ON the axes (a diamond footprint), so the geometry
// is rotated 45° to align its flat sides with the brick's own bounding
// box instead — the footprint a hip roof sitting on a rectangular
// building actually needs. Only exact for a SQUARE footprint
// (width === depth), which is what core:roof_hip's own BrickDefinition
// declares.
function hipRoofMeshFactory(color, width, depth, height) {
    return () => {
        const radius = Math.sqrt((width / 2) ** 2 + (depth / 2) ** 2);
        const geometry = new THREE.ConeGeometry(radius, height, 4);
        geometry.rotateY(Math.PI / 4);
        const material = new THREE.MeshStandardMaterial({ color });
        return new THREE.Mesh(geometry, material);
    };
}

// A stepped ascending profile, extruded along depth — core:stair. Built
// from a single THREE.Shape (outline traced along the top of each tread,
// then straight back down the riser face and along the base) rather than
// several separate meshes, so it stays one primitive, one mesh, one
// definitionId — never a hidden composite of smaller bricks.
//
// 0.3.3 — `steps` now defaults to core/WalkableSurface.js's own
// DEFAULT_STAIR_STEP_COUNT rather than a locally hardcoded `4` — the
// SAME constant that file's own stepped walkable-surface profile reads,
// so the treads rendered here and the treads an avatar actually climbs
// (application/AvatarStepConstraint.js) can never quietly disagree on
// how many there are. The value itself is unchanged (4), so this is
// pixel-identical to every stair already rendered before this milestone.
function stairMeshFactory(color, width, height, depth, steps = DEFAULT_STAIR_STEP_COUNT) {
    return () => {
        const shape = new THREE.Shape();
        const stepWidth = width / steps;
        const stepHeight = height / steps;
        shape.moveTo(0, 0);
        let x = 0;
        let y = 0;
        for (let i = 0; i < steps; i++) {
            y += stepHeight;
            shape.lineTo(x, y);
            x += stepWidth;
            shape.lineTo(x, y);
        }
        shape.lineTo(width, 0);
        shape.lineTo(0, 0);

        const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
        geometry.translate(-width / 2, -height / 2, -depth / 2);
        const material = new THREE.MeshStandardMaterial({ color });
        return new THREE.Mesh(geometry, material);
    };
}

// A rectangular frame with a semicircular-topped passage cut through its
// center, extruded along depth — core:arch. The opening is a
// THREE.Path hole on the outer THREE.Shape, faceted (straight segments)
// rather than a true curve — a deliberately simple polygon, matching
// every other factory's "single mesh, single primitive" restraint.
function archMeshFactory(color, width, height, depth) {
    return () => {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(width, 0);
        shape.lineTo(width, height);
        shape.lineTo(0, height);
        shape.lineTo(0, 0);

        const margin = Math.min(width, height) * 0.15;
        const halfOpening = width / 2 - margin;
        const springHeight = height * 0.35;
        const groundY = margin;
        const cx = width / 2;
        const segments = 12;

        const hole = new THREE.Path();
        hole.moveTo(cx - halfOpening, groundY);
        hole.lineTo(cx - halfOpening, groundY + springHeight);
        for (let i = 1; i <= segments; i++) {
            const angle = Math.PI - (Math.PI * i) / segments;
            hole.lineTo(
                cx + halfOpening * Math.cos(angle),
                groundY + springHeight + halfOpening * Math.sin(angle)
            );
        }
        hole.lineTo(cx + halfOpening, groundY);
        hole.lineTo(cx - halfOpening, groundY);
        shape.holes.push(hole);

        const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
        geometry.translate(-width / 2, -height / 2, -depth / 2);
        const material = new THREE.MeshStandardMaterial({ color });
        return new THREE.Mesh(geometry, material);
    };
}

const FACTORIES = new Map([
    // Original four (0.1.5) — unchanged.
    ['core:cube', boxMeshFactory(0x4caf7d, [1, 1, 1])],
    ['core:slope_45', boxMeshFactory(0xd08a3e, [1, 1, 1])],
    ['core:plate_2x4', boxMeshFactory(0x5a8fd0, [2, 0.25, 4])],
    ['core:window_small', boxMeshFactory(0x9ad0e6, [1, 1, 0.25])],

    // 0.2.80 — Expanded Brick Vocabulary.
    ['core:block_2x2', boxMeshFactory(0x7d7d7d, [2, 2, 2])],
    ['core:wall_1x3', boxMeshFactory(0xc9b896, [1, 3, 0.25])],
    ['core:slab_4x4', boxMeshFactory(0x9a9a9a, [4, 0.25, 4])],
    ['core:roof_hip', hipRoofMeshFactory(0xa63a3a, 2, 2, 1.5)],
    ['core:stair', stairMeshFactory(0xb0a48f, 1, 1, 1)],
    ['core:column', columnMeshFactory(0xd8d2c0, 0.25, 3)],
    ['core:beam', boxMeshFactory(0x8b5a2b, [4, 0.5, 0.5])],
    ['core:arch', archMeshFactory(0xa89f8a, 2, 2, 0.5)],
    ['core:window_large', boxMeshFactory(0x8cc8e0, [2, 1.5, 0.25])],
    ['core:door', boxMeshFactory(0x6b4226, [1, 2, 0.1])],
    ['core:trim', boxMeshFactory(0xe8e2d0, [1, 0.25, 0.25])]
]);

const FALLBACK_FACTORY = boxMeshFactory(DEFAULT_COLOR, [1, 1, 1]);

export class ThreeBrickFactory {
    createMesh(definitionId) {
        const factory = FACTORIES.get(definitionId) || FALLBACK_FACTORY;
        return factory();
    }
}
