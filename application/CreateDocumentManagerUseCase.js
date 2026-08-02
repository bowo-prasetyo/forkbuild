import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentManager } from './DocumentManager.js';

// Builds a DocumentManager wrapping the given World in a fresh Document.
// application/ constructs Document/DocumentMetadata (both core/ classes)
// so that ui/ never has to import core/ directly just to get a
// DocumentManager — same reasoning as PlacementTool constructing its own
// PlacementValidator instead of EditorView doing it (see
// Architecture.md). world isn't available until CreateDemoWorldUseCase
// has already run, so this takes it as a parameter rather than
// constructing its own, unlike CreateEventBusUseCase/
// CreateBrickRegistryUseCase which have no such dependency.
export class CreateDocumentManagerUseCase {
    execute(world) {
        const metadata = new DocumentMetadata({ created: new Date() });
        return new DocumentManager(new Document({ world, metadata }));
    }
}
