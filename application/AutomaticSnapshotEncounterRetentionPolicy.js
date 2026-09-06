import { isWithinRadius } from '../core/SpatialQuery.js';

// 0.9.189 — Automatic Snapshot Encounter Retention Policy.
//
// 0.9.186 taught the Wanderer's own movement to DISCOVER Snapshot
// candidates automatically; 0.9.187 taught that same movement to CASCADE a
// discovered candidate all the way to a registered World source; 0.9.188
// audited that cascade under combined, concurrent, real-world load and
// found it sound, but deliberately left one question unanswered (see that
// file's own closing "Recommendation" — automatic REGISTRATION now exists,
// automatic RETENTION does not): once an automatically-cascaded Snapshot
// is registered, nothing yet asks whether it still belongs in the World
// once the Wanderer has moved on. This file is the answer to that ONE
// question, and nothing more — a pure spatial policy, not a lifecycle
// system:
//
//   Wanderer's current World position
//        │
//        │           an already-registered automatic Snapshot's own
//        │                │        World position (its PLACE, unchanged
//        │                │        since 0.9.159 — never re-derived here)
//        ▼                ▼
//   shouldRetainAutomaticSnapshotEncounter({ wandererPosition,
//       snapshotPosition, retentionRadius })   ★ (THIS)
//        │
//        ▼
//   true (KEEP) | false (REMOVE)
//
// A PURE FUNCTION — NO I/O, NO REGISTRY, NO SNAPSHOT IDENTITY OF ANY KIND.
// This file never imports Nostr, Arweave, a Publication, a ContentReference,
// `application/WorldDiscoverySourceRegistry.js`, or
// `application/MaterializedSnapshotWorldDiscoveryBridge.js`. It reads
// exactly two positions and one radius, and answers exactly one spatial
// question. Nothing here discovers, materializes, registers, or
// unregisters anything — it decides only whether an ALREADY-REGISTERED
// automatic Snapshot's own position is still close enough to matter,
// leaving what (if anything) a caller does with that answer to a later,
// separate, unscheduled milestone (see this file's own header,
// "Deliberately excluded," below).
//
// RETENTION IS NEVER VISIBILITY. This function does not ask "is this
// Snapshot currently on screen," "is it inside the camera frustum," or
// "is it within streaming/rendering distance" — those remain
// `core/WorldEncounter.js`'s and the renderer's own downstream questions,
// entirely untouched by this milestone. It asks only whether an
// automatically materialized Snapshot is still within the retention
// region drawn around the Wanderer's OWN current position — a narrower,
// prior, and deliberately different question from "can I currently see
// it." A Snapshot can fail retention long before it would ever have left
// the screen, and pass retention while nowhere near visible (e.g. behind
// the Wanderer, or occluded) — both are fine, because this function was
// never asked about visibility in the first place.
//
// THE THRESHOLD REUSES THE SAME `streamingRadius`-DERIVED DEFAULT
// `application/ShouldRefreshSnapshotDiscovery.js` ALREADY ESTABLISHED,
// RATHER THAN INVENTING A NEW ARBITRARY NUMBER. That file's own header
// explains why 100 is the right order of magnitude: it already names the
// area a Wanderer's current position is treated as "nearby" for. This file
// declares its own copy, for the identical reason that file's own header
// gives for declaring its own rather than importing
// `core/WorldSpatialContext.js`'s internal default — the two are
// independent constants that happen to agree today, not a shared
// reference a future change to one would silently move the other.
//
// GRACEFUL NON-REMOVAL UNDER UNCERTAINTY — NEVER "WHEN IN DOUBT, DELETE."
// A missing/malformed `wandererPosition` or `snapshotPosition` (not an
// object, or any of `x`/`y`/`z` not a finite number), or a malformed
// `retentionRadius` (not a finite number, or negative), makes the spatial
// question itself unanswerable — this function treats "cannot be
// evaluated" as KEEP, never as REMOVE. An automatically registered
// Snapshot is comparatively expensive to have reached (discovery,
// resolution, verification, materialization, placement, registration —
// the ENTIRE 0.9.150-0.9.187 chain); losing it to a transient malformed
// reading, rather than to an actual, confidently-computed "too far away,"
// would be a strictly worse failure mode than leaving one extra source
// registered a little longer than ideal. `retentionRadius` of exactly `0`
// is NOT malformed — it is a legitimate, maximally strict policy ("retain
// only an exact position match") and is evaluated normally.
//
// EXACTLY ON THE RADIUS RETAINS — THE SAME INCLUSIVE BOUNDARY
// `core/SpatialQuery.js#isWithinRadius()` ITSELF ALREADY HOLDS. This file
// reuses that exact primitive rather than reimplementing Euclidean
// distance a second time; a Snapshot sitting at precisely `retentionRadius`
// meters away is retained, not removed, the identical convention every
// other radius membership test in this codebase already follows.
//
// IDENTITY-BLIND BY CONSTRUCTION. This function's ONLY inputs are two
// positions and a radius — it never receives, and could not possibly be
// influenced by, a `contentHash`, `publicationId`, locator, storage
// backend, or Nostr event id. Two co-existing Snapshot content revisions
// for the SAME Publication (0.9.188's own Section E finding — "One
// Publication can have multiple Snapshot content revisions, and both can
// register simultaneously") remain two entirely independent calls, one per
// revision's own registered position, never collapsed or compared against
// each other. Calling this function once per registered automatic
// Snapshot source, however many there are and however they came to be
// registered, is the whole contract.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Actually unregistering anything.** This file answers KEEP/REMOVE; it
//   never calls `application/MaterializedSnapshotWorldDiscoveryBridge.js#
//   unregisterMaterializedSnapshotWorldSource()`, never touches
//   `application/WorldDiscoverySourceRegistry.js`, and is never invoked
//   from `application/AutomaticSnapshotEncounterCascade.js`. Connecting
//   this policy to that existing unregister bridge is exactly the
//   "Runtime integration" seam this milestone's own recommendation names
//   as separate, later, unscheduled work.
// - **A new Snapshot lifecycle vocabulary.** No `ACTIVE`/`STALE`/
//   `EXPIRED`/`RETIRED`/`LOST`/`REMOVED` enum of any kind — the existing
//   World source registry already gives "registered -> unregistered" as
//   its own sufficient primitive; this file returns a plain boolean, not a
//   new state.
// - **TTL, timestamps, retry, popularity/ranking, trust, automatic
//   rediscovery, or automatic re-materialization of any kind.** This
//   function is called fresh each time with two CURRENT positions; it
//   holds no memory of a previous call and no notion of elapsed time.
// - **Deduplication across Publications or content revisions.** See
//   "identity-blind by construction," above — this file has no identity
//   to deduplicate BY in the first place.
// - **Consuming a claimed position.** `snapshotPosition` is expected to be
//   an already-AUTHORITATIVE World position — exactly
//   `resolveSnapshotWorldPlacement()`'s own `PLACED` result's `position`
//   (0.9.159) — never a discovery candidate's own unverified
//   `claimedPosition` (`application/SnapshotWorldPositionClaim.js`,
//   0.9.172). This file has no way to tell the difference on its own; a
//   caller supplying a claimed position instead of a placed one is a
//   caller error this function cannot detect, the same restraint
//   `resolveSnapshotWorldPlacement()` itself already documents for its own
//   `placementInfo` argument.
export const DEFAULT_AUTOMATIC_SNAPSHOT_RETENTION_RADIUS = 100;

function isFinitePosition(position) {
    return !!position
        && typeof position === 'object'
        && Number.isFinite(position.x)
        && Number.isFinite(position.y)
        && Number.isFinite(position.z);
}

function isValidRadius(radius) {
    return Number.isFinite(radius) && radius >= 0;
}

// shouldRetainAutomaticSnapshotEncounter({ wandererPosition,
//   snapshotPosition, retentionRadius }) -> boolean.
//
// `wandererPosition`  — the Wanderer's own current World position, `{x,y,z}`.
// `snapshotPosition`  — an already-registered automatic Snapshot's own
//                        authoritative World position, `{x,y,z}` — see
//                        this file's own header, "consuming a claimed
//                        position," above.
// `retentionRadius`   — how far from `wandererPosition` a Snapshot may sit
//                        and still be retained. Optional, defaults to
//                        `DEFAULT_AUTOMATIC_SNAPSHOT_RETENTION_RADIUS`.
//
// Returns `true` (KEEP) when either position is missing/malformed, or
// `retentionRadius` is malformed (see "graceful non-removal," above), or
// when the Euclidean distance between the two positions is at most
// `retentionRadius`. Returns `false` (REMOVE) only when both positions are
// well-formed, `retentionRadius` is well-formed, and that distance
// genuinely exceeds it.
export function shouldRetainAutomaticSnapshotEncounter({
    wandererPosition,
    snapshotPosition,
    retentionRadius = DEFAULT_AUTOMATIC_SNAPSHOT_RETENTION_RADIUS
} = {}) {
    if (!isFinitePosition(wandererPosition) || !isFinitePosition(snapshotPosition) || !isValidRadius(retentionRadius)) {
        return true;
    }
    return isWithinRadius(snapshotPosition, wandererPosition, retentionRadius);
}
