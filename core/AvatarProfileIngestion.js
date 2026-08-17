// 0.2.41 — the pure decision at the heart of "which profile claim is
// current": given whatever advertisement a replica currently has
// stored for an avatarId (or nothing yet) and a newly-received one,
// should the new one REPLACE what's stored? Monotonic-`profileRevision`
// acceptance only — the SAME rule core/PresenceIngestion.js's
// resolveIncomingPresence() applies to `sequence`, deliberately
// duplicated rather than reused: the field is genuinely named
// differently (`profileRevision`, matching core/AvatarProfile.js's own
// `revision` — see core/AvatarProfileAdvertisement.js's header for
// why), and keeping presence's ingestion rule from ever needing to
// know profile advertisements exist (or vice versa) is worth a few
// duplicated lines. Tolerant of exactly the disorder a real,
// untrusted, low-frequency transport produces — reordering,
// duplicates, gaps — with no special-casing, exactly like presence's.
export function resolveIncomingProfile(currentAdvertisement, incomingAdvertisement) {
    if (!incomingAdvertisement || !Number.isFinite(incomingAdvertisement.profileRevision)) {
        return { accepted: false, reason: 'invalid' };
    }
    if (!currentAdvertisement) {
        return { accepted: true, reason: 'first-seen' };
    }
    if (incomingAdvertisement.profileRevision > currentAdvertisement.profileRevision) {
        return { accepted: true, reason: 'newer-revision' };
    }
    return { accepted: false, reason: 'stale-or-duplicate' };
}
