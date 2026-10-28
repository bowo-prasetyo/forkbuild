import { BRICK_KEY_COUNT, brickForKey, emptyBrickSlots, keysByBrick, normalizeBrickSlots, useBrick } from '../core/building/BrickSlots.js';
import { RecentBricksStore } from '../application/settings/RecentBricksStore.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Number keys for recent bricks (docs/reviews/EditorPlacementUX-2026-10-27.md,
// "Beyond the fixes"): 3 to 9 each hold a brick, like a hotbar; a brick keeps
// its key while in use, and a new one takes the key of the one used longest ago.

const use = (slots, ...ids) => ids.reduce((s, id) => useBrick(s, id), slots);

// 1. Keys fill in order and stay put.
{
    let slots = use(emptyBrickSlots(), 'cube', 'plate', 'block');
    assert(slots.keys.join() === 'cube,plate,block', '1. new bricks take 3, 4, 5 in turn');
    slots = use(slots, 'cube', 'plate', 'cube');
    assert(slots.keys.join() === 'cube,plate,block', '2. choosing them again moves nothing');
    assert(brickForKey(slots, '4') === 'plate' && brickForKey(slots, '3') === 'cube', '3. 4 chooses the plate, 3 the cube');
    assert(brickForKey(slots, '6') === null && brickForKey(slots, '2') === null && brickForKey(slots, 'a') === null, '4. an empty key, 1, 2 or a letter chooses nothing');
    assert(JSON.stringify(keysByBrick(slots)) === '{"cube":"3","plate":"4","block":"5"}', '5. each brick knows its key, for its tile');
    console.log('✓ keys fill in order and stay put');
}

// 2. All seven held: a new brick takes the key of the one used longest ago.
{
    let slots = use(emptyBrickSlots(), 'a', 'b', 'c', 'd', 'e', 'f', 'g');
    assert(slots.keys.length === BRICK_KEY_COUNT && brickForKey(slots, '9') === 'g', '6. seven bricks hold 3 to 9');
    slots = use(slots, 'a', 'h');
    assert(brickForKey(slots, '4') === 'h' && slots.keys.includes('a') && !slots.keys.includes('b'),
        '7. an eighth takes the key of b, used longest ago, not a, used just now');
    assert(brickForKey(slots, '3') === 'a' && brickForKey(slots, '9') === 'g', '8. every other key keeps its brick');
    console.log('✓ a new brick takes the key used longest ago');
}

// 3. Stored on the device, and safe with anything read back.
{
    const storageProvider = new InMemoryStorageProvider();
    const store = new RecentBricksStore({ storageProvider });
    store.use('cube');
    store.use('plate');
    const again = new RecentBricksStore({ storageProvider });
    assert(brickForKey(again.load(), '4') === 'plate', '9. the keys are kept on the device');
    storageProvider.save('editor-recent-bricks', { keys: ['x', 'x', 7, null, 'y'], recent: 'nonsense' });
    const odd = new RecentBricksStore({ storageProvider }).load();
    assert(odd.keys.join() === 'x,y' && odd.recent.join() === 'x,y', '10. anything odd read back is made safe');
    assert(normalizeBrickSlots(null).keys.length === 0, '11. nothing stored is no keys');
    const failing = new RecentBricksStore({ storageProvider: Object.assign(new InMemoryStorageProvider(), { save() { throw new Error('full'); } }) });
    failing.use('cube');
    assert(brickForKey(failing.use('plate'), '4') === 'plate', '12. a failed save still keeps the keys until the Editor closes');
    console.log('✓ kept on the device, safely');
}

console.log('✅ All recent brick key tests passed.');
