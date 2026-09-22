import { AnimalRenderer } from './AnimalRenderer.js';
import { AnimalVisual } from './AnimalVisual.js';
import { AnimalPresence } from '../core/AnimalPresence.js';

// 0.9.701 — Released Animal Rendering. The direct structural twin of
// renderer/VehicleFieldRenderer.js, applied to released animals instead
// of vehicles.
//
// setAnimal(instance) IS THE ONE ENTRY POINT, AND ITS ONLY DOMAIN INPUT
// IS AN AnimalPresence. It never decides which animals should exist or
// be visible — a caller (application/WorldNavigationSession.js, via
// application/AnimalRuntimeInstances.js#releasedNearby()) supplies the
// real, already-resolved set; this class only ever turns one into
// something visible.
//
// releasedNearby(), NEVER THE STORE'S FULL nearby()/sync() RESULT. This
// is the one thing a caller must get right, and this file's own header
// says so loudly precisely because it cannot enforce it: passing every
// tracked animal here — including ones application/AnimalRuntimeInstances.js
// merely DISCOVERED from the deterministic field, never released —
// would render a second, individually-tracked copy of an animal
// renderer/WildlifeTileMesh.js's own tile system is already drawing,
// doubling it visibly. See that store's own `releasedNearby()` header
// for the exact distinction.
//
// STABLE IDENTITY ACROSS A POSITION CHANGE, AN ANIMAL TYPE THIS
// RENDERER HAS NO VISUAL FOR IS NEVER TRACKED, NO SCENE ACCESS OF ANY
// KIND — all three, the identical discipline
// renderer/VehicleFieldRenderer.js's own header already documents in
// full for itself.
export class AnimalFieldRenderer {
    constructor(animalRenderer = new AnimalRenderer()) {
        this._animalRenderer = animalRenderer;
        this._entries = new Map(); // animal id -> AnimalVisual
    }

    setAnimal(instance) {
        if (!(instance instanceof AnimalPresence)) {
            throw new Error('AnimalFieldRenderer.setAnimal requires a real AnimalPresence');
        }
        let visual = this._entries.get(instance.id);
        if (!visual) {
            visual = new AnimalVisual(this._animalRenderer, instance.species);
            if (!visual.isSupported) {
                return null;
            }
            this._entries.set(instance.id, visual);
        }
        visual.setPosition(instance.position);
        return visual.root;
    }

    getObject(id) {
        const visual = this._entries.get(id);
        return visual ? visual.root : null;
    }

    removeAnimal(id) {
        const visual = this._entries.get(id);
        if (!visual) {
            return;
        }
        visual.dispose();
        this._entries.delete(id);
    }

    // Every animal id currently tracked — lets a caller diff against a
    // freshly-queried set and remove whichever ones dropped out (walked
    // out of render range, or caught again).
    trackedAnimalIds() {
        return Array.from(this._entries.keys());
    }

    clear() {
        for (const id of Array.from(this._entries.keys())) {
            this.removeAnimal(id);
        }
    }

    dispose() {
        this.clear();
    }
}
