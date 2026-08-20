import { BrickDefinition } from '../BrickDefinition.js';

// The built-in "core" library — the minimal set of primitive shapes every
// world can rely on, namespaced per docs/BrickIDs.md. Community libraries
// (medieval:*, space:*, city:*, ...) register alongside this one the same
// way; nothing here is privileged over them except being registered first.
//
// 0.2.80 — Expanded Brick Vocabulary — adds eleven new definitions
// (structural, wall, floor, roof, stairs, column, beam, arch, window,
// door, decorative) to the original four. Every one of them is still a
// PRIMITIVE — a single reusable geometric shape, never a preassembled
// "house" or "barn" — per docs/Principles.md, "A Brick Is A Primitive,
// Never A Preassembled Structure." The original four definitions below
// are byte-for-byte unchanged: same id, same width/height/depth, same
// category, same tags — an existing document referencing them serializes
// and renders exactly as it did before this milestone.
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
        }),

        // ---------------------------------------------------------------
        // 0.2.80 — Expanded Brick Vocabulary
        // ---------------------------------------------------------------
        new BrickDefinition({
            id: 'core:block_2x2',
            name: 'Block 2x2',
            category: 'structural',
            tags: ['structural', 'block'],
            description: 'A larger structural block for heavier framing than the basic cube.',
            width: 2,
            height: 2,
            depth: 2
        }),
        new BrickDefinition({
            id: 'core:wall_1x3',
            name: 'Wall 1x3',
            category: 'wall',
            tags: ['wall', 'structural'],
            description: 'A tall, thin wall segment for enclosing structures.',
            width: 1,
            height: 3,
            depth: 0.25
        }),
        new BrickDefinition({
            id: 'core:slab_4x4',
            name: 'Slab 4x4',
            category: 'floor',
            tags: ['floor', 'flat', 'slab'],
            description: 'A wide flat slab for floors and platforms, larger than a plate.',
            width: 4,
            height: 0.25,
            depth: 4
        }),
        new BrickDefinition({
            id: 'core:roof_hip',
            name: 'Hip Roof',
            category: 'roof',
            tags: ['roof'],
            description: 'A four-sided pyramid roof cap.',
            width: 2,
            height: 1.5,
            depth: 2
        }),
        new BrickDefinition({
            id: 'core:stair',
            name: 'Stair',
            category: 'stairs',
            tags: ['stairs'],
            description: 'A stepped block for changes in elevation.',
            width: 1,
            height: 1,
            depth: 1
        }),
        new BrickDefinition({
            id: 'core:column',
            name: 'Column',
            category: 'column',
            tags: ['column', 'pillar', 'structural'],
            description: 'A slender vertical column for supporting structures.',
            width: 0.5,
            height: 3,
            depth: 0.5
        }),
        new BrickDefinition({
            id: 'core:beam',
            name: 'Beam',
            category: 'beam',
            tags: ['beam', 'structural'],
            description: 'A horizontal beam for spanning gaps and supporting floors and roofs.',
            width: 4,
            height: 0.5,
            depth: 0.5
        }),
        new BrickDefinition({
            id: 'core:arch',
            name: 'Arch',
            category: 'arch',
            tags: ['arch', 'opening'],
            description: 'An archway block with an open passage through its center.',
            width: 2,
            height: 2,
            depth: 0.5
        }),
        new BrickDefinition({
            id: 'core:window_large',
            name: 'Large Window',
            category: 'window',
            tags: ['window'],
            description: 'A larger window opening than the small window.',
            width: 2,
            height: 1.5,
            depth: 0.25
        }),
        new BrickDefinition({
            id: 'core:door',
            name: 'Door',
            category: 'door',
            tags: ['door', 'opening'],
            description: 'A door panel for building entrances.',
            width: 1,
            height: 2,
            depth: 0.1
        }),
        new BrickDefinition({
            id: 'core:trim',
            name: 'Trim',
            category: 'decorative',
            tags: ['decorative', 'detail'],
            description: 'A small decorative trim piece for edges and molding.',
            width: 1,
            height: 0.25,
            depth: 0.25
        })
    ]
};
