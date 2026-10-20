// Checks whether a proposed placement is valid. Lives in core/ rather
// than application/ even though PlacementTool is its only caller today:
// "is this placement legal" is a World-level invariant, the same rule a
// future multiplayer server would need to enforce before accepting a
// PlaceBrickCommand from a client — not just client-side UI convenience.
//
// Today: only checks that the target position isn't already occupied by
// another brick in the same building (exact-position match), iterating
// every brick in the building because no SpatialIndex exists yet.
// Deliberately not written to assume that's permanent — a future
// SpatialIndex would turn this into an O(1) lookup without
// PlacementValidator's public shape changing.
export class PlacementValidator {
    canPlace(world, buildingId, position) {
        const building = world.getBuilding(buildingId);
        if (!building) {
            return false;
        }
        return !building.getBricks().some((brick) => brick.position.equals(position));
    }
}
