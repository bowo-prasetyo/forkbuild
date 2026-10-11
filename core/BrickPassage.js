import { brickAabb, footprintHalfExtents } from './AvatarCollision.js';
import { orientedSize } from './BrickOrientation.js';

// Bricks an avatar walks through: a door, and the opening of an arch.
//
// Collision is otherwise one box per brick (core/AvatarCollision.js#
// brickAabb()), which made every doorway in the Build Library a wall: a door
// panel filled the gap left for it, and an arch, drawn with an opening,
// collided as a solid block. So nobody could walk into the house they had
// just built (docs/reviews/CreativeDirection-2026-10-11.md, finding 1).
//
// - A standing door has no collision at all. World View swings it open as
//   someone walks up to it (renderer/DoorSwing.js), so walking through it
//   looks like going through a door.
// - A standing arch collides as what is drawn: two jambs, and over the
//   opening a lintel stepped down to follow the curve
//   (archCollisionBoxes()). The opening's shape is ARCH_OPENINGS below, the
//   one authority both this file and renderer/ThreeBrickFactory.js's
//   archGeometry() read, so what a player sees and what their avatar bumps
//   into can't drift apart.
//
// A tilted door or arch lies on its side: a plank or a frame on the floor,
// not a way through. It keeps its one full box.

// An arch's opening, in the brick's own frame: x across its width (0 at the
// middle), y up from the brick's bottom. Straight sides `halfWidth` either
// side of the middle rise from the sill (`sill` above the bottom) for
// `spring`, then close in a half ellipse `rise` high.
//
// core:arch is the doorway arch: no sill, and an opening a walking avatar
// (core/AvatarCollision.js, 0.7 wide and 1.8 tall) fits through with room
// to spare either side: at least 1.8 of headroom up to 0.5 from the
// middle, where the avatar's shoulder is with 0.15 of play. core:arch_small keeps the proportions arches were always drawn
// with (a sill and a semicircle); at 1.5 tall it is a window or a niche,
// and no avatar fits through it.
export const ARCH_OPENINGS = Object.freeze({
    'core:arch': Object.freeze({ halfWidth: 0.75, sill: 0, spring: 1.6, rise: 0.3 }),
    'core:arch_small': Object.freeze({ halfWidth: 0.35, sill: 0.15, spring: 0.525, rise: 0.35 })
});

// How many strips the lintel over an opening is cut into to follow its
// curve. Each strip's underside is the curve's lowest point across it, so
// the collision never lets anything into the masonry; twelve keeps the steps
// small enough that a doorway's headroom holds well off its middle.
export const ARCH_LINTEL_STRIPS = 12;

const DOOR_CATEGORY = 'door';

export function isPassableDoor(definition, tilt = 0) {
    return !tilt && definition?.category === DOOR_CATEGORY;
}

// The opening of `definitionId` when it stands upright, or null.
export function archOpening(definitionId, tilt = 0) {
    if (tilt) return null;
    return ARCH_OPENINGS[definitionId] || null;
}

// The height of an opening's top edge `x` from its middle, measured from
// the brick's bottom, or null outside the opening.
export function archOpeningHeightAt(opening, x) {
    const offset = Math.abs(x);
    if (!opening || offset > opening.halfWidth) return null;
    const t = offset / opening.halfWidth;
    return opening.sill + opening.spring + opening.rise * Math.sqrt(Math.max(0, 1 - t * t));
}

// The boxes `definition` collides as, in the brick's own frame (centered on
// the brick, unturned): [{ min, max }]. One box for most bricks, none for a
// standing door, and jambs, a sill and lintel strips for a standing arch.
export function localCollisionBoxes(definitionId, definition, tilt = 0) {
    if (isPassableDoor(definition, tilt)) return [];
    const { width, height, depth } = orientedSize(definition, tilt);
    const halfX = width / 2;
    const halfY = height / 2;
    const halfZ = depth / 2;
    const box = (minX, minY, maxX, maxY) => ({
        min: { x: minX, y: minY - halfY, z: -halfZ },
        max: { x: maxX, y: maxY - halfY, z: halfZ }
    });
    const opening = archOpening(definitionId, tilt);
    if (!opening) {
        return [box(-halfX, 0, halfX, height)];
    }
    const boxes = [
        box(-halfX, 0, -opening.halfWidth, height),
        box(opening.halfWidth, 0, halfX, height)
    ];
    if (opening.sill > 0) {
        boxes.push(box(-opening.halfWidth, 0, opening.halfWidth, opening.sill));
    }
    const stripWidth = (2 * opening.halfWidth) / ARCH_LINTEL_STRIPS;
    for (let i = 0; i < ARCH_LINTEL_STRIPS; i++) {
        const minX = -opening.halfWidth + i * stripWidth;
        const maxX = minX + stripWidth;
        const outer = Math.max(Math.abs(minX), Math.abs(maxX));
        boxes.push(box(minX, archOpeningHeightAt(opening, outer), maxX, height));
    }
    return boxes;
}

// The boxes a brick at `center`, turned `rotationDegrees` about the vertical
// axis, collides as, each axis-aligned in the same space as `center` (see
// brickAabb(), which a brick of one box gives exactly).
export function brickCollisionBoxes(center, definitionId, definition, rotationDegrees = 0, tilt = 0) {
    const local = localCollisionBoxes(definitionId, definition, tilt);
    if (local.length === 1) {
        return [brickAabb(center, definition, rotationDegrees, tilt)];
    }
    const { cos, sin } = turnOf(rotationDegrees);
    return local.map((part) => {
        const localX = (part.min.x + part.max.x) / 2;
        const localZ = (part.min.z + part.max.z) / 2;
        const x = center.x + localX * cos + localZ * sin;
        const z = center.z - localX * sin + localZ * cos;
        const { halfX, halfZ } = footprintHalfExtents(part.max.x - part.min.x, part.max.z - part.min.z, rotationDegrees);
        return {
            min: { x: x - halfX, y: center.y + part.min.y, z: z - halfZ },
            max: { x: x + halfX, y: center.y + part.max.y, z: z + halfZ }
        };
    });
}

// Whether (x, z) is in the way through a brick: anywhere over a standing
// door, or over a standing arch's opening. There, the brick's top is a roof
// over a passer-by, not ground they would have to climb onto
// (application/avatar/AvatarStepConstraint.js), and an arch's sill, if it
// has one, is what they walk on.
export function passageFloorAt(center, definitionId, definition, rotationDegrees, tilt, x, z) {
    const door = isPassableDoor(definition, tilt);
    const opening = door ? null : archOpening(definitionId, tilt);
    if (!door && !opening) return null;
    const { width, height, depth } = orientedSize(definition, tilt);
    const { cos, sin } = turnOf(rotationDegrees);
    const dx = x - center.x;
    const dz = z - center.z;
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    if (Math.abs(localZ) > depth / 2) return null;
    const bottom = center.y - height / 2;
    if (door) {
        return Math.abs(localX) <= width / 2 ? { height: bottom } : null;
    }
    return Math.abs(localX) < opening.halfWidth ? { height: bottom + opening.sill } : null;
}

// Quarter turns exact, as footprintHalfExtents() keeps them, so a turned
// doorway's jambs land exactly where an unturned one's would.
function turnOf(rotationDegrees) {
    const turn = Number.isFinite(rotationDegrees) ? ((rotationDegrees % 360) + 360) % 360 : 0;
    if (turn === 0) return { cos: 1, sin: 0 };
    if (turn === 90) return { cos: 0, sin: 1 };
    if (turn === 180) return { cos: -1, sin: 0 };
    if (turn === 270) return { cos: 0, sin: -1 };
    const rad = turn * (Math.PI / 180);
    return { cos: Math.cos(rad), sin: Math.sin(rad) };
}
