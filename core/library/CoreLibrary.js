import { BrickDefinition } from '../BrickDefinition.js';

// The built-in "core" library — the minimal set of primitive shapes every
// world can rely on, namespaced per docs/BrickIDs.md. Community libraries
// (medieval:*, space:*, city:*, ...) register alongside this one the same
// way; nothing here is privileged over them except being registered first.
export const CoreLibrary = {
    id: 'core',
    definitions: [
        new BrickDefinition({ id: 'core:cube', name: 'Cube', category: 'primitive' }),
        new BrickDefinition({ id: 'core:slope_45', name: 'Slope 45°', category: 'primitive' }),
        new BrickDefinition({ id: 'core:plate_2x4', name: 'Plate 2x4', category: 'primitive' }),
        new BrickDefinition({ id: 'core:window_small', name: 'Small Window', category: 'primitive' })
    ]
};
