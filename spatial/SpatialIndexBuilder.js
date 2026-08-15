import { SpatialCell, DEFAULT_CELL_SIZE } from '../core/SpatialCell.js';
import { SpatialIndexManifest } from '../core/SpatialIndexManifest.js';
import { SpatialIndexRoot } from '../core/SpatialIndexRoot.js';
import { ContentReference } from '../core/ContentReference.js';
import { CausalStamp } from '../core/CausalStamp.js';

// Turns authoritative PlacementRecords into immutable decentralized
// index content (0.2.15).
//
// As of 0.2.16 the builder also signs every root it publishes when an
// IdentityProvider is wired: the root signature is the index
// authority's statement "I published this index snapshot". Manifests
// stay content-hashed only (their integrity is protected by the hash
// plus the root's reference to them); the trust chain terminates at
// the signed PlacementRecords themselves — the index never becomes
// truth.
//
// As of 0.2.19 every signed rebuild also CHAINS onto the previous root
// (previousRootReference) and advances the authority's own CausalStamp
// — a verifiable history a consumer can walk backwards and a basis for
// detecting equivocation (core/IndexEquivocation.js) — instead of each
// root being an unrelated, independently-signed snapshot. A full
// build() and an incremental addOrUpdatePlacement() both continue the
// SAME chain: a full rebuild is just another revision in an
// authority's history, not a new unrelated lineage.
export class SpatialIndexBuilder {
    constructor(spatialIndexStore, { cellSize = DEFAULT_CELL_SIZE, identityProvider = null } = {}) {
        this._store = spatialIndexStore;
        this._cellSize = cellSize;
        this._identityProvider = identityProvider;
    }

    get cellSize() {
        return this._cellSize;
    }

    build(placementRecords) {
        const previousRootReference = this._store.getRootReference();
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

        root = this._applyHistory(root, previousRootReference);
        root = this._signRoot(root);
        const rootReference = this._store.put(root.toJSON());
        this._store.setRootReference(rootReference);

        return {
            rootReference,
            root,
            manifestCount: sortedKeys.length,
            recordCount: records.length
        };
    }

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

        root = this._applyHistory(root, currentRootReference);
        root = this._signRoot(root);
        const newRootReference = this._store.put(root.toJSON());
        this._store.setRootReference(newRootReference);
        return newRootReference;
    }

    // 0.2.19: chain this root onto `previousRootReference` and advance
    // the signing authority's CausalStamp. Only meaningful for a root
    // that will actually be signed — an unsigned/local-dev build has no
    // authority whose sequence to advance, so it stays history-free
    // (SpatialIndexRoot.hasHistory === false), exactly the pre-0.2.19
    // shape.
    _applyHistory(root, previousRootReference) {
        if (!this._identityProvider
            || typeof this._identityProvider.signCanonical !== 'function'
            || !this._identityProvider.currentUser()) {
            return root;
        }
        const authorityId = this._identityProvider.getSigningIdentity().id;

        let previousRoot = null;
        if (previousRootReference) {
            const previousJson = this._store.get(previousRootReference);
            previousRoot = previousJson !== null ? SpatialIndexRoot.fromJSON(previousJson) : null;
        }
        const previousStamp = (previousRoot && previousRoot.causalStamp) || new CausalStamp();
        const revision = previousRoot ? previousRoot.revision + 1 : 1;

        return root.withHistory({
            revision,
            previousRootReference: previousRoot ? previousRootReference.toJSON() : null,
            causalStamp: previousStamp.advance(authorityId)
        });
    }

    // 0.2.16: sign the root when a signing identity is available.
    // withManifestReference/withHistory clear any prior signature, so
    // every new root is signed fresh — a signature never covers stale
    // content.
    _signRoot(root) {
        if (this._identityProvider
            && typeof this._identityProvider.signCanonical === 'function'
            && this._identityProvider.currentUser()) {
            return root.withSignature(
                this._identityProvider.signCanonical(root.getSigningDescriptor())
            );
        }
        return root;
    }

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
