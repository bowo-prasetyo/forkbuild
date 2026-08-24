import { createId } from './createId.js';
import { Signature, SignatureType } from './Signature.js';

// 0.6.5 — Blueprint Identity & Attribution.
//
// core/BlueprintFingerprint.js answers "what exactly is this blueprint,
// independently of the Structure instance that holds it." This module
// answers the question that only makes sense once a stable design
// identity exists at all: "who made it?"
//
// The exact same three-layer split 0.5.2 already drew for geography,
// one domain over:
//
//   BlueprintFingerprint  = objective, derived design identity (0.6.5,
//                           core/BlueprintFingerprint.js)
//   BlueprintAttribution  = a subjective, signed, published ASSERTION
//                           about who authored that design (THIS file)
//   (a future "attribution view," once 0.6.6 gives attributions
//    somewhere to travel besides one replica's own storage, exactly the
//    way core/PlaceNamingView.js only became necessary once 0.5.3 gave
//    naming claims a real exchange transport)
//
// Deliberately never called "BlueprintOwnership." "Author" claims
// exactly one thing — "I made this design" — and implies nothing about
// legal ownership, exclusivity, or permission; see docs/Principles.md,
// "Attribution Is An External Assertion About A Fingerprint, Never
// Structure State (0.6.5)" for the full reasoning. A future "Publisher"
// or "Contributor" role, should one ever earn its own need, is a
// SEPARATE assertion type, never a rename of this one.
//
// A BlueprintAttribution carries a `fingerprint` it is about, but is
// never stored inside `core/Structure.js#toJSON()`, never travels
// through a Command, never touches undo/redo, and is never written by
// `application/ExportBlueprintUseCase.js`'s own portable package —
// exactly the same "a claim about content is never mutation of that
// content" boundary core/PlaceNamingClaim.js already drew for a region's
// name, extended here to a blueprint's own design identity. Publishing
// an attribution for a fingerprint changes nothing about any Structure
// that happens to fingerprint to it, on this device or anyone else's.
//
// Signed exactly like a PlaceNamingClaim — REQUIRED, never tolerated
// unsigned (see identity/LocalAuthorizationVerifier.js#
// verifyBlueprintAttribution()) — because "3 contributors" only means
// anything if each attribution is provably a DIFFERENT identity's own
// assertion, not the same claim copy-pasted under a fabricated author.
// An attribution's signer MUST equal its own authorIdentityId.
//
// `id` is its own identity (not derived from the fingerprint), so the
// SAME identity can publish more than one attribution for the same
// fingerprint over time (a redundant republish — no protocol reason to
// forbid it, mirroring core/PlaceNamingClaim.js's own header on the
// identical question) and so retracting one attribution
// (application/BlueprintAttributionUseCase.js#retract()) never has to
// guess which of several a caller meant.
export const BLUEPRINT_ATTRIBUTION_KIND = 'forkbuild.blueprint-attribution';
export const CURRENT_SCHEMA_VERSION = 1;

export class BlueprintAttribution {
    constructor({
        id = createId(),
        fingerprint,
        authorIdentityId,
        createdAt = new Date(),
        signature = null
    } = {}) {
        if (!fingerprint || typeof fingerprint !== 'string' || !fingerprint.trim()) {
            throw new Error('BlueprintAttribution requires a fingerprint');
        }
        if (!authorIdentityId) {
            throw new Error('BlueprintAttribution requires an authorIdentityId');
        }
        this._id = id;
        this._fingerprint = fingerprint;
        this._authorIdentityId = authorIdentityId;
        this._createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
        this._signature = signature instanceof Signature ? signature : Signature.fromJSON(signature);
    }

    get id() { return this._id; }
    get fingerprint() { return this._fingerprint; }
    get authorIdentityId() { return this._authorIdentityId; }
    get createdAt() { return this._createdAt; }
    get signature() { return this._signature; }

    withSignature(signature) {
        return new BlueprintAttribution({
            id: this._id,
            fingerprint: this._fingerprint,
            authorIdentityId: this._authorIdentityId,
            createdAt: this._createdAt,
            signature
        });
    }

    // Canonical signing descriptor, delegating to the standalone
    // getBlueprintAttributionSigningDescriptor() below so identity/
    // LocalAuthorizationVerifier.js can reconstruct the identical
    // descriptor from a plain JSON record — a gossiped or stored
    // attribution that was never rehydrated into a BlueprintAttribution
    // instance — exactly like core/PlaceNamingClaim.js's own
    // getSigningDescriptor() already does for its own free function.
    getSigningDescriptor() {
        return getBlueprintAttributionSigningDescriptor(this.toJSON());
    }

    // `kind`/`schemaVersion` make this a small, self-describing wire
    // envelope the moment it leaves this replica — the same posture
    // application/BlueprintPackage.js's own `kind`/`schemaVersion`
    // fields already establish for a Structure's own portable form, so
    // a malformed or unrelated JSON blob fails an eventual import check
    // with a specific message rather than an obscure one field deep.
    // Unused within this milestone (0.6.5 builds no exchange transport —
    // see this milestone's own docs/Roadmap.md "Deliberately excluded"),
    // but free to include now and exactly what 0.6.6 will need.
    toJSON() {
        return {
            kind: BLUEPRINT_ATTRIBUTION_KIND,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            id: this._id,
            fingerprint: this._fingerprint,
            authorIdentityId: this._authorIdentityId,
            createdAt: this._createdAt.toISOString(),
            signature: this._signature ? this._signature.toJSON() : null
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new BlueprintAttribution({
            id: json.id,
            fingerprint: json.fingerprint,
            authorIdentityId: json.authorIdentityId,
            createdAt: json.createdAt ? new Date(json.createdAt) : new Date(),
            signature: json.signature || null
        });
    }
}

// Standalone form of BlueprintAttribution#getSigningDescriptor(),
// operating on a plain JSON `record` rather than a hydrated instance —
// the exact same split every other signed envelope in this codebase
// keeps between its class and its own get*SigningDescriptor() free
// function, mirroring core/PlaceNamingClaim.js#
// getPlaceNamingClaimSigningDescriptor() one domain over.
export function getBlueprintAttributionSigningDescriptor(record) {
    return {
        type: SignatureType.BLUEPRINT_ATTRIBUTION,
        id: record.id,
        revision: record.createdAt,
        payload: {
            id: record.id,
            fingerprint: record.fingerprint,
            authorIdentityId: record.authorIdentityId,
            createdAt: record.createdAt
        }
    };
}
