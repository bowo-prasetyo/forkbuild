import { SideSystemUse, sideSystemSnapshot, sideSystemUsesBetween } from '../core/app/SideSystemUse.js';
import { AvatarInventory, AvatarInventoryEntry, InventoryEntryKind } from '../core/avatar/AvatarInventory.js';
import { AvatarSwimMode } from '../core/avatar/AvatarSwimming.js';
import { ANIMAL_SPECIES } from '../core/nature/WildlifeField.js';
import { VehicleType } from '../core/vehicles/VehicleType.js';
import { FunnelEvent, VISITOR_COUNT_SITE_ORIGIN, funnelEventHitUrl } from '../core/app/VisitorCount.js';
import { DAILY_VISIT_PATH, SIDE_SYSTEMS, SIDE_SYSTEM_STATUS, evaluateSideSystems, parseCounts } from '../core/app/LaunchTargets.js';
import { formatScorecard } from '../scripts/launch-scorecard.mjs';
import { FunnelEventCounter } from '../application/settings/FunnelEventCounter.js';
import { VisitorCountSettingsStore } from '../application/settings/VisitorCountSettingsStore.js';
import { worldContentMethods } from '../application/worldNavigation/worldContentMethods.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The side systems the owner kept (docs/Pillars.md, "The side systems"):
// counted when used, at most once a page load, and watched on the scorecard,
// so that one hardly anyone uses is looked at again.

const inventory = (...kinds) => new AvatarInventory(kinds.map((kind, index) => new AvatarInventoryEntry({ id: `e${index}`, kind, type: kind === InventoryEntryKind.ANIMAL ? Object.values(ANIMAL_SPECIES)[0] : VehicleType.BICYCLE })));

// What World View sees, and what was just used.
{
    const dry = sideSystemSnapshot({ swimState: { mode: AvatarSwimMode.NONE }, inventory: inventory() });
    const wet = sideSystemSnapshot({ swimState: { mode: AvatarSwimMode.SURFACE }, inventory: inventory() });
    const diving = sideSystemSnapshot({ swimState: { mode: AvatarSwimMode.DIVING }, inventory: inventory() });
    assert(!dry.swimming && wet.swimming && diving.swimming, 'in the water at the surface or diving');
    assert(sideSystemUsesBetween(null, wet).length === 0, 'the first moment of a visit uses nothing');
    assert(sideSystemUsesBetween(dry, wet).join() === SideSystemUse.SWAM, 'going into the water is swimming');
    assert(sideSystemUsesBetween(wet, diving).length === 0, 'staying in it isn\'t counted again');

    const empty = sideSystemSnapshot({ inventory: inventory() });
    const caught = sideSystemSnapshot({ inventory: inventory(InventoryEntryKind.ANIMAL) });
    const stored = sideSystemSnapshot({ inventory: inventory(InventoryEntryKind.ANIMAL, InventoryEntryKind.VEHICLE) });
    assert(sideSystemUsesBetween(empty, caught).join() === [SideSystemUse.CAUGHT_ANIMAL, SideSystemUse.USED_INVENTORY].join(), 'an animal caught is carried');
    assert(sideSystemUsesBetween(caught, stored).join() === SideSystemUse.USED_INVENTORY, 'a vehicle stored is the inventory, not a catch');
    assert(sideSystemUsesBetween(stored, caught).length === 0, 'letting something go uses nothing');
    assert(sideSystemSnapshot().carried === 0 && !sideSystemSnapshot().swimming, 'nothing known, nothing used');
    console.log('✓ World View sees swimming, a catch and something carried as they start, never what was already so');
}

// Counted once a page load, under the visitor count's rules.
{
    const store = new VisitorCountSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    store.setEnabled(true);
    const hits = [];
    const counter = new FunnelEventCounter({ settingsStore: store, origin: VISITOR_COUNT_SITE_ORIGIN, random: () => 0.5, sendHit: (url) => hits.push(url) });
    const uses = [
        ['swam', FunnelEvent.SWAM, '/e/swam'], ['caughtAnimal', FunnelEvent.ANIMAL_CAUGHT, '/e/animal-caught'],
        ['decoratedWithAnimal', FunnelEvent.ANIMAL_DECORATED, '/e/animal-decorated'], ['usedInventory', FunnelEvent.INVENTORY_USED, '/e/inventory-used'],
        ['sentChat', FunnelEvent.CHAT_SENT, '/e/chat-sent'], ['madeVoiceCall', FunnelEvent.VOICE_CALL, '/e/voice-call'],
        ['joinedLobby', FunnelEvent.LOBBY_JOINED, '/e/lobby-joined']
    ];
    for (const [method, event, path] of uses) {
        assert(counter[method]() === true && hits.at(-1) === funnelEventHitUrl(event, '5'), `${method} is ${path}`);
        assert(hits.at(-1).includes(encodeURIComponent(path)), `${path} is its fixed path`);
        assert(counter[method]() === false, `${method} is counted once a page load`);
    }
    assert(hits.length === uses.length, 'one hit each');

    const off = new VisitorCountSettingsStore({ storageProvider: new InMemoryStorageProvider() });
    off.setEnabled(false);
    const quiet = [];
    const offCounter = new FunnelEventCounter({ settingsStore: off, origin: VISITOR_COUNT_SITE_ORIGIN, sendHit: (url) => quiet.push(url) });
    assert(!offCounter.sentChat() && quiet.length === 0, 'turned off, nothing is sent');
    off.setEnabled(true);
    assert(offCounter.sentChat() && quiet.length === 1, 'and a use not sent then is counted once turned on');
    const elsewhere = new FunnelEventCounter({ settingsStore: store, origin: 'http://localhost:8000', sendHit: (url) => quiet.push(url) });
    assert(!elsewhere.swam() && quiet.length === 1, 'a copy hosted elsewhere never counts');
    console.log('✓ the seven uses are each one fixed path, sent at most once a page load, only on the official site and when allowed');
}

// Decorating with an animal is heard from the session.
{
    const heard = [];
    const session = Object.create(worldContentMethods);
    const stop = session.onAnimalDecorated((id) => heard.push(id));
    for (const listener of session._animalDecoratedListeners) listener('decoration-1');
    stop();
    assert(heard.join() === 'decoration-1' && session._animalDecoratedListeners.size === 0, 'a listener hears each decoration until it stops');
    console.log('✓ the session tells World View when an animal is decorated with');
}

// Watched on the scorecard.
{
    assert(SIDE_SYSTEMS.map((system) => system.id).join() === 'swimming,catching,decorating,inventory,chat,voice,lobby', 'all seven are watched');
    const counts = parseCounts(JSON.stringify({ '/': 400, '/e/world-visit': 120, '/e/swam': 30, '/e/animal-caught': 1, '/e/chat-sent': 12, '/x/ignored': 9 }));
    assert(counts[DAILY_VISIT_PATH] === 400 && !('/x/ignored' in counts), 'the daily visit count is read, other paths aren\'t');
    const byId = Object.fromEntries(evaluateSideSystems(counts).map((result) => [result.id, result]));
    assert(byId.swimming.status === SIDE_SYSTEM_STATUS.USED && byId.swimming.value === 0.25, 'swimming: a quarter of World View visits');
    assert(byId.catching.status === SIDE_SYSTEM_STATUS.RARELY_USED, 'catching: under 2%, looked at again');
    assert(byId.chat.status === SIDE_SYSTEM_STATUS.USED && byId.chat.sample === 400, 'chat: out of daily visits');
    const early = Object.fromEntries(evaluateSideSystems({ '/': 30, '/e/world-visit': 10 }).map((result) => [result.id, result]));
    assert(Object.values(early).every((result) => result.status === SIDE_SYSTEM_STATUS.TOO_FEW), 'too few visits says nothing yet');
    const printed = formatScorecard(counts);
    assert(printed.includes('SIDE SYSTEMS') && /rarely used\s+catching/.test(printed) && /used\s+swimming\s+25\.0%/.test(printed), 'the scorecard prints them');
    console.log('✓ the scorecard shows what share of visits used each, and flags one used by under 2%');
}
