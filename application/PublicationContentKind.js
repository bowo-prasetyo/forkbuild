import { Publication } from '../publisher/Publication.js';
import { PUBLICATION_CONTENT_KIND, validatePublicationContent } from './PublicationContentValidator.js';

export { PUBLICATION_CONTENT_KIND };

// 0.9.331 — Publication Content Kind for Decentralized Discovery.
//
// The THIRD `kindPlugin` for application/PublicationResolver.js, following
// the exact template application/BlueprintAttributionPublicationKind.js
// (0.7.0) and application/PlaceNamingClaimPublicationKind.js (0.7.1)
// already proved generic: `{ contentKind, validate, fromJSON, verify }`.
// Nothing here is a new capability — every function this plugin hands
// over already existed before this milestone (publisher/Publication.js#
// fromJSON, application/PublicationContentValidator.js, identity/
// LocalAuthorizationVerifier.js#verifyPublication — the identical
// verifier method application/WorldEncounterMaterialSignatureVerifier.js
// already calls the identical way: hydrate with Publication.fromJSON()
// first, then hand the INSTANCE to verifyPublication(), never the raw
// JSON — see that file's own verifyIdentity()). This plugin only
// re-sequences already-proven pieces behind the one transport-neutral
// pipeline PublicationResolver already is.
//
// 0.9.330's own audit (docs/Roadmap.md) identified this as the smallest
// safe seam toward letting Repository's own `publisher/Publication.js`
// participate in the already-established decentralized publication
// pipeline: a SECOND, PARALLEL way for a Publication to travel (this
// content kind), never a REPLACEMENT for however it already reaches a
// reader (a local catalog, a direct link) — the identical "second
// transport, not a replacement" posture every other content kind in
// this codebase already holds. Publishing one through
// application/PublicationResolver.js#publish() never mutates or
// re-signs the original Publication; resolving one back through
// #resolve() constructs a brand-new Publication instance from its own
// wire JSON, exactly the way `content = kindPlugin.fromJSON(contentJson)`
// already works for every other content kind. Nothing about
// publisher/Publication.js itself changes — this plugin ADAPTS an
// existing model to an existing pipeline, it does not introduce a
// second Publication model, and a Publication resolved this way is
// never written back into any local Publication store as a side effect
// of merely resolving it (this milestone intentionally omits an
// optional `store` step — see below).
//
// `documentId` is the one identity this milestone exists to protect (see
// docs/Roadmap.md, 0.9.330, Section D/H): it survives this entire round
// trip completely unmodified, because it is simply a field on
// publisher/Publication.js's own already-existing `toJSON()`/`fromJSON()`
// — never renamed, never re-derived, never replaced by
// core/DecentralizedPublication.js's own, unrelated `id`.
//
// Deliberately NO `store` option, unlike the other two kind plugins.
// Both of those already had an established local domain store ready to
// receive resolved content (LocalBlueprintAttributionStore,
// LocalPlaceNamingClaimStore); no such store exists yet for a
// decentralized-origin Publication, and inventing one now would be
// exactly the "new Repository-owned store" 0.9.330's own Section G
// explicitly rejected. Resolving a Publication through this plugin
// today can only ever answer "what does this locator resolve to" — the
// identical, deliberately narrow question application/
// PublicationResolutionCoordinator.js already asks of the other two
// kinds without a store. Persisting a resolved Publication into
// anything Repository-shaped is exactly the wiring 0.9.330 named as
// future work, never this milestone's own job.
export function createPublicationContentKind({ verifier }) {
    if (!verifier) {
        throw new Error('createPublicationContentKind: an authorization verifier is required');
    }

    return {
        contentKind: PUBLICATION_CONTENT_KIND,

        validate: validatePublicationContent,

        fromJSON: (json) => Publication.fromJSON(json),

        verify: (json) => verifier.verifyPublication(Publication.fromJSON(json))
    };
}
