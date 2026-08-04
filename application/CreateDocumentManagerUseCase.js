import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentManager } from './DocumentManager.js';

// application/ constructs Document/DocumentMetadata (both core/ classes)
// so ui/ never has to import core/Document directly just to get a
// DocumentManager — same reasoning as PlacementTool constructing its own
// PlacementValidator instead of EditorView doing it.
//
// Split into two methods because of when each is needed: execute()
// builds an empty DocumentManager, safe to construct before a World
// exists — Toolbar needs one as a required prop for its very first
// render, well before CreateDemoWorldUseCase has run. attachWorld()
// points an existing DocumentManager at a real World once one exists,
// called from onMounted() after the World has already been populated
// and its events fired into an already-subscribed renderer.
export class CreateDocumentManagerUseCase {
    execute() {
        return new DocumentManager();
    }

    attachWorld(documentManager, world) {
        const metadata = new DocumentMetadata({ created: new Date() });
        documentManager.newDocument(new Document({ world, metadata }));
    }
}
