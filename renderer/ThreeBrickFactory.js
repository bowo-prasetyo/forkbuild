import * as THREE from 'three';

// The renderer-side counterpart to core/BrickRegistry: it knows nothing
// about what a brick *means*, only how to turn one specific definitionId
// into a mesh. These are still placeholder shapes (a real Brick Library
// pass will give each core:* id its true geometry) — but the important part
// is the pattern: one factory function per id, looked up by id. A future
// library's renderer-side factories register here exactly the same way.
const DEFAULT_COLOR = 0x4caf7d;

function boxMeshFactory(color, size) {
    return () => {
        const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
        const material = new THREE.MeshStandardMaterial({ color });
        return new THREE.Mesh(geometry, material);
    };
}

const FACTORIES = new Map([
    ['core:cube', boxMeshFactory(0x4caf7d, [1, 1, 1])],
    ['core:slope_45', boxMeshFactory(0xd08a3e, [1, 1, 1])],
    ['core:plate_2x4', boxMeshFactory(0x5a8fd0, [2, 0.25, 4])],
    ['core:window_small', boxMeshFactory(0x9ad0e6, [1, 1, 0.25])]
]);

const FALLBACK_FACTORY = boxMeshFactory(DEFAULT_COLOR, [1, 1, 1]);

export class ThreeBrickFactory {
    createMesh(definitionId) {
        const factory = FACTORIES.get(definitionId) || FALLBACK_FACTORY;
        return factory();
    }
}
