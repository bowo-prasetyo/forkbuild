import { entranceSearchArea, findBuildEntrance, hasWalkedInside } from '../../core/world/BuildEntrance.js';
import { terrainHeightAt } from '../../core/nature/TerrainHeightField.js';
import { treeCollisionGeometryInRegion } from '../../core/nature/TreeCollisionGeometry.js';
import { MAX_TREE_COLLISION_RADIUS } from '../../core/avatar/AvatarTreeCollisionQuery.js';

// How far behind the arriving avatar, and how high, the camera starts:
// looking past them at the door, the way a third-person camera would.
const ARRIVAL_CAMERA_BACK = 5;
const ARRIVAL_CAMERA_HEIGHT = 2.5;
// The height on the door the camera looks at.
const ARRIVAL_LOOK_HEIGHT = 1.2;

// Arriving at a build's door: the Editor's Walk inside it (after Publish)
// opens World View on `/world/:id?arrive=door`, and World View calls
// arriveAtEntrance(). The avatar is put on open ground in front of the
// build's door, facing it, and the camera looks past them at it
// (core/world/BuildEntrance.js picks the spot). Like goHome(), this moves the
// avatar on purpose: the person asked to go there.
//
// arrivalState() then says whether the avatar has walked in through that
// door, which the guided first build's last step waits for.
//
// Trees grow wherever the World's seed puts them. One under the build's own
// bricks gives way to it (application/world/TreeDisplacement.js); one in
// front of its door still stands, so the spot is chosen so that walking
// straight ahead doesn't slide round it into the door's jamb (treesAround()).

// The trunks round a build at `layout` (in shared space, as the avatar's tree
// collision meets them): the session then keeps those still standing, since
// one under the build's own bricks gives way to it (_standingTrees()).
function treesAround(bricks, registry, layout, seed) {
    const area = entranceSearchArea(bricks, registry);
    if (!area) {
        return [];
    }
    return treeCollisionGeometryInRegion(
        seed,
        layout.x + area.minX - MAX_TREE_COLLISION_RADIUS,
        layout.z + area.minZ - MAX_TREE_COLLISION_RADIUS,
        layout.x + area.maxX + MAX_TREE_COLLISION_RADIUS,
        layout.z + area.maxZ + MAX_TREE_COLLISION_RADIUS
    );
}

// A trunk in the build's own coordinates, as findBuildEntrance() takes it.
function inBuild(tree, layout) {
    return { center: { x: tree.center.x - layout.x, z: tree.center.z - layout.z }, radius: tree.radius };
}

export const arrivalMethods = {
    // Focuses `documentId` and arrives at its door, now if its content is
    // loaded, or as soon as _loadWorld() has it. False for no document.
    arriveAtEntrance(documentId) {
        if (!documentId) {
            return false;
        }
        this.focusDocument(documentId);
        this._arrival = { documentId, entrance: null, walkedInside: false };
        if (this._loadedDocuments.has(documentId)) {
            this._applyArrival(documentId);
        }
        return true;
    },

    // Called by _loadWorld(): finishes an arrival asked for before the
    // document was loaded.
    _settlePendingArrival(documentId) {
        if (this._arrival && this._arrival.documentId === documentId && !this._arrival.entrance) {
            this._applyArrival(documentId);
        }
    },

    _applyArrival(documentId) {
        const document = this._loadedDocuments.get(documentId);
        const layout = this._getWorldPosition(documentId);
        if (!document || !layout) {
            return;
        }
        const bricks = [];
        for (const building of document.world.getBuildings()) {
            for (const brick of building.getBricks()) bricks.push(brick);
        }
        const trees = treesAround(bricks, this._registry, layout, this.getWorldSeed());
        const standing = typeof this._standingTrees === 'function' ? this._standingTrees(trees) : trees;
        const entrance = findBuildEntrance(bricks, this._registry, { obstacles: standing.map((tree) => inBuild(tree, layout)) });
        if (!entrance) {
            return;
        }
        this._arrival = { documentId, entrance, walkedInside: false };
        const stand = { x: layout.x + entrance.stand.x, y: layout.y + entrance.stand.y, z: layout.z + entrance.stand.z };
        if (this._avatarPresenceSession) {
            // Presence heights are measured from the ground under the avatar.
            this._avatarPresenceSession.update({ position: stand, rotation: { x: 0, y: entrance.heading, z: 0 } });
        }
        // The camera, unlike the avatar, is in drawn coordinates: the build
        // stands on the ground at its own origin.
        const ground = terrainHeightAt(this.getWorldSeed(), layout.x, layout.z);
        const heading = (entrance.heading * Math.PI) / 180;
        const forward = { x: Math.sin(heading), z: Math.cos(heading) };
        const look = entrance.door
            ? { x: layout.x + entrance.door.x, z: layout.z + entrance.door.z }
            : { x: stand.x + forward.x * ARRIVAL_CAMERA_BACK, z: stand.z + forward.z * ARRIVAL_CAMERA_BACK };
        const floor = ground + layout.y + entrance.stand.y;
        this._beginCameraFocus({
            position: {
                x: stand.x - forward.x * ARRIVAL_CAMERA_BACK,
                y: floor + ARRIVAL_CAMERA_HEIGHT,
                z: stand.z - forward.z * ARRIVAL_CAMERA_BACK
            },
            target: { x: look.x, y: floor + ARRIVAL_LOOK_HEIGHT, z: look.z }
        });
        this.updateSpatialView();
    },

    // The arrival World View is following, or null: { documentId, kind
    // ('door' or 'front'), walkedInside }. walkedInside turns true once the
    // avatar has gone in through the door (a build with no door: on
    // arriving), and stays true.
    arrivalState() {
        const arrival = this._arrival;
        if (!arrival || !arrival.entrance) {
            return null;
        }
        if (!arrival.walkedInside && !this._avatarPresenceSession) {
            // Nobody to walk in (no avatar): arriving is all there is.
            arrival.walkedInside = true;
        } else if (!arrival.walkedInside) {
            const layout = this._getWorldPosition(arrival.documentId);
            const position = this._avatarPresenceSession.current.position;
            if (layout && position) {
                arrival.walkedInside = hasWalkedInside(arrival.entrance, {
                    x: position.x - layout.x,
                    z: position.z - layout.z
                });
            }
        }
        return { documentId: arrival.documentId, kind: arrival.entrance.kind, walkedInside: arrival.walkedInside };
    }
};
