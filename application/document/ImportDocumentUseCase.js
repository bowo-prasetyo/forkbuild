import { DocumentSerializer } from '../../serializer/DocumentSerializer.js';
import { DocumentCloneService } from './DocumentCloneService.js';
import { License } from '../../core/License.js';
import { verifyDocumentSeal } from '../../identity/DocumentSealing.js';
import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';
import { forkTitle, untitledWorldTitle } from './DocumentTitles.js';
import {
    DocumentImportOutcome,
    DocumentImportRefusedError,
    decideDocumentImport,
    ownIdentityIdsOf
} from './DocumentImportPolicy.js';

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
//
// Whose build it becomes (2026-10-16): application/document/
// DocumentImportPolicy.js decides from the maker the file names, its seal
// (core/DocumentSeal.js) and its license. The importer's own build opens
// as itself; someone else's opens as the importer's credited copy when its
// license allows remixes, and is refused (DocumentImportRefusedError)
// when it doesn't or when its seal doesn't hold.
export class ImportDocumentUseCase {
    // `ownIdentityIds`, when given, names identities besides this device's
    // own that count as the importer's (the one an authorized device acts
    // for).
    constructor(documentSerializer = new DocumentSerializer(), documentCloneService = new DocumentCloneService(), { identityProvider = null, ownIdentityIds = null } = {}) {
        this._documentSerializer = documentSerializer;
        this._documentCloneService = documentCloneService;
        this._identityProvider = identityProvider;
        this._ownIdentityIds = ownIdentityIds;
    }

    // The identities a build counts as the importer's own.
    ownIdentityIds() {
        return ownIdentityIdsOf(this._identityProvider, this._ownIdentityIds ? this._ownIdentityIds() : []);
    }

    execute(json) {
        const sourceDocument = this._documentSerializer.deserialize(json);
        const metadata = sourceDocument.metadata;
        const outcome = decideDocumentImport({
            authorIdentityId: metadata.authorIdentityId,
            license: metadata.license,
            builtWith: metadata.builtWith,
            sealStatus: verifyDocumentSeal(json).status,
            ownIdentityIds: this.ownIdentityIds()
        });
        if (outcome === DocumentImportOutcome.COPY) {
            return this._copyOf(sourceDocument);
        }
        if (outcome !== DocumentImportOutcome.OWN) {
            throw new DocumentImportRefusedError(outcome, metadata.author || null);
        }
        return this._documentCloneService.execute(sourceDocument, {
            title: metadata.title,
            description: metadata.description,
            author: metadata.author,
            authorIdentityId: metadata.authorIdentityId,
            license: metadata.license,
            placementPolicy: metadata.placementPolicy,
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

    // Someone else's build as the importer's own copy, the way
    // ForkDocumentUseCase makes one: the importer becomes its author, it
    // keeps its maker's license with their name as the attribution, and it
    // records the build it came from so the family tree can find it.
    _copyOf(sourceDocument) {
        const metadata = sourceDocument.metadata;
        const sourceTitle = metadata.title || untitledWorldTitle();
        const currentUser = this._identityProvider?.currentUser?.() ?? null;
        return this._documentCloneService.execute(sourceDocument, {
            title: forkTitle(sourceTitle),
            author: currentUser ? currentUser.username : null,
            authorIdentityId: resolveSigningIdentityId(this._identityProvider),
            parentDocumentId: sourceDocument.world.id,
            license: License.derivedFrom(metadata.license, {
                author: metadata.author,
                title: sourceTitle,
                sourceDocumentId: sourceDocument.world.id,
                sourceAuthorIdentityId: metadata.authorIdentityId
            })
        });
    }
}
