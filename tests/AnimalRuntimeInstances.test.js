import { AnimalRuntimeInstances } from '../application/AnimalRuntimeInstances.js';
import { AnimalPresence } from '../core/AnimalPresence.js';
import { Position } from '../core/Position.js';
import { animalPresenceInRegion } from '../core/AnimalPlacement.js';
import { ANIMAL_SPECIES } from '../core/WildlifeField.js';

// 0.9.700 — Animal Runtime Instances, application/AnimalRuntimeInstances.js.
//
//   Section A: sync() discovers real, deterministic animals
//   Section B: discard() excludes an animal permanently — it never
//              reappears at its own spawn slot again
//   Section C: add()/get() register a released animal directly
//   Section D: nearby() is a read, never a discovery/eviction
//   Section E: drainRecentlyCaught() — the render-sync queue
//   Section F: clear() resets everything

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SEED = 29;

function runTests() {
    // -------------------------------------------------------------
    // Section A
    // -------------------------------------------------------------
    let fixture;
    {
        const store = new AnimalRuntimeInstances();
        const region = animalPresenceInRegion(SEED, -300, -300, 300, 300);
        assert(region.length > 0, 'sanity: real animals exist under this seed');
        fixture = region[0];
        const found = store.sync(SEED, fixture.position, 30);
        assert(found.some((a) => a.id === fixture.id), '1. sync() discovers a real, deterministic animal near its own position');
        assert(store.get(fixture.id) !== null, '2. get() finds it after sync()');
    }

    // -------------------------------------------------------------
    // Section B
    // -------------------------------------------------------------
    {
        const store = new AnimalRuntimeInstances();
        assert(store.isExcluded(fixture.id) === false, '2b. nothing is excluded on a brand-new store');
        store.sync(SEED, fixture.position, 30);
        assert(store.get(fixture.id) !== null, '3. tracked before discard()');
        store.discard(fixture.id, fixture.position);
        assert(store.get(fixture.id) === null, '4. no longer tracked immediately after discard()');
        assert(store.isExcluded(fixture.id) === true, '4b. isExcluded() reports it, for a caller that never calls sync() at all — see that method\'s own header');
        const again = store.sync(SEED, fixture.position, 30);
        assert(!again.some((a) => a.id === fixture.id), '5. FLAGSHIP: never rediscovered at its own spawn slot, even after a fresh sync() of the same region');
    }
    {
        // discard() is safe even for an id never tracked.
        const store = new AnimalRuntimeInstances();
        store.discard('never-tracked', new Position(0, 0, 0));
        assert(store.get('never-tracked') === null, '6. discarding an untracked id is a harmless no-op on the map itself');
    }

    // -------------------------------------------------------------
    // Section C
    // -------------------------------------------------------------
    {
        const store = new AnimalRuntimeInstances();
        const released = new AnimalPresence({ id: 'animal:released:abc', species: ANIMAL_SPECIES.DEER, position: new Position(500, 0, 500) });
        store.add(released);
        assert(store.get('animal:released:abc') === released, '7. add() registers a released animal directly, findable via get()');
    }
    {
        const store = new AnimalRuntimeInstances();
        let threw = false;
        try { store.add({ id: 'x' }); } catch (e) { threw = true; }
        assert(threw, '8. add() rejects anything that is not a real AnimalPresence instance');
    }

    // -------------------------------------------------------------
    // Section D
    // -------------------------------------------------------------
    {
        const store = new AnimalRuntimeInstances();
        store.sync(SEED, fixture.position, 30);
        const before = store.get(fixture.id);
        const nearby = store.nearby(fixture.position, 30);
        assert(nearby.some((a) => a.id === fixture.id), '9. nearby() finds an already-tracked animal within radius');
        const farAway = new Position(fixture.position.x + 10000, 0, fixture.position.z + 10000);
        const notNearby = store.nearby(farAway, 30);
        assert(!notNearby.some((a) => a.id === fixture.id), '10. nearby() excludes a tracked animal far outside the given radius');
        assert(store.get(fixture.id) === before, '11. nearby() never evicts or mutates — the tracked entry is unchanged after calling it, even for the far-away query');
    }

    // -------------------------------------------------------------
    // Section E
    // -------------------------------------------------------------
    {
        const store = new AnimalRuntimeInstances();
        assert(store.drainRecentlyCaught().length === 0, '12. an empty store drains nothing');
        store.sync(SEED, fixture.position, 30);
        store.discard(fixture.id, fixture.position);
        const drained = store.drainRecentlyCaught();
        assert(drained.length === 1 && drained[0].id === fixture.id, '13. discard() queues exactly one { id, position } pair');
        assert(drained[0].position === fixture.position, '14. the queued position is the exact one passed to discard()');
        assert(store.drainRecentlyCaught().length === 0, '15. draining empties the queue — a second drain finds nothing left');
    }
    {
        // An animal discarded before ever being sync()'d/tracked still
        // gets a queue entry, using the position the caller supplied.
        const store = new AnimalRuntimeInstances();
        const freshPosition = new Position(9, 0, 9);
        store.discard('never-synced', freshPosition);
        const drained = store.drainRecentlyCaught();
        assert(drained.length === 1 && drained[0].position === freshPosition,
            '16. discard() of a never-tracked id still queues its own position — no reliance on this store already knowing about it');
    }

    // -------------------------------------------------------------
    // Section F
    // -------------------------------------------------------------
    {
        const store = new AnimalRuntimeInstances();
        store.sync(SEED, fixture.position, 30);
        store.discard(fixture.id, fixture.position);
        store.clear();
        assert(store.get(fixture.id) === null, '17. clear() drops every tracked instance');
        assert(store.drainRecentlyCaught().length === 0, '18. clear() also empties the recently-caught queue');
        const rediscovered = store.sync(SEED, fixture.position, 30);
        assert(rediscovered.some((a) => a.id === fixture.id), '19. clear() also resets the exclusion set — a previously-caught animal is discoverable again after clear()');
    }

    console.log('✅ All Animal Runtime Instances tests passed.');
}

runTests();
