import { TransformMath } from '../editor/TransformMath.js';
import {
    BUILD_MODEL_FORMATS, BUILD_MODEL_MIME_TYPES, BuildModelFormat, countTriangles, writeGlb, writeObj, writeStl
} from '../../core/BuildModelFormats.js';
import { UserFacingError } from '../../core/UserFacingError.js';
import { message } from '../../core/Message.js';

// Exporting a build as a 3D model (core/BuildModelFormats.js): its own
// bricks, and the bricks of each structure placed in it, where the World
// View draws them (renderer/WorldRenderer.js: a placement's bricks turned
// about its origin by its rotation, then moved to its position, one level
// deep), into a file named after the build.

// The bricks to export from `world`: its buildings' bricks as they are, and
// for each structure placement the bricks of the build it names
// (`resolveWorld(documentId)` -> World, or null when it isn't on this
// device: that placement is left out and counted in `missingPlacements`).
export function collectModelBricks(world, resolveWorld = () => null) {
    const bricks = [];
    for (const building of world.getBuildings()) bricks.push(...building.getBricks());
    let missingPlacements = 0;
    for (const placement of world.getStructurePlacements()) {
        let placed = null;
        try {
            placed = resolveWorld(placement.documentId);
        } catch {
            placed = null;
        }
        if (!placed) {
            missingPlacements++;
            continue;
        }
        for (const building of placed.getBuildings()) {
            for (const brick of building.getBricks()) {
                const turned = placement.rotation
                    ? TransformMath.rotatePointAroundPivotY(brick.position, { x: 0, y: 0, z: 0 }, placement.rotation)
                    : brick.position;
                bricks.push(Object.freeze({
                    definitionId: brick.definitionId,
                    color: brick.color,
                    rotation: brick.rotation + placement.rotation,
                    tilt: brick.tilt || 0,
                    position: Object.freeze({
                        x: turned.x + placement.position.x,
                        y: turned.y + placement.position.y,
                        z: turned.z + placement.position.z
                    })
                }));
            }
        }
    }
    return Object.freeze({ bricks, missingPlacements });
}

// `forkbuild-<title>.<format>`.
export function buildModelFileName(title, format) {
    const slug = String(title || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return `forkbuild-${slug || 'build'}.${format}`;
}

// The file for `meshes` (renderer/BuildMeshExtraction.js) in `format`:
// `{ data, mimeType, fileName, triangles }`, `data` an ArrayBuffer (.glb,
// .stl) or text (.obj). Refuses a build with nothing to draw.
export function writeBuildModel({ format, meshes, metadata = {} }) {
    if (!BUILD_MODEL_FORMATS.includes(format)) throw new Error(`Unknown model format: ${format}`);
    const triangles = countTriangles(meshes);
    if (triangles === 0) throw new UserFacingError(message('modelExport.empty'));
    const data = format === BuildModelFormat.GLB
        ? writeGlb({ meshes, metadata })
        : format === BuildModelFormat.STL ? writeStl({ meshes, metadata }) : writeObj({ meshes, metadata });
    return Object.freeze({ data, mimeType: BUILD_MODEL_MIME_TYPES[format], fileName: buildModelFileName(metadata.title, format), triangles });
}
