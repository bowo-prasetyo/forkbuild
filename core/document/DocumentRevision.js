// Lightweight revision identity for a persisted document state (0.2.6).
//
// Revision answers "which saved state of THIS document is this?" It is
// persistence metadata, NOT domain truth: it never appears inside
// Document.toJSON() and never travels with a Publication. Keep it
// strictly separate from the three other version-like concepts:
//
//   schemaVersion    -> how the JSON envelope is structured    (0.2.2)
//   protocolVersion  -> what the domain means                  (core)
//   revision         -> which persisted state of this document (0.2.6)
//   publicationId    -> identity of an immutable snapshot      (0.2.3)
//
// Pure value object with no dependencies, mirroring Position /
// WorldPosition. It lives in core/ because it is a dependency-free data
// type shared by persistence/ and application/, not because it is
// domain state.
export class DocumentRevision {
    constructor({ documentId, revision = 0, savedAt = null, contentHash = null } = {}) {
        this._documentId = documentId;
        this._revision = revision;
        this._savedAt = savedAt;
        this._contentHash = contentHash;
    }

    get documentId() { return this._documentId; }
    get revision() { return this._revision; }
    get savedAt() { return this._savedAt; }
    get contentHash() { return this._contentHash; }

    isNewerThan(other) {
        const otherRevision = other && Number.isFinite(other.revision) ? other.revision : 0;
        return this._revision > otherRevision;
    }

    toJSON() {
        return {
            documentId: this._documentId,
            revision: this._revision,
            savedAt: this._savedAt,
            contentHash: this._contentHash
        };
    }

    static fromJSON(json) {
        return new DocumentRevision({
            documentId: json.documentId,
            revision: json.revision || 0,
            savedAt: json.savedAt || null,
            contentHash: json.contentHash || null
        });
    }

    // The next revision is always one beyond whichever persisted state
    // is currently newest (the last explicit save or the latest recovery
    // checkpoint). Computing it from both keeps the counter monotonic
    // without storing a separate counter that could itself be lost.
    static nextRevision(savedRevision, recoveryRevision) {
        const a = Number.isFinite(savedRevision) ? savedRevision : 0;
        const b = Number.isFinite(recoveryRevision) ? recoveryRevision : 0;
        return Math.max(a, b) + 1;
    }
}
