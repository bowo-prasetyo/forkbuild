import { createId } from './createId.js';

// 0.9.242 — Publication Commentary Domain Boundary.
//
// 0.9.241's own Section C re-ranked the two product seams 0.9.221 had
// left unchosen and named this one first: commentary/annotation on a
// Publication, ahead of notifications, precisely because it has a
// concrete shipped architectural analog
// (application/PublicationObservationArchive.js — a local, append-only
// record attached to an immutable Publication) and carries no
// delivery-guarantee question the just-closed collaboration arc spent
// 0.9.222-0.9.240 being careful never to assume. This milestone is the
// FIRST step of that seam, and deliberately only one step: the domain
// boundary, nothing else.
//
//   Document
//      │
//      │  publish
//      ▼
//   Publication              contentReference / distribution /
//      │                      discovery / World placement
//      │
//      └── PublicationCommentary (THIS FILE)
//             │
//             ├── commentaryId
//             ├── publicationId
//             ├── authorIdentityId
//             ├── content
//             └── createdAt
//
// THE ONE ARCHITECTURAL DECISION THIS MILESTONE EXISTS TO MAKE:
// commentary references a `publicationId`, never a `documentId`. A
// Publication is the immutable, already-published artifact a comment
// discusses; a Document is the mutable working draft that produced it.
// core/DecentralizedPublication.js and publisher/Publication.js both
// already draw the identical line between an editable Document and the
// signed, immutable thing publishing it produces — this file just
// extends that same boundary to commentary:
//
//   Document A
//       │
//       ├── Publication P1 ──── Commentary C1
//       │
//       └── later edit
//              │
//              └── Publication P2 ──── Commentary C2
//
// A commentary attached to P1 stays attached to P1 forever. It never
// silently follows the Document to P2, and re-publishing the same
// Document a second time never moves, copies, or re-targets an
// existing commentary's `publicationId` — that field is set once, at
// construction, and this class exposes no way to change it. Commentary
// discusses a published artifact, not an evolving document.
//
// FOUR IDENTITIES, KEPT DELIBERATELY INDEPENDENT, EVEN WHEN A CALLER
// HAPPENS TO CONSTRUCT THEM FROM RELATED VALUES:
//
//   publicationId          — the published artifact being discussed
//   commentaryId            — this individual commentary
//   authorIdentityId         — the identity that authored it
//   contentReference.hash   — the PUBLICATION's own content identity
//                              (publisher/Publication.js#contentReference
//                              / #contentHash — never read or
//                              re-derived here)
//
// This class never compares, derives, or defaults one of these from
// another. `commentaryId !== publicationId`, `publicationId !==
// documentId`, `publicationId !== contentReference.hash` — three
// independent facts, not one value wearing different names.
//
// IMMUTABLE, LIKE core/DecentralizedPublication.js AND
// publisher/Publication.js — NOT LIKE core/DocumentMetadata.js's
// in-place setters. Deliberately more restrictive than either of those
// two, though: this class has no `withX()` method at all, because
// 0.9.242 makes an explicit product decision not to answer yet whether
// a commentary can ever be edited. Treat a commentary as an immutable
// authored record for now — if a later milestone decides authors may
// edit or retract their own commentary, that is a separate, deliberate
// lifecycle decision, made the same way 0.9.216/0.9.219/0.9.221 already
// made comparable calls, never something this milestone back-fills by
// accident.
//
// DELIBERATELY CARRIES NONE OF THE COLLABORATION ARC'S OWN VOCABULARY —
// no `causalPredecessors`, no `logicalClock`, no `operationId`, no
// replay window, no readiness/eligibility/deferral state. This is
// adjacent to document collaboration (0.9.222-0.9.240), not a
// continuation of it: a commentary is a single authored fact about an
// already-published, immutable artifact, never an operation applied to
// mutable shared state. Nothing here needs causal ordering, gap
// detection, or recovery, because nothing here is ever merged with
// anything else.
//
// EXPLICITLY NOT PART OF 0.9.242 — deliberately absent, not merely
// unimplemented: edited-at, deleted/tombstone state, threading, replies,
// reactions, likes, mentions, moderation state, trust score, ownership,
// visibility state, unread/read state, synchronization metadata. Adding
// any of these later is a new, separate product decision, exactly the
// same restraint core/ChatMessage.js's own 0.2.61 header held for chat
// ("attachments, edits, reactions, and typing indicators are all later,
// additive work, never this milestone's").
export class PublicationCommentary {
    constructor({
        commentaryId = createId(),
        publicationId,
        authorIdentityId,
        content,
        createdAt = new Date()
    } = {}) {
        if (!commentaryId || typeof commentaryId !== 'string') {
            throw new Error('PublicationCommentary requires a commentaryId');
        }
        if (!publicationId || typeof publicationId !== 'string') {
            throw new Error('PublicationCommentary requires a publicationId');
        }
        if (!authorIdentityId || typeof authorIdentityId !== 'string') {
            throw new Error('PublicationCommentary requires an authorIdentityId');
        }
        if (typeof content !== 'string' || content.trim().length === 0) {
            throw new Error('PublicationCommentary requires non-empty content');
        }
        const createdAtDate = createdAt instanceof Date ? createdAt : new Date(createdAt);
        if (Number.isNaN(createdAtDate.getTime())) {
            throw new Error('PublicationCommentary: createdAt must be a valid date');
        }
        this._commentaryId = commentaryId;
        this._publicationId = publicationId;
        this._authorIdentityId = authorIdentityId;
        this._content = content;
        this._createdAt = createdAtDate;
    }

    get commentaryId() { return this._commentaryId; }
    get publicationId() { return this._publicationId; }
    get authorIdentityId() { return this._authorIdentityId; }
    get content() { return this._content; }
    get createdAt() { return this._createdAt; }

    toJSON() {
        return {
            commentaryId: this._commentaryId,
            publicationId: this._publicationId,
            authorIdentityId: this._authorIdentityId,
            content: this._content,
            createdAt: this._createdAt.toISOString()
        };
    }

    // Never throws — a corrupted or unrecognized stored record simply
    // isn't restored, the same "validate strictly on write, degrade
    // gracefully on read" split core/ConversationEntry.js#fromJSON
    // already uses one file over.
    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        try {
            return new PublicationCommentary(json);
        } catch {
            return null;
        }
    }
}
