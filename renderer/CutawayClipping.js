import * as THREE from 'three';

// The cutaway that lets the player see into the build they stand in
// (core/building/IndoorView.js): everything of that build above the cut height is not
// drawn, so the room shows from above, the walls standing to the cut. Five
// planes shared by every brick material World View draws, clipping only
// where all five agree (`clipIntersection`): above `y`, and inside the
// build's footprint. Moving the planes recompiles nothing; with no cutaway
// the height plane sits far above the sky and nothing is clipped.
//
// Only what is drawn changes: a clipped brick is still there to walk into,
// pick and collide with, exactly as before.
const NOWHERE = 1e9;

export class CutawayClipping {
    constructor() {
        this._above = new THREE.Plane(new THREE.Vector3(0, -1, 0), NOWHERE);
        this._east = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
        this._west = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
        this._north = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
        this._south = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        this.planes = [this._above, this._east, this._west, this._north, this._south];
        this._cutaway = null;
    }

    // Lets `material` be cut away. Its own clipping planes, if any, are replaced.
    apply(material) {
        if (!material) return material;
        material.clippingPlanes = this.planes;
        material.clipIntersection = true;
        material.clipShadows = true;
        material.needsUpdate = true;
        return material;
    }

    // `cutaway`: `{ minX, maxX, minZ, maxZ, y }` in world coordinates, or null
    // to draw everything. A plane keeps a point when its distance is positive,
    // so each faces out of the region it cuts.
    set(cutaway) {
        this._cutaway = cutaway || null;
        if (!this._cutaway) {
            this._above.constant = NOWHERE;
            return;
        }
        this._above.constant = cutaway.y;
        this._east.constant = cutaway.minX;
        this._west.constant = -cutaway.maxX;
        this._north.constant = cutaway.minZ;
        this._south.constant = -cutaway.maxZ;
    }

    get cutaway() {
        return this._cutaway;
    }

    // Whether a point is clipped: the same test the GPU makes.
    clips(point) {
        return this.planes.every((plane) => plane.distanceToPoint(point) < 0);
    }
}
