import { createId } from './createId.js';
import { Signature, SignatureType } from './Signature.js';

// 0.6.8 — Blueprint Lineage & Revision Discovery.
//
// core/BlueprintFingerprint.js answers "what exactly is this design?" and
// core/BlueprintAttribution.js answers "who claims they made it?" Neither
// has ever had anything to say about a third, different question:
//
//   "These two independent fingerprints aren't identical, but one
//    appears to be a modification of the other."
//
// 0.6.7's own header named this explicitly and declined to build it:
// "Lineage/versioning... is a fundamentally different, much harder
// problem (similarity, not equality) and stays its own future
// milestone." This is that milestone, and this class is its core
// concept — the exact three-layer split 0.6.5 already drew for
// authorship, applied here to derivation instead:
//
//   BlueprintFingerprint  = objective, derived design identity (0.6.5)
//   BlueprintLineageClaim = a subjective, signed, published ASSERTION
//                           that one design was derived from another
//                           (THIS file)
//   BlueprintLineageView  = a derived, read-only reading of whatever
//                           lineage claims a replica currently knows
//                           about (core/BlueprintLineageView.js)
//
// A signed claim says "I assert that the design fingerprinting to
// `derivedFingerprint` was derived from the design fingerprinting to
// `sourceFingerprint`." It does NOT say "the system has proven this" —
// see core/BlueprintSimilarity.js's own header for the pure evidence
// module a UI can use to SUGGEST a claim worth making, never to assert
// one automatically. See docs/Principles.md, "Lineage Is A Signed Claim,
// Never A Fact (0.6.8)."
//
// `relationship` is deliberately the smallest vocabulary that can exist:
// exactly one value, DERIVED_FROM. This milestone's own design
// conversation was explicit that INSPIRED_BY/VARIANT_OF/REBUILD_OF and
// similar richer semantics become ambiguous almost immediately, and
// building ten relationship kinds speculatively, before even one has
// been used, is exactly the kind of premature abstraction this codebase
// has refused since 0.6.6 declined to build attribution relationship
// semantics for the identical reason. A future relationship kind, should
// one ever earn its own real need, is an ADDITION to
// BlueprintLineageRelationship, never a redesign of this class.
//
// A design cannot be derived from itself — `sourceFingerprint` and
// `derivedFingerprint` are REQUIRED to differ, checked in the
// constructor below, the one structural invariant this class enforces
// beyond the REQUIRED-signature discipline every other claim type in
// this codebase already holds (see core/Signature.js's own "no unsigned
// claims" rule).
//
// Exactly like core/BlueprintAttribution.js, a BlueprintLineageClaim
// carries fingerprints it is ABOUT, but is never stored inside
// core/Structure.js#toJSON(), never touches undo/redo, and is never
// written by application/ExportBlueprintUseCase.js's own portable
// Structure package on its own — see application/BlueprintPackage.js's
// own 0.6.8 header for the same "travels alongside, never becomes part
// of" bundling convenience 0.6.6 already established for attributions.
export const BLUEPRINT_LINEAGE_CLAIM_KIND = 'forkbuild.blueprint-lineage-claim';
export const CURRENT_SCHEMA_VERSION = 1;

// Deliberately a single-member enum today — see this file's own header
// on why a richer vocabulary is refused for now rather than spuriously
// pre-built.
export const BlueprintLineageRelationship = Object.freeze({
    DERIVED_FROM: 'derived-from'
});

const VALID_RELATIONSHIPS = new Set(Object.values(BlueprintLineageRelationship));

export class BlueprintLineageClaim {
    constructor({
        id = createId(),
        sourceFingerprint,
        derivedFingerprint,
        authorIdentityId,
        relationship = BlueprintLineageRelationship.DERIVED_FROM,
        createdAt = new Date(),
        signature = null
    } = {}) {
        if (!sourceFingerprint || typeof sourceFingerprint !== 'string' || !sourceFingerprint.trim()) {
            throw new Error('BlueprintLineageClaim requires a sourceFingerprint');
        }
        if (!derivedFingerprint || typeof derivedFingerprint !== 'string' || !derivedFingerprint.trim()) {
            throw new Error('BlueprintLineageClaim requires a derivedFingerprint');
        }
        if (sourceFingerprint === derivedFingerprint) {
            throw new Error('BlueprintLineageClaim: a design cannot be derived from itself');
        }
        if (!authorIdentityId) {
            throw new Error('BlueprintLineageClaim requires an authorIdentityId');
        }
        if (!VALID_RELATIONSHIPS.has(relationship)) {
            throw new Error(`BlueprintLineageClaim: unknown relationship "${relationship}"`);
        }
        this._id = id;
        this._sourceFingerprint = sourceFingerprint;
        this._derivedFingerprint = derivedFingerprint;
        this._authorIdentityId = authorIdentityId;
        this._relationship = relationship;
        this._createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
        this._signature = signature instanceof Signature ? signature : Signature.fromJSON(signature);
    }

    get id() { return this._id; }
    get sourceFingerprint() { return this._sourceFingerprint; }
    get derivedFingerprint() { return this._derivedFingerprint; }
    get authorIdentityId() { return this._authorIdentityId; }
    get relationship() { return this._relationship; }
    get createdAt() { return this._createdAt; }
    get signature() { return this._signature; }

    withSignature(signature) {
        return new BlueprintLineageClaim({
            id: this._id,
            sourceFingerprint: this._sourceFingerprint,
            derivedFingerprint: this._derivedFingerprint,
            authorIdentityId: this._authorIdentityId,
            relationship: this._relationship,
            createdAt: this._createdAt,
            signature
        });
    }

    // Delegates to the standalone getBlueprintLineageClaimSigningDescriptor()
    // below so identity/LocalAuthorizationVerifier.js can reconstruct the
    // identical descriptor from plain gossiped/stored JSON — the same
    // split every other signed envelope in this codebase keeps.
    getSigningDescriptor() {
        return getBlueprintLineageClaimSigningDescriptor(this.toJSON());
    }

    // Self-describing wire envelope — `kind`/`schemaVersion` — exactly
    // what a future exchange transport needs, the same "free to include
    // now" posture core/BlueprintAttribution.js's own 0.6.5 header
    // already took for this exact field pair.
    toJSON() {
        return {
            kind: BLUEPRINT_LINEAGE_CLAIM_KIND,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            id: this._id,
            sourceFingerprint: this._sourceFingerprint,
            derivedFingerprint: this._derivedFingerprint,
            authorIdentityId: this._authorIdentityId,
            relationship: this._relationship,
            createdAt: this._createdAt.toISOString(),
            signature: this._signature ? this._signature.toJSON() : null
        };
    }

    static fromJSON(json) {
        if (!json) return null;
        return new BlueprintLineageClaim({
            id: json.id,
            sourceFingerprint: json.sourceFingerprint,
            derivedFingerprint: json.derivedFingerprint,
            authorIdentityId: json.authorIdentityId,
            relationship: json.relationship,
            createdAt: json.createdAt ? new Date(json.createdAt) : new Date(),
            signature: json.signature || null
        });
    }
}

// Standalone form of BlueprintLineageClaim#getSigningDescriptor(),
// operating on a plain JSON `record` rather than a hydrated instance —
// mirroring core/BlueprintAttribution.js#getBlueprintAttributionSigningDescriptor()
// one concept over.
export function getBlueprintLineageClaimSigningDescriptor(record) {
    return {
        type: SignatureType.BLUEPRINT_LINEAGE_CLAIM,
        id: record.id,
        revision: record.createdAt,
        payload: {
            id: record.id,
            sourceFingerprint: record.sourceFingerprint,
            derivedFingerprint: record.derivedFingerprint,
            authorIdentityId: record.authorIdentityId,
            relationship: record.relationship,
            createdAt: record.createdAt
        }
    };
}
