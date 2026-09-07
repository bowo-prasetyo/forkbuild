// 0.9.247 — Publication Commentary Query / Observation Boundary.
//
// 0.9.244-0.9.246 built the one authoritative WRITE path for commentary
// (authenticated identity -> authorization -> PublicationCommentary ->
// PublicationCommentaryStore). Nothing yet named the corresponding READ
// path — the thing a Publication UI will actually call to display what
// already exists. Without this file, the only way to read commentary
// back is `PublicationCommentaryStore.getForPublication()` directly,
// which would let a future UI depend on a concrete storage class the
// same way 0.9.244's own header refused to let it depend on
// `PublicationCommentary` construction or `store.save()` directly. This
// milestone closes that gap, and only that gap:
//
//   publicationId
//        │
//        │  GetPublicationCommentariesUseCase.execute()
//        ▼
//   PublicationCommentaryStore.getForPublication()   (0.9.243, unmodified)
//        ▼
//   PublicationCommentary[]
//
// AS THIN AS THE WRITE SIDE'S OWN FIRST STEP (0.9.244) WAS, DELIBERATELY
// THINNER THAN ITS FINAL SHAPE. Reading commentary carries none of the
// write side's identity/authorization concerns — 0.9.246's own audit
// already established that ForkBuild's Publication/discovery stack is
// openly readable by design, and that finding applies here even more
// directly: this file lists commentary that is already sitting in an
// injected store, never a Publication's own discovery-gated content.
// There is no authenticated-caller step, no authorization check, and no
// identityProvider dependency of any kind — `execute()` takes a bare
// `publicationId` and nothing else.
//
// NO DISCOVERY-PROVIDER CALL, ON PURPOSE. It would be tempting to reuse
// 0.9.246's own `discoveryProvider.findById(publicationId)` here too, to
// distinguish "an existing Publication with zero commentary" from "a
// publicationId nobody ever published." This file deliberately does not:
// that would make a pure storage-backed query own an existence check
// that belongs to Publication resolution, not commentary retrieval — the
// exact seam this milestone's own brief warns against duplicating. An
// unrecognized `publicationId` and a real Publication with no commentary
// yet are answered identically: `[]`. A caller that needs to know
// whether a Publication itself exists already has
// `application/ResolvePublicationUseCase.js` (or
// `CanCommentOnPublicationUseCase`) for that separate question.
//
// ORDERING IS WHATEVER THE INJECTED STORE RETURNS, NEVER RE-SORTED HERE.
// `PublicationCommentaryStore.getForPublication()`'s own header already
// guarantees insertion order ("in the order they were originally
// saved"); this file adds no `sort()`, no `createdAt` comparison, no
// newest-first flip. If a later UI milestone wants a different reading
// order, that is a presentation decision made in that milestone, not a
// query-boundary concern smuggled in here because the field happens to
// exist.
//
// PUBLICATION ISOLATION IS THE STORE'S OWN GUARANTEE, REUSED, NEVER
// REIMPLEMENTED. `getForPublication()` filters strictly by
// `publicationId` — two Publications produced from the same underlying
// Document (see `core/PublicationCommentaryCollection.js`'s own 0.9.242
// header) never contaminate each other's results here, because this
// file performs no filtering of its own; it passes `publicationId`
// through unchanged and returns whatever the store hands back.
//
// DUCK-TYPED STORE DEPENDENCY, LIKE `AddPublicationCommentaryUseCase`'s
// OWN `store`. This class calls exactly one method —
// `getForPublication(publicationId)` — on whatever it is constructed
// with; it imports no concrete `PublicationCommentaryStore`,
// `StorageProvider`, or `LocalStorageProvider` of its own. See
// tests/GetPublicationCommentariesUseCase.test.js Section H.
//
// NOT PART OF THIS MILESTONE, deliberately, not merely unbuilt yet: no
// `PublicationCommentaryObserver`, no subscription, no live update, no
// polling, no pagination, no sorting, no deduplication, no author
// ranking, no relevance/trust ordering, and no UI. A query answers "what
// exists right now"; a subscription answers "tell me when it changes" —
// this milestone is only the former. If a later milestone finds the
// product actually needs the latter, that is a separate, deliberate
// decision, made the same way 0.9.216/0.9.219/0.9.221/0.9.246 already
// made comparable calls for other domains.
export class GetPublicationCommentariesUseCase {
    constructor(store) {
        if (!store || typeof store.getForPublication !== 'function') {
            throw new Error('GetPublicationCommentariesUseCase: a store with getForPublication(publicationId) is required');
        }
        this._store = store;
    }

    // Every PublicationCommentary on file for `publicationId`, in
    // whatever order the injected store returns them — see this file's
    // own header. `publicationId` must be a non-empty string (a
    // malformed call, rejected the same way `CanCommentOnPublicationUseCase`
    // rejects a missing `identityId` — before ever reaching the store);
    // a well-formed `publicationId` that simply has no commentary on
    // file, or that names no Publication ForkBuild has ever heard of,
    // both return `[]`, never an error — see this file's own header on
    // why this class never calls a discoveryProvider to tell the two
    // apart. A genuine store read failure propagates unmodified, exactly
    // as `AddPublicationCommentaryUseCase` lets a genuine write failure
    // propagate unmodified out of `store.save()`.
    execute({ publicationId } = {}) {
        if (!publicationId || typeof publicationId !== 'string') {
            throw new Error('GetPublicationCommentariesUseCase: publicationId is required');
        }
        return this._store.getForPublication(publicationId);
    }
}
