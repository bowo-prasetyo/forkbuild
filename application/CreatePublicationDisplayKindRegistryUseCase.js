import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { createBlueprintAttributionPublicationKind } from './BlueprintAttributionPublicationKind.js';
import { createPlaceNamingClaimPublicationKind } from './PlaceNamingClaimPublicationKind.js';

function shortId(identityId) {
    return identityId ? identityId.slice(-14) : 'an unknown identity';
}

// 0.7.5 — Decentralized Publication UX & Resolution.
//
// A Publications Center has to show SOMETHING for a cataloged
// publication before a person ever decides to do anything with it — but
// application/PublicationResolver.js#resolve() requires a `kindPlugin`
// per call, and this codebase has exactly two so far: application/
// BlueprintAttributionPublicationKind.js and application/
// PlaceNamingClaimPublicationKind.js. Neither was ever meant to be
// constructed ad hoc by a view — every existing caller goes through a
// domain-specific composition root (application/
// CreateBlueprintAttributionUseCase.js, application/
// CreateWorldPlaceNamingUseCase.js) that also wires a durable store the
// resolved content gets imported into. This use case is a DIFFERENT
// composition, for a genuinely different purpose: resolving a
// publication only to DISPLAY what it is, never to import it anywhere.
//
// Deliberately builds each kindPlugin with `store` omitted — both
// factories made that optional in this same milestone specifically for
// this call site (see either factory's own 0.7.5 header). Merely
// opening the Publications Center to check whether a cataloged
// BlueprintAttribution or PlaceNamingClaim can be seen right now must
// never, as a side effect, silently add it to this replica's own
// LocalBlueprintAttributionStore/LocalPlaceNamingClaimStore — a person
// who actually wants that already has "Claim authorship" (application/
// BlueprintAttributionUseCase.js#publish()) and the naming claim
// equivalent, both entirely unchanged by this file. See docs/
// Principles.md, "A Resolution Coordinator Sequences; It Does Not
// Decide (0.7.5)."
//
// `describe()` is new here, not part of either kindPlugin factory's own
// contract (application/PublicationResolver.js never calls it — it only
// ever reads contentKind/validate/fromJSON/verify/crossCheck/store).
// It is presentation-only, read by application/
// PublicationResolutionView.js#resolvePublicationView() exactly once a
// publication has already reached RESOLVED, and never influences
// resolution itself in any way.
//
// Returns `{ kindPlugins }` — a plain object keyed by contentKind
// string, exactly the shape application/PublicationResolver.js#resolve()
// already expects a caller to select from for whichever contentKind a
// cataloged application/LocalPublicationCatalog.js entry actually
// carries. A contentKind with no entry here (a future kind this
// milestone never taught the UI about) is handled entirely by the
// caller — see application/PublicationResolutionView.js's own
// "unsupported kind" case — never by this file guessing.
export class CreatePublicationDisplayKindRegistryUseCase {
    execute() {
        const verifier = new LocalAuthorizationVerifier();

        const blueprintAttributionKind = {
            ...createBlueprintAttributionPublicationKind({ verifier }),
            describe: (attribution) => `Blueprint attribution — ${attribution.fingerprint}, claimed by ${shortId(attribution.authorIdentityId)}`
        };
        const placeNamingClaimKind = {
            ...createPlaceNamingClaimPublicationKind({ verifier }),
            describe: (claim) => `Place name claim — "${claim.name}", claimed by ${shortId(claim.authorIdentityId)}`
        };

        const kindPlugins = {
            [blueprintAttributionKind.contentKind]: blueprintAttributionKind,
            [placeNamingClaimKind.contentKind]: placeNamingClaimKind
        };

        return { kindPlugins, verifier };
    }
}
