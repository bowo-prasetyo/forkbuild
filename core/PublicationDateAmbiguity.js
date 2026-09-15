// 0.9.539 — Publication Selection & Identity Presentation.
//
// PRESENTATION ONLY, the exact same restraint as
// core/PublicationGrouping.js one file over: this never changes what a
// PublicationPage contains, what gets admitted to a catalog, or how two
// Publications are compared for any purpose other than "should THIS
// page render a coarser or finer publishedAt label." Nothing here
// dedupes, merges, ranks, or tags a Publication's identity.
//
// WHY THIS EXISTS: discovery/CompositeDiscoveryProvider.js and
// publisher/LocalPublisherProvider.js both, by deliberate design (see
// their own headers, and 0.9.523/0.9.534's own reconfirmed
// DELIBERATE_ASYMMETRY), never deduplicate or merge Publications —
// republishing the identical Document, even completely unchanged,
// appends a brand new Publication record (new `id`, new `publishedAt`,
// same `documentId`/title/author/license/description). Two such
// records, republished within the same calendar day, previously
// rendered as two pixel-identical catalog cards in
// ui/components/PublicationCard.js / PublicationList.js — not because
// their identity was ever actually confused anywhere else in the
// system (`id` stays the Vue `:key` and the exact target of every
// Open/Fork/Explore action throughout), but because nothing on screen
// showed the one field that already, truthfully, distinguishes them.
//
// THE FIX STAYS NARROW: reuse the exact field already displayed
// (`publishedAt`), rendered by formatPublicationDate() below at finer
// precision than the usual day-level label — never a new field, a new
// badge, a raw id, or a content hash — and only where a real collision
// on THIS page would otherwise render two distinct Publications
// identically. Two Publications for two DIFFERENT documents are never
// affected, even if their dates coincide; a lone Publication is never
// affected even if it shares a document history with something on
// another page.
//
// RESIDUAL LIMIT, DELIBERATELY ACCEPTED: two republishes landing in the
// exact same millisecond would still render identically. Closing that
// last, vanishingly rare gap would require an ordinal or id-based
// disambiguator — exactly the "new Publication identity display system"
// this milestone's own brief excludes — for a collision no human
// clicking "Publish" twice could realistically produce.
export function computeAmbiguousPublishedDateIds(items) {
    const result = new Set();
    if (!items || items.length === 0) return result;

    const groups = new Map();
    for (const publication of items) {
        if (!publication.publishedAt || !publication.documentId) continue;
        const key = `${publication.documentId}::${publication.publishedAt.toDateString()}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(publication.id);
    }

    for (const ids of groups.values()) {
        if (ids.length > 1) {
            for (const id of ids) result.add(id);
        }
    }
    return result;
}

// The one rendering rule ui/components/PublicationCard.js and
// PublicationList.js both need, kept here rather than duplicated
// across the two: the SAME `publishedAt` field, at day precision by
// default (byte-identical to the label this codebase has always
// shown), or at millisecond precision when `precise` is true.
// Milliseconds, not merely `toLocaleString()`'s own second-level
// precision, because two republishes of an unmodified Document
// routinely land within the same second — this label exists
// specifically to disambiguate that collision, not merely to look more
// precise while still failing to.
export function formatPublicationDate(publishedAt, precise) {
    if (!publishedAt) return null;
    if (!precise) return publishedAt.toLocaleDateString();
    const ms = String(publishedAt.getMilliseconds()).padStart(3, '0');
    return `${publishedAt.toLocaleString()}.${ms}`;
}
