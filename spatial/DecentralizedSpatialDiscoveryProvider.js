import { SpatialDiscoveryProvider } from '../discovery/SpatialDiscoveryProvider.js';
import { SpatialCell } from '../core/SpatialCell.js';
import { SpatialIndexRoot } from '../core/SpatialIndexRoot.js';
import { SpatialIndexManifest } from '../core/SpatialIndexManifest.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';

// The decentralized implementation of the 0.2.11 discovery interface
// (0.2.15). Same contract as LocalSpatialDiscoveryProvider —
// discover(center, radius) and findByPublicationId(publicationId)
// return PlacementRecord[] and never load publication content — but
// backed by immutable cell manifests instead of a local scan.
//
// Query pipeline:
//
//   viewport sphere
//        -> intersecting SpatialCells
//        -> root lookup: which cells have manifests at all
//        -> retrieve ONLY those manifests (never the other cells)
//        -> placement references per manifest
//        -> record resolution: registry live record + immutable
//           referenced record, NEWER REVISION WINS
//        -> integrity check
//        -> sphere filter on the resolved record's actual bounds
//        -> PlacementRecord[]
//
// THE INDEX IS NOT TRUTH. A manifest entry pointing at an outdated
// revision is not corruption — it is a stale accelerator entry. The
// resolved PlacementRecord is authoritative; a missing manifest is
// skipped and counted, a tampered manifest is rejected and counted,
// and discovery of every other cell proceeds untouched. Only a
// tampered ROOT is a hard failure: without a trustworthy root there
// is nothing to query against.
export class DecentralizedSpatialDiscoveryProvider extends SpatialDiscoveryProvider {
    constructor({ spatialIndexStore, placementRegistry = null }) {
        super();
        this._store = spatialIndexStore;
        this._placementRegistry = placementRegistry;
        this._lastQueryStats = null;
    }

    // Observability for the last discover() call:
    //   cellsConsidered    query cells that had a manifest reference
    //   manifestsRetrieved manifests successfully fetched + verified
    //   manifestsRejected  missing or tampered manifests (skipped)
    //   entriesSeen        placement references examined
    //   recordsRejected    unretrievable/tampered records, or
    //                      integrity failures
    get lastQueryStats() {
        return this._lastQueryStats ? { ...this._lastQueryStats } : null;
    }

    discover(center, radius) {
        const stats = {
            cellsConsidered: 0,
            manifestsRetrieved: 0,
            manifestsRejected: 0,
            entriesSeen: 0,
            recordsRejected: 0
        };
        this._lastQueryStats = stats;

        const rootReference = this._store.getRootReference();
        if (!rootReference) {
            return [];
        }
        const rootJson = this._store.get(rootReference);
        if (rootJson === null) {
            return [];
        }
        if (!this._verifyHash(rootJson, rootReference)) {
            throw new Error(
                'DecentralizedSpatialDiscoveryProvider: spatial index root failed integrity check (hash mismatch)'
            );
        }
        const root = SpatialIndexRoot.fromJSON(rootJson);

        const results = new Map();
        for (const cell of SpatialCell.cellsForSphere(center, radius, root.cellSize)) {
            const referenceJson = root.getManifestReference(cell.key);
            if (!referenceJson) {
                continue; // this cell has no indexed placements
            }
            stats.cellsConsidered += 1;

            const manifestReference = ContentReference.fromJSON(referenceJson);
            const manifestJson = this._store.get(manifestReference);
            if (manifestJson === null || !this._verifyHash(manifestJson, manifestReference)) {
                // Stale or corrupted manifest: isolate, never crash.
                stats.manifestsRejected += 1;
                continue;
            }
            stats.manifestsRetrieved += 1;

            const manifest = SpatialIndexManifest.fromJSON(manifestJson);
            for (const entry of manifest.placements) {
                stats.entriesSeen += 1;
                const record = this._resolveEntry(entry, stats);
                if (!record) {
                    continue;
                }
                if (!DecentralizedSpatialDiscoveryProvider.intersectsSphere(record, center, radius)) {
                    continue;
                }
                if (!results.has(record.placementId)) {
                    results.set(record.placementId, record);
                }
            }
        }
        return [...results.values()];
    }

    findByPublicationId(publicationId) {
        // The registry is the authoritative live source when present.
        if (this._placementRegistry) {
            const records = this._placementRegistry.findByPublicationId(publicationId);
            if (records.length > 0) {
                return records;
            }
        }
        // Decentralized fallback: scan the root's manifests.
        const rootReference = this._store.getRootReference();
        if (!rootReference) {
            return [];
        }
        const rootJson = this._store.get(rootReference);
        if (rootJson === null || !this._verifyHash(rootJson, rootReference)) {
            return [];
        }
        const root = SpatialIndexRoot.fromJSON(rootJson);
        const stats = {
            cellsConsidered: 0,
            manifestsRetrieved: 0,
            manifestsRejected: 0,
            entriesSeen: 0,
            recordsRejected: 0
        };
        const results = new Map();
        for (const cellKey of root.cellKeys) {
            const referenceJson = root.getManifestReference(cellKey);
            if (!referenceJson) {
                continue;
            }
            const manifestReference = ContentReference.fromJSON(referenceJson);
            const manifestJson = this._store.get(manifestReference);
            if (manifestJson === null || !this._verifyHash(manifestJson, manifestReference)) {
                stats.manifestsRejected += 1;
                continue;
            }
            const manifest = SpatialIndexManifest.fromJSON(manifestJson);
            for (const entry of manifest.placements) {
                const record = this._resolveEntry(entry, stats);
                if (record
                    && record.publicationId === publicationId
                    && !results.has(record.placementId)) {
                    results.set(record.placementId, record);
                }
            }
        }
        return [...results.values()];
    }

    // Index-is-not-truth resolution:
    //   live record (registry)  — the authoritative latest pointer
    //   stored record (content) — the immutable referenced revision
    // The NEWER revision wins; a tie prefers the live record. The
    // winner must pass verifyIntegrity() or it is rejected.
    _resolveEntry(entry, stats) {
        const live = this._placementRegistry
            ? this._placementRegistry.get(entry.placementId)
            : null;

        let stored = null;
        if (entry.recordReference) {
            const reference = ContentReference.fromJSON(entry.recordReference);
            const json = this._store.get(reference);
            if (json !== null && this._verifyHash(json, reference)) {
                stored = PlacementRecord.fromJSON(json);
            } else {
                stats.recordsRejected += 1;
            }
        }

        let candidate = null;
        if (live && stored) {
            candidate = stored.revision > live.revision ? stored : live;
        } else {
            candidate = live || stored;
        }
        if (!candidate) {
            return null;
        }
        if (!candidate.verifyIntegrity()) {
            stats.recordsRejected += 1;
            return null;
        }
        return candidate;
    }

    _verifyHash(json, reference) {
        const expected = typeof reference === 'string' ? reference : reference.hash;
        return computeContentHash(JSON.stringify(json)) === expected;
    }

    // Sphere vs the record's GLOBAL bounds (translated local AABB),
    // falling back to origin distance — identical test to
    // LocalSpatialIndexProvider.discover.
    static intersectsSphere(record, center, radius) {
        const r2 = radius * radius;
        const bounds = record.bounds
            ? record.bounds.getGlobalBounds(record.position)
            : null;
        if (bounds) {
            const closestX = Math.max(bounds.min.x, Math.min(center.x, bounds.max.x));
            const closestY = Math.max(bounds.min.y, Math.min(center.y, bounds.max.y));
            const closestZ = Math.max(bounds.min.z, Math.min(center.z, bounds.max.z));
            const dx = center.x - closestX;
            const dy = center.y - closestY;
            const dz = center.z - closestZ;
            return (dx * dx + dy * dy + dz * dz) <= r2;
        }
        const p = record.position;
        const dx = p.x - center.x;
        const dy = p.y - center.y;
        const dz = p.z - center.z;
        return (dx * dx + dy * dy + dz * dz) <= r2;
    }
}
