import { SETTLEMENT_TAKEN_RADIUS, settleBeside, settleInVillage } from '../../core/BuildSettlement.js';
import { computeDeterministicGridPosition } from '../../core/DeterministicGridPlacement.js';

// Where a build stands when it is published (core/BuildSettlement.js): where
// an earlier publish of the same build already stands it, so republishing
// never moves a build; beside the build it remixes; else in the village round
// the challenge plaza. `fallback` (the id-keyed grid) answers when none of
// these can.
//
// `findPublicationsByDocumentId(documentId)` lists the Publications this
// device knows of for a build, its own and others'; `spatialIndexProvider`
// holds the placements it knows of.
export class SettledPlacementStrategy {
    constructor({ spatialIndexProvider, findPublicationsByDocumentId, fallback, seed = undefined }) {
        this._spatialIndexProvider = spatialIndexProvider;
        this._findPublicationsByDocumentId = findPublicationsByDocumentId;
        this._fallback = fallback;
        this._seed = seed;
    }

    // `context`: `{ publicationId, documentId, parentDocumentId }`.
    computePosition(context = {}) {
        const { publicationId, documentId, parentDocumentId } = context;
        try {
            const home = this._standingPosition(documentId, { excludePublicationId: publicationId, placedOnly: true });
            if (home) return home;
            const isTaken = (x, z) => this._isTaken(x, z);
            if (parentDocumentId && parentDocumentId !== documentId) {
                const source = this._standingPosition(parentDocumentId, { placedOnly: false });
                const beside = source ? settleBeside({ source, publicationId, isTaken, seed: this._seed }) : null;
                if (beside) return { ...beside };
            }
            const inVillage = settleInVillage({ publicationId, isTaken, seed: this._seed });
            if (inVillage) return { ...inVillage };
        } catch {
            // Settled by the fallback instead.
        }
        return this._fallback.computePosition(context);
    }

    // Where a build already stands: its earliest placed Publication's
    // placement, or (when `placedOnly` is false) where the grid puts its
    // earliest Publication. Null when this device knows no Publication of it.
    _standingPosition(documentId, { excludePublicationId = null, placedOnly }) {
        if (!documentId) return null;
        let publications = [];
        try {
            publications = (this._findPublicationsByDocumentId(documentId) || [])
                .filter((publication) => publication && publication.id && publication.id !== excludePublicationId);
        } catch {
            publications = [];
        }
        publications.sort((a, b) => time(a) - time(b));
        for (const publication of publications) {
            const placements = this._spatialIndexProvider.findByPublicationId(publication.id) || [];
            if (placements.length > 0) {
                const { x, y, z } = placements[0].position;
                return { x, y, z };
            }
        }
        if (placedOnly || publications.length === 0) return null;
        const grid = computeDeterministicGridPosition(publications[0].id);
        return { x: grid.x, y: grid.y, z: grid.z };
    }

    _isTaken(x, z) {
        const nearby = this._spatialIndexProvider.discover({ x, y: 0, z }, SETTLEMENT_TAKEN_RADIUS) || [];
        return nearby.length > 0;
    }
}

function time(publication) {
    const value = new Date(publication.publishedAt).getTime();
    return Number.isFinite(value) ? value : 0;
}
