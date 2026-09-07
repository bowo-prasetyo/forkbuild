import { PublicationCommentary } from '../core/PublicationCommentary.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';

// 0.9.246 — Publication Commentary Authorization Boundary.
//
// Adds exactly one step between 0.9.245's authorship resolution and
// PublicationCommentary construction:
//
//   resolveSigningIdentityId(identityProvider)   (0.9.245, unmodified)
//        │
//        ▼
//   authorIdentityId
//        │
//        ▼
//   canCommentOnPublicationUseCase.execute(       (NEW — 0.9.246)
//     { identityId: authorIdentityId, publicationId })
//        │
//        ├── false ──► throw, before any PublicationCommentary exists
//        │
//        ▼
//   PublicationCommentary                  (0.9.242, unmodified)
//        ▼
//   PublicationCommentaryStore.save()      (0.9.243, unmodified)
//
// The constructor now requires a `canCommentOnPublicationUseCase`
// collaborator alongside `store` and `identityProvider` — see
// application/CanCommentOnPublicationUseCase.js for the policy itself
// and the audit of ForkBuild's existing authorization surface that
// produced it. This file never inlines that policy, never duplicates a
// permission table, and never inspects `publicationId` itself to decide
// anything — it only asks the injected collaborator and acts on its
// boolean answer, exactly the same "ask, don't own, the decision"
// pattern application/SpatialEditingService.js already uses for
// application/WorldAuthorizationService.js's own decisions.
//
// AUTHORIZATION RUNS AFTER AUTHENTICATION, BEFORE CONSTRUCTION. A
// denied request never reaches `new PublicationCommentary(...)`, let
// alone `store.save()` — there is no partially-built, never-persisted
// commentary object left behind for a denied call, because none is ever
// constructed. See tests/PublicationCommentaryAuthorization.test.js
// Section F.
//
// 0.9.245 — Publication Commentary Authorship Boundary.
//
// 0.9.244's own header named the gap deliberately, rather than hid it:
// `authorIdentityId` was "supplied by the caller, not derived or
// authenticated" — the right call while no UI existed to abuse it, and
// the wrong one the moment a real Editor/Publication UI can call this
// use case with attacker-controlled input. This milestone closes
// exactly that gap, and only that gap:
//
//   { publicationId, content, createdAt?, commentaryId? }
//        │
//        │  execute()      ◄── no authorIdentityId accepted at all
//        ▼
//   resolveSigningIdentityId(identityProvider)   (identity/
//        │                                        resolveSigningIdentityId.js,
//        │                                        0.2.95 — unmodified,
//        │                                        reused exactly as
//        │                                        CreateDocumentManagerUseCase,
//        │                                        ForkDocumentUseCase,
//        │                                        ForkPublishedWorldUseCase and
//        │                                        ForkStructureUseCase already
//        │                                        do for DocumentMetadata
//        │                                        authorship)
//        ▼
//   authorIdentityId
//        ▼
//   PublicationCommentary                  (0.9.242, unmodified)
//        ▼
//   PublicationCommentaryStore.save()      (0.9.243, unmodified)
//
// NO NEW IDENTITY SYSTEM. This milestone introduces no identity class,
// no session concept, and no authentication mechanism of its own — it
// wires this use case to the identity/ infrastructure that already
// exists (identity/IdentityProvider.js's `getSigningIdentity()`,
// resolved the identical tolerant way resolveSigningIdentityId() already
// resolves it for four other use cases). A commentary's author is now
// exactly "whichever identity is currently authenticated onto the
// injected identityProvider" — nothing more exotic than that.
//
// authorIdentityId IS NO LONGER PART OF THIS USE CASE'S PUBLIC INPUT —
// not merely unused, but never even read. `execute()`'s own destructuring
// names only `publicationId`, `content`, `createdAt`, and `commentaryId`;
// an `authorIdentityId` field on a caller's input object is silently
// inert, exactly like passing an extra, unrecognized property to any
// other destructured function in this codebase. This is a deliberate
// choice among the ones 0.9.244 itself flagged as open: a caller cannot
// even ATTEMPT to name a different author, let alone succeed — there is
// no "reject the conflicting input" branch to test, because there is no
// branch that ever looks at the input's authorIdentityId in the first
// place. See tests/PublicationCommentaryAuthorship.test.js Section B.
//
// AUTHENTICATION, NOT AUTHORIZATION — the exact split 0.9.244's header
// already drew. This 0.9.245 section of history answers only "who is
// Alice, really" (derived from the app's own identity infrastructure,
// never from anything a UI could substitute); at the time this
// milestone shipped, it did not yet ask "is Alice allowed to comment on
// this Publication" — that question was answered next, by 0.9.246's
// canCommentOnPublicationUseCase step above. The two questions remain
// two separate steps in execute(), never merged into one check.
//
// A MISSING/UNAUTHENTICATED IDENTITY FAILS CREATION, CLEANLY, BEFORE ANY
// PublicationCommentary IS EVEN CONSTRUCTED — never an anonymous or
// placeholder author, and never a persisted record for a call that
// couldn't establish who made it. Mirrors
// application/CreatePublicationAnchorUseCase.js#execute()'s own
// "sign in to create a publication anchor" refusal for the identical
// reason.
//
// EVERYTHING ELSE 0.9.244 ESTABLISHED IS UNCHANGED: no separate
// envelope-validation step (`PublicationCommentary`'s own constructor is
// still the only content/publicationId validation that runs);
// `commentaryId` is still an optional passthrough for caller-side retry
// idempotency; the `{ commentary, isNew }` result shape is unchanged;
// and write failures still propagate unmodified out of
// `PublicationCommentaryStore.save()` — this file still performs no
// `try`/`catch` of its own around that call.
export class AddPublicationCommentaryUseCase {
    constructor(store, identityProvider, canCommentOnPublicationUseCase) {
        if (!store) {
            throw new Error('AddPublicationCommentaryUseCase: a PublicationCommentaryStore is required');
        }
        if (!identityProvider) {
            throw new Error('AddPublicationCommentaryUseCase: identityProvider is required');
        }
        if (!canCommentOnPublicationUseCase) {
            throw new Error('AddPublicationCommentaryUseCase: canCommentOnPublicationUseCase is required');
        }
        this._store = store;
        this._identityProvider = identityProvider;
        this._canCommentOnPublicationUseCase = canCommentOnPublicationUseCase;
    }

    // Resolves the author from the injected identityProvider's own
    // currently-authenticated signing identity, checks that identity's
    // authorization to comment on `publicationId` through the injected
    // canCommentOnPublicationUseCase, constructs a PublicationCommentary,
    // and persists it through the injected store. `input.authorIdentityId`,
    // if present, is never read — see this file's own header. Returns
    // `{ commentary, isNew }`, identically to 0.9.244. Throws a plain
    // Error when no identity is authenticated (before authorizing,
    // constructing, or persisting anything), a plain Error when the
    // authenticated identity is not authorized to comment on
    // `publicationId` (before constructing or persisting anything), a
    // plain Error for structurally invalid input (blank content, missing
    // publicationId — PublicationCommentary's own constructor validation,
    // unchanged), and PublicationCommentaryConflictError when the same
    // commentaryId is already on file with different content. Never
    // catches a storage provider's own write failure.
    execute({ publicationId, content, createdAt, commentaryId } = {}) {
        const authorIdentityId = resolveSigningIdentityId(this._identityProvider);
        if (!authorIdentityId) {
            throw new Error('AddPublicationCommentaryUseCase: sign in to comment on a publication');
        }
        const isAuthorized = this._canCommentOnPublicationUseCase.execute({ identityId: authorIdentityId, publicationId });
        if (!isAuthorized) {
            throw new Error(`AddPublicationCommentaryUseCase: not authorized to comment on publication ${publicationId}`);
        }
        const commentary = new PublicationCommentary({ commentaryId, publicationId, authorIdentityId, content, createdAt });
        const isNew = this._store.save(commentary);
        return { commentary, isNew };
    }
}
