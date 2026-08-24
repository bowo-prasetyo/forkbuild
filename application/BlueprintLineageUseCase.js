import { BlueprintLineageClaim } from '../core/BlueprintLineageClaim.js';
import { deriveBlueprintFingerprint } from '../core/BlueprintFingerprint.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { lineageView as deriveLineageView } from '../core/BlueprintLineageView.js';

// 0.6.8 — Blueprint Lineage & Revision Discovery.
//
// The explicit entry point for "publish/retract/read lineage claims for
// a blueprint" — thin over LocalBlueprintLineageClaimStore.js (raw
// persistence) and core/BlueprintLineageView.js (pure derivation), the
// same three-layer split application/BlueprintAttributionUseCase.js
// already keeps one concept over: ui/ talks to THIS class, never to the
// store or the view module directly.
//
// publish() REQUIRES a signing identity and REQUIRES two Structures with
// derivable design content — a BlueprintLineageClaim has never existed
// unsigned; see core/Signature.js's own BLUEPRINT_LINEAGE_CLAIM header.
//
// Deliberately never checks whether the caller actually knows the two
// designs are really related — publish() only ever consults "can this
// identity sign at all" and "do these fingerprints actually differ" (the
// core/BlueprintLineageClaim.js constructor's own guard). Whether a
// derivation claim is TRUE is a judgment this layer was never built to
// make — exactly the same restraint application/
// BlueprintAttributionUseCase.js#publish() already applies to authorship.
// core/BlueprintSimilarity.js is the module that helps a human decide
// whether publishing is even worth doing; it is never consulted here.
export class BlueprintLineageUseCase {
    constructor(store, identityProvider, verifier) {
        if (!store) {
            throw new Error('BlueprintLineageUseCase: a BlueprintLineageClaim store is required');
        }
        if (!identityProvider) {
            throw new Error('BlueprintLineageUseCase: identityProvider is required');
        }
        if (!verifier) {
            throw new Error('BlueprintLineageUseCase: an authorization verifier is required');
        }
        this._store = store;
        this._identityProvider = identityProvider;
        this._verifier = verifier;
    }

    // Signs and stores a new claim: "I, the currently authenticated
    // identity, assert that `derivedStructure`'s own design was derived
    // from `sourceStructure`'s own design." Returns the stored
    // BlueprintLineageClaim. Throws if either structure has no derivable
    // fingerprint, if the two fingerprints are identical (see core/
    // BlueprintLineageClaim.js's own constructor guard — a design cannot
    // be derived from itself), if nobody is signed in, or if the
    // identityProvider lacks the signing surface.
    publish(derivedStructure, sourceStructure) {
        const derivedFingerprint = deriveBlueprintFingerprint(derivedStructure);
        if (!derivedFingerprint) {
            throw new Error('BlueprintLineageUseCase: the derived structure has no derivable design content');
        }
        const sourceFingerprint = deriveBlueprintFingerprint(sourceStructure);
        if (!sourceFingerprint) {
            throw new Error('BlueprintLineageUseCase: the source structure has no derivable design content');
        }
        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!authorIdentityId) {
            throw new Error('BlueprintLineageUseCase: sign in to claim a lineage relationship');
        }
        if (typeof this._identityProvider.signCanonical !== 'function') {
            throw new Error('BlueprintLineageUseCase: this identity provider cannot sign a lineage claim');
        }
        let claim = new BlueprintLineageClaim({ sourceFingerprint, derivedFingerprint, authorIdentityId });
        const signature = this._identityProvider.signCanonical(claim.getSigningDescriptor());
        claim = claim.withSignature(signature);

        const result = this._verifier.verifyBlueprintLineageClaim(claim.toJSON());
        if (!result.valid) {
            throw new Error(`BlueprintLineageUseCase: refusing to publish an unverifiable lineage claim — ${result.reason}`);
        }
        this._store.save(claim);
        return claim;
    }

    // Withdraws a claim THIS identity itself published. `fingerprint` may
    // be either the claim's own source or derived fingerprint — see
    // application/LocalBlueprintLineageClaimStore.js#retract()'s own
    // header. Silently no-ops (returns false) for an unknown claim id or
    // one authored by someone else, the same author-only asymmetry
    // application/BlueprintAttributionUseCase.js#retract() already keeps.
    retract(fingerprint, claimId) {
        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        const existing = this._store.list(fingerprint).find((claim) => claim.id === claimId);
        if (!existing || existing.authorIdentityId !== authorIdentityId) {
            return false;
        }
        return this._store.retract(fingerprint, claimId);
    }

    // Every claim this replica has on file touching one Structure's own
    // derived fingerprint (in either role), most recent first — raw
    // facts, unranked. Returns `[]` for a structure with no derivable
    // fingerprint rather than throwing.
    claimsForBlueprint(structure) {
        const fingerprint = deriveBlueprintFingerprint(structure);
        return fingerprint ? this._store.list(fingerprint) : [];
    }

    // The presentation-ready view a UI actually renders — core/
    // BlueprintLineageView.js#lineageView(), given this replica's own
    // claims for `structure`'s fingerprint and the currently signed-in
    // identity. Degrades to a fully empty, non-throwing view for a
    // structure with no derivable fingerprint.
    lineageView(structure) {
        const fingerprint = deriveBlueprintFingerprint(structure);
        if (!fingerprint) {
            return deriveLineageView(null, [], null);
        }
        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        const claims = this._store.list(fingerprint);
        return deriveLineageView(fingerprint, claims, authorIdentityId);
    }
}
