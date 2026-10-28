import { ContentReference } from '../../core/document/ContentReference.js';
import { DocumentSerializer } from '../../serializer/DocumentSerializer.js';
import {
    MIN_COMPARED_BRICKS, SIMILAR_BUILD_THRESHOLD, buildShape, compareBuildShapes, couldBeSimilar, isSimilarBuild, lookAlikeShare, withoutReadyMade
} from '../../core/catalog/BuildSimilarity.js';
import { placedBricks, worldBricks } from '../../core/building/PlacedBricks.js';
import { order } from '../../core/publication/PublicationOrder.js';

// Finds published builds by other people that look a lot like a build
// (core/catalog/BuildSimilarity.js), for four places: Publish, so it can point to
// Edit a Copy, which credits them (find()); a build's page and World View,
// which list the builds published before it that look like it
// (findEarlier()); the 🔔, which tells a builder when a build like one of
// theirs arrives (findEarlier() with `by`); and the builder's own cards in
// Explore, which list the builds published after theirs (findLater()). It
// only compares against builds whose bytes are already on this device: there is no
// global index to ask, so finding nothing never means a build is original. It
// never blocks anything and never records or signs anything.
//
// Left out, since they already credit, or are, the builder: their own builds
// (and anyone credited under Built with), every build in the same remix
// family (connected by `parentDocumentId`, which Edit a Copy records), and
// builds published after the one compared. On both sides, bricks forming a
// whole ready-made structure from the Build Library don't count
// (core/catalog/BuildSimilarity.js#withoutReadyMade()), so builds that only share one,
// however moved or turned, don't look alike. `readyMadeStructures` resolves to
// those structures (each with its `bricks`); it is asked once, when first
// needed, since the libraries aren't part of the app's first load.
//
// Which came first goes by core/publication/PublicationOrder.js: the date each
// build was signed with, backed or not by when this device first saw it
// (`firstSeenAt(publication)`, ms or null; the signed date itself when not
// given). A copy dated before what it copied is listed as "dated" before it,
// and as after it too, rather than taken at its word. Each match says how:
// `{ publication, evidence, order, seen, share }`, `share` being how alike
// in words (core/catalog/BuildSimilarity.js#lookAlikeShare()).
export class SimilarBuildFinder {
    constructor({
        listPublications,
        contentStore,
        ownIdentityIds = () => [],
        readyMadeStructures = async () => [],
        documentSerializer = new DocumentSerializer(),
        threshold = SIMILAR_BUILD_THRESHOLD,
        limit = 3,
        maxCandidates = 300,
        timeBudgetMs = 1500,
        now = () => Date.now(),
        firstSeenAt = (publication) => publishedTime(publication)
    } = {}) {
        if (typeof listPublications !== 'function') throw new Error('SimilarBuildFinder: listPublications is required');
        if (!contentStore || typeof contentStore.get !== 'function') throw new Error('SimilarBuildFinder: contentStore is required');
        this._listPublications = listPublications;
        this._contentStore = contentStore;
        this._ownIdentityIds = ownIdentityIds;
        this._readyMadeStructures = readyMadeStructures;
        this._readyMadeShapes = null;
        this._documentSerializer = documentSerializer;
        this._threshold = threshold;
        this._limit = limit;
        this._maxCandidates = maxCandidates;
        this._timeBudgetMs = timeBudgetMs;
        this._now = now;
        this._firstSeenAt = firstSeenAt;
        // Content hash -> shape: published bytes never change, so each is read
        // at most once a visit.
        this._shapes = new Map();
        // One look at a time: Explore can ask for several cards at once.
        this._queue = Promise.resolve();
    }

    // For Publish: up to `limit` { publication, evidence } for `document`, most
    // alike first (moreAlike()). `readyMade` is the build's record of the
    // bricks it was started with (application/document/ReadyMadeBricksStore.js), or null:
    // only the builder's own bricks count, so two builds started from the
    // same ready-made house don't look alike. Builds by any identity on this
    // device are the builder's own; only builds this device can show came
    // before this one was first published (or before now, for a first
    // Publish) are compared, so a copy of it dated earlier never asks its
    // builder to credit the copier. Stops early, with what it has, once its
    // time budget is spent.
    find(document, { readyMade = null } = {}) {
        return this._serially(() => this._find(document, readyMade));
    }

    async _find(document, readyMade) {
        const world = document?.world;
        if (!world) return [];
        const placed = buildShape(placedBricks(worldBricks(world), readyMade));
        // Taking ready-made structures out only shrinks it, so a build already
        // too small needs no library loaded.
        if (placed.size < MIN_COMPARED_BRICKS) return [];
        const mine = withoutReadyMade(placed, await this._readyMade());
        if (mine.size < MIN_COMPARED_BRICKS) return [];
        const all = this._safeList();
        const firstPublished = Math.min(...all.filter((p) => p.documentId === world.id).map(publishedTime));
        const since = Number.isFinite(firstPublished) ? firstPublished : this._nowMs();
        const candidates = this._eligible(all, {
            documentId: world.id,
            parentDocumentId: document.metadata?.parentDocumentId || null,
            builderIds: [...this._safeOwnIdentityIds(), document.metadata?.authorIdentityId],
            subject: { claimed: since, seen: since },
            orders: ['before']
        });
        return this._matching(mine, candidates);
    }

    // For a build's page: up to `limit` { publication, evidence, order, seen,
    // share } for the published builds that look like `publication` and came
    // before it ('before'), or may have ('datedBefore', 'seenBefore'). All its
    // bricks count: who placed which is known only on its builder's device.
    // Its builder is the identity that signed it (and those credited under
    // Built with), whoever is looking.
    // With `by` (identity ids), only builds published by one of them are
    // compared.
    findEarlier(publication, { by = null } = {}) {
        return this._serially(() => this._findAround(publication, { orders: ['before', 'datedBefore', 'seenBefore'], onlyBy: by }));
    }

    // For the builder's own card in Explore: as findEarlier(), but the builds
    // that came after `publication` ('after'), or may have, where a copy of it
    // would be, even one dated before it.
    findLater(publication) {
        return this._serially(() => this._findAround(publication, { orders: ['after', 'datedBefore', 'seenBefore'], onlyBy: null }));
    }

    async _findAround(publication, { orders, onlyBy }) {
        const mine = await this._shapeOf(publication);
        if (!mine || mine.size < MIN_COMPARED_BRICKS) return [];
        const published = publishedTime(publication);
        if (!published) return [];
        const candidates = this._eligible(this._safeList(), {
            documentId: publication.documentId,
            parentDocumentId: publication.parentDocumentId || null,
            builderIds: [publication.publisherIdentity?.id, ...(publication.builtWith || []).map((entry) => entry?.identityId)],
            subject: { claimed: published, seen: this._seenOf(publication) },
            orders,
            onlyBy
        });
        return this._matching(mine, candidates);
    }

    _serially(work) {
        const result = this._queue.then(work);
        this._queue = result.catch(() => {});
        return result;
    }

    // Whether the build `publication` signed is on this device, as the bytes
    // it signed, so it can be compared at all: an empty answer from
    // findEarlier() then means nothing alike, not that its bytes haven't
    // arrived yet.
    async canCompare(publication) {
        return (await this._shapeOf(publication)) !== null;
    }

    async _matching(mine, candidates) {
        const startedAt = this._now();
        const best = new Map();
        for (const { publication, order: placed, seen } of candidates) {
            if (this._now() - startedAt > this._timeBudgetMs) break;
            const theirs = await this._shapeOf(publication);
            if (!theirs || theirs.size < MIN_COMPARED_BRICKS || !couldBeSimilar(mine, theirs, this._threshold)) continue;
            const evidence = compareBuildShapes(mine, theirs);
            if (!isSimilarBuild(evidence, this._threshold)) continue;
            const found = best.get(publication.documentId);
            if (!found || moreAlike(evidence, found.evidence) < 0) {
                best.set(publication.documentId, Object.freeze({ publication, evidence, order: placed, seen, share: lookAlikeShare(evidence) }));
            }
        }
        return [...best.values()]
            .sort((a, b) => moreAlike(a.evidence, b.evidence) || publishedTime(a.publication) - publishedTime(b.publication))
            .slice(0, this._limit);
    }

    // The Publications of `all` worth comparing with the build `documentId`
    // (`subject`: its `{ claimed, seen }` times), as `{ publication, order,
    // seen }`: one per content hash, newest first, none by `builderIds` or in
    // its family, only those in one of `orders` beside it
    // (core/publication/PublicationOrder.js); with `onlyBy`, only those
    // published by one of its identities.
    _eligible(all, { documentId, parentDocumentId, builderIds, subject, orders, onlyBy = null }) {
        const builders = new Set(builderIds.filter(Boolean));
        const publishers = Array.isArray(onlyBy) ? new Set(onlyBy.filter(Boolean)) : null;
        const family = remixFamilyIds(documentId, parentDocumentId, all);
        const seen = new Set();
        const candidates = [];
        for (const publication of all) {
            const hash = contentHashOf(publication);
            if (!hash || seen.has(hash)) continue;
            seen.add(hash);
            if (family.has(publication.documentId)) continue;
            if (publishers && !publishers.has(publication.publisherIdentity?.id)) continue;
            if (builders.has(publication.publisherIdentity?.id) || (publication.builtWith || []).some((entry) => builders.has(entry?.identityId))) continue;
            const seenAt = this._seenOf(publication);
            const placed = order(subject, { claimed: publishedTime(publication), seen: seenAt });
            if (!orders.includes(placed)) continue;
            candidates.push({ publication, order: placed, seen: seenAt });
        }
        return candidates
            .sort((a, b) => publishedTime(b.publication) - publishedTime(a.publication))
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
                shape = withoutReadyMade(buildShape(worldBricks(this._documentSerializer.deserialize(JSON.parse(bytes)).world)), await this._readyMade());
            }
        } catch {
            shape = null;
        }
        this._shapes.set(hash, shape);
        return shape;
    }

    // The Build Library's structures as shapes, loaded once; none when they
    // can't be loaded, so nothing is taken out rather than nothing compared.
    _readyMade() {
        if (!this._readyMadeShapes) {
            this._readyMadeShapes = Promise.resolve()
                .then(() => this._readyMadeStructures())
                .then((structures) => (Array.isArray(structures) ? structures : []).map((structure) => buildShape(structure?.bricks)))
                .catch(() => []);
        }
        return this._readyMadeShapes;
    }

    // When this device first saw `publication` (ms), or null.
    _seenOf(publication) {
        let seen = null;
        try {
            seen = this._firstSeenAt(publication);
        } catch {
            seen = null;
        }
        const time = seen instanceof Date ? seen.getTime() : seen;
        return Number.isFinite(time) ? time : null;
    }

    _nowMs() {
        const now = this._now();
        return now instanceof Date ? now.getTime() : Number(now);
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
// remix of any of them, however distant (unlike core/publication/RemixFamily.js, which
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

// Negative when evidence `a` says more strongly than `b` that two builds look
// alike: by the larger of how much of both is the same and how much of either
// stands in the other (so a copy with a garden added ranks with the copies it
// is), then by how much of both is the same.
function moreAlike(a, b) {
    const strength = (evidence) => Math.max(evidence.similarity, evidence.theirsInMine || 0, evidence.mineInTheirs || 0);
    return strength(b) - strength(a) || b.similarity - a.similarity;
}

function contentHashOf(publication) {
    return publication?.contentReference?.hash ?? publication?.contentHash ?? null;
}

function publishedTime(publication) {
    const time = publication?.publishedAt instanceof Date ? publication.publishedAt.getTime() : new Date(publication?.publishedAt).getTime();
    return Number.isFinite(time) ? time : 0;
}
