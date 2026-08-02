// Pure data: dirty, readOnly, loadedFrom, lastSaved. Editor State — this
// describes THIS session's relationship to persistence (has it changed
// since the last save? where did it come from? when was it last saved?),
// never the construction itself. Never part of Document.toJSON().
export class DocumentState {
    constructor({ dirty = false, readOnly = false, loadedFrom = null, lastSaved = null } = {}) {
        this._dirty = dirty;
        this._readOnly = readOnly;
        this._loadedFrom = loadedFrom;
        this._lastSaved = lastSaved;
    }

    get dirty() {
        return this._dirty;
    }

    get readOnly() {
        return this._readOnly;
    }

    get loadedFrom() {
        return this._loadedFrom;
    }

    get lastSaved() {
        return this._lastSaved;
    }
}
