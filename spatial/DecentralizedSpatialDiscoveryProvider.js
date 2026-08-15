import { SpatialDiscoveryProvider } from '../discovery/SpatialDiscoveryProvider.js';
import { SpatialCell } from '../core/SpatialCell.js';
import { SpatialIndexRoot } from '../core/SpatialIndexRoot.js';
import { SpatialIndexManifest } from '../core/SpatialIndexManifest.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';

// The decentralized implementation of the 0.2.11 discovery interface.
//
// The 0.2.16 verification pipeline — every layer answers a different
// trust question:
//
//   viewport -> cells -> SIGNED index root -> manifests
//            -> placement references -> immutable revisions
//            -> integrity check -> SIGNATURE check -> revision check
//            -> spatial filter -> PlacementRecord[]
//
// The resolution rule changed in 0.2.16 from
//
//   "newer revision wins"
//
// to
//
//   "newer VALID revision wins":
//
// a candidate must pass content integrity AND signature authorization
// before it may even compete on revision number. A forged or
// unauthorized revision 5 never displaces an authentic revision 4.
//
// Failure isolation (mirrors 0.2.15, extended):
//   invalid placement signature -> record rejected + counted, others go on
//   missing/tampered manifest   -> skipped + counted, other cells go on
//   invalid root signature      -> THROW — without a trusted root there
//                                  is nothing to query against
export class DecentralizedSpatialDiscoveryProvider extends SpatialDiscoveryProvider {
    constructor({ spatialIndexStore, placementRegistry = null, authorizationVerifier = null }) {
        super();
        this._store = spatialIndexStore;
        this._placementRegistry = placementRegistry;
        this._authorizationVerifier = authorizationVerifier;
        this._lastQueryStats = null;
    }

    get lastQueryStats() {
        return this._lastQueryStats ? { ...this._lastQueryStats } : null;
    }

    discover(center, radius) {
        const stats = {
            cellsConsidered: 0,
            manifestsRetrieved: 0,
            manifestsRejected: 0,
            entriesSeen: 0,
            recordsRejected: 0,
            signaturesInvalid: 0
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

        // 0.2.16: a signed root must verify. An invalid or unauthorized
        // root signature rejects the whole index snapshot — the same
        // fatality as a tampered root. Unsigned roots (legacy) pass.
        if (root.signature && this._authorizationVerifier) {
            const rootCheck = this._authorizationVerifier.verifyIndexRoot(root);
            if (!rootCheck.valid) {
                throw new Error(
                    'DecentralizedSpatialDiscoveryProvider: spatial index root signature rejected ('
                    + (rootCheck.reason || 'invalid') + ')'
                );
            }
        }

        const results = new Map();
        for (const cell of SpatialCell.cellsForSphere(center, radius, root.cellSize)) {
            const referenceJson = root.getManifestReference(cell.key);
            if (!referenceJson) {
                continue;
            }
            stats.cellsConsidered += 1;

            const manifestReference = ContentReference.fromJSON(referenceJson);
            const manifestJson = this._store.get(manifestReference);
            if (manifestJson === null || !this._verifyHash(manifestJson, manifestReference)) {
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
        if (this._placementRegistry) {
            const records = this._placementRegistry.findByPublicationId(publicationId);
            if (records.length > 0) {
                return records;
            }
        }
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
            recordsRejected: 0,
            signaturesInvalid: 0
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

    // 0.2.16 resolution: gather candidates, filter by trust, THEN
    // compare revisions. Newer VALID revision wins; ties prefer the
    // live registry record.
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

        const trusted = [];
        if (live && this._isRecordTrusted(live, stats)) {
            trusted.push(live);
        }
        if (stored && this._isRecordTrusted(stored, stats)) {
            trusted.push(stored);
        }
        if (trusted.length === 0) {
            return null;
        }

        let best = trusted[0];
        for (const candidate of trusted.slice(1)) {
            if (candidate.revision > best.revision) {
                best = candidate;
            } else if (candidate.revision === best.revision && candidate === live) {
                best = candidate;
            }
        }
        return best;
    }

    // Trust = content integrity + authorization signature (when one
    // exists). Unsigned legacy records remain accepted — the deployed
    // pre-0.2.16 corpus must keep working.
    _isRecordTrusted(record, stats) {
        if (!record.verifyIntegrity()) {
            stats.recordsRejected += 1;
            return false;
        }
        if (record.signature && this._authorizationVerifier) {
            const check = this._authorizationVerifier.verifyPlacement(record);
            if (!check.valid) {
                stats.signaturesInvalid += 1;
                return false;
            }
        }
        return true;
    }

    _verifyHash(json, reference) {
        const expected = typeof reference === 'string' ? reference : reference.hash;
        return computeContentHash(JSON.stringify(json)) === expected;
    }

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
