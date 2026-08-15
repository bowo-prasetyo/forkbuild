import { SpatialDiscoveryProvider } from '../discovery/SpatialDiscoveryProvider.js';
import { SpatialCell } from '../core/SpatialCell.js';
import { SpatialIndexRoot } from '../core/SpatialIndexRoot.js';
import { SpatialIndexManifest } from '../core/SpatialIndexManifest.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { TrustPolicy } from '../identity/TrustPolicy.js';
import { TrustObservation, TrustStatus } from '../core/TrustObservation.js';
import { FreshnessProof } from '../core/FreshnessProof.js';
import { EquivocationDetector } from '../core/IndexEquivocation.js';
import { DiscoveryDiagnosticsBuilder } from './DiscoveryDiagnostics.js';

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
// As of 0.2.19 the root layer itself gains three more questions before
// a single manifest is even read (identity/TrustPolicy.js,
// core/IndexEquivocation.js):
//
//   root -> verify authenticity -> verify authority is TRUSTED
//        -> detect equivocation (same authority, same causal
//           position, different content) -> trusted or fatal
//
// The resolution rule changed in 0.2.16 from "newer revision wins" to
// "newer VALID revision wins": a candidate must pass content integrity
// AND signature authorization before it may even compete on revision
// number. 0.2.19 does not change that rule — it hardens what happens
// around it: cryptographic validity is necessary but not sufficient,
// the system also reasons about authority trust, replay, and
// equivocation. No untrusted observation may mutate authoritative
// state — this provider is read-only by construction, so that
// invariant holds structurally, not by convention.
//
// Failure isolation (mirrors 0.2.15/16, extended):
//   invalid placement signature -> record rejected + counted, others go on
//   missing/tampered manifest   -> skipped + counted, other cells go on
//   invalid root signature      -> THROW — without a trusted root there
//                                  is nothing to query against
//   untrusted root authority    -> THROW (same fatality: not "invalid",
//                                  simply not who this replica trusts)
//   equivocating authority      -> THROW when the policy rejects it
//                                  (the default); tolerated + counted
//                                  when the policy does not
export class DecentralizedSpatialDiscoveryProvider extends SpatialDiscoveryProvider {
    constructor({
        spatialIndexStore,
        placementRegistry = null,
        authorizationVerifier = null,
        trustPolicy = new TrustPolicy(),
        equivocationDetector = new EquivocationDetector(),
        replayGuard = null
    }) {
        super();
        this._store = spatialIndexStore;
        this._placementRegistry = placementRegistry;
        this._authorizationVerifier = authorizationVerifier;
        this._trustPolicy = trustPolicy;
        this._equivocationDetector = equivocationDetector;
        this._replayGuard = replayGuard;
        this._lastQueryStats = null;
        this._lastDiagnostics = null;
    }

    get trustPolicy() { return this._trustPolicy; }

    // Legacy stats surface (0.2.15/16) — unchanged shape, so existing
    // consumers and tests keep reading exactly what they always have.
    get lastQueryStats() {
        return this._lastQueryStats ? { ...this._lastQueryStats } : null;
    }

    // The richer 0.2.19 diagnostic surface. discover()'s own return
    // type never changes; this is the parallel surface advanced
    // callers use to see WHY a result looks the way it does.
    getLastDiagnostics() {
        return this._lastDiagnostics;
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
        const diagnostics = new DiscoveryDiagnosticsBuilder();

        const root = this._loadTrustedRoot(diagnostics);
        this._lastDiagnostics = diagnostics.build();
        if (!root) {
            return [];
        }
        const freshness = DecentralizedSpatialDiscoveryProvider._rootFreshness(root);

        const results = new Map();
        for (const cell of SpatialCell.cellsForSphere(center, radius, root.cellSize)) {
            const referenceJson = root.getManifestReference(cell.key);
            if (!referenceJson) {
                continue;
            }
            stats.cellsConsidered += 1;
            diagnostics.increment('cellsQueried');

            const manifest = this._loadManifest(referenceJson, stats, diagnostics);
            if (!manifest) {
                continue;
            }

            for (const entry of manifest.placements) {
                stats.entriesSeen += 1;
                diagnostics.increment('recordsChecked');
                const record = this._resolveEntry(entry, stats, diagnostics, freshness);
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
        this._lastDiagnostics = diagnostics.build();
        return [...results.values()];
    }

    findByPublicationId(publicationId) {
        if (this._placementRegistry) {
            const records = this._placementRegistry.findByPublicationId(publicationId);
            if (records.length > 0) {
                return records;
            }
        }
        const stats = {
            cellsConsidered: 0,
            manifestsRetrieved: 0,
            manifestsRejected: 0,
            entriesSeen: 0,
            recordsRejected: 0,
            signaturesInvalid: 0
        };
        const diagnostics = new DiscoveryDiagnosticsBuilder();
        const root = this._loadTrustedRoot(diagnostics);
        if (!root) {
            this._lastDiagnostics = diagnostics.build();
            return [];
        }
        const freshness = DecentralizedSpatialDiscoveryProvider._rootFreshness(root);

        const results = new Map();
        for (const cellKey of root.cellKeys) {
            const referenceJson = root.getManifestReference(cellKey);
            if (!referenceJson) {
                continue;
            }
            const manifest = this._loadManifest(referenceJson, stats, diagnostics);
            if (!manifest) {
                continue;
            }
            for (const entry of manifest.placements) {
                const record = this._resolveEntry(entry, stats, diagnostics, freshness);
                if (record
                    && record.publicationId === publicationId
                    && !results.has(record.placementId)) {
                    results.set(record.placementId, record);
                }
            }
        }
        this._lastDiagnostics = diagnostics.build();
        return [...results.values()];
    }

    // Loads the current root and puts it through every root-layer trust
    // question before a single manifest is read. Returns the trusted
    // SpatialIndexRoot, or null for the "nothing to query" cases that
    // resolve to an empty result rather than a hard failure (no root
    // published yet, root content missing). A tampered/unauthorized/
    // equivocating-and-rejected root throws — those mean a root EXISTS
    // and is not trustworthy, which is fatal to the whole query, not a
    // reason to silently return nothing.
    _loadTrustedRoot(diagnostics) {
        const rootReference = this._store.getRootReference();
        if (!rootReference) {
            return null;
        }
        const rootJson = this._store.get(rootReference);
        if (rootJson === null) {
            return null;
        }
        if (!this._verifyHash(rootJson, rootReference)) {
            throw new Error(
                'DecentralizedSpatialDiscoveryProvider: spatial index root failed integrity check (hash mismatch)'
            );
        }
        const root = SpatialIndexRoot.fromJSON(rootJson);

        // 0.2.19: require a signature at all when the policy demands one.
        if (!root.signature && this._trustPolicy.requireSignedRoot) {
            diagnostics.observe(TrustObservation.of(TrustStatus.UNAUTHORIZED, {
                subjectType: 'spatial-index-root', subjectId: rootReference.hash || rootReference,
                reason: 'unsigned root rejected by policy (requireSignedRoot)'
            }));
            throw new Error('DecentralizedSpatialDiscoveryProvider: unsigned spatial index root rejected by trust policy');
        }

        // 0.2.16: a signed root must verify. An invalid or unauthorized
        // root signature rejects the whole index snapshot — the same
        // fatality as a tampered root. Unsigned roots pass only when
        // the policy tolerates legacy content (default: yes).
        if (root.signature && this._authorizationVerifier) {
            const rootCheck = this._authorizationVerifier.verifyIndexRoot(root);
            if (!rootCheck.valid) {
                diagnostics.observe(TrustObservation.of(TrustStatus.INVALID_SIGNATURE, {
                    subjectType: 'spatial-index-root', subjectId: rootReference.hash || rootReference,
                    reason: rootCheck.reason || 'invalid'
                }));
                throw new Error(
                    'DecentralizedSpatialDiscoveryProvider: spatial index root signature rejected ('
                    + (rootCheck.reason || 'invalid') + ')'
                );
            }
            // 0.2.19: cryptographic validity is not the same question
            // as "do we trust this authority". A validly-signed root
            // from a non-pinned signer under a PINNED policy is just
            // as unusable as a forged one.
            if (!this._trustPolicy.acceptsAuthority(root.signature.signer)) {
                diagnostics.observe(TrustObservation.of(TrustStatus.UNAUTHORIZED, {
                    subjectType: 'spatial-index-root', subjectId: rootReference.hash || rootReference,
                    reason: 'signer is not a trusted authority under this policy'
                }));
                throw new Error('DecentralizedSpatialDiscoveryProvider: spatial index root authority not trusted');
            }
        } else if (!root.signature) {
            diagnostics.observe(TrustObservation.of(TrustStatus.LEGACY_UNSIGNED, {
                subjectType: 'spatial-index-root', subjectId: rootReference.hash || rootReference
            }));
        }

        // 0.2.19: equivocation — the same authority signing two
        // different roots at the same causal position. Only
        // detectable for signed, causally-stamped roots; a legacy or
        // unsigned root carries nothing to compare.
        if (root.signature && root.causalStamp) {
            const equivocation = this._equivocationDetector.observe(root);
            if (equivocation) {
                diagnostics.increment('equivocations');
                diagnostics.observe(TrustObservation.of(TrustStatus.EQUIVOCATING, {
                    subjectType: 'spatial-index-root', subjectId: equivocation.authority,
                    reason: `authority signed ${equivocation.roots.length} different roots at sequence ${equivocation.sequence}`
                }));
                if (this._trustPolicy.rejectEquivocatingAuthority) {
                    throw new Error(
                        'DecentralizedSpatialDiscoveryProvider: index authority '
                        + equivocation.authority + ' is equivocating at sequence ' + equivocation.sequence
                    );
                }
            }
        }

        return root;
    }

    _loadManifest(referenceJson, stats, diagnostics) {
        const manifestReference = ContentReference.fromJSON(referenceJson);
        const manifestJson = this._store.get(manifestReference);
        if (manifestJson === null) {
            stats.manifestsRejected += 1;
            diagnostics.increment('manifestsMissing');
            diagnostics.observe(TrustObservation.of(TrustStatus.MISSING, {
                subjectType: 'spatial-index-manifest', subjectId: manifestReference.hash
            }));
            return null;
        }
        if (!this._verifyHash(manifestJson, manifestReference)) {
            stats.manifestsRejected += 1;
            diagnostics.increment('manifestsInvalid');
            diagnostics.observe(TrustObservation.of(TrustStatus.INTEGRITY_FAILURE, {
                subjectType: 'spatial-index-manifest', subjectId: manifestReference.hash
            }));
            return null;
        }
        stats.manifestsRetrieved += 1;
        diagnostics.increment('manifestsLoaded');
        return SpatialIndexManifest.fromJSON(manifestJson);
    }

    // 0.2.16 resolution: gather candidates, filter by trust, THEN
    // compare revisions. Newer VALID revision wins; ties prefer the
    // live registry record. 0.2.19 adds: count it as stale when the
    // index's own cached copy disagrees with live truth, and surface
    // an unresolved 0.2.18 conflict as a diagnostic (discover() still
    // returns the deterministic winner — a conflict is not an error).
    _resolveEntry(entry, stats, diagnostics, rootFreshness) {
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
                diagnostics.increment('recordsRejected');
                diagnostics.observe(TrustObservation.of(TrustStatus.INTEGRITY_FAILURE, {
                    subjectType: 'placement-record', subjectId: entry.placementId
                }));
            }
        }

        const trusted = [];
        if (live && this._isRecordTrusted(live, stats, diagnostics)) {
            trusted.push(live);
        }
        if (stored && this._isRecordTrusted(stored, stats, diagnostics)) {
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

        // Stale accelerator entry: the index's own cached copy names a
        // different revision than what live truth (or the other
        // trusted candidate) actually resolves to. Diagnostic only —
        // `best` above is already the correct answer regardless.
        if (trusted.length > 1) {
            const other = trusted.find((c) => c !== best);
            if (other && other.contentHash !== best.contentHash) {
                diagnostics.increment('staleEntries');
                diagnostics.observe(TrustObservation.of(TrustStatus.STALE, {
                    subjectType: 'placement-record', subjectId: entry.placementId, freshness: rootFreshness
                }));
            }
        }

        if (this._placementRegistry && typeof this._placementRegistry.getConflictSet === 'function') {
            const conflictSet = this._placementRegistry.getConflictSet(entry.placementId);
            if (conflictSet && conflictSet.revisions.length > 1) {
                diagnostics.increment('conflicts');
                diagnostics.observe(TrustObservation.of(TrustStatus.CONFLICTING, {
                    subjectType: 'placement-record', subjectId: entry.placementId,
                    reason: `${conflictSet.revisions.length}-way conflict, presenting winner ${conflictSet.winner}`
                }));
            }
        }

        return best;
    }

    // Trust = content integrity + authorization signature (when one
    // exists). Unsigned legacy records are accepted only when the
    // policy allows legacy content and does not require authorization
    // outright (0.2.19; defaults preserve the 0.2.16 behavior of
    // tolerating the deployed pre-0.2.16 corpus).
    _isRecordTrusted(record, stats, diagnostics) {
        if (!record.verifyIntegrity()) {
            stats.recordsRejected += 1;
            diagnostics.increment('recordsRejected');
            diagnostics.observe(TrustObservation.of(TrustStatus.INTEGRITY_FAILURE, {
                subjectType: 'placement-record', subjectId: record.placementId
            }));
            return false;
        }

        if (!record.signature) {
            if (this._trustPolicy.requireAuthorizedPlacements || !this._trustPolicy.allowLegacyUnsigned) {
                stats.signaturesInvalid += 1;
                diagnostics.increment('recordsRejected');
                diagnostics.observe(TrustObservation.of(TrustStatus.UNAUTHORIZED, {
                    subjectType: 'placement-record', subjectId: record.placementId,
                    reason: 'unsigned record rejected by policy'
                }));
                return false;
            }
            diagnostics.observe(TrustObservation.of(TrustStatus.LEGACY_UNSIGNED, {
                subjectType: 'placement-record', subjectId: record.placementId
            }));
            return true;
        }

        if (this._replayGuard && this._replayGuard.hasAccepted(record.contentHash, 'placement-record')) {
            // Already verified this exact immutable object before —
            // historical validity, re-confirmed cheaply rather than
            // re-run. Whether it is CURRENT is a separate question,
            // decided above by revision comparison, not here.
            return true;
        }

        if (this._authorizationVerifier) {
            const check = this._authorizationVerifier.verifyPlacement(record);
            if (!check.valid) {
                stats.signaturesInvalid += 1;
                diagnostics.increment('recordsRejected');
                diagnostics.observe(TrustObservation.of(TrustStatus.INVALID_SIGNATURE, {
                    subjectType: 'placement-record', subjectId: record.placementId, reason: check.reason
                }));
                return false;
            }
        }
        if (this._replayGuard) {
            this._replayGuard.recordAccepted(record.contentHash, 'placement-record');
        }
        diagnostics.observe(TrustObservation.of(TrustStatus.VALID, {
            subjectType: 'placement-record', subjectId: record.placementId
        }));
        return true;
    }

    _verifyHash(json, reference) {
        const expected = typeof reference === 'string' ? reference : reference.hash;
        return computeContentHash(JSON.stringify(json)) === expected;
    }

    static _rootFreshness(root) {
        return new FreshnessProof({
            rootReference: root.computeContentHash(),
            rootCausalStamp: root.causalStamp
        });
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
