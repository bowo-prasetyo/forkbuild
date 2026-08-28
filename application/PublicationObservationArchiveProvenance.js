// 0.8.83 — Publication Archive Provenance & Imported-Fact Boundary.
//
// 0.8.82 made a `PublicationObservationArchive` portable — it can leave one
// browser and re-enter another through `application/
// PublicationObservationArchiveExport.js`'s own `exportPublicationObservationArchive()`/
// `importPublicationObservationArchive()`. That created a question 0.8.75
// through 0.8.82 never had to answer: once an archive can hold facts this
// replica observed itself AND facts that arrived through an import, how
// does the application tell the two apart?
//
//   LOCAL     — this replica generated the fact through an explicit
//               operation of its own: observing a confirmation, verifying
//               IPFS content, broadcasting, finalizing a publication
//               record.
//   IMPORTED  — the fact entered THIS archive through 0.8.82 archive
//               import.
//
// THIS IS NOT A TRUST SCORE. Provenance describes where a fact entered
// this archive; it does not establish whether the fact is true. An
// `IMPORTED` confirmation observation is not "less trustworthy," "unverified,"
// or "lower confidence" than a `LOCAL` one — it simply arrived at this
// archive by a different route. There is no `verified`, `trusted`,
// `confidence`, `reliable`, or `provider` field anywhere near this
// concept, and there never will be — see docs/Principles.md, "The UI
// Displays Observations; It Does Not Turn Them Into A Verdict (0.8.57),"
// held here once more, one layer over an entire archive's own ingestion
// history rather than over a single observation.
//
// DELIBERATELY TWO VALUES, NEVER MORE. No provider reputation, no
// "verified source," no third "unknown" bucket for facts predating this
// milestone — application/PublicationObservationArchive.js's own
// `fromJSON()` and every `appendXxx()` method default an unlabeled fact to
// `LOCAL`, because a fact this replica is holding in memory or already had
// durably stored, with no recorded import event that produced it, is
// honestly described as "this replica's own."
//
// PROVENANCE DESCRIBES THIS ARCHIVE'S OWN INGESTION, NOT THE ORIGINAL
// FACT'S HISTORY. A confirmation observation minted as `LOCAL` in replica
// A, exported, and imported into replica B becomes `IMPORTED` in B — never
// carried forward as "originally local, but now imported here too."
// Replica B has no way to know, and does not claim to know, how replica A
// itself produced the fact; it only knows how the fact entered B's own
// archive. See application/PublicationObservationArchive.js's own
// `withUniformProvenance()` for where that re-labeling happens.
export const PublicationObservationArchiveProvenanceOrigin = Object.freeze({
    LOCAL: 'local',
    IMPORTED: 'imported'
});

const VALID_ORIGINS = Object.freeze(Object.values(PublicationObservationArchiveProvenanceOrigin));

export function isValidPublicationObservationArchiveProvenanceOrigin(value) {
    return VALID_ORIGINS.includes(value);
}

// A short, human-facing label — "Local" / "Imported" — and nothing more:
// no color, no icon, no severity. Returns `null` for anything that is not
// a genuine provenance origin, mirroring every other `describeXxx()`
// projection in this codebase's own "malformed input never throws"
// restraint.
export function describePublicationObservationArchiveProvenanceOrigin(origin) {
    switch (origin) {
        case PublicationObservationArchiveProvenanceOrigin.LOCAL: return 'Local';
        case PublicationObservationArchiveProvenanceOrigin.IMPORTED: return 'Imported';
        default: return null;
    }
}
