import * as THREE from 'three';
import { DAY } from '../core/DayCycle.js';

// Every lit surface in this codebase (terrain, trees, wildlife, bricks,
// avatars) uses THREE.MeshStandardMaterial, a physically-based material
// whose diffuse response is energy-conserving (divided by pi) — noticeably
// dimmer, for the same numeric light intensity, than the older
// MeshLambertMaterial/MeshPhongMaterial convention these intensities were
// originally tuned against. A HemisphereLight (sky color from above,
// ground-bounce color from below) replaces the old flat AmbientLight as
// the fill term: unlike a uniform ambient, it still varies with a
// surface's up/down orientation, so a tree canopy or an animal's back —
// facing away from the one DirectionalLight below — reads as outdoor-lit
// rather than collapsing to near-black. Intensities are raised from their
// original values (0.6 ambient / 0.8 directional) to compensate for
// MeshStandardMaterial's dimmer response.
//
// The daytime colors and intensities are core/DayCycle.js's DAY, which
// World View's day and night (applyLook()) starts from. The light comes from
// DEFAULT_DIRECTION, as it always has in the Editor and thumbnails, until
// World View's sun and moon aim it (setDirection()).
const DEFAULT_DIRECTION = Object.freeze({ x: 10, y: 15, z: 8 });
const DIRECTIONAL_DISTANCE = 20;

export class Lights {
    constructor(sceneManager) {
        this._hemisphere = new THREE.HemisphereLight(
            DAY.hemisphereSky,
            DAY.hemisphereGround,
            DAY.hemisphereIntensity
        );

        this._directional = new THREE.DirectionalLight(
            DAY.sunColor,
            DAY.sunIntensity
        );
        this._directional.position.set(DEFAULT_DIRECTION.x, DEFAULT_DIRECTION.y, DEFAULT_DIRECTION.z);

        sceneManager.add(this._hemisphere);
        sceneManager.add(this._directional);
    }

    // Lights the scene as `look` (shaped like core/DayCycle.js's DAY) says.
    applyLook(look) {
        this._hemisphere.color.setHex(look.hemisphereSky);
        this._hemisphere.groundColor.setHex(look.hemisphereGround);
        this._hemisphere.intensity = look.hemisphereIntensity;
        this._directional.color.setHex(look.sunColor);
        this._directional.intensity = look.sunIntensity;
    }

    // Aims the directional light from `direction` (a unit vector towards the
    // sun or the moon); the light shines on the origin, and as it is
    // directional only its direction matters.
    setDirection(direction) {
        this._directional.position.set(
            direction.x * DIRECTIONAL_DISTANCE,
            direction.y * DIRECTIONAL_DISTANCE,
            direction.z * DIRECTIONAL_DISTANCE
        );
    }

    get hemisphere() {
        return this._hemisphere;
    }

    get directional() {
        return this._directional;
    }
}
