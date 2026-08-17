import { distanceBetween, isWithinRadius } from './SpatialQuery.js';

// 0.2.43 — "who is near me?" as a DERIVED, local, geometric fact, never
// a replicated or announced one — see docs/Principles.md, "Proximity
// Is Derived, Never Announced." Alice never tells anyone "I am near
// Bob"; her own replica looks at her own local position and whatever
// remote presences it already trusts (the exact same list
// `application/RemoteAvatarRegistry.js` already renders from), and
// computes the answer itself. Bob's replica does the identical
// computation independently, from HIS OWN position — the two are
// never required to agree, and neither is ever second-guessed by a
// claim the other one sent.
//
// Pure, Three.js-free, decentralized-honest geometry — the exact same
// `distanceBetween`/`isWithinRadius` primitives 0.2.28's spatial
// search already established for "how far away is this document,"
// reused verbatim rather than re-implemented, because the question is
// genuinely identical: straight-line distance between two points in
// world space. core/SpatialOverlap.js's placement-collision AABB math
// is deliberately NOT reused here — an avatar isn't a bounding box for
// this purpose, just a point.
//
// `knownPresences` is expected to be exactly what
// `application/PresenceSyncService.js#listKnownPresences()` already
// returns: `{ advertisement, lifecycleState, trustObservation }`
// entries. This function trusts that shape completely and invents
// nothing about trust or freshness itself — it only ever sorts and
// filters by distance. Critically, `listKnownPresences()` is backed by
// `application/LocalPresenceStore.js`, which already PRUNES an ABSENT
// presence out of existence the moment it's asked for (see that
// file's own `list()`) — so an ABSENT avatar can never even reach this
// function in the first place. "ABSENT -> removed, therefore not an
// interaction target" is satisfied entirely upstream, not by any
// filtering here.
export function computeNearbyAvatars({ localPosition, knownPresences, radius = Infinity }) {
    const results = [];
    for (const entry of knownPresences || []) {
        const advertisement = entry && entry.advertisement;
        if (!advertisement || !advertisement.position) {
            continue;
        }
        const position = advertisement.position;
        if (!isWithinRadius(position, localPosition, radius)) {
            continue;
        }
        results.push({
            avatarId: advertisement.avatarId,
            distance: distanceBetween(localPosition, position),
            position: { x: position.x, y: position.y, z: position.z },
            // `animation` rides along too — the design doc's own
            // "Nearby Avatars" mockup shows "Walking"/"Idle" per row,
            // and it's already sitting right there on the same
            // advertisement being read; no extra query, no new state.
            animation: advertisement.animation,
            lifecycleState: entry.lifecycleState,
            trustStatus: entry.trustObservation ? entry.trustObservation.status : null
        });
    }
    // Nearest first — the one genuinely useful default ordering for
    // "who is near me," and a stable one: ties (identical distance)
    // keep whatever relative order they arrived in, since Array.sort
    // in every JS engine this project targets is stable.
    results.sort((a, b) => a.distance - b.distance);
    return results;
}
