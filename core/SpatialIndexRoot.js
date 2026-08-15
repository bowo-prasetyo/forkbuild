import { Signature, SignatureType } from './Signature.js';
import { CausalStamp } from './CausalStamp.js';
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
//
// As of 0.2.19 the root gains a verifiable HISTORY:
//   revision              — this root's position in its own sequence
//   previousRootReference — the immediately preceding root's content
//                           hash (null for the first root an authority
//                           ever publishes)
//   causalStamp           — the authority's own CausalStamp (0.2.18
//                           machinery reused, not reinvented), advanced
//                           by one on every rebuild
// All three live inside the signed envelope whenever any of them is
// non-default — a node cannot silently splice a fake "Root 18" into an
// authority's chain, or claim a different sequence number, without
// producing a valid signature over that exact history. A root with
// none of them set (revision 1, no previous, no causal stamp) signs
// and verifies under EXACTLY the pre-0.2.19 shape — every already-
// published genesis root keeps verifying unchanged.
export class SpatialIndexRoot {
    constructor({
        version = SPATIAL_INDEX_ROOT_VERSION, cellSize, cells = {}, signature = null,
        revision = 1, previousRootReference = null, causalStamp = null
    }) {
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
        this._revision = Number.isInteger(revision) ? revision : 1;
        this._previousRootReference = previousRootReference || null;
        this._causalStamp = causalStamp instanceof CausalStamp
            ? causalStamp
            : (causalStamp ? CausalStamp.fromJSON(causalStamp) : null);
    }

    get version() { return this._version; }
    get cellSize() { return this._cellSize; }
    get manifestCount() { return Object.keys(this._cells).length; }
    get cellKeys() { return Object.keys(this._cells).sort(); }
    get signature() { return this._signature; }
    get revision() { return this._revision; }
    get previousRootReference() { return this._previousRootReference; }
    get causalStamp() { return this._causalStamp; }
    get hasHistory() {
        return this._revision !== 1 || this._previousRootReference !== null || this._causalStamp !== null;
    }

    getManifestReference(cellKey) {
        return this._cells[cellKey] || null;
    }

    withManifestReference(cellKey, referenceJson) {
        const cells = { ...this._cells, [cellKey]: referenceJson };
        return new SpatialIndexRoot({
            version: this._version,
            cellSize: this._cellSize,
            cells,
            signature: null, // content changed -> must be re-signed
            revision: this._revision,
            previousRootReference: this._previousRootReference,
            causalStamp: this._causalStamp
        });
    }

    // Chains this root off its predecessor and advances the causal
    // stamp for `authorityId` (the index authority's did:key). Called
    // once per rebuild, after every withManifestReference() and before
    // signing (SpatialIndexBuilder). Does not itself change `cells`.
    withHistory({ revision, previousRootReference, causalStamp }) {
        return new SpatialIndexRoot({
            version: this._version,
            cellSize: this._cellSize,
            cells: this._cells,
            signature: null,
            revision,
            previousRootReference,
            causalStamp
        });
    }

    withSignature(signature) {
        return new SpatialIndexRoot({
            version: this._version,
            cellSize: this._cellSize,
            cells: this._cells,
            signature,
            revision: this._revision,
            previousRootReference: this._previousRootReference,
            causalStamp: this._causalStamp
        });
    }

    // The unsigned form — stable, sorted, deterministic. It is both
    // the signing payload and the source of the root's signing id.
    // History fields appear only when this root actually carries
    // history (see hasHistory) — this is what keeps a genesis root's
    // unsigned form, and therefore its id and signature, byte-
    // identical to the pre-0.2.19 shape.
    toUnsignedJSON() {
        const cells = {};
        for (const key of Object.keys(this._cells).sort()) {
            cells[key] = this._cells[key];
        }
        const base = { version: this._version, cellSize: this._cellSize, cells };
        if (!this.hasHistory) {
            return base;
        }
        return {
            ...base,
            revision: this._revision,
            previousRootReference: this._previousRootReference,
            causalStamp: this._causalStamp ? this._causalStamp.toJSON() : null
        };
    }

    // Each rebuild produces a NEW immutable root — a new content
    // identity. The envelope's own `revision` mirrors this root's real
    // revision (1 for every genesis root, exactly as before; the true
    // sequence number once history is present) — stronger domain
    // separation between an authority's successive roots than the
    // constant `1` every root used to sign under.
    getSigningDescriptor() {
        const payload = this.toUnsignedJSON();
        return {
            type: SignatureType.SPATIAL_INDEX_ROOT,
            id: computeContentHash(JSON.stringify(payload)),
            revision: this._revision,
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
            signature: json.signature || null,
            revision: json.revision || 1,
            previousRootReference: json.previousRootReference || null,
            causalStamp: json.causalStamp || null
        });
    }
}
