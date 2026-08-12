// Caches resolved publication snapshots (JSON) to avoid redundant
// storage/network I/O when multiple placements reference the same
// publication. The snapshot is immutable, so caching it is safe.
//
// Deserialization still happens per-placement to ensure independent
// World instances for the renderer. If we shared the exact same
// Document/World instance across multiple placements, the renderer's
// MeshRegistry and event bus would collide.
export class PublicationContentCache {
    constructor() {
        this._cache = new Map(); // publicationId -> snapshot JSON object
    }

    get(publicationId) {
        return this._cache.get(publicationId) || null;
    }

    set(publicationId, snapshotJson) {
        this._cache.set(publicationId, snapshotJson);
    }

    has(publicationId) {
        return this._cache.has(publicationId);
    }

    delete(publicationId) {
        this._cache.delete(publicationId);
    }

    clear() {
        this._cache.clear();
    }

    get size() {
        return this._cache.size;
    }
}
