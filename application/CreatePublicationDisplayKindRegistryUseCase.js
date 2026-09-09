import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { createBlueprintAttributionPublicationKind } from './BlueprintAttributionPublicationKind.js';
import { createPlaceNamingClaimPublicationKind } from './PlaceNamingClaimPublicationKind.js';
import { createPublicationContentKind } from './PublicationContentKind.js';

function shortId(identityId) {
    return identityId ? identityId.slice(-14) : 'an unknown identity';
}

// 0.7.5 — Decentralized Publication UX & Resolution.
//
// A Publications Center has to show SOMETHING for a cataloged
// publication before a person ever decides to do anything with it — but
// application/PublicationResolver.js#resolve() requires a `kindPlugin`
// per call, and this codebase had exactly two at the time this class was
// built: application/BlueprintAttributionPublicationKind.js and
// application/PlaceNamingClaimPublicationKind.js (0.9.333 adds a third —
// see below). Neither was ever meant to be constructed ad hoc by a view —
// every existing caller goes through a domain-specific composition root
// (application/CreateBlueprintAttributionUseCase.js, application/
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
// 0.9.333 — Decentralized Publication Display-Kind Integration.
//
// The THIRD entry in this registry, following the exact composition
// shape the two above already established: spread application/
// PublicationContentKind.js's own `createPublicationContentKind()`
// (0.9.331 — `{ contentKind, validate, fromJSON, verify }`, no `store`),
// then add a `describe()` for presentation, exactly like
// blueprintAttributionKind/placeNamingClaimKind immediately above. No new
// registration mechanism, no new dispatch branch, no `store` (this kind
// never had one — see application/PublicationContentKind.js's own
// header) — this is the one line of wiring 0.9.332's own Section H named
// as the sole remaining gap, closed the same way every kindPlugin in
// this file already is.
//
// A `forkbuild.publication` envelope, once resolved, hands `describe()` a
// real publisher/Publication.js instance — title/author, exactly the
// fields a person already reads off a locally-published Publication.
// `title`/`author` are the two fields application/
// PublicationContentValidator.js deliberately leaves OPTIONAL (see that
// file's own header — `publisher/Publication.js` tolerates an anonymous,
// untitled publication), so both are handled, not assumed present.
//
// This registration teaches the Publications Center nothing about WHERE
// a Publication came from — ui/views/DecentralizedPublicationsView.js's
// own template (unchanged by this milestone) already renders every
// cataloged entry the same way regardless of contentKind: a humanized
// content-kind label plus whatever `describe()` returns. A
// decentralized-origin Publication therefore renders through the
// identical card, the identical template, the identical dispatch this
// file already provides for the other two kinds — no new UI component,
// and no conditional anywhere keyed on how a publication was acquired.
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
        const publicationKind = {
            ...createPublicationContentKind({ verifier }),
            describe: (publication) => {
                const title = publication.title ? `"${publication.title}"` : 'an untitled publication';
                return publication.author ? `Publication — ${title}, by ${publication.author}` : `Publication — ${title}`;
            }
        };

        const kindPlugins = {
            [blueprintAttributionKind.contentKind]: blueprintAttributionKind,
            [placeNamingClaimKind.contentKind]: placeNamingClaimKind,
            [publicationKind.contentKind]: publicationKind
        };

        return { kindPlugins, verifier };
    }
}
