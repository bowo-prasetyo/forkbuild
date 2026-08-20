import { LibraryPreviewService } from './LibraryPreviewService.js';
import { DocumentThumbnailRenderer } from '../renderer/DocumentThumbnailRenderer.js';

// 0.2.84 (Building Library & Palette UX) — builds one Build Library
// preview service per Editor session, the same "construct once, hand
// the registry it already has" shape application/CreatePreviewUseCase.js
// establishes for Publications. Deliberately editor-scoped rather than
// app-wide: unlike Repository/Author View's PreviewService (provided at
// the App root so its cache survives route changes), the Build Library
// only exists inside the Editor, so its preview cache living exactly as
// long as ui/views/EditorView.js does is the right lifetime already —
// no provide/inject wiring needed.
export class CreateLibraryPreviewUseCase {
    execute(registry) {
        const libraryPreviewService = new LibraryPreviewService({
            // Lazy — see LibraryPreviewService's own comment. The
            // actual WebGL context/canvas is only created on the FIRST
            // real preview request, not merely because the Editor
            // opened.
            createRenderer: () => new DocumentThumbnailRenderer(registry)
        });

        return { libraryPreviewService };
    }
}
