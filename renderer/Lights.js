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
const DEFAULT_DIRECTION = new THREE.Vector3(10, 15, 8).normalize();
// How far towards the sun or the moon the light stands from where it shines
// (setFocus()): only its direction lights anything, but its shadow camera
// starts there, so this must clear the tallest build near the focus.
const DIRECTIONAL_DISTANCE = 120;
// While the sun hands over to the moon or back, the directional light gives
// up some of its strength (setDirection()'s `strength`); this share of what
// it gives up is spread over the whole scene as fill instead, so the scene
// dims a little, not sharply, while shadows fade.
const HANDOVER_FILL_SHARE = 0.5;

export class Lights {
    constructor(sceneManager) {
        this._look = DAY;
        this._strength = 1;
        this._direction = DEFAULT_DIRECTION.clone();
        this._focus = new THREE.Vector3();

        this._hemisphere = new THREE.HemisphereLight(
            DAY.hemisphereSky,
            DAY.hemisphereGround,
            DAY.hemisphereIntensity
        );

        this._directional = new THREE.DirectionalLight(
            DAY.sunColor,
            DAY.sunIntensity
        );
        this._place();

        sceneManager.add(this._hemisphere);
        sceneManager.add(this._directional);
        // In the scene so it moves with setFocus() (renderer/SunShadows.js).
        sceneManager.add(this._directional.target);
    }

    // Lights the scene as `look` (shaped like core/DayCycle.js's DAY) says.
    applyLook(look) {
        this._look = look;
        this._hemisphere.color.setHex(look.hemisphereSky);
        this._hemisphere.groundColor.setHex(look.hemisphereGround);
        this._directional.color.setHex(look.sunColor);
        this._applyIntensities();
    }

    // Aims the directional light from `direction` (a unit vector towards the
    // sun or the moon) with `strength` (0 to 1, core/DayCycle.js's
    // lightStrength) of the look's sun (moon) light.
    setDirection(direction, strength = 1) {
        this._direction.set(direction.x, direction.y, direction.z).normalize();
        this._strength = Number.isFinite(strength) ? Math.min(Math.max(strength, 0), 1) : 1;
        this._place();
        this._applyIntensities();
    }

    // Where the light shines on: the middle of what its shadows cover.
    setFocus(point) {
        this._focus.set(point.x, point.y, point.z);
        this._place();
    }

    // The unit direction towards the sun or the moon.
    get direction() {
        return this._direction;
    }

    get hemisphere() {
        return this._hemisphere;
    }

    get directional() {
        return this._directional;
    }

    _place() {
        this._directional.position.copy(this._focus).addScaledVector(this._direction, DIRECTIONAL_DISTANCE);
        this._directional.target.position.copy(this._focus);
    }

    _applyIntensities() {
        const look = this._look;
        const handedOver = look.sunIntensity * (1 - this._strength);
        this._directional.intensity = look.sunIntensity * this._strength;
        this._hemisphere.intensity = look.hemisphereIntensity + handedOver * HANDOVER_FILL_SHARE;
    }
}
