import { computeContentHash } from '../serializer/contentHash.js';

export const SPATIAL_INDEX_ROOT_VERSION = 1;

// The immutable directory of the decentralized spatial index (0.2.15):
// cell key -> content reference of that cell's SpatialIndexManifest.
//
// The root is what gets "published" as the current index: it is
// immutable content with its own content identity, and the index
// store keeps exactly ONE mutable pointer at the current root — the
// same "immutable object + mutable pointer" discipline as
// placement revisions (registry latest pointer) and publication
// content (ContentReference).
//
// No timestamp, sorted cell keys in toJSON(): rebuilding over
// unchanged placements reproduces the identical root and the
// identical content hash.
export class SpatialIndexRoot {
    constructor({ version = SPATIAL_INDEX_ROOT_VERSION, cellSize, cells = {} }) {
        if (version !== SPATIAL_INDEX_ROOT_VERSION) {
            throw new Error(`SpatialIndexRoot: unsupported version ${version}`);
        }
        if (!cellSize || cellSize <= 0 || !Number.isFinite(cellSize)) {
            throw new Error('SpatialIndexRoot: cellSize must be a positive number');
        }
        if (!cells || typeof cells !== 'object' || Array.isArray(cells)) {
            throw new Error('SpatialIndexRoot: cells must be an object');
        }
        this._version = version;
        this._cellSize = cellSize;
        this._cells = {};
        for (const key of Object.keys(cells)) {
            this._cells[key] = cells[key];
        }
    }

    get version() { return this._version; }
    get cellSize() { return this._cellSize; }
    get manifestCount() { return Object.keys(this._cells).length; }
    get cellKeys() { return Object.keys(this._cells).sort(); }

    getManifestReference(cellKey) {
        return this._cells[cellKey] || null;
    }

    // Immutable update: returns a NEW root with the cell pointer
    // replaced. The old root remains valid content — old clients can
    // keep using it until they learn about the new one.
    withManifestReference(cellKey, referenceJson) {
        const cells = { ...this._cells, [cellKey]: referenceJson };
        return new SpatialIndexRoot({
            version: this._version,
            cellSize: this._cellSize,
            cells
        });
    }

    computeContentHash() {
        return computeContentHash(JSON.stringify(this.toJSON()));
    }

    toJSON() {
        const cells = {};
        for (const key of Object.keys(this._cells).sort()) {
            cells[key] = this._cells[key];
        }
        return {
            version: this._version,
            cellSize: this._cellSize,
            cells
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object' || Array.isArray(json)) {
            throw new Error('SpatialIndexRoot.fromJSON: root JSON must be an object');
        }
        if (json.version !== SPATIAL_INDEX_ROOT_VERSION) {
            throw new Error(`SpatialIndexRoot.fromJSON: unsupported version ${json.version}`);
        }
        return new SpatialIndexRoot({
            version: json.version,
            cellSize: json.cellSize,
            cells: json.cells || {}
        });
    }
}
