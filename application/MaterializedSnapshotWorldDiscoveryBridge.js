import { describeWorldDiscoverySource } from '../core/WorldDiscoverySource.js';
import { SnapshotWorldPlacementOutcome } from './SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from './SnapshotWorldRegistrationOutcome.js';

// 0.9.160 — Snapshot World Runtime Registration.
//
// 0.9.150 through 0.9.159 built DISCOVER -> SELECT -> RESOLVE -> VERIFY ->
// ATTRIBUTE -> MATERIALIZE -> PLACE, ending in a placement FACT
// (`resolveSnapshotWorldPlacement()`'s own PLACED result) that lived only
// inside `OwnPublicationPanel.js`'s own ephemeral interaction state. This
// file is the missing seam: it makes that fact OBSERVABLE to the running
// World, through the SAME live runtime membership mechanism a connected
// peer's own World contribution already uses — never a new World-state
// authority, never a second registry, never a rendering step of its own.
//
//   BEFORE ASKING "HOW DO WE REGISTER," THIS MILESTONE FIRST ASKED "WHERE."
// `application/WorldDiscoverySourceRegistry.js` (0.9.9) already answers
// exactly "which sources currently contribute to the running World" — it
// is the ONE piece of mutable runtime state `ui/main.js` constructs once
// at startup (`worldDiscoveryRuntime.registry`, `bootstrapWorldDiscoveryRuntime()`,
// 0.9.14) and hands, unchanged, to both `ui/views/WorldView.js` and
// `ui/views/LiveWorldView.js`, which inject it and pass it straight through
// as `WorldEncounterCanvas`'s own `registry` prop (0.9.13, already
// subscribed and already re-rendering on every change). A connected peer's
// own World contribution already registers into this SAME registry, under
// its own dedicated `"peer:<identityId>"` origin, via
// `peer/PeerWorldDiscoveryLifecycleBridge.js` (0.9.11) — this file is that
// EXACT pattern, one origin scheme over, for a materialized Snapshot
// instead of a connected peer:
//
//   selectedSnapshotWorldPlacementResult   (application/SnapshotWorldPlacement.js,
//        │                                  0.9.159 — PLACED, UNPLACED, or a
//        │                                  materialization failure passed
//        │                                  through verbatim)
//        │
//        │           publication   (the SAME already-known Publication object
//        │                │         resolveSnapshotWorldPlacement()'s own
//        │                │         `placementInfo` argument was already
//        │                │         keyed to — never re-fetched here)
//        ▼                ▼
//   registerMaterializedSnapshotWorldSource(registry, worldPlacementResult,
//        publication)   ★ (THIS)
//        │
//        ▼
//   registry.setSource(describeWorldDiscoverySource({
//       origin: "snapshot:<contentHash>", publications: [publication],
//       placements: [{ publicationId, position }]
//   }))   (application/WorldDiscoverySourceRegistry.js, 0.9.9, UNCHANGED)
//        │
//        ▼
//   registry.listSources()   (already subscribed to by any mounted
//        │                    WorldEncounterCanvas, 0.9.13, UNCHANGED)
//        ▼
//   assembleWorldDiscoveryInputs() -> deriveWorldEncounters() -> ... ->
//   WorldEncounterCanvas   (0.9.7/0.9.0/.../0.9.3-0.9.4, entirely UNCHANGED)
//
// EACH REGISTERED SNAPSHOT GETS ITS OWN DEDICATED ORIGIN, NEVER A SHARED
// "local" SLOT. `application/WorldDiscoveryRuntimeBootstrap.js`'s own
// header already names why the running app's `'local'` origin currently
// carries zero records: "reading real local publications/placements... out
// of this app's several storage layers... is separate, unscheduled work."
// This file does not attempt that unrelated, much larger job. Because
// `WorldDiscoverySourceRegistry.setSource()` REPLACES whatever previously
// occupied a slot (0.9.9's own "replacement, not accumulation"),
// contributing this milestone's own one Publication+placement pair under
// the SHARED `'local'` origin would silently overwrite (or be overwritten
// by) whatever else that origin might ever come to hold. Giving each
// registered Snapshot its own `"snapshot:<contentHash>"` origin — the
// identical "one dedicated slot per contributor" discipline
// `peer/PeerWorldDiscoveryLifecycleBridge.js` already holds for
// `"peer:<identityId>"` — makes registering one Snapshot structurally
// incapable of disturbing any other origin's own contribution, including a
// future `'local'` source once that separate gap is eventually closed.
//
// PLACEMENT IS THE ONLY PRECONDITION — MATERIALIZATION IS ALREADY IMPLIED.
// `resolveSnapshotWorldPlacement()` (0.9.159) itself already refuses to
// report `PLACED` unless materialization reached `StoreSnapshotContentOutcome.STORED`/
// `.ALREADY_AVAILABLE` — so checking for `SnapshotWorldPlacementOutcome.PLACED`
// here is both this file's placement gate AND its materialization gate at
// once, with no separate check duplicating 0.9.159's own rule. Every other
// outcome — `UNPLACED`, or any resolution/materialization failure passed
// through from further upstream — is reported HERE, VERBATIM, and nothing
// is registered: the identical "non-terminal outcomes pass through, never
// remapped" restraint every file in this family already holds.
//
// THE PUBLICATION OBJECT IS NEVER RECONSTRUCTED, AND ITS OWN `id` MUST
// MATCH THE PLACEMENT RESULT'S. `resolveSnapshotWorldPlacement()`'s own
// result never carries a `Publication` instance — only `publicationId`,
// borrowed from `placementInfo`. This file's own `publication` argument is
// the ACTUAL Publication object (title, publisherIdentity, signature,
// contentReference — everything `core/WorldEncounter.js#describeEncounterablePublication()`
// reads), handed straight through into the registered source, the exact
// same reference, never cloned or re-described — mirroring
// `core/WorldDiscoverySourceAssembly.js`'s own rule, "every record
// reference a source contributed is the exact same object reference that
// went in." A caller handing a `publication` whose own `id` does not match
// `worldPlacementResult.publicationId` is a caller-contract violation (the
// two facts are supposed to describe the SAME active document) and this
// file throws rather than silently attaching the wrong title/identity to a
// position.
//
// THE POSITION IS NEVER RECOMPUTED, AND NO NEW SPATIAL ALGORITHM EXISTS
// HERE. The `placements` entry this file builds is
// `{ publicationId: worldPlacementResult.publicationId, position:
// worldPlacementResult.position }` — 0.9.159's own already-borrowed
// position, copied through unchanged. This file never queries a
// `PlacementRegistry`, a spatial index, or `WorldNavigationSession#
// getPlacementInfo()` itself.
//
// IDEMPOTENT BY CONSTRUCTION — NO DEDUPLICATION CODE OF ITS OWN. Because
// the origin `"snapshot:<contentHash>"` is a pure function of the content
// hash alone, registering the identical Snapshot twice calls
// `registry.setSource()` twice for the SAME origin — the registry's own
// existing "replacement, not accumulation" rule already guarantees exactly
// one entry survives, with no new deduplication, comparison, or "already
// registered" tracking invented here. See docs/Principles.md and this
// file's own header, "a new spatial-placement algorithm... never invented
// from scratch," held here one layer up for registration.
//
// NO RENDERING, NO VISIBILITY, NO CAMERA, NO VIEWPORT. This file's own
// return value carries `{ outcome, origin, contentHash, reason }` — no
// mesh, no marker, no `WorldEncounterCanvas` prop, no notion of "currently
// on screen." Whether a registered Snapshot is presently visible is
// `WorldEncounterCanvas`'s own, entirely separate, unmodified concern —
// exactly the restraint `application/SnapshotWorldPlacement.js`'s own
// header already holds one seam under this one.
//
// `unregisterMaterializedSnapshotWorldSource(registry, contentHash)` is the
// deliberate, symmetric undo — removing exactly the slot a prior
// `registerMaterializedSnapshotWorldSource()` call for the SAME
// `contentHash` created, via the SAME derived origin, never a second,
// independently-computed key. Mirrors `unregisterPeerWorldSource()`'s own
// defensive, never-throwing shape exactly: a missing/malformed `registry`
// or `contentHash` is silently ignored, and removing an origin with no
// current source is already a no-op at the registry's own layer (0.9.9).
// NOT wired to any automatic lifecycle by this milestone — see "Deliberately
// excluded," below.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Populating the `'local'` `WorldDiscoverySource` from this replica's
//   general publication/placement storage.** See "Each registered Snapshot
//   gets its own dedicated origin," above — a separate, much older,
//   already-named gap (`application/WorldDiscoveryRuntimeBootstrap.js`,
//   0.9.14) this milestone does not attempt to close.
// - **Automatically unregistering a Snapshot when the interaction state
//   that produced it goes stale.** `OwnPublicationPanel.js`'s own
//   `selectedSnapshotWorldPlacementResult`/`selectedSnapshotCandidate`
//   resetting on a new selection, a fresh resolution/materialization
//   attempt, or a Publication change describes only EPHEMERAL UI state —
//   it never implies the registered Snapshot's bytes were un-materialized
//   or its Publication un-placed, and this file introduces no watcher of
//   its own over any of that state.
// - **Deduplication, ranking, trust, verification, or reconciliation of any
//   kind.** Inherited unchanged from every file in this family and from
//   `application/WorldDiscoverySourceRegistry.js` itself.
// - **Rendering, visibility, viewport, or camera logic of any kind.** See
//   "No rendering," above.
// - **A new World-state authority, store, or registry.** This file imports
//   and mutates the ONE existing `WorldDiscoverySourceRegistry` instance a
//   caller already holds — it never constructs one of its own.

// Derives the dedicated origin a materialized Snapshot's own registration
// occupies — a pure function of `contentHash` alone, reused identically by
// both `registerMaterializedSnapshotWorldSource()` and
// `unregisterMaterializedSnapshotWorldSource()` so a Snapshot's disconnect
// always targets precisely the slot its own registration created. Returns
// `null`, never throws, for a missing/empty `contentHash` — mirroring
// `peer/PeerWorldDataIngress.js#derivePeerWorldOrigin()`'s own "an
// unestablished identity... creates no entry and removes none."
export function materializedSnapshotWorldOrigin(contentHash) {
    if (typeof contentHash !== 'string' || contentHash.length === 0) {
        return null;
    }
    return `snapshot:${contentHash}`;
}

// registerMaterializedSnapshotWorldSource(registry, worldPlacementResult, publication) ->
//   { outcome, origin, contentHash, reason }
//
// `registry`             — an application/WorldDiscoverySourceRegistry.js
//                           instance this replica already runs (the SAME
//                           one `WorldEncounterCanvas`'s own `registry`
//                           prop is bound to). Required.
// `worldPlacementResult` — the ALREADY-COMPUTED result of
//                           `resolveSnapshotWorldPlacement()` (0.9.159).
//                           Required.
// `publication`          — the Publication object `worldPlacementResult`
//                           was placed against — required, and its own
//                           `id` must equal `worldPlacementResult.publicationId`,
//                           ONLY when `worldPlacementResult.outcome` is
//                           `PLACED` (a pass-through outcome never reads it
//                           at all).
//
// When `worldPlacementResult.outcome !== SnapshotWorldPlacementOutcome.PLACED`:
// returns `{ outcome: worldPlacementResult.outcome, origin: null,
// contentHash: worldPlacementResult.contentHash, reason:
// worldPlacementResult.reason }` — that SAME outcome, unchanged, and
// nothing is registered.
//
// When `PLACED`: registers a fresh `WorldDiscoverySource` under
// `"snapshot:<contentHash>"`, carrying `publication` (the exact reference
// handed in) and one placement entry (`{ publicationId, position }`,
// `worldPlacementResult`'s own), then returns
// `{ outcome: SnapshotWorldRegistrationOutcome.REGISTERED, origin,
// contentHash, reason: null }`.
export function registerMaterializedSnapshotWorldSource(registry, worldPlacementResult, publication) {
    if (!registry || typeof registry.setSource !== 'function') {
        throw new Error('registerMaterializedSnapshotWorldSource: a WorldDiscoverySourceRegistry is required');
    }
    if (!worldPlacementResult || typeof worldPlacementResult.outcome !== 'string') {
        throw new Error('registerMaterializedSnapshotWorldSource: a resolveSnapshotWorldPlacement() result is required');
    }

    if (worldPlacementResult.outcome !== SnapshotWorldPlacementOutcome.PLACED) {
        return {
            outcome: worldPlacementResult.outcome,
            origin: null,
            contentHash: worldPlacementResult.contentHash || null,
            reason: worldPlacementResult.reason || null
        };
    }

    if (!publication || publication.id !== worldPlacementResult.publicationId) {
        throw new Error('registerMaterializedSnapshotWorldSource: publication.id must match the placement result\'s own publicationId');
    }

    const origin = materializedSnapshotWorldOrigin(worldPlacementResult.contentHash);
    const source = describeWorldDiscoverySource({
        origin,
        publications: [publication],
        placements: [{ publicationId: worldPlacementResult.publicationId, position: worldPlacementResult.position }]
    });
    registry.setSource(source);

    return {
        outcome: SnapshotWorldRegistrationOutcome.REGISTERED,
        origin,
        contentHash: worldPlacementResult.contentHash,
        reason: null
    };
}

// unregisterMaterializedSnapshotWorldSource(registry, contentHash) -> void
//
// Removes exactly the slot a prior `registerMaterializedSnapshotWorldSource()`
// call for the SAME `contentHash` created — never invoked automatically by
// this milestone (see this file's own header, "Deliberately excluded");
// provided as the symmetric undo a future, explicit caller can use.
// Defensive, never throwing: a missing/malformed `registry` or
// `contentHash` is silently ignored, mirroring
// `peer/PeerWorldDiscoveryLifecycleBridge.js#unregisterPeerWorldSource()`'s
// own shape exactly.
export function unregisterMaterializedSnapshotWorldSource(registry, contentHash) {
    if (!registry || typeof registry.removeSource !== 'function') {
        return;
    }
    const origin = materializedSnapshotWorldOrigin(contentHash);
    if (origin === null) {
        return;
    }
    registry.removeSource(origin);
}
