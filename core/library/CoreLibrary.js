import { BrickDefinition } from '../BrickDefinition.js';

// The built-in "core" library — the minimal set of primitive shapes every
// world can rely on, namespaced per docs/BrickIDs.md. Community libraries
// (medieval:*, space:*, city:*, ...) register alongside this one the same
// way; nothing here is privileged over them except being registered first.
export const CoreLibrary = {
    id: 'core',
    definitions: [
        new BrickDefinition({
            id: 'core:cube',
            name: 'Cube',
            category: 'primitive',
            tags: ['basic', 'block'],
            description: 'A basic 1x1x1 cube — the simplest building block.',
            width: 1,
            height: 1,
            depth: 1
        }),
        new BrickDefinition({
            id: 'core:slope_45',
            name: 'Slope 45°',
            category: 'primitive',
            tags: ['basic', 'roof'],
            description: 'A 45-degree sloped block, useful for roofs and ramps.',
            width: 1,
            height: 1,
            depth: 1
        }),
        new BrickDefinition({
            id: 'core:plate_2x4',
            name: 'Plate 2x4',
            category: 'primitive',
            tags: ['basic', 'flat'],
            description: 'A thin 2x4 plate for floors and flat surfaces.',
            width: 2,
            height: 0.25,
            depth: 4
        }),
        new BrickDefinition({
            id: 'core:window_small',
            name: 'Small Window',
            category: 'primitive',
            tags: ['basic', 'window'],
            description: 'A small window opening.',
            width: 1,
            height: 1,
            depth: 0.25
        })
    ]
};
