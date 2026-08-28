import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import {
    PublicationObservationArchiveFingerprintAlgorithm,
    fingerprintPublicationObservationArchive
} from './PublicationObservationArchiveFingerprint.js';

// 0.8.84 — Durable Publication Archive Fingerprint.
//
// application/PublicationObservationArchiveFingerprint.js's own
// `fingerprintPublicationObservationArchive()` is the pure algorithm —
// strict about its input, mirroring application/
// PublicationObservationArchiveExport.js's own `exportPublicationObservationArchive()`
// contract (throws for a non-archive). This file is the read-only
// projection a UI actually binds to, mirroring exactly how application/
// PublicationObservationArchiveProvenanceView.js already separates that
// archive's own storage/algorithm shape from its own narration (0.8.83).
//
// A NON-ARCHIVE INPUT NEVER THROWS. Anything that is not a genuine
// `PublicationObservationArchive` instance is treated as
// `PublicationObservationArchive.empty()`, the identical restraint every
// other `describeXxx(archive)` projection in this codebase already holds.
//
// NO VERIFICATION VOCABULARY. This projection exposes exactly the digest
// and the algorithm name that produced it — never "verified," "authentic,"
// "trusted," or "valid." See application/
// PublicationObservationArchiveFingerprint.js's own header for the
// flagship invariant this restraint exists to hold.
//
// Pure and stateless: no constructor, no network access, no storage
// access of its own. Calling this twice with the byte-identical archive
// returns a byte-identical result.
export function describePublicationObservationArchiveFingerprint(archive) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();

    return Object.freeze({
        fingerprint: fingerprintPublicationObservationArchive(safeArchive),
        algorithm: PublicationObservationArchiveFingerprintAlgorithm
    });
}
