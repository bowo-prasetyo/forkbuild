import * as THREE from 'three';
import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { BRICK_TILTS, nextTilt, normalizeTilt, orientedSize } from '../core/BrickOrientation.js';
import { encodeBrickTable, decodeBrickTable, brickTableErrors } from '../core/BrickTable.js';
import { brickAabb } from '../core/AvatarCollision.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { walkableSurfaceKindFor, WalkableSurfaceKind } from '../core/WalkableSurface.js';
import { deriveBlueprintFingerprint } from '../core/BlueprintFingerprint.js';
import { Structure } from '../core/Structure.js';
import { DocumentValidator } from '../serializer/DocumentValidator.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/editor/CreateCommandRegistryUseCase.js';
import { PlacementPositionService } from '../application/editor/PlacementPositionService.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { TiltBrickCommand } from '../application/commands/TiltBrickCommand.js';
import { selectionEditingMethods } from '../application/editorSession/selectionEditingMethods.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { ToolId } from '../application/editor-state/ToolId.js';
import { transformStructureBricks } from '../application/editor/StructureCompositionTransform.js';
import { BrickRenderer } from '../renderer/BrickRenderer.js';
import { BrickInstanceRegistry } from '../renderer/BrickInstanceRegistry.js';
import { extractBuildMeshes } from '../renderer/BuildMeshExtraction.js';
import { BRICK_SHAPES } from '../server/rendezvous-worker/buildPreview.js';
import { assert } from './support/Assert.js';

// Tilting (core/BrickOrientation.js): a quarter turn about a brick's own
// width axis, laying it on another side. Stored only when set, so every
// untilted build keeps its bytes and hashes; sized, collided with, walked
// on, drawn and exported as tilted; placed tilted with T, and tilted in
// place, bottom kept, by an undoable command.

const registry = new CreateBrickRegistryUseCase().execute();
const near = (a, b, message) => assert(Math.abs(a - b) < 1e-6, `${message} (got ${a}, expected ${b})`);

// The orientation values.
{
    assert(BRICK_TILTS.join() === '0,90,180,270', 'four tilts');
    assert(normalizeTilt(-90) === 270 && normalizeTilt(450) === 90 && normalizeTilt(45) === 0 && normalizeTilt(undefined) === 0, 'tilts normalize to a quarter turn');
    assert(nextTilt(270) === 0 && nextTilt(0, -1) === 270, 'tilting wraps around');
    const post = registry.get('core:post');
    const lying = orientedSize(post, 90);
    assert(lying.width === 0.25 && lying.height === 0.25 && lying.depth === 3, 'tilted on its front, a post lies along its depth');
    assert(orientedSize(post, 180).height === 3, 'upside down it is as tall');
    console.log('✓ tilts are quarter turns that swap height and depth');
}

// The format: an untilted brick, table and fingerprint are exactly what they
// were; a tilted one round-trips, and a bad tilt is refused.
{
    const plain = new Brick({ id: 'a', definitionId: 'core:cube', position: new Position(0, 0.5, 0) });
    assert(!('tilt' in plain.toJSON()), 'an untilted brick has no tilt in its JSON');
    const table = encodeBrickTable([plain]);
    assert(!('tilts' in table), 'a table with no tilted brick has no tilts');
    const structure = new Structure({ id: 's', name: 'S', bricks: [plain] });
    const fingerprintBefore = deriveBlueprintFingerprint(structure);

    const tilted = new Brick({ id: 'b', definitionId: 'core:post', position: new Position(0, 0.125, 0), tilt: 90 });
    assert(tilted.toJSON().tilt === 90 && Brick.fromJSON(tilted.toJSON()).tilt === 90, 'a tilted brick round-trips');
    const mixed = encodeBrickTable([plain, tilted]);
    assert(JSON.stringify(mixed.tilts) === '[0,90]', 'a table with a tilted brick lists every tilt');
    const decoded = decodeBrickTable(mixed);
    assert(!('tilt' in decoded[0]) && decoded[1].tilt === 90, 'and decodes them');
    assert(brickTableErrors(mixed).length === 0, 'a valid table');
    assert(brickTableErrors({ ...mixed, tilts: [0, 45] })[0].includes('tilts[1]'), 'a tilt off the quarter turns is refused');
    assert(brickTableErrors({ ...mixed, tilts: [0] })[0].includes('one tilt per id'), 'and a short tilts list');

    const building = new Building({ creator: 'tester' });
    building.addBrick(tilted);
    const back = Building.fromJSON(building.toJSON());
    assert(back.getBricks()[0].tilt === 90, 'a building keeps its tilted brick');

    const errors = [];
    DocumentValidator._validateBrick({ id: 'x', definitionId: 'core:cube', position: { x: 0, y: 0, z: 0 }, tilt: 45 }, 'b', errors);
    assert(errors.some((error) => error.includes('tilt')), 'the validator refuses a bad tilt on an object brick');
    assert(deriveBlueprintFingerprint(new Structure({ id: 's', name: 'S', bricks: [plain] })) === fingerprintBefore, 'an untilted structure keeps its fingerprint');
    assert(deriveBlueprintFingerprint(new Structure({ id: 's', name: 'S', bricks: [plain, tilted] }))
        !== deriveBlueprintFingerprint(new Structure({ id: 's', name: 'S', bricks: [plain, new Brick({ ...tilted.toJSON(), position: new Position(0, 0.125, 0), tilt: 0 })] })),
        'a tilt changes a structure\'s fingerprint');
    console.log('✓ tilts are stored only when set, and checked');
}

// Bounds, collision and walking use the tilted size; a tilted ramp walks flat.
{
    const post = registry.get('core:post');
    const box = brickAabb({ x: 0, y: 0.125, z: 0 }, post, 0, 90);
    near(box.max.y - box.min.y, 0.25, 'a lying post is a quarter tall');
    near(box.max.z - box.min.z, 3, 'and three deep');
    const turned = brickAabb({ x: 0, y: 0.125, z: 0 }, post, 90, 90);
    near(turned.max.x - turned.min.x, 3, 'turned as well, it lies along x');
    const bounds = SpatialBounds.fromBricks([new Brick({ definitionId: 'core:post', position: new Position(0, 0.125, 0), tilt: 90 })], registry);
    near(bounds.max.y - bounds.min.y, 0.25, 'bounds are tilted too');
    assert(walkableSurfaceKindFor('core:slope_45', 0) === WalkableSurfaceKind.SLOPE, 'an upright slope is a ramp');
    assert(walkableSurfaceKindFor('core:slope_45', 180) === WalkableSurfaceKind.FLAT, 'an upside-down one is flat-topped');
    console.log('✓ bounds, collision and walking follow the tilt');
}

// Placing tilted: resting height and stacking use the tilted size.
{
    const service = new PlacementPositionService(registry);
    near(service.calculateGround({ x: 0, y: 0, z: 0 }, 'core:post', {}, 90).y, 0.125, 'a lying post rests a quarter-height up');
    near(service.calculateGround({ x: 0, y: 0, z: 0 }, 'core:post', {}, 0).y, 1.5, 'an upright one stands');
    const lying = new Brick({ definitionId: 'core:post', position: new Position(0, 0.125, 0), tilt: 90 });
    near(service.calculateStack(lying, { x: 0, y: 1, z: 0 }, 'core:cube', {}, 0).y, 0.75, 'a cube stacks on a lying post');

    const world = new World();
    const building = new Building({ creator: 'tester' });
    world.addBuilding(building);
    const command = new PlaceBrickCommand({ worldId: world.id, buildingId: building.id, definitionId: 'core:post', position: new Position(0, 0.125, 0), tilt: 90 });
    const placed = command.execute({ world });
    assert(placed.tilt === 90, 'the placed brick is tilted');
    const restored = new CreateCommandRegistryUseCase().execute().fromJSON(command.toJSON());
    assert(restored.tilt === 90, 'the place command carries the tilt');
    console.log('✓ a brick is placed tilted');
}

// Tilting a selection: each brick tilts where it stands with its bottom
// kept, in one undo step that round-trips through JSON.
{
    const world = new World();
    const building = new Building({ creator: 'tester' });
    world.addBuilding(building);
    const post = new Brick({ definitionId: 'core:post', position: new Position(2, 1.5, 0) });
    const wall = new Brick({ definitionId: 'core:wall_1x3', position: new Position(5, 2.5, 0) });
    building.addBrick(post);
    building.addBrick(wall);
    const executed = [];
    const session = {
        _editorContext: {
            tool: { activeTool: ToolId.SELECT },
            selection: new SelectionState({ items: [{ buildingId: building.id, brickId: post.id }, { buildingId: building.id, brickId: wall.id }] })
        },
        _documentManager: { document: { world } },
        _commandHistory: { execute: (command) => { executed.push(command); command.execute({ world }); } },
        _registry: registry
    };
    assert(selectionEditingMethods.tiltSelection.call(session, 1) === true, 'the selection tilts');
    assert(post.tilt === 90 && wall.tilt === 90, 'both bricks are tilted');
    near(post.position.y, 0.125, 'the post lies on the ground it stood on');
    near(wall.position.y, 1 + 0.125, 'the wall keeps its bottom, a metre up');
    assert(post.position.x === 2 && wall.position.x === 5, 'each stays where it was');
    assert(executed.length === 1 && executed[0].describe().key === 'history.tiltBricks' && executed[0].describe().params.count === 2, 'one step, Tilt 2 Bricks');
    executed[0].undo({ world });
    assert(post.tilt === 0 && post.position.y === 1.5 && wall.tilt === 0, 'undo stands them up again');

    const single = new TiltBrickCommand({ worldId: world.id, buildingId: building.id, brickId: post.id, tilt: 180, position: new Position(2, 1.5, 0) });
    single.execute({ world });
    const copy = TiltBrickCommand.fromJSON(JSON.parse(JSON.stringify(single.toJSON())));
    copy.undo({ world });
    assert(post.tilt === 0, 'a tilt command undoes from its JSON');

    session._editorContext.selection = { isEmpty: false, isStructurePlacementSelection: true, items: [] };
    assert(selectionEditingMethods.tiltSelection.call(session, 1) === false, 'a placed structure does not tilt');
    console.log('✓ a selection tilts in place, bottom kept, in one undo step');
}

// Copies keep tilts: composing a structure into a document.
{
    const structure = new Structure({ id: 's', name: 'S', bricks: [new Brick({ definitionId: 'core:post', position: new Position(1, 0.125, 0), tilt: 90 })] });
    const [moved] = transformStructureBricks(structure, { position: { x: 0, y: 0, z: 0 }, rotation: 90 });
    assert(moved.tilt === 90 && moved.rotation === 90, 'a structure turned keeps each brick\'s tilt');
    console.log('✓ copies keep tilts');
}

// Drawn and exported tilted: the instance matrix and the model export put a
// lying post's three metres along z, and the link-preview worker knows it.
{
    const renderer = new BrickRenderer(registry);
    const lying = new Brick({ id: 'p', definitionId: 'core:post', position: new Position(0, 0.125, 0), tilt: 90 });
    const visual = renderer.describe(lying);
    near(visual.rotationX, Math.PI / 2, 'the tilt is drawn about x');
    const scene = { add() {}, remove() {} };
    const instances = new BrickInstanceRegistry(scene);
    instances.add('p', 'doc', 'b', visual);
    const box = instances.getBounds('p', new THREE.Box3());
    near(box.max.z - box.min.z, 3, 'the drawn post lies along z');
    near(box.max.y - box.min.y, 0.25, 'a quarter high');
    const mesh = renderer.createMesh(lying);
    assert(mesh.rotation.order === 'YXZ' && Math.abs(mesh.rotation.x - Math.PI / 2) < 1e-9, 'a standalone mesh is tilted, then turned');

    const exported = extractBuildMeshes([lying], registry);
    const positions = exported.flatMap((part) => [...part.positions]);
    const zs = positions.filter((_, i) => i % 3 === 2);
    near(Math.max(...zs) - Math.min(...zs), 3, 'the exported post lies along z');
    assert(BRICK_SHAPES['core:post'], 'the worker draws posts');
    console.log('✓ drawn and exported tilted');
}
