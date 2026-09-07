import { PublicationCommentary } from '../core/PublicationCommentary.js';

// 0.9.244 — Publication Commentary Application Command Boundary.
//
// 0.9.242 drew the domain seam (core/PublicationCommentary.js /
// core/PublicationCommentaryCollection.js) and 0.9.243 drew the storage
// seam (storage/PublicationCommentaryStore.js). Neither names a single
// place where user intent — "I want to comment on this Publication" —
// becomes a persisted PublicationCommentary. This file is that place,
// and only that:
//
//   { publicationId, authorIdentityId, content, createdAt?, commentaryId? }
//        │
//        │  execute()
//        ▼
//   PublicationCommentary                  (0.9.242, unmodified — this
//        │                                  class's own constructor is
//        │                                  the only validation that
//        │                                  runs; this file duplicates
//        │                                  none of it)
//        ▼
//   PublicationCommentaryStore.save()      (0.9.243, unmodified)
//
// ONE STEP, NOT TWO, UNLIKE application/AddPublicationAnchorUseCase.js
// AND application/AddPublicationSnapshotPlacementUseCase.js. Those two
// validate an untrusted JSON envelope arriving from a stranger before
// constructing a domain object from it. A commentary has no such
// envelope — it originates from this replica's own caller, and
// core/PublicationCommentary.js's own constructor already throws
// synchronously on anything invalid (missing publicationId, blank
// content, malformed createdAt, ...). A separate pre-validation step
// here would just be a second copy of that same validation, so there
// isn't one.
//
// ID GENERATION STAYS INSIDE PublicationCommentary, NOT HERE.
// `commentaryId` is accepted as an OPTIONAL passthrough, purely so a
// caller that already generated one — e.g. to make its own retry of a
// failed submission idempotent — can supply it; when omitted,
// PublicationCommentary generates one exactly as it always has. This
// file never generates, inspects, or defaults a commentaryId itself.
//
// RESULT SHAPE MIRRORS application/AddPublicationAnchorUseCase.js's OWN
// `{ anchor, isNew }` — `{ commentary, isNew }`. No CREATED /
// ALREADY_EXISTS / CONFLICT / INVALID result vocabulary: an invalid
// input and a genuine id/content conflict are already distinct,
// meaningful thrown errors (a plain Error from PublicationCommentary's
// own constructor; PublicationCommentaryConflictError from the store),
// and `isNew` is already sufficient to distinguish "a new record was
// appended" from "this exact commentary was already on file" for the one
// non-error case. Inventing a result enum on top of that would describe
// the same outcomes twice.
//
// AUTHORSHIP: `authorIdentityId` IS SUPPLIED BY THE CALLER, NOT DERIVED
// OR AUTHENTICATED HERE. This file draws the line between "the identity
// a commentary is attributed to" and "the identity actually making this
// call" without collapsing the two, but implements no authorization rule
// at all — it never checks that `authorIdentityId` matches some notion
// of "the current user," because no such service is wired in yet.
// Whichever identity a caller passes is the identity that gets recorded,
// exactly as if a Publication permission model already existed and this
// use case sat downstream of it. An actual authorization check — "is
// this authorIdentityId allowed to comment on this Publication at all"
// — is explicitly deferred to a later, separate milestone; see this
// file's own entry in docs/Roadmap.md.
//
// WRITE FAILURES PROPAGATE; THEY ARE NEVER MISREAD AS SUCCESS. This use
// case performs no try/catch of its own around `store.save()` — a
// storage provider's own write failure already propagates unmodified
// out of PublicationCommentaryStore.save() (it calls `_persist()`,
// which calls the injected StorageProvider's `save()`, with no
// surrounding try/catch anywhere on that path), so execute() throws the
// exact same error a caller would see calling the store directly. This
// is deliberately asymmetric with PublicationCommentaryStore's own READ
// path (`_loadCollection()`), which degrades a corrupted or throwing
// provider to an empty collection — see that file's own header. Silent
// degradation is the right call for a read that failed to find history;
// it is never the right call for a write a caller is relying on to have
// actually happened. Audited for 0.9.244 and found already correct: no
// code change was needed in storage/PublicationCommentaryStore.js to
// achieve this.
export class AddPublicationCommentaryUseCase {
    constructor(store) {
        if (!store) {
            throw new Error('AddPublicationCommentaryUseCase: a PublicationCommentaryStore is required');
        }
        this._store = store;
    }

    // Constructs a PublicationCommentary from `input` and persists it
    // through the injected store. Returns `{ commentary, isNew }`:
    // `isNew` is `true` when a new record was actually appended, `false`
    // when an identical commentary for the same commentaryId was already
    // on file (the store's own idempotent no-op — see
    // storage/PublicationCommentaryStore.js#save()). Throws a plain
    // Error for structurally invalid input (missing publicationId,
    // blank content, ...) — the identical error PublicationCommentary's
    // own constructor already throws, never a second, parallel
    // validation. Throws PublicationCommentaryConflictError when the
    // same commentaryId is already on file with different content.
    // Never catches a storage provider's own write failure — see this
    // file's own header.
    execute({ publicationId, authorIdentityId, content, createdAt, commentaryId } = {}) {
        const commentary = new PublicationCommentary({ commentaryId, publicationId, authorIdentityId, content, createdAt });
        const isNew = this._store.save(commentary);
        return { commentary, isNew };
    }
}
