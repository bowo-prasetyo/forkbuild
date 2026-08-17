import { thumbnailPreview } from '../core/DocumentPreview.js';

const DEFAULT_MAX_CACHE_ENTRIES = 100;

// Schedules work without competing with whatever the browser is
// already busy with — requestIdleCallback where it exists (every
// real browser this app targets), a short setTimeout fallback
// otherwise. This is the mechanism that makes "preview generation
// never blocks catalog browsing" literally true rather than aspirational:
// nothing in this file ever renders synchronously inside request().
function scheduleIdle(fn) {
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(fn, { timeout: 500 });
    } else {
        setTimeout(fn, 0);
    }
}

// 0.2.32 — turns "I have a Publication, I'd like a picture of it
// eventually, without blocking anything" into a real, bounded,
// cancellable, cached process. See docs/Principles.md, "Previews Are
// Derived Client State": nothing this class produces is publication
// data. It is a local rendering cache keyed by the publication's own
// `contentHash` — built by actually loading and rendering the
// document's content (never by anything a publisher merely CLAIMS about
// it) — disposable and regenerable at any time with no data loss.
//
// Four properties, each earning its own piece of this class:
//   - LAZY: the actual renderer (a real WebGL context) is constructed
//     from a thunk on the FIRST real request, never at construction
//     time — a person who never opens the Repository never pays for a
//     WebGL context they'll never use.
//   - CACHED: keyed by contentHash, not documentId or publicationId —
//     the SAME immutable content (a fork that hasn't touched geometry,
//     or the same publication found twice) reuses one cached image;
//     a genuinely different revision gets a different key automatically,
//     with no special-casing needed. Bounded by `maxCacheEntries` with
//     LRU eviction (Map's insertion order, re-inserted on touch).
//   - QUEUED, ONE AT A TIME: every request is a job in a priority
//     queue, drained on an idle callback — never several renders
//     back-to-back in the same tick, and never more than one shared
//     WebGL context doing work at once (see
//     renderer/DocumentThumbnailRenderer.js for why there's only one).
//     Concurrent requests for the SAME contentHash share one job and
//     one eventual render.
//   - CANCELLABLE, for real: cancelling every waiter on a job removes
//     that job from the queue outright — a card that appears and is
//     immediately scrolled away (or whose page/search query changes)
//     before its turn comes up costs nothing, not even a wasted
//     render.
export class PreviewService {
    constructor({ loadPublicationDocumentUseCase, createRenderer, maxCacheEntries = DEFAULT_MAX_CACHE_ENTRIES }) {
        this._loadPublicationDocumentUseCase = loadPublicationDocumentUseCase;
        this._createRenderer = createRenderer;
        // null = not yet attempted; false = attempted and failed, never
        // retry; an object = the real, reusable renderer.
        this._renderer = null;
        this._maxCacheEntries = maxCacheEntries;

        this._cache = new Map(); // contentHash -> DocumentPreview; insertion order == recency
        this._jobs = new Map();  // contentHash -> { documentId, contentHash, priority, waiters[] }
        this._draining = false;
    }

    // Synchronous, and never triggers generation itself — a freshly
    // mounted card whose contentHash a DIFFERENT publication already
    // caused to be rendered can show that result instantly, with no
    // loading state at all.
    getCached(contentHash) {
        if (!contentHash || !this._cache.has(contentHash)) {
            return null;
        }
        const preview = this._cache.get(contentHash);
        this._cache.delete(contentHash);
        this._cache.set(contentHash, preview); // touch: move to most-recently-used position
        return preview;
    }

    // Returns { promise, cancel }. `promise` resolves with a
    // DocumentPreview (THUMBNAIL) on success, or `null` if generation
    // failed or was cancelled before it ran — the caller's handling is
    // identical either way ("fall back to the placeholder"), matching
    // "a preview failure must never make the publication disappear."
    //
    // Deliberately reads ONLY `publication.documentId` and
    // `publication.contentHash` — never title, author, or description.
    // A preview is generated from what the document actually contains,
    // never from what a publisher claims about it.
    request(publication, { priority = false } = {}) {
        const contentHash = publication.contentHash;
        if (!contentHash) {
            // Nothing stable to cache against — degrade to "no preview
            // available" rather than caching under a missing key.
            return { promise: Promise.resolve(null), cancel() {} };
        }

        const cached = this.getCached(contentHash);
        if (cached) {
            return { promise: Promise.resolve(cached), cancel() {} };
        }

        const waiter = { resolve: null, cancelled: false };
        const promise = new Promise((resolve) => { waiter.resolve = resolve; });

        let job = this._jobs.get(contentHash);
        if (!job) {
            job = { documentId: publication.documentId, contentHash, priority, waiters: [] };
            this._jobs.set(contentHash, job);
        } else if (priority) {
            job.priority = true; // any waiter asking urgently promotes the whole shared job
        }
        job.waiters.push(waiter);

        this._scheduleDrain();

        return {
            promise,
            cancel: () => {
                waiter.cancelled = true;
                job.waiters = job.waiters.filter((w) => w !== waiter);
                if (job.waiters.length === 0) {
                    this._jobs.delete(contentHash);
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
        this._jobs.delete(job.contentHash);
        this._runJob(job);
        // Keep draining — more jobs may already be queued, or may be
        // added by the time this one finishes.
        scheduleIdle(() => this._drainOne());
    }

    // Priority jobs first; otherwise FIFO (Map iteration order is
    // insertion order). A job with zero waiters left (every one
    // cancelled) is skipped and dropped rather than run for nobody.
    _nextJob() {
        let best = null;
        for (const job of this._jobs.values()) {
            if (job.waiters.length === 0) continue;
            if (!best || (job.priority && !best.priority)) {
                best = job;
            }
        }
        return best;
    }

    _runJob(job) {
        let preview = null;
        try {
            const document = this._loadPublicationDocumentUseCase.execute(job.documentId);
            const renderer = this._ensureRenderer();
            if (renderer) {
                const image = renderer.renderDocument(document);
                preview = thumbnailPreview(image);
                this._store(job.contentHash, preview);
            }
        } catch (err) {
            // Best-effort: a missing/corrupt document, or a render that
            // throws, just means "no thumbnail" — never an error the
            // catalog surfaces, and never something that stops the
            // queue from processing whatever comes next.
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
            return null; // construction already failed once; don't keep retrying it
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

    _store(contentHash, preview) {
        this._cache.set(contentHash, preview);
        if (this._cache.size > this._maxCacheEntries) {
            const oldestKey = this._cache.keys().next().value;
            this._cache.delete(oldestKey);
        }
    }
}
