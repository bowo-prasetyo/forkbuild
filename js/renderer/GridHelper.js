import * as THREE from 'three';

const DEFAULT_SIZE = 100;
const DEFAULT_DIVISIONS = 100;
const CENTER_LINE_COLOR = 0x444444;
const GRID_LINE_COLOR = 0x888888;

export class GridHelper {
    constructor(sceneManager, size = DEFAULT_SIZE, divisions = DEFAULT_DIVISIONS) {
        this._helper = new THREE.GridHelper(
            size,
            divisions,
            CENTER_LINE_COLOR,
            GRID_LINE_COLOR
        );

        sceneManager.add(this._helper);
    }

    get helper() {
        return this._helper;
    }
}
