import { AvatarSwimMode } from './AvatarSwimming.js';
import { InventoryEntryKind } from './AvatarInventory.js';

// The side systems the project owner kept (docs/Pillars.md, "The side
// systems"): catching and decorating with animals, the inventory, swimming,
// chat, voice and the public lobby. Each is counted, at most once a page
// load, when someone uses it (core/VisitorCount.js, FunnelEvent), so its
// keep is decided on numbers: few uses after launch means looking at it
// again.
//
// Pure: what World View sees of the avatar now, against a moment ago, says
// which of the World View ones were just used. Chat, voice, the lobby and
// decorating are counted where they happen instead.

// What a moment of World View shows about the avatar: whether it is in the
// water, how many animals it carries, how many things it carries in all.
export function sideSystemSnapshot({ swimState = null, inventory = null } = {}) {
    const entries = Array.isArray(inventory?.entries) ? inventory.entries : [];
    return Object.freeze({
        swimming: Boolean(swimState && swimState.mode && swimState.mode !== AvatarSwimMode.NONE),
        carriedAnimals: entries.filter((entry) => entry && entry.kind === InventoryEntryKind.ANIMAL).length,
        carried: entries.length
    });
}

export const SideSystemUse = Object.freeze({
    SWAM: 'swam',
    CAUGHT_ANIMAL: 'caught-animal',
    USED_INVENTORY: 'used-inventory'
});

// What was used between two snapshots: in the water now and not before; an
// animal more carried (caught); anything more carried (an animal caught, a
// vehicle stored). The first snapshot of a visit uses nothing, so what was
// already carried when it began doesn't count.
export function sideSystemUsesBetween(previous, current) {
    if (!previous || !current) return [];
    const uses = [];
    if (current.swimming && !previous.swimming) uses.push(SideSystemUse.SWAM);
    if (current.carriedAnimals > previous.carriedAnimals) uses.push(SideSystemUse.CAUGHT_ANIMAL);
    if (current.carried > previous.carried) uses.push(SideSystemUse.USED_INVENTORY);
    return uses;
}
