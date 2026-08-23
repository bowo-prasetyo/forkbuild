// 0.5.2 — Place Naming & Naming Claims.
//
// A PlaceNamingView is a DERIVED, ephemeral reading of whatever
// PlaceNamingClaims a replica currently knows about for one region —
// never persisted, never itself a signed fact, exactly the same
// "derived, never stored" discipline core/WorldRegionGeography.js
// already established for regionsContaining()/describePlace(). It
// answers a genuinely different question than a claim itself does:
// a PlaceNamingClaim says "identity X asserts this region is called Y";
// namingView() says "given every claim THIS replica happens to know
// about, which names look most agreed-on, and by how much?"
//
// Deliberately confidence, never authority. The design conversation
// that proposed this milestone was explicit: "finding ten publications
// saying 'Green Valley' doesn't automatically make Green Valley the
// canonical name... otherwise somebody could simply publish the same
// claim 10,000 times." That is exactly why the score below counts
// DISTINCT authorIdentityId values, never raw claim count — an author
// who republishes the same name five times contributes exactly one
// point to that name's score, the same as an author who published it
// once. There is still no protection here against one identity minting
// many distinct did:key identities (a real Sybil-resistance mechanism —
// reputation, endorsement, proof of distinct personhood — is explicitly
// future work; see docs/Roadmap.md, 0.5.2's own "Deliberately excluded"
// list), but "one author, one vote no matter how many times they shout"
// is the floor this milestone commits to.
export function claimsForRegion(regionId, claims = []) {
    if (!regionId || !Array.isArray(claims)) {
        return [];
    }
    return claims.filter((claim) => claim && claim.regionId === regionId);
}

// 0.5.4 — Place Identity & Geographic Claim Resolution pulled the actual
// scoring/ranking logic out of namingView() below into this standalone
// function, so core/GeographicPlaceResolution.js could rank a set of
// claims spanning MULTIPLE regions (every region a fingerprint-based
// place-identity group considers a candidate for the same ground —
// see core/PlaceIdentity.js) using the exact same distinct-author
// scoring, without namingView()'s own single-regionId filter getting in
// the way. `namingView()` itself is unchanged in behavior — it is now a
// two-line composition of claimsForRegion() + this function — see this
// milestone's own regression test proving byte-identical output.
//
// Ranks every distinct NAME across `claims` by the number of DISTINCT
// identities who have claimed it (most-agreed-on first), ties broken by
// name for deterministic ordering across replicas that happen to have
// discovered a different subset of claims. Each entry:
//
//   { name, score, claims }
//
// `score` is the distinct-author count described above; `claims` is
// every PlaceNamingClaim (JSON or class instance, either is accepted)
// contributing to that name, most recent first, so a UI can show "who
// said this" without a second lookup. Deliberately does NOT filter by
// regionId at all — a caller that wants only one region's own claims
// ranked calls namingView() below instead, or pre-filters via
// claimsForRegion() itself.
export function rankClaimsByName(claims = []) {
    const byName = new Map();
    for (const claim of claims) {
        if (!claim) continue;
        const key = claim.name;
        if (!byName.has(key)) {
            byName.set(key, { name: key, authors: new Set(), claims: [] });
        }
        const entry = byName.get(key);
        entry.authors.add(claim.authorIdentityId);
        entry.claims.push(claim);
    }
    return Array.from(byName.values())
        .map((entry) => ({
            name: entry.name,
            score: entry.authors.size,
            claims: entry.claims.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        }))
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

// Every distinct NAME claimed for `regionId`, ranked by rankClaimsByName()
// above — see that function's own header for the full scoring rules.
// Each entry: { name, score, claims }.
export function namingView(regionId, claims = []) {
    return rankClaimsByName(claimsForRegion(regionId, claims));
}

// The single top-ranked name for a region, or null when nobody has
// claimed one at all — a thin convenience over namingView() for a
// caller that only wants "what should I call this place right now?"
// rather than the whole ranked breakdown. NEVER a claim about which
// name is "correct" — only which one this replica's own known claims
// currently rank first; see this file's own header.
export function preferredClaimedName(regionId, claims = []) {
    const view = namingView(regionId, claims);
    return view.length > 0 ? view[0].name : null;
}

// A short, human-readable summary for a region's naming view:
//   ''                                    — no claims at all
//   'Green Valley'                        — exactly one distinct name claimed
//   'Green Valley · 3 community names'    — more than one distinct name
// Presentation only — never fabricates a name for a region nobody has
// claimed anything about, mirroring core/WorldRegionGeography.js#
// describePlace()'s own "empty string, never a placeholder" posture.
export function describeNamingView(view = []) {
    if (!Array.isArray(view) || view.length === 0) {
        return '';
    }
    if (view.length === 1) {
        return view[0].name;
    }
    return `${view[0].name} · ${view.length} community names`;
}
