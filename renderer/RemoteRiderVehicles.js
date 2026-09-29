// The vehicles other players ride, drawn under them. One visual per riding
// avatar, created when it gets on and removed when it gets off or leaves.
// Its position is the rider's own (a rider's position is the vehicle's, with
// the ground already in it), and it faces the way it last moved: a rider can
// turn to look around without turning the vehicle.
import { VehicleRenderer } from './VehicleRenderer.js';
import { VehicleVisual } from './VehicleVisual.js';
import { resolveVehicleHeadingFromMovement } from '../core/VehicleMovementHeading.js';

// Smaller moves than this (interpolation settling) don't turn the vehicle.
const MIN_TURNING_MOVE = 0.02;

export class RemoteRiderVehicles {
    constructor(vehicleRenderer = new VehicleRenderer()) {
        this._vehicleRenderer = vehicleRenderer;
        this._entries = new Map(); // avatarId -> { type, visual, last, heading }
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
        this._entries.set(avatarId, { type: vehicleType, visual, last: null, heading: null });
        return { added: visual.root, removed };
    }

    isRiding(avatarId) {
        return this._entries.has(avatarId);
    }

    // Moves the vehicle under a rider now at `position` (already where it is
    // drawn). `fallbackHeading` (degrees) faces a vehicle that hasn't moved yet.
    place(avatarId, position, fallbackHeading = 0) {
        const entry = this._entries.get(avatarId);
        if (!entry) {
            return;
        }
        if (entry.heading === null) {
            entry.heading = Number.isFinite(fallbackHeading) ? fallbackHeading : 0;
        }
        if (entry.last) {
            const dx = position.x - entry.last.x;
            const dz = position.z - entry.last.z;
            if (Math.hypot(dx, dz) >= MIN_TURNING_MOVE) {
                entry.heading = resolveVehicleHeadingFromMovement({ dx, dz, previousHeading: entry.heading });
                entry.last = { x: position.x, z: position.z };
            }
        } else {
            entry.last = { x: position.x, z: position.z };
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
