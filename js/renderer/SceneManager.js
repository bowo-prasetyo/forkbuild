import * as THREE from 'three';

export class SceneManager {
    constructor() {
        this._scene = new THREE.Scene();
    }

    get scene() {
        return this._scene;
    }

    add(object) {
        this._scene.add(object);
    }

    remove(object) {
        this._scene.remove(object);
    }
}
