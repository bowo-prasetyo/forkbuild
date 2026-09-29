import { WorldResident } from '../core/WorldResident.js';
import { World } from '../core/World.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { DomainEvent } from '../core/events/Event.js';
import { EventBus } from '../core/events/EventBus.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { DocumentValidator } from '../serializer/DocumentValidator.js';
import { CreateWorldResidentCommand } from '../application/commands/CreateWorldResidentCommand.js';
import { RemoveWorldResidentCommand } from '../application/commands/RemoveWorldResidentCommand.js';
import { CreateCommandRegistryUseCase } from '../application/editor/CreateCommandRegistryUseCase.js';
import { DocumentCloneService } from '../application/document/DocumentCloneService.js';
import { assert } from './support/Assert.js';

// World Residents as World content: core/WorldResident.js, core/World.js,
// the two commands, and the document envelope.
//
//   Section A: the value object
//   Section B: World add/remove/get, domain events, toJSON/fromJSON — and a
//              World without residents serializing exactly as before
//   Section C: the document envelope — round trip and validation
//   Section D: the commands — execute, undo, redo, replay
//   Section E: forks keep residents, with the same ids

function assertThrows(fn, message) {
    let threw = false;
    try {
        fn();
    } catch {
        threw = true;
    }
    assert(threw, message);
}

function resident(overrides = {}) {
    return new WorldResident({ id: 'res-1', worldId: 'w-1', authorIdentityId: 'alice', position: new Position(3, 0, -4), ...overrides });
}

function runTests() {
    // -------------------------------------------------------------
    // Section A — the value object
    // -------------------------------------------------------------
    {
        const r = resident();
        assert(r.id === 'res-1' && r.worldId === 'w-1' && r.authorIdentityId === 'alice', '1. A resident keeps its id, World and author');
        assert(r.position.x === 3 && r.position.z === -4, '2. ...and its home');
        const lifted = resident({ position: { x: 1, y: 7, z: 2 } });
        assert(lifted.position.y === 0, '3. A resident lives on the ground: a stored y is always 0');
        assertThrows(() => resident({ id: '' }), '4. An id is required');
        assertThrows(() => resident({ worldId: null }), '5. A worldId is required');
        assertThrows(() => resident({ authorIdentityId: undefined }), '6. An author is required');
        assertThrows(() => resident({ position: { x: NaN, z: 0 } }), '7. A home needs finite x and z');
        const copy = WorldResident.fromJSON(JSON.parse(JSON.stringify(r.toJSON())));
        assert(JSON.stringify(copy.toJSON()) === JSON.stringify(r.toJSON()), '8. toJSON/fromJSON round-trips');
    }

    // -------------------------------------------------------------
    // Section B — World
    // -------------------------------------------------------------
    {
        const bus = new EventBus();
        const events = [];
        bus.subscribe(DomainEvent.RESIDENT_ADDED, (payload) => events.push(['added', payload.resident.id]));
        bus.subscribe(DomainEvent.RESIDENT_REMOVED, (payload) => events.push(['removed', payload.resident.id]));
        const world = new World({ id: 'w-1', eventBus: bus });
        const before = JSON.stringify(world.toJSON());
        assert(!('residents' in world.toJSON()), '9. A World without residents has no residents field...');

        world.addResident(resident());
        assert(world.getResident('res-1') !== null && world.getResidents().length === 1, '10. addResident() adds one');
        assert(Array.isArray(world.toJSON().residents) && world.toJSON().residents[0].id === 'res-1', '11. ...which toJSON() writes');
        const restored = World.fromJSON(JSON.parse(JSON.stringify(world.toJSON())));
        assert(restored.getResident('res-1').position.x === 3, '12. fromJSON() reads it back');

        world.removeResident('res-1');
        world.removeResident('never-there');
        assert(world.getResident('res-1') === null && world.getResidents().length === 0, '13. removeResident() removes it; an unknown id is a no-op');
        assert(JSON.stringify(world.toJSON()) === before, '14. ...and the World serializes byte for byte as before residents existed');
        assert(JSON.stringify(events) === JSON.stringify([['added', 'res-1'], ['removed', 'res-1']]),
            '15. Adding and removing publish RESIDENT_ADDED and RESIDENT_REMOVED, and a no-op publishes nothing');
    }

    // -------------------------------------------------------------
    // Section C — the document envelope
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'w-1' });
        world.addResident(resident());
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Village' }) });
        const serializer = new DocumentSerializer();
        const text = JSON.stringify(serializer.serialize(document));
        const loaded = serializer.deserialize(JSON.parse(text));
        assert(loaded.world.getResident('res-1') !== null, '16. A resident survives serialize/deserialize');
        assert(JSON.stringify(serializer.serialize(loaded)) === text, '17. ...and serialization stays canonical');

        const envelope = JSON.parse(text);
        assert(DocumentValidator.validate(envelope).valid, '18. A valid residents array validates');
        const noResidents = JSON.parse(text);
        delete noResidents.world.residents;
        assert(DocumentValidator.validate(noResidents).valid, '19. So does a World with none');
        const notArray = JSON.parse(text);
        notArray.world.residents = { id: 'res-1' };
        assert(!DocumentValidator.validate(notArray).valid, '20. residents must be an array');
        const badEntry = JSON.parse(text);
        badEntry.world.residents[0].position = { x: 'a', z: 0 };
        assert(!DocumentValidator.validate(badEntry).valid, '21. A resident without a finite home is rejected before it could crash loading');
        const noId = JSON.parse(text);
        delete noId.world.residents[0].id;
        assert(!DocumentValidator.validate(noId).valid, '22. ...as is one without an id');
    }

    // -------------------------------------------------------------
    // Section D — the commands
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'w-1' });
        const create = new CreateWorldResidentCommand({ worldId: 'w-1', authorIdentityId: 'alice', position: new Position(5, 0, 6) });
        const created = create.execute({ world });
        assert(created.id === create.executedResidentId && world.getResident(created.id) !== null, '23. Create adds a resident and reports its id');
        create.undo({ world });
        assert(world.getResidents().length === 0, '24. Undo removes it');
        create.execute({ world });
        assert(world.getResident(created.id) !== null, '25. Redo brings back the SAME resident id, so it walks the same way');

        const registry = new CreateCommandRegistryUseCase().execute();
        const replayedCreate = registry.fromJSON(JSON.parse(JSON.stringify(create.toJSON())));
        const replayWorld = new World({ id: 'w-1' });
        replayedCreate.execute({ world: replayWorld });
        assert(replayWorld.getResident(created.id) !== null, '26. A replayed create recreates the same id');

        const remove = new RemoveWorldResidentCommand({ worldId: 'w-1', residentId: created.id });
        remove.execute({ world });
        assert(world.getResident(created.id) === null, '27. Remove removes it');
        remove.undo({ world });
        const back = world.getResident(created.id);
        assert(back && back.position.x === 5 && back.position.z === 6, '28. Undoing a removal restores the same resident at the same home');
        const replayedRemove = registry.fromJSON(JSON.parse(JSON.stringify(remove.toJSON())));
        replayedRemove.execute({ world });
        assert(world.getResident(created.id) === null, '29. A replayed removal removes it again');

        const chosen = new CreateWorldResidentCommand({ worldId: 'w-1', authorIdentityId: 'alice', position: new Position(1, 0, 1), residentId: 'picked' });
        assert(!chosen.canUndo(), '29b. A create with a chosen id has nothing to undo before it runs');
        chosen.execute({ world });
        assert(world.getResident('picked') !== null && chosen.executedResidentId === 'picked', '29c. ...and adds the resident under that id');

        assertThrows(() => new RemoveWorldResidentCommand({ worldId: 'w-1', residentId: 'nope' }).execute({ world }), '30. Removing an unknown resident throws');
        assertThrows(() => create.execute({ world: new World({ id: 'other' }) }), '31. A command refuses another World');
    }

    // -------------------------------------------------------------
    // Section E — forks
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'w-1' });
        world.addResident(resident());
        const fork = new DocumentCloneService().execute(new Document({ world, metadata: new DocumentMetadata({ title: 'Village' }) }));
        assert(fork.world.id !== 'w-1' && fork.world.getResident('res-1') !== null,
            '32. A fork keeps its residents under the same ids, so they keep walking the same paths');
    }

    console.log('✅ All World Resident tests passed.');
}

runTests();
