// How a streamed tile's GPU resources are freed once
// renderer/TerrainStreamingController.js unloads it. Removing an object
// from the scene frees nothing on the GPU: its buffers stay allocated
// until something calls dispose(), so without these every tile ever
// streamed in would stay in GPU memory for the life of the page.
//
// Two kinds of tile, two policies, because they own different things:

// Terrain and water tiles build their own geometry and material per tile
// (renderer/TerrainTileMesh.js, renderer/WaterTileMesh.js), so both go.
export function disposeOwnedTile(object) {
    object.traverse((node) => {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                material.dispose();
            }
        }
    });
}

// Vegetation and wildlife tiles are InstancedMeshes over geometry and
// materials SHARED by every tile (the species presets in
// renderer/NaturalFeatureTileMesh.js and renderer/WildlifeTileMesh.js).
// Only each mesh's own per-instance buffers belong to the tile; disposing
// the shared geometry or material would blank every other tile.
export function disposeInstancedTile(object) {
    object.traverse((node) => {
        if (node.isInstancedMesh) node.dispose();
    });
}
