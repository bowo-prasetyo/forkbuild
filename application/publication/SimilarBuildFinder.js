import { ContentReference } from '../../core/ContentReference.js';
import { DocumentSerializer } from '../../serializer/DocumentSerializer.js';
import {
    MIN_COMPARED_BRICKS, SIMILAR_BUILD_THRESHOLD, buildShape, compareBuildShapes, isSimilarBuild, similarityUpperBound
} from '../../core/BuildSimilarity.js';
import { placedBricks, worldBricks } from '../../core/PlacedBricks.js';

// Finds published builds by other people that look a lot like a build
// (core/BuildSimilarity.js), for two places: Publish, so it can point to Edit
// a Copy, which credits them (find()), and a build's page, which lists the
// builds published before it that look like it (findEarlier()). It only
// compares against builds whose bytes are already on this device: there is no
// global index to ask, so finding nothing never means a build is original. It
// never blocks anything and never records or signs anything.
//
// Left out, since they already credit, or are, the builder: their own builds
// (and anyone credited under Built with), every build in the same remix
// family (connected by `parentDocumentId`, which Edit a Copy records), and
// builds published after the one compared.
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

    // For Publish: up to `limit` { publication, evidence } for `document`, most
    // alike first. `readyMade` is the build's record of the bricks it was
    // started with (application/document/ReadyMadeBricksStore.js), or null:
    // only the builder's own bricks count, so two builds started from the
    // same ready-made house don't look alike. Builds by any identity on this
    // device are the builder's own, and so are builds published after this
    // one was first published. Stops early, with what it has, once its time
    // budget is spent.
    async find(document, { readyMade = null } = {}) {
        const world = document?.world;
        if (!world) return [];
        const mine = buildShape(placedBricks(worldBricks(world), readyMade));
        if (mine.size < MIN_COMPARED_BRICKS) return [];
        const all = this._safeList();
        const firstPublished = Math.min(...all.filter((p) => p.documentId === world.id).map(publishedTime));
        const candidates = this._eligible(all, {
            documentId: world.id,
            parentDocumentId: document.metadata?.parentDocumentId || null,
            builderIds: [...this._safeOwnIdentityIds(), document.metadata?.authorIdentityId],
            notAfter: firstPublished
        });
        return this._matching(mine, candidates);
    }

    // For a build's page: up to `limit` { publication, evidence } for the
    // published builds that look like `publication` and were published before
    // it, by the date each was signed. All its bricks count: who placed which
    // is known only on its builder's device. Its builder is the identity that
    // signed it (and those credited under Built with), whoever is looking.
    async findEarlier(publication) {
        const mine = await this._shapeOf(publication);
        if (!mine || mine.size < MIN_COMPARED_BRICKS) return [];
        const published = publishedTime(publication);
        if (!published) return [];
        const candidates = this._eligible(this._safeList(), {
            documentId: publication.documentId,
            parentDocumentId: publication.parentDocumentId || null,
            builderIds: [publication.publisherIdentity?.id, ...(publication.builtWith || []).map((entry) => entry?.identityId)],
            before: published
        });
        return this._matching(mine, candidates);
    }

    async _matching(mine, candidates) {
        const startedAt = this._now();
        const best = new Map();
        for (const publication of candidates) {
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

    // The Publications of `all` worth comparing with the build `documentId`:
    // one per content hash, newest first, none by `builderIds` or in its
    // family, and none published after `notAfter` or at or after `before`.
    _eligible(all, { documentId, parentDocumentId, builderIds, notAfter = Infinity, before = Infinity }) {
        const builders = new Set(builderIds.filter(Boolean));
        const family = remixFamilyIds(documentId, parentDocumentId, all);
        const seen = new Set();
        const candidates = [];
        for (const publication of all) {
            const hash = contentHashOf(publication);
            if (!hash || seen.has(hash)) continue;
            seen.add(hash);
            if (family.has(publication.documentId)) continue;
            if (builders.has(publication.publisherIdentity?.id) || (publication.builtWith || []).some((entry) => builders.has(entry?.identityId))) continue;
            const time = publishedTime(publication);
            if (time > notAfter || time >= before) continue;
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
        if (!hash) return null;
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

// Every document id in the remix family of `documentId` that `publications`
// tell of: back through `parentDocumentId` to the first build, then every
// remix of any of them, however distant (unlike core/RemixFamily.js, which
// stops where a page would stop drawing).
function remixFamilyIds(documentId, parentDocumentId, publications) {
    const parentOf = new Map();
    const childrenOf = new Map();
    const link = (child, parent) => {
        if (!child || !parent || child === parent) return;
        if (!parentOf.has(child)) parentOf.set(child, parent);
        if (!childrenOf.has(parent)) childrenOf.set(parent, new Set());
        childrenOf.get(parent).add(child);
    };
    link(documentId, parentDocumentId);
    for (const publication of publications) link(publication.documentId, publication.parentDocumentId);

    const family = new Set([documentId]);
    let root = documentId;
    while (parentOf.has(root) && !family.has(parentOf.get(root))) {
        root = parentOf.get(root);
        family.add(root);
    }
    const queue = [...family];
    while (queue.length > 0) {
        for (const child of childrenOf.get(queue.shift()) || []) {
            if (!family.has(child)) {
                family.add(child);
                queue.push(child);
            }
        }
    }
    return family;
}

function contentHashOf(publication) {
    return publication?.contentReference?.hash ?? publication?.contentHash ?? null;
}

function publishedTime(publication) {
    const time = publication?.publishedAt instanceof Date ? publication.publishedAt.getTime() : new Date(publication?.publishedAt).getTime();
    return Number.isFinite(time) ? time : 0;
}
