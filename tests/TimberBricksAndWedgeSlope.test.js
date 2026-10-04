import * as THREE from 'three';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { resolveWalkableSurfaceAt, walkableSurfaceKindFor, WalkableSurfaceKind } from '../core/WalkableSurface.js';
import { BrickRenderer } from '../renderer/BrickRenderer.js';
import { ThreeBrickFactory } from '../renderer/ThreeBrickFactory.js';
import { assert } from './support/Assert.js';

// core:slope_45 drawn as the wedge an avatar already walks on, and the two
// timber-framing primitives, core:post and core:brace_2x2.

const registry = new CreateBrickRegistryUseCase().execute();
const renderer = new BrickRenderer(registry, new ThreeBrickFactory());

function meshFor(definitionId, position, rotation = 0) {
    const mesh = renderer.createMesh(new Brick({ definitionId, position, rotation }));
    mesh.updateMatrixWorld(true);
    return mesh;
}

function firstHit(mesh, origin, direction) {
    const raycaster = new THREE.Raycaster(origin, direction.normalize());
    const hits = raycaster.intersectObject(mesh);
    return hits.length > 0 ? hits[0].point : null;
}

function approx(actual, expected, tolerance, message) {
    assert(Math.abs(actual - expected) <= tolerance, `${message} (got ${actual}, expected ~${expected})`);
}

// The two new definitions: sizes chosen to line up with trim (0.25) and
// wall_1x3 (3 tall), grouped with the existing column and beam bricks.
{
    const post = registry.get('core:post');
    assert(post && post.width === 0.25 && post.height === 3 && post.depth === 0.25, 'core:post is 0.25 x 3 x 0.25');
    assert(post.category === 'column', 'core:post sits with the columns');

    const brace = registry.get('core:brace_2x2');
    assert(brace && brace.width === 2 && brace.height === 2 && brace.depth === 0.25, 'core:brace_2x2 is 2 x 2 x 0.25');
    assert(brace.category === 'beam', 'core:brace_2x2 sits with the beams');

    for (const id of ['core:post', 'core:brace_2x2']) {
        assert(walkableSurfaceKindFor(id) === WalkableSurfaceKind.FLAT, `${id} is walked on as an ordinary box`);
        const mesh = meshFor(id, new Position(0, 0, 0));
        mesh.geometry.computeBoundingBox();
        const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
        const definition = registry.get(id);
        approx(size.x, definition.width, 1e-6, `${id} mesh width`);
        approx(size.y, definition.height, 1e-6, `${id} mesh height`);
        approx(size.z, definition.depth, 1e-6, `${id} mesh depth`);
    }
    console.log('✓ core:post and core:brace_2x2 are registered and drawn at their declared size');
}

// The slope is drawn exactly where an avatar walks on it, at every
// rotation the placement tools offer: a ray straight down meets the wedge
// at the height core/WalkableSurface.js reports.
{
    const slope = registry.get('core:slope_45');
    const center = new Position(3, slope.height / 2, -2);
    for (const rotation of [0, 90, 180, 270]) {
        const mesh = meshFor('core:slope_45', center, rotation);
        for (const dx of [-0.4, -0.2, 0, 0.2, 0.4]) {
            for (const dz of [-0.4, 0, 0.4]) {
                const x = center.x + dx;
                const z = center.z + dz;
                const walked = resolveWalkableSurfaceAt({
                    shapeKind: walkableSurfaceKindFor('core:slope_45'),
                    center,
                    width: slope.width,
                    height: slope.height,
                    depth: slope.depth,
                    rotationDegrees: rotation
                }, x, z);
                const hit = firstHit(mesh, new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
                assert(walked && hit, `rotation ${rotation} at (${dx}, ${dz}): both a walkable surface and a drawn one`);
                approx(hit.y, walked.height, 1e-4, `rotation ${rotation} at (${dx}, ${dz}): drawn height matches walked height`);
            }
        }
    }
    console.log('✓ core:slope_45 is drawn as the wedge an avatar walks on, at every rotation');
}

// The brace runs bottom-left to top-right seen from -Z; turned 180° it
// runs the other way, so a pair makes a cross. Rays along Z through the
// four corners of the panel tell the two apart.
{
    const corners = { lowLeft: [-0.8, -0.8], highRight: [0.8, 0.8], highLeft: [-0.8, 0.8], lowRight: [0.8, -0.8] };
    function touched(rotation) {
        const mesh = meshFor('core:brace_2x2', new Position(0, 0, 0), rotation);
        const result = {};
        for (const [name, [x, y]] of Object.entries(corners)) {
            result[name] = firstHit(mesh, new THREE.Vector3(x, y, -5), new THREE.Vector3(0, 0, 1)) !== null;
        }
        result.middle = firstHit(mesh, new THREE.Vector3(0, 0, -5), new THREE.Vector3(0, 0, 1)) !== null;
        return result;
    }
    const plain = touched(0);
    assert(plain.middle && plain.lowLeft && plain.highRight, 'rotation 0 crosses the panel from low left to high right');
    assert(!plain.highLeft && !plain.lowRight, 'rotation 0 leaves the other two corners open');
    const turned = touched(180);
    assert(turned.middle && turned.highLeft && turned.lowRight, 'rotation 180 crosses the panel the other way');
    assert(!turned.lowLeft && !turned.highRight, 'rotation 180 leaves the first diagonal\'s corners open');
    console.log('✓ core:brace_2x2 and its 180° turn make the two diagonals of a cross');
}

// The Village roofs built from slope_45 were laid out while it was still
// drawn as a cube, so their rotations never showed. Each now rises the way
// its roof does: gables toward the ridge, lean-tos toward the back wall,
// with no drop anywhere along the pitch.
function roofHeightAt(structure, x, z) {
    let top = null;
    for (const brick of structure.bricks) {
        const definition = registry.get(brick.definitionId);
        const surface = resolveWalkableSurfaceAt({
            shapeKind: walkableSurfaceKindFor(brick.definitionId),
            center: brick.position,
            width: definition.width,
            height: definition.height,
            depth: definition.depth,
            rotationDegrees: brick.rotation
        }, x, z);
        if (surface && (top === null || surface.height > top)) {
            top = surface.height;
        }
    }
    return top;
}

function structure(id) {
    return VillageLibrary.structures.find((s) => s.id === id);
}

{
    for (const id of ['village:cottage', 'village:small_chapel']) {
        const s = structure(id);
        for (const z of [-1.5, 0, 1.5]) {
            const eaveWest = roofHeightAt(s, -0.95, z);
            const ridgeWest = roofHeightAt(s, -0.05, z);
            const ridgeEast = roofHeightAt(s, 0.05, z);
            const eaveEast = roofHeightAt(s, 0.95, z);
            assert(ridgeWest > eaveWest + 0.5 && ridgeEast > eaveEast + 0.5, `${id}: both slopes rise toward the ridge at z=${z}`);
            approx(ridgeWest, ridgeEast, 0.11, `${id}: the two slopes meet at the ridge at z=${z}`);
        }
    }

    const leanTos = [
        { id: 'village:tool_shed', xs: [-0.5, 0.5], z0: -0.95, z1: 0.95 },
        { id: 'village:stable', xs: [-2.5, 0, 2.5], z0: -1.45, z1: 1.45 }
    ];
    for (const { id, xs, z0, z1 } of leanTos) {
        const s = structure(id);
        for (const x of xs) {
            let previous = -Infinity;
            for (let z = z0; z <= z1 + 1e-9; z += 0.1) {
                const height = roofHeightAt(s, x, z);
                assert(height !== null && height >= previous - 1e-6, `${id}: the roof never drops going back at x=${x}, z=${z.toFixed(2)}`);
                if (previous !== -Infinity) {
                    assert(height - previous <= 0.1 + 1e-6, `${id}: the roof has no step up going back at x=${x}, z=${z.toFixed(2)}`);
                }
                previous = height;
            }
            assert(roofHeightAt(s, x, z1) - roofHeightAt(s, x, z0) > 1, `${id}: one pitch climbs from front to back at x=${x}`);
        }
    }
    console.log('✓ Village slope roofs rise toward their ridge or back wall, without a sawtooth');
}
