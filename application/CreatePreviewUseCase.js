import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LoadPublicationDocumentUseCase } from './LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from './CreateBrickRegistryUseCase.js';
import { PreviewService } from './PreviewService.js';
import { DocumentThumbnailRenderer } from '../renderer/DocumentThumbnailRenderer.js';

// Builds the app-wide preview generation service — a local rendering
// cache, not publication data (see docs/Principles.md, "Previews Are
// Derived Client State"). Constructed once and provided at the App
// root (see ui/App.js, the same provide/inject convention LoginModal's
// identityUseCase already uses), so its cache and generation queue are
// genuinely shared across every catalog view a person navigates
// between — browsing Repository, opening an Author page, and coming
// back doesn't re-render anything already generated.
//
// Same shape as CreateDiscoveryUseCase/CreateWorldViewUseCase: its own
// LocalStorageProvider, reading/writing the same underlying browser
// storage every other Create*UseCase already does — not a shared JS
// instance, the established pattern throughout this codebase.
export class CreatePreviewUseCase {
    execute() {
        const storageProvider = new LocalStorageProvider();
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storageProvider);
        const registry = new CreateBrickRegistryUseCase().execute();

        const previewService = new PreviewService({
            loadPublicationDocumentUseCase,
            // Lazy — see PreviewService's own comment. The actual
            // WebGL context/canvas is only created on the FIRST real
            // preview request, not merely because the app booted.
            createRenderer: () => new DocumentThumbnailRenderer(registry)
        });

        return { previewService };
    }
}
