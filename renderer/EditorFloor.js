// The Editor's build stands on one flat floor: the terrain height under its
// origin. renderer/WorldRenderer.js lifts every brick and structure
// placement of the single World the Editor shows by the terrain sampled at
// that World's offset, (0, 0), so the floor is that height everywhere under
// the build, however the hills round it rise and fall.
//
// Everything the Editor draws or picks on that floor uses this one height:
// the ground a pointer is over (renderer/PickingService.js, `groundHeight`),
// and the ghosts of a brick, a structure and a composition about to be
// placed (PreviewRenderer, StructurePreviewRenderer,
// CompositionPreviewRenderer). Picking the ground at y = 0 while bricks
// stand on this floor put a new brick behind the point under the pointer,
// drawn well above it on the screen (about 110 pixels in the Editor's
// opening view, with the default World's floor about 2.7 units up).
//
// `renderer` is anything with terrainHeightAt(x, z) (renderer/Renderer.js);
// without one (tests' fakes) the floor is at 0.
export function editorFloorHeight(renderer) {
    return renderer && typeof renderer.terrainHeightAt === 'function'
        ? renderer.terrainHeightAt(0, 0)
        : 0;
}
