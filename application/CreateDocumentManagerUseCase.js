import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentManager } from './DocumentManager.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';

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

    // identityProvider is optional and, as of 0.1.21, only ever used to
    // populate DocumentMetadata.author from currentUser().username — the
    // first thing that gives that field real meaning since it was added
    // in 0.1.17. No login UI exists yet, so currentUser() will return
    // null (and author will stay null) until 0.1.21B builds one; the
    // wiring is correct and tested regardless of whether anyone is
    // actually logged in.
    // 0.2.95 — `authorIdentityId` is stamped the SAME way `author`
    // already is, just from the stronger signing surface instead of
    // the login-label one — see core/DocumentMetadata.js's own 0.2.95
    // comment on why both are recorded, and identity/
    // resolveSigningIdentityId.js on why this never throws even when
    // identityProvider has no crypto surface (or nobody is logged in).
    attachWorld(documentManager, world, identityProvider = null) {
        const currentUser = identityProvider ? identityProvider.currentUser() : null;
        const metadata = new DocumentMetadata({
            created: new Date(),
            author: currentUser ? currentUser.username : null,
            authorIdentityId: resolveSigningIdentityId(identityProvider)
        });
        documentManager.newDocument(new Document({ world, metadata }));
    }
}
