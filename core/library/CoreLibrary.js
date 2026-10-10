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
            depth: 1,
            color: 0x4caf7d
        }),
        new BrickDefinition({
            id: 'core:slope_45',
            name: 'Slope 45°',
            category: 'primitive',
            tags: ['basic', 'roof'],
            description: 'A 45-degree sloped block, useful for roofs and ramps.',
            width: 1,
            height: 1,
            depth: 1,
            color: 0xd08a3e
        }),
        new BrickDefinition({
            id: 'core:plate_2x4',
            name: 'Plate 2x4',
            category: 'primitive',
            tags: ['basic', 'flat'],
            description: 'A thin 2x4 plate for floors and flat surfaces.',
            width: 2,
            height: 0.25,
            depth: 4,
            color: 0x5a8fd0
        }),
        new BrickDefinition({
            id: 'core:window_small',
            name: 'Small Window',
            category: 'primitive',
            tags: ['basic', 'window'],
            description: 'A small window opening.',
            width: 1,
            height: 1,
            depth: 0.25,
            color: 0x9ad0e6
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
            depth: 2,
            color: 0x7d7d7d
        }),
        new BrickDefinition({
            id: 'core:wall_1x3',
            name: 'Wall 1x3',
            category: 'wall',
            tags: ['wall', 'structural'],
            description: 'A tall, thin wall segment for enclosing structures.',
            width: 1,
            height: 3,
            depth: 0.25,
            color: 0xc9b896
        }),
        new BrickDefinition({
            id: 'core:slab_4x4',
            name: 'Slab 4x4',
            category: 'floor',
            tags: ['floor', 'flat', 'slab'],
            description: 'A wide flat slab for floors and platforms, larger than a plate.',
            width: 4,
            height: 0.25,
            depth: 4,
            color: 0x9a9a9a
        }),
        new BrickDefinition({
            id: 'core:roof_hip',
            name: 'Hip Roof',
            category: 'roof',
            tags: ['roof'],
            description: 'A four-sided pyramid roof cap.',
            width: 2,
            height: 1.5,
            depth: 2,
            color: 0xa63a3a
        }),
        new BrickDefinition({
            id: 'core:stair',
            name: 'Stair',
            category: 'stairs',
            tags: ['stairs'],
            description: 'A stepped block for changes in elevation.',
            width: 1,
            height: 1,
            depth: 1,
            color: 0xb0a48f
        }),
        new BrickDefinition({
            id: 'core:column',
            name: 'Column',
            category: 'column',
            tags: ['column', 'pillar', 'structural'],
            description: 'A slender vertical column for supporting structures.',
            width: 0.5,
            height: 3,
            depth: 0.5,
            color: 0xd8d2c0
        }),
        new BrickDefinition({
            id: 'core:beam',
            name: 'Beam',
            category: 'beam',
            tags: ['beam', 'structural'],
            description: 'A horizontal beam for spanning gaps and supporting floors and roofs.',
            width: 4,
            height: 0.5,
            depth: 0.5,
            color: 0x8b5a2b
        }),
        new BrickDefinition({
            id: 'core:arch',
            name: 'Arch',
            category: 'arch',
            tags: ['arch', 'opening'],
            description: 'An archway block with an open passage through its center.',
            width: 2,
            height: 2,
            depth: 0.5,
            color: 0xa89f8a
        }),
        new BrickDefinition({
            id: 'core:window_large',
            name: 'Large Window',
            category: 'window',
            tags: ['window'],
            description: 'A larger window opening than the small window.',
            width: 2,
            height: 1.5,
            depth: 0.25,
            color: 0x8cc8e0
        }),
        new BrickDefinition({
            id: 'core:door',
            name: 'Door',
            category: 'door',
            tags: ['door', 'opening'],
            description: 'A door panel for building entrances.',
            width: 1,
            height: 2,
            depth: 0.1,
            color: 0x6b4226
        }),
        new BrickDefinition({
            id: 'core:trim',
            name: 'Trim',
            category: 'decorative',
            tags: ['decorative', 'detail'],
            description: 'A small decorative trim piece for edges and molding.',
            width: 1,
            height: 0.25,
            depth: 0.25,
            color: 0xe8e2d0
        }),
        new BrickDefinition({
            id: 'core:post',
            name: 'Post',
            category: 'column',
            tags: ['column', 'post', 'timber', 'structural'],
            description: 'A square upright timber, as thick as trim and as tall as a wall.',
            width: 0.25,
            height: 3,
            depth: 0.25,
            color: 0x5a3a22
        }),
        new BrickDefinition({
            id: 'core:brace_2x2',
            name: 'Diagonal Brace 2x2',
            category: 'beam',
            tags: ['beam', 'brace', 'diagonal', 'timber', 'structural'],
            description: 'A timber running corner to corner across a 2x2 panel. Turn it 180° for the other diagonal.',
            width: 2,
            height: 2,
            depth: 0.25,
            color: 0x5a3a22
        }),
        // ---------------------------------------------------------------
        // The Builder's kit (2026-10-10, docs/Pillars.md, "Building feels
        // joyful"): smaller and longer blocks, round pieces, more walls,
        // roofs, openings and props, and plants. Each is still one
        // primitive shape with one definitionId.
        // ---------------------------------------------------------------
        new BrickDefinition({
            id: 'core:cube_half',
            name: 'Half Cube',
            category: 'structural',
            tags: ['basic', 'block', 'half'],
            description: 'A cube half as tall: for steps, sills and fine levels.',
            width: 1,
            height: 0.5,
            depth: 1,
            color: 0x4caf7d
        }),
        new BrickDefinition({
            id: 'core:brick_1x2',
            name: 'Brick 1x2',
            category: 'structural',
            tags: ['basic', 'block', 'brick'],
            description: 'A block two long, for walls laid in courses.',
            width: 2,
            height: 1,
            depth: 1,
            color: 0xa4553b
        }),
        new BrickDefinition({
            id: 'core:brick_1x4',
            name: 'Brick 1x4',
            category: 'structural',
            tags: ['basic', 'block', 'brick'],
            description: 'A block four long, for long walls and foundations.',
            width: 4,
            height: 1,
            depth: 1,
            color: 0xa4553b
        }),
        new BrickDefinition({
            id: 'core:plate_1x1',
            name: 'Plate 1x1',
            category: 'structural',
            tags: ['basic', 'flat', 'plate'],
            description: 'A thin square plate for small details and fine levels.',
            width: 1,
            height: 0.25,
            depth: 1,
            color: 0x5a8fd0
        }),
        new BrickDefinition({
            id: 'core:plate_2x2',
            name: 'Plate 2x2',
            category: 'structural',
            tags: ['basic', 'flat', 'plate'],
            description: 'A thin 2x2 plate for floors, paths and ledges.',
            width: 2,
            height: 0.25,
            depth: 2,
            color: 0x5a8fd0
        }),
        new BrickDefinition({
            id: 'core:round_1x1',
            name: 'Round Brick',
            category: 'structural',
            tags: ['basic', 'round', 'cylinder'],
            description: 'A round block: for towers, wells and pillars stacked high.',
            width: 1,
            height: 1,
            depth: 1,
            color: 0xc9c3b4
        }),
        new BrickDefinition({
            id: 'core:round_plate_2x2',
            name: 'Round Plate 2x2',
            category: 'structural',
            tags: ['basic', 'round', 'flat', 'plate'],
            description: 'A thin disc for round floors, tabletops and tower caps.',
            width: 2,
            height: 0.25,
            depth: 2,
            color: 0x9a9a9a
        }),
        new BrickDefinition({
            id: 'core:wall_1x1',
            name: 'Wall 1x1',
            category: 'wall',
            tags: ['wall', 'structural'],
            description: 'A short, narrow wall panel for filling gaps.',
            width: 1,
            height: 1,
            depth: 0.25,
            color: 0xe8dcc0
        }),
        new BrickDefinition({
            id: 'core:wall_2x3',
            name: 'Wall 2x3',
            category: 'wall',
            tags: ['wall', 'structural'],
            description: 'A wide wall panel, a full storey tall.',
            width: 2,
            height: 3,
            depth: 0.25,
            color: 0xe8dcc0
        }),
        new BrickDefinition({
            id: 'core:wall_half_2x1',
            name: 'Low Wall 2x1',
            category: 'wall',
            tags: ['wall', 'low', 'garden'],
            description: 'A knee-high wall for gardens, parapets and window sills.',
            width: 2,
            height: 1,
            depth: 0.25,
            color: 0xc9c3b4
        }),
        new BrickDefinition({
            id: 'core:pillar',
            name: 'Pillar',
            category: 'column',
            tags: ['column', 'round', 'structural'],
            description: 'A thick round pillar, a full storey tall.',
            width: 1,
            height: 3,
            depth: 1,
            color: 0xd8d2c0
        }),
        new BrickDefinition({
            id: 'core:beam_short',
            name: 'Short Beam',
            category: 'beam',
            tags: ['beam', 'timber', 'structural'],
            description: 'A beam two long, for lintels and short spans.',
            width: 2,
            height: 0.5,
            depth: 0.5,
            color: 0x8b5a2b
        }),
        new BrickDefinition({
            id: 'core:log',
            name: 'Log',
            category: 'beam',
            tags: ['beam', 'round', 'timber', 'nature'],
            description: 'A round log lying on its side, for log cabins and fences.',
            width: 4,
            height: 0.5,
            depth: 0.5,
            color: 0x8b5a2b
        }),
        new BrickDefinition({
            id: 'core:slope_shallow',
            name: 'Shallow Slope 2x1',
            category: 'roof',
            tags: ['roof', 'slope', 'ramp'],
            description: 'A gentle slope two long and one high, for low roofs and ramps.',
            width: 2,
            height: 1,
            depth: 1,
            color: 0xd08a3e
        }),
        new BrickDefinition({
            id: 'core:slope_inverted',
            name: 'Inverted Slope',
            category: 'roof',
            tags: ['roof', 'slope', 'eaves'],
            description: 'A slope turned upside down, for eaves and overhangs.',
            width: 1,
            height: 1,
            depth: 1,
            color: 0xd08a3e
        }),
        new BrickDefinition({
            id: 'core:roof_gable',
            name: 'Gable Roof 2x2',
            category: 'roof',
            tags: ['roof', 'gable', 'pitched'],
            description: 'A pitched roof with a ridge along its length and a gable at each end.',
            width: 2,
            height: 1,
            depth: 2,
            color: 0xa63a3a
        }),
        new BrickDefinition({
            id: 'core:roof_cone',
            name: 'Cone Roof',
            category: 'roof',
            tags: ['roof', 'round', 'tower'],
            description: 'A round pointed roof for towers and turrets.',
            width: 2,
            height: 2,
            depth: 2,
            color: 0x55606e
        }),
        new BrickDefinition({
            id: 'core:roof_ridge',
            name: 'Ridge Cap',
            category: 'roof',
            tags: ['roof', 'ridge', 'detail'],
            description: 'A small pitched cap for the top of a roof or a wall.',
            width: 1,
            height: 0.5,
            depth: 1,
            color: 0xa63a3a
        }),
        new BrickDefinition({
            id: 'core:stair_wide',
            name: 'Wide Stair',
            category: 'stairs',
            tags: ['stairs', 'wide'],
            description: 'A stair two wide, for grand entrances.',
            width: 1,
            height: 1,
            depth: 2,
            color: 0xb0a48f
        }),
        new BrickDefinition({
            id: 'core:ladder',
            name: 'Ladder',
            category: 'stairs',
            tags: ['stairs', 'ladder', 'timber'],
            description: 'A timber ladder a storey tall, for lofts and towers.',
            width: 1,
            height: 3,
            depth: 0.15,
            color: 0x8b5a2b
        }),
        new BrickDefinition({
            id: 'core:window_frame',
            name: 'Window Frame',
            category: 'window',
            tags: ['window', 'frame', 'opening'],
            description: 'A square window you can see through, with a frame.',
            width: 1,
            height: 1,
            depth: 0.25,
            color: 0xf2ead3
        }),
        new BrickDefinition({
            id: 'core:window_round',
            name: 'Round Window',
            category: 'window',
            tags: ['window', 'round', 'opening'],
            description: 'A round window in a square panel, for gables and towers.',
            width: 1,
            height: 1,
            depth: 0.25,
            color: 0xf2ead3
        }),
        new BrickDefinition({
            id: 'core:door_double',
            name: 'Double Door',
            category: 'door',
            tags: ['door', 'wide', 'opening'],
            description: 'A wide double door for barns, halls and gates.',
            width: 2,
            height: 2,
            depth: 0.1,
            color: 0x6b4226
        }),
        new BrickDefinition({
            id: 'core:shutter',
            name: 'Shutter',
            category: 'decorative',
            tags: ['decorative', 'window', 'shutter'],
            description: 'A window shutter to hang beside a window.',
            width: 0.5,
            height: 1,
            depth: 0.05,
            color: 0x4f8a3c
        }),
        new BrickDefinition({
            id: 'core:arch_small',
            name: 'Small Arch',
            category: 'arch',
            tags: ['arch', 'opening', 'doorway'],
            description: 'A narrow archway, for doorways and cloisters.',
            width: 1,
            height: 1.5,
            depth: 0.5,
            color: 0xa89f8a
        }),
        new BrickDefinition({
            id: 'core:fence',
            name: 'Fence',
            category: 'decorative',
            tags: ['decorative', 'fence', 'garden', 'timber'],
            description: 'A picket fence two long, for gardens and fields.',
            width: 2,
            height: 1,
            depth: 0.15,
            color: 0xf2ead3
        }),
        new BrickDefinition({
            id: 'core:chimney',
            name: 'Chimney',
            category: 'decorative',
            tags: ['decorative', 'chimney', 'roof'],
            description: 'A brick chimney stack to stand on a roof.',
            width: 0.75,
            height: 1.5,
            depth: 0.75,
            color: 0xa4553b
        }),
        new BrickDefinition({
            id: 'core:barrel',
            name: 'Barrel',
            category: 'decorative',
            tags: ['decorative', 'prop', 'barrel', 'market'],
            description: 'A wooden barrel for markets, docks and cellars.',
            width: 0.8,
            height: 1,
            depth: 0.8,
            color: 0x8b5a2b
        }),
        new BrickDefinition({
            id: 'core:bench',
            name: 'Bench',
            category: 'decorative',
            tags: ['decorative', 'prop', 'bench', 'garden'],
            description: 'A garden bench with two legs.',
            width: 2,
            height: 0.5,
            depth: 0.5,
            color: 0x8b5a2b
        }),
        new BrickDefinition({
            id: 'core:bush',
            name: 'Bush',
            category: 'nature',
            tags: ['nature', 'plant', 'garden'],
            description: 'A round leafy bush.',
            width: 1,
            height: 1,
            depth: 1,
            color: 0x4f8a3c
        }),
        new BrickDefinition({
            id: 'core:pine_tree',
            name: 'Pine Tree',
            category: 'nature',
            tags: ['nature', 'tree', 'plant'],
            description: 'A tall, pointed pine tree.',
            width: 1.5,
            height: 2.5,
            depth: 1.5,
            color: 0x2f6b3a
        }),
        new BrickDefinition({
            id: 'core:rock',
            name: 'Rock',
            category: 'nature',
            tags: ['nature', 'stone'],
            description: 'A rough boulder for gardens, shores and paths.',
            width: 1,
            height: 1,
            depth: 1,
            color: 0x8a8577
        }),
        new BrickDefinition({
            id: 'core:lawn_2x2',
            name: 'Lawn 2x2',
            category: 'nature',
            tags: ['nature', 'flat', 'grass', 'garden'],
            description: 'A thin square of grass for gardens and greens.',
            width: 2,
            height: 0.1,
            depth: 2,
            color: 0x7cb342
        })
    ]
};
