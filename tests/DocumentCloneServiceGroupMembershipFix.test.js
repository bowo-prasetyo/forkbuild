import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Group } from '../core/Group.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';

import { DocumentCloneService } from '../application/document/DocumentCloneService.js';
import { ExportDocumentUseCase } from '../application/document/ExportDocumentUseCase.js';
import { ImportDocumentUseCase } from '../application/document/ImportDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { SaveDocumentUseCase } from '../application/document/SaveDocumentUseCase.js';
import { LoadDocumentUseCase } from '../application/document/LoadDocumentUseCase.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.644 — Fix DocumentCloneService Group Membership Identity Remapping.
//
// 0.9.643's closure audit (tests/EditorDocumentPortabilityProductClosureAudit
// .test.js Section C) found that DocumentCloneService regenerated every
// world/building/brick id but copied each Group's `brickIds` array
// verbatim, so a cloned (imported, forked, or duplicated) document's
// groups silently resolved zero members. The fix: DocumentCloneService
// now builds the old-brick-id -> new-brick-id map it already needs while
// regenerating bricks, and reuses that SAME map to remap every group's
// brickIds — no second mapping, no ImportDocumentUseCase-side special
// casing. This file is the focused regression suite for that fix.

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function buildingWithBricks(creator, count, { startX = 0, definitionId = 'core:cube' } = {}) {
    const building = new Building({ creator });
    for (let i = 0; i < count; i++) {
        building.addBrick(new Brick({ definitionId, position: new Position(startX + i * 2, 0.5, 0), rotation: i * 10 }));
    }
    return building;
}

// ---------------------------------------------------------------------
// A — Direct clone regression: source group membership survives clone
//     with the same cardinality.
// ---------------------------------------------------------------------
{
    const world = new World();
    const building = buildingWithBricks('alice', 3);
    world.addBuilding(building);
    const [b1, b2, b3] = building.getBricks();
    world.addGroup(new Group({ name: 'Trio', brickIds: [b1.id, b2.id, b3.id] }));

    const source = new Document({ world, metadata: new DocumentMetadata({ title: 'Group Clone Source', author: 'alice' }) });
    const clone = new DocumentCloneService().execute(source);

    const clonedGroup = clone.world.getGroups().find((g) => g.name === 'Trio');
    assert(clonedGroup, 'cloned document still has the group');
    assert(clonedGroup.brickIds.length === 3, 'cloned group has the same membership cardinality as the source');
    assert(clone.world.getGroupBricks(clonedGroup.id).length === 3, 'cloned group resolves its full membership against the cloned world');

    console.log('✓ A: direct clone preserves group membership cardinality');
}

// ---------------------------------------------------------------------
// B — Identity remapping: every group brick reference points to the
//     newly cloned brick, never the source brick.
// ---------------------------------------------------------------------
{
    const world = new World();
    const building = buildingWithBricks('alice', 2);
    world.addBuilding(building);
    const [b1, b2] = building.getBricks();
    world.addGroup(new Group({ name: 'Pair', brickIds: [b1.id, b2.id] }));

    const source = new Document({ world, metadata: new DocumentMetadata({ title: 'Remap Source', author: 'alice' }) });
    const sourceBrickIds = new Set([b1.id, b2.id]);

    const clone = new DocumentCloneService().execute(source);
    const clonedGroup = clone.world.getGroups().find((g) => g.name === 'Pair');
    const clonedBrickIds = new Set(clone.world.getBuildings()[0].getBricks().map((b) => b.id));

    for (const id of clonedGroup.brickIds) {
        assert(!sourceBrickIds.has(id), `group brick reference ${id} must not be a source brick id`);
        assert(clonedBrickIds.has(id), `group brick reference ${id} must point to one of the cloned document's own bricks`);
    }

    console.log('✓ B: group brick references are remapped to the cloned bricks, never the source ones');
}

// ---------------------------------------------------------------------
// C — Multiple groups sharing a brick: the mapping is reused
//     consistently, not recomputed per group.
// ---------------------------------------------------------------------
{
    const world = new World();
    const building = buildingWithBricks('alice', 3);
    world.addBuilding(building);
    const [brick1, brick2, brick3] = building.getBricks();
    world.addGroup(new Group({ name: 'GroupA', brickIds: [brick1.id, brick2.id] }));
    world.addGroup(new Group({ name: 'GroupB', brickIds: [brick2.id, brick3.id] }));

    const source = new Document({ world, metadata: new DocumentMetadata({ title: 'Shared Membership Source', author: 'alice' }) });
    const clone = new DocumentCloneService().execute(source);

    const clonedGroupA = clone.world.getGroups().find((g) => g.name === 'GroupA');
    const clonedGroupB = clone.world.getGroups().find((g) => g.name === 'GroupB');
    assert(clonedGroupA.brickIds.length === 2 && clonedGroupB.brickIds.length === 2, 'both groups keep their membership cardinality');

    // brick2's clone identity, as seen by GroupA, must be the exact same
    // id GroupB also references — one shared mapping, not two independent
    // (and therefore possibly divergent) remappings.
    const intersection = clonedGroupA.brickIds.filter((id) => clonedGroupB.brickIds.includes(id));
    assert(intersection.length === 1, 'GroupA and GroupB still share exactly one cloned brick reference, consistently remapped');
    assert(clone.world.getGroupBricks(clonedGroupA.id).length === 2, 'GroupA fully resolves');
    assert(clone.world.getGroupBricks(clonedGroupB.id).length === 2, 'GroupB fully resolves');

    console.log('✓ C: a brick shared by multiple groups is remapped identically for each group');
}

// ---------------------------------------------------------------------
// D — Cross-building groups: a group referencing bricks from more than
//     one Building is not assumed away.
// ---------------------------------------------------------------------
{
    const world = new World();
    const buildingA = buildingWithBricks('alice', 2, { startX: 0 });
    const buildingB = buildingWithBricks('alice', 2, { startX: 100 });
    world.addBuilding(buildingA);
    world.addBuilding(buildingB);
    const [a1] = buildingA.getBricks();
    const [b1] = buildingB.getBricks();
    world.addGroup(new Group({ name: 'CrossBuilding', brickIds: [a1.id, b1.id] }));

    const source = new Document({ world, metadata: new DocumentMetadata({ title: 'Cross Building Source', author: 'alice' }) });
    const clone = new DocumentCloneService().execute(source);
    const clonedGroup = clone.world.getGroups().find((g) => g.name === 'CrossBuilding');

    assert(clonedGroup.brickIds.length === 2, 'cross-building group keeps both members');
    assert(clone.world.getGroupBricks(clonedGroup.id).length === 2, 'cross-building group fully resolves in the cloned world');

    console.log('✓ D: cross-building group membership survives cloning');
}

// ---------------------------------------------------------------------
// E — Empty groups: an empty group stays empty; cloning never
//     accidentally populates it.
// ---------------------------------------------------------------------
{
    const world = new World();
    const building = buildingWithBricks('alice', 2);
    world.addBuilding(building);
    world.addGroup(new Group({ name: 'Empty', brickIds: [] }));

    const source = new Document({ world, metadata: new DocumentMetadata({ title: 'Empty Group Source', author: 'alice' }) });
    const clone = new DocumentCloneService().execute(source);
    const clonedGroup = clone.world.getGroups().find((g) => g.name === 'Empty');

    assert(clonedGroup.brickIds.length === 0, 'empty group remains empty after cloning');

    console.log('✓ E: an empty group stays empty after cloning');
}

// ---------------------------------------------------------------------
// F — Duplicate/dangling membership semantics: unrelated to this fix,
//     so left exactly as the existing model already behaves. Group
//     itself dedups on construction (Group.addMember), so a dangling
//     reference already in the source (pointing at nothing) is the only
//     "irregular" input worth checking — it must not be silently dropped
//     or resolved into something new by the clone.
// ---------------------------------------------------------------------
{
    const world = new World();
    const building = buildingWithBricks('alice', 1);
    world.addBuilding(building);
    const [brick] = building.getBricks();
    const danglingId = 'does-not-exist';
    world.addGroup(new Group({ name: 'WithDangling', brickIds: [brick.id, danglingId] }));

    const source = new Document({ world, metadata: new DocumentMetadata({ title: 'Dangling Reference Source', author: 'alice' }) });
    const clone = new DocumentCloneService().execute(source);
    const clonedGroup = clone.world.getGroups().find((g) => g.name === 'WithDangling');

    assert(clonedGroup.brickIds.length === 2, 'cardinality preserved even with a pre-existing dangling reference');
    assert(clonedGroup.brickIds.includes(danglingId), 'a reference that already resolved to nothing in the source is left untouched, not dropped, by the clone');
    assert(clone.world.getGroupBricks(clonedGroup.id).length === 1, 'only the real brick resolves; the dangling reference still resolves to nothing, exactly as it did in the source');

    console.log('✓ F: pre-existing dangling group references are preserved verbatim, not silently dropped or normalized');
}

// ---------------------------------------------------------------------
// G — Unrelated relationships are untouched by this fix: building
//     identity, brick geometry, group's OWN identity (deliberately still
//     unregenerated — out of scope), document identity, and metadata.
// ---------------------------------------------------------------------
{
    const world = new World();
    const building = buildingWithBricks('alice', 1);
    world.addBuilding(building);
    const [brick] = building.getBricks();
    const group = new Group({ name: 'Scope', brickIds: [brick.id] });
    world.addGroup(group);

    const source = new Document({
        world,
        metadata: new DocumentMetadata({ title: 'Scope Source', description: 'desc', author: 'alice' })
    });
    const clone = new DocumentCloneService().execute(source);

    assert(clone.world.id !== source.world.id, 'document identity still regenerates (unrelated, unaffected by this fix)');
    assert(clone.world.getBuildings()[0].id !== building.id, 'building identity still regenerates (unrelated, unaffected by this fix)');
    const clonedBrick = clone.world.getBuildings()[0].getBricks()[0];
    assert(clonedBrick.position.equals(brick.position), 'brick geometry (position) is preserved, unaffected by this fix');
    assert(clonedBrick.rotation === brick.rotation, 'brick geometry (rotation) is preserved, unaffected by this fix');
    const clonedGroup = clone.world.getGroups()[0];
    assert(clonedGroup.id === group.id, 'group\'s OWN id generation is unaffected by this fix (deliberately out of scope)');
    assert(clonedGroup.name === group.name, 'group name is preserved, unaffected by this fix');
    assert(clone.metadata.title === 'Copy of Scope Source', 'metadata title generation is unaffected by this fix');
    assert(clone.metadata.description === 'desc', 'metadata description is preserved, unaffected by this fix');

    console.log('✓ G: building identity, brick geometry, group id generation, document identity, and metadata are all unaffected by this fix');
}

// ---------------------------------------------------------------------
// G (continued) — Save/Load persistence roundtrip is unaffected: the fix
//     lives entirely inside DocumentCloneService.execute(), not in
//     serialization or storage.
// ---------------------------------------------------------------------
{
    const world = new World();
    const building = buildingWithBricks('alice', 2);
    world.addBuilding(building);
    const [b1, b2] = building.getBricks();
    world.addGroup(new Group({ name: 'Persisted', brickIds: [b1.id, b2.id] }));
    const source = new Document({ world, metadata: new DocumentMetadata({ title: 'Persistence Source', author: 'alice' }) });

    const clone = new DocumentCloneService().execute(source);
    const clonedGroupBefore = clone.world.getGroups().find((g) => g.name === 'Persisted');
    const memberCountBefore = clone.world.getGroupBricks(clonedGroupBefore.id).length;

    const storage = new InMemoryStorageProvider();
    const documentManager = new DocumentManager(clone);
    const savedId = new SaveDocumentUseCase(storage).execute(documentManager);
    const reopened = new LoadDocumentUseCase(storage).execute(new DocumentManager(), savedId);

    const reopenedGroup = reopened.world.getGroups().find((g) => g.name === 'Persisted');
    assert(reopenedGroup.brickIds.length === clonedGroupBefore.brickIds.length, 'group membership cardinality survives a save/load roundtrip after cloning');
    assert(reopened.world.getGroupBricks(reopenedGroup.id).length === memberCountBefore, 'group membership still fully resolves after a save/load roundtrip');

    console.log('✓ G (continued): Save/Load roundtrip after cloning is unaffected — group membership survives persistence too');
}

// ---------------------------------------------------------------------
// MOST IMPORTANT: repeat the actual cross-device portability journey
// that 0.9.643 discovered the bug through — Device A creates a document
// with a building and a group, exports it across a real filesystem
// boundary, Device B imports it, and the group must resolve to the
// IMPORTED brick, never the source brick.
// ---------------------------------------------------------------------
{
    // --- Device A.
    const world = new World();
    const buildingA = buildingWithBricks('alice', 2);
    world.addBuilding(buildingA);
    const [brick1, brick2] = buildingA.getBricks();
    world.addGroup(new Group({ name: 'G', brickIds: [brick1.id] }));

    const documentA = new Document({ world, metadata: new DocumentMetadata({ title: 'Portable Grouped World', author: 'alice' }) });
    const exported = new ExportDocumentUseCase().execute(documentA);

    // --- filesystem boundary: an actual file on disk.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forkbuild-0-9-644-'));
    const transferPath = path.join(tmpDir, 'exported-document.json');
    let imported;
    try {
        fs.writeFileSync(transferPath, JSON.stringify(exported));

        // --- Device B: import.
        const parsed = JSON.parse(fs.readFileSync(transferPath, 'utf8'));
        imported = new ImportDocumentUseCase().execute(parsed);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    const importedGroup = imported.world.getGroups().find((g) => g.name === 'G');
    assert(importedGroup, 'imported document still has the group');
    assert(importedGroup.brickIds.length === 1, 'imported group keeps its single-member cardinality');

    const importedBrick1Id = imported.world.getBuildings()[0].getBricks()[0].id;
    assert(importedGroup.brickIds.includes(importedBrick1Id), "G'.brickIds contains Brick 1' (the imported clone of brick1)");
    assert(!importedGroup.brickIds.includes(brick1.id), "G'.brickIds does NOT contain Brick 1 (the original, source-device brick id)");
    assert(imported.world.getGroupBricks(importedGroup.id).length === 1, 'the imported group resolves its member against the imported world\'s own bricks');

    console.log('✓ FLAGSHIP: the exact cross-device export -> filesystem -> import journey now preserves group membership, remapped to the imported bricks');
}

console.log('\nAll DocumentCloneService group membership fix tests passed.');
