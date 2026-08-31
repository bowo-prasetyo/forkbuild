// 0.9.0 — World View Discovery Foundation.
//
// 0.8.21's own "Deliberately excluded" list named "World View integration"
// for PublicationAnchor/PublicationSnapshotPlacement as unscheduled future
// work, and never scheduled it. This milestone is that explicit request,
// arriving from an actual design conversation rather than an automatic
// continuation of the 0.8.189-0.8.202 evidence-comparison chain — that
// chain answers "do two ALREADY-SUPPLIED evidence exports agree with each
// other"; this file answers a narrower, earlier question the World View
// itself has never had a name for: "what, in the World, is even findable
// in the first place?"
//
//   Publication  +  WorldPlacement            AvatarProfile  +  AvatarPresence
//        │  "is this publication                   │  "is this avatar
//        │   somewhere in the World?"               │   here right now?"
//        └──────────────────┬────────────────────────┘
//                           ▼
//              core/WorldEncounter.js   ★ (THIS milestone)
//                  deriveWorldEncounters()
//                           │
//                           ▼
//              { publications: [...], avatars: [...] }
//                           │
//                           ▼
//        Future, unscheduled: "nearby" radius integration (one file over,
//        core/WorldSpatialContext.js), rendering, an Info panel — none of
//        it built here, per the same restraint every milestone in this
//        codebase applies to its own "what's left."
//
// THIS IS A DISCOVERY PROJECTION, NEVER A NEW STORE. Exactly like
// core/WorldLocation.js's own header ("the closest existing precedent"
// for this file, by explicit design): nothing here is ever passed to a
// StorageProvider, nothing here has an id of its own, and deleting the
// underlying Publication/WorldPlacement/AvatarProfile/AvatarPresence
// this function was given just means the next call no longer produces
// that encounter — never a dangling reference to clean up. Every
// function below is a pure, deterministic, Object.freeze()'d transform
// of whatever hydrated (or plain, duck-typed) records a caller already
// has in hand; this file fetches nothing, gossips nothing, and reaches
// into no network, storage, or spatial-index provider on its own — that
// stays entirely the caller's job, exactly as it already is for
// core/WorldSpatialContext.js#deriveSpatialContext(), the closest
// existing precedent for aggregating several already-fetched collections
// into one derived reading.
//
// AN "ENCOUNTER" REQUIRES A PRESENT-TENSE LOCATION, NEVER JUST EXISTENCE.
// A Publication with no WorldPlacement is exactly as unencounterable in
// the World as any other document that was never placed — core/
// WorldPlacement.js already answers "where is a publication in shared
// space," and this file adds nothing to that question beyond joining it
// to the publication it names. Likewise an AvatarProfile with no live
// AvatarPresence describes what someone WOULD look like, never where they
// currently are — core/AvatarPresence.js's own header already draws that
// line ("ephemeral... ANSWERS: where is this user RIGHT NOW"), and a
// profile without a presence is simply not currently encounterable, never
// an error.
//
// TWO KINDS, DELIBERATELY NOT A THIRD. `WorldEncounterKind.PUBLICATION`
// and `WorldEncounterKind.AVATAR` are the only two kinds this milestone
// names. `core/PublisherLeaderboardSnapshotClaim.js` is deliberately NOT
// a third kind here: a claim has no `publicationId` and no world
// position — it names an evidence/policy/snapshot fingerprint, not a
// place — and associating a signing identity's claim with a particular
// placed publication or a particular live avatar is a relationship this
// codebase has never established anywhere. Inventing that link here,
// silently, would repeat exactly the mistake that file's own header spent
// a full paragraph forbidding for a different pair of concepts ("DO NOT
// USE PublisherIdentityRecord AS THE SIGNER"). If a future milestone wants
// claims to be encounterable, it can say so explicitly; this one does not
// guess.
//
// ANCHORS AND SNAPSHOT PLACEMENTS ARE COUNTED, NEVER MERGED. core/
// PublicationAnchor.js and core/PublicationSnapshotPlacement.js each
// devote their own header to the same warning: two orthogonal kinds of
// evidence, "deliberately modeled as two entirely separate signed
// records, never merged into one 'evidence' envelope that would blur what
// each one actually claims." `anchorCount`/`placementCount` below hold
// that line one layer up — two small, independent, non-evaluative
// integers, never a combined "attestation" list, never a "verified" flag,
// and never the anchor/placement records themselves (a caller wanting the
// full records already has them; this file only tells you how many exist
// for an encountered publication).
//
// NO SCORE, RANK, TRUST, VERIFIED, OR COMPARISON VOCABULARY OF ANY KIND.
// `isSigned` reports only that `publication.signature` is present — the
// same "carries a signature" fact core/Publication.js's own field already
// holds, never whether that signature verifies (identity/
// LocalAuthorizationVerifier.js's separate job) and never anything about
// trust. This file never reads the viewer's own evidence, never compares
// an encountered publication to anything the viewer already has, and
// never reconciles, ranks, or scores what it finds — discovery names what
// exists; it does not decide what to do about it. See docs/user/
// 03-WorldView.md, "Info" ("opens a small panel describing whatever you
// selected without moving anything") and "Documents Here" (a plain list
// of independent occupants of the same spot, never a reconciliation) for
// the existing user-facing posture this file's own restraint continues.

export const WorldEncounterKind = Object.freeze({
    PUBLICATION: 'PUBLICATION',
    AVATAR: 'AVATAR'
});

function planePosition(position) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
        return null;
    }
    return Object.freeze({ x: position.x, y: position.y, z: position.z });
}

function nonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0 ? value : 0;
}

// Pure. Describes ONE already-placed publication — the caller has already
// resolved which WorldPlacement (if any) belongs to which Publication, and
// already counted any PublicationAnchor/PublicationSnapshotPlacement
// records naming it; this function never performs either join itself (see
// deriveWorldEncounters() below for the one place that happens). Returns
// null, never throws, when there is nothing encounterable to describe —
// a missing publication, a missing placement, or a placement with no
// resolvable position.
export function describeEncounterablePublication({ publication, placement, anchorCount = 0, placementCount = 0 } = {}) {
    if (!publication || !publication.id || !placement) {
        return null;
    }
    const position = planePosition(placement.position);
    if (!position) {
        return null;
    }
    return Object.freeze({
        kind: WorldEncounterKind.PUBLICATION,
        objectId: publication.id,
        title: typeof publication.title === 'string' ? publication.title : '',
        publisherIdentity: publication.publisherIdentity ? { ...publication.publisherIdentity } : null,
        isSigned: Boolean(publication.signature),
        position,
        anchorCount: nonNegativeInteger(anchorCount),
        placementCount: nonNegativeInteger(placementCount)
    });
}

// Pure. Describes ONE currently-present avatar — a profile paired with its
// own live presence. Returns null, never throws, when there is nothing
// encounterable to describe: a missing profile, a missing presence, or a
// presence with no resolvable position.
export function describeEncounterableAvatar({ profile, presence } = {}) {
    if (!profile || !profile.avatarId || !presence) {
        return null;
    }
    const position = planePosition(presence.position);
    if (!position) {
        return null;
    }
    return Object.freeze({
        kind: WorldEncounterKind.AVATAR,
        objectId: profile.avatarId,
        ownerIdentity: typeof profile.ownerIdentity === 'string' ? profile.ownerIdentity : null,
        displayName: typeof profile.displayName === 'string' ? profile.displayName : '',
        position
    });
}

// The one entry point a caller actually uses — the same "one place this
// reading is computed" role core/WorldSpatialAnchor.js's own
// deriveWorldSpatialAnchor() and core/WorldSpatialContext.js's own
// deriveSpatialContext() already hold one concept over. Every argument is
// a plain array of already-fetched, already-hydrated (or plain JSON)
// records the caller obtained however it likes — a discovery provider, a
// spatial index, a replication store — none of which this function ever
// calls itself. Joins are by publicationId/avatarId alone, never by
// position or by guessing: a placement whose publicationId matches no
// supplied publication, or a presence whose avatarId matches no supplied
// profile, is silently omitted, never a partial or malformed encounter.
export function deriveWorldEncounters({
    publications = [],
    placements = [],
    anchors = [],
    snapshotPlacements = [],
    avatarProfiles = [],
    avatarPresences = []
} = {}) {
    const publicationList = Array.isArray(publications) ? publications : [];
    const placementList = Array.isArray(placements) ? placements : [];
    const anchorList = Array.isArray(anchors) ? anchors : [];
    const snapshotPlacementList = Array.isArray(snapshotPlacements) ? snapshotPlacements : [];
    const profileList = Array.isArray(avatarProfiles) ? avatarProfiles : [];
    const presenceList = Array.isArray(avatarPresences) ? avatarPresences : [];

    const encounteredPublications = placementList
        .map((placement) => {
            if (!placement || !placement.publicationId) {
                return null;
            }
            const publication = publicationList.find((candidate) => candidate && candidate.id === placement.publicationId);
            if (!publication) {
                return null;
            }
            const anchorCount = anchorList.filter((anchor) => anchor && anchor.publicationId === publication.id).length;
            const placementCount = snapshotPlacementList.filter((sp) => sp && sp.publicationId === publication.id).length;
            return describeEncounterablePublication({ publication, placement, anchorCount, placementCount });
        })
        .filter((encounter) => encounter !== null);

    const encounteredAvatars = presenceList
        .map((presence) => {
            if (!presence || !presence.avatarId) {
                return null;
            }
            const profile = profileList.find((candidate) => candidate && candidate.avatarId === presence.avatarId);
            if (!profile) {
                return null;
            }
            return describeEncounterableAvatar({ profile, presence });
        })
        .filter((encounter) => encounter !== null);

    return Object.freeze({
        publications: Object.freeze(encounteredPublications),
        avatars: Object.freeze(encounteredAvatars)
    });
}
