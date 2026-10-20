import { ContentReference } from '../../core/ContentReference.js';
import { DocumentSerializer } from '../../serializer/DocumentSerializer.js';
import {
    MIN_COMPARED_BRICKS, SIMILAR_BUILD_THRESHOLD, buildShape, compareBuildShapes, isSimilarBuild, similarityUpperBound
} from '../../core/BuildSimilarity.js';
import { placedBricks, worldBricks } from '../../core/PlacedBricks.js';

// Finds published builds by other people that look a lot like the one about
// to be published (core/BuildSimilarity.js), so Publish can say so and point
// to Edit a Copy, which credits them. It only compares against builds whose
// bytes are already on this device: there is no global index to ask, so
// finding nothing never means a build is original. It never blocks a
// publish and never records or signs anything.
//
// Left out, since they already credit, or are, the builder: their own builds
// (any identity on this device, or anyone credited under Built with), the
// build this one is a remix of, remixes of this one, other remixes of the
// same original, and builds published after this one was first published.
// Only the bricks the builder placed themselves count on their side
// (core/PlacedBricks.js), so two builds started from the same ready-made
// house don't look alike for it.
export class SimilarBuildFinder {
    constructor({
        listPublications,
        contentStore,
        ownIdentityIds = () => [],
        documentSerializer = new DocumentSerializer(),
        threshold = SIMILAR_BUILD_THRESHOLD,
        limit = 3,
        maxCandidates = 300,
        timeBudgetMs = 1500,
        now = () => Date.now()
    } = {}) {
        if (typeof listPublications !== 'function') throw new Error('SimilarBuildFinder: listPublications is required');
        if (!contentStore || typeof contentStore.get !== 'function') throw new Error('SimilarBuildFinder: contentStore is required');
        this._listPublications = listPublications;
        this._contentStore = contentStore;
        this._ownIdentityIds = ownIdentityIds;
        this._documentSerializer = documentSerializer;
        this._threshold = threshold;
        this._limit = limit;
        this._maxCandidates = maxCandidates;
        this._timeBudgetMs = timeBudgetMs;
        this._now = now;
        // Content hash -> shape: published bytes never change, so each is read
        // at most once a visit.
        this._shapes = new Map();
    }

    // Up to `limit` { publication, evidence } for `document`, most alike
    // first. `readyMade` is the build's record of the bricks it was started
    // with (application/document/ReadyMadeBricksStore.js), or null. Stops
    // early, with what it has, once its time budget is spent.
    async find(document, { readyMade = null } = {}) {
        const world = document?.world;
        if (!world) return [];
        const mine = buildShape(placedBricks(worldBricks(world), readyMade));
        if (mine.size < MIN_COMPARED_BRICKS) return [];

        const startedAt = this._now();
        const best = new Map();
        for (const publication of this._candidates(document)) {
            if (this._now() - startedAt > this._timeBudgetMs) break;
            const theirs = await this._shapeOf(publication);
            if (!theirs || theirs.size < MIN_COMPARED_BRICKS || similarityUpperBound(mine, theirs) < this._threshold) continue;
            const evidence = compareBuildShapes(mine, theirs);
            if (!isSimilarBuild(evidence, this._threshold)) continue;
            const found = best.get(publication.documentId);
            if (!found || evidence.similarity > found.evidence.similarity) {
                best.set(publication.documentId, Object.freeze({ publication, evidence }));
            }
        }
        return [...best.values()]
            .sort((a, b) => b.evidence.similarity - a.evidence.similarity || publishedTime(a.publication) - publishedTime(b.publication))
            .slice(0, this._limit);
    }

    _candidates(document) {
        const worldId = document.world.id;
        const metadata = document.metadata || {};
        const parentId = metadata.parentDocumentId || null;
        const own = new Set([...this._safeOwnIdentityIds(), metadata.authorIdentityId].filter(Boolean));
        const all = this._safeList();
        const firstPublished = Math.min(...all.filter((p) => p.documentId === worldId).map(publishedTime));
        const seen = new Set();
        const candidates = [];
        for (const publication of all) {
            const hash = contentHashOf(publication);
            if (!hash || seen.has(hash)) continue;
            seen.add(hash);
            if (publication.documentId === worldId || (parentId && publication.documentId === parentId)) continue;
            if (publication.parentDocumentId && (publication.parentDocumentId === worldId || publication.parentDocumentId === parentId)) continue;
            if (own.has(publication.publisherIdentity?.id) || (publication.builtWith || []).some((entry) => own.has(entry?.identityId))) continue;
            if (publishedTime(publication) > firstPublished) continue;
            candidates.push(publication);
        }
        return candidates
            .sort((a, b) => publishedTime(b) - publishedTime(a))
            .slice(0, this._maxCandidates);
    }

    // The shape of the build `publication` signed, or null when its bytes
    // aren't on this device or aren't the ones it signed.
    async _shapeOf(publication) {
        const hash = contentHashOf(publication);
        if (this._shapes.has(hash)) return this._shapes.get(hash);
        const reference = new ContentReference({ hash });
        let bytes = null;
        try {
            bytes = await this._contentStore.get(reference);
        } catch {
            return null;
        }
        if (typeof bytes !== 'string') return null;
        let shape = null;
        try {
            if (reference.verify(bytes)) {
                shape = buildShape(worldBricks(this._documentSerializer.deserialize(JSON.parse(bytes)).world));
            }
        } catch {
            shape = null;
        }
        this._shapes.set(hash, shape);
        return shape;
    }

    _safeOwnIdentityIds() {
        try {
            return this._ownIdentityIds() || [];
        } catch {
            return [];
        }
    }

    _safeList() {
        try {
            return this._listPublications() || [];
        } catch {
            return [];
        }
    }
}

function contentHashOf(publication) {
    return publication?.contentReference?.hash ?? publication?.contentHash ?? null;
}

function publishedTime(publication) {
    const time = publication?.publishedAt instanceof Date ? publication.publishedAt.getTime() : new Date(publication?.publishedAt).getTime();
    return Number.isFinite(time) ? time : 0;
}
