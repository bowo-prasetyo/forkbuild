import { createId } from './createId.js';
import { Position } from './Position.js';
import { SpatialBounds } from './SpatialBounds.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { SigningIdentity } from '../identity/SigningIdentity.js';
import { SignatureType } from './Signature.js';
import { CausalStamp } from './CausalStamp.js';
import { RevisionReference } from './RevisionReference.js';

// A publishable spatial record (0.2.10).
//
// As of 0.2.16 the record gains its trust layer:
//   ownerIdentity — the identity that owns this placement
//   signature     — that identity's signature over the canonical signing
//                   envelope of THIS revision
//
// contentHash keeps its 0.2.10 definition EXACTLY (same fields, same
// order) — it answers "what is this object". The signature is an
// attestation layered on top — it answers "who authorized it". Both new
// fields are optional so pre-0.2.16 records remain valid ("unsigned
// legacy" policy).
//
// As of 0.2.17 the record gains authorizedBy — { identity, delegationId }
// — recording that a delegate, rather than the owner, produced this
// revision under a Delegation.
//
// As of 0.2.18 the record gains its causality layer:
//   causalStamp — the vector clock the signer had observed when this
//                 revision was created (core/CausalStamp.js)
//   parents     — the immutable revision(s) this one was created from
//                 (core/RevisionReference.js)
// Both travel INSIDE the signed envelope (see getSigningDescriptor) —
// a revision's place in causal history is authorized data, not
// metadata an attacker can rewrite after the fact. contentHash does
// NOT gain these fields: its 0.2.10 shape is preserved exactly, so
// already-stored/already-verified records keep verifying unchanged.
export class PlacementRecord {
    constructor({
        placementId = createId(),
        publicationId,
        owner = null,              // Legacy string owner (backward compat)
        ownerIdentity = null,       // 0.2.16: the resource authority (Alice)
        authorizedBy = null,        // 0.2.17: { identity, delegationId } when a delegate signed
        signature = null,
        position = new Position(),
        rotation = { x: 0, y: 0, z: 0 },
        scale = { x: 1, y: 1, z: 1 },
        bounds = null,
        revision = 1,
        contentHash = null,
        createdAt = new Date(),
        updatedAt = new Date(),
        causalStamp = null,         // 0.2.18: CausalStamp | plain JSON | null
        parents = []                // 0.2.18: RevisionReference[] | plain JSON[]
    }) {
        if (!publicationId) {
            throw new Error('PlacementRecord requires a publicationId');
        }
        this._placementId = placementId;
        this._publicationId = publicationId;

        // Resolve owner string from legacy param or new identity object.
        this._owner = owner !== undefined && owner !== null
            ? owner
            : (ownerIdentity ? (ownerIdentity.username || ownerIdentity.id) : null);

        this._ownerIdentity = ownerIdentity;
        this._authorizedBy = authorizedBy;
        this._signature = signature;
        this._position = position instanceof Position
            ? position
            : new Position(position.x || 0, position.y || 0, position.z || 0);
        this._rotation = { ...rotation };
        this._scale = { ...scale };
        this._bounds = bounds instanceof SpatialBounds
            ? bounds
            : (bounds ? SpatialBounds.fromJSON(bounds) : null);
        this._revision = revision;
        this._contentHash = contentHash;
        this._createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
        this._updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
        this._causalStamp = causalStamp instanceof CausalStamp
            ? causalStamp
            : (causalStamp ? CausalStamp.fromJSON(causalStamp) : null);
        this._parents = (parents || []).map((p) =>
            p instanceof RevisionReference ? p : RevisionReference.fromJSON(p));
    }

    get placementId() { return this._placementId; }
    get publicationId() { return this._publicationId; }
    get owner() { return this._owner; }
    get ownerIdentity() { return this._ownerIdentity; }
    get authorizedBy() { return this._authorizedBy; }
    get signature() { return this._signature; }
    get position() { return this._position; }
    get rotation() { return { ...this._rotation }; }
    get scale() { return { ...this._scale }; }
    get bounds() { return this._bounds; }
    get revision() { return this._revision; }
    get contentHash() { return this._contentHash; }
    get createdAt() { return this._createdAt; }
    get updatedAt() { return this._updatedAt; }
    get causalStamp() { return this._causalStamp; }
    get parents() { return this._parents.slice(); }

    // Non-cryptographic canonical payload consumed by the 0.2.17 mock
    // delegation signature scheme (core/SigningIdentity.sign/verify).
    // Distinct from getSigningDescriptor(), which feeds the real
    // Ed25519 signing/verification path (identity/LocalIdentityProvider,
    // identity/LocalAuthorizationVerifier). The two authorization
    // surfaces are independent by design (see docs/Principles.md,
    // "Signatures vs. Authorization (0.2.17)").
    getCanonicalPayload() {
        return JSON.stringify({
            placementId: this._placementId,
            publicationId: this._publicationId,
            contentHash: this._contentHash,
            ownerIdentityId: this._ownerIdentity ? this._ownerIdentity.id : null,
            authorizedById: this._authorizedBy ? this._authorizedBy.identity.id : null,
            delegationId: this._authorizedBy ? this._authorizedBy.delegationId : null,
            position: this._position.toJSON(),
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds ? this._bounds.toJSON() : null,
            revision: this._revision,
            createdAt: this._createdAt.toISOString(),
            updatedAt: this._updatedAt.toISOString()
        });
    }

    // UNCHANGED since 0.2.10 — same fields, same order. Deliberately does
    // NOT include ownerIdentity/signature/causalStamp/parents, so
    // already-stored records keep verifying under every later milestone.
    computeContentHash() {
        const canonical = JSON.stringify({
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            position: this._position.toJSON(),
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds ? this._bounds.toJSON() : null,
            revision: this._revision,
            createdAt: this._createdAt.toISOString(),
            updatedAt: this._updatedAt.toISOString()
        });
        return computeContentHash(canonical);
    }

    // The canonical signing envelope for the REAL (Ed25519) signature.
    //
    // causalStamp/parents are included ONLY when this revision actually
    // carries causal metadata. This keeps the envelope byte-identical to
    // its pre-0.2.18 shape for every record that predates causality —
    // their existing signatures keep verifying unchanged — while any
    // revision that DOES carry a causal stamp or parents has both bound
    // into the signed bytes. Tampering with either after the fact (e.g.
    // forging a parent to rewrite history) changes the envelope and
    // therefore invalidates the signature: causal position is authorized
    // data, not free-form metadata (docs/Principles.md, 0.2.18).
    getSigningDescriptor() {
        const hasCausality = this._causalStamp !== null || this._parents.length > 0;
        return {
            type: SignatureType.PLACEMENT_RECORD,
            id: this._placementId,
            revision: this._revision,
            payload: {
                placementId: this._placementId,
                publicationId: this._publicationId,
                owner: this._owner,
                ownerIdentity: PlacementRecord._identityJSON(this._ownerIdentity),
                position: this._position.toJSON(),
                rotation: this._rotation,
                scale: this._scale,
                bounds: this._bounds ? this._bounds.toJSON() : null,
                revision: this._revision,
                contentHash: this._contentHash,
                createdAt: this._createdAt.toISOString(),
                updatedAt: this._updatedAt.toISOString(),
                ...(hasCausality
                    ? {
                        causalStamp: this._causalStamp ? this._causalStamp.toJSON() : null,
                        parents: this._parents.map((p) => p.toJSON())
                    }
                    : {})
            }
        };
    }

    verifyIntegrity() {
        if (!this._contentHash) {
            return false;
        }
        return this.computeContentHash() === this._contentHash;
    }

    // New revision: contentHash and signature are CLEARED — a new revision
    // is a new immutable object that must be re-hashed and re-signed.
    // ownerIdentity/authorizedBy carry over; causalStamp/parents carry
    // over unchanged unless the caller chains .withCausalHistory(...) —
    // see below.
    withPosition(newPosition) {
        return new PlacementRecord({
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            ownerIdentity: this._ownerIdentity,
            authorizedBy: this._authorizedBy, // Preserved; signature must be recalculated by caller
            signature: null,
            position: newPosition,
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds,
            revision: this._revision + 1,
            contentHash: null,
            createdAt: this._createdAt,
            updatedAt: new Date(),
            causalStamp: this._causalStamp,
            parents: this._parents
        });
    }

    // Attaches causal metadata (an advanced CausalStamp and the
    // RevisionReference(s) this revision descends from) to the CURRENT
    // revision — it does NOT bump revision again, and — like
    // withOwnerIdentity() — preserves contentHash, since causalStamp/
    // parents are deliberately outside the contentHash formula (only
    // the signature covers them; see getSigningDescriptor). Only the
    // signature is cleared, because it's the signature that must be
    // recomputed to bind the new causal position. Chain it after
    // withPosition() to produce exactly one new revision that carries
    // both the new position and its causal position in history:
    //
    //   existing.withPosition(pos).withCausalHistory(
    //       existing.causalStamp.advance(actorId),
    //       [RevisionReference.fromJSON({ placementId, revision: existing.revision,
    //           contentReference: { hash: existing.contentHash } })]
    //   )
    withCausalHistory(causalStamp, parents) {
        return new PlacementRecord({
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            ownerIdentity: this._ownerIdentity,
            authorizedBy: this._authorizedBy,
            signature: null,
            position: this._position,
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds,
            revision: this._revision,
            contentHash: this._contentHash,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
            causalStamp,
            parents: parents || []
        });
    }

    // Setting the owner claim invalidates any existing signature.
    withOwnerIdentity(ownerIdentity) {
        return new PlacementRecord({
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            ownerIdentity,
            authorizedBy: this._authorizedBy,
            position: this._position,
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds,
            revision: this._revision,
            contentHash: this._contentHash,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
            signature: null,
            causalStamp: this._causalStamp,
            parents: this._parents
        });
    }

    // Records that a delegate (rather than the owner) is authoring this
    // revision under a Delegation. Invalidates any existing signature —
    // the delegate must sign after calling this.
    withAuthorizedBy(authorizedBy) {
        return new PlacementRecord({
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            ownerIdentity: this._ownerIdentity,
            authorizedBy,
            position: this._position,
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds,
            revision: this._revision,
            contentHash: this._contentHash,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
            signature: null,
            causalStamp: this._causalStamp,
            parents: this._parents
        });
    }

    withSignature(signature) {
        return new PlacementRecord({
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            ownerIdentity: this._ownerIdentity,
            authorizedBy: this._authorizedBy,
            position: this._position,
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds,
            revision: this._revision,
            contentHash: this._contentHash,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
            signature,
            causalStamp: this._causalStamp,
            parents: this._parents
        });
    }

    // Immutably attaches the content hash once position/rotation/scale/
    // revision are final — mirrors withSignature(); callers stop
    // spreading `{ ...record.toJSON(), contentHash }` through the
    // constructor by hand.
    withContentHash(contentHash) {
        return new PlacementRecord({
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            ownerIdentity: this._ownerIdentity,
            authorizedBy: this._authorizedBy,
            position: this._position,
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds,
            revision: this._revision,
            contentHash,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
            signature: this._signature,
            causalStamp: this._causalStamp,
            parents: this._parents
        });
    }

    toJSON() {
        return {
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            ownerIdentity: PlacementRecord._identityJSON(this._ownerIdentity),
            authorizedBy: this._authorizedBy ? {
                identity: PlacementRecord._identityJSON(this._authorizedBy.identity),
                delegationId: this._authorizedBy.delegationId
            } : null,
            signature: this._signature,
            position: this._position.toJSON(),
            rotation: { ...this._rotation },
            scale: { ...this._scale },
            bounds: this._bounds ? this._bounds.toJSON() : null,
            revision: this._revision,
            contentHash: this._contentHash,
            createdAt: this._createdAt.toISOString(),
            updatedAt: this._updatedAt.toISOString(),
            causalStamp: this._causalStamp ? this._causalStamp.toJSON() : null,
            parents: this._parents.map((p) => p.toJSON())
        };
    }

    static fromJSON(json) {
        return new PlacementRecord({
            placementId: json.placementId,
            publicationId: json.publicationId,
            owner: json.owner || null,
            ownerIdentity: json.ownerIdentity ? SigningIdentity.fromJSON(json.ownerIdentity) : null,
            authorizedBy: json.authorizedBy ? {
                identity: SigningIdentity.fromJSON(json.authorizedBy.identity),
                delegationId: json.authorizedBy.delegationId
            } : null,
            signature: json.signature,
            position: Position.fromJSON(json.position),
            rotation: json.rotation,
            scale: json.scale,
            bounds: json.bounds ? SpatialBounds.fromJSON(json.bounds) : null,
            revision: json.revision,
            contentHash: json.contentHash,
            createdAt: new Date(json.createdAt),
            updatedAt: new Date(json.updatedAt),
            causalStamp: json.causalStamp || null,
            parents: json.parents || []
        });
    }

    // ownerIdentity/authorizedBy.identity may be a live identity object
    // or a plain serialized object; normalize for JSON output without
    // coupling core/ to the identity layer.
    static _identityJSON(identity) {
        if (!identity) {
            return null;
        }
        return typeof identity.toJSON === 'function' ? identity.toJSON() : identity;
    }
}
