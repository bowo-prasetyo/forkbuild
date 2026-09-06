import { resolveSnapshotWorldPlacement } from './SnapshotWorldPlacement.js';
import { SnapshotWorldPlacementOutcome } from './SnapshotWorldPlacementOutcome.js';
import { registerMaterializedSnapshotWorldSource } from './MaterializedSnapshotWorldDiscoveryBridge.js';
import { StoreSnapshotContentOutcome } from './StoreSnapshotContentOutcome.js';
import { DecentralizedSnapshotResolutionOutcome } from './DecentralizedSnapshotResolutionOutcome.js';
import { AutomaticSnapshotEncounterCascadeOutcome } from './AutomaticSnapshotEncounterCascadeOutcome.js';

// 0.9.187 — Automatic Snapshot Encounter Cascade.
//
// 0.9.150 through 0.9.172 built DISCOVER -> SELECT -> RESOLVE -> VERIFY ->
// MATERIALIZE -> PLACE -> REGISTER, one proven, independently-tested seam
// at a time — reachable only through a person's own explicit clicks on
// `ui/components/OwnPublicationPanel.js`. 0.9.186 added automatic
// DISCOVERY, driven by a Wanderer's own movement, and deliberately stopped
// there (see `application/WorldSnapshotDiscoveryMonitor.js`'s own header,
// "NEVER A CASCADE... composing background discovery with that chain is a
// separate, later, unscheduled seam"). This file is that seam, and nothing
// more:
//
//   WorldSnapshotDiscoveryMonitor#lastResult   (0.9.186, UNMODIFIED — a
//        │                                      candidate array, exactly
//        │                                      as discoverSnapshotCandidatesCommand()
//        │                                      itself returned it)
//        ▼
//   AutomaticSnapshotEncounterCascade#processCandidate(candidate)   ★ (THIS)
//        │
//        ▼
//   resolveSelectedSnapshotCommand(candidate)   (0.9.152, UNMODIFIED — the
//        │                                       SAME command OwnPublicationPanel's
//        │                                       own "Resolve" button calls)
//        │  DecentralizedSnapshotResolutionOutcome.RESOLVED only
//        ▼
//   materializeSelectedSnapshotCommand(resolution)   (0.9.158, UNMODIFIED
//        │                                            — the SAME command
//        │                                            the "Materialize"
//        │                                            button calls)
//        │  StoreSnapshotContentOutcome.STORED/.ALREADY_AVAILABLE only
//        ▼
//   resolveSnapshotWorldPlacement(materialization, placementInfo)
//        (0.9.159, UNMODIFIED — placementInfo comes from the injected
//         resolvePlacementInfo(publicationId), never a synthesized claim)
//        │  SnapshotWorldPlacementOutcome.PLACED only
//        ▼
//   registerMaterializedSnapshotWorldSource(registry, placement, publication)
//        (0.9.160, UNMODIFIED — the SAME function the "Register" button calls)
//        │
//        ▼
//   { outcome, publicationId, contentHash, reason }
//
// A PURE ORCHESTRATION SEAM — NO NEW OPERATION OF ITS OWN. Every arrow
// above is an existing, already-shipped, already-tested application
// command or pure function, called with the EXACT SAME shape its own
// existing explicit caller already uses. This file contains no discovery,
// no retrieval, no hash verification, no storage, no spatial algorithm,
// and no World-registry mutation logic of its own — it decides only ONE
// thing: given an already-discovered candidate, which of those existing
// operations runs next, in what order, and whether a caller even needed to
// wait for more than one attempt.
//
// A publicationId IS THE PROCESSING SUBJECT, NOT JUST A PLACEMENT
// OPTIMIZATION. `application/SnapshotWorldPositionClaim.js` (0.9.172) gave
// discovery candidates an OPTIONAL `publicationId` for one narrow reason —
// naming which Publication a claimed position belongs to. This file reuses
// the SAME field for a second, independent reason: WITHOUT a
// `publicationId`, this cascade has no way to ask "does an authoritative
// World placement already exist for this candidate," and therefore no way
// to ever reach PLACED/REGISTERED — the manual flow's own equivalent
// question is answered by `this.publication`/`this.placementInfo`, the
// CURRENTLY ACTIVE document a human is looking at; automatic, background
// processing has no such anchor; the candidate's own claimed
// `publicationId` is the only remaining way to know which Publication's
// placement to even ask about. A candidate carrying no `publicationId`
// therefore never becomes a processing subject at all — see
// `application/AutomaticSnapshotEncounterCascadeOutcome.js`'s own
// `INELIGIBLE`, the ONE new value this milestone invents.
//
// `claimedPosition` IS NEVER PROMOTED TO AUTHORITATIVE PLACEMENT HERE —
// THE SAME INVARIANT 0.9.172 ITSELF ALREADY HOLDS. `resolvePlacementInfo`
// (injected) answers "does an ALREADY-KNOWN, ALREADY-AUTHORITATIVE
// WorldPlacement exist for this publicationId" — never a placementInfo
// synthesized from `candidate.claimedPosition`. 0.9.172's own header names
// consuming a claim as "a SEPARATE, explicit click... Automatic
// invocation" among its own "Deliberately excluded" items; this file holds
// that exclusion, not just inherits it by omission — it never imports
// `application/SnapshotWorldPositionClaim.js` and never reads
// `candidate.claimedPosition` at all. A publisher's own claim remains
// exactly what it always was: a claim, never a commitment to place.
// Consequently a materialized Snapshot for a publicationId this replica
// has never itself placed stops at `SnapshotWorldPlacementOutcome.UNPLACED`
// — bytes may now exist locally, but nothing is registered with the
// running World merely because they do.
//
// A FAILURE AT ANY STAGE SIMPLY STOPS — THE STAGE'S OWN OUTCOME, NEVER
// REMAPPED, NEVER RETRIED. Resolution failure (anything but RESOLVED —
// NOT_DISCOVERED, STORE_UNAVAILABLE, CONTENT_UNAVAILABLE,
// CONTENT_HASH_MISMATCH) stops before materialization is ever attempted.
// Materialization failure (HASH_MISMATCH, or any resolver failure passed
// through) stops before placement is ever computed. UNPLACED stops before
// registration is ever attempted. Each terminal result is exactly the
// failing stage's own already-documented outcome value — this file invents
// no `RETRYING`/`FAILED`/`STOPPED` vocabulary of its own to wrap it in.
//
// PROCESSING IDENTITY: `publicationId + contentHash`, NEVER A NOSTR EVENT
// ID, NEVER A NEW SNAPSHOT IDENTITY. `core/ContentReference.js`'s own
// `hash` already names WHAT a Snapshot's bytes are; `publicationId` names
// WHICH Publication they belong to; together they name the ONE processing
// subject this cascade ever needs to recognize as "the same work already
// underway or already done." A Nostr event id (or any other announcement-
// transport identity) is deliberately never consulted — two independent
// announcements of the identical `publicationId`+`contentHash` pair
// coalesce into ONE cascade run regardless of how many times, or under how
// many distinct event ids, they were each separately discovered.
//
// IDEMPOTENT AND CONCURRENCY-SAFE BY CONSTRUCTION — ONE MAP, NO LIFECYCLE
// REGISTRY. `_results` is a `Map<string, Promise<result>>`, purely
// in-memory, for this instance's own lifetime. The FIRST call for a given
// `publicationId:contentHash` key stores its own (never-rejecting) result
// promise in that map before doing anything else observable; every
// SUBSEQUENT call for the SAME key — whether it arrives while the first is
// still in flight (concurrent duplicate discovery) or long after it has
// already settled (repeated discovery on a later observation tick) —
// receives that SAME stored promise back, verbatim, and triggers no
// additional call to `resolveSelectedSnapshotCommand`,
// `materializeSelectedSnapshotCommand`, `resolveSnapshotWorldPlacement`, or
// `registerMaterializedSnapshotWorldSource`. This is "processing identity,"
// never a lifecycle registry: the map answers exactly one question ("has a
// cascade for this subject already been started?") and holds no state
// transitions, no history, and no query surface beyond that.
//
// DISCOVERY ORDER IS NEVER REINTERPRETED. `processCandidate()` takes ONE
// candidate at a time, in whatever order its own caller iterates
// `WorldSnapshotDiscoveryMonitor#lastResult` — no ranking, scoring,
// deduplication-by-preference, or "best candidate" selection of any kind.
// Two DIFFERENT `publicationId`s sharing the identical `contentHash` are
// two entirely independent processing subjects (see
// `tests/SnapshotWorldOriginCollision.test.js`, 0.9.163, for why that
// distinction already matters one seam downstream) and always produce two
// independent cascade runs, never a merge.
//
// NEVER REJECTS. `processCandidate()` mirrors `WorldSnapshotDiscoveryMonitor#
// observe()`'s own restraint: every collaborator call is wrapped so a
// thrown/rejected error from `resolveSelectedSnapshotCommand`/
// `materializeSelectedSnapshotCommand` becomes an `INELIGIBLE` result
// rather than an unhandled rejection propagating to a caller iterating a
// background discovery result — the identical caller-hostility a
// background trigger can never afford.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A UI of any kind.** This file has no idea `ui/` exists beyond the one
//   composition site that constructs and feeds it
//   (`ui/views/WorldView.js`). The existing explicit
//   Resolve/Materialize/Place/Register buttons on `OwnPublicationPanel.js`
//   are UNTOUCHED — manual inspection/recovery/diagnostics remain
//   available exactly as they always were.
// - **Ranking, trust, provider scoring, or "nearest Snapshot" preference of
//   any kind.** See "discovery order is never reinterpreted," above.
// - **Consuming a claimed position automatically.** See "claimedPosition is
//   never promoted," above — 0.9.172's own exclusion, held here again,
//   deliberately, one caller over.
// - **Retry of a failed stage, backoff, or a queue of any kind.** A
//   terminal result is terminal for this cascade instance's own lifetime —
//   see "idempotent... no lifecycle registry," above.
// - **Rendering of any kind.** This file stops at World registration;
//   ordinary `WorldEncounterCanvas` machinery (already subscribed to the
//   SAME `WorldDiscoverySourceRegistry` `registerMaterializedSnapshotWorldSource()`
//   mutates) renders whatever it finds there, entirely unmodified.
// - **A new Snapshot identity, a new lifecycle store, or persistence of
//   `_results` across instances/reloads.** Purely ephemeral orchestration
//   state, exactly as long-lived as the one instance holding it.

// new AutomaticSnapshotEncounterCascade({ resolveSelectedSnapshotCommand,
//   materializeSelectedSnapshotCommand, worldDiscoverySourceRegistry,
//   resolvePlacementInfo, findPublicationById })
//
// `resolveSelectedSnapshotCommand`    — the SAME app-wide `(candidate) ->
//   Promise<{ outcome, bytes, candidates, locator, storage, reason }>`
//   command (application/ResolveSelectedSnapshotCommand.js, 0.9.152)
//   OwnPublicationPanel's own "Resolve" button already calls. `null`/absent
//   leaves this cascade permanently inert (every candidate resolves to
//   INELIGIBLE without ever being examined further) — mirroring
//   `WorldSnapshotDiscoveryMonitor`'s own graceful degradation for a
//   missing `discoverSnapshotCandidatesCommand`.
// `materializeSelectedSnapshotCommand` — the SAME app-wide `(resolution) ->
//   Promise<{ outcome, contentHash, contentReference, reason, source }>`
//   command (application/MaterializeSelectedSnapshotCommand.js, 0.9.158).
//   Same graceful-degradation rule as above.
// `worldDiscoverySourceRegistry`      — the SAME app-wide
//   `WorldDiscoverySourceRegistry` (0.9.9) instance
//   `registerMaterializedSnapshotWorldSource()` already mutates elsewhere.
//   `null`/absent means this cascade can still resolve/materialize/place a
//   candidate, but never registers one — the terminal result stops at
//   whatever `resolveSnapshotWorldPlacement()` itself produced.
// `resolvePlacementInfo(publicationId)` — a synchronous, duck-typed lookup
//   for an ALREADY-AUTHORITATIVE `{ placementId, publicationId, position }`
//   (`resolveSnapshotWorldPlacement()`'s own `placementInfo` shape) for the
//   given publicationId, or a falsy value when none is known. `null`/absent
//   is treated identically to "no placement known" for every publicationId
//   — every candidate then stops at UNPLACED once materialized.
// `findPublicationById(publicationId)` — a synchronous, duck-typed lookup
//   for the actual `Publication` instance a publicationId names, or a
//   falsy value when it is not locally known. Required (alongside a
//   matching `resolvePlacementInfo` result) to ever reach REGISTERED — see
//   `registerMaterializedSnapshotWorldSource()`'s own contract, which needs
//   the real Publication object, never just its id.
export class AutomaticSnapshotEncounterCascade {
    constructor({
        resolveSelectedSnapshotCommand = null,
        materializeSelectedSnapshotCommand = null,
        worldDiscoverySourceRegistry = null,
        resolvePlacementInfo = null,
        findPublicationById = null
    } = {}) {
        this._resolveSelectedSnapshotCommand = resolveSelectedSnapshotCommand;
        this._materializeSelectedSnapshotCommand = materializeSelectedSnapshotCommand;
        this._worldDiscoverySourceRegistry = worldDiscoverySourceRegistry;
        this._resolvePlacementInfo = resolvePlacementInfo;
        this._findPublicationById = findPublicationById;
        this._results = new Map();
    }

    // processCandidate(candidate) -> Promise<{ outcome, publicationId,
    //   contentHash, reason }>. Never rejects.
    //
    // `candidate` is a plain discovery-candidate object — exactly
    // `WorldSnapshotDiscoveryMonitor#lastResult`'s own element shape (`{
    // contentHash, locator, storage, publicationId?, claimedPosition? }`,
    // 0.9.150/0.9.171). Called once per candidate a caller wants driven
    // through the cascade; a caller iterating a discovery result array
    // calls this once per element, in that array's own order.
    //
    // Returns (memoized per `publicationId:contentHash`, see this file's
    // own header, "idempotent and concurrency-safe by construction"):
    //   { outcome: AutomaticSnapshotEncounterCascadeOutcome.INELIGIBLE,
    //     publicationId, contentHash, reason: null } — no contentHash, no
    //     publicationId, or no resolve/materialize command configured.
    //   { outcome: <DecentralizedSnapshotResolutionOutcome value other than
    //     RESOLVED>, publicationId, contentHash, reason } — resolution
    //     itself did not succeed.
    //   { outcome: <materialization's own outcome, other than
    //     STORED/ALREADY_AVAILABLE>, publicationId, contentHash, reason } —
    //     materialization did not succeed.
    //   { outcome: SnapshotWorldPlacementOutcome.UNPLACED, publicationId,
    //     contentHash, reason: null } — materialized, but no authoritative
    //     World placement is known for this publicationId (or no registry/
    //     publication lookup was configured to register one against).
    //   { outcome: SnapshotWorldRegistrationOutcome.REGISTERED,
    //     publicationId, contentHash, reason: null } — the complete
    //     happy path.
    processCandidate(candidate) {
        const contentHash = (candidate && typeof candidate.contentHash === 'string' && candidate.contentHash.length > 0)
            ? candidate.contentHash
            : null;
        const publicationId = (candidate && typeof candidate.publicationId === 'string' && candidate.publicationId.length > 0)
            ? candidate.publicationId
            : null;

        if (!contentHash || !publicationId
            || typeof this._resolveSelectedSnapshotCommand !== 'function'
            || typeof this._materializeSelectedSnapshotCommand !== 'function') {
            return Promise.resolve(this._result(AutomaticSnapshotEncounterCascadeOutcome.INELIGIBLE, publicationId, contentHash));
        }

        const key = `${publicationId}:${contentHash}`;
        const inFlightOrSettled = this._results.get(key);
        if (inFlightOrSettled) {
            return inFlightOrSettled;
        }

        const result = this._run(candidate, publicationId, contentHash)
            .catch((error) => this._result(AutomaticSnapshotEncounterCascadeOutcome.INELIGIBLE, publicationId, contentHash, error && error.message));
        this._results.set(key, result);
        return result;
    }

    async _run(candidate, publicationId, contentHash) {
        const resolution = await this._resolveSelectedSnapshotCommand(candidate);
        if (!resolution || resolution.outcome !== DecentralizedSnapshotResolutionOutcome.RESOLVED) {
            return this._result(
                resolution ? resolution.outcome : AutomaticSnapshotEncounterCascadeOutcome.INELIGIBLE,
                publicationId, contentHash, resolution ? resolution.reason : null
            );
        }

        const materialization = await this._materializeSelectedSnapshotCommand(resolution);
        if (!materialization
            || (materialization.outcome !== StoreSnapshotContentOutcome.STORED
                && materialization.outcome !== StoreSnapshotContentOutcome.ALREADY_AVAILABLE)) {
            return this._result(
                materialization ? materialization.outcome : AutomaticSnapshotEncounterCascadeOutcome.INELIGIBLE,
                publicationId, contentHash, materialization ? materialization.reason : null
            );
        }

        const placementInfo = (typeof this._resolvePlacementInfo === 'function')
            ? (this._resolvePlacementInfo(publicationId) || null)
            : null;
        const placement = resolveSnapshotWorldPlacement(materialization, placementInfo);
        if (placement.outcome !== SnapshotWorldPlacementOutcome.PLACED) {
            return this._result(placement.outcome, publicationId, contentHash, placement.reason);
        }

        if (!this._worldDiscoverySourceRegistry) {
            return this._result(placement.outcome, publicationId, contentHash, placement.reason);
        }
        const publication = (typeof this._findPublicationById === 'function')
            ? (this._findPublicationById(publicationId) || null)
            : null;
        if (!publication || publication.id !== placement.publicationId) {
            return this._result(SnapshotWorldPlacementOutcome.UNPLACED, publicationId, contentHash, null);
        }

        const registration = registerMaterializedSnapshotWorldSource(this._worldDiscoverySourceRegistry, placement, publication);
        return this._result(registration.outcome, publicationId, contentHash, registration.reason);
    }

    _result(outcome, publicationId, contentHash, reason = null) {
        return { outcome, publicationId, contentHash, reason: reason || null };
    }
}
