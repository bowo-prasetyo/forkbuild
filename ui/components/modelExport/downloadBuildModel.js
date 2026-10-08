import { collectModelBricks, writeBuildModel } from '../../../application/export/BuildModelExport.js';
import { extractBuildMeshes } from '../../../renderer/BuildMeshExtraction.js';

// Downloads `world` (a build, with the structures placed in it that
// `resolveWorld` finds on this device) as a 3D model in `format`
// (core/BuildModelFormats.js). Brings in Three.js, so pages that don't
// already have it import this when asked. Returns `{ fileName,
// missingPlacements }`; throws a UserFacingError for a build with nothing
// in it.
export function downloadBuildModel({ format, world, resolveWorld, registry, metadata }) {
    const { bricks, missingPlacements } = collectModelBricks(world, resolveWorld);
    const meshes = extractBuildMeshes(bricks, registry);
    const file = writeBuildModel({ format, meshes, metadata });
    const url = URL.createObjectURL(new Blob([file.data], { type: file.mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return Object.freeze({ fileName: file.fileName, missingPlacements });
}
