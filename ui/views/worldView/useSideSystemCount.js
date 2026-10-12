import { inject } from 'vue';
import { SideSystemUse, sideSystemSnapshot, sideSystemUsesBetween } from '../../../core/SideSystemUse.js';

// Counting the kept side systems used in World View (core/SideSystemUse.js):
// swimming, catching an animal and carrying things, read from the avatar
// each tick, and decorating with an animal, heard from the session. Each is
// sent at most once a page load (application/settings/FunnelEventCounter.js),
// under the visitor count's rules and setting; nothing about the World, the
// animal or the visitor is sent.
export function useSideSystemCount({ session }) {
    const funnel = inject('funnelEventCounter', null);
    let previous = null;
    let stopListening = null;

    function startVisit() {
        previous = null;
        if (!funnel || typeof session.onAnimalDecorated !== 'function') return;
        stopListening = session.onAnimalDecorated(() => funnel.decoratedWithAnimal());
    }

    // Called on World View's avatar tick with what it read of the avatar.
    function observeAvatar(swimState) {
        if (!funnel) return;
        let inventory = null;
        try {
            inventory = session.avatarInventoryStore?.()?.get() ?? null;
        } catch {
            inventory = null;
        }
        const current = sideSystemSnapshot({ swimState, inventory });
        for (const use of sideSystemUsesBetween(previous, current)) {
            if (use === SideSystemUse.SWAM) funnel.swam();
            else if (use === SideSystemUse.CAUGHT_ANIMAL) funnel.caughtAnimal();
            else if (use === SideSystemUse.USED_INVENTORY) funnel.usedInventory();
        }
        previous = current;
    }

    function endVisit() {
        stopListening?.();
        stopListening = null;
    }

    return { startVisit, observeAvatar, endVisit };
}
