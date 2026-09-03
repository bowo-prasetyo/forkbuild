// 0.9.112 — Publication Provenance in World View.
//
// 0.9.111 made a decentralized-discovered Publication render through the
// EXACT SAME Material/Verification markup a local, selection-driven
// inspection already uses (see `application/DiscoverWorldEncounterPublicationCommand.js`'s
// own header, "the existing inspection mechanism stays canonical"). That
// convergence created a new question neither `materialInspection` nor
// `discoveryResult.inspection` answers on its own: WHERE did this
// particular inspected material come from? This file is the small,
// additive fact that answers exactly that question — nothing more.
//
//   LOCAL          — this observation reached `inspectWorldEncounterMaterial()`
//                     through the origin-routed loading boundary (0.9.21) —
//                     `materialSources.local`/`.peer`, no resolved
//                     decentralized lead involved.
//   DECENTRALIZED  — this observation reached `inspectWorldEncounterMaterial()`
//                     through the lead-aware loading boundary (0.9.34) — a
//                     resolved Arweave/Nostr lead (0.9.28) actually drove
//                     the load.
//
// THIS IS NOT A TRUST STATE, A NEW DISCOVERY STATUS, OR A NEW VERIFICATION
// STATUS — IT IS A FACT ABOUT THE CURRENT OBSERVATION. Provenance describes
// which loading boundary produced the material being looked at; it says
// nothing about whether that material is genuine, current, preferred, or
// well-formed. `Origin: DECENTRALIZED` alongside `Verification: REJECTED`
// is exactly as coherent as `Origin: LOCAL` alongside `Verification:
// VERIFIED` — see docs/Principles.md, "The UI Displays Observations; It
// Does Not Turn Them Into A Verdict (0.8.57)," held here once more, one
// layer over Origin/Discovery/Material/Verification's own independence.
// There is no `trust`, `rank`, `preferred`, `reliable`, `freshness`, or
// `quality` field anywhere near this concept, and there never will be.
//
// DELIBERATELY TWO VALUES, NEVER MORE. No "peer" origin (a peer-sourced
// selection is still reached through the SAME origin-routed loading
// boundary 0.9.21 already treats uniformly — see that file's own header,
// "`origin === 'local'` and `origin.startsWith('peer:')`" — this file draws
// its own line one layer up, at the loading boundary itself, not at the
// underlying `WorldDiscoverySource` a selection happened to name), no third
// "unknown" bucket, no per-service breakout (Arweave vs. Nostr) — see
// `application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js`'s
// own `discovery` field for that visibility instead, unchanged by this
// file.
//
// DERIVED FROM AN EXISTING FACT, NEVER A NEW ONE THIS FILE INVENTS.
// `describePublicationMaterialProvenanceFromInspection()` reads exactly one
// already-existing signal — `inspectWorldEncounterMaterial()`'s own `lead`
// field (0.9.39, unmodified): non-null only when a caller supplied a
// resolved decentralized lead, which is itself only ever true when 0.9.28's
// own resolution — or 0.9.40's own Wanderer choice among its candidates —
// produced one. This file adds no query, no registry read, and no second
// resolution of its own; it is a pure, synchronous label over a fact that
// already exists.
//
// NO MATERIAL, NO PROVENANCE. `describePublicationMaterialProvenanceFromInspection(null)`
// returns `null`, exactly mirroring `materialInspection`'s/`discoveryResult.inspection`'s
// own "null until there is something to report" restraint — provenance is
// an observation-context fact, and there is no observation without an
// inspection to attach it to.
//
// NEVER MUTATES THE UNDERLYING inspection/material/Publication.
// `describePublicationMaterialProvenance()` returns a brand-new, frozen
// `{ origin }` object; it never writes an `origin`/`provenance` field onto
// `inspection`, `inspection.loading.material`, or any `Publication` domain
// object — provenance belongs to the observation, never to the Publication's
// own intrinsic identity. A caller holds both values side by side.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Source ranking, a "preferred" source, or an automatic fallback
//   between LOCAL and DECENTRALIZED.** Both paths stay entirely
//   independent, exactly as 0.9.111 already left them.
// - **A third origin value, a per-service (Arweave/Nostr) origin, or a
//   peer-reputation/trust field of any kind.** See "deliberately two
//   values, never more," above.
// - **Persisting provenance history, or attaching it to anything beyond
//   the current, in-memory observation.** This file returns a plain frozen
//   value; nothing here writes to a `StorageProvider`.
// - **Changing `WorldEncounterMaterialInspection.js`'s own return shape,
//   `DiscoverWorldEncounterPublicationCommand.js`'s own pass-through
//   contract, or any discovery/verification status vocabulary.** This file
//   is purely additive, read alongside those unmodified results.

export const PublicationMaterialProvenanceOrigin = Object.freeze({
    LOCAL: 'LOCAL',
    DECENTRALIZED: 'DECENTRALIZED'
});

const VALID_ORIGINS = Object.freeze(Object.values(PublicationMaterialProvenanceOrigin));

export function isValidPublicationMaterialProvenanceOrigin(value) {
    return VALID_ORIGINS.includes(value);
}

// describePublicationMaterialProvenance(origin) -> { origin } | null.
//
// The one fact this file exists to produce — nothing but the origin itself.
// Returns a frozen, brand-new `{ origin }` object for a genuine
// `PublicationMaterialProvenanceOrigin` value, or `null` for anything else
// (including `undefined`/`null`) — malformed input never throws, mirroring
// every other `describeXxx()` projection in this codebase.
export function describePublicationMaterialProvenance(origin) {
    if (!isValidPublicationMaterialProvenanceOrigin(origin)) {
        return null;
    }
    return Object.freeze({ origin });
}

// describePublicationMaterialProvenanceFromInspection(inspection) -> { origin } | null.
//
// Derives provenance from an already-computed `inspectWorldEncounterMaterial()`
// result (0.9.39's own `{ selection, lead, loading, verification }` shape) —
// see this file's own header, "derived from an existing fact." `null` when
// `inspection` itself is `null`/`undefined` — see "no material, no
// provenance," above. Never reads `inspection.loading`/`.verification`, and
// never mutates `inspection` in any way.
export function describePublicationMaterialProvenanceFromInspection(inspection) {
    if (!inspection) {
        return null;
    }
    return describePublicationMaterialProvenance(
        inspection.lead ? PublicationMaterialProvenanceOrigin.DECENTRALIZED : PublicationMaterialProvenanceOrigin.LOCAL
    );
}
