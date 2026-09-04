import { VehicleRenderer } from './VehicleRenderer.js';
import { VehicleVisual } from './VehicleVisual.js';
import { isValidVehicleInstance } from '../core/VehicleInstance.js';

// 0.9.115 — Vehicle Rendering.
//
// Every currently-visible vehicle, keyed by `VehicleInstance#id` — the
// renderer-side counterpart to renderer/RemoteSpatialPresenceRenderer.js
// (keyed by deviceId), reused here as a PATTERN, not by subclassing or
// importing that file: a vehicle and a remote participant's camera marker
// are unrelated concerns that happen to share the same "one stable
// Object3D per stable id, created lazily, updated cheaply, torn down
// explicitly" shape.
//
// setVehicle(instance) IS THE ONE ENTRY POINT, AND ITS ONLY DOMAIN INPUT
// IS A VehicleInstance. This is deliberately the `renderVehicleInstance(vehicleInstance)`
// seam this milestone's own brief asks for — see docs/Roadmap.md,
// 0.9.115. It never computes vehicle placement, never decides whether a
// vehicle should exist, never mutates the instance it is handed, and
// never queries core/VehiclePlacement.js or core/VehicleIdentity.js
// itself — a caller (application/WorldNavigationSession.js, via
// application/NearbyVehicleInstances.js) supplies the real, already-
// resolved VehicleInstance; this class only ever turns one into
// something visible.
//
// RENDERS `instance.position`, NEVER `instance.spawnPosition` — THE
// MILESTONE'S OWN CENTRAL REGRESSION. This is the one line in this whole
// milestone that must never read the wrong field, and it is the only
// place that reads either one: renderer/VehicleVisual.js itself has no
// idea `spawnPosition` even exists (see that file's own header).
//
// STABLE IDENTITY ACROSS A POSITION CHANGE. `VehicleInstance#withPosition()`
// returns a brand-new VehicleInstance object carrying the SAME `id`
// (core/VehicleInstance.js's own header, "identity never changes") — so
// calling setVehicle() again with that new instance finds the SAME
// tracked VehicleVisual by id and only updates its position; it never
// tears down and rebuilds the Object3D, and never returns a different
// `root` reference for the same conceptual vehicle. A caller (or a
// selection/picking system built on this later) can therefore hold a
// reference to a vehicle's `root` across any number of position updates
// without it ever going stale.
//
// A VEHICLE TYPE THIS RENDERER HAS NO VISUAL FOR YET IS NEVER TRACKED.
// setVehicle() returns `null` (and adds nothing to `_entries`) the
// moment renderer/VehicleVisual.js's own `isSupported` is false — see
// renderer/VehicleRenderer.js's own header for why this deliberately
// never falls back to the bicycle shape. trackedVehicleIds() therefore
// only ever lists vehicles this renderer actually built something for.
//
// NO SCENE ACCESS OF ANY KIND. Exactly like RemoteSpatialPresenceRenderer
// before it, this class only ever returns/tracks Object3D references —
// it never calls `renderer.add`/`renderer.remove` itself. Deciding when a
// freshly-returned root needs to be added to the scene (first sighting
// only) is its caller's job — see application/RenderWorldViewUseCase.js's
// own `syncVehicles()`.
export class VehicleFieldRenderer {
    constructor(vehicleRenderer = new VehicleRenderer()) {
        this._vehicleRenderer = vehicleRenderer;
        this._entries = new Map(); // vehicle id -> VehicleVisual
    }

    setVehicle(instance) {
        if (!isValidVehicleInstance(instance)) {
            throw new Error('VehicleFieldRenderer.setVehicle requires a real VehicleInstance');
        }
        let visual = this._entries.get(instance.id);
        if (!visual) {
            visual = new VehicleVisual(this._vehicleRenderer, instance.type);
            if (!visual.isSupported) {
                // Nothing built for this type (see this file's own
                // header) — never tracked, never returned, so a caller
                // never adds an empty group to the scene or keeps
                // retrying it on every sync.
                return null;
            }
            this._entries.set(instance.id, visual);
        }
        // The one line this entire file exists to get right — see this
        // file's own header, "Renders instance.position, never
        // instance.spawnPosition."
        visual.setPosition(instance.position);
        // 0.9.123 — Vehicle Orientation. The renderer OBSERVES
        // instance.heading, exactly as it already observes
        // instance.position — never computes a facing of its own. See
        // renderer/VehicleVisual.js's own 0.9.123 header.
        visual.setHeading(instance.heading);
        return visual.root;
    }

    getObject(id) {
        const visual = this._entries.get(id);
        return visual ? visual.root : null;
    }

    removeVehicle(id) {
        const visual = this._entries.get(id);
        if (!visual) {
            return;
        }
        visual.dispose();
        this._entries.delete(id);
    }

    // Every vehicle id currently tracked — lets a caller diff against a
    // freshly-queried set and remove whichever ones dropped out (walked
    // out of render range), mirroring RemoteSpatialPresenceRenderer's own
    // trackedDeviceIds().
    trackedVehicleIds() {
        return Array.from(this._entries.keys());
    }

    clear() {
        for (const id of Array.from(this._entries.keys())) {
            this.removeVehicle(id);
        }
    }

    dispose() {
        this.clear();
    }
}
