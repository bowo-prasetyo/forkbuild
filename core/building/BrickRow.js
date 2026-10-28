import { Position } from '../document/Position.js';

// The most bricks one Shift+drag lays, so a drag to the horizon stays a row.
export const MAX_ROW_LENGTH = 64;

// Drag to lay a row (docs/reviews/EditorPlacementUX-2026-10-27.md, "Beyond
// the fixes"): the positions of a straight row of bricks from `anchor`, where
// the drag started, towards `target`, where the pointer is now. The row runs
// along x or z, whichever the drag went further along; bricks sit edge to
// edge, `stepX` or `stepZ` apart (the brick's turned footprint), all at the
// anchor's height. The anchor alone when the pointer hasn't left it.
export function brickRow(anchor, target, { stepX, stepZ }, maxLength = MAX_ROW_LENGTH) {
    const dx = target.x - anchor.x;
    const dz = target.z - anchor.z;
    const alongX = Math.abs(dx) >= Math.abs(dz);
    const step = alongX ? stepX : stepZ;
    const distance = alongX ? dx : dz;
    const count = step > 0 ? Math.min(maxLength, Math.round(Math.abs(distance) / step) + 1) : 1;
    const sign = distance < 0 ? -1 : 1;
    // Rounded so steps of a quarter or a half land on the grid exactly.
    const tidy = (value) => Math.round(value * 1e9) / 1e9;
    const row = [];
    for (let i = 0; i < count; i++) {
        const offset = sign * i * step;
        row.push(new Position(
            tidy(anchor.x + (alongX ? offset : 0)),
            anchor.y,
            tidy(anchor.z + (alongX ? 0 : offset))
        ));
    }
    return row;
}
