// 0.6.7 — Blueprint Attribution Resolution & Community Identity.
//
// 0.6.5 built the attribution MODEL (core/BlueprintAttribution.js) and
// 0.6.6 built the EXCHANGE transport (application/
// BlueprintAttributionExchange.js) that lets a replica accumulate more
// than one signed attribution for the same fingerprint. Neither ever
// asked the question this file finally answers: once a replica holds
// several attributions for one design, what should a person actually be
// SHOWN?
//
// The exact core/PlaceNamingView.js split, one domain over: a DERIVED,
// ephemeral reading of whatever BlueprintAttributions a replica
// currently knows about for one fingerprint — never persisted, never
// itself a signed fact, and never a ranking of who is "right." A
// BlueprintAttribution says "identity X asserts it authored this
// design"; attributionView() below says "given every attribution THIS
// replica happens to know about, who has claimed authorship, and with
// how much independent support?"
//
// The one genuinely different shape from place naming: names COMPETE
// (a region has, at most, one name a viewer prefers), but authors do
// NOT. It is entirely legitimate for a blueprint to have three
// attributed authors at once — a collaborator, a forker, an adapter —
// with no implication that one of them is more "correct" than another.
// So this file never picks a winner the way core/PlaceNamingView.js#
// preferredClaimedName() does; `authors` below is a complete list,
// ordered only for stable, deterministic presentation, never trimmed to
// "the" answer. See docs/Principles.md, "Attribution Resolution Ranks
// Presentation, Never Authorship (0.6.7)."
//
// Distinct-claim counting, not raw exchange traffic, exactly for the
// reason core/PlaceNamingView.js's own header states: "otherwise
// somebody could simply publish the same claim 10,000 times." A single
// BlueprintAttribution re-exported to ten peers and re-imported ten
// times is still exactly ONE claim in any one replica's own store —
// application/LocalBlueprintAttributionStore.js already dedupes by the
// attribution's own `id` on import (application/
// BlueprintAttributionExchange.js#importAttribution()). What this file
// adds is the next layer: the SAME identity publishing several,
// separately-signed attributions for the same fingerprint over time
// (a deliberately allowed redundant republish — see core/
// BlueprintAttribution.js's own header) still contributes to exactly
// ONE author's own group below, never inflates `authorCount`.
//
// `score` is deliberately never called a trust or authority signal — it
// is only "how many of this author's own signed claims for this design
// this replica happens to have on file," presentation-only ranking
// within an already-non-competing list. See this milestone's own
// docs/Roadmap.md "Deliberately excluded" list for why no attempt is
// made here to weigh one author's claim above another's.
export function attributionsForFingerprint(fingerprint, attributions = []) {
    if (!fingerprint || !Array.isArray(attributions)) {
        return [];
    }
    return attributions.filter((attribution) => attribution && attribution.fingerprint === fingerprint);
}

// Groups `attributions` by their own `authorIdentityId`, one entry per
// DISTINCT identity, each carrying every one of that identity's own
// claims (most recent first) — the direct analog of core/
// PlaceNamingView.js#rankClaimsByName(), grouping by author instead of
// by name. Ordered by `score` (that author's own claim count) descending,
// tied identities broken by `authorIdentityId` so two replicas that
// happen to have discovered the same set of attributions in a different
// order still render an identical list. Deliberately accepts
// BlueprintAttribution instances OR plain JSON — both already expose
// `.fingerprint`/`.authorIdentityId`/`.createdAt`/`.id`, so this never
// needs to know which one it was handed.
export function rankAttributionsByAuthor(attributions = []) {
    const byAuthor = new Map();
    for (const attribution of attributions) {
        if (!attribution || !attribution.authorIdentityId) continue;
        const key = attribution.authorIdentityId;
        if (!byAuthor.has(key)) {
            byAuthor.set(key, { authorIdentityId: key, claims: [] });
        }
        byAuthor.get(key).claims.push(attribution);
    }
    return Array.from(byAuthor.values())
        .map((entry) => ({
            authorIdentityId: entry.authorIdentityId,
            score: entry.claims.length,
            claims: entry.claims.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        }))
        .sort((a, b) => b.score - a.score || a.authorIdentityId.localeCompare(b.authorIdentityId));
}

// The full community attribution view for one fingerprint:
//
//   { fingerprint, authors, authorCount, claims, mine }
//
// `authors` — rankAttributionsByAuthor()'s own output, every distinct
// attributing identity, most-supported first (see this file's own
// header on why this is presentation order, never a verdict).
// `authorCount` — authors.length, i.e. the number of DISTINCT identities
// who have claimed authorship, never the raw claim count.
// `claims` — every attribution for this fingerprint, most recent first,
// unranked, so a caller that wants the raw ledger (e.g. a "Received
// locally" history section) never has to re-flatten `authors` itself.
// `mine` — the attribution among `claims` authored by `myIdentityId`,
// or null when nobody is signed in or that identity has never claimed
// this design. Never more than "the currently signed-in identity's own
// claim" — this file draws no conclusion from it.
export function attributionView(fingerprint, attributions = [], myIdentityId = null) {
    const claims = attributionsForFingerprint(fingerprint, attributions)
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const authors = rankAttributionsByAuthor(claims);
    const mine = myIdentityId
        ? claims.find((claim) => claim.authorIdentityId === myIdentityId) || null
        : null;
    return { fingerprint: fingerprint || null, authors, authorCount: authors.length, claims, mine };
}

// A short, human-readable summary of a view — presentation only, and
// deliberately never a verdict about who "really" made the design:
//
//   ''                       — no attributions at all
//   'Attributed to 1 author' — exactly one distinct attributing identity
//   'Attributed to 3 authors'— more than one
//
// Mirrors core/PlaceNamingView.js#describeNamingView()'s own "empty
// string, never a placeholder" restraint for a design nobody has
// attributed at all.
export function describeAttributionView(view) {
    if (!view || !Array.isArray(view.authors) || view.authors.length === 0) {
        return '';
    }
    const count = view.authorCount;
    return `Attributed to ${count} ${count === 1 ? 'author' : 'authors'}`;
}
