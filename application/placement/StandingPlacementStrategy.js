// Where a build stands when it is published: where an earlier publish of the
// same build already stands it, so republishing never moves a build; else
// wherever `fallback` puts it (the id-keyed grid,
// core/world/DeterministicGridPlacement.js, so builds have room round them and
// every device agrees on the spot from the id alone). A Build here build is
// put on its plot before this is asked (BuildPlotPlacementStrategy). A
// challenge entry is shown at the plaza only as an exhibit
// (core/challenge/PlazaEntrySpots.js), never placed there.
//
// `findPublicationsByDocumentId(documentId)` lists the Publications this
// device knows of for a build, its own and others'; `spatialIndexProvider`
// holds the placements it knows of.
export class StandingPlacementStrategy {
    constructor({ spatialIndexProvider, findPublicationsByDocumentId, fallback }) {
        this._spatialIndexProvider = spatialIndexProvider;
        this._findPublicationsByDocumentId = findPublicationsByDocumentId;
        this._fallback = fallback;
    }

    // `context`: `{ publicationId, documentId }`.
    computePosition(context = {}) {
        const { publicationId, documentId } = context;
        try {
            const standing = this._standingPosition(documentId, publicationId);
            if (standing) return standing;
        } catch {
            // Placed by the fallback instead.
        }
        return this._fallback.computePosition(context);
    }

    // Where a build already stands: its earliest placed Publication's
    // placement, or null when this device knows none.
    _standingPosition(documentId, excludePublicationId) {
        if (!documentId) return null;
        const publications = (this._findPublicationsByDocumentId(documentId) || [])
            .filter((publication) => publication && publication.id && publication.id !== excludePublicationId)
            .sort((a, b) => time(a) - time(b));
        for (const publication of publications) {
            const placements = this._spatialIndexProvider.findByPublicationId(publication.id) || [];
            if (placements.length > 0) {
                const { x, y, z } = placements[0].position;
                return { x, y, z };
            }
        }
        return null;
    }
}

function time(publication) {
    const value = new Date(publication.publishedAt).getTime();
    return Number.isFinite(value) ? value : 0;
}
