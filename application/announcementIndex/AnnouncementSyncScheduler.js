export const DEFAULT_FIRST_SYNC_DELAY_MS = 10 * 1000;
export const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_CATCH_UP_INTERVAL_MS = 30 * 1000;
export const DEFAULT_MAX_ROTATING_TARGETS_PER_RUN = 10;

// Keeps the Announcement Index up to date in the background, whether or not
// World View is open (docs/AnnouncementIndex.md, "Phase 4"). A run syncs
// every core target (the Snapshot and Commentary tags) and the next few of
// the rotating ones (Place Naming region tags searched so far), one target at
// a time so a run never floods the network. While any endpoint is still
// behind, the next run comes sooner; once everything has caught up, runs
// fall back to the regular interval. Nothing runs while `isActive()` is false
// (a hidden tab).
export class AnnouncementSyncScheduler {
    // targets(): { core: target[], rotating: target[] }, asked afresh each run
    // so newly searched tags join. A single endpoint failing is part of a
    // normal run's summary, never an error of the run.
    constructor({
        sync,
        targets,
        firstDelayMs = DEFAULT_FIRST_SYNC_DELAY_MS,
        intervalMs = DEFAULT_SYNC_INTERVAL_MS,
        catchUpIntervalMs = DEFAULT_CATCH_UP_INTERVAL_MS,
        maxRotatingTargetsPerRun = DEFAULT_MAX_ROTATING_TARGETS_PER_RUN,
        isActive = () => true,
        setTimer = (callback, ms) => setTimeout(callback, ms),
        clearTimer = (handle) => clearTimeout(handle)
    }) {
        if (!sync || typeof sync.sync !== 'function') throw new Error('AnnouncementSyncScheduler: an AnnouncementSync is required');
        if (typeof targets !== 'function') throw new Error('AnnouncementSyncScheduler: a targets() function is required');
        this._sync = sync;
        this._targets = targets;
        this._firstDelayMs = firstDelayMs;
        this._intervalMs = intervalMs;
        this._catchUpIntervalMs = catchUpIntervalMs;
        this._maxRotating = maxRotatingTargetsPerRun;
        this._isActive = isActive;
        this._setTimer = setTimer;
        this._clearTimer = clearTimer;
        this._timer = null;
        this._running = null;
        this._started = false;
        this._rotation = 0;
        this._listeners = new Set();
    }

    start() {
        if (this._started) return;
        this._started = true;
        this._schedule(this._firstDelayMs);
    }

    stop() {
        this._started = false;
        if (this._timer !== null) this._clearTimer(this._timer);
        this._timer = null;
    }

    // listener(summary) after each run; returns an unsubscribe function.
    onSynced(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    // Runs now (or joins the run already in progress), then keeps the timer going.
    runNow() {
        if (!this._running) {
            this._running = this._run().finally(() => { this._running = null; });
        }
        return this._running;
    }

    _schedule(ms) {
        if (!this._started) return;
        if (this._timer !== null) this._clearTimer(this._timer);
        this._timer = this._setTimer(() => {
            this._timer = null;
            if (!this._isActive()) {
                this._schedule(this._intervalMs);
                return;
            }
            this.runNow();
        }, ms);
    }

    async _run() {
        let summary = { targets: [], behind: false };
        try {
            const { core = [], rotating = [] } = this._targets() || {};
            const start = rotating.length > 0 ? this._rotation % rotating.length : 0;
            const window = rotating.length <= this._maxRotating
                ? rotating
                : [...rotating, ...rotating].slice(start, start + this._maxRotating);
            this._rotation = start + window.length;

            const results = [];
            for (const target of [...core, ...window]) {
                results.push(await this._sync.sync(target));
            }
            summary = {
                targets: results,
                behind: results.some((result) => result.substrates.some((s) => s.ok && (!s.caughtUp || !s.backfillDone)))
            };
        } catch (error) {
            summary = { targets: [], behind: false, error };
        }
        for (const listener of this._listeners) {
            try {
                listener(summary);
            } catch {
                // One listener failing never stops the others or the schedule.
            }
        }
        this._schedule(summary.behind ? this._catchUpIntervalMs : this._intervalMs);
        return summary;
    }
}
