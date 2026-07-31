import * as THREE from 'three';

const DEFAULT_FOV = 60;
const DEFAULT_NEAR = 0.1;
const DEFAULT_FAR = 1000;
const DEFAULT_POSITION = { x: 10, y: 10, z: 10 };

export class CameraController {
    constructor(aspect) {
        this._camera = new THREE.PerspectiveCamera(
            DEFAULT_FOV,
            aspect,
            DEFAULT_NEAR,
            DEFAULT_FAR
        );

        this._camera.position.set(
            DEFAULT_POSITION.x,
            DEFAULT_POSITION.y,
            DEFAULT_POSITION.z
        );
        this._camera.lookAt(0, 0, 0);
    }

    get camera() {
        return this._camera;
    }

    setAspect(aspect) {
        this._camera.aspect = aspect;
        this._camera.updateProjectionMatrix();
    }
}
