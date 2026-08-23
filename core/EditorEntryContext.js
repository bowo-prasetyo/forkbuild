// 0.6.0 — Context-Preserving Fork-to-Edit.
//
// 0.5.9 drew the boundary: World View Observes and Navigates; Editor
// Mutates and Builds. "Edit a Copy" is the one deliberate door between
// them — but 0.5.9 left it a bare `/editor?fork=<documentId>` hop, and
// said so explicitly in its own "Deliberately excluded" list: camera
// framing inside the Editor on open is "a real feature, out of
// proportion to that milestone." This module is that feature, sized on
// its own.
//
// An EditorEntryContext answers one question, asked exactly once, at
// the moment a fork opens in the Editor: "why did the viewer arrive
// here, and what were they looking at?" It is the SAME kind of thing
// core/WorldFocusContext.js already is — small, derived, and
// EPHEMERAL — extended one step further, across the one hard boundary
// in this codebase a WorldFocusContext never crosses: a full page
// navigation into a different View. See this codebase's own repeated
// precedent for "real, but never Document content" (spatial presence,
// the activity feed, local experience, Focus itself, geographic place
// views) — an EditorEntryContext joins that list:
//
//   An EditorEntryContext explains how the user arrived; it does not
//   become part of the Document, and it is never read again after the
//   Editor has consumed it once.
//
// It is never constructed from a Document, never serialized into one
// (core/Document.js#toJSON()/core/World.js#toJSON() have no field for
// it and never will), and never persisted anywhere — it lives for the
// span of one router navigation and is discarded by EditorView's own
// onMounted() the instant it's applied (see application/EditorSession.js
// #applyEntryContext()).
//
// -----------------------------------------------------------------
// Why `selectAllBricks` is a boolean, never a list of brick ids
// -----------------------------------------------------------------
//
// The obvious-looking design is "carry the focused structure's own
// brick ids, then select exactly those in the fork." That design is
// wrong, and would fail the very first time it ran: every fork/clone
// in this codebase (application/DocumentCloneService.js, the ONE
// cloning mechanism both "Edit a Copy" and ForkStructureUseCase share)
// deliberately strips and regenerates every world/building/brick id —
// "independent documents never share brick ids" is that module's own
// stated invariant. A source brick id could never be found in the
// fork's own content; threading one across a fork is a category error,
// not a missing feature.
//
// The actual answer is simpler than the obvious-looking design: a
// STRUCTURE's own `documentId` (see core/WorldFocusContext.js's own
// per-kind table) is, by construction, the placed structure's ENTIRE
// content document — nothing else lives in it (see
// application/ForkStructureUseCase.js's own header: a library
// Structure forks into a Document containing exactly that structure's
// bricks, one Building). So "select the structure" and "select every
// brick currently in the freshly-opened fork" are the SAME operation,
// resolved AFTER the fork completes, against the fork's OWN fresh ids
// — never a set threaded across the identity boundary a fork already
// promises to break. `selectAllBricks` just names that: "the whole
// document this fork opened onto IS the focused object."
//
// -----------------------------------------------------------------
// Why REGION/LANDMARK never set selectAllBricks
// -----------------------------------------------------------------
//
// A REGION or LANDMARK's own `documentId` is the containing WORLD, not
// content it owns — "selecting all bricks in the fork" for those two
// would mean selecting every brick anyone ever placed in that World,
// e.g. "why did clicking the village well select half the village?"
// (see docs/Roadmap.md, 0.6.0's own design conversation). Only a kind
// whose OWN document is entirely and exclusively its own content may
// ever set this — today, only STRUCTURE. See
// core/WorldFocusContext.js#WorldFocusContext.editCopyContext, the one
// place this decision is made, per kind, exactly like every other
// per-kind branch deriveWorldFocusContext() already has.
//
// -----------------------------------------------------------------
// 0.6.1 — World ↔ Editor Continuity & Return Navigation
// -----------------------------------------------------------------
//
// 0.6.0 made an EditorEntryContext answer "why did the viewer arrive,
// and what were they looking at" on the way IN. This milestone reuses
// the exact same object for the trip back OUT, rather than inventing a
// second "return context" shape: `returnWorldId`/`returnWorldTitle`
// (this module's own header on the constructor explains why
// `returnWorldId` can't just be `sourceDocumentId`) tell
// ui/components/Toolbar.js's own "← Back to World" button where to
// navigate, and `focusLocationId` — already carried for the Editor's
// OWN camera framing — doubles as exactly what ui/views/WorldView.js
// needs to reopen the SAME WorldFocusPanel on return (its own
// getFocusContextForLocation() already takes precisely this id). One
// small ephemeral object, read once on the way in
// (EditorSession#applyEntryContext()) and once on the way out
// (EditorView's own "← Back to World" handler), never a Document
// field, a WorldPlacement field, or anything broadcast — the same
// posture this module's own top-of-file header already established.
export const EditorEntryReason = Object.freeze({
    WORLD_VIEW_EDIT_COPY: 'world_view_edit_copy'
});

export function isValidEditorEntryReason(reason) {
    return Object.values(EditorEntryReason).includes(reason);
}

export class EditorEntryContext {
    constructor({
        sourceDocumentId,
        focusPosition = null,
        focusLocationId = null,
        selectAllBricks = false,
        title = '',
        kind = null,
        reason = null,
        // 0.6.1 — World ↔ Editor Continuity & Return Navigation. The
        // World View document to navigate BACK to — deliberately its
        // own field, never conflated with `sourceDocumentId` above.
        // For REGION/LANDMARK, `sourceDocumentId` already IS the
        // containing World (see this module's own header on why), but
        // for STRUCTURE it's the placed structure's own content
        // document — a fork target, not a place to return the viewer
        // to. Only the caller (ui/views/WorldView.js, which alone
        // knows which World is currently on screen) can supply the
        // right answer for every kind uniformly — see
        // core/WorldFocusContext.js's own note on why this is never
        // derived here. `returnWorldTitle` is carried purely for the
        // Editor's own "← Back to World" header (docs/Roadmap.md,
        // 0.6.1) — a display convenience, resolved once by WorldView
        // and never re-looked-up by the Editor, which has no access to
        // World data at all.
        returnWorldId = null,
        returnWorldTitle = ''
    } = {}) {
        if (!sourceDocumentId) {
            throw new Error('EditorEntryContext requires a sourceDocumentId');
        }
        this._sourceDocumentId = sourceDocumentId;
        this._focusPosition = focusPosition
            ? {
                x: Number(focusPosition.x) || 0,
                y: Number(focusPosition.y) || 0,
                z: Number(focusPosition.z) || 0
            }
            : null;
        this._focusLocationId = focusLocationId || null;
        this._selectAllBricks = !!selectAllBricks;
        this._title = title || '';
        this._kind = kind || null;
        this._reason = reason || null;
        this._returnWorldId = returnWorldId || null;
        this._returnWorldTitle = returnWorldTitle || '';
    }

    get sourceDocumentId() { return this._sourceDocumentId; }
    get focusPosition() { return this._focusPosition; }
    get focusLocationId() { return this._focusLocationId; }
    get selectAllBricks() { return this._selectAllBricks; }
    get title() { return this._title; }
    get kind() { return this._kind; }
    get reason() { return this._reason; }
    get returnWorldId() { return this._returnWorldId; }
    get returnWorldTitle() { return this._returnWorldTitle; }

    toJSON() {
        return {
            sourceDocumentId: this._sourceDocumentId,
            focusPosition: this._focusPosition ? { ...this._focusPosition } : null,
            focusLocationId: this._focusLocationId,
            selectAllBricks: this._selectAllBricks,
            title: this._title,
            kind: this._kind,
            reason: this._reason,
            returnWorldId: this._returnWorldId,
            returnWorldTitle: this._returnWorldTitle
        };
    }
}

// 0.6.1 — the one place `returnWorldId`/`returnWorldTitle` are ever
// attached to an EditorEntryContext that didn't already carry them.
// Needed because core/WorldFocusContext.js#editCopyContext is a plain
// getter (no arguments — see its own 0.6.0 header) computed from
// fields a WorldFocusContext already has, and NONE of them is "which
// World is currently on screen." Only ui/views/WorldView.js's own
// route/session state knows that, so it calls this immediately after
// reading `context.editCopyContext`, rather than editCopyContext
// guessing at a World id it was never given. Pure: returns a NEW
// EditorEntryContext (this module's instances are treated as
// immutable everywhere else already), or the input unchanged when
// there's nothing to attach — never mutates `entryContext` in place.
export function withReturnWorld(entryContext, { returnWorldId = null, returnWorldTitle = '' } = {}) {
    if (!entryContext || !returnWorldId) {
        return entryContext;
    }
    return new EditorEntryContext({ ...entryContext.toJSON(), returnWorldId, returnWorldTitle });
}

// The one place an EditorEntryContext is ever derived FROM a
// WorldFocusContext — called by core/WorldFocusContext.js's own
// `editCopyContext` getter, never anywhere else. Pure: no session, no
// store, no camera movement, no selection change — exactly the same
// "gather, then derive" posture deriveWorldFocusContext() itself
// already holds to. `selectAllBricks` is passed in explicitly by the
// caller (never decided here) — see this module's own header on why
// only STRUCTURE ever sets it.
//
// Returns null when there is nothing to fork (no source.documentId) —
// the graceful-absence posture every derive*() in this codebase shares.
export function deriveEditorEntryContext(focusContext, {
    selectAllBricks = false,
    reason = EditorEntryReason.WORLD_VIEW_EDIT_COPY
} = {}) {
    if (!focusContext || !focusContext.source || !focusContext.source.documentId) {
        return null;
    }
    return new EditorEntryContext({
        sourceDocumentId: focusContext.source.documentId,
        focusPosition: focusContext.position || null,
        focusLocationId: focusContext.source.id || null,
        selectAllBricks,
        title: focusContext.title || '',
        kind: focusContext.source.kind || focusContext.kind || null,
        reason
    });
}

// -----------------------------------------------------------------
// Router-query encode/decode
// -----------------------------------------------------------------
//
// A full page navigation to `/editor?fork=<documentId>` is the ONLY
// channel ui/views/WorldView.js's "Edit a Copy" and ui/views/
// EditorView.js's own `route.query.fork` handler share — there is no
// shared in-memory session the way core/WorldFocusContext.js's own
// consumers all stay inside one WorldView instance. The encode/decode
// pair lives together, here, once, so the two views agree on key names
// by construction rather than independently. Every value is a plain
// string — exactly what `fork`/`publication`/`load` already are on
// this same query object — never JSON-stringified, so a stale or
// hand-typed URL degrades to "no entry context at all" (see
// editorEntryContextFromQuery()'s own null-return below) rather than
// throwing.
export function editorEntryContextToQuery(entryContext) {
    if (!entryContext) {
        return {};
    }
    const query = {};
    if (entryContext.reason) query.entryReason = entryContext.reason;
    if (entryContext.kind) query.entryKind = entryContext.kind;
    if (entryContext.title) query.entryTitle = entryContext.title;
    if (entryContext.focusLocationId) query.entryLocation = entryContext.focusLocationId;
    if (entryContext.focusPosition) {
        query.entryX = String(entryContext.focusPosition.x);
        query.entryY = String(entryContext.focusPosition.y);
        query.entryZ = String(entryContext.focusPosition.z);
    }
    if (entryContext.selectAllBricks) query.entrySelectAll = '1';
    // 0.6.1 — carried the same way `entryTitle`/`entryKind` already
    // are: a plain string, present only when there's something to
    // carry. `returnWorldId` is what lets the Editor's own "← Back to
    // World" button (ui/components/Toolbar.js) navigate anywhere at
    // all — see core/EditorEntryContext.js's own constructor header on
    // why it's never the same value as `sourceDocumentId`/`entryLocation`.
    if (entryContext.returnWorldId) query.entryReturnWorld = entryContext.returnWorldId;
    if (entryContext.returnWorldTitle) query.entryReturnWorldTitle = entryContext.returnWorldTitle;
    return query;
}

// `sourceDocumentId` is passed separately rather than re-read off the
// query — the caller (EditorView's fork handler) already has it as
// `route.query.fork`, the SAME value this context's own
// `sourceDocumentId` would be; re-encoding it a second time under a
// different key would be exactly the kind of duplicated state this
// codebase avoids. Returns null when there is no `entryReason` at all
// (a plain `/editor?fork=` with no entry context — every fork reached
// through a route this milestone did not touch, e.g. a future one)
// or no sourceDocumentId to attach it to.
export function editorEntryContextFromQuery(query, sourceDocumentId) {
    if (!query || !sourceDocumentId || !query.entryReason) {
        return null;
    }
    const hasPosition = query.entryX !== undefined && query.entryY !== undefined && query.entryZ !== undefined;
    return new EditorEntryContext({
        sourceDocumentId,
        focusPosition: hasPosition
            ? { x: Number(query.entryX), y: Number(query.entryY), z: Number(query.entryZ) }
            : null,
        focusLocationId: query.entryLocation || null,
        selectAllBricks: query.entrySelectAll === '1',
        title: query.entryTitle || '',
        kind: query.entryKind || null,
        reason: query.entryReason,
        returnWorldId: query.entryReturnWorld || null,
        returnWorldTitle: query.entryReturnWorldTitle || ''
    });
}
