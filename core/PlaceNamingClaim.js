import { createId } from './createId.js';
import { Signature, SignatureType } from './Signature.js';

// 0.5.2 — Place Naming & Naming Claims.
//
// The design conversation that closed out 0.5.1 named the exact
// architectural boundary this milestone draws:
//
//   WorldRegion       = objective shared geometry (0.5.0, untouched)
//   PlaceNamingClaim  = a subjective, signed, published ASSERTION about
//                       what a region is called (THIS file)
//   PlaceNamingView   = a local client's own derived reading of the
//                       claims it currently knows about (core/
//                       PlaceNamingView.js)
//
// A WorldRegion already carries a `name` — that field is UNCHANGED by
// this milestone and stays exactly what core/WorldRegionGeography.js's
// regionsContaining()/describePlace() read, the same World-authoritative
// breadcrumb 0.5.0/0.5.1 already built. A PlaceNamingClaim is something
// genuinely NEW: any identity — not only the region's own author, not
// even someone holding EDIT on the World the region lives in — may
// publish one, exactly the way Alice, Bob, and Carol can each have their
// own opinion about what to call the same ground without any of them
// needing the others' permission. See docs/Principles.md, "A Name Is A
// Claim, Not A Fact (0.5.2)."
//
// Deliberately NOT a World mutation: a PlaceNamingClaim carries a
// `regionId` it refers to, but is never stored inside World#toJSON(),
// never travels through a Command, never touches undo/redo, and is
// never propagated by application/WorldCommandPropagationUseCase.js.
// Publishing a claim about someone else's region changes nothing about
// that region, or about the World it lives in — exactly the same
// "a name a client DISPLAYS must never become indistinguishable from
// World content a human authored INTO the World" boundary 0.5.0 already
// drew for procedural fallback naming, extended here to a second kind
// of name a human authored OUTSIDE the World instead.
//
// Signed exactly like a WorldEditAuthorizationEnvelope grant — REQUIRED,
// never tolerated unsigned (see identity/LocalAuthorizationVerifier.js#
// verifyPlaceNamingClaim()) — because the one thing that makes "47
// independent references" in core/PlaceNamingView.js meaningful at all
// is that each reference is provably a DIFFERENT identity's own
// assertion, not the same claim copy-pasted under a fabricated author.
// A claim's signer MUST equal its own authorIdentityId.
//
// `id` is its own identity (not derived from worldId/regionId/name), so
// the SAME identity can publish more than one claim for the same region
// over time (a redundant claim — no protocol reason to forbid it) and
// so retracting one claim (application/PlaceNamingClaimUseCase.js#retract())
// never has to guess which of several a caller meant.
export class PlaceNamingClaim {
    constructor({
        id = createId(),
        worldId,
        regionId,
        name,
        authorIdentityId,
        createdAt = new Date(),
        signature = null
    } = {}) {
        if (!worldId) {
            throw new Error('PlaceNamingClaim requires a worldId');
        }
        if (!regionId) {
            throw new Error('PlaceNamingClaim requires a regionId');
        }
        if (!name || !name.trim()) {
            throw new Error('PlaceNamingClaim requires a non-empty name');
        }
        if (!authorIdentityId) {
            throw new Error('PlaceNamingClaim requires an authorIdentityId');
        }
        this._id = id;
        this._worldId = worldId;
        this._regionId = regionId;
        this._name = name.trim();
        this._authorIdentityId = authorIdentityId;
        this._createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
        this._signature = signature instanceof Signature ? signature : Signature.fromJSON(signature);
    }

    get id() { return this._id; }
    get worldId() { return this._worldId; }
    get regionId() { return this._regionId; }
    get name() { return this._name; }
    get authorIdentityId() { return this._authorIdentityId; }
    get createdAt() { return this._createdAt; }
    get signature() { return this._signature; }

    withSignature(signature) {
        return new PlaceNamingClaim({
            id: this._id,
            worldId: this._worldId,
            regionId: this._regionId,
            name: this._name,
            authorIdentityId: this._authorIdentityId,
            createdAt: this._createdAt,
            signature
        });
    }

    // Canonical signing descriptor, delegating to the standalone
    // getPlaceNamingClaimSigningDescriptor() below so identity/
    // LocalAuthorizationVerifier.js can reconstruct the identical
    // descriptor from a plain JSON record — a gossiped or stored claim
    // that was never rehydrated into a PlaceNamingClaim instance —
    // exactly like every other verify*() method in that class already
    // does for its own envelope's get*SigningDescriptor().
    getSigningDescriptor() {
        return getPlaceNamingClaimSigningDescriptor(this.toJSON());
    }

    toJSON() {
        return {
            id: this._id,
            worldId: this._worldId,
            regionId: this._regionId,
            name: this._name,
            authorIdentityId: this._authorIdentityId,
            createdAt: this._createdAt.toISOString(),
            signature: this._signature ? this._signature.toJSON() : null
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new PlaceNamingClaim({
            id: json.id,
            worldId: json.worldId,
            regionId: json.regionId,
            name: json.name,
            authorIdentityId: json.authorIdentityId,
            createdAt: json.createdAt ? new Date(json.createdAt) : new Date(),
            signature: json.signature || null
        });
    }
}

// Standalone form of PlaceNamingClaim#getSigningDescriptor(), operating
// on a plain JSON `record` (id/worldId/regionId/name/authorIdentityId/
// createdAt as strings) rather than a hydrated instance — the exact
// same split every other signed envelope in this codebase keeps between
// its class and its own get*SigningDescriptor() free function, so
// identity/LocalAuthorizationVerifier.js#verifyPlaceNamingClaim() never
// needs to construct a PlaceNamingClaim just to re-derive what was
// signed.
export function getPlaceNamingClaimSigningDescriptor(record) {
    return {
        type: SignatureType.PLACE_NAMING_CLAIM,
        id: record.id,
        revision: record.createdAt,
        payload: {
            id: record.id,
            worldId: record.worldId,
            regionId: record.regionId,
            name: record.name,
            authorIdentityId: record.authorIdentityId,
            createdAt: record.createdAt
        }
    };
}
