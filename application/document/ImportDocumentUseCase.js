import { DocumentSerializer } from '../../serializer/DocumentSerializer.js';
import { DocumentCloneService } from './DocumentCloneService.js';

// 0.9.642 — Editor Document Import. Runs exactly the pipeline the 0.9.640
// audit's own Section F flagship and Section L recommendation already
// live-proved, from existing production classes — no new serialization
// code, no new identity mechanism, no new persistence path:
//
//   json -> DocumentSerializer.deserialize() -> DocumentCloneService.execute()
//           (migrate -> validate -> construct)   (fresh local identity)
//
// deserialize() throws before anything downstream ever runs when `json`
// is malformed (invalid JSON structure, missing fields, an unsupported
// schemaVersion or protocolVersion) — see DocumentSerializer's own
// header for the migrate -> validate -> construct ordering this class
// inherits for free rather than re-implementing. Nothing here ever
// touches a StorageProvider or a DocumentManifest: like
// ExportDocumentUseCase, this is pure construction — the caller
// (EditorSession#importDocument()) decides what becomes of the result,
// and nothing is persisted until the user's own, later, explicit Save.
//
// Identity rule (0.9.640 Section D, live-reproduced there as an actual
// manifest-corrupting key collision): the source document's own
// `world.id` is NEVER reused as the imported document's local identity.
// DocumentCloneService — already the shared engine behind Fork/Duplicate
// — mints a completely fresh world.id (and fresh building/brick ids)
// while preserving every other field of content.
export class ImportDocumentUseCase {
    constructor(documentSerializer = new DocumentSerializer(), documentCloneService = new DocumentCloneService()) {
        this._documentSerializer = documentSerializer;
        this._documentCloneService = documentCloneService;
    }

    execute(json) {
        const sourceDocument = this._documentSerializer.deserialize(json);
        return this._documentCloneService.execute(sourceDocument, {
            title: sourceDocument.metadata.title,
            description: sourceDocument.metadata.description,
            author: sourceDocument.metadata.author,
            authorIdentityId: sourceDocument.metadata.authorIdentityId,
            license: sourceDocument.metadata.license,
            // An imported document is not a fork of anything that exists
            // on THIS device — the source's own world.id names a document
            // that lives (if anywhere) on a different device's storage.
            // DocumentCloneService's own default would record that
            // dangling, locally-unresolvable id as parentDocumentId —
            // correct for Fork/Duplicate (whose source document really
            // is sitting right here), wrong for Import. Left null
            // deliberately, per the 0.9.640 audit's own Section D open
            // question — a real product decision, made explicitly here
            // rather than defaulted into silently.
            parentDocumentId: null
        });
    }
}
