import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { PLACE_NAMING_CLAIM_PUBLICATION_KIND } from './PlaceNamingClaimPublication.js';
import { validatePlaceNamingClaimPublication } from './PlaceNamingClaimPublicationValidator.js';

// 0.7.1 — IPFS Content Publication & Resolution.
//
// The second `kindPlugin` for application/PublicationResolver.js, and
// the one that actually PROVES the pipeline is generic rather than
// merely reusable: application/BlueprintAttributionPublicationKind.js
// wraps a self-describing object (`core/BlueprintAttribution.js#toJSON()`
// already carries its own `kind`/`schemaVersion`), while a
// `PlaceNamingClaim` does not — 0.5.3 wraps it in a completely separate
// envelope module instead (`application/PlaceNamingClaimPublication.js`'s
// own header explains why: "no separate envelope module" was
// BlueprintAttribution's own choice, not a rule every claim type must
// follow). This plugin's `validate`/`fromJSON`/`verify` all operate on
// THAT wrapper shape (`{ kind, schemaVersion, claim }`), unwrapping
// `.claim` exactly where 0.5.3's own application/
// PlaceNamingClaimExchange.js#importClaim() already does — proof that
// application/PublicationResolver.js never assumed either shape.
//
// A SECOND transport for a PlaceNamingClaim, never a replacement for
// application/PlaceNamingClaimExchange.js's own 0.5.3 file-exchange
// path — the identical claim can travel either way.
//
// No `crossCheck` here, unlike application/
// BlueprintAttributionPublicationKind.js's own fingerprint check —
// application/PlaceNamingClaimExchange.js#importClaim() never had one
// either (a naming claim has no locally-derivable fact to compare
// against the way a Structure's own fingerprint gives an attribution
// one), and `crossCheck` on a kindPlugin has always been OPTIONAL — see
// application/PublicationResolver.js's own header.
//
// 0.7.5 — Decentralized Publication UX & Resolution. `store` is now
// OPTIONAL, for the identical reason application/
// BlueprintAttributionPublicationKind.js's own 0.7.5 header gives: a
// caller that only wants to know what a publication resolves to
// (application/PublicationResolutionCoordinator.js) never imports it
// into application/LocalPlaceNamingClaimStore.js as a side effect of
// checking. Every existing caller that already passes `store` is
// completely unaffected.
export function createPlaceNamingClaimPublicationKind({ verifier, store = null }) {
    if (!verifier) {
        throw new Error('createPlaceNamingClaimPublicationKind: an authorization verifier is required');
    }

    const plugin = {
        contentKind: PLACE_NAMING_CLAIM_PUBLICATION_KIND,

        validate: validatePlaceNamingClaimPublication,

        fromJSON: (pkg) => PlaceNamingClaim.fromJSON(pkg.claim),

        verify: (pkg) => verifier.verifyPlaceNamingClaim(pkg.claim)
    };

    if (store) {
        // Dedup-by-(worldId, id), the exact same posture
        // application/PlaceNamingClaimExchange.js#importClaim() already
        // established — a resolved publication this replica already
        // knows about is never an error.
        plugin.store = (claim) => {
            if (store.has(claim.worldId, claim.id)) {
                const existing = store.listForRegion(claim.worldId, claim.regionId)
                    .find((known) => known.id === claim.id);
                return { claim: existing || claim, isNew: false };
            }
            store.save(claim);
            return { claim, isNew: true };
        };
    }

    return plugin;
}
