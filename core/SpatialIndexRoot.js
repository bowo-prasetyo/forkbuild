import { Signature, SignatureType } from './Signature.js';
import { computeContentHash } from '../serializer/contentHash.js';

export const SPATIAL_INDEX_ROOT_VERSION = 1;

// The immutable directory of the decentralized spatial index (0.2.15):
// cell key -> content reference of that cell's SpatialIndexManifest.
//
// As of 0.2.16 the root carries the index authority's signature. The
// trust chain this establishes:
//
//   Signed SpatialIndexRoot -> hashed Manifest -> signed PlacementRecord
//
// What the root signature means — and what it deliberately does NOT:
//
//   "This index root was published by the index authority."
//   NOT "Every placement listed by this index is true."
//
// The index remains an accelerator, never truth: discovery still
// resolves and signature-verifies every underlying placement record.
export class SpatialIndexRoot {
    constructor({ version = SPATIAL_INDEX_ROOT_VERSION, cellSize, cells = {}, signature = null }) {
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
        this._signature = signature instanceof Signature ? signature : Signature.fromJSON(signature);
    }

    get version() { return this._version; }
    get cellSize() { return this._cellSize; }
    get manifestCount() { return Object.keys(this._cells).length; }
    get cellKeys() { return Object.keys(this._cells).sort(); }
    get signature() { return this._signature; }

    getManifestReference(cellKey) {
        return this._cells[cellKey] || null;
    }

    withManifestReference(cellKey, referenceJson) {
        const cells = { ...this._cells, [cellKey]: referenceJson };
        return new SpatialIndexRoot({
            version: this._version,
            cellSize: this._cellSize,
            cells,
            signature: null // content changed -> must be re-signed
        });
    }

    withSignature(signature) {
        return new SpatialIndexRoot({
            version: this._version,
            cellSize: this._cellSize,
            cells: this._cells,
            signature
        });
    }

    // The unsigned form — stable, sorted, deterministic. It is both
    // the signing payload and the source of the root's signing id.
    toUnsignedJSON() {
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

    // Each rebuild produces a NEW immutable root — a new content
    // identity — so the root is always its own first revision. The
    // signing id is the hash of the unsigned root content itself.
    getSigningDescriptor() {
        const payload = this.toUnsignedJSON();
        return {
            type: SignatureType.SPATIAL_INDEX_ROOT,
            id: computeContentHash(JSON.stringify(payload)),
            revision: 1,
            payload
        };
    }

    computeContentHash() {
        return computeContentHash(JSON.stringify(this.toJSON()));
    }

    toJSON() {
        return {
            ...this.toUnsignedJSON(),
            signature: this._signature ? this._signature.toJSON() : null
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
            cells: json.cells || {},
            signature: json.signature || null
        });
    }
}
