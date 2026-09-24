// 0.2.26 — search over the SAME decentralized discovery machinery
// everything else in this codebase reads from (discoveryProvider.list()),
// not a separate UI-only catalog. Keeps
//
//   Discovery -> Publication -> Placement -> World View
//
// as one coherent path (see docs/Principles.md) instead of introducing
// a second, UI-maintained index that could drift from what discovery
// actually knows.
//
// Deliberately simple: a case-insensitive substring match against
// title and author, both already present on every Publication
// (publisher/Publication.js). Description is NOT searched — it lives
// on DocumentMetadata, which is only available once a document's full
// snapshot is loaded, not on the lightweight Publication record
// discovery deals in; searching it would mean loading every
// candidate's full content just to filter, which doesn't scale and
// isn't something this milestone's search needs to solve. No search
// index is built or persisted — this runs the substring check fresh
// against whatever discoveryProvider.list() returns, exactly the same
// "computed, not stored" posture the rest of this codebase already
// follows for derived facts.
//
// 0.2.28: gains a spatial half — execute() now accepts either the
// original plain string (unchanged behavior, kept for every existing
// caller) or an options object `{ text, center, radius }`. This class
// still does ONLY text filtering; it has no placementRegistry and
// doesn't do geometry — WorldNavigationSession.searchWorld applies the
// actual distance/radius test once it has resolved each candidate's
// position (see its own comment for why that split belongs where it
// is: position resolution already lived in the session layer, and a
// pure discovery-layer use case has no business knowing about
// placements). What THIS class decides is narrower but still real:
// whether a spatial filter is coming, because that changes what "no
// text" should mean. Empty text with NO spatial filter still returns
// [] (a blank query means "nothing," not "everything," matching
// 0.2.26). Empty text WITH a spatial filter returns the WHOLE catalog
// instead — a pure "what's near this point" query has no text
// criterion to apply at all, and the caller's radius test is what
// actually narrows the result.
export class SearchWorldUseCase {
    constructor(discoveryProvider) {
        this._discoveryProvider = discoveryProvider;
    }

    execute(queryOrOptions) {
        const options = typeof queryOrOptions === 'string' ? { text: queryOrOptions } : (queryOrOptions || {});
        const trimmed = (options.text || '').trim().toLowerCase();
        const hasSpatialFilter = !!options.center;
        if (!trimmed && !hasSpatialFilter) {
            return [];
        }
        const all = this._discoveryProvider.list();
        if (!trimmed) {
            return all;
        }
        return all.filter((publication) => {
            const title = (publication.title || '').toLowerCase();
            const author = (publication.author || '').toLowerCase();
            return title.includes(trimmed) || author.includes(trimmed);
        });
    }
}
