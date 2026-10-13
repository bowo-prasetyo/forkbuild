import { inject, onBeforeUnmount, ref } from 'vue';

// Whose avatar World View walks: the named player's, or a guest's for
// someone with no name yet (application/avatar/GuestAvatar.js; seen by
// nobody else). Logging in or out while World View is open swaps the avatar
// where it stands (WorldNavigationSession#adoptLocalAvatar()), so a guest
// who chooses a name for Walk here with me is seen by the friends who join.
// `onAdopted` runs after a swap, for the view to re-read the avatar's state.
//
// Also counts, once a page load, a guest who walks (`/e/guest-walk`): how
// many visitors use World View before they have a name
// (docs/reviews/CreativeDirection-2026-10-12c.md, finding 1).
export function useLocalAvatarOwner({ session, worldViewFactory, identityUseCase, onAdopted = () => {} }) {
    const funnel = inject('funnelEventCounter', null);
    const guestAvatar = ref(session.isLocalAvatarGuest());
    let guestStart = null;

    function onUserChanged(user) {
        if (!session.hasLocalAvatar()) return;
        // The same owner again (a lock or an unlock) keeps its avatar: a fresh
        // one would restart its sequence, and peers would ignore it.
        const guest = session.isLocalAvatarGuest();
        if (!user && guest) return;
        if (user && !guest && session.localAvatarOwnerIdentity() === user.username) return;
        session.adoptLocalAvatar(worldViewFactory.localAvatarWiring(session.localAvatarPlacement()));
        guestAvatar.value = session.isLocalAvatarGuest();
        guestStart = null;
        onAdopted();
    }

    const unsubscribe = identityUseCase && typeof identityUseCase.onUserChanged === 'function'
        ? identityUseCase.onUserChanged(onUserChanged)
        : null;
    onBeforeUnmount(() => {
        if (unsubscribe) unsubscribe();
    });

    // Called on World View's regular tick: a guest who has moved from where
    // they arrived has walked.
    function checkGuestWalk() {
        if (!guestAvatar.value || !funnel) return;
        const position = session.getAvatarPosition();
        if (!position) return;
        if (!guestStart) {
            guestStart = position;
            return;
        }
        const moved = Math.hypot(position.x - guestStart.x, position.z - guestStart.z);
        if (moved > 1) funnel.walkedAsGuest();
    }

    return { guestAvatar, checkGuestWalk };
}
