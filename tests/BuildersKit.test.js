import { CoreLibrary } from '../core/library/CoreLibrary.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { ThreeBrickFactory } from '../renderer/ThreeBrickFactory.js';
import { resolveWalkableSurfaceAt, walkableSurfaceKindFor, WalkableSurfaceKind } from '../core/WalkableSurface.js';
import { VILLAGE_PALETTE } from '../core/VillagePalette.js';
import { BRICK_SHAPES } from '../server/rendezvous-worker/buildPreview.js';
import { libraryItemKey } from '../ui/i18n/libraryText.js';
import en from '../ui/i18n/messages/en.js';
import { assert } from './support/Assert.js';

// The Builder's kit (docs/Pillars.md, "Building feels joyful"): fifty core
// bricks, each drawn at the size it declares, walked on where it is drawn,
// known to the link-preview worker, named, and used by a Village structure;
// and the village colour palette offered beside the colour pickers.

const registry = new CreateBrickRegistryUseCase().execute();
const factory = new ThreeBrickFactory();

// Fifty bricks, none sharing an id, all known to the registry.
{
    const ids = CoreLibrary.definitions.map((definition) => definition.id);
    assert(ids.length === 50, `fifty core bricks (got ${ids.length})`);
    assert(new Set(ids).size === ids.length, 'no id repeats');
    for (const id of ids) assert(registry.has(id), `${id} is registered`);
    assert(registry.getByCategory('primitive').length === 4, 'the kit adds nothing to the original primitive category');
    console.log('✓ fifty core bricks');
}

// Each is drawn exactly the size it declares, centred on its position,
// never as the 1x1x1 fallback.
{
    for (const definition of CoreLibrary.definitions) {
        const geometry = factory.createGeometry(definition.id);
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const size = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
        const center = [(box.max.x + box.min.x) / 2, (box.max.y + box.min.y) / 2, (box.max.z + box.min.z) / 2];
        const wanted = [definition.width, definition.height, definition.depth];
        assert(size.every((value, axis) => Math.abs(value - wanted[axis]) < 0.02),
            `${definition.id} is drawn ${size.map((v) => v.toFixed(2)).join('x')}, declared ${wanted.join('x')}`);
        assert(center.every((value) => Math.abs(value) < 0.02), `${definition.id} is centred`);
    }
    console.log('✓ every brick is drawn at its declared size, centred');
}

// The shallow slope is walked as a ramp and the wide stair as steps, rising
// the way they are drawn (toward local +X at rotation 0).
{
    assert(walkableSurfaceKindFor('core:slope_shallow') === WalkableSurfaceKind.SLOPE, 'the shallow slope is a ramp');
    assert(walkableSurfaceKindFor('core:stair_wide') === WalkableSurfaceKind.STEP, 'the wide stair is steps');
    const slope = { shapeKind: WalkableSurfaceKind.SLOPE, center: { x: 0, y: 0.5, z: 0 }, width: 2, height: 1, depth: 1, rotationDegrees: 0 };
    const low = resolveWalkableSurfaceAt(slope, -0.9, 0).height;
    const high = resolveWalkableSurfaceAt(slope, 0.9, 0).height;
    assert(high > low + 0.5, `the shallow slope climbs toward +X (${low} → ${high})`);
    const stair = { shapeKind: WalkableSurfaceKind.STEP, center: { x: 0, y: 0.5, z: 0 }, width: 1, height: 1, depth: 2, rotationDegrees: 0 };
    assert(resolveWalkableSurfaceAt(stair, 0.45, 0.9) !== null, 'the wide stair is walkable across its whole width');
    assert(walkableSurfaceKindFor('core:roof_cone') === WalkableSurfaceKind.FLAT, 'everything else stays flat-topped');
    console.log('✓ the new ramp and stair are walked as drawn');
}

// The link-preview worker draws every brick at its size and colour.
{
    for (const definition of CoreLibrary.definitions) {
        const shape = BRICK_SHAPES[definition.id];
        assert(shape && shape[0] === definition.width && shape[1] === definition.height && shape[2] === definition.depth && shape[3] === definition.color,
            `the worker knows ${definition.id}`);
    }
    console.log('✓ the worker knows every brick');
}

// Every brick has an English name and description in the app's messages.
{
    for (const definition of CoreLibrary.definitions) {
        const key = libraryItemKey(definition.id);
        assert(typeof en[key] === 'string' && en[key].length > 0, `${definition.id} has a name (${key})`);
        assert(typeof en[`${key}.description`] === 'string', `${definition.id} has a description`);
    }
    console.log('✓ every brick is named');
}

// Every core brick is used by at least one Village structure, so each has a
// ready-made example; the two new structures carry the kit.
{
    const used = new Set(VillageLibrary.structures.flatMap((structure) => structure.bricks.map((brick) => brick.definitionId)));
    const unused = CoreLibrary.definitions.map((definition) => definition.id).filter((id) => !used.has(id));
    assert(unused.length === 0, `every core brick appears in the Village library (unused: ${unused.join(', ')})`);
    const ids = VillageLibrary.structures.map((structure) => structure.id);
    assert(ids.includes('village:garden_cottage') && ids.includes('village:round_tower'), 'Garden Cottage and Round Tower are in the library');
    for (const id of ['village:garden_cottage', 'village:round_tower']) {
        const structure = VillageLibrary.structures.find((candidate) => candidate.id === id);
        const lowest = Math.min(...structure.bricks.map((brick) => brick.position.y - registry.get(brick.definitionId).height / 2));
        assert(Math.abs(lowest) < 1e-9, `${id} rests on the ground (lowest at ${lowest})`);
    }
    console.log('✓ every core brick is used by a Village structure');
}

// The village palette: distinct colours, each named.
{
    assert(VILLAGE_PALETTE.length >= 12, 'a palette of at least twelve colours');
    assert(new Set(VILLAGE_PALETTE.map((swatch) => swatch.color)).size === VILLAGE_PALETTE.length, 'no colour twice');
    for (const swatch of VILLAGE_PALETTE) {
        assert(Number.isInteger(swatch.color) && swatch.color >= 0 && swatch.color <= 0xffffff, `${swatch.id} is a 0xRRGGBB colour`);
        assert(typeof en[`villagePalette.${swatch.id}`] === 'string', `${swatch.id} is named`);
    }
    console.log('✓ the village palette is a set of named colours');
}
