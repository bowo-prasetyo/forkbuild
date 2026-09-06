import { shouldRetainAutomaticSnapshotEncounter, DEFAULT_AUTOMATIC_SNAPSHOT_RETENTION_RADIUS } from './AutomaticSnapshotEncounterRetentionPolicy.js';
import {
    materializedSnapshotWorldOrigin,
    unregisterMaterializedSnapshotWorldSource
} from './MaterializedSnapshotWorldDiscoveryBridge.js';

// 0.9.190 — Automatic Snapshot Encounter Retention Integration.
//
// 0.9.189 answered exactly one question — "given two positions and a
// radius, should an already-registered automatic Snapshot be kept?" — as a
// pure function, deliberately stopping short of ever calling
// `unregisterMaterializedSnapshotWorldSource()` itself (see that file's own
// header, "Deliberately excluded... Actually unregistering anything").
// This file is the integration that policy's own header named as separate,
// later, unscheduled work — and nothing more:
//
//   ui/views/WorldView.js's own refreshSpatialUI() tick
//        │  spatialContext.value.position (the SAME position
//        │  WorldSnapshotDiscoveryMonitor#observe() is already fed)
//        ▼
//   AutomaticSnapshotEncounterRetentionReconciliation#reconcile(wandererPosition)   ★ (THIS)
//        │
//        │   for each subject THIS instance itself watched register
//        │   (see "provenance," below) — never a scan of the whole registry
//        ▼
//   registry.listSources()   (application/WorldDiscoverySourceRegistry.js,
//        │                    0.9.9, UNCHANGED — read-only lookup of that
//        │                    subject's own current source, if it still
//        │                    exists)
//        ▼
//   shouldRetainAutomaticSnapshotEncounter({ wandererPosition,
//       snapshotPosition, retentionRadius })   (0.9.189, UNCHANGED — the
//        │                                      pure policy, called exactly
//        │                                      as its own header specifies)
//        │
//        ├── KEEP   → nothing happens; the subject stays watched
//        │
//        └── REMOVE → unregisterMaterializedSnapshotWorldSource(registry,
//                          contentHash, publicationId)   (0.9.160, UNCHANGED
//                          — the SAME symmetric undo a manual removal
//                          already uses)
//
// THIS FILE OPERATES ON REGISTERED WORLD SOURCES, NEVER ON DISCOVERY
// CANDIDATES. `application/AutomaticSnapshotEncounterCascade.js` (0.9.187)
// answers "what COULD become an encounter"; `application/
// WorldDiscoverySourceRegistry.js` answers "what CURRENTLY IS one." This
// file reconciles the latter — it never imports `application/
// AutomaticSnapshotEncounterCascade.js`, `application/
// WorldSnapshotDiscoveryMonitor.js`, `application/
// DiscoverSnapshotCandidatesCommand.js`, or any Nostr/Arweave
// collaborator, and never resolves, materializes, places, or registers
// anything of its own. This is a strictly narrower surface than the cascade
// it sits downstream of — the identical direction 0.9.189's own policy
// already drew, held here one layer up: discovery stays discovery's own
// job; this file only asks whether something ALREADY IN the World still
// belongs there.
//
// PROVENANCE, WITHOUT A NEW PERSISTENT FLAG ON THE REGISTRY OR THE SOURCE
// SHAPE. `application/MaterializedSnapshotWorldDiscoveryBridge.js`'s own
// `"snapshot:<contentHash>:<publicationId>"` origin is written by TWO
// independent callers today — `AutomaticSnapshotEncounterCascade#_run()`
// (automatic) and `OwnPublicationPanel.js`'s own explicit "Register" button
// (manual) — through the EXACT SAME `registerMaterializedSnapshotWorldSource()`
// function, producing an IDENTICAL origin either way. The registry itself
// (by design — see its own header, "no trust vocabulary") cannot tell the
// two apart, and this file adds no `automatic: true` field to change that:
// a `WorldDiscoverySource`'s own shape (`core/WorldDiscoverySource.js`,
// 0.9.5) is untouched, and `registerMaterializedSnapshotWorldSource()`
// itself is untouched. Instead, provenance lives ENTIRELY in this file's
// own instance state: `noteAutomaticRegistration({ publicationId,
// contentHash })` is the one and only way a subject ever becomes eligible
// for `reconcile()` to touch, and the one caller who ever invokes it is
// `ui/views/WorldView.js`'s own composition, immediately after
// `automaticSnapshotEncounterCascade.processCandidate()` itself settles to
// `SnapshotWorldRegistrationOutcome.REGISTERED` — never on any other
// outcome, and never for a Snapshot a person registered by hand. A
// manually-registered Snapshot that the automatic cascade never touched is
// therefore never watched by any `AutomaticSnapshotEncounterRetentionReconciliation`
// instance, and `reconcile()` structurally cannot unregister it — not
// because of a check against some flag, but because it was never added to
// the one Map this file ever iterates. See `tests/
// AutomaticSnapshotEncounterRetentionReconciliation.test.js`, Section G,
// for this held as a positive requirement.
//
// A SUBJECT REGISTERED BOTH WAYS IS STILL WATCHED — THIS IS NOT A GAP IN
// THE ABOVE. If the SAME `publicationId`+`contentHash` pair is ALSO
// registered through the automatic cascade (whether before, after, or
// instead of a person's own manual click — `registry.setSource()`'s own
// "replacement, not accumulation" rule makes either order land on the
// identical slot), `noteAutomaticRegistration()` is called for it exactly
// as for any other cascade success, and it becomes watched. This is
// correct, not incidental: the automatic cascade DID, in fact, confirm
// that pair belongs in the World on its own terms, and this file's only
// question is ever "did the cascade this instance owns register this,"
// never "did a person ALSO happen to register it separately."
//
// SCOPED IDENTICALLY TO THE CASCADE IT SITS BESIDE — ONE INSTANCE PER
// WorldView MOUNT, NEVER A SINGLETON. Exactly mirroring `new
// AutomaticSnapshotEncounterCascade(...)`'s own construction site and
// or own header's "a fresh cascade... accompanies each fresh session" —
// a fresh `AutomaticSnapshotEncounterRetentionReconciliation` instance is
// constructed alongside it, in the same place, and holds no state beyond
// this one running session's own lifetime.
//
// A MISSING SOURCE IS FORGOTTEN, NEVER TREATED AS "STILL PENDING." If a
// watched subject's own derived origin no longer resolves to a source in
// `registry.listSources()` — removed by a previous `reconcile()` call, or
// by any other caller of `registry.removeSource()`/`registry.clear()` —
// this file stops watching it rather than leaving a permanently dead entry
// behind. This is what makes `reconcile()` idempotent (see `tests/
// AutomaticSnapshotEncounterRetentionReconciliation.test.js`, Section J):
// the FIRST call that removes a subject also forgets it, so a SECOND call
// finds nothing left to evaluate for that subject and performs no further
// unregistration.
//
// THE POSITION IS ALWAYS READ LIVE FROM THE REGISTRY, NEVER CACHED AT
// NOTE-TIME. `noteAutomaticRegistration()` records only `{ publicationId,
// contentHash }` — never a position of its own — and `reconcile()` looks
// up `registry.listSources()` fresh on every call to find that subject's
// own current `placements[0].position`. This is deliberate, not an
// optimization left on the table: reconciling against the registry's own
// CURRENT placement, rather than a value this file remembered from
// registration time, is exactly what "operates on registered World
// sources, never discovery candidates," above, means in practice — a
// caller who wanted to add a position-changing repositioning step (not
// something this codebase does today) would already be reconciled against
// correctly, with no code change to this file.
//
// NO RE-REGISTRATION, NO REDISCOVERY, EVER. `reconcile()` imports nothing
// from the discovery/resolve/materialize/place/register chain — the only
// registry method it ever calls is the SAME read-only `listSources()` every
// other reader already uses, and the only MUTATING call it ever makes is
// `unregisterMaterializedSnapshotWorldSource()`. A Snapshot removed by one
// `reconcile()` call because the Wanderer walked away is NEVER
// automatically re-registered by a later `reconcile()` call because the
// Wanderer walked back — see `application/
// AutomaticSnapshotEncounterRetentionPolicy.js`'s own header, "Very
// important: don't immediately rediscover" (held here as this file's own
// instruction, one layer up): once forgotten, a subject returns to the
// World only if `AutomaticSnapshotEncounterCascade` independently
// discovers and re-cascades it, exactly as it would for any Snapshot this
// reconciliation had never touched at all.
//
// UNREGISTRATION NEVER TOUCHES MATERIAL, A PUBLICATION, OR CONTENT
// IDENTITY. `unregisterMaterializedSnapshotWorldSource()` (0.9.160,
// UNCHANGED) removes exactly one `WorldDiscoverySourceRegistry` slot — it
// was already documented, before this milestone existed, as never
// deleting stored bytes, a `Publication`, a Nostr announcement, or an
// Arweave transaction, and this file adds no new deletion path of its own
// alongside it.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A new Snapshot lifecycle vocabulary, TTL, timestamps, retry, or
//   backoff.** Inherited unchanged from 0.9.189's own exclusions —
//   `reconcile()` holds no history and no notion of elapsed time; every
//   call re-evaluates every currently-watched subject fresh, against the
//   CURRENT `wandererPosition` and the CURRENT registry contents only.
// - **Automatic rediscovery or re-materialization once a Snapshot moves
//   back inside the retention radius.** See "No re-registration, no
//   rediscovery, ever," above.
// - **A new persistent provenance flag on `WorldDiscoverySource` or the
//   registry itself.** See "Provenance, without a new persistent flag,"
//   above — provenance lives entirely in this file's own instance state.
// - **Modifying `application/AutomaticSnapshotEncounterCascade.js`.** That
//   file is imported nowhere in this one; the cascade's own `_results`
//   map, idempotency, and outcome vocabulary are entirely untouched.
// - **Visibility, viewport, camera, or rendering logic of any kind.**
//   Inherited unchanged from 0.9.189 — retention is never visibility.
// - **Ranking, trust, popularity, or any judgment beyond the one spatial
//   question `shouldRetainAutomaticSnapshotEncounter()` itself answers.**

// new AutomaticSnapshotEncounterRetentionReconciliation({
//   worldDiscoverySourceRegistry, retentionRadius, shouldRetain })
//
// `worldDiscoverySourceRegistry` — the SAME app-wide
//   `WorldDiscoverySourceRegistry` instance `registerMaterializedSnapshotWorldSource()`/
//   `unregisterMaterializedSnapshotWorldSource()` already mutate elsewhere.
//   `null`/absent leaves `reconcile()` permanently inert — see `reconcile()`'s
//   own doc, below.
// `retentionRadius` — forwarded, unread by this file, straight to
//   `shouldRetainAutomaticSnapshotEncounter()` on every subject, every call.
//   Optional, defaults to `DEFAULT_AUTOMATIC_SNAPSHOT_RETENTION_RADIUS`
//   (0.9.189's own default — re-exported, unchanged, from that file).
// `shouldRetain` — defaults to `shouldRetainAutomaticSnapshotEncounter`;
//   overridable only for tests exercising this class's own watch/forget
//   bookkeeping independently of the real spatial policy.
export class AutomaticSnapshotEncounterRetentionReconciliation {
    constructor({
        worldDiscoverySourceRegistry = null,
        retentionRadius = DEFAULT_AUTOMATIC_SNAPSHOT_RETENTION_RADIUS,
        shouldRetain = shouldRetainAutomaticSnapshotEncounter
    } = {}) {
        this._registry = worldDiscoverySourceRegistry;
        this._retentionRadius = retentionRadius;
        this._shouldRetain = shouldRetain;
        this._watched = new Map();
    }

    // noteAutomaticRegistration({ publicationId, contentHash }) -> void.
    //
    // Marks one `publicationId`+`contentHash` pair as automatically
    // managed — the ONLY way a subject ever becomes eligible for
    // `reconcile()` to evaluate or remove. Intended caller: `ui/views/
    // WorldView.js`'s own composition, once (and only when)
    // `automaticSnapshotEncounterCascade.processCandidate()` itself
    // settles to `SnapshotWorldRegistrationOutcome.REGISTERED` for that
    // pair. A missing/empty `publicationId` or `contentHash` is silently
    // ignored, never thrown — mirroring `materializedSnapshotWorldOrigin()`'s
    // own defensive shape exactly, which this method reuses to derive the
    // one key it tracks by. Calling this repeatedly for the SAME pair (as
    // every subsequent discovery tick re-confirming the identical
    // registration will) is a harmless no-op past the first call — a
    // `Map` keyed by that pair's own derived origin, not a growing list.
    noteAutomaticRegistration({ publicationId, contentHash } = {}) {
        const origin = materializedSnapshotWorldOrigin(contentHash, publicationId);
        if (origin === null) {
            return;
        }
        this._watched.set(origin, { publicationId, contentHash });
    }

    // reconcile(wandererPosition) -> Array<{ publicationId, contentHash }>
    //
    // For every currently-watched subject, looks up its own current
    // registered source (by re-deriving its origin and scanning
    // `registry.listSources()`) and asks `shouldRetainAutomaticSnapshotEncounter()`
    // whether it still belongs, given `wandererPosition` and this
    // instance's own `retentionRadius`. A subject whose source no longer
    // exists is forgotten with no further effect (see this file's own
    // header, "A missing source is forgotten"). A subject the policy says
    // to REMOVE is unregistered via `unregisterMaterializedSnapshotWorldSource()`
    // and then forgotten; a subject the policy says to KEEP remains
    // watched, untouched.
    //
    // Returns a frozen array of the `{ publicationId, contentHash }` pairs
    // actually unregistered by THIS call — `[]` when nothing was removed,
    // including when `worldDiscoverySourceRegistry` is missing/malformed
    // (this method then does nothing at all, never throwing). Never
    // mutates anything beyond, at most, calling
    // `unregisterMaterializedSnapshotWorldSource()` once per removed
    // subject and this instance's own watch list.
    reconcile(wandererPosition) {
        if (!this._registry || typeof this._registry.listSources !== 'function') {
            return Object.freeze([]);
        }

        const sourcesByOrigin = new Map(this._registry.listSources().map((source) => [source.origin, source]));
        const removed = [];

        for (const [origin, subject] of Array.from(this._watched.entries())) {
            const source = sourcesByOrigin.get(origin);
            if (!source) {
                this._watched.delete(origin);
                continue;
            }

            const placement = (Array.isArray(source.placements) ? source.placements : [])
                .find((entry) => entry && entry.publicationId === subject.publicationId) || null;
            const snapshotPosition = placement ? placement.position : null;

            const retain = this._shouldRetain({
                wandererPosition,
                snapshotPosition,
                retentionRadius: this._retentionRadius
            });
            if (retain) {
                continue;
            }

            unregisterMaterializedSnapshotWorldSource(this._registry, subject.contentHash, subject.publicationId);
            this._watched.delete(origin);
            removed.push({ publicationId: subject.publicationId, contentHash: subject.contentHash });
        }

        return Object.freeze(removed);
    }

    // watchedAutomaticSubjects() -> Array<{ publicationId, contentHash }>
    //
    // A read-only, frozen snapshot of every subject currently watched —
    // exposed for tests and diagnostics only; `reconcile()` itself never
    // calls this. Never includes a subject this instance has forgotten
    // (unregistered by a prior `reconcile()` call, or never noted at all).
    watchedAutomaticSubjects() {
        return Object.freeze(Array.from(this._watched.values()).map((subject) => Object.freeze({ ...subject })));
    }
}
