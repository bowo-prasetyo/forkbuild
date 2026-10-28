import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { brickSizeLabel } from '../core/building/BrickSize.js';
import { assert } from './support/Assert.js';

// The size under each brick in the Build Library (finding P2-9 of
// docs/reviews/EditorPlacementUX-2026-10-27.md): footprint, smaller side
// first, then height, so pieces that look alike in a small picture read
// apart.

const registry = new CreateBrickRegistryUseCase().execute();
const label = (id, format) => brickSizeLabel(registry.get(id), format);

assert(label('core:cube') === '1×1×1', '1. the Cube is 1×1×1');
assert(label('core:cube_half') === '1×1×½', '2. the Half Cube is half as tall');
assert(label('core:block_2x2') === '2×2×2', '3. the Block 2×2 is twice the Cube each way');
assert(label('core:plate_1x1') === '1×1×¼' && label('core:plate_2x4') === '2×4×¼', '4. plates are a quarter tall, and their footprints differ');
assert(label('core:brick_1x2') === '1×2×1', '5. the footprint reads smaller side first, as the brick\'s name does');
assert(label('core:roof_hip_6x6') === '6×6×2½', '6. a whole number and a half read as a mixed fraction');
assert(label('core:door') === '0.1×1×2', '7. anything else is a plain number');
assert(label('core:door', (value) => String(value).replace('.', ',')) === '0,1×1×2', '8. in the locale the caller formats it in');
const labels = registry.getAll().map((definition) => brickSizeLabel(definition));
assert(labels.every((text) => /^[^×]+×[^×]+×[^×]+$/.test(text) && !text.includes('NaN')), '9. every brick has a three-part size');
console.log('✅ All brick size tests passed.');
