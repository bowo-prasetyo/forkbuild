import * as THREE from 'three';

const AMBIENT_COLOR = 0xffffff;
const AMBIENT_INTENSITY = 0.6;

const DIRECTIONAL_COLOR = 0xffffff;
const DIRECTIONAL_INTENSITY = 0.8;
const DIRECTIONAL_POSITION = { x: 10, y: 15, z: 8 };

export class Lights {
    constructor(sceneManager) {
        this._ambient = new THREE.AmbientLight(AMBIENT_COLOR, AMBIENT_INTENSITY);

        this._directional = new THREE.DirectionalLight(
            DIRECTIONAL_COLOR,
            DIRECTIONAL_INTENSITY
        );
        this._directional.position.set(
            DIRECTIONAL_POSITION.x,
            DIRECTIONAL_POSITION.y,
            DIRECTIONAL_POSITION.z
        );

        sceneManager.add(this._ambient);
        sceneManager.add(this._directional);
    }

    get ambient() {
        return this._ambient;
    }

    get directional() {
        return this._directional;
    }
}
