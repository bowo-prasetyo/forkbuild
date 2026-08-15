import { SpatialCell, DEFAULT_CELL_SIZE } from '../core/SpatialCell.js';
import { SpatialIndexManifest } from '../core/SpatialIndexManifest.js';
import { SpatialIndexRoot } from '../core/SpatialIndexRoot.js';
import { ContentReference } from '../core/ContentReference.js';

// Turns authoritative PlacementRecords into immutable decentralized
// index content (0.2.15):
//
//   PlacementRecords
//          |
//          v
//   SpatialIndexBuilder
//          |
//          +-- immutable revision records  (one per placement)
//          +-- immutable cell manifests    (one per occupied cell)
//          +-- immutable root              (cell key -> manifest ref)
//          +-- mutable root pointer        (set on the store)
//
// Two maintenance shapes:
//
//   build(records) — full deterministic rebuild. Idempotent: the same
//   records always produce the same content hashes, so a rebuild over
//   an unchanged registry changes nothing and re-points the root
//   pointer at an identical root.
//
//   addOrUpdatePlacement(record) — incremental revision publishing,
//   used by MoveWorldPlacementUseCase. Stores the new immutable
//   revision and advances only the manifests of the cells the new
//   position occupies. Cells of the OLD position keep their old
//   revision reference — the intended eventual-consistency story:
//   the index is an accelerator, not truth, and stale entries are
//   resolved away by the discovery provider.
export class SpatialIndexBuilder {
    constructor(spatialIndexStore, { cellSize = DEFAULT_CELL_SIZE } = {}) {
        this._store = spatialIndexStore;
        this._cellSize = cellSize;
    }

    get cellSize() {
        return this._cellSize;
    }

    build(placementRecords) {
        const records = [...(placementRecords || [])].sort((a, b) =>
            (a.placementId < b.placementId ? -1 : a.placementId > b.placementId ? 1 : 0));

        const entriesByCell = new Map();
        for (const record of records) {
            const reference = this._store.put(record.toJSON());
            const entry = {
                placementId: record.placementId,
                revision: record.revision,
                recordReference: reference.toJSON()
            };
            for (const cell of SpatialIndexBuilder.cellsForRecord(record, this._cellSize)) {
                if (!entriesByCell.has(cell.key)) {
                    entriesByCell.set(cell.key, { cell, entries: [] });
                }
                entriesByCell.get(cell.key).entries.push(entry);
            }
        }

        let root = new SpatialIndexRoot({ cellSize: this._cellSize });
        const sortedKeys = [...entriesByCell.keys()].sort();
        for (const key of sortedKeys) {
            const { cell, entries } = entriesByCell.get(key);
            const manifest = new SpatialIndexManifest({
                cell,
                cellSize: this._cellSize,
                placements: entries
            });
            root = root.withManifestReference(key, this._store.put(manifest.toJSON()).toJSON());
        }

        const rootReference = this._store.put(root.toJSON());
        this._store.setRootReference(rootReference);

        return {
            rootReference,
            root,
            manifestCount: sortedKeys.length,
            recordCount: records.length
        };
    }

    // Publishes ONE new immutable placement revision and advances the
    // affected cell manifests. Returns the new root reference.
    addOrUpdatePlacement(record) {
        const currentRootReference = this._store.getRootReference();
        let root;
        if (currentRootReference) {
            const rootJson = this._store.get(currentRootReference);
            root = rootJson !== null
                ? SpatialIndexRoot.fromJSON(rootJson)
                : new SpatialIndexRoot({ cellSize: this._cellSize });
        } else {
            root = new SpatialIndexRoot({ cellSize: this._cellSize });
        }

        const reference = this._store.put(record.toJSON());
        const entry = {
            placementId: record.placementId,
            revision: record.revision,
            recordReference: reference.toJSON()
        };

        for (const cell of SpatialIndexBuilder.cellsForRecord(record, root.cellSize)) {
            let entries = [];
            const existingReferenceJson = root.getManifestReference(cell.key);
            if (existingReferenceJson) {
                const existingJson = this._store.get(ContentReference.fromJSON(existingReferenceJson));
                if (existingJson !== null) {
                    entries = SpatialIndexManifest.fromJSON(existingJson).placements
                        .filter((placement) => placement.placementId !== record.placementId);
                }
            }
            entries.push(entry);
            const manifest = new SpatialIndexManifest({
                cell,
                cellSize: root.cellSize,
                placements: entries
            });
            root = root.withManifestReference(cell.key, this._store.put(manifest.toJSON()).toJSON());
        }

        const newRootReference = this._store.put(root.toJSON());
        this._store.setRootReference(newRootReference);
        return newRootReference;
    }

    // The cells a record occupies: every cell its GLOBAL bounds
    // intersect, or the single origin cell when no bounds exist.
    static cellsForRecord(record, cellSize) {
        const bounds = record.bounds
            ? record.bounds.getGlobalBounds(record.position)
            : null;
        if (bounds) {
            return SpatialCell.cellsForBounds(bounds.min, bounds.max, cellSize);
        }
        return [SpatialCell.fromPosition(record.position, cellSize)];
    }
}
