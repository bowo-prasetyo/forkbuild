import { ContentBindingRelationship } from './ContentBindingRelationship.js';

// 0.8.6 — Multi-Evidence Convergence & Evidence Relationship Derivation.
//
// 0.8.2 gave a replica somewhere to KEEP the anchors it knows about
// (application/LocalPublicationAnchorCatalog.js). 0.8.5 gave it a way to
// converge that KNOWLEDGE with other replicas
// (application/PublicationAnchorDiscoveryCoordinator.js) — and drew the
// line this milestone only ever extends, never crosses: "Evidence Set
// Convergence Does Not Imply Truth Convergence" (docs/Principles.md,
// 0.8.5). Neither milestone ever asked what a replica can conclude, right
// now, from the anchors it already has. This is the first module that
// asks that question, and it answers with a DERIVATION, never a
// decision:
//
//   LocalPublicationAnchorCatalog.findByPublicationId(publicationId)
//                        │
//                        ▼
//           derivePublicationEvidenceConvergence()   (THIS FILE)
//                        │
//                        ▼
//        { known evidence, structural relationships, local observations }
//
// Three axes this function reads, and keeps permanently separate:
//
//   1. KNOWN EVIDENCE        — how many anchors, of how many distinct
//                               anchorTypes, does this replica have on
//                               file for this publicationId? A pure count
//                               over whatever `anchors` the caller
//                               supplied (ordinarily its own catalog's
//                               findByPublicationId() — but this function
//                               never imports or touches a catalog
//                               itself; it is handed a list, nothing more)
//   2. STRUCTURAL RELATIONSHIPS — do these anchors' own `contentHash`
//                               values agree with EACH OTHER, and
//                               (optionally) with an `expectedContentHash`
//                               the caller already knows? This is string
//                               comparison, nothing more — see
//                               application/ContentBindingRelationship.js
//   3. LOCAL VERIFICATION OBSERVATIONS — whatever this ONE replica
//                               already determined, locally, by running
//                               application/ExternalAnchorVerifier.js
//                               itself, if it did. `verificationByAnchorId`
//                               is entirely caller-supplied and OPTIONAL;
//                               this function never runs verification
//                               itself, never fetches one, and never
//                               represents another replica's observation
//                               — see this file's own section below on
//                               why that stays true even when several
//                               replicas' derived results are compared
//                               side by side in a test.
//
// THE CENTRAL RULE — detect, never adjudicate: when two or more
// cataloged anchors for the same publicationId carry DIFFERENT
// contentHash values, this function reports that fact
// (`contentBindingConflict: true`, plus the actual grouping in
// `contentHashGroups`) and stops exactly there. It never marks one
// group "correct," never marks the other "false," never picks the
// group with more members as the "winning" one, and never emits
// anything resembling a score, a rank, or a confidence value anywhere
// in its return value. A contentHash with three independent anchors and
// one with a single anchor are reported with their true counts and
// nothing more — see docs/Principles.md, "External Anchoring Provides
// Evidence; It Does Not Establish Authority (0.8.0)," which this
// function extends to MULTIPLE anchors at once, never past it. The
// exact same restraint applies to `verification`: an anchor with three
// entries in `verificationByAnchorId` all reporting VALID is not upgraded
// to any special status here, because those three entries could just as
// easily be three different LOCAL calls this same replica made at three
// different times as they could be three peers' incompatible reports
// smuggled in some future protocol this function has no way to tell
// apart — see the next paragraph for why the latter never happens.
//
// VERIFICATION OBSERVATIONS NEVER CROSS A REPLICA BOUNDARY THROUGH THIS
// FUNCTION. `verificationByAnchorId` is exactly what its name says: a
// plain `{ anchorId: AnchorVerificationOutcome }` map the CALLING replica
// already built by running application/ExternalAnchorVerifier.js itself,
// locally, on anchors it already has. This function has no parameter for
// "which replica observed this," no way to merge two replicas'
// observations into one, and is never called with more than one
// replica's own map at a time — a caller that wants to compare Alice's
// and Bob's independent observations of the identical anchor calls this
// function TWICE, once per replica's own local state, and compares the
// two plain results itself. Nothing added here gossips a verification
// outcome, tallies how many replicas agree, or treats agreement as
// stronger evidence than a single replica's own observation — see
// docs/Principles.md, "Evidence Relationships Are Derived, Never
// Adjudicated (0.8.6)."
//
// Pure and stateless: no constructor, no injected dependency, no
// storage, no network, no import of application/
// LocalPublicationAnchorCatalog.js or application/
// ExternalAnchorVerifier.js anywhere in this file. Safe to call as often
// as a caller likes, from any layer, and never caches or persists its
// own result — the identical "always safe, always re-derives from
// scratch" posture application/PublicationResolutionCoordinator.js's own
// header already holds itself to, one layer further down.
//
// Anchors are deduplicated by their own `id` before anything else is
// computed — the identical identity application/
// LocalPublicationAnchorCatalog.js#add() already dedups by (0.8.2). Two
// replicas that both know the SAME anchor, or a caller that accidentally
// passes the same anchor twice, is exactly one piece of evidence here,
// never two — see docs/Roadmap.md, 0.8.6, "Duplicate anchor knowledge...
// one anchor identity, not two pieces of evidence."
//
// The returned `anchors` array is always sorted by `anchorId` — never by
// arrival order, receivedAt, or any input ordering. Given the identical
// underlying SET of anchors and the identical `verificationByAnchorId`,
// this function returns a byte-identical result regardless of what order
// its caller happened to list `anchors` in — the same property that lets
// two converged replicas' own derived results be compared directly for
// equality.
export function derivePublicationEvidenceConvergence({
    publicationId,
    expectedContentHash = null,
    anchors = [],
    verificationByAnchorId = {}
} = {}) {
    if (!publicationId || typeof publicationId !== 'string' || !publicationId.trim()) {
        throw new Error('derivePublicationEvidenceConvergence: a publicationId is required');
    }

    const seenAnchorIds = new Set();
    const entries = [];
    for (const anchor of Array.isArray(anchors) ? anchors : []) {
        if (!anchor || !anchor.id) continue;
        // Never derives across a publicationId the caller didn't ask
        // about — a caller that passes a mixed list (e.g. a catalog's
        // full list()) gets exactly the same result as one that
        // pre-filtered it.
        if (anchor.publicationId !== publicationId) continue;
        // Duplicate anchor knowledge is one anchor, never two pieces of
        // evidence — see this file's own header.
        if (seenAnchorIds.has(anchor.id)) continue;
        seenAnchorIds.add(anchor.id);

        const contentBinding = !expectedContentHash
            ? ContentBindingRelationship.NOT_COMPARED
            : (anchor.contentHash === expectedContentHash
                ? ContentBindingRelationship.MATCHES_EXPECTED
                : ContentBindingRelationship.DIFFERS_FROM_EXPECTED);

        entries.push({
            anchorId: anchor.id,
            anchorType: anchor.anchorType,
            contentHash: anchor.contentHash,
            contentBinding,
            verification: Object.prototype.hasOwnProperty.call(verificationByAnchorId, anchor.id)
                ? verificationByAnchorId[anchor.id]
                : null
        });
    }
    entries.sort((a, b) => (a.anchorId < b.anchorId ? -1 : a.anchorId > b.anchorId ? 1 : 0));

    // Structural relationship #1: do these anchors agree with EACH OTHER?
    // Grouped by contentHash alone — never by anchorType, anchorIdentity,
    // or anything else — since a content-binding relationship is
    // specifically a question about what bytes an anchor claims to
    // record, not about who recorded it or how.
    const groupsByHash = new Map();
    for (const entry of entries) {
        if (!groupsByHash.has(entry.contentHash)) {
            groupsByHash.set(entry.contentHash, []);
        }
        groupsByHash.get(entry.contentHash).push(entry.anchorId);
    }
    const contentHashGroups = [...groupsByHash.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([contentHash, anchorIds]) => ({ contentHash, anchorIds }));

    // Structural relationship #2: do these anchors agree with what the
    // caller already EXPECTED (ordinarily a locally resolved
    // publication's own contentReference.hash)? Only ever populated when
    // the caller supplied one — see application/
    // ContentBindingRelationship.js's own NOT_COMPARED for why "no
    // comparison was possible" is never silently treated as agreement.
    const matchingAnchorIds = entries
        .filter((entry) => entry.contentBinding === ContentBindingRelationship.MATCHES_EXPECTED)
        .map((entry) => entry.anchorId);
    const divergentAnchorIds = entries
        .filter((entry) => entry.contentBinding === ContentBindingRelationship.DIFFERS_FROM_EXPECTED)
        .map((entry) => entry.anchorId);

    return {
        publicationId,
        expectedContentHash,
        anchorCount: entries.length,
        anchorTypes: [...new Set(entries.map((entry) => entry.anchorType))].sort(),
        anchors: entries,
        contentHashGroups,
        // true the moment more than one DISTINCT contentHash appears
        // among these anchors — structural, symmetric, and computed
        // whether or not an expectedContentHash was ever supplied: two
        // anchors can conflict with EACH OTHER even when the caller has
        // no independently-known "expected" value to compare either one
        // against.
        contentBindingConflict: contentHashGroups.length > 1,
        matchingAnchorIds,
        divergentAnchorIds
    };
}
