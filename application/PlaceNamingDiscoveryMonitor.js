import { shouldRefreshPlaceNamingDiscovery, DEFAULT_PLACE_NAMING_DISCOVERY_REFRESH_RADIUS } from './ShouldRefreshPlaceNamingDiscovery.js';
import { selectNearbyPlaceNamingClaims } from '../core/PlaceNamingProximitySelection.js';

// How far "nearby" extends for `selectNearby`'s own `proximityRadius` —
// deliberately its OWN constant, not a reuse of
// `DEFAULT_PLACE_NAMING_DISCOVERY_REFRESH_RADIUS` above, even though both
// happen to be 100 today. One governs "how far must the Wanderer move
// before re-discovering," the other governs "how far may a claim be to
// still count as nearby" — two independent policy questions that happen
// to share a number, not a shared reference (the identical "independent
// constants that happen to agree" relationship
// `application/ShouldRefreshSnapshotDiscovery.js`'s own header already
// documents for its own copy of this same number).
export const DEFAULT_PLACE_NAMING_DISCOVERY_PROXIMITY_RADIUS = 100;

// 0.9.256 — Automatic Place Naming Discovery Orchestration.
//
// 0.9.253/0.9.254 built genuine discovery ("what claims exist?") and
// 0.9.255 built genuine proximity selection ("which of those are near the
// Wanderer?") — but as of 0.9.255's own closing "what this milestone
// deliberately excludes," nothing yet CALLS either one automatically as
// the Wanderer moves. This file is that missing caller: the identical
// "background trigger that decides, from an already-computed position,
// when a fresh discovery call is worth making" seam
// `application/WorldSnapshotDiscoveryMonitor.js` (0.9.186) already
// established for Snapshot candidate discovery, drawn here for Place
// Naming's own, deliberately different, three-stage pipeline instead.
//
//   Wanderer position
//        │
//        ▼
//   PlaceNamingDiscoveryMonitor#observe(position)   ★ (THIS)
//        │
//        ▼
//   shouldRefreshPlaceNamingDiscovery(previousPosition, position, refreshRadius)
//        (application/ShouldRefreshPlaceNamingDiscovery.js, 0.9.256, sibling —
//        a pure decision boundary, NOT a reuse of
//        ShouldRefreshSnapshotDiscovery.js; see that file's own header)
//        │  true
//        ▼
//   discoverPlaceNamingClaimsCommand()   (a caller-supplied, already-bound,
//        zero-argument closure — in practice
//        executeDiscoverPlaceNamingClaimsCommand() [0.9.253] wired against a
//        composePlaceNamingDiscoveryRuntime() [0.9.253] queryService, exactly
//        mirroring the SAME "the monitor is handed an opaque command, never
//        constructs one" restraint WorldSnapshotDiscoveryMonitor already
//        holds for discoverSnapshotCandidatesCommand)
//        │
//        ▼
//   discovered envelopes   (core/PlaceNamingDiscoveryEnvelope.js shape,
//        UNMODIFIED — { protocol, version, worldId, regionId, claim })
//        │
//        │   resolveClaimPosition(envelope) -> {x,z}|null   (a caller-
//        │   supplied, duck-typed resolver — see "position resolution is
//        │   injected, never performed," below)
//        ▼
//   the SAME envelopes, each with a resolved `.position` attached
//        │
//        ▼
//   selectNearbyPlaceNamingClaims(claimsWithPosition, position, proximityRadius)
//        (core/PlaceNamingProximitySelection.js, 0.9.255, UNMODIFIED)
//        │
//        ▼
//   { position, claims }   -> this.lastResult, and (optionally)
//        onObservation({ position, claims })
//
// THE MONITOR OWNS NEITHER PRESENTATION NOR ADOPTION — IT PRODUCES ONE
// PLAIN VALUE AND STOPS. `observe()` never renders anything, never writes
// to `application/LocalPlaceNamingClaimStore.js`, never calls
// `identity/LocalAuthorizationVerifier.js`, and never registers anything
// with a World or a registry. Its entire observable output is
// `this.lastResult` (and, if supplied, one `onObservation()` call carrying
// the identical `{ position, claims }` value) — exactly the same
// "ephemeral, in-memory, nothing cascades from it" posture
// `WorldSnapshotDiscoveryMonitor`'s own header already holds for
// `lastResult`/`lastError`.
//
// AN OWN SEMANTIC MONITOR, DELIBERATELY NOT A REUSE OF
// `WorldSnapshotDiscoveryMonitor.js` — THE ONE BOUNDARY THE RECOMMENDATION
// THAT OPENED THIS MILESTONE NAMED MOST INSISTENTLY. Snapshot discovery's
// own cadence machinery is entangled with resolve/verify/materialize/
// register/retain/render semantics this feature explicitly does not have
// (see this file's own "deliberately excluded," below); subclassing or
// parameterizing that file to also fit Place Naming's own, much smaller
// pipeline would blur two features that only coincidentally share the
// shape "position changed -> maybe call a command." This file shares
// exactly one thing with `WorldSnapshotDiscoveryMonitor.js` — the
// request-id race-guard pattern, described next — reimplemented here
// rather than imported, because THAT pattern is generic enough to earn
// independent reimplementation without becoming a second, competing
// abstraction over the same idea.
//
// RACE-PROTECTED, MIRRORING `WorldSnapshotDiscoveryMonitor`'S OWN
// requestId GUARD. `observe()` increments an internal request id before
// calling the injected command; a response — success or failure — is only
// ever applied to `lastResult`/`lastError`/`executing` (and only ever
// reaches `onObservation()`) if its own request id is still the most
// recently issued one. A later `observe()` call (a newer Wanderer
// position) always wins over an earlier call's own late-arriving
// response. Concurrent requests are never cancelled — the losing request
// is simply left to resolve or reject into nothing once it arrives, the
// identical "concurrent requests do not need cancellation" posture this
// milestone's own brief names by name.
//
// A DISCOVERY FAILURE NEVER MUTATES `lastResult`, NEVER THROWS TO THE
// CALLER. The promise `observe()` returns never rejects — a rejected (or
// synchronously throwing) `discoverPlaceNamingClaimsCommand()` call is
// caught internally and recorded as `lastError`, leaving `lastResult`
// exactly as it was before the failed call. Isolating one failing
// discovery SOURCE from another remains entirely
// `application/PlaceNamingDiscoveryQueryService.js`'s own,
// already-established job (0.9.253) — this file adds no source-level
// isolation of its own, and never even knows how many sources the
// injected command's own queryService is built from.
//
// POSITION RESOLUTION IS INJECTED, NEVER PERFORMED. A discovery envelope
// carries a `regionId`, never a position (see
// `core/PlaceNamingProximitySelection.js`'s own header, "each entry in
// `claims` must already carry its own `.position` — this file never
// resolves one"). Resolving "where is this region, in THIS Wanderer's
// current layout" requires exactly the layout-aware knowledge
// `core/GeographicPlaceNavigation.js`'s own header already refuses to
// take on for itself, and that only an application session actually
// holding the current World layout (`application/WorldNavigationSession.js`,
// via `application/WorldLocationDirectory.js`) can answer. So this file
// never imports either one — `resolveClaimPosition` is a caller-supplied,
// duck-typed `(envelope) -> {x,z}|null` function, called once per
// discovered envelope. A missing resolver (`null`, the default) resolves
// every envelope to a `null` position — a safe, fail-closed default: with
// no way to place a claim, `selectNearbyPlaceNamingClaims()` excludes it,
// rather than this file guessing or defaulting to "assume it's nearby." A
// resolver that THROWS for one envelope is caught and treated as a `null`
// position for that envelope alone — the same "one bad entry never
// poisons its neighbors" restraint every aggregation boundary in this
// codebase already holds — never a reason to fail the whole observation.
//
// PROXIMITY FILTERING HAPPENS HERE, AFTER DISCOVERY — NEVER PUSHED DOWN
// INTO A SOURCE. Per this milestone's own brief: a source (Nostr today, a
// peer or Arweave source tomorrow) only ever needs to answer "what claims
// exist for this discovery tag," never "what claims are near this
// position" — geographic filtering stays entirely this application-layer
// concern's own, so a future source implementation never needs to
// understand ForkBuild's own spatial-selection policy at all.
//
// WHEN `observe()` IS CALLED IS ENTIRELY ITS OWN CALLER'S CONCERN. This
// file schedules no timer, polling loop, or subscription of its own — a
// caller (a future World View tick, mirroring
// `ui/views/WorldView.js#refreshSpatialUI()`) decides entirely for itself
// how often to call `observe()` with the Wanderer's current position.
//
// DISPOSABLE. `dispose()` marks this instance permanently inert: any
// `observe()` call made afterward resolves immediately without calling
// the injected command, and any request already in flight at the moment
// of disposal is discarded on arrival rather than mutating
// `lastResult`/`lastError` — the same request-id-shaped guard already used
// for staleness, extended to cover "this session itself is over."
//
// EVERY INSTANCE IS INDEPENDENT — NO MODULE-LEVEL STATE, NO SINGLETON.
// Two monitors (two Wanderers, two independent test sessions) never share
// `_lastObservedPosition`, `_requestId`, `lastResult`, or `lastError`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Verification, ranking, deduplication beyond what discovery already
//   performs, conflict resolution, or trust scoring.** Every value in
//   `lastResult` is exactly what `selectNearbyPlaceNamingClaims()` itself
//   returned, untouched.
// - **Automatic adoption, World registry registration, retention, or
//   removal of a discovered claim.** A nearby claim becoming observable is
//   not the same as it becoming authoritative — see docs/Principles.md,
//   this milestone's own entry.
// - **Rendering or any other World View/UI presentation.** This file has
//   no idea `ui/` exists. See docs/Roadmap.md, "0.9.257 — World View Place
//   Naming Presentation."
// - **Persistence of `lastResult`/`lastError` across a page reload.**
//   Purely in-memory, for the lifetime of this instance.
// - **Deriving a discovery tag, constructing a discovery source, or
//   composing a `PlaceNamingDiscoveryQueryService`.** This file receives
//   an already-bound `discoverPlaceNamingClaimsCommand`; composing one
//   remains entirely `application/PlaceNamingDiscoveryRuntimeComposition.js`'s
//   and a future caller's own concern.
export class PlaceNamingDiscoveryMonitor {
    // `discoverPlaceNamingClaimsCommand`: a zero-argument `() ->
    //   Promise<Array<envelope>>` — see this file's own header. `null`/
    //   absent leaves this monitor permanently inert (`observe()` still
    //   runs its own decision boundary, but never calls anything).
    // `resolveClaimPosition`: `(envelope) -> {x,z}|null` — see "position
    //   resolution is injected, never performed," above. `null`/absent
    //   resolves every envelope to a `null` position.
    // `refreshRadius`: the movement threshold `shouldRefresh` compares
    //   against — defaults to
    //   `DEFAULT_PLACE_NAMING_DISCOVERY_REFRESH_RADIUS`.
    // `proximityRadius`: the radius handed to `selectNearby` — how far
    //   "nearby" extends. Deliberately a SEPARATE number from
    //   `refreshRadius`: how often to re-discover and how far a claim may
    //   be to still count as nearby are two independent policy choices
    //   that happen to share a sensible default today.
    // `shouldRefresh`/`selectNearby`: overridable only for tests exercising
    //   this class's own request/race/disposal handling independently of
    //   the real decision functions — default to the real
    //   `shouldRefreshPlaceNamingDiscovery`/`selectNearbyPlaceNamingClaims`.
    // `onObservation`: an optional `({ position, claims }) -> void`,
    //   called once per successfully-completed (non-stale, non-disposed)
    //   discovery cycle — never called when `shouldRefresh` declines to
    //   refresh, when no command is configured, or when the cycle fails.
    constructor({
        discoverPlaceNamingClaimsCommand = null,
        resolveClaimPosition = null,
        refreshRadius = DEFAULT_PLACE_NAMING_DISCOVERY_REFRESH_RADIUS,
        proximityRadius = DEFAULT_PLACE_NAMING_DISCOVERY_PROXIMITY_RADIUS,
        shouldRefresh = shouldRefreshPlaceNamingDiscovery,
        selectNearby = selectNearbyPlaceNamingClaims,
        onObservation = null
    } = {}) {
        this._discoverPlaceNamingClaimsCommand = discoverPlaceNamingClaimsCommand;
        this._resolveClaimPosition = typeof resolveClaimPosition === 'function' ? resolveClaimPosition : null;
        this._refreshRadius = refreshRadius;
        this._proximityRadius = proximityRadius;
        this._shouldRefresh = shouldRefresh;
        this._selectNearby = selectNearby;
        this._onObservation = typeof onObservation === 'function' ? onObservation : null;
        this._lastObservedPosition = null;
        this._requestId = 0;
        this._disposed = false;
        this.executing = false;
        this.lastResult = null;
        this.lastError = null;
    }

    // observe(position) -> Promise<void>. Never rejects.
    //
    // Resolves once a triggered discovery+proximity cycle (if any) has
    // settled and its outcome — win or lose the race against a later
    // `observe()` call, or against `dispose()` — has been applied.
    // Resolves immediately when the current position does not warrant a
    // fresh discovery call, when no command was ever supplied, or when
    // this instance has been disposed.
    observe(position) {
        if (this._disposed) {
            return Promise.resolve();
        }
        if (!this._shouldRefresh(this._lastObservedPosition, position, this._refreshRadius)) {
            return Promise.resolve();
        }
        this._lastObservedPosition = position;

        if (typeof this._discoverPlaceNamingClaimsCommand !== 'function') {
            return Promise.resolve();
        }

        this._requestId += 1;
        const requestId = this._requestId;
        this.executing = true;

        return Promise.resolve()
            .then(() => this._discoverPlaceNamingClaimsCommand())
            .then((envelopes) => {
                if (this._disposed || requestId !== this._requestId) {
                    return;
                }
                const withPositions = this._attachPositions(envelopes);
                const claims = this._selectNearby(withPositions, position, this._proximityRadius);
                this.executing = false;
                this.lastResult = claims;
                this.lastError = null;
                if (this._onObservation) {
                    this._onObservation({ position, claims });
                }
            })
            .catch((error) => {
                if (this._disposed || requestId !== this._requestId) {
                    return;
                }
                this.executing = false;
                this.lastError = error;
            });
    }

    // Attaches a resolved `.position` to each discovered envelope — see
    // this file's own header, "position resolution is injected, never
    // performed." Never mutates an envelope; produces a fresh plain object
    // per entry. A non-array `envelopes` degrades to `[]`, mirroring every
    // other aggregation boundary in this codebase.
    _attachPositions(envelopes) {
        if (!Array.isArray(envelopes)) {
            return [];
        }
        return envelopes.map((envelope) => {
            let resolvedPosition = null;
            if (this._resolveClaimPosition) {
                try {
                    resolvedPosition = this._resolveClaimPosition(envelope);
                } catch {
                    resolvedPosition = null;
                }
            }
            return { ...envelope, position: resolvedPosition };
        });
    }

    // Marks this instance permanently inert — see this file's own header,
    // "disposable." Idempotent; disposing an already-disposed instance is
    // a no-op.
    dispose() {
        this._disposed = true;
    }
}
