import { findBuildEntrance, hasWalkedInside } from '../../core/world/BuildEntrance.js';
import { terrainHeightAt } from '../../core/nature/TerrainHeightField.js';

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
        const entrance = findBuildEntrance(bricks, this._registry);
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
