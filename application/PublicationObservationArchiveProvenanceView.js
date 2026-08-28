import { PublicationObservationArchive } from './PublicationObservationArchive.js';

// 0.8.83 — Publication Archive Provenance & Imported-Fact Boundary.
//
// application/PublicationObservationArchive.js itself already holds every
// fact this view reads — `localFactCount`, `importedFactCount`, and
// `archiveImportEvents` are that class's own getters, read through
// unchanged. This file is the read-only projection over them a UI
// actually renders — mirroring exactly how application/
// PublicationObservationArchiveView.js's own
// `describePublicationObservationArchive()` already separates that
// archive's own storage shape from its own narration (0.8.75).
//
// A SEPARATE VIEW, DELIBERATELY NEVER MERGED INTO
// `describePublicationObservationArchive()`. That function's own summary —
// `publicationCount`, `observationCount`, the reconstructed cross-domain
// `entries` — is computed ENTIRELY from the six factual collections, and
// stays that way: it takes no dependency on this file, and this milestone
// changes not one line of it. Two archives holding identical facts but
// different provenance produce byte-identical output from THAT function,
// and only THIS one differs between them — see docs/Principles.md,
// "Provenance Describes Where A Fact Entered This Archive; It Does Not
// Establish Whether The Fact Is True (0.8.83)," "Derived Evidence Ignores
// Provenance."
//
// NO HEALTH, NO TRUST, NO PERCENTAGE. This projection exposes exactly two
// counts and a plain list of import events — never a ratio, a "freshness"
// score, or any field suggesting an archive with more `IMPORTED` facts is
// somehow worse than one with more `LOCAL` facts. See application/
// PublicationObservationArchiveProvenance.js's own header for why that
// restraint exists at all.
//
// A NON-ARCHIVE INPUT NEVER THROWS. Anything that is not a genuine
// `PublicationObservationArchive` instance is treated as
// `PublicationObservationArchive.empty()`, the identical restraint
// `describePublicationObservationArchive()` already holds.
//
// Pure and stateless: no constructor, no network access, no storage
// access of its own. Calling this twice with the byte-identical archive
// returns a byte-identical result.
export function describePublicationObservationArchiveProvenance(archive) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();

    return Object.freeze({
        localFactCount: safeArchive.localFactCount,
        importedFactCount: safeArchive.importedFactCount,
        totalFactCount: safeArchive.totalFactCount,
        archiveImportCount: safeArchive.archiveImportEvents.length,
        archiveImportEvents: safeArchive.archiveImportEvents.map((event) => Object.freeze({
            importedAt: event.importedAt,
            importedArchiveSchemaVersion: event.importedArchiveSchemaVersion,
            importedEntryCount: event.importedEntryCount
        }))
    });
}
