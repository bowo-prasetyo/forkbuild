import { message } from '../../core/Message.js';

// 0.2.21: one place that names the three tiers a document moves
// through — Draft -> Saved -> Published — so the Editor's Document
// Info panel and World View's Document Info panel compute (and label)
// status identically, the same "one operation, one definition, every
// surface" reasoning 0.1.50 established for EditorActionRegistry.
//
//     Create Document
//           |
//           v
//     Draft / Local Document  (never persisted, or open with no save yet)
//           |
//           | Save
//           v
//     Persisted Document      (SAVED — on disk, mutable, overwriteable)
//           |
//           | Publish
//           v
//     Immutable Publication   (PUBLISHED)
//
// "Unsaved changes" (dirty) is deliberately NOT a fourth tier here — a
// Saved document with pending edits is still SAVED, just dirty, same
// as the existing Toolbar's "● Unsaved changes" indicator already
// treats it. Likewise "forked" is not a tier: a fork is an ordinary
// Draft or Saved document that happens to carry a parentDocumentId —
// shown alongside status, not blended into it (see
// WorldNavigationSession.getDocumentInfo / EditorView's info panel
// wiring).
export const LifecycleStatus = Object.freeze({
    DRAFT: 'draft',
    SAVED: 'saved',
    PUBLISHED: 'published'
});

// isPublished wins over hasBeenSaved: a published snapshot is, by
// definition, also persisted somewhere, but "Published" is the more
// informative thing to tell the user.
export function computeLifecycleStatus({ hasBeenSaved = false, isPublished = false } = {}) {
    if (isPublished) return LifecycleStatus.PUBLISHED;
    return hasBeenSaved ? LifecycleStatus.SAVED : LifecycleStatus.DRAFT;
}

// A message (core/Message.js) for the UI to show.
export function describeLifecycleStatus(status, { dirty = false } = {}) {
    switch (status) {
        case LifecycleStatus.PUBLISHED:
            return message('documentStatus.published');
        case LifecycleStatus.SAVED:
            return message(dirty ? 'documentStatus.savedDirty' : 'documentStatus.saved');
        default:
            return message('documentStatus.draft');
    }
}
