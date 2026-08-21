// 0.2.94 — World View Location & Navigation.
//
// The closed vocabulary for what a WorldLocation (core/WorldLocation.js)
// actually IS. Deliberately narrow: only the two kinds this milestone
// can back with a real, derivable position ship here.
//
//   ORIGIN    — the world's one conventional starting point, (0,0,0).
//               Not derived from any document; always exists.
//   STRUCTURE — a persisted core/StructurePlacement.js instance, whose
//               id/position already have durable identity (see
//               StructurePlacement's own header) — a naturally
//               navigable destination with nothing new to invent.
//
// LANDMARK, SETTLEMENT, and NATURAL_FEATURE — named in the design
// conversation as the eventual richer vocabulary once natural features
// (core/NaturalFeatureField.js, core/Hydrology.js) grow their own
// derivable identity — are deliberately NOT here yet. Adding them today
// would mean either fabricating a fake "landmark" for every tree/lake
// sample point (there is no such durable identity to name — see
// core/NaturalFeatureField.js's own "sampled, never stored" framing) or
// standing up a persistent location database this milestone explicitly
// chose not to build. See docs/Principles.md, "A World Location Is
// Read From Existing Identity, Never A New Store (0.2.94)."
export const WorldLocationKind = Object.freeze({
    ORIGIN: 'origin',
    STRUCTURE: 'structure'
});

export function isValidWorldLocationKind(kind) {
    return Object.values(WorldLocationKind).includes(kind);
}
