import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { sha256Hex } from '../../../core/Sha256.js';

// 0.8.84 — Durable Publication Archive Fingerprint.
//
// 0.8.82 made a `PublicationObservationArchive` portable — it can leave one
// browser and re-enter another. 0.8.83 taught that portable archive to say
// WHERE each fact it holds entered it. Neither ever answered a third,
// simpler question a person asks the moment an archive becomes portable:
// once this archive has left the browser, how does a person tell whether
// what came back is the SAME durable archive?
//
//   PublicationObservationArchive
//        │  toJSON()                                (0.8.75, unchanged)
//        ▼
//   { ...six factual collections, six provenance collections,
//     archiveImportEvents }
//        │
//        │  THIS FILE — strip archiveImportEvents, canonicalize, hash
//        ▼
//   fingerprintPublicationObservationArchive()
//        │
//        ▼
//   a 64-character lowercase SHA-256 hex digest
//
// AN ARCHIVE FINGERPRINT IDENTIFIES THE EXACT DURABLE FACTS REPRESENTED BY
// AN ARCHIVE; IT DOES NOT AUTHENTICATE THEIR ORIGIN OR ESTABLISH THEIR
// TRUTH — THE FLAGSHIP INVARIANT, restated everywhere this module is used.
// Two archives fingerprint identically if and only if their canonical
// content is byte-identical. That is ALL a matching fingerprint means. It
// is never described as "verified," "authentic," or "trusted" anywhere in
// this codebase — see docs/Principles.md, "The UI Displays Observations;
// It Does Not Turn Them Into A Verdict (0.8.57)," held here once more, one
// layer over an entire archive's own identity rather than over a single
// observation. A matching fingerprint says two replicas hold the same
// bytes; it says nothing about whether either replica's own facts are
// correct.
//
// REUSES `toJSON()`'S OWN CANONICAL SERIALIZATION — NO SECOND SCHEMA. This
// file invents no `toFingerprintJSON()`, no competing field order, no
// second notion of "the archive's own shape." `PublicationObservationArchive.js`'s
// own `toJSON()` already serializes deterministically — identical facts,
// identical field order, identical output, every time (see that method's
// own header) — so this file's only job is to hash exactly that output,
// minus one field (below).
//
// EXCLUDES `archiveImportEvents` — INGESTION METADATA, NOT FACTUAL
// CONTENT. `archiveImportEvents` records WHEN this replica happened to
// import an archive (see application/publication/observationArchive/PublicationObservationArchive.js's
// own header, 0.8.83) — a fact about this replica's own history with the
// archive, not about the durable publication facts the archive
// represents. Two replicas holding the identical facts and identical
// provenance, but that imported them at different moments (or a different
// number of times), would otherwise fingerprint differently for a reason
// that has nothing to do with what either replica actually knows. Every
// other field `toJSON()` produces — all six factual collections AND all
// six parallel provenance collections — participates in the fingerprint
// unchanged. Provenance is deliberately INCLUDED: 0.8.83 made provenance
// itself durable archive data, and an archive whose facts are IMPORTED is
// not the SAME durable archive as one whose identical-looking facts are
// LOCAL — see this file's own flagship test for the demonstration.
//
// SYNCHRONOUS, PURE, DETERMINISTIC. `fingerprintPublicationObservationArchive()`
// reads no clock, touches no storage, and performs no network operation —
// calling it twice on byte-identical input produces a byte-identical
// digest. SHA-256 comes from core/Sha256.js rather than the browser's own
// `crypto.subtle.digest()` — that API is Promise-only, and a fingerprint
// computed for display alongside every other synchronous `describeXxx()`
// projection has no honest use for an asynchronous one.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No signing, no public/private
// keys, no "trusted archive" vocabulary, no remote notarization, no
// blockchain anchoring of the fingerprint itself, no automatic
// publication or comparison of a fingerprint, no automatic
// synchronization, no archive merging. A fingerprint answers exactly one
// question — "what exact durable archive state does this replica
// currently represent?" — with a deterministic hash, and stops there.
// Comparing two fingerprints (pasted, or against a second imported
// archive) is explicitly left for a later, separately sized milestone —
// see docs/Roadmap.md, 0.8.84, "Deliberately excluded."
export const PublicationObservationArchiveFingerprintAlgorithm = 'SHA-256';

// `archive` must be a real `PublicationObservationArchive` instance — this
// function performs no duck-typing, mirroring application/
// PublicationObservationArchiveExport.js's own `exportPublicationObservationArchive()`
// contract exactly. Returns a 64-character lowercase hex SHA-256 digest of
// the archive's own canonical content (every field `toJSON()` produces,
// except `archiveImportEvents`). Never throws for a well-formed archive;
// never mutates it.
export function fingerprintPublicationObservationArchive(archive) {
    if (!(archive instanceof PublicationObservationArchive)) {
        throw new Error('fingerprintPublicationObservationArchive() requires a PublicationObservationArchive');
    }
    const canonicalContent = canonicalArchiveFingerprintContent(archive);
    return sha256Hex(canonicalContent);
}

// The exact string this module hashes — exposed for nothing outside this
// file; kept as its own function only so `fingerprintPublicationObservationArchive()`
// itself stays a one-line "canonicalize, then hash."
function canonicalArchiveFingerprintContent(archive) {
    const { archiveImportEvents, ...factualAndProvenanceContent } = archive.toJSON();
    return JSON.stringify(factualAndProvenanceContent);
}
