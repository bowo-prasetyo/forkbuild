// Pure data: the result of publishing a Document. This is the bridge
// between Publisher and a future Discovery layer — Repository View,
// Author View, and (later) World View all consume Publications without
// knowing how they were created.
export class Publication {
    constructor({
        id,
        documentId,
        title,
        author,
        providerId,
        publishedAt,
        url = null
    } = {}) {
        this._id = id;
        this._documentId = documentId;
        this._title = title;
        this._author = author;
        this._providerId = providerId;
        this._publishedAt = publishedAt;
        this._url = url;
    }

    get id() {
        return this._id;
    }

    get documentId() {
        return this._documentId;
    }

    get title() {
        return this._title;
    }

    get author() {
        return this._author;
    }

    get providerId() {
        return this._providerId;
    }

    get publishedAt() {
        return this._publishedAt;
    }

    get url() {
        return this._url;
    }

    toJSON() {
        return {
            id: this._id,
            documentId: this._documentId,
            title: this._title,
            author: this._author,
            providerId: this._providerId,
            publishedAt: this._publishedAt ? this._publishedAt.toISOString() : null,
            url: this._url
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
            url: json.url
        });
    }
}
