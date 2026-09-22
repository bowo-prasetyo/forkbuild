import * as THREE from 'three';
import { SPECIES_PRESET } from './WildlifeTileMesh.js';

// 0.9.701 — Released Animal Rendering.
//
// The renderer-side "dumb executor" for an ANIMAL_SPECIES, the exact
// role renderer/VehicleRenderer.js already plays for a VehicleType: it
// knows how to turn a closed vocabulary value into actual Three.js
// geometry, and nothing else — no opinion on WHERE an animal is (that's
// renderer/AnimalVisual.js's job), WHICH animals currently exist
// (application/AnimalRuntimeInstances.js's job), or whether one should
// be visible right now (renderer/AnimalFieldRenderer.js's job).
//
// REUSES renderer/WildlifeTileMesh.js's OWN SPECIES_PRESET, NEVER A
// SECOND SHAPE DEFINITION. A caught-then-released rabbit must look like
// the exact same rabbit this codebase already draws standing decorative
// in a forest — see that file's own header for why `SPECIES_PRESET` was
// exported specifically for this. This file never redefines
// bodyRadiusX/headColor/furColors/etc. of its own.
//
// GEOMETRY IS SHARED AND NEVER DISPOSED HERE; MATERIALS ARE CLONED AND
// OWNED PER INSTANCE. `SPECIES_PRESET`'s own `bodyGeometry`/
// `headGeometry` are built once, at WildlifeTileMesh.js's own module
// load, and already live forever for the life of the page — the tile
// system itself never disposes them (a wildlife tile is rebuilt by
// swapping its per-tile InstancedMesh transforms, never by rebuilding
// the shared species geometry). A released animal's own visual
// (renderer/AnimalVisual.js) reuses that SAME geometry object directly
// — disposing it when ONE released animal is removed would corrupt
// EVERY other currently-visible animal of that species, tile-baked or
// individually-rendered alike. Only the MATERIAL is cloned per call,
// since color could plausibly vary per instance later and a clone is
// cheap, safe to dispose independently, and never shared with the tile
// system's own bodyMaterial/headMaterial instances.
//
// NO SCALE, ROTATION, OR VARIANT — core/AnimalPresence.js carries only
// id/species/position, unlike core/WildlifeField.js's own decorative
// record (which also has rotationY/scale/variant, baked in at
// placement time by a deterministic formula this file has no access to
// for a caught-then-released animal, which was never placed by that
// formula at all — see core/AvatarAnimalCatchTransition.js's own
// header). A released animal therefore always renders at this preset's
// own first fur color, unscaled, at zero rotation — a real but
// deliberately minor visual regression versus its tile-baked
// appearance, not a bug: there is no deterministic fact left to recover
// once an animal has been caught and re-released.
//
// NO POSITION, NO ANIMATION, NO STATE OF ANY KIND — build() constructs
// a brand new Object3D graph on every call, exactly the same "dumb
// executor, no instance bookkeeping" discipline
// renderer/VehicleRenderer.js's own header already establishes.
export class AnimalRenderer {
    build(species) {
        const preset = SPECIES_PRESET[species];
        if (!preset) {
            return null;
        }
        const group = new THREE.Group();

        const bodyMaterial = preset.bodyMaterial.clone();
        bodyMaterial.color.copy(preset.furColors[0]);
        group.add(new THREE.Mesh(preset.bodyGeometry, bodyMaterial));

        const headMaterial = preset.headMaterial.clone();
        group.add(new THREE.Mesh(preset.headGeometry, headMaterial));

        return group;
    }
}
