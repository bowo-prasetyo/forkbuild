// A parallel diagnostic surface for discovery queries (0.2.19).
//
// discover()'s return type stays PlacementRecord[], exactly as it has
// since 0.2.11 — changing that would break every consumer that has
// depended on it across five milestones. DiscoveryDiagnostics is
// additive: an advanced caller can inspect
// `provider.getLastDiagnostics()` alongside the plain result to see
// WHY the result looks the way it does, without the ordinary consumer
// ever needing to know this exists.
//
// A discovery provider should never simply say "I didn't find it" —
// NOT_FOUND, index-stale, unavailable, invalid, unauthorized, and
// conflicted are different situations with different remedies, and
// this is where that distinction is recorded.
export class DiscoveryDiagnostics {
    constructor({
        cellsQueried = 0,
        manifestsLoaded = 0,
        manifestsMissing = 0,
        manifestsInvalid = 0,
        recordsChecked = 0,
        recordsRejected = 0,
        conflicts = 0,
        staleEntries = 0,
        equivocations = 0,
        observations = []
    } = {}) {
        this._cellsQueried = cellsQueried;
        this._manifestsLoaded = manifestsLoaded;
        this._manifestsMissing = manifestsMissing;
        this._manifestsInvalid = manifestsInvalid;
        this._recordsChecked = recordsChecked;
        this._recordsRejected = recordsRejected;
        this._conflicts = conflicts;
        this._staleEntries = staleEntries;
        this._equivocations = equivocations;
        this._observations = [...observations];
    }

    get cellsQueried() { return this._cellsQueried; }
    get manifestsLoaded() { return this._manifestsLoaded; }
    get manifestsMissing() { return this._manifestsMissing; }
    get manifestsInvalid() { return this._manifestsInvalid; }
    get recordsChecked() { return this._recordsChecked; }
    get recordsRejected() { return this._recordsRejected; }
    get conflicts() { return this._conflicts; }
    get staleEntries() { return this._staleEntries; }
    get equivocations() { return this._equivocations; }
    // Every TrustObservation recorded during the query, in order.
    get observations() { return [...this._observations]; }

    toJSON() {
        return {
            cellsQueried: this._cellsQueried,
            manifestsLoaded: this._manifestsLoaded,
            manifestsMissing: this._manifestsMissing,
            manifestsInvalid: this._manifestsInvalid,
            recordsChecked: this._recordsChecked,
            recordsRejected: this._recordsRejected,
            conflicts: this._conflicts,
            staleEntries: this._staleEntries,
            equivocations: this._equivocations,
            observations: this._observations.map((o) => o.toJSON())
        };
    }
}

// Mutable accumulator used while a single query runs; produces an
// immutable DiscoveryDiagnostics via build().
export class DiscoveryDiagnosticsBuilder {
    constructor() {
        this._counts = {
            cellsQueried: 0, manifestsLoaded: 0, manifestsMissing: 0, manifestsInvalid: 0,
            recordsChecked: 0, recordsRejected: 0, conflicts: 0, staleEntries: 0, equivocations: 0
        };
        this._observations = [];
    }

    increment(field, by = 1) {
        this._counts[field] = (this._counts[field] || 0) + by;
        return this;
    }

    // Records a TrustObservation and increments the matching counter
    // (best-effort — statuses with no dedicated counter, e.g. VALID,
    // still appear in observations() but affect no count).
    observe(observation) {
        this._observations.push(observation);
        return this;
    }

    build() {
        return new DiscoveryDiagnostics({ ...this._counts, observations: this._observations });
    }
}
