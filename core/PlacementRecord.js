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
export class PlacementRecord {
    constructor({
        placementId = createId(),
        publicationId,
		owner = null,             // Legacy string owner (backward compat)
        ownerIdentity = null,      // NEW: The resource authority (Alice)
        authorizedBy = null,       // NEW: { identity: Bob, delegationId: '...' }
        signature = null,          // NEW: Bob's signature
        position = new Position(),
        rotation = { x: 0, y: 0, z: 0 },
        scale = { x: 1, y: 1, z: 1 },
        bounds = null,
        revision = 1,
        contentHash = null,
        createdAt = new Date(),
        updatedAt = new Date(),
        causalStamp = null,
        parents = []
    }) {
        if (!publicationId) throw new Error('PlacementRecord requires a publicationId');
        this._placementId = placementId;
        this._publicationId = publicationId;
    
		// Resolve owner string from legacy param or new identity object
		this._owner = owner !== undefined && owner !== null 
		    ? owner 
		    : (ownerIdentity ? (ownerIdentity.username || ownerIdentity.id) : null);
		    
		        this._ownerIdentity = ownerIdentity;
		        this._authorizedBy = authorizedBy;
		        this._signature = signature;
		        this._position = position instanceof Position ? position : new Position(position.x || 0, position.y || 0, position.z || 0);
		        this._rotation = { ...rotation };
		        this._scale = { ...scale };
		        this._bounds = bounds instanceof SpatialBounds ? bounds : (bounds ? SpatialBounds.fromJSON(bounds) : null);
		        this._revision = revision;
		        this._contentHash = contentHash;
		        this._createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
		        this._updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
        this._causalStamp = causalStamp instanceof CausalStamp 
            ? causalStamp 
            : (causalStamp ? CausalStamp.fromJSON(causalStamp) : null);
            
        this._parents = parents 
            ? parents.map(p => p instanceof RevisionReference ? p : RevisionReference.fromJSON(p)) 
            : [];
    }

    get placementId() { return this._placementId; }
    get publicationId() { return this._publicationId; }
    get owner() { return this._owner; }
    get position() { return this._position; }
    get rotation() { return { ...this._rotation }; }
    get scale() { return { ...this._scale }; }
    get bounds() { return this._bounds; }
    get revision() { return this._revision; }
    get contentHash() { return this._contentHash; }
    get createdAt() { return this._createdAt; }
    get updatedAt() { return this._updatedAt; }
    get ownerIdentity() { return this._ownerIdentity; }
    get authorizedBy() { return this._authorizedBy; }
    get signature() { return this._signature; }

    // Binds the spatial data, content hash, and authorization chain into a single signable payload
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
    get causalStamp() { return this._causalStamp; }
    get parents() { return this._parents.map(p => p); }

    // UNCHANGED since 0.2.10 — same fields, same order. Deliberately does
    // NOT include ownerIdentity/signature, so already-stored records keep
    // verifying.
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
            updatedAt: this._updatedAt.toISOString(),
            causalStamp: this._causalStamp ? this._causalStamp.toJSON() : null,
            parents: this._parents.map(p => p.toJSON())
        });
        return computeContentHash(canonical);
    }

    getSigningDescriptor() {
        return {
            type: SignatureType.PLACEMENT_RECORD,
            id: this._placementId,
            revision: this._revision,
            payload: {
	            placementId: this._placementId,
	            publicationId: this._publicationId,
	            owner: this._owner,
	            position: this._position.toJSON(),
	            rotation: this._rotation,
	            scale: this._scale,
	            bounds: this._bounds ? this._bounds.toJSON() : null,
	            revision: this._revision,
	            createdAt: this._createdAt.toISOString(),
	            updatedAt: this._updatedAt.toISOString(),
                causalStamp: this._causalStamp ? this._causalStamp.toJSON() : null,
                parents: this._parents.map(p => p.toJSON())
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
    // ownerIdentity carries over.
    withPosition(newPosition) {
        return new PlacementRecord({
            placementId: this._placementId,
            publicationId: this._publicationId,
owner: this._owner,
            ownerIdentity: this._ownerIdentity,
            authorizedBy: this._authorizedBy, // Preserved, but signature must be recalculated by caller
            signature: null, 
            position: newPosition,
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds,
            revision: this._revision + 1,
            contentHash: null,
            createdAt: this._createdAt,
            updatedAt: new Date(),
            causalStamp: this._causalStamp, // Preserved; application layer advances it
            parents: this._parents,
            signature: null // Must be re-signed
        });
    }
    
    withCausalHistory(causalStamp, parents) {
        return new PlacementRecord({
            placementId: this._placementId,
            publicationId: this._publicationId,
			owner: this._owner,
            ownerIdentity: this._ownerIdentity,
            authorizedBy: this._authorizedBy, // Preserved, but signature must be recalculated by caller
            signature: null, 
	        position: this._position, // FIX: Use this._position instead of undefined newPosition
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds,
            revision: this._revision + 1,
            contentHash: null,
            createdAt: this._createdAt,
            updatedAt: new Date(),
            causalStamp,
            parents,
            signature: null // Must be re-signed
        });
    }

    // Setting the owner claim invalidates any existing signature.
    withOwnerIdentity(ownerIdentity) {
        return new PlacementRecord({
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            ownerIdentity,
            position: this._position,
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds,
            revision: this._revision,
            contentHash: this._contentHash,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
            signature: null
        });
    }

    withSignature(signature) {
        return new PlacementRecord({
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            ownerIdentity: this._ownerIdentity,
            position: this._position,
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds,
            revision: this._revision,
            contentHash: this._contentHash,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
            signature
        });
    }

    getSigningDescriptor() {
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
                updatedAt: this._updatedAt.toISOString()
            }
        };
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
            parents: this._parents.map(p => p.toJSON())
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
            causalStamp: json.causalStamp,
            parents: json.parents || []
        });
    }

    // ownerIdentity may be a live identity object or a plain serialized
    // object; normalize for JSON output without coupling core/ to the
    // identity layer.
    static _identityJSON(identity) {
        if (!identity) {
            return null;
        }
        return typeof identity.toJSON === 'function' ? identity.toJSON() : identity;
    }
}
