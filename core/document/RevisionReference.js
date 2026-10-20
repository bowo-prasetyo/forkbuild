import { ContentReference } from './ContentReference.js';

// Immutable identity of a particular revision.
//
// revision number is human/application metadata.
// contentHash is the actual immutable identity.
//
// The combination allows replicas to exchange references without
// transferring the complete object immediately.
export class RevisionReference {
    constructor({ placementId, revision, contentReference }) {
        this._placementId = placementId;
        this._revision = revision;
        this._contentReference = contentReference instanceof ContentReference 
            ? contentReference 
            : (contentReference ? ContentReference.fromJSON(contentReference) : null);
    }
    
    get placementId() { return this._placementId; }
    get revision() { return this._revision; }
    get contentReference() { return this._contentReference; }
    
    toJSON() {
        return {
            placementId: this._placementId,
            revision: this._revision,
            contentReference: this._contentReference ? this._contentReference.toJSON() : null
        };
    }
    
    static fromJSON(json) {
        if (!json) return null;
        return new RevisionReference(json);
    }
}
