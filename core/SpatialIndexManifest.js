import { SpatialCell } from './SpatialCell.js';
import { computeContentHash } from '../serializer/contentHash.js';

export const SPATIAL_INDEX_MANIFEST_VERSION = 1;

// The immutable per-cell content object of the decentralized spatial
// index (0.2.15).
//
// A manifest is an INDEX, not placement data: it maps one spatial
// cell to a list of placement REFERENCES — placementId, revision at
// indexing time, and the content reference of the immutable
// PlacementRecord revision. The actual authoritative record lives in
// the PlacementRegistry / content store and is resolved separately.
//
// Deliberately carries NO timestamp: a manifest is a pure function of
// its placements, so rebuilding the index over unchanged records
// produces a byte-identical manifest with the same content identity.
// Placements are sorted by placementId at construction for the same
// reason — canonical serialization through ordering, matching the
// project's insertion-order discipline.
export class SpatialIndexManifest {
    constructor({ version = SPATIAL_INDEX_MANIFEST_VERSION, cell, cellSize, placements = [] }) {
        if (version !== SPATIAL_INDEX_MANIFEST_VERSION) {
            throw new Error(`SpatialIndexManifest: unsupported version ${version}`);
        }
        if (!cell || !(cell instanceof SpatialCell)) {
            throw new Error('SpatialIndexManifest: cell must be a SpatialCell');
        }
        if (!cellSize || cellSize <= 0 || !Number.isFinite(cellSize)) {
            throw new Error('SpatialIndexManifest: cellSize must be a positive number');
        }
        if (!Array.isArray(placements)) {
            throw new Error('SpatialIndexManifest: placements must be an array');
        }
        this._version = version;
        this._cell = cell;
        this._cellSize = cellSize;
        this._placements = placements.map((entry) => {
            if (!entry || typeof entry.placementId !== 'string' || entry.placementId.length === 0) {
                throw new Error('SpatialIndexManifest: every placement needs a placementId');
            }
            if (!Number.isInteger(entry.revision)) {
                throw new Error('SpatialIndexManifest: every placement needs an integer revision');
            }
            return {
                placementId: entry.placementId,
                revision: entry.revision,
                recordReference: entry.recordReference || null
            };
        }).sort((a, b) => (a.placementId < b.placementId ? -1 : a.placementId > b.placementId ? 1 : 0));
    }

    get version() { return this._version; }
    get cell() { return this._cell; }
    get cellSize() { return this._cellSize; }
    get placementCount() { return this._placements.length; }

    get placements() {
        return this._placements.map((entry) => ({
            placementId: entry.placementId,
            revision: entry.revision,
            recordReference: entry.recordReference ? { ...entry.recordReference } : null
        }));
    }

    computeContentHash() {
        return computeContentHash(JSON.stringify(this.toJSON()));
    }

    toJSON() {
        return {
            version: this._version,
            cell: this._cell.key,
            cellSize: this._cellSize,
            placements: this._placements.map((entry) => ({
                placementId: entry.placementId,
                revision: entry.revision,
                recordReference: entry.recordReference ? { ...entry.recordReference } : null
            }))
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object' || Array.isArray(json)) {
            throw new Error('SpatialIndexManifest.fromJSON: manifest JSON must be an object');
        }
        if (json.version !== SPATIAL_INDEX_MANIFEST_VERSION) {
            throw new Error(`SpatialIndexManifest.fromJSON: unsupported version ${json.version}`);
        }
        if (typeof json.cell !== 'string') {
            throw new Error('SpatialIndexManifest.fromJSON: cell key is required');
        }
        const cell = SpatialCell.fromKey(json.cell, json.cellSize);
        return new SpatialIndexManifest({
            version: json.version,
            cell,
            cellSize: json.cellSize,
            placements: json.placements || []
        });
    }
}
