import * as THREE from 'three';
import { DEFAULT_STAIR_STEP_COUNT } from '../core/WalkableSurface.js';
import { ARCH_OPENINGS } from '../core/BrickPassage.js';

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
export const DEFAULT_COLOR = 0x4caf7d;

// Choose Your Brick Color — color lives as DATA on BrickDefinition
// (core/library/CoreLibrary.js) and, per-instance, on Brick itself (an
// undoable SetBrickColorCommand overrides it). The builders below make
// geometry only; createMesh() paints it with whatever color it's handed,
// falling back to DEFAULT_COLOR when none is given (e.g. an unknown id).
function boxGeometry(size) {
    return () => {
        const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
        return geometry;
    };
}

// A slender cylinder — core:column. Centered at the origin, same as
// CylinderGeometry's own default.
function columnGeometry(radius, height) {
    return () => {
        const geometry = new THREE.CylinderGeometry(radius, radius, height, 16);
        return geometry;
    };
}

// A four-sided pyramid — core:roof_hip. ConeGeometry with radialSegments=4
// places its vertices ON the axes (a diamond footprint), so the geometry
// is rotated 45° to align its flat sides with the brick's own bounding
// box instead — the footprint a hip roof sitting on a rectangular
// building actually needs. Only exact for a SQUARE footprint
// (width === depth), which is what core:roof_hip's own BrickDefinition
// declares.
function hipRoofGeometry(width, depth, height) {
    return () => {
        const radius = Math.sqrt((width / 2) ** 2 + (depth / 2) ** 2);
        const geometry = new THREE.ConeGeometry(radius, height, 4);
        geometry.rotateY(Math.PI / 4);
        return geometry;
    };
}

// A hipped roof over a whole footprint — core:roof_hip_4x4, _4x6 and _6x6:
// four slopes rising from the eaves to a ridge along the longer side,
// shortened by the shorter side so every slope has the same pitch; over a
// square the ridge is a point. One closed shape, flat-shaded, base at
// -height/2.
function hippedRoofGeometry(width, depth, height) {
    return () => {
        const x = width / 2;
        const z = depth / 2;
        const y0 = -height / 2;
        const y1 = height / 2;
        const ridgeX = Math.max(0, (width - depth) / 2);
        const ridgeZ = Math.max(0, (depth - width) / 2);
        const corners = [[-x, y0, -z], [x, y0, -z], [x, y0, z], [-x, y0, z]];
        const ridgeA = [-ridgeX, y1, -ridgeZ];
        const ridgeB = [ridgeX, y1, ridgeZ];
        const [sw, se, ne, nw] = corners;
        const triangles = [
            // South and north slopes, east and west ends (each wound to face out).
            [sw, ridgeA, se], [se, ridgeA, ridgeB],
            [ne, ridgeB, nw], [nw, ridgeB, ridgeA],
            [se, ridgeB, ne], [nw, ridgeA, sw],
            // The underside.
            [sw, se, ne], [sw, ne, nw]
        ].filter(([a, b, c]) => !(same(a, b) || same(b, c) || same(a, c)));
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles.flat(2), 3));
        geometry.computeVertexNormals();
        return geometry;
    };
}

function same(a, b) {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
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
// (application/avatar/AvatarStepConstraint.js) can never quietly disagree on
// how many there are. The value itself is unchanged (4), so this is
// pixel-identical to every stair already rendered before this milestone.
function stairGeometry(width, height, depth, steps = DEFAULT_STAIR_STEP_COUNT) {
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
        return geometry;
    };
}

// A right-triangle profile extruded along depth — core:slope_45. Rises
// along local +X, from nothing at the front face to the full height at the
// back, the same direction core/WalkableSurface.js's SLOPE profile climbs
// and core:stair rises, so what is drawn is what an avatar walks on.
function wedgeGeometry(width, height, depth) {
    return () => {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(width, 0);
        shape.lineTo(width, height);
        shape.lineTo(0, 0);

        const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
        geometry.translate(-width / 2, -height / 2, -depth / 2);
        return geometry;
    };
}

// A straight bar from the bottom-left to the top-right corner of its
// width x height face, clipped flush to that box, extruded along depth —
// core:brace_2x2. Rises along local +X like the slope and stair; turning
// it 180° gives the opposite diagonal, so two make a cross. `barWidth` is
// measured across the bar, not along an edge.
function braceGeometry(width, height, depth, barWidth) {
    return () => {
        const length = Math.hypot(width, height);
        const cutX = (barWidth * length) / height;
        const cutY = (barWidth * length) / width;
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(cutX, 0);
        shape.lineTo(width, height - cutY);
        shape.lineTo(width, height);
        shape.lineTo(width - cutX, height);
        shape.lineTo(0, cutY);
        shape.lineTo(0, 0);

        const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
        geometry.translate(-width / 2, -height / 2, -depth / 2);
        return geometry;
    };
}

// A rectangular frame with a round-topped passage through it, extruded
// along depth — core:arch and core:arch_small. The opening's shape is
// core/BrickPassage.js#ARCH_OPENINGS, the same one an avatar's collision
// with the arch follows, so the way through that is drawn is the way
// through that walks. The curve is faceted (straight segments) rather than
// a true curve, matching every other factory's "single mesh, single
// primitive" restraint. An opening down to the ground (no sill) is cut
// into the outline itself, an inverted U; one above a sill is a hole.
const ARCH_SEGMENTS = 12;

function archGeometry(width, height, depth, opening) {
    return () => {
        const cx = width / 2;
        const curve = [];
        // Evenly round the ellipse, not evenly across it, so the steep ends
        // of the curve get as many facets as its flat top.
        for (let i = 0; i <= ARCH_SEGMENTS; i++) {
            const angle = Math.PI - (Math.PI * i) / ARCH_SEGMENTS;
            curve.push([
                cx + opening.halfWidth * Math.cos(angle),
                opening.sill + opening.spring + opening.rise * Math.sin(angle)
            ]);
        }

        const shape = new THREE.Shape();
        if (opening.sill > 0) {
            shape.moveTo(0, 0);
            shape.lineTo(width, 0);
            shape.lineTo(width, height);
            shape.lineTo(0, height);
            shape.lineTo(0, 0);
            const hole = new THREE.Path();
            hole.moveTo(cx - opening.halfWidth, opening.sill);
            for (const [x, y] of curve) hole.lineTo(x, y);
            hole.lineTo(cx + opening.halfWidth, opening.sill);
            hole.lineTo(cx - opening.halfWidth, opening.sill);
            shape.holes.push(hole);
        } else {
            shape.moveTo(0, 0);
            shape.lineTo(cx - opening.halfWidth, 0);
            for (const [x, y] of curve) shape.lineTo(x, y);
            shape.lineTo(cx + opening.halfWidth, 0);
            shape.lineTo(width, 0);
            shape.lineTo(width, height);
            shape.lineTo(0, height);
            shape.lineTo(0, 0);
        }

        const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
        geometry.translate(-width / 2, -height / 2, -depth / 2);
        return geometry;
    };
}

// An upright cylinder or cone filling its width x height x depth box —
// core:round_1x1, core:pillar, core:barrel (16 sides); a cone for
// core:roof_cone and the eight-sided core:pine_tree.
function cylinderGeometry(diameter, height, segments = 16) {
    return () => new THREE.CylinderGeometry(diameter / 2, diameter / 2, height, segments);
}

function coneGeometry(diameter, height, segments = 16) {
    return () => new THREE.ConeGeometry(diameter / 2, height, segments);
}

// A cylinder lying along local X — core:log.
function logGeometry(length, diameter) {
    return () => {
        const geometry = new THREE.CylinderGeometry(diameter / 2, diameter / 2, length, 12);
        geometry.rotateZ(Math.PI / 2);
        return geometry;
    };
}

// A profile in the width x height face, extruded along depth and centered:
// the shared last step of every shape below.
function extrudeProfile(shape, width, height, depth) {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geometry.translate(-width / 2, -height / 2, -depth / 2);
    return geometry;
}

// A triangular prism with its ridge along local Z, over the middle of its
// width — core:roof_gable and core:roof_ridge.
function gableGeometry(width, height, depth) {
    return () => {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(width, 0);
        shape.lineTo(width / 2, height);
        shape.lineTo(0, 0);
        return extrudeProfile(shape, width, height, depth);
    };
}

// core:slope_45 turned upside down — core:slope_inverted. Full width at
// the top, narrowing to its back edge at the bottom, for eaves.
function invertedWedgeGeometry(width, height, depth) {
    return () => {
        const shape = new THREE.Shape();
        shape.moveTo(width, 0);
        shape.lineTo(width, height);
        shape.lineTo(0, height);
        shape.lineTo(width, 0);
        return extrudeProfile(shape, width, height, depth);
    };
}

// A rectangle with holes cut through it, extruded along depth: a window
// frame, a ladder, a fence. `holes` are [x, y, w, h] rectangles.
function panelWithHoles(width, height, depth, holes) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(width, 0);
    shape.lineTo(width, height);
    shape.lineTo(0, height);
    shape.lineTo(0, 0);
    for (const [x, y, w, h] of holes) {
        const hole = new THREE.Path();
        hole.moveTo(x, y);
        hole.lineTo(x, y + h);
        hole.lineTo(x + w, y + h);
        hole.lineTo(x + w, y);
        hole.lineTo(x, y);
        shape.holes.push(hole);
    }
    return extrudeProfile(shape, width, height, depth);
}

// A square frame around a see-through opening — core:window_frame.
function windowFrameGeometry(width, height, depth, frame = 0.15) {
    return () => panelWithHoles(width, height, depth, [[frame, frame, width - 2 * frame, height - 2 * frame]]);
}

// A square panel with a round opening — core:window_round.
function roundWindowGeometry(width, height, depth) {
    return () => {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(width, 0);
        shape.lineTo(width, height);
        shape.lineTo(0, height);
        shape.lineTo(0, 0);
        const hole = new THREE.Path();
        hole.absarc(width / 2, height / 2, Math.min(width, height) * 0.35, 0, Math.PI * 2, true);
        shape.holes.push(hole);
        return extrudeProfile(shape, width, height, depth);
    };
}

// Two rails and evenly spaced rungs — core:ladder.
function ladderGeometry(width, height, depth, rungs = 8) {
    return () => {
        const rail = 0.12;
        const rung = 0.08;
        const gap = (height - (rungs + 1) * rung) / rungs;
        const holes = [];
        for (let i = 0; i < rungs; i++) {
            holes.push([rail, rung + i * (gap + rung), width - 2 * rail, gap]);
        }
        return panelWithHoles(width, height, depth, holes);
    };
}

// Pickets joined by two rails — core:fence.
function fenceGeometry(width, height, depth, pickets = 6) {
    return () => {
        const picket = 0.12;
        const gap = (width - pickets * picket) / (pickets - 1);
        const holes = [];
        for (let i = 0; i < pickets - 1; i++) {
            const x = picket + i * (picket + gap);
            // Open between the ground and the low rail, and between the rails.
            holes.push([x, 0.15, gap, height * 0.25]);
            holes.push([x, 0.15 + height * 0.25 + 0.1, gap, height * 0.35]);
        }
        return panelWithHoles(width, height, depth, holes);
    };
}

// A seat on two legs, seen from the front and extruded along depth — core:bench.
function benchGeometry(width, height, depth) {
    return () => {
        const seat = height * 0.3;
        const leg = width * 0.12;
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(leg, 0);
        shape.lineTo(leg, height - seat);
        shape.lineTo(width - leg, height - seat);
        shape.lineTo(width - leg, 0);
        shape.lineTo(width, 0);
        shape.lineTo(width, height);
        shape.lineTo(0, height);
        shape.lineTo(0, 0);
        return extrudeProfile(shape, width, height, depth);
    };
}

// Boxes joined into one shape, each `[width, height, depth, x, y, z]` with
// x, y, z its middle measured from the brick's bottom-front-left corner;
// the result is centered like every other brick. For furniture.
function boxesGeometry(width, height, depth, parts) {
    return () => {
        const positions = [];
        const normals = [];
        const uvs = [];
        for (const [w, h, d, x, y, z] of parts) {
            const part = new THREE.BoxGeometry(w, h, d).toNonIndexed();
            part.translate(x - width / 2, y - height / 2, z - depth / 2);
            positions.push(...part.getAttribute('position').array);
            normals.push(...part.getAttribute('normal').array);
            uvs.push(...part.getAttribute('uv').array);
            part.dispose();
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        return geometry;
    };
}

// A top on four legs — core:table.
function tableGeometry(width, height, depth) {
    const top = 0.1;
    const leg = 0.1;
    const legHeight = height - top;
    const parts = [[width, top, depth, width / 2, height - top / 2, depth / 2]];
    for (const x of [leg / 2 + 0.05, width - leg / 2 - 0.05]) {
        for (const z of [leg / 2 + 0.05, depth - leg / 2 - 0.05]) parts.push([leg, legHeight, leg, x, legHeight / 2, z]);
    }
    return boxesGeometry(width, height, depth, parts);
}

// A frame, a mattress and a headboard at the back (far end of the depth) — core:bed.
function bedGeometry(width, height, depth) {
    const headboard = 0.1;
    return boxesGeometry(width, height, depth, [
        [width, 0.25, depth - headboard, width / 2, 0.125, (depth - headboard) / 2],
        [width - 0.1, 0.2, depth - headboard - 0.1, width / 2, 0.35, (depth - headboard) / 2],
        [width, height, headboard, width / 2, height / 2, depth - headboard / 2]
    ]);
}

// A stone fireplace open at the front: a back, two cheeks and a mantel — core:hearth.
function hearthGeometry(width, height, depth) {
    const back = 0.25;
    const cheek = 0.3;
    const opening = height * 0.6;
    return boxesGeometry(width, height, depth, [
        [width, height, back, width / 2, height / 2, depth - back / 2],
        [cheek, opening, depth - back, cheek / 2, opening / 2, (depth - back) / 2],
        [cheek, opening, depth - back, width - cheek / 2, opening / 2, (depth - back) / 2],
        [width, height - opening, depth - back, width / 2, opening + (height - opening) / 2, (depth - back) / 2]
    ]);
}

// Two sides, a back and three boards — core:shelf.
function shelfGeometry(width, height, depth, boards = 3) {
    const side = 0.08;
    const board = 0.06;
    const back = 0.04;
    const parts = [
        [side, height, depth, side / 2, height / 2, depth / 2],
        [side, height, depth, width - side / 2, height / 2, depth / 2],
        [width - 2 * side, height, back, width / 2, height / 2, depth - back / 2]
    ];
    for (let i = 0; i < boards; i++) {
        const y = board / 2 + (i * (height - board)) / (boards - 1);
        parts.push([width - 2 * side, board, depth - back, width / 2, y, (depth - back) / 2]);
    }
    return boxesGeometry(width, height, depth, parts);
}

// Faceted round shapes scaled to their box — core:bush and core:rock.
function polyhedronGeometry(PolyhedronGeometry, detail, [width, height, depth]) {
    return () => {
        const geometry = new PolyhedronGeometry(0.5, detail);
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        geometry.scale(width / (box.max.x - box.min.x), height / (box.max.y - box.min.y), depth / (box.max.z - box.min.z));
        return geometry;
    };
}

const GEOMETRIES = new Map([
    // Original four (0.1.5).
    ['core:cube', boxGeometry([1, 1, 1])],
    ['core:slope_45', wedgeGeometry(1, 1, 1)],
    ['core:plate_2x4', boxGeometry([2, 0.25, 4])],
    ['core:window_small', boxGeometry([1, 1, 0.25])],

    // 0.2.80 — Expanded Brick Vocabulary.
    ['core:block_2x2', boxGeometry([2, 2, 2])],
    ['core:wall_1x3', boxGeometry([1, 3, 0.25])],
    ['core:slab_4x4', boxGeometry([4, 0.25, 4])],
    ['core:roof_hip', hipRoofGeometry(2, 2, 1.5)],
    ['core:stair', stairGeometry(1, 1, 1)],
    ['core:column', columnGeometry(0.25, 3)],
    ['core:beam', boxGeometry([4, 0.5, 0.5])],
    ['core:arch', archGeometry(2, 2, 0.5, ARCH_OPENINGS['core:arch'])],
    ['core:window_large', boxGeometry([2, 1.5, 0.25])],
    ['core:door', boxGeometry([1, 2, 0.1])],
    ['core:trim', boxGeometry([1, 0.25, 0.25])],
    ['core:post', boxGeometry([0.25, 3, 0.25])],
    ['core:brace_2x2', braceGeometry(2, 2, 0.25, 0.25)],

    // The Builder's kit (2026-10-10).
    ['core:cube_half', boxGeometry([1, 0.5, 1])],
    ['core:brick_1x2', boxGeometry([2, 1, 1])],
    ['core:brick_1x4', boxGeometry([4, 1, 1])],
    ['core:plate_1x1', boxGeometry([1, 0.25, 1])],
    ['core:plate_2x2', boxGeometry([2, 0.25, 2])],
    ['core:round_1x1', cylinderGeometry(1, 1)],
    ['core:round_plate_2x2', cylinderGeometry(2, 0.25, 24)],
    ['core:wall_1x1', boxGeometry([1, 1, 0.25])],
    ['core:wall_2x3', boxGeometry([2, 3, 0.25])],
    ['core:wall_half_2x1', boxGeometry([2, 1, 0.25])],
    ['core:pillar', cylinderGeometry(1, 3)],
    ['core:beam_short', boxGeometry([2, 0.5, 0.5])],
    ['core:log', logGeometry(4, 0.5)],
    ['core:slope_shallow', wedgeGeometry(2, 1, 1)],
    ['core:slope_inverted', invertedWedgeGeometry(1, 1, 1)],
    ['core:roof_gable', gableGeometry(2, 1, 2)],
    ['core:roof_cone', coneGeometry(2, 2)],
    ['core:roof_ridge', gableGeometry(1, 0.5, 1)],
    // Roofs that span a house (Make it yours, in the village, 2026-10-12).
    ['core:roof_hip_4x4', hippedRoofGeometry(4, 4, 2)],
    ['core:roof_hip_4x6', hippedRoofGeometry(4, 6, 2)],
    ['core:roof_hip_6x6', hippedRoofGeometry(6, 6, 2.5)],
    ['core:roof_gable_2x4', gableGeometry(2, 1, 4)],
    ['core:stair_wide', stairGeometry(1, 1, 2)],
    ['core:ladder', ladderGeometry(1, 3, 0.15)],
    ['core:window_frame', windowFrameGeometry(1, 1, 0.25)],
    ['core:window_round', roundWindowGeometry(1, 1, 0.25)],
    ['core:door_double', boxGeometry([2, 2, 0.1])],
    ['core:shutter', boxGeometry([0.5, 1, 0.05])],
    ['core:arch_small', archGeometry(1, 1.5, 0.5, ARCH_OPENINGS['core:arch_small'])],
    ['core:fence', fenceGeometry(2, 1, 0.15)],
    ['core:chimney', boxGeometry([0.75, 1.5, 0.75])],
    ['core:barrel', cylinderGeometry(0.8, 1)],
    ['core:bench', benchGeometry(2, 0.5, 0.5)],
    ['core:table', tableGeometry(1.5, 0.8, 1)],
    ['core:bed', bedGeometry(1, 0.7, 2)],
    ['core:hearth', hearthGeometry(1.5, 1.5, 0.75)],
    ['core:shelf', shelfGeometry(1, 1.5, 0.4)],
    ['core:bush', polyhedronGeometry(THREE.IcosahedronGeometry, 1, [1, 1, 1])],
    ['core:pine_tree', coneGeometry(1.5, 2.5, 8)],
    ['core:rock', polyhedronGeometry(THREE.DodecahedronGeometry, 0, [1, 1, 1])],
    ['core:lawn_2x2', boxGeometry([2, 0.1, 2])]
]);

const FALLBACK_GEOMETRY = boxGeometry([1, 1, 1]);

export class ThreeBrickFactory {
    // color: optional 0xRRGGBB override — Choose Your Brick Color. Falls
    // back to DEFAULT_COLOR when omitted; callers that know a
    // BrickDefinition/Brick color (renderer/BrickRenderer.js,
    // renderer/PreviewRenderer.js) pass it explicitly instead of leaving
    // every brick the same hardcoded shade.
    createMesh(definitionId, color = DEFAULT_COLOR) {
        const material = new THREE.MeshStandardMaterial({ color });
        return new THREE.Mesh(this.createGeometry(definitionId), material);
    }

    // A new geometry for this id, centered at the origin, with no color:
    // what a mesh is built from, and what renderer/BrickInstanceRegistry.js
    // draws every instance of this id with.
    createGeometry(definitionId) {
        return (GEOMETRIES.get(definitionId) || FALLBACK_GEOMETRY)();
    }
}
