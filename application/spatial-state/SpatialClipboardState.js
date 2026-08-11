// Runtime-only state: what is currently on the clipboard (0.1.42).
// Session state, not document state — copying never touches the
// document and never enters command history.
//
// The clipboard carries INTENT, not identity: definitionId, transform
// RELATIVE to the copied selection's pivot (origin), and source
// metadata. No brick id is ever stored here — pasting therefore can
// never collide with or resurrect the copied bricks; PasteBricksCommand
// creates fresh identities at execution time, the same contract
// PlaceBrickCommand established. Positions are plain {x,y,z} data.
export class SpatialClipboardState {
    constructor({ items = [], origin = null, sourceDocumentId = null, copiedAt = null } = {}) {
        this._items = items.map((item) => ({
            definitionId: item.definitionId,
            position: { ...item.position },
            rotation: item.rotation || 0
        }));
        this._origin = origin ? { ...origin } : null;
        this._sourceDocumentId = sourceDocumentId;
        this._copiedAt = copiedAt;
    }

    get items() {
        return this._items.map((item) => ({
            definitionId: item.definitionId,
            position: { ...item.position },
            rotation: item.rotation
        }));
    }

    get count() {
        return this._items.length;
    }

    get origin() {
        return this._origin ? { ...this._origin } : null;
    }

    get sourceDocumentId() {
        return this._sourceDocumentId;
    }

    get copiedAt() {
        return this._copiedAt;
    }

    get isEmpty() {
        return this._items.length === 0;
    }

    static empty() {
        return new SpatialClipboardState();
    }
}
