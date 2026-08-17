// 0.2.31/0.2.32 — the preview a catalog card/row shows for a
// publication.
//
// 0.2.31 left one question deliberately open: "is the preview part of
// the immutable publication, or merely a local UI cache?" — and shipped
// only the PLACEHOLDER half (a computed color + initial) while that
// question stayed unanswered. 0.2.32 answers it: a preview is NEVER
// part of the immutable publication. It is a local rendering cache,
// generated client-side from the document's own actual content — see
// docs/Principles.md, "Previews Are Derived Client State."
//
// This wasn't just a matter of avoiding a signing-schema hazard
// (though that hazard is real — Publication.getSigningDescriptor()'s
// payload covers every one of its own fields, and adding a new one
// would make every already-signed Publication recompute a descriptor
// that no longer matches its original signature). It's also the more
// principled answer: a preview a PUBLISHER supplies is a claim about
// their own content ("here's what this looks like") with no guarantee
// it corresponds to what's actually inside — the exact "beautiful
// castle thumbnail, one-brick document" clickbait problem a signed,
// author-supplied preview would not prevent. A preview rendered
// client-side, straight from the actual loaded Document, carries a
// real guarantee instead: this image is a visualization of the content
// you are actually about to open. It doesn't promise the content is
// good — only that it's honest.
//
// THUMBNAIL previews therefore carry an `image` — a local data: URL
// produced by renderer/DocumentThumbnailRenderer.js from the real
// Document, cached by application/PreviewService.js keyed on the
// publication's own `contentHash` (same immutable content -> same
// cached image; a genuinely different revision gets a different
// key) — never anything transmitted, signed, or agreed upon between
// replicas. `reference` stays reserved, unused, exactly as 0.2.31 left
// it: if a REAL immutable, content-addressed preview mechanism is ever
// deliberately designed later (its own schema-evolution question, not
// resolved by this milestone), that is what it would carry — 0.2.32
// answers "should previews work that way," not "could they, someday."
export const PreviewType = Object.freeze({
    NONE: 'NONE',
    PLACEHOLDER: 'PLACEHOLDER',
    THUMBNAIL: 'THUMBNAIL'
});

export class DocumentPreview {
    constructor({ type = PreviewType.NONE, reference = null, seed = null, label = null, image = null } = {}) {
        this.type = type;
        // Reserved, unused — see the module comment above.
        this.reference = reference;
        // PLACEHOLDER-only: a deterministic 0-359 hue and a single
        // display character, both derived from the publication itself
        // (see derivePlaceholderPreview below) — never random, never
        // time-based, so the exact same publication always renders the
        // exact same placeholder everywhere.
        this.seed = seed;
        this.label = label;
        // THUMBNAIL-only: a local data: URL — see the module comment.
        // Never persisted, never transmitted; disposable at any time
        // (the cache holding it can be cleared and simply regenerated).
        this.image = image;
    }
}

// A rendered thumbnail — see renderer/DocumentThumbnailRenderer.js
// (the only place that actually produces `dataUrl`) and
// application/PreviewService.js (the only place that calls this).
export function thumbnailPreview(dataUrl) {
    return new DocumentPreview({ type: PreviewType.THUMBNAIL, image: dataUrl });
}

// A small, dependency-free string hash — deliberately NOT
// cryptographic (nothing here needs collision resistance; a preview
// color is not a security boundary), just deterministic and stable
// across every JS engine this app runs in.
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (Math.imul(hash, 31) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

// The publicationId is the hash seed (not the title) — two
// publications can share a title, but never a publicationId, so this
// is the field that actually guarantees two DIFFERENT publications
// don't coincidentally render as visually identical placeholders as
// often as titles alone would produce.
export function derivePlaceholderPreview(publication) {
    const title = (publication && publication.title) ? publication.title.trim() : '';
    const seedSource = (publication && publication.id) ? publication.id : title;
    const hue = seedSource ? (hashString(seedSource) % 360) : 0;
    const label = title ? title.charAt(0).toUpperCase() : '?';
    return new DocumentPreview({ type: PreviewType.PLACEHOLDER, reference: null, seed: hue, label });
}
