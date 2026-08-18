// 0.2.40 — the closed vocabulary for "who may receive my presence,"
// same `Object.freeze` + `isValid*` pattern `core/PresenceLifecycleState.js`
// and `core/AvatarAnimationState.js` already established.
//
//   PUBLIC  — anyone reachable over the transport may receive it; over
//             a real peer transport (0.2.53), that means every
//             AUTHENTICATED peer connection this replica currently
//             has, no exceptions.
//   FRIENDS — only reachable if this replica has at least one
//             explicitly authorized peer identity configured (see
//             core/PresenceVisibilityPolicy.js) — otherwise behaves
//             like HIDDEN, since there is nobody to show it to. Over a
//             real peer transport (0.2.53), the coarse "is the list
//             non-empty" question above is joined by a genuine
//             per-peer one — see
//             core/PresenceVisibilityPolicy.js#shouldAdvertiseToPeer().
//   LOCAL   — confined to the local, same-origin transport scope: a
//             real, authenticated peer connection is never considered
//             "local" for this purpose, even a same-machine one (see
//             presence/PeerAvatarPresenceBroadcastProvider.js, 0.2.53)
//             — only presence/LocalAvatarPresenceBroadcastProvider.js's
//             own same-origin BroadcastChannel scope qualifies.
//   HIDDEN  — never advertised at all.
//
// See docs/Principles.md, "Visibility Happens Before Broadcasting,
// Never After" for why this is consulted at the SENDER, before
// PresenceSyncService.publish() is ever called — never as a
// receiver-side filter, and never by encrypting/obscuring an
// advertisement that still gets sent.
export const PresenceVisibility = Object.freeze({
    PUBLIC: 'public',
    FRIENDS: 'friends',
    LOCAL: 'local',
    HIDDEN: 'hidden'
});

export function isValidPresenceVisibility(value) {
    return Object.values(PresenceVisibility).includes(value);
}
