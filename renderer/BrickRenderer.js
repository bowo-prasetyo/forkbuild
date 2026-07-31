import * as THREE from 'three';

// TEMPORARY placeholder geometry: every brick becomes the same plain colored
// box regardless of its `type`. This class is the seam the Brick Library
// (Step 5) plugs into — a real library swaps out what happens inside
// createMesh() (a lookup by brick.type against registered geometries), but
// the interface itself — one Brick in, one THREE.Object3D out — won't change.
const PLACEHOLDER_SIZE = 1;
const PLACEHOLDER_COLOR = 0x4caf7d;

export class BrickRenderer {
    createMesh(brick) {
        const geometry = new THREE.BoxGeometry(
            PLACEHOLDER_SIZE,
            PLACEHOLDER_SIZE,
            PLACEHOLDER_SIZE
        );
        const material = new THREE.MeshStandardMaterial({ color: PLACEHOLDER_COLOR });
        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.set(brick.position.x, brick.position.y, brick.position.z);
        mesh.rotation.y = brick.rotation;
        mesh.name = brick.id;

        return mesh;
    }
}
