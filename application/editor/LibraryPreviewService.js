import { thumbnailPreview } from '../../core/catalog/DocumentPreview.js';
import { Brick } from '../../core/building/Brick.js';

// Same idle-scheduling shim application/editor/PreviewService.js already
// uses — duplicated rather than shared, the same way that file
// duplicates nothing FROM anywhere else either; there is no third
// caller yet to justify extracting a common module for one function.
function scheduleIdle(fn) {
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(fn, { timeout: 500 });
    } else {
        setTimeout(fn, 0);
    }
}

// 0.2.84 (Building Library & Palette UX) — application/editor/PreviewService.js's
// own sibling, for the Build Library's brick and structure thumbnails
// instead of a Publication's document thumbnail. Same four properties
// (lazy renderer, cached, queued one-at-a-time off an idle callback,
// cancellable) for the same reason — a catalog of thumbnails must never
// block browsing, and every generated frame shares the one WebGL
// context renderer/DocumentThumbnailRenderer.js's own header explains
// browsers won't let this app have many of.
//
// Deliberately NOT built on PreviewService itself: that class's job
// shape is "load a Publication's document from storage, by
// contentHash, then render it" — genuinely async, genuinely
// content-addressed. A BrickDefinition or a Structure is already
// resident, in-memory, static data (per core/building/BrickRegistry.js and
// core/building/StructureRegistry.js's own header comments: "the registry's
// contents don't change at runtime") — there is nothing to load, and
// the cache key is simply the definition's or structure's own stable
// id, never a content hash. Reusing PreviewService's loading/hashing
// machinery for a job that has neither would be forcing one shape onto
// two different problems; this file reuses only what both genuinely
// share — renderer/DocumentThumbnailRenderer.js's `renderBricks()` and
// core/catalog/DocumentPreview.js's `thumbnailPreview()` — not PreviewService's
// own code.
// Small enough that a 2x2 block still fills its frame, large enough that a
// cube shows clearly smaller than it and a half cube lower than a cube.
export const BRICK_FRAME_SIZE = 1.5;

export class LibraryPreviewService {
    constructor({ createRenderer }) {
        this._createRenderer = createRenderer;
        // null = not yet attempted; false = attempted and failed, never
        // retry; an object = the real, reusable renderer.
        this._renderer = null;

        this._cache = new Map(); // key -> DocumentPreview
        this._jobs = new Map();  // key -> { key, bricks, waiters[] }
        this._draining = false;
    }

    // Synchronous, never triggers generation itself — see
    // PreviewService#getCached()'s own reasoning, one rung down.
    getCached(key) {
        return (key && this._cache.has(key)) ? this._cache.get(key) : null;
    }

    // Returns { promise, cancel }, byte-for-byte the same contract
    // PreviewService#request() offers: `promise` resolves with a
    // DocumentPreview (THUMBNAIL) on success, or `null` on failure/
    // cancellation — callers fall back to a placeholder identically
    // either way.
    // Bricks are framed alike, as if each were at least BRICK_FRAME_SIZE
    // on every side, so a small piece looks small beside a big one
    // (docs/reviews/EditorPlacementUX-2026-10-27.md, P2-9); a structure
    // fills its frame.
    requestBrickPreview(definition) {
        const key = `brick:${definition.id}`;
        return this._request(key, () => [new Brick({ definitionId: definition.id })], { minSize: BRICK_FRAME_SIZE });
    }

    requestStructurePreview(structure) {
        const key = `structure:${structure.id}`;
        return this._request(key, () => structure.bricks);
    }

    _request(key, buildBricks, renderOptions = {}) {
        const cached = this.getCached(key);
        if (cached) {
            return { promise: Promise.resolve(cached), cancel() {} };
        }

        const waiter = { resolve: null, cancelled: false };
        const promise = new Promise((resolve) => { waiter.resolve = resolve; });

        let job = this._jobs.get(key);
        if (!job) {
            job = { key, buildBricks, renderOptions, waiters: [] };
            this._jobs.set(key, job);
        }
        job.waiters.push(waiter);

        this._scheduleDrain();

        return {
            promise,
            cancel: () => {
                waiter.cancelled = true;
                job.waiters = job.waiters.filter((w) => w !== waiter);
                if (job.waiters.length === 0) {
                    this._jobs.delete(key);
                }
            }
        };
    }

    _scheduleDrain() {
        if (this._draining) return;
        this._draining = true;
        scheduleIdle(() => this._drainOne());
    }

    _drainOne() {
        const job = this._nextJob();
        if (!job) {
            this._draining = false;
            return;
        }
        this._jobs.delete(job.key);
        this._runJob(job);
        scheduleIdle(() => this._drainOne());
    }

    // FIFO (Map iteration order is insertion order) — there is no
    // priority axis here the way PreviewService's page-scroll urgency
    // needs one; a Build Library's entire catalog is small and fixed.
    // A job with zero waiters left (every one cancelled) is skipped and
    // dropped rather than run for nobody.
    _nextJob() {
        for (const job of this._jobs.values()) {
            if (job.waiters.length > 0) {
                return job;
            }
        }
        return null;
    }

    _runJob(job) {
        let preview = null;
        try {
            const renderer = this._ensureRenderer();
            if (renderer) {
                const image = renderer.renderBricks(job.buildBricks(), job.renderOptions);
                preview = thumbnailPreview(image);
                this._cache.set(job.key, preview);
            }
        } catch (err) {
            // Best-effort: a render that throws just means "no
            // thumbnail" — never an error the Build Library surfaces,
            // and never something that stops the queue.
            preview = null;
        }
        for (const waiter of job.waiters) {
            if (!waiter.cancelled) {
                waiter.resolve(preview);
            }
        }
    }

    _ensureRenderer() {
        if (this._renderer === false) {
            return null;
        }
        if (!this._renderer) {
            try {
                this._renderer = this._createRenderer();
            } catch (err) {
                this._renderer = false;
                return null;
            }
        }
        return this._renderer;
    }
}
