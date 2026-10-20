// Immutable description of competing valid revisions.
//
// A conflict is NOT an error.
// It means multiple independently authorized histories exist.
// Every member remains verifiable and recoverable.
export class ConflictSet {
    constructor({ placementId, revisions = [], winner = null } = {}) {
        this._placementId = placementId;
        this._revisions = revisions.map(r => ({ ...r }));
        this._winner = winner;
    }
    
    get placementId() { return this._placementId; }
    get revisions() { return this._revisions.map(r => ({ ...r })); }
    get winner() { return this._winner; }
    
    toJSON() {
        return {
            placementId: this._placementId,
            revisions: this._revisions,
            winner: this._winner
        };
    }
    
    static fromJSON(json) {
        if (!json) return null;
        return new ConflictSet(json);
    }
}
