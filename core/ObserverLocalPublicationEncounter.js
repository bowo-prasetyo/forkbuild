// 0.9.552 — Observer-Local Novel Publication Encounter Presentation.
//
// 0.9.551's own audit named exactly one product gap: a Wanderer's own
// walking can drive a genuinely unknown Publication's Snapshot all the way
// through real discovery, resolution, content-hash verification, and local
// materialization, and the pipeline then deliberately stops at
// `SnapshotWorldPlacementOutcome.UNPLACED` — bytes exist locally, but
// nothing is ever presented to the Wanderer who triggered it. Section E of
// that audit compared three spatial-semantics models and named "Model 3 —
// Observer-local encounter" as the one this milestone builds: the Wanderer
// who discovered the material sees it, scoped to their own session,
// without treating the publisher's own `claimedPosition` as a commitment
// to World placement.
//
// A VERIFIED PUBLICATION IS LEGITIMATE MATERIAL, BUT ITS `claimedPosition`
// IS NOT AUTHORITATIVE WORLD STATE. This file draws exactly that line, in
// code:
//
//   PlacementRecord              = persistent shared spatial state
//                                   (core/PlacementRecord.js, unchanged)
//   ObserverLocalPublicationEncounter = ephemeral observation of
//                                        already-verified, already-
//                                        materialized discovered material
//                                        ★ (THIS)
//
// `describeObserverLocalPublicationEncounter()` NEVER CREATES A
// `PlacementRecord`, NEVER MODIFIES A PLACEMENT REGISTRY, NEVER MAKES
// `claimedPosition` AUTHORITATIVE, AND NEVER TOUCHES ANY SHARED STATE OF
// ANY KIND. It is a pure, deterministic, `Object.freeze()`'d transform —
// the same restraint core/WorldEncounter.js's own `describeEncounterablePublication()`
// already holds one concept over — of arguments a caller already has in
// hand. It performs no I/O, calls no PlacementRegistry, no
// WorldDiscoverySourceRegistry, and no storage of any kind.
//
// `position` IS THE OBSERVER'S OWN ENCOUNTER POSITION, NEVER THE
// PUBLISHER'S `claimedPosition`. 0.9.551 Section F found the Wanderer's own
// physical position at the moment of discovery ("P") is not the same fact
// as a publisher's self-reported `claimedPosition` ("Q"), and that this
// pipeline has never plumbed P anywhere. This file's own `encounterPosition`
// parameter IS P, supplied by whichever caller actually knows where the
// observing Wanderer stood when the underlying candidate was processed —
// this file never reads, accepts, or falls back to a `claimedPosition` of
// any kind; the field does not even appear in this file's own parameter
// list. An untrustworthy claim (`claimedPosition = (999999, 999999)`, per
// 0.9.551 Section G's own adversarial case) therefore has no way to reach
// this file's own `position` at all — it is never consulted, not merely
// distrusted.
//
// IDENTITY IS `publicationId` + `contentHash`, EXACTLY LIKE THE CASCADE'S
// OWN PROCESSING IDENTITY — NEVER A `documentId`, A `locator`, OR
// `claimedPosition` ITSELF. See application/AutomaticSnapshotEncounterCascade.js's
// own header, "processing identity: publicationId + contentHash." This
// file reuses that same identity verbatim rather than inventing a third
// name for the same two facts.
//
// A MISSING OR INVALID `encounterPosition` MEANS NO ENCOUNTER, NEVER A
// FABRICATED ONE. Exactly like core/WorldEncounter.js's own `planePosition()`
// helper, a position missing any finite `x`/`y`/`z` component returns
// `null` from the whole function — there is no "encounter with an unknown
// position" degenerate case rendered anywhere.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Reputation, publisher trust scores, spatial voting, or community
//   validation of any kind.** This file names an observation, never a
//   judgment about the publisher who made it possible.
// - **Automatic promotion to a `PlacementRecord`.** See this file's own
//   header, above — no code path in this file ever constructs, reads, or
//   references `core/PlacementRecord.js`.
// - **Persistence of any kind.** Nothing here is ever passed to a
//   `StorageProvider`; a caller holding a described encounter is the
//   entire lifetime of that encounter as far as this file is concerned —
//   see application/ObserverLocalEncounterStore.js for the one place a
//   caller may choose to hold onto one for longer than a single call.
// - **Cross-Wanderer sharing, gossip, or synchronization.** This file
//   never reads or writes a registry of any kind — see this file's own
//   header, "no I/O." Whether an encounter is ever seen by anyone but the
//   Wanderer who produced it is entirely a fact about which store (if any)
//   a caller chooses to hand a described encounter to, never a fact this
//   file decides.
// - **Ranking, proximity, or "nearest" of any kind.** Unaffected by this
//   milestone.

export const ObserverLocalPublicationEncounterKind = Object.freeze({
    OBSERVER_LOCAL_PUBLICATION_ENCOUNTER: 'OBSERVER_LOCAL_PUBLICATION_ENCOUNTER'
});

function finitePosition(position) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
        return null;
    }
    return Object.freeze({ x: position.x, y: position.y, z: position.z });
}

// describeObserverLocalPublicationEncounter({ publicationId, contentHash,
//   encounterPosition }) -> frozen encounter | null
//
// `publicationId`/`contentHash` — required, non-empty strings; the SAME
//   processing identity a caller (application/AutomaticSnapshotEncounterCascade.js)
//   already reached VERIFIED + MATERIALIZED for.
// `encounterPosition` — required, an `{x,y,z}` with three finite
//   components — the OBSERVER's own World position, never a publisher's
//   `claimedPosition`. See this file's own header.
//
// Returns `null`, never throws, when any required field is missing or
// malformed — there is no partially-described encounter.
export function describeObserverLocalPublicationEncounter({ publicationId, contentHash, encounterPosition } = {}) {
    if (typeof publicationId !== 'string' || publicationId.length === 0) {
        return null;
    }
    if (typeof contentHash !== 'string' || contentHash.length === 0) {
        return null;
    }
    const position = finitePosition(encounterPosition);
    if (!position) {
        return null;
    }
    return Object.freeze({
        kind: ObserverLocalPublicationEncounterKind.OBSERVER_LOCAL_PUBLICATION_ENCOUNTER,
        publicationId,
        contentHash,
        position
    });
}
