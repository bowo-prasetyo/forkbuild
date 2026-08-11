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
        id,
        documentId,
        title,
        author,
        providerId,
        publishedAt,
        url = null,
        parentDocumentId = null,
        // 0.2.3 — snapshot identity and integrity
        contentHash = null,
        schemaVersion = null
    } = {}) {
        this._id = id;
        this._documentId = documentId;
        this._title = title;
        this._author = author;
        this._providerId = providerId;
        this._publishedAt = publishedAt;
        this._url = url;
        this._parentDocumentId = parentDocumentId;
        this._contentHash = contentHash;
        this._schemaVersion = schemaVersion;
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
            schemaVersion: this._schemaVersion
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
            schemaVersion: json.schemaVersion !== undefined ? json.schemaVersion : null
        });
    }
}
