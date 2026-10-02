// The vehicles other players ride, drawn under them. One visual per riding
// avatar, created when it gets on and removed when it gets off or leaves.
// Its position is the rider's own (a rider's position is the vehicle's, with
// the ground already in it), and it faces the rider's own facing: a rider
// always faces the way its vehicle points (see
// application/avatar/AvatarVehicleMovementController.js), so the two are one
// direction, and a reversing vehicle stays pointing forward.
import { VehicleRenderer } from './VehicleRenderer.js';
import { VehicleVisual } from './VehicleVisual.js';

export class RemoteRiderVehicles {
    constructor(vehicleRenderer = new VehicleRenderer()) {
        this._vehicleRenderer = vehicleRenderer;
        this._entries = new Map(); // avatarId -> { type, visual, heading }
    }

    // Sets what `avatarId` rides (a vehicle type, or null). Returns the scene
    // objects to add and remove for the change: { added, removed }, either null.
    setRiding(avatarId, vehicleType) {
        const entry = this._entries.get(avatarId);
        if (entry && entry.type === vehicleType) {
            return { added: null, removed: null };
        }
        const removed = entry ? this._drop(avatarId) : null;
        if (!vehicleType) {
            return { added: null, removed };
        }
        const visual = new VehicleVisual(this._vehicleRenderer, vehicleType);
        if (!visual.isSupported) {
            visual.dispose();
            return { added: null, removed };
        }
        this._entries.set(avatarId, { type: vehicleType, visual, heading: 0 });
        return { added: visual.root, removed };
    }

    isRiding(avatarId) {
        return this._entries.has(avatarId);
    }

    // Moves the vehicle under a rider now at `position` (already where it is
    // drawn), facing `riderHeading` (degrees), the rider's own facing.
    place(avatarId, position, riderHeading = 0) {
        const entry = this._entries.get(avatarId);
        if (!entry) {
            return;
        }
        if (Number.isFinite(riderHeading)) {
            entry.heading = riderHeading;
        }
        entry.visual.setPosition(position);
        entry.visual.setHeading(entry.heading);
    }

    // The vehicle's heading in degrees, or null when not riding.
    headingOf(avatarId) {
        const entry = this._entries.get(avatarId);
        return entry ? entry.heading : null;
    }

    // Stops drawing `avatarId`'s vehicle; returns its scene object, or null.
    remove(avatarId) {
        return this._entries.has(avatarId) ? this._drop(avatarId) : null;
    }

    roots() {
        return Array.from(this._entries.values(), (entry) => entry.visual.root);
    }

    dispose() {
        for (const avatarId of Array.from(this._entries.keys())) {
            this._drop(avatarId);
        }
    }

    _drop(avatarId) {
        const entry = this._entries.get(avatarId);
        this._entries.delete(avatarId);
        const root = entry.visual.root;
        entry.visual.dispose();
        return root;
    }
}
