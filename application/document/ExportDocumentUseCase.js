import { Document } from '../../core/Document.js';
import { DocumentSerializer } from '../../serializer/DocumentSerializer.js';

// 0.9.641 — Editor Document Export. The smallest possible use case
// wrapping the existing DocumentSerializer.serialize() seam — see
// tests/EditorDocumentPortabilityBoundaryAudit.test.js Section C, which
// already live-confirmed this is the exact class ten other production
// flows (Save, Load, Fork, ...) share. Mirrors
// application/blueprint/ExportBlueprintUseCase.js's own shape: one execute(), pure
// observation, no persistence, no file I/O, no UI. What the caller does
// with the returned JSON (write it to a file, copy it, hand it to a
// test) is deliberately none of this class's business.
//
// Deliberately does NOT read from a DocumentManager or any storage —
// only ever from the Document it's handed — so it is structurally
// impossible for Export to touch dirty state, the manifest, a recovery
// checkpoint, or any other session-local fact. The audit's own Section A
// already establishes those are excluded from Document.toJSON() itself;
// this class adds no additional exclusion logic of its own because none
// is needed.
export class ExportDocumentUseCase {
    constructor(documentSerializer = new DocumentSerializer()) {
        this._documentSerializer = documentSerializer;
    }

    execute(document) {
        if (!document || !(document instanceof Document)) {
            throw new Error('ExportDocumentUseCase: a valid Document is required');
        }
        return this._documentSerializer.serialize(document);
    }
}
