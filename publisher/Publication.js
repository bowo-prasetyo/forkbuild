import { createId } from '../core/createId.js';
import { License } from '../core/License.js';
import { ContentReference } from '../core/ContentReference.js';
import { Signature, SignatureType } from '../core/Signature.js';

// Pure data: the result of publishing a Document.
//
// As of 0.2.14 a Publication references immutable content through a
// ContentReference instead of containing bytes. As of 0.2.16 it gains
// the trust layer that completes the chain:
//
//   Identity -> signs -> Publication metadata
//                          -> references -> content hash
//                                            -> identifies -> bytes
//
// publisherIdentity — the SigningIdentity that published this work
// signature         — that identity's signature over the canonical
//                     envelope of this publication (everything except
//                     the signature itself)
//
// The signed publication is the authoritative statement: "this
// identity authorized this exact publication metadata and content
// reference." Both fields are optional for pre-0.2.16 compatibility.
export class Publication {
    constructor({
        id = createId(),
        documentId,
        title,
        author,
        providerId = 'local',
        publishedAt = new Date(),
        url = null,
        parentDocumentId = null,
        snapshotId = null,
        contentHash = null,
        schemaVersion = 1,
        license = null,
        contentReference = null,
        publisherIdentity = null,
        signature = null
    } = {}) {
        this._id = id;
        this._documentId = documentId;
        this._title = title;
        this._author = author;
        this._providerId = providerId;
        this._publishedAt = publishedAt instanceof Date ? publishedAt : new Date(publishedAt);
        this._url = url;
        this._parentDocumentId = parentDocumentId;
        this._snapshotId = snapshotId;
        this._contentHash = contentHash;
        this._schemaVersion = schemaVersion;
        this._license = license instanceof License ? license : (license ? License.fromJSON(license) : null);
        this._contentReference = contentReference instanceof ContentReference
            ? contentReference
            : (contentReference ? ContentReference.fromJSON(contentReference) : null);
        this._publisherIdentity = publisherIdentity ? { ...publisherIdentity } : null;
        this._signature = signature instanceof Signature ? signature : Signature.fromJSON(signature);
    }

    get id() { return this._id; }
    get documentId() { return this._documentId; }
    get title() { return this._title; }
    get author() { return this._author; }
    get providerId() { return this._providerId; }
    get publishedAt() { return this._publishedAt; }
    get url() { return this._url; }
    get parentDocumentId() { return this._parentDocumentId; }
    get snapshotId() { return this._snapshotId; }
    get contentHash() { return this._contentHash; }
    get schemaVersion() { return this._schemaVersion; }
    get license() { return this._license; }
    get contentReference() { return this._contentReference; }
    get publisherIdentity() { return this._publisherIdentity ? { ...this._publisherIdentity } : null; }
    get signature() { return this._signature; }

    withSignature(signature) {
        return new Publication({
            id: this._id,
            documentId: this._documentId,
            title: this._title,
            author: this._author,
            providerId: this._providerId,
            publishedAt: this._publishedAt,
            url: this._url,
            parentDocumentId: this._parentDocumentId,
            snapshotId: this._snapshotId,
            contentHash: this._contentHash,
            schemaVersion: this._schemaVersion,
            license: this._license,
            contentReference: this._contentReference,
            publisherIdentity: this._publisherIdentity,
            signature
        });
    }

    // Canonical signing descriptor. The payload mirrors toJSON() minus
    // the signature itself — a signature can never cover itself.
    // Republishing creates a NEW publication (new id, new signature);
    // a publication is its own first and only revision.
    getSigningDescriptor() {
        return {
            type: SignatureType.PUBLICATION,
            id: this._id,
            revision: 1,
            payload: {
                id: this._id,
                documentId: this._documentId,
                title: this._title,
                author: this._author,
                providerId: this._providerId,
                publishedAt: this._publishedAt.toISOString(),
                url: this._url,
                parentDocumentId: this._parentDocumentId,
                snapshotId: this._snapshotId,
                contentHash: this._contentHash,
                schemaVersion: this._schemaVersion,
                license: this._license ? this._license.toJSON() : null,
                contentReference: this._contentReference ? this._contentReference.toJSON() : null,
                publisherIdentity: this._publisherIdentity
            }
        };
    }

    toJSON() {
        return {
            id: this._id,
            documentId: this._documentId,
            title: this._title,
            author: this._author,
            providerId: this._providerId,
            publishedAt: this._publishedAt.toISOString(),
            url: this._url,
            parentDocumentId: this._parentDocumentId,
            snapshotId: this._snapshotId,
            contentHash: this._contentHash,
            schemaVersion: this._schemaVersion,
            license: this._license ? this._license.toJSON() : null,
            contentReference: this._contentReference ? this._contentReference.toJSON() : null,
            publisherIdentity: this._publisherIdentity ? { ...this._publisherIdentity } : null,
            signature: this._signature ? this._signature.toJSON() : null
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new Publication({
            id: json.id,
            documentId: json.documentId,
            title: json.title,
            author: json.author,
            providerId: json.providerId,
            publishedAt: json.publishedAt ? new Date(json.publishedAt) : new Date(),
            url: json.url,
            parentDocumentId: json.parentDocumentId,
            snapshotId: json.snapshotId,
            contentHash: json.contentHash,
            schemaVersion: json.schemaVersion,
            license: json.license,
            contentReference: json.contentReference,
            publisherIdentity: json.publisherIdentity || null,
            signature: json.signature || null
        });
    }
}
