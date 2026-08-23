// 0.2.94 — World View Location & Navigation.
// 0.3.7 — World Landmarks & Personal Waypoints: added LANDMARK kind.
// 0.5.0 — World Regions & Decentralized Place Naming: added REGION kind.
// 0.5.6 — Geographic Place Navigation & Arrival: added GEOGRAPHIC_PLACE kind.
//
// The closed vocabulary for what a WorldLocation (core/WorldLocation.js)
// actually IS. Deliberately narrow: only the kinds this milestone
// can back with a real, derivable position ship here.
//
//   ORIGIN           — the world's one conventional starting point,
//                       (0,0,0). Not derived from any document; always
//                       exists.
//   STRUCTURE        — a persisted core/StructurePlacement.js instance,
//                       whose id/position already have durable identity
//                       (see StructurePlacement's own header) — a
//                       naturally navigable destination with nothing
//                       new to invent.
//   LANDMARK         — an explicit core/WorldLandmark.js instance,
//                       created by users to mark a place of interest.
//                       Unlike ORIGIN and STRUCTURE, a LANDMARK is not
//                       derived from other state; it IS the stored
//                       state — see docs/Principles.md, "A Landmark Is
//                       World Content, Not Spatial Presence (0.3.7)".
//   REGION           — an explicit core/WorldRegion.js instance, a
//                       named AREA rather than a single point.
//                       Navigable to its CENTER, exactly like a
//                       LANDMARK is navigable to its own point — see
//                       docs/Principles.md, "Users Name Places; The
//                       World Derives Geography From Names (0.5.0)".
//   GEOGRAPHIC_PLACE — a DERIVED destination, never World content: a
//                       core/GeographicPlaceView.js candidate identity,
//                       navigable to its own deterministic
//                       representative region (see
//                       core/GeographicPlaceNavigation.js#
//                       deriveGeographicPlaceNavigationTarget()). There
//                       is deliberately no WorldGeographicPlace in
//                       core/World.js for this kind to point at — see
//                       docs/Principles.md, "A Geographic Place Is
//                       Navigable; It Does Not Become World Content
//                       (0.5.6)".
export const WorldLocationKind = Object.freeze({
    ORIGIN: 'origin',
    STRUCTURE: 'structure',
    LANDMARK: 'landmark',
    REGION: 'region',
    GEOGRAPHIC_PLACE: 'geographic_place'
});

export function isValidWorldLocationKind(kind) {
    return Object.values(WorldLocationKind).includes(kind);
}
