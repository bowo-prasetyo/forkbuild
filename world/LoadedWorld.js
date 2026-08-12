import { WorldLoadState } from './WorldLoadState.js';

// Runtime state representing a loaded placement instance.
//
// Crucially, this is NOT part of the decentralized world truth.
// PlacementRecord is the durable/discoverable truth; LoadedWorld is
// the ephemeral runtime state. The fact that Alice currently has a
// castle loaded in memory must not become part of the protocol.
export class LoadedWorld {
    constructor({
        placementId,
        publicationId,
        placementRevision,
        position,
        state = WorldLoadState.DISCOVERED,
        session = null,
        error = null,
        loadedAt = null
    }) {
        this._placementId = placementId;
        this._publicationId = publicationId;
        this._placementRevision = placementRevision;
        this._position = position;
        this._state = state;
        this._session = session;
        this._error = error;
        this._loadedAt = loadedAt;
    }

    get placementId() { return this._placementId; }
    get publicationId() { return this._publicationId; }
    get placementRevision() { return this._placementRevision; }
    get position() { return this._position; }
    get state() { return this._state; }
    get session() { return this._session; }
    get error() { return this._error; }
    get loadedAt() { return this._loadedAt; }

    set placementRevision(rev) { this._placementRevision = rev; }
    set position(pos) { this._position = pos; }
    set state(s) { this._state = s; }
    set session(s) { this._session = s; }
    set error(e) { this._error = e; }
    set loadedAt(t) { this._loadedAt = t; }
}
