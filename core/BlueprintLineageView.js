// 0.6.8 — Blueprint Lineage & Revision Discovery.
//
// core/BlueprintLineageClaim.js defines what a single signed claim means.
// This module answers the question that only makes sense once a replica
// holds more than zero of them for a design: "given every lineage claim
// this replica currently knows about touching this fingerprint, what
// should a person actually be shown?" The direct core/PlaceNamingView.js/
// core/BlueprintAttributionView.js counterpart, one concept over.
//
// A claim's two fingerprints give it a DIRECTION —
// `sourceFingerprint -> derivedFingerprint` — so, unlike attribution
// (where every claim is simply "about" one fingerprint), a lineage claim
// touching `fingerprint` plays one of two different roles:
//
//   fingerprint IS the derivedFingerprint  -> an ANCESTOR claim
//     ("this design was derived from that one")
//   fingerprint IS the sourceFingerprint   -> a DESCENDANT claim
//     ("that design was derived from this one")
//
// `lineageView()` below splits exactly on that distinction —
// `derivedFrom` and `derivedDesigns` — never merges them into one
// undifferentiated list.
//
// Same "confidence, never authority" restraint every derived view in
// this codebase keeps: neither list is ranked, trimmed to a single
// answer, or used to overwrite a contradicting claim. If Alice signs
// "B derived from A" and Carol signs "B derived from C," both appear in
// B's own `derivedFrom` — see this module's own header on
// detectLocalLineageCycle() below for the one thing this file is
// willing to flag about a contradiction, and everything it deliberately
// does NOT attempt.
export function claimsForFingerprint(fingerprint, claims = []) {
    if (!fingerprint || !Array.isArray(claims)) {
        return [];
    }
    return claims.filter((claim) => claim
        && (claim.sourceFingerprint === fingerprint || claim.derivedFingerprint === fingerprint));
}

function sortMostRecentFirst(claims) {
    return claims.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// True iff `fingerprint`'s own one-hop claims directly contradict one
// another: some other design Y is claimed as BOTH an ancestor of
// `fingerprint` (a `derivedFrom` entry with `sourceFingerprint === Y`)
// AND a descendant of `fingerprint` (a `derivedDesigns` entry with
// `derivedFingerprint === Y`) — i.e. "fingerprint derived from Y" and "Y
// derived from fingerprint" both signed and on file at once.
//
// Deliberately ONE HOP ONLY. A longer cycle (A -> B -> C -> A) can exist
// in the wider claim graph, but detecting it would require walking every
// fingerprint's own claims transitively — effectively a "list every
// lineage claim this replica has ever seen," which no store in this
// codebase provides (see application/LocalBlueprintLineageClaimStore.js's
// own header on why it stays scoped to one fingerprint at a time, the
// same restraint every local claim store here already keeps). This
// check catches exactly the direct contradiction this milestone's own
// design conversation used as its example, and no more — a real, named
// limitation, not an oversight. A UI surfaces it as a warning, never as
// something this module silently "resolves" by dropping either claim.
export function detectLocalLineageCycle(derivedFrom = [], derivedDesigns = []) {
    const ancestors = new Set(derivedFrom.map((claim) => claim.sourceFingerprint));
    const descendants = new Set(derivedDesigns.map((claim) => claim.derivedFingerprint));
    for (const fingerprint of ancestors) {
        if (descendants.has(fingerprint)) {
            return true;
        }
    }
    return false;
}

// The full lineage view for one fingerprint:
//
//   { fingerprint, derivedFrom, derivedDesigns, mine, hasCycleWarning }
//
// `derivedFrom` — every claim asserting THIS design was derived from
// another, most recent first. Zero, one, or several (possibly
// disagreeing) sources are all valid — this file never picks one.
// `derivedDesigns` — every claim asserting some OTHER design was derived
// from THIS one, most recent first.
// `mine` — the CURRENTLY SIGNED-IN identity's own most recent claim
// touching this fingerprint (either direction), or null.
// `hasCycleWarning` — see detectLocalLineageCycle() above.
export function lineageView(fingerprint, claims = [], myIdentityId = null) {
    const relevant = claimsForFingerprint(fingerprint, claims);
    const derivedFrom = sortMostRecentFirst(relevant.filter((claim) => claim.derivedFingerprint === fingerprint));
    const derivedDesigns = sortMostRecentFirst(relevant.filter((claim) => claim.sourceFingerprint === fingerprint));
    const mine = myIdentityId
        ? sortMostRecentFirst(relevant.filter((claim) => claim.authorIdentityId === myIdentityId))[0] || null
        : null;
    return {
        fingerprint: fingerprint || null,
        derivedFrom,
        derivedDesigns,
        mine,
        hasCycleWarning: detectLocalLineageCycle(derivedFrom, derivedDesigns)
    };
}

// A short, human-readable summary — presentation only, empty string for
// nothing on file, the same restraint core/BlueprintAttributionView.js#
// describeAttributionView() already keeps one concept over.
export function describeLineageView(view) {
    if (!view || (!view.derivedFrom.length && !view.derivedDesigns.length)) {
        return '';
    }
    const parts = [];
    if (view.derivedFrom.length > 0) {
        parts.push(`Derived from ${view.derivedFrom.length} ${view.derivedFrom.length === 1 ? 'design' : 'designs'}`);
    }
    if (view.derivedDesigns.length > 0) {
        parts.push(`${view.derivedDesigns.length} derived ${view.derivedDesigns.length === 1 ? 'design' : 'designs'}`);
    }
    return parts.join(' · ');
}
