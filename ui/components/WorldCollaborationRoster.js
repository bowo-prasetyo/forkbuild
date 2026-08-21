// 0.2.99 — World Collaboration UX.
//
// 0.2.98 built the entire security substrate — ownership, signed
// membership grants (application/WorldMembershipUseCase.js), and live
// presence (application/WorldPresenceUseCase.js) — but named, rather
// than closed, the gap this milestone answers: "any UI surface for
// granting/revoking membership or displaying a presence roster" simply
// did not exist. See docs/Roadmap.md, 0.2.98's own closing paragraph.
//
// This file is the ONE seam between that application layer and every
// "Collaboration UI component" this milestone adds (ui/components/
// WorldMembersPanel.js, ui/components/WorldPresenceIndicator.js) — the
// composition step the design conversation asked to be its own
// flagship, proven WITHOUT re-testing cryptography:
//
//   WorldNavigationSession#listWorldMembers()   (0.2.98, unmodified)
//   WorldNavigationSession#getWorldPresenceRoster() (0.2.98, unmodified)
//                        \                    /
//                         buildWorldCollaborationRoster()  <- THIS FILE
//                                    |
//                     one row per participating identity
//                                    |
//                      ui/components/WorldMembersPanel.js
//
// Deliberately a PURE function — no Vue, no DOM, no network, no
// storage — so it is testable in complete isolation (tests/
// WorldCollaborationUX.test.js) and, per the design conversation's own
// architectural rule, reusable UNCHANGED by any future Editor
// collaboration surface: "Don't create WorldViewMembersPanel/
// EditorMembersPanel with two independent implementations." Every fact
// this function reports was ALREADY decided one layer down
// (WorldAuthorizationService/WorldMembershipUseCase/WorldPresenceUseCase)
// — see docs/Principles.md, "The UI Displays Authorization; It Never
// Decides It (0.2.99)." This function only ever JOINS and LABELS
// already-decided facts, never grants, revokes, or recomputes canEdit
// itself.
//
// The one deliberately asymmetric case, worth stating once here rather
// than at the call site: `getWorldPresenceRoster()` never reports the
// CURRENT viewer's own presence — see WorldPresenceUseCase's own
// header, "the roster of every OTHER... participant." So the owner's
// own row, when the CURRENT viewer IS that owner, cannot be
// discovered online by asking presence at all; `isViewerOwner` is
// threaded through for exactly this one case — see `_ownerRow` below.
// A non-owner viewer's own row is deliberately NOT special-cased: this
// function has no reliable way to know which OTHER row is "you"
// without a second identity parameter, and the design conversation
// scoped this panel around "who else is here," not "who am I" (already
// answered elsewhere in World View's own header).

export const WorldCollaborationAccess = Object.freeze({
    OWNER: 'owner',
    EDITOR: 'editor',
    READ_ONLY: 'read-only'
});

// { ownerIdentityId, isViewerOwner, members, presence } -> Array<row>
//
//   ownerIdentityId  document.metadata.authorIdentityId (or null for a
//                    pre-0.2.95 document — see this file's own header;
//                    a null owner degrades to "presence/membership
//                    only," never a thrown error).
//   isViewerOwner    session.isWorldOwner(documentId) — see _ownerRow.
//   members          session.listWorldMembers(documentId) — an Array of
//                    core/WorldEditAuthority.js instances (or their
//                    toJSON() shape; only `.subjectIdentityId` and
//                    `.isAuthorized` are ever read).
//   presence         session.getWorldPresenceRoster(documentId) — an
//                    Array of `{ identityId, deviceCount, activity,
//                    canEdit }` (application/WorldPresenceUseCase.js's
//                    own shape).
//
// Every row: { identityId, access, online, deviceCount, activity,
// canManage }. `canManage` is PRESENTATION ONLY — "should this row
// offer a Grant/Revoke affordance" — never itself an authorization
// check; WorldMembershipUseCase re-verifies ownership independently the
// moment grantWorldEdit()/revokeWorldEdit() is actually called (see
// this file's own header).
export function buildWorldCollaborationRoster({
    ownerIdentityId = null,
    isViewerOwner = false,
    members = [],
    presence = []
} = {}) {
    const presenceByIdentity = new Map(presence.map((entry) => [entry.identityId, entry]));
    const memberByIdentity = new Map(members.map((entry) => [entry.subjectIdentityId, entry]));

    const identityIds = new Set();
    if (ownerIdentityId) {
        identityIds.add(ownerIdentityId);
    }
    for (const entry of members) {
        if (entry.subjectIdentityId) {
            identityIds.add(entry.subjectIdentityId);
        }
    }
    for (const entry of presence) {
        if (entry.identityId) {
            identityIds.add(entry.identityId);
        }
    }

    const rows = Array.from(identityIds).map((identityId) => {
        const isOwner = Boolean(ownerIdentityId) && identityId === ownerIdentityId;
        const presenceEntry = presenceByIdentity.get(identityId) || null;
        const memberEntry = memberByIdentity.get(identityId) || null;
        const hasActiveGrant = Boolean(memberEntry && memberEntry.isAuthorized)
            || Boolean(presenceEntry && presenceEntry.canEdit);
        return {
            identityId,
            access: isOwner
                ? WorldCollaborationAccess.OWNER
                : (hasActiveGrant ? WorldCollaborationAccess.EDITOR : WorldCollaborationAccess.READ_ONLY),
            // See this file's own header: the owner's OWN presence is
            // never reported by getWorldPresenceRoster() to the owner
            // themself, so isViewerOwner substitutes "I am obviously
            // here right now" for the one row a presence lookup can
            // structurally never answer.
            online: Boolean(presenceEntry) || (isOwner && isViewerOwner),
            deviceCount: presenceEntry ? presenceEntry.deviceCount : null,
            activity: presenceEntry ? presenceEntry.activity : null,
            // Only the World's true owner may ever grant/revoke (see
            // application/WorldMembershipUseCase.js's own header) —
            // and an owner never manages their own row.
            canManage: isViewerOwner && !isOwner
        };
    });

    rows.sort((a, b) => {
        if (a.access === WorldCollaborationAccess.OWNER) return -1;
        if (b.access === WorldCollaborationAccess.OWNER) return 1;
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.identityId.localeCompare(b.identityId);
    });
    return rows;
}
