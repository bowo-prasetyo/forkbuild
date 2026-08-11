// Runtime-only state: what is currently on the clipboard (0.1.42,
// group-aware as of 0.1.43). Session state, not document state — copying
// never touches the document and never enters command history.
//
// The clipboard carries INTENT, not identity: definitionId, transform
// RELATIVE to the copied selection's pivot (origin), source metadata —
// and, as of 0.1.43, any group whose ENTIRE membership was selected,
// expressed as { name, memberIndices } pointing into items[]. No brick
// ids and no group ids are ever stored here — pasting therefore can
// never collide with or resurrect copied identities; PasteBricksCommand
// creates fresh identities at execution time.
export class SpatialClipboardState {
    constructor({ items = [], groups = [], origin = null, sourceDocumentId = null, copiedAt = null } = {}) {
        this._items = items.map((item) => ({
            definitionId: item.definitionId,
            position: { ...item.position },
            rotation: item.rotation || 0
        }));
        this._groups = groups.map((group) => ({
            name: group.name || null,
            memberIndices: [...group.memberIndices]
        }));
        this._origin = origin ? { ...origin } : null;
        this._sourceDocumentId = sourceDocumentId || null;
        this._copiedAt = copiedAt;
    }

    get items() {
        return this._items.map((item) => ({
            definitionId: item.definitionId,
            position: { ...item.position },
            rotation: item.rotation
        }));
    }

    // Groups whose entire membership was selected at copy time, expressed
    // as indices into items — never ids.
    get groups() {
        return this._groups.map((group) => ({
            name: group.name,
            memberIndices: [...group.memberIndices]
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
