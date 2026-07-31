import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Position } from '../core/Position.js';
import { CameraState } from './CameraState.js';

const DEFAULT_FOV = 60;
const DEFAULT_NEAR = 0.1;
const DEFAULT_FAR = 1000;

const DEFAULT_MIN_DISTANCE = 2;
const DEFAULT_MAX_DISTANCE = 150;
// Just under 90 degrees so the camera can't orbit below the grid plane.
const DEFAULT_MAX_POLAR_ANGLE = Math.PI / 2 - 0.01;

const RESET_KEY = 'Home';

// Owns the camera and everything needed to move it around by hand: orbit,
// pan, and zoom (all provided by OrbitControls out of the box), plus resize
// and reset. This class only knows how to be *driven* — focus(), saved/
// restored state, and smooth transitions are Camera Intelligence (0.1.8)
// and deliberately live elsewhere once they exist.
export class CameraController {
    constructor(domElement, aspect) {
        this._camera = new THREE.PerspectiveCamera(DEFAULT_FOV, aspect, DEFAULT_NEAR, DEFAULT_FAR);

        this._defaultState = new CameraState();
        this._applyState(this._defaultState, this._camera);

        this._controls = new OrbitControls(this._camera, domElement);
        this._controls.target.set(
            this._defaultState.target.x,
            this._defaultState.target.y,
            this._defaultState.target.z
        );
        this._controls.enableDamping = true;
        this._controls.dampingFactor = 0.08;
        this._controls.minDistance = DEFAULT_MIN_DISTANCE;
        this._controls.maxDistance = DEFAULT_MAX_DISTANCE;
        this._controls.maxPolarAngle = DEFAULT_MAX_POLAR_ANGLE;
        this._controls.update();

        this._onKeyDown = this._onKeyDown.bind(this);
        window.addEventListener('keydown', this._onKeyDown);
    }

    get camera() {
        return this._camera;
    }

    setAspect(aspect) {
        this._camera.aspect = aspect;
        this._camera.updateProjectionMatrix();
    }

    // Called once per frame by Renderer so OrbitControls damping/inertia
    // keeps animating even when the user isn't actively dragging.
    update() {
        this._controls.update();
    }

    resetView() {
        this.setState(this._defaultState);
    }

    getState() {
        return new CameraState({
            position: new Position(this._camera.position.x, this._camera.position.y, this._camera.position.z),
            target: new Position(this._controls.target.x, this._controls.target.y, this._controls.target.z),
            zoom: this._camera.zoom
        });
    }

    setState(state) {
        this._applyState(state, this._camera);
        this._controls.target.set(state.target.x, state.target.y, state.target.z);
        this._camera.updateProjectionMatrix();
        this._controls.update();
    }

    dispose() {
        window.removeEventListener('keydown', this._onKeyDown);
        this._controls.dispose();
    }

    _applyState(state, camera) {
        camera.position.set(state.position.x, state.position.y, state.position.z);
        camera.zoom = state.zoom;
        camera.lookAt(state.target.x, state.target.y, state.target.z);
    }

    _onKeyDown(event) {
        if (event.key === RESET_KEY) {
            this.resetView();
        }
    }
}
