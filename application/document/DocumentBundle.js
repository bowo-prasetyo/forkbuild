import { DocumentSerializer } from '../../serializer/DocumentSerializer.js';
import { DocumentManifest } from './DocumentManifest.js';
import { DocumentManager } from './DocumentManager.js';
import { SaveDocumentUseCase } from './SaveDocumentUseCase.js';
import { ImportDocumentUseCase } from './ImportDocumentUseCase.js';

// Every saved document in one file, for moving them all to another device
// or keeping a copy (a single document still exports on its own).
export const DOCUMENT_BUNDLE_KIND = 'forkbuild-document-bundle';
export const DOCUMENT_BUNDLE_FORMAT_VERSION = 1;

export function isDocumentBundle(value) {
    return Boolean(value) && typeof value === 'object' && value.kind === DOCUMENT_BUNDLE_KIND;
}

// Reads each saved document as stored; the recovery checkpoints of
// unsaved changes are not included, as with a single export.
export class ExportAllDocumentsUseCase {
    constructor(storageProvider, documentManifest = new DocumentManifest(storageProvider)) {
        this._storageProvider = storageProvider;
        this._documentManifest = documentManifest;
    }

    // Resolves to the bundle, or null when nothing is saved.
    async execute() {
        const documents = [];
        for (const entry of this._documentManifest.list()) {
            const json = await this._storageProvider.loadAsync(entry.id);
            if (json !== null) documents.push(json);
        }
        if (documents.length === 0) return null;
        return { kind: DOCUMENT_BUNDLE_KIND, formatVersion: DOCUMENT_BUNDLE_FORMAT_VERSION, exportedAt: new Date().toISOString(), documents };
    }
}

// Saves every document in a bundle. A document this device doesn't have
// keeps its id, so restoring onto a new device brings back the same
// documents; one it already has unchanged is skipped; one it has with
// different content is saved as a copy with a fresh id, like a single
// import, so neither version is lost. Each document is validated on its
// own: a bad one is counted and the rest still import.
export class ImportDocumentBundleUseCase {
    constructor(
        storageProvider,
        {
            documentSerializer = new DocumentSerializer(),
            importDocumentUseCase = new ImportDocumentUseCase(documentSerializer),
            saveDocumentUseCase = new SaveDocumentUseCase(storageProvider, documentSerializer)
        } = {}
    ) {
        this._storageProvider = storageProvider;
        this._documentSerializer = documentSerializer;
        this._importDocumentUseCase = importDocumentUseCase;
        this._saveDocumentUseCase = saveDocumentUseCase;
    }

    // Resolves to { added, copied, unchanged, failed }.
    async execute(bundle) {
        if (!isDocumentBundle(bundle) || !Array.isArray(bundle.documents)) {
            throw new Error('That is not a ForkBuild document bundle.');
        }
        if (bundle.formatVersion !== DOCUMENT_BUNDLE_FORMAT_VERSION) {
            throw new Error('This bundle was made by a newer version of ForkBuild. Update this copy first.');
        }
        const result = { added: 0, copied: 0, unchanged: 0, failed: 0 };
        for (const json of bundle.documents) {
            try {
                const document = this._documentSerializer.deserialize(json);
                const existing = await this._storageProvider.loadAsync(document.world.id);
                if (existing === null) {
                    this._saveDocumentUseCase.execute(new DocumentManager(document));
                    result.added++;
                } else if (this._sameContent(existing, document)) {
                    result.unchanged++;
                } else {
                    this._saveDocumentUseCase.execute(new DocumentManager(this._importDocumentUseCase.execute(json)));
                    result.copied++;
                }
            } catch {
                result.failed++;
            }
        }
        return result;
    }

    _sameContent(existingJson, document) {
        try {
            const existing = this._documentSerializer.serialize(this._documentSerializer.deserialize(existingJson));
            return JSON.stringify(existing) === JSON.stringify(this._documentSerializer.serialize(document));
        } catch {
            return false;
        }
    }
}
