// 0.2.98 — Shared World Membership & Collaborative Presence.
//
// The closed, two-value vocabulary a World Presence advertisement's own
// `activity` field is expressed in — deliberately the same "closed
// vocabulary, not an open string" instinct core/WorldAccessLevel.js
// already established for authorization (see that file's own header).
// This is NOT a role, and NOT itself an authorization decision — it is
// a self-reported, purely descriptive UI hint ("what is this connected
// participant probably doing right now"), never trusted as proof of
// EDIT authority. See application/WorldPresenceUseCase.js's own header
// for why a roster entry's actual `canEdit` is always RECOMPUTED locally
// through application/WorldAuthorizationService.js, never read off this
// field: "Being online is not the same as being authorized to edit."
//
//   EXPLORING — the default: this participant is present in the World,
//               walking/looking/selecting, exactly the read-only World
//               View posture every viewer has always had.
//   EDITING   — this participant currently holds (and is likely using)
//               EDIT authority on this World. A caller with no better
//               signal than "do I currently have EDIT" already has a
//               reasonable default — see WorldPresenceUseCase's own
//               `defaultActivity()`.
export const WorldPresenceActivity = Object.freeze({
    EXPLORING: 'exploring',
    EDITING: 'editing'
});

export function isValidWorldPresenceActivity(value) {
    return value === WorldPresenceActivity.EXPLORING || value === WorldPresenceActivity.EDITING;
}
