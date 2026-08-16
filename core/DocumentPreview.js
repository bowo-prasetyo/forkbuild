// 0.2.31 — the preview a catalog card/row shows for a publication.
//
// The design question this milestone had to answer wasn't "what does
// a thumbnail look like" — it was "is the preview part of the
// immutable publication, or merely a local UI cache?" The honest
// answer for THIS milestone is neither yet: `DocumentPreview` is
// architecture without a real image behind it — a deliberately small
// first step, not the finished thing.
//
// A real, content-addressed, immutable preview (Alice publishes X
// with a preview; the preview belongs to that immutable publication
// exactly like its content/placement history do) would mean adding a
// `preview` field to `publisher/Publication.js` — but Publication's
// `getSigningDescriptor()` payload already covers every one of its
// own fields, and a signature is verified by recomputing that
// descriptor from the object's CURRENT shape and comparing it against
// what was actually signed at publish time. Adding a new field to
// that payload would make every ALREADY-published, already-signed
// Publication recompute a descriptor that never matches its original
// signature — silently breaking verification for the entire existing
// corpus the moment this shipped. That is a real schema-evolution
// question (a Publication-level schema version, or a migration path
// analogous to DocumentSchemaMigrator's, or a preview that lives
// OUTSIDE the signed envelope by design) that deserves its own
// deliberate design pass, not a field added in passing by a catalog
// UI milestone. See docs/Principles.md, "A Preview Is Either Signed
// Or It Isn't — 0.2.31 Doesn't Pretend Otherwise."
//
// So for now: PLACEHOLDER previews are COMPUTED, not stored — the
// same "computed, not stored" posture lifecycle status (0.2.6),
// SpatialOverlap (0.2.25), and distance (0.2.28) already established
// for every other derived fact in this codebase. Nothing about a
// publication's signed identity changes; `derivePlaceholderPreview`
// is a pure function of fields a Publication already has (id, title),
// so it is automatically stable across every replica and every
// re-render without needing to be transmitted, cached, or agreed upon
// at all. THUMBNAIL/`reference` are reserved for the real, later
// mechanism this comment describes.
export const PreviewType = Object.freeze({
    NONE: 'NONE',
    PLACEHOLDER: 'PLACEHOLDER',
    THUMBNAIL: 'THUMBNAIL'
});

export class DocumentPreview {
    constructor({ type = PreviewType.NONE, reference = null, seed = null, label = null } = {}) {
        this.type = type;
        // Reserved for a future immutable, content-addressed preview
        // (a ContentReference, exactly like Publication.contentReference
        // already points at immutable document content) — always null
        // today; nothing in this codebase ever sets it yet.
        this.reference = reference;
        // PLACEHOLDER-only: a deterministic 0-359 hue and a single
        // display character, both derived from the publication itself
        // (see derivePlaceholderPreview below) — never random, never
        // time-based, so the exact same publication always renders the
        // exact same placeholder everywhere.
        this.seed = seed;
        this.label = label;
    }
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
