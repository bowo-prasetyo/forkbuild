// 0.8.23 — Multi-Placement Convergence & Relationship UX.
//
// 0.8.18 gave a replica somewhere to KEEP the placements it knows about
// (application/LocalPublicationSnapshotPlacementCatalog.js). 0.8.19 gave
// it a way to converge that KNOWLEDGE with other replicas (application/
// PublicationSnapshotPlacementDiscoveryCoordinator.js), 0.8.21 gave it a
// way to keep that knowledge across a restart, and 0.8.22 gave it a
// third way to acquire it, riding inside a Blueprint Package. None of
// those milestones ever asked what a replica can conclude, right now,
// from the placements it already has. This is the first module that
// asks that question, and it answers with a DERIVATION, never a
// decision — the identical shape application/
// PublicationEvidenceConvergence.js (0.8.6) already established for
// anchors:
//
//   LocalPublicationSnapshotPlacementCatalog.findByPublicationId(publicationId)
//                        │
//                        ▼
//        derivePublicationSnapshotPlacementConvergence()   (THIS FILE)
//                        │
//                        ▼
//        { known placements, storage/locator diversity,
//          structural content-binding relationship }
//
// AN ANCHOR ASKS A DIFFERENT QUESTION THAN A PLACEMENT DOES, AND THIS
// FILE IS NOT A COPY-PASTE OF application/PublicationEvidenceConvergence
// .js WITH THE NOUNS SWAPPED. An anchor asks "what external evidence
// claims do I know?" — evidence toward whether something happened, at
// some point, to some content. A placement asks "what locations do I
// know that claim this snapshot is retrievable?" — locators toward
// where bytes can be fetched, right now. That difference shows up
// concretely in what this function reports and what it deliberately
// never asks for:
//
//   1. KNOWN PLACEMENTS      — how many placements, across how many
//                               distinct storage backends and how many
//                               distinct locators, does this replica
//                               have on file for this publicationId? A
//                               pure count over whatever `placements`
//                               the caller supplied (ordinarily its own
//                               catalog's own findByPublicationId() —
//                               but this function never imports or
//                               touches a catalog itself; it is handed a
//                               list, nothing more). STORAGE DIVERSITY
//                               and LOCATOR DIVERSITY are reported
//                               because they are meaningful specifically
//                               for placements — three placements on the
//                               same storage backend, at three different
//                               locators, is a materially different fact
//                               from three placements spread across
//                               three different backends, and neither
//                               has a natural equivalent on the anchor
//                               side (an anchorType is not a locator).
//   2. STRUCTURAL RELATIONSHIP — do these placements' own `contentHash`
//                               values agree with EACH OTHER? Grouped by
//                               contentHash alone, exactly as application/
//                               PublicationEvidenceConvergence.js's own
//                               `contentHashGroups` already groups
//                               anchors — see application/
//                               SnapshotPlacementRelationship.js for the
//                               AGREEMENT/CONFLICT vocabulary this
//                               grouping supports one layer up.
//   3. NO expectedContentHash PARAMETER, AND NO PER-PLACEMENT COMPARISON
//                               AGAINST ONE — deliberately, unlike
//                               application/PublicationEvidenceConvergence
//                               .js's own `expectedContentHash`/
//                               `contentBinding`/`matchingAnchorIds`/
//                               `divergentAnchorIds`. An anchor's whole
//                               reason for existing is to compare against
//                               a publication's own claimed hash — that
//                               is what makes it EVIDENCE. A placement's
//                               reason for existing is to say where bytes
//                               can be fetched; whether those bytes match
//                               what a publication itself claims is a
//                               RESOLUTION question (does the fetched
//                               content hash correctly?), answered
//                               separately and per-placement by
//                               application/SnapshotPlacementResolver.js,
//                               never by this file. See point 4 below.
//   4. NO RESOLUTION OBSERVATION OF ANY KIND, EVEN OPTIONALLY —
//                               deliberately the ONE STRICTER boundary
//                               this file draws than application/
//                               PublicationEvidenceConvergence.js's own:
//                               that function accepts an OPTIONAL
//                               `verificationByAnchorId` map so a
//                               caller's own local verification
//                               observations can ride ALONGSIDE the
//                               structural comparison, on each anchor's
//                               own entry, without ever influencing
//                               `contentBindingConflict` itself. This
//                               function has no equivalent parameter at
//                               all — not even one that would sit inert.
//                               Whether placement A resolved, whether
//                               placement B's store was unavailable,
//                               whether placement C came back with a
//                               hash mismatch: NONE of that is
//                               structural knowledge about what a
//                               placement CLAIMS, and none of it is
//                               capable of reaching this function even
//                               by accident. See application/
//                               SnapshotPlacementResolutionObservation.js
//                               (0.8.20) for where such an observation
//                               DOES live — entirely outside this file,
//                               entirely local, entirely ephemeral — and
//                               docs/Principles.md, "Multi-Placement
//                               Convergence Is Independent Of Resolution
//                               Observation (0.8.23)."
//
// THE CENTRAL RULE — detect, never adjudicate, extended from anchors to
// placements: when two or more cataloged placements for the same
// publicationId carry DIFFERENT contentHash values, this function
// reports that fact (`contentBindingConflict: true`, plus the actual
// grouping in `contentHashGroups`) and stops exactly there. It never
// marks one group "correct," never marks another "false," never picks
// the group with more members, more storage-backend diversity, or more
// resolved placements as the "winning" one, and never emits anything
// resembling a score, a rank, or a confidence value anywhere in its
// return value. See docs/Principles.md, "Evidence Relationships Are
// Derived, Never Adjudicated (0.8.6)," extended here across locators
// instead of evidence.
//
// Pure and stateless: no constructor, no injected dependency, no
// storage, no network, no import of application/
// LocalPublicationSnapshotPlacementCatalog.js or application/
// SnapshotPlacementResolver.js anywhere in this file. Safe to call as
// often as a caller likes, from any layer, and never caches or persists
// its own result.
//
// Placements are deduplicated by their own `id` before anything else is
// computed — the identical identity application/
// LocalPublicationSnapshotPlacementCatalog.js#add() already dedups by.
// Two replicas that both know the SAME placement, or a caller that
// accidentally passes the same placement twice, is exactly one piece of
// knowledge here, never two.
//
// The returned `placements` array is always sorted by `placementId` —
// never by arrival order, receivedAt, or any input ordering. Given the
// identical underlying SET of placements, this function returns a
// byte-identical result regardless of what order its caller happened to
// list `placements` in — the same property that lets several replicas'
// own derived results be compared directly for equality.
export function derivePublicationSnapshotPlacementConvergence({
    publicationId,
    placements = []
} = {}) {
    if (!publicationId || typeof publicationId !== 'string' || !publicationId.trim()) {
        throw new Error('derivePublicationSnapshotPlacementConvergence: a publicationId is required');
    }

    const seenPlacementIds = new Set();
    const entries = [];
    for (const placement of Array.isArray(placements) ? placements : []) {
        if (!placement || !placement.id) continue;
        // Never derives across a publicationId the caller didn't ask
        // about — a caller that passes a mixed list (e.g. a catalog's
        // full list()) gets exactly the same result as one that
        // pre-filtered it.
        if (placement.publicationId !== publicationId) continue;
        // Duplicate placement knowledge is one placement, never two
        // pieces of knowledge — see this file's own header.
        if (seenPlacementIds.has(placement.id)) continue;
        seenPlacementIds.add(placement.id);

        entries.push({
            placementId: placement.id,
            storage: placement.storage,
            locator: placement.locator,
            contentHash: placement.contentHash
        });
    }
    entries.sort((a, b) => (a.placementId < b.placementId ? -1 : a.placementId > b.placementId ? 1 : 0));

    // Structural relationship: do these placements agree with EACH
    // OTHER? Grouped by contentHash alone — never by storage, locator,
    // or anything else — since a content-binding relationship is
    // specifically a question about what bytes a placement claims to
    // make retrievable, not about where or how.
    const groupsByHash = new Map();
    for (const entry of entries) {
        if (!groupsByHash.has(entry.contentHash)) {
            groupsByHash.set(entry.contentHash, []);
        }
        groupsByHash.get(entry.contentHash).push(entry.placementId);
    }
    const contentHashGroups = [...groupsByHash.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([contentHash, placementIds]) => ({ contentHash, placementIds }));

    // Storage diversity and locator diversity — meaningful specifically
    // for placements, with no natural equivalent on the anchor side. See
    // this file's own header, point 1.
    const storageTypes = [...new Set(entries.map((entry) => entry.storage))].sort();
    const locators = [...new Set(entries.map((entry) => entry.locator))].sort();

    return {
        publicationId,
        placementCount: entries.length,
        storageTypes,
        locators,
        locatorCount: locators.length,
        placements: entries,
        contentHashGroups,
        // true the moment more than one DISTINCT contentHash appears
        // among these placements — structural and symmetric, exactly as
        // application/PublicationEvidenceConvergence.js's own
        // `contentBindingConflict` already is for anchors.
        contentBindingConflict: contentHashGroups.length > 1
    };
}
