import { License } from '../core/License.js';
import { ContentReference } from '../core/ContentReference.js';

// Pure data: the result of publishing a Document. This is the bridge
// between Publisher and a future Discovery layer — Repository View,
// Author View, and (later) World View all consume Publications without
// knowing how they were created.
//
// As of 0.2.3, a Publication is a PUBLISHED SNAPSHOT: an immutable,
// validated, versioned artifact. The publication id identifies this
// particular published state (distinct from documentId, which identifies
// the editable work). contentHash provides integrity verification.
// schemaVersion records the document envelope schema at publish time.
//
// The actual snapshot content is stored separately at
// `snapshot:{publicationId}` in storage — NOT embedded in this record.
// This keeps the publications list lightweight while the snapshot
// remains independently loadable.
//
// Publication is PURE DATA. It has no editing capability, no commands,
// no document mutation. It describes what was published and when.
export class Publication {
    constructor({
        id, documentId, title, author, providerId, publishedAt, url = null,
        parentDocumentId = null, contentHash = null, schemaVersion = null,
        license = null, contentReference = null
    } = {}) {
        this._id = id;
        this._documentId = documentId;
        this._title = title;
        this._author = author;
        this._providerId = providerId;
        this._publishedAt = publishedAt;
        this._url = url;
        this._parentDocumentId = parentDocumentId;
        this._schemaVersion = schemaVersion;
        this._license = license instanceof License ? license : (license ? License.fromJSON(license) : new License());
        this._contentReference = contentReference instanceof ContentReference 
            ? contentReference 
            : (contentReference ? ContentReference.fromJSON(contentReference) : null);
            
        // Backward compatibility: derive contentHash from contentReference if missing
        this._contentHash = contentHash || (this._contentReference ? this._contentReference.hash : null);
    }

    get id() { return this._id; }
    get documentId() { return this._documentId; }
    get title() { return this._title; }
    get author() { return this._author; }
    get providerId() { return this._providerId; }
    get publishedAt() { return this._publishedAt; }
    get url() { return this._url; }
    get parentDocumentId() { return this._parentDocumentId; }
    get contentHash() { return this._contentHash; }
    get schemaVersion() { return this._schemaVersion; }
    get license() { return this._license; }
    get contentReference() { return this._contentReference; }

    toJSON() {
        return {
            id: this._id,
            documentId: this._documentId,
            title: this._title,
            author: this._author,
            providerId: this._providerId,
            publishedAt: this._publishedAt ? this._publishedAt.toISOString() : null,
            url: this._url,
            parentDocumentId: this._parentDocumentId,
            contentHash: this._contentHash,
            schemaVersion: this._schemaVersion,
            license: this._license.toJSON(),
            contentReference: this._contentReference ? this._contentReference.toJSON() : null
        };
    }

    static fromJSON(json) {
        return new Publication({
            id: json.id,
            documentId: json.documentId,
            title: json.title,
            author: json.author,
            providerId: json.providerId,
            publishedAt: json.publishedAt ? new Date(json.publishedAt) : null,
            url: json.url,
            parentDocumentId: json.parentDocumentId || null,
            contentHash: json.contentHash || null,
            schemaVersion: json.schemaVersion !== undefined ? json.schemaVersion : null,
            license: json.license ? License.fromJSON(json.license) : null,
            contentReference: json.contentReference ? ContentReference.fromJSON(json.contentReference) : null
        });
    }
}
