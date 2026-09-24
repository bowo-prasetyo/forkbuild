import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';
import { preferredClaimedName } from '../../core/PlaceNamingView.js';

// WorldNavigationSession place naming: signed naming claims, their exchange,
// and this replica's local preferred names.
export const placeNamingMethods = {
	// The signed-in identity's did:key id, or null, so PlaceNamingPanel can tell
	// its own claims apart without duplicating the identity lookup.
	getMyIdentityId() {
	    return resolveSigningIdentityId(this._identityProvider);
	},

	// -----------------------------------------------------------------
	// Place Naming & Naming Claims: a separate, additive layer. A WorldRegion's
	// own `name` is untouched. Any identity, not only the region's author or an
	// EDIT member, may publish a signed opinion about what a region is called
	// (core/PlaceNamingClaim.js), and this replica may prefer a name locally.
	// See docs/Principles.md, "A Name Is A Claim, Not A Fact".
	//
	// Without placeNamingClaimUseCase/localNamePreferenceStore, publish/retract
	// throw a clear "not available" error, and reads return empty/null, so a UI
	// can always call getPlaceNamingView()/getPreferredPlaceName().
	// -----------------------------------------------------------------

	// Signs and publishes "I claim region `regionId` is called `name`,"
	// scoped to whichever World that region actually belongs to (see
	// _resolveRegionOwner() above and core/PlaceNamingClaim.js's own
	// header on why a claim always carries an explicit worldId). Throws
	// if the region is unknown to this replica, or if naming claims were
	// never wired — never a canEditDocument() check, unlike every
	// World-content mutation above: publishing a claim never touches the
	// World itself. See application/placeNaming/PlaceNamingClaimUseCase.js#publish().
	publishPlaceNamingClaim(regionId, name) {
	    if (!this._placeNamingClaimUseCase) {
	        throw new Error('WorldNavigationSession: place naming claims are not available');
	    }
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        throw new Error(`WorldNavigationSession: no region "${regionId}" known`);
	    }
	    return this._placeNamingClaimUseCase.publish(owner.world.id, regionId, name);
	},

	// Withdraws a claim THIS identity itself published — see
	// application/placeNaming/PlaceNamingClaimUseCase.js#retract() on why anyone
	// else's claim id is silently ignored (returns false) rather than
	// throwing.
	retractPlaceNamingClaim(regionId, claimId) {
	    if (!this._placeNamingClaimUseCase) {
	        throw new Error('WorldNavigationSession: place naming claims are not available');
	    }
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        return false;
	    }
	    return this._placeNamingClaimUseCase.retract(owner.world.id, claimId);
	},

	// Every claim this replica knows about for one region, most recent
	// first — raw facts, unranked. [] when naming claims aren't wired or
	// the region is unknown, never an error.
	getPlaceNamingClaims(regionId) {
	    if (!this._placeNamingClaimUseCase) {
	        return [];
	    }
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        return [];
	    }
	    return this._placeNamingClaimUseCase.claimsForRegion(owner.world.id, regionId);
	},

	// core/PlaceNamingView.js#namingView() for one region — ranked by
	// distinct-author score, most-agreed-on name first. [] under the
	// same "nothing wired, nothing known" conditions as
	// getPlaceNamingClaims() above.
	getPlaceNamingView(regionId) {
	    if (!this._placeNamingClaimUseCase) {
	        return [];
	    }
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        return [];
	    }
	    return this._placeNamingClaimUseCase.namingView(owner.world.id, regionId);
	},

	// Is a claim with this `claimId` for this `worldId` already in this
	// replica's store? Pass-through to PlaceNamingClaimUseCase#hasClaim().
	// `worldId` is taken directly because a nearby claim may name a World not
	// being viewed. False when naming claims aren't wired.
	hasPlaceNamingClaim(worldId, claimId) {
	    if (!this._placeNamingClaimUseCase) {
	        return false;
	    }
	    return this._placeNamingClaimUseCase.hasClaim(worldId, claimId);
	},

	// -----------------------------------------------------------------
	// Decentralized Place Name Exchange: how a claim reaches, or is reached by,
	// another replica. Both methods delegate to
	// application/placeNaming/PlaceNamingClaimExchange.js; this session validates, signs
	// and verifies nothing itself.
	// -----------------------------------------------------------------

	// Builds a portable publication package for one claim this replica
	// already has on file for `regionId` — see
	// application/placeNaming/PlaceNamingClaimPublication.js for the exact wire
	// shape. What the caller does with the returned package (write it to
	// a file, copy it to a clipboard) is this session's own business as
	// little as it is application/blueprint/ExportBlueprintUseCase.js's. Throws if
	// exchange isn't wired, the region is unknown, or `claimId` doesn't
	// match any claim this replica actually has for it — never a stale
	// or partial package.
	exportPlaceNamingClaim(regionId, claimId) {
	    if (!this._placeNamingClaimExchange) {
	        throw new Error('WorldNavigationSession: place naming exchange is not available');
	    }
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        throw new Error(`WorldNavigationSession: no region "${regionId}" known`);
	    }
	    const claim = this._placeNamingClaimUseCase
	        ? this._placeNamingClaimUseCase.claimsForRegion(owner.world.id, regionId).find((c) => c.id === claimId)
	        : null;
	    if (!claim) {
	        throw new Error(`WorldNavigationSession: no naming claim "${claimId}" known for this region`);
	    }
	    return this._placeNamingClaimExchange.exportClaim(claim);
	},

	// Imports a naming claim publication `pkg` (untrusted input — see
	// application/placeNaming/PlaceNamingClaimExchange.js#importClaim()'s own
	// "validate, construct, verify" order) into this replica's own
	// claim store. Deliberately NOT scoped to `regionId` or to whatever
	// World is currently active: a publication carries its own
	// worldId/regionId, and application/placeNaming/LocalPlaceNamingClaimStore.js is
	// already scoped per-World — see that store's own header on why it
	// happily holds claims for a World this replica isn't even currently
	// viewing. Returns `{ claim, isNew }`; throws for anything malformed
	// or unverifiable, never silently drops it.
	importPlaceNamingClaim(pkg) {
	    if (!this._placeNamingClaimExchange) {
	        throw new Error('WorldNavigationSession: place naming exchange is not available');
	    }
	    return this._placeNamingClaimExchange.importClaim(pkg);
	},

	// This replica's own LOCAL, unsigned, unshared override — see
	// application/identity/LocalNamePreferenceStore.js's own header on why this
	// is a genuinely third concept, never a claim and never the
	// region's own name.
	setPreferredPlaceName(regionId, name) {
	    if (!this._localNamePreferenceStore) {
	        throw new Error('WorldNavigationSession: place name preferences are not available');
	    }
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        throw new Error(`WorldNavigationSession: no region "${regionId}" known`);
	    }
	    return this._localNamePreferenceStore.setPreferredName(owner.world.id, regionId, name);
	},

	clearPreferredPlaceName(regionId) {
	    if (!this._localNamePreferenceStore) {
	        return false;
	    }
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        return false;
	    }
	    return this._localNamePreferenceStore.clearPreferredName(owner.world.id, regionId);
	},

	// This replica's own raw local override for one region, or null —
	// distinct from getDisplayPlaceName() below, which additionally
	// falls back to the community-claimed and World-authored name. A UI
	// showing "your preference: ___" reads this; a UI showing "what to
	// actually label the map with" reads getDisplayPlaceName().
	getPreferredPlaceName(regionId) {
	    if (!this._localNamePreferenceStore) {
	        return null;
	    }
	    const owner = this._resolveRegionOwner(regionId);
	    if (!owner) {
	        return null;
	    }
	    return this._localNamePreferenceStore.getPreferredName(owner.world.id, regionId);
	},

	// The name to display for a region, in priority order:
	//   1. this replica's own local preference, if one was ever set
	//   2. the top-ranked name from getPlaceNamingView() above, if
	//      anyone has published a claim at all
	//   3. the region's own WorldRegion.name
	// Never throws or returns an empty string for an existing region.
	getDisplayPlaceName(regionId) {
	    const owner = this._resolveRegionOwner(regionId);
	    const preferred = (this._localNamePreferenceStore && owner)
	        ? this._localNamePreferenceStore.getPreferredName(owner.world.id, regionId)
	        : null;
	    if (preferred) {
	        return preferred;
	    }
	    const claimed = preferredClaimedName(regionId, this.getPlaceNamingClaims(regionId));
	    if (claimed) {
	        return claimed;
	    }
	    const region = this.getRegion(regionId);
	    return region ? region.name : '';
	},
};
