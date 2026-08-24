import { createId } from './createId.js';
import { Signature, SignatureType } from './Signature.js';

// 0.8.0 — Decentralized Publication Anchoring & External Evidence.
//
// 0.7.0 answered "where might a copy of these signed bytes be found?"
// with core/ContentReference.js/core/DecentralizedPublication.js, and
// drew a line this milestone only ever extends, never crosses:
// "Blockchain inclusion does not turn a claim into truth" (docs/
// Principles.md, 0.7.0). A PublicationAnchor is the one new kind of
// evidence this codebase adds on top of that line — never a new way to
// cross it.
//
//   Content            "what are these bytes?"      (ContentReference.hash)
//      │
//      ▼
//   DecentralizedPublication   "who chose to publish this reference,
//      │                        under what publicationId?"
//      ▼
//   PublicationAnchor (THIS FILE)   "which identity attests this exact
//                                    publicationId/contentHash pair was
//                                    RECORDED by some external system,
//                                    at some locator, with what proof?"
//
// An anchor never says "this content is authentic," "this is who wrote
// it," or "this is when it was truly created." It says exactly one
// thing: "the anchoring identity attests this hash was recorded where
// the anchor's own `locator` claims — nothing more." Verifying an
// anchor's signature (identity/LocalAuthorizationVerifier.js#
// verifyPublicationAnchor) proves only that the named `anchorIdentity`
// really did sign exactly this publicationId/contentHash/anchorType/
// locator tuple. Verifying the `proof` itself against the external
// system it names is a SEPARATE, anchorType-specific question this
// milestone deliberately does not answer — see
// application/ExternalAnchorVerifier.js's own header for why that step
// is a pluggable `proofVerifier`, never something this class or its
// verifier hard-codes, and docs/Roadmap.md for why no concrete backend
// (a real chain, a local test double) ships in 0.8.0 at all.
//
// `anchoredAt` is the EXTERNAL system's OWN reported timestamp — never
// treated as authoritative the way a Document's own `createdAt` is not
// either. The system can only ever say "the external system reports
// this timestamp," the identical restraint this codebase already
// applies to a peer message's `receivedAt` (see docs/Principles.md,
// "Arrival Order Is Never Trust (0.2.19)," extended here to a second
// axis: an external system's claimed record time is a REPORT, not a
// fact this replica can independently establish.
//
// `publicationId` and `contentHash` are BOTH carried, deliberately
// redundant with each other: an anchor is a self-contained,
// independently checkable record — a caller verifying an anchor does
// not need to already have resolved the publication it names. Cross-
// checking that a locally known publication's own `contentReference.hash`
// actually matches an anchor's `contentHash` is application/
// ExternalAnchorVerifier.js's job, one step later, exactly the same
// "never trust what you haven't cross-checked" discipline application/
// PublicationResolver.js already applies to a wrapped content object's
// own claims.
//
// Multiple independent anchors — different anchoring identities,
// different anchorTypes, different locators — can all name the exact
// same publicationId/contentHash, and NONE of them is ever more
// authoritative than another, nor are they ever collapsed into one
// canonical anchor. This is the same "several independently signed
// facts, never reconciled into one" posture core/
// DecentralizedPublication.js's own header already holds for competing
// LOCATIONS of the same content, extended here to competing pieces of
// EVIDENCE about the same content.
export const PUBLICATION_ANCHOR_KIND = 'forkbuild.publication-anchor';
export const CURRENT_SCHEMA_VERSION = 1;

export class PublicationAnchor {
    constructor({
        id = createId(),
        publicationId,
        contentHash,
        anchorType,
        locator,
        anchoredAt = new Date(),
        proof = null,
        anchorIdentity = null,
        signature = null
    } = {}) {
        if (!publicationId || typeof publicationId !== 'string' || !publicationId.trim()) {
            throw new Error('PublicationAnchor requires a publicationId');
        }
        if (!contentHash || typeof contentHash !== 'string' || !contentHash.trim()) {
            throw new Error('PublicationAnchor requires a contentHash');
        }
        if (!anchorType || typeof anchorType !== 'string' || !anchorType.trim()) {
            throw new Error('PublicationAnchor requires an anchorType');
        }
        if (!locator || typeof locator !== 'string' || !locator.trim()) {
            throw new Error('PublicationAnchor requires a locator');
        }
        const anchoredAtDate = anchoredAt instanceof Date ? anchoredAt : new Date(anchoredAt);
        if (Number.isNaN(anchoredAtDate.getTime())) {
            throw new Error('PublicationAnchor: anchoredAt must be a valid date');
        }
        this._id = id;
        this._publicationId = publicationId;
        this._contentHash = contentHash;
        this._anchorType = anchorType;
        this._locator = locator;
        this._anchoredAt = anchoredAtDate;
        this._proof = proof !== null && proof !== undefined ? JSON.parse(JSON.stringify(proof)) : null;
        this._anchorIdentity = anchorIdentity ? { ...anchorIdentity } : null;
        this._signature = signature instanceof Signature ? signature : Signature.fromJSON(signature);
    }

    get id() { return this._id; }
    get publicationId() { return this._publicationId; }
    get contentHash() { return this._contentHash; }
    get anchorType() { return this._anchorType; }
    get locator() { return this._locator; }
    get anchoredAt() { return this._anchoredAt; }
    get proof() { return this._proof !== null ? JSON.parse(JSON.stringify(this._proof)) : null; }
    get anchorIdentity() { return this._anchorIdentity ? { ...this._anchorIdentity } : null; }
    get signature() { return this._signature; }

    // Never mutates this instance — the same "signing produces a new
    // object" discipline every signed envelope in this codebase already
    // follows (see core/DecentralizedPublication.js#withSignature()).
    withSignature(signature) {
        return new PublicationAnchor({
            id: this._id,
            publicationId: this._publicationId,
            contentHash: this._contentHash,
            anchorType: this._anchorType,
            locator: this._locator,
            anchoredAt: this._anchoredAt,
            proof: this._proof,
            anchorIdentity: this._anchorIdentity,
            signature
        });
    }

    // A PublicationAnchor is its own first and only revision — a
    // corrected locator, a different proof, or re-anchoring under a
    // different anchorType creates a NEW anchor with a new id and a new
    // signature, exactly the posture core/DecentralizedPublication.js's
    // own header already established for the identical reason. Anchors
    // are never updated in place.
    getSigningDescriptor() {
        return getPublicationAnchorSigningDescriptor(this.toJSON());
    }

    toJSON() {
        return {
            kind: PUBLICATION_ANCHOR_KIND,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            id: this._id,
            publicationId: this._publicationId,
            contentHash: this._contentHash,
            anchorType: this._anchorType,
            locator: this._locator,
            anchoredAt: this._anchoredAt.toISOString(),
            proof: this._proof,
            anchorIdentity: this._anchorIdentity ? { ...this._anchorIdentity } : null,
            signature: this._signature ? this._signature.toJSON() : null
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new PublicationAnchor({
            id: json.id,
            publicationId: json.publicationId,
            contentHash: json.contentHash,
            anchorType: json.anchorType,
            locator: json.locator,
            anchoredAt: json.anchoredAt ? new Date(json.anchoredAt) : new Date(),
            proof: json.proof !== undefined ? json.proof : null,
            anchorIdentity: json.anchorIdentity || null,
            signature: json.signature || null
        });
    }
}

// Standalone form of #getSigningDescriptor(), operating on a plain JSON
// `record` rather than a hydrated instance — the same split every other
// signed envelope in this codebase keeps between its class and its own
// get*SigningDescriptor() free function (see core/
// DecentralizedPublication.js's own
// getDecentralizedPublicationSigningDescriptor()), so identity/
// LocalAuthorizationVerifier.js can reconstruct the identical descriptor
// from a plain record it received off the wire, never from a re-hydrated
// instance it would first have to trust.
export function getPublicationAnchorSigningDescriptor(record) {
    return {
        type: SignatureType.PUBLICATION_ANCHOR,
        id: record.id,
        revision: 1,
        payload: {
            id: record.id,
            publicationId: record.publicationId,
            contentHash: record.contentHash,
            anchorType: record.anchorType,
            locator: record.locator,
            anchoredAt: record.anchoredAt instanceof Date ? record.anchoredAt.toISOString() : record.anchoredAt,
            proof: record.proof !== undefined ? record.proof : null,
            anchorIdentity: record.anchorIdentity
        }
    };
}
