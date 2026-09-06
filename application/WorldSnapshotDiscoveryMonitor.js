// 0.9.186 — World Snapshot Background Discovery.
//
// Every existing Snapshot candidate-discovery capability
// (`application/DiscoverSnapshotCandidatesCommand.js`, 0.9.150) has, until
// now, been reachable only through an explicit "Discover Snapshots" click
// in `ui/components/OwnPublicationPanel.js` — see that command's own
// header, "Caching, retries, or automatic/background discovery of any
// kind... this file is called once per invocation, by a caller who decides
// entirely for itself when to call it." This file is that caller: a
// background trigger that decides, from the World's own already-computed
// spatial observation context, when a fresh candidate-discovery call is
// worth making — never a second discovery algorithm, and never a
// resolution/materialization/placement/registration cascade of its own.
//
//   ui/views/WorldView.js's own refreshSpatialUI() tick
//        │  spatialContext (WorldSpatialContextService#getCurrentContext(),
//        │                  UNMODIFIED)
//        ▼
//   WorldSnapshotDiscoveryMonitor#observe(context)   ★ (THIS)
//        │
//        ▼
//   shouldRefreshSnapshotDiscovery(previousContext, context)   (application/
//     ShouldRefreshSnapshotDiscovery.js, NEW — a pure decision boundary)
//        │  true
//        ▼
//   discoverSnapshotCandidatesCommand()   (0.9.150/0.9.151, UNMODIFIED — the
//     SAME app-wide command the explicit "Discover Snapshots" button
//     already calls)
//        │
//        ▼
//   this.lastResult / this.lastError   (this file's own ephemeral state)
//
// NEVER A SECOND DISCOVERY ALGORITHM. This file constructs no Nostr/Arweave
// client, performs no ranking/filtering/deduplication of its own, and calls
// the SAME injected `discoverSnapshotCandidatesCommand` the explicit UI
// path already calls — storing exactly what it resolves to, verbatim.
//
// NEVER A CASCADE. `observe()` never resolves a candidate, retrieves bytes,
// verifies a hash, materializes, places, registers, unregisters, or renders
// anything. A caller who wants any of that still reaches for the existing,
// separate, explicit machinery this codebase already has
// (`resolveSelectedSnapshotCommand`/`materializeSelectedSnapshotCommand`/
// `placeMaterializedSnapshot()`/`registerMaterializedSnapshot()` in
// `ui/components/OwnPublicationPanel.js`) — composing background discovery
// with that chain is a separate, later, unscheduled seam (see
// docs/Roadmap.md's own 0.9.186 entry, "0.9.187 — Automatic Snapshot
// Encounter Cascade").
//
// CONTEXT COMPARISON IS DELEGATED ENTIRELY TO shouldRefreshSnapshotDiscovery().
// This file never computes a distance or reads a position field itself —
// `context` is opaque to it beyond being handed, unread, to the injected
// decision function.
//
// RACE-PROTECTED, MIRRORING `ui/components/OwnPublicationPanel.js`'s OWN
// requestId GUARD for its candidate-discovery family. `observe()`
// increments an internal request id before calling the injected command; a
// response is only ever applied to `lastResult`/`lastError`/`executing` if
// its own request id is still the most recently issued one. A later
// `observe()` call (a newer World position) always wins over an earlier
// call's own late-arriving response.
//
// A DISCOVERY FAILURE NEVER MUTATES `lastResult`, NEVER THROWS TO THE
// CALLER, AND TOUCHES NO WORLD/REGISTRY STATE OF ANY KIND. The promise
// `observe()` returns never rejects — a rejected (or synchronously
// throwing) `discoverSnapshotCandidatesCommand()` call is caught
// internally and recorded as `lastError`, leaving `lastResult` exactly as
// it was before the failed call.
//
// WHEN `observe()` IS CALLED IS ENTIRELY ITS OWN CALLER'S CONCERN. This
// file decides, given a call, whether that call is worth acting on — it
// never schedules its own timer, polling loop, or subscription. See
// `ui/views/WorldView.js`'s own `refreshSpatialUI()`, which already runs on
// its own pre-existing cadence (a 3-second interval, plus assorted
// movement/session events) — this milestone adds no new polling loop of
// its own.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Resolving, materializing, placing, or registering any discovered
//   candidate.** See "never a cascade," above — 0.9.187's own named seam.
// - **A position-acceptance policy, ranking, or trust scoring of
//   candidates.** Candidates are stored exactly as
//   `discoverSnapshotCandidatesCommand()` itself returned them.
// - **Persistence of `lastResult`/`lastError` across a page reload, or a
//   store of its own.** Purely in-memory, for the lifetime of this
//   instance.
import { shouldRefreshSnapshotDiscovery } from './ShouldRefreshSnapshotDiscovery.js';

export class WorldSnapshotDiscoveryMonitor {
    // `discoverSnapshotCandidatesCommand`: the SAME app-wide `() ->
    //   Promise<[{ contentHash, locator, storage }, ...]>` command
    //   `ui/main.js` already composes and provides — never constructed or
    //   composed here. `null`/absent leaves this monitor permanently inert
    //   (`observe()` still runs its decision boundary, but never calls
    //   anything).
    // `shouldRefresh`: defaults to `shouldRefreshSnapshotDiscovery` —
    //   overridable only for tests exercising this class's own
    //   request/race handling independently of the real threshold.
    constructor({ discoverSnapshotCandidatesCommand = null, shouldRefresh = shouldRefreshSnapshotDiscovery } = {}) {
        this._discoverSnapshotCandidatesCommand = discoverSnapshotCandidatesCommand;
        this._shouldRefresh = shouldRefresh;
        this._lastObservedContext = null;
        this._requestId = 0;
        this.executing = false;
        this.lastResult = null;
        this.lastError = null;
    }

    // observe(context) -> Promise<void>. Never rejects.
    //
    // Resolves once a triggered discovery call (if any) has settled and its
    // outcome — win or lose the race against a later `observe()` call — has
    // been applied. Resolves immediately when the current context does not
    // warrant a fresh discovery call, or when no command was ever supplied.
    observe(context) {
        if (!this._shouldRefresh(this._lastObservedContext, context)) {
            return Promise.resolve();
        }
        this._lastObservedContext = context;

        if (typeof this._discoverSnapshotCandidatesCommand !== 'function') {
            return Promise.resolve();
        }

        this._requestId += 1;
        const requestId = this._requestId;
        this.executing = true;

        return Promise.resolve()
            .then(() => this._discoverSnapshotCandidatesCommand())
            .then((candidates) => {
                if (requestId !== this._requestId) {
                    return;
                }
                this.executing = false;
                this.lastResult = candidates;
                this.lastError = null;
            })
            .catch((error) => {
                if (requestId !== this._requestId) {
                    return;
                }
                this.executing = false;
                this.lastError = error;
            });
    }
}
