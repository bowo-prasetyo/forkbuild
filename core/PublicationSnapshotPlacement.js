import { createId } from './createId.js';
import { Signature, SignatureType } from './Signature.js';

// 0.8.18 — Decentralized Snapshot Placement Foundation.
//
// core/ContentReference.js's own header already drew the diagram this
// milestone builds the missing half of:
//
//   sha256:ABC
//       ├── ipfs://CID
//       ├── ar://transaction-id
//       └── https://mirror.example/content/ABC
//
// A ContentReference carries exactly ONE `uri`/`storage` pair, fixed at
// the moment it was created and folded into whatever it was signed
// inside — a `publisher/Publication.js` record signs its own
// contentReference once, at publish time, and a Publication is
// immutable (see that file's own header: "republishing creates a NEW
// publication"). There is no way, and no reason, to ever mutate that
// reference afterward to point somewhere new. But the WORLD does not
// stop the moment a Publication is signed: someone may want to make an
// already-published snapshot ALSO retrievable from IPFS, or Arweave,
// tomorrow, next week, or from a machine that never held the original
// bytes at all.
//
// A PublicationSnapshotPlacement is that missing, separate, ADDITIVE
// fact — never a replacement for a Publication's own contentReference,
// never a second content identity:
//
//   publisher/Publication.js         "what was published, and what is
//      │  contentReference.hash       its content's ONE TRUE hash?"
//      │
//      ▼
//   PublicationSnapshotPlacement (THIS FILE)   "which identity attests
//                                                this exact contentHash
//                                                can ALSO be retrieved
//                                                from this locator, via
//                                                this storage backend?"
//
// A placement never says "this is the only place this content lives,"
// "this is the canonical copy," or "this content is authentic." It says
// exactly one thing: "the placing identity attests this hash can be
// retrieved from this locator, on this storage backend — nothing more."
// Verifying a placement's signature
// (identity/LocalAuthorizationVerifier.js#verifyPublicationSnapshotPlacement)
// proves only that the named `placerIdentity` really did sign exactly
// this publicationId/contentHash/storage/locator tuple. Whether the
// locator actually still serves those bytes right now is a SEPARATE,
// later question — application/SnapshotPlacementResolver.js's own job,
// exactly the same split application/ExternalAnchorVerifier.js already
// holds between a `PublicationAnchor`'s signature and its `proof`.
//
// PLACEMENT IS NOT ANCHORING. A `core/PublicationAnchor.js` (0.8.0)
// attests that an EXTERNAL system RECORDED a hash — evidence toward "did
// this exist, unaltered, at some point in time." A
// PublicationSnapshotPlacement attests that a storage backend can
// presently SERVE the bytes for a hash — a locator toward "where can I
// retrieve this, right now." Bitcoin recording a hash in an OP_RETURN
// output proves nothing about retrievability (Bitcoin never stores the
// content itself); IPFS serving content proves nothing about when it
// was first recorded. The two are orthogonal kinds of fact, deliberately
// modeled as two entirely separate signed records, never merged into
// one "evidence" envelope that would blur what each one actually
// claims. See docs/Principles.md, "A Placement Is A Locator, Not
// Evidence Of History (0.8.18)."
//
// `placedAt` is THIS REPLICA's own reported time of placing the content
// — never authoritative the way a Document's own `createdAt` is not
// either, the same restraint core/PublicationAnchor.js's own
// `anchoredAt` already holds for an external system's reported time.
// Unlike `anchoredAt`, there is no external system here to report a
// time at all — content-addressed storage backends do not timestamp
// anything — so `placedAt` is honestly just "when the placing identity
// says it did this," nothing more.
//
// Multiple independent placements — different placing identities,
// different storage backends, different locators — can all name the
// exact same publicationId/contentHash, and NONE of them is ever more
// authoritative than another, nor are they ever collapsed into one
// canonical placement. The identical "several independently signed
// facts, never reconciled into one" posture core/PublicationAnchor.js's
// own header already holds for competing EVIDENCE, held here for
// competing LOCATORS of the same content.
export const PUBLICATION_SNAPSHOT_PLACEMENT_KIND = 'forkbuild.publication-snapshot-placement';
export const CURRENT_SCHEMA_VERSION = 1;

export class PublicationSnapshotPlacement {
    constructor({
        id = createId(),
        publicationId,
        contentHash,
        storage,
        locator,
        placedAt = new Date(),
        placerIdentity = null,
        signature = null
    } = {}) {
        if (!publicationId || typeof publicationId !== 'string' || !publicationId.trim()) {
            throw new Error('PublicationSnapshotPlacement requires a publicationId');
        }
        if (!contentHash || typeof contentHash !== 'string' || !contentHash.trim()) {
            throw new Error('PublicationSnapshotPlacement requires a contentHash');
        }
        if (!storage || typeof storage !== 'string' || !storage.trim()) {
            throw new Error('PublicationSnapshotPlacement requires a storage');
        }
        if (!locator || typeof locator !== 'string' || !locator.trim()) {
            throw new Error('PublicationSnapshotPlacement requires a locator');
        }
        const placedAtDate = placedAt instanceof Date ? placedAt : new Date(placedAt);
        if (Number.isNaN(placedAtDate.getTime())) {
            throw new Error('PublicationSnapshotPlacement: placedAt must be a valid date');
        }
        this._id = id;
        this._publicationId = publicationId;
        this._contentHash = contentHash;
        this._storage = storage;
        this._locator = locator;
        this._placedAt = placedAtDate;
        this._placerIdentity = placerIdentity ? { ...placerIdentity } : null;
        this._signature = signature instanceof Signature ? signature : Signature.fromJSON(signature);
    }

    get id() { return this._id; }
    get publicationId() { return this._publicationId; }
    get contentHash() { return this._contentHash; }
    get storage() { return this._storage; }
    get locator() { return this._locator; }
    get placedAt() { return this._placedAt; }
    get placerIdentity() { return this._placerIdentity ? { ...this._placerIdentity } : null; }
    get signature() { return this._signature; }

    // Never mutates this instance — the same "signing produces a new
    // object" discipline every signed envelope in this codebase already
    // follows (see core/PublicationAnchor.js#withSignature()).
    withSignature(signature) {
        return new PublicationSnapshotPlacement({
            id: this._id,
            publicationId: this._publicationId,
            contentHash: this._contentHash,
            storage: this._storage,
            locator: this._locator,
            placedAt: this._placedAt,
            placerIdentity: this._placerIdentity,
            signature
        });
    }

    // A PublicationSnapshotPlacement is its own first and only revision
    // — a corrected locator, or placing the same content on a different
    // storage backend, creates a NEW placement with a new id and a new
    // signature, exactly the posture core/PublicationAnchor.js's own
    // header already established for the identical reason. Placements
    // are never updated in place.
    getSigningDescriptor() {
        return getPublicationSnapshotPlacementSigningDescriptor(this.toJSON());
    }

    toJSON() {
        return {
            kind: PUBLICATION_SNAPSHOT_PLACEMENT_KIND,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            id: this._id,
            publicationId: this._publicationId,
            contentHash: this._contentHash,
            storage: this._storage,
            locator: this._locator,
            placedAt: this._placedAt.toISOString(),
            placerIdentity: this._placerIdentity ? { ...this._placerIdentity } : null,
            signature: this._signature ? this._signature.toJSON() : null
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new PublicationSnapshotPlacement({
            id: json.id,
            publicationId: json.publicationId,
            contentHash: json.contentHash,
            storage: json.storage,
            locator: json.locator,
            placedAt: json.placedAt ? new Date(json.placedAt) : new Date(),
            placerIdentity: json.placerIdentity || null,
            signature: json.signature || null
        });
    }
}

// Standalone form of #getSigningDescriptor(), operating on a plain JSON
// `record` rather than a hydrated instance — the same split every other
// signed envelope in this codebase keeps between its class and its own
// get*SigningDescriptor() free function (see core/PublicationAnchor.js's
// own getPublicationAnchorSigningDescriptor()), so identity/
// LocalAuthorizationVerifier.js can reconstruct the identical descriptor
// from a plain record it received off the wire, never from a re-hydrated
// instance it would first have to trust.
export function getPublicationSnapshotPlacementSigningDescriptor(record) {
    return {
        type: SignatureType.PUBLICATION_SNAPSHOT_PLACEMENT,
        id: record.id,
        revision: 1,
        payload: {
            id: record.id,
            publicationId: record.publicationId,
            contentHash: record.contentHash,
            storage: record.storage,
            locator: record.locator,
            placedAt: record.placedAt instanceof Date ? record.placedAt.toISOString() : record.placedAt,
            placerIdentity: record.placerIdentity
        }
    };
}
