import * as THREE from 'three';

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
const HEMISPHERE_SKY_COLOR = 0xbfd9ff;
const HEMISPHERE_GROUND_COLOR = 0x4a3d2e;
const HEMISPHERE_INTENSITY = 1.0;

const DIRECTIONAL_COLOR = 0xffffff;
const DIRECTIONAL_INTENSITY = 1.8;
const DIRECTIONAL_POSITION = { x: 10, y: 15, z: 8 };

export class Lights {
    constructor(sceneManager) {
        this._hemisphere = new THREE.HemisphereLight(
            HEMISPHERE_SKY_COLOR,
            HEMISPHERE_GROUND_COLOR,
            HEMISPHERE_INTENSITY
        );

        this._directional = new THREE.DirectionalLight(
            DIRECTIONAL_COLOR,
            DIRECTIONAL_INTENSITY
        );
        this._directional.position.set(
            DIRECTIONAL_POSITION.x,
            DIRECTIONAL_POSITION.y,
            DIRECTIONAL_POSITION.z
        );

        sceneManager.add(this._hemisphere);
        sceneManager.add(this._directional);
    }

    get hemisphere() {
        return this._hemisphere;
    }

    get directional() {
        return this._directional;
    }
}
