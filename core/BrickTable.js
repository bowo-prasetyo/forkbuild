// The compact form of a building's bricks in a stored or published
// document (document schema 2, core/documentSchema.js). Instead of one
// JSON object per brick, a building carries one table:
//
//     brickTable: {
//         definitions: ['core:cube', ...],   // each definitionId used, in first-use order
//         colors: [13215834, ...],           // each non-null color used, in first-use order
//         ids: ['a8Kf2x...', ...],           // one per brick
//         values: [d, x, y, z, r, c, ...]    // six numbers per brick
//     }
//
// For brick i, values[6i..6i+5] are: its index into `definitions`, its
// position x, y and z, its rotation in degrees, and 0 for no color or
// 1 + its index into `colors`. Bricks keep their order, so encoding the
// decoded table gives the same table again (the canonical-serialization
// guarantee content hashes rely on). Brick.toJSON()/fromJSON() are
// unchanged; this form exists only at the document boundary.
//
// About a quarter of the size of the object form with UUID brick ids, and
// a fifth of it once ids are short (core/createId.js#createBrickId()).

export const BRICK_TABLE_STRIDE = 6;
const VALUE_NAMES = ['definition', 'position.x', 'position.y', 'position.z', 'rotation', 'color'];

// bricks: Brick instances or brick JSON objects (the same property names).
export function encodeBrickTable(bricks) {
    const definitions = [];
    const definitionIndex = new Map();
    const colors = [];
    const colorIndex = new Map();
    const ids = new Array(bricks.length);
    const values = new Array(bricks.length * BRICK_TABLE_STRIDE);
    for (let i = 0; i < bricks.length; i++) {
        const brick = bricks[i];
        let d = definitionIndex.get(brick.definitionId);
        if (d === undefined) {
            d = definitions.length;
            definitions.push(brick.definitionId);
            definitionIndex.set(brick.definitionId, d);
        }
        let c = 0;
        const color = brick.color === undefined ? null : brick.color;
        if (color !== null) {
            const key = JSON.stringify(color);
            c = colorIndex.get(key);
            if (c === undefined) {
                colors.push(color);
                c = colors.length;
                colorIndex.set(key, c);
            }
        }
        const position = brick.position;
        const offset = i * BRICK_TABLE_STRIDE;
        ids[i] = brick.id;
        values[offset] = d;
        values[offset + 1] = position.x;
        values[offset + 2] = position.y;
        values[offset + 3] = position.z;
        values[offset + 4] = brick.rotation === undefined ? 0 : brick.rotation;
        values[offset + 5] = c;
    }
    return { definitions, colors, ids, values };
}

// Returns brick JSON objects ({ id, definitionId, position, rotation,
// color }) for Brick.fromJSON(). Assumes a table isValidBrickTable() accepts.
export function decodeBrickTable(table) {
    const { definitions, colors, ids, values } = table;
    const bricks = new Array(ids.length);
    for (let i = 0; i < ids.length; i++) {
        const offset = i * BRICK_TABLE_STRIDE;
        const c = values[offset + 5];
        bricks[i] = {
            id: ids[i],
            definitionId: definitions[values[offset]],
            position: { x: values[offset + 1], y: values[offset + 2], z: values[offset + 3] },
            rotation: values[offset + 4],
            color: c === 0 ? null : colors[c - 1]
        };
    }
    return bricks;
}

// Structural errors in a brick table, as messages prefixed with `prefix`;
// an empty array when it is valid.
export function brickTableErrors(table, prefix = 'brickTable') {
    if (!table || typeof table !== 'object' || Array.isArray(table)) {
        return [`${prefix} must be an object`];
    }
    const { definitions, colors, ids, values } = table;
    const errors = [];
    if (!Array.isArray(definitions) || !definitions.every((d) => typeof d === 'string' && d.length > 0)) {
        errors.push(`${prefix}.definitions must be an array of non-empty strings`);
    }
    if (!Array.isArray(colors) || colors.some((c) => c === null || c === undefined)) {
        errors.push(`${prefix}.colors must be an array of colors`);
    }
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && id.length > 0)) {
        errors.push(`${prefix}.ids must be an array of non-empty strings`);
    }
    if (!Array.isArray(values)) {
        errors.push(`${prefix}.values must be an array`);
    }
    if (errors.length > 0) {
        return errors;
    }
    if (values.length !== ids.length * BRICK_TABLE_STRIDE) {
        return [`${prefix}.values must hold ${BRICK_TABLE_STRIDE} numbers per id`];
    }
    for (let i = 0; i < ids.length; i++) {
        const offset = i * BRICK_TABLE_STRIDE;
        const d = values[offset];
        const c = values[offset + 5];
        if (!Number.isInteger(d) || d < 0 || d >= definitions.length) {
            return [`${prefix}.values[${offset}] (brick ${i} definition) must index definitions`];
        }
        for (let k = 1; k <= 4; k++) {
            if (typeof values[offset + k] !== 'number' || !Number.isFinite(values[offset + k])) {
                return [`${prefix}.values[${offset + k}] (brick ${i} ${VALUE_NAMES[k]}) must be a finite number`];
            }
        }
        if (!Number.isInteger(c) || c < 0 || c > colors.length) {
            return [`${prefix}.values[${offset + 5}] (brick ${i} color) must be 0 or index colors from 1`];
        }
    }
    return [];
}
