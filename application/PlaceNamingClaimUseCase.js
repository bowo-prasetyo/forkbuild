import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { namingView as deriveNamingView } from '../core/PlaceNamingView.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';

// 0.5.2 — Place Naming & Naming Claims.
//
// The explicit entry point for "publish/retract/read my own opinion
// about what a region is called" — thin over LocalPlaceNamingClaimStore
// (raw persistence) and core/PlaceNamingView.js (pure derivation), the
// same three-layer split VerifyPublicationUseCase.js keeps over
// identity/LocalAuthorizationVerifier.js: ui/ and
// application/WorldNavigationSession.js talk to THIS class, never to
// the store or the verifier directly.
//
// publish() REQUIRES a signing identity — unlike publisher/
// LocalPublisherProvider.js's own tolerant `canSign` fallback (kept for
// pre-0.2.16 compatibility with content that predates signing
// entirely), a PlaceNamingClaim has never existed unsigned; see
// core/Signature.js's own PLACE_NAMING_CLAIM header on why the
// signature is REQUIRED, the same posture WorldMembershipUseCase.js
// already takes for a World edit grant.
//
// Deliberately NEVER checks canEditDocument()/World membership for
// either publish() or retract(): a naming claim is not a World
// mutation, so the only authority publish() ever consults is "can this
// identity sign at all," and the only authority retract() consults is
// "is this identity the claim's OWN author" — see core/
// PlaceNamingClaim.js's own header on why no other authorization
// concept belongs here.
export class PlaceNamingClaimUseCase {
    constructor(store, identityProvider, verifier) {
        if (!store) {
            throw new Error('PlaceNamingClaimUseCase: a PlaceNamingClaim store is required');
        }
        if (!identityProvider) {
            throw new Error('PlaceNamingClaimUseCase: identityProvider is required');
        }
        if (!verifier) {
            throw new Error('PlaceNamingClaimUseCase: an authorization verifier is required');
        }
        this._store = store;
        this._identityProvider = identityProvider;
        this._verifier = verifier;
    }

    // Signs and stores a new claim: "I, the currently authenticated
    // identity, assert region `regionId` (in World `worldId`) is called
    // `name`." Returns the stored PlaceNamingClaim. Throws if nobody is
    // signed in, or if the identityProvider lacks the 0.2.16
    // cryptographic surface — see this file's own header.
    publish(worldId, regionId, name) {
        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!authorIdentityId) {
            throw new Error('PlaceNamingClaimUseCase: sign in to publish a place name');
        }
        if (typeof this._identityProvider.signCanonical !== 'function') {
            throw new Error('PlaceNamingClaimUseCase: this identity provider cannot sign a naming claim');
        }
        let claim = new PlaceNamingClaim({ worldId, regionId, name, authorIdentityId });
        const signature = this._identityProvider.signCanonical(claim.getSigningDescriptor());
        claim = claim.withSignature(signature);

        // Verify our own output before it ever reaches storage — the
        // same "never persist what wouldn't survive verification"
        // discipline WorldMembershipUseCase.js#_signGrant() implicitly
        // relies on the verifier to prove out in tests. A failure here
        // means the identityProvider or verifier disagree about the
        // signing domain/algorithm, never a normal runtime outcome.
        const result = this._verifier.verifyPlaceNamingClaim(claim.toJSON());
        if (!result.valid) {
            throw new Error(`PlaceNamingClaimUseCase: refusing to publish an unverifiable claim — ${result.reason}`);
        }
        this._store.save(claim);
        return claim;
    }

    // Withdraws a claim THIS identity itself published. Silently
    // no-ops (returns false) for an unknown claim id or a claim
    // authored by someone else — retract() is never a moderation tool,
    // only ever "take back my own word," the same "the subject/other
    // party never gets a say" asymmetry every REQUIRED-signature
    // envelope in this codebase already keeps, applied here to the
    // author's own claim instead of a granting identity's own grant.
    retract(worldId, claimId) {
        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        const existing = this._store.list(worldId).find((claim) => claim.id === claimId);
        if (!existing || existing.authorIdentityId !== authorIdentityId) {
            return false;
        }
        return this._store.retract(worldId, claimId);
    }

    // Every claim this replica has on file for one region, most recent
    // first — raw facts, unranked. A UI wanting "who said what" reads
    // this; a UI wanting "what should I display" reads namingView()
    // below instead.
    claimsForRegion(worldId, regionId) {
        return this._store.listForRegion(worldId, regionId);
    }

    // core/PlaceNamingView.js#namingView(), applied to whatever this
    // replica currently has stored for `regionId` — see that module's
    // own header on why this is confidence, never authority.
    namingView(worldId, regionId) {
        return deriveNamingView(regionId, this._store.list(worldId));
    }
}
