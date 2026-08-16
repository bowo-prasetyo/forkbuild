import { PublicationQuery } from '../core/PublicationQuery.js';
import { PublicationPage } from '../core/PublicationPage.js';
import { comparePublications } from '../core/PublicationSort.js';

// 0.2.31 — the Repository/Author catalog's own search, answering a
// genuinely different question than application/SearchWorldUseCase.js
// does. World search asks "where is this publication in the world?"
// (text + optional spatial radius, enriched with a resolved position —
// see docs/Principles.md, "Discovery Is One Path, Not Two," 0.2.26).
// Repository search asks "which publications match this description?"
// — no position, no camera, no placement concept at all, but with
// pagination, deterministic ordering, and (optionally) a publication's
// full DESCRIPTION as a match target, none of which World Search needs
// or has. Reusing SearchWorldUseCase here would mean bending one
// use case to answer two different questions rather than building the
// one the Repository actually needs — the same reasoning 0.2.28 used
// to give spatial discovery its OWN query rather than shoehorning
// coordinates into text search.
//
// Deliberately application-level pagination (see core/PublicationQuery.js's
// own comment): this class receives the FULL candidate set from
// discoveryProvider.list() and does the filtering/sorting/windowing
// itself — the UI never computes an offset or assumes the storage
// layer can do so efficiently. A future decentralized discoveryProvider
// implementing cursor-based continuation only has to change what
// happens INSIDE this class; every caller's `execute(query)` shape
// stays identical, same "contract vs. implementation" honesty as
// 0.2.28's searchWorldByLocation.
export class SearchPublicationsUseCase {
    constructor(discoveryProvider, loadPublicationDocumentUseCase = null) {
        this._discoveryProvider = discoveryProvider;
        this._loadPublicationDocumentUseCase = loadPublicationDocumentUseCase;
        // documentId -> lowercased description, populated lazily and
        // kept for this use case instance's lifetime. Loading a
        // publication's full Document just to search its description
        // is a real, non-trivial cost (see docs/Principles.md,
        // "Description Search Is Opt-In, Not Silent, Because It Has A
        // Real Cost") — this cache means that cost is paid AT MOST
        // once per publication per session, not once per keystroke or
        // once per page turn.
        this._descriptionCache = new Map();
    }

    execute(queryOrOptions) {
        const query = queryOrOptions instanceof PublicationQuery
            ? queryOrOptions
            : new PublicationQuery(queryOrOptions || {});

        let candidates = this._discoveryProvider.list();

        if (query.author) {
            candidates = candidates.filter((p) => p.author === query.author);
        }

        const trimmed = query.text.trim().toLowerCase();
        if (trimmed) {
            candidates = candidates.filter((p) => this._matches(p, trimmed, query.includeDescriptions));
        }

        const sorted = candidates.slice().sort((a, b) => comparePublications(a, b, query.sort));

        const totalCount = sorted.length;
        const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize));
        // Clamp rather than return an empty page for an out-of-range
        // request (e.g. the result set shrank after a search narrowed
        // it while a later page was still selected) — the same
        // "recover to the nearest valid state" instinct
        // WorldNavigationSession already applies elsewhere, rather
        // than silently showing "page 7 of 3."
        const page = Math.min(Math.max(1, query.page), totalPages);
        const start = (page - 1) * query.pageSize;
        const items = sorted.slice(start, start + query.pageSize);

        return new PublicationPage({
            items,
            page,
            pageSize: query.pageSize,
            totalCount,
            totalPages,
            hasNext: page < totalPages,
            hasPrevious: page > 1
        });
    }

    _matches(publication, trimmed, includeDescriptions) {
        const title = (publication.title || '').toLowerCase();
        const author = (publication.author || '').toLowerCase();
        if (title.includes(trimmed) || author.includes(trimmed)) {
            return true;
        }
        if (!includeDescriptions) {
            return false;
        }
        return this._resolveDescription(publication).includes(trimmed);
    }

    // Best-effort: a document that fails to load (removed, corrupted,
    // migration failure) never breaks search for every OTHER
    // publication — same failure-isolation posture 0.2.15/0.2.16/
    // 0.2.19's discovery/verification pipelines already apply. A
    // failed load is cached as '' (no description) rather than
    // retried on every subsequent search, matching this method's own
    // "pay the cost at most once" contract.
    _resolveDescription(publication) {
        const key = publication.documentId;
        if (this._descriptionCache.has(key)) {
            return this._descriptionCache.get(key);
        }
        let description = '';
        if (this._loadPublicationDocumentUseCase) {
            try {
                const document = this._loadPublicationDocumentUseCase.execute(publication.documentId);
                description = (document && document.metadata && document.metadata.description || '').toLowerCase();
            } catch (err) {
                description = '';
            }
        }
        this._descriptionCache.set(key, description);
        return description;
    }
}
