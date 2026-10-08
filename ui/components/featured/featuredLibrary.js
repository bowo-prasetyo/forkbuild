import { CreateBrickRegistryUseCase } from '../../../application/editor/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../../../application/editor/CreateStructureRegistryUseCase.js';
import { CreateLibraryPreviewUseCase } from '../../../application/editor/CreateLibraryPreviewUseCase.js';

// What the ready-made builds (Home, the Repository, My Worlds) and Home's
// showcase draw from: the built-in brick and structure libraries, and one
// thumbnail service. Built the first time one of them loads (never with
// the app) and kept for the page's lifetime, so moving between those pages
// reuses the thumbnails and the one WebGL context they are drawn with.
let library = null;

export function featuredLibrary() {
    if (!library) {
        const brickRegistry = new CreateBrickRegistryUseCase().execute();
        const structureRegistry = new CreateStructureRegistryUseCase().execute();
        const { libraryPreviewService } = new CreateLibraryPreviewUseCase().execute(brickRegistry);
        library = { brickRegistry, structureRegistry, previewService: libraryPreviewService };
    }
    return library;
}

// Whether this browser can draw WebGL at all, asked of a throwaway canvas so
// Three.js never logs its own error for a browser that can't.
export function canDrawWebGl() {
    try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
        return false;
    }
}
