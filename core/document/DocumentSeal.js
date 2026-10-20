import { SignatureType } from '../publication/Signature.js';
import { computeContentHash } from '../../serializer/contentHash.js';

// A build's maker sealing an exported file: "I made exactly this build,
// with these terms." File → Export (and Export All Builds) add one beside
// the document's own `world` and `metadata` when the identity exporting
// is the build's author; Import then believes the author and license the
// file names only when the seal verifies (application/document/
// DocumentImportPolicy.js).
//
// The seal covers the hash of the document exactly as exported, so
// changing anything in the file, its license included, breaks it. It is
// a separate top-level field, never part of the document: older copies of
// ForkBuild ignore it, and a build's own content hash doesn't change.
//
// Deleting a seal is always possible. What a seal guarantees is narrower
// and is what matters: nobody but the maker can produce a file that
// carries the maker's name and terms and still verifies.
export const DOCUMENT_SEAL_KIND = 'forkbuild.document-seal';
export const DOCUMENT_SEAL_SCHEMA_VERSION = 1;

// The hash a seal commits to: the document's own fields, in the order
// core/document/Document.js#toJSON() writes them, never the seal itself.
export function sealedDocumentHash(documentJson) {
    return computeContentHash(JSON.stringify({
        schemaVersion: documentJson.schemaVersion,
        world: documentJson.world,
        metadata: documentJson.metadata
    }));
}

// The unsigned seal for `documentJson`, made by its own author.
export function unsignedDocumentSeal(documentJson, sealedAt = new Date()) {
    return {
        kind: DOCUMENT_SEAL_KIND,
        schemaVersion: DOCUMENT_SEAL_SCHEMA_VERSION,
        documentId: documentJson.world?.id ?? null,
        authorIdentityId: documentJson.metadata?.authorIdentityId ?? null,
        contentHash: sealedDocumentHash(documentJson),
        sealedAt: (sealedAt instanceof Date ? sealedAt : new Date(sealedAt)).toISOString()
    };
}

export function getDocumentSealSigningDescriptor(seal) {
    return {
        type: SignatureType.DOCUMENT_SEAL,
        id: seal.documentId,
        revision: seal.sealedAt,
        payload: {
            documentId: seal.documentId,
            authorIdentityId: seal.authorIdentityId,
            contentHash: seal.contentHash,
            sealedAt: seal.sealedAt
        }
    };
}
