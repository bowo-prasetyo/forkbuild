// 0.2.40 — the closed vocabulary for "who may receive my presence,"
// same `Object.freeze` + `isValid*` pattern `core/PresenceLifecycleState.js`
// and `core/AvatarAnimationState.js` already established.
//
//   PUBLIC  — anyone reachable over the transport may receive it.
//   FRIENDS — only reachable if this replica has at least one
//             explicitly authorized peer identity configured (see
//             core/PresenceVisibilityPolicy.js) — otherwise behaves
//             like HIDDEN, since there is nobody to show it to.
//   LOCAL   — confined to the local, same-origin transport scope.
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
