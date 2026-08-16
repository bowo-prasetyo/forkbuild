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
export class SearchWorldUseCase {
    constructor(discoveryProvider) {
        this._discoveryProvider = discoveryProvider;
    }

    execute(query) {
        const trimmed = (query || '').trim().toLowerCase();
        if (!trimmed) {
            return [];
        }
        return this._discoveryProvider.list().filter((publication) => {
            const title = (publication.title || '').toLowerCase();
            const author = (publication.author || '').toLowerCase();
            return title.includes(trimmed) || author.includes(trimmed);
        });
    }
}
