import * as THREE from 'three';
import { footprintFade } from '../core/Footprints.js';

// The local avatar's footprints in the snow (core/Footprints.js), drawn on
// this device only: a little dent pressed into the snow for each, lying on
// the ground as it slopes, fading out as core/Footprints.js#footprintFade()
// says. One draw call for the whole trail, and none at all while there is
// no print to show.
//
// The newest MAX_PRINTS are kept, in a ring; a print is a flat oval a
// sole's size, seen through, blue-grey as snow in a hollow is, drawn just
// above the ground so the snow it was pressed into never covers it.

export const MAX_PRINTS = 96;
const SOLE_LENGTH = 0.27;
const SOLE_WIDTH = 0.11;
const LIFT = 0.025;
const DENT_COLOUR = 0x9aa6bd;
const DENT_OPACITY = 0.55;
// How far each side to sample the ground for its slope.
const SLOPE_STEP = 0.3;

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _turn = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _normal = new THREE.Vector3();

export class FootprintTrail {
    // `heightAt(x, z)`: the ground's height there.
    constructor(sceneManager, { heightAt }) {
        this._sceneManager = sceneManager;
        this._heightAt = heightAt;
        this._prints = [];
        this._next = 0;
        const geometry = new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2);
        geometry.scale(SOLE_WIDTH, 1, SOLE_LENGTH);
        this._fade = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PRINTS), 1);
        geometry.setAttribute('printFade', this._fade);
        const material = new THREE.MeshStandardMaterial({
            color: DENT_COLOUR,
            roughness: 0.95,
            transparent: true,
            opacity: DENT_OPACITY,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        });
        material.onBeforeCompile = (shader) => {
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nattribute float printFade;\nvarying float vPrintFade;')
                .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvPrintFade = printFade;');
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\nvarying float vPrintFade;')
                .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.a *= vPrintFade;');
        };
        material.customProgramCacheKey = () => 'forkbuild-footprints';
        this._mesh = new THREE.InstancedMesh(geometry, material, MAX_PRINTS);
        this._mesh.count = 0;
        this._mesh.frustumCulled = false;
        this._mesh.receiveShadow = true;
        this._mesh.visible = false;
        this._mesh.name = 'footprints';
        sceneManager.add(this._mesh);
    }

    get mesh() {
        return this._mesh;
    }

    // How many prints are showing.
    get count() {
        return this._prints.length;
    }

    // Presses `print` (core/Footprints.js#advanceFootprints()'s) into the snow.
    add(print) {
        if (!print || !Number.isFinite(print.x) || !Number.isFinite(print.z)) return;
        const slot = this._prints.length < MAX_PRINTS ? this._prints.length : this._next;
        this._prints[slot] = print;
        this._next = (slot + 1) % MAX_PRINTS;
        const y = this._heightAt(print.x, print.z);
        const dx = this._heightAt(print.x + SLOPE_STEP, print.z) - this._heightAt(print.x - SLOPE_STEP, print.z);
        const dz = this._heightAt(print.x, print.z + SLOPE_STEP) - this._heightAt(print.x, print.z - SLOPE_STEP);
        _normal.set(-dx, 2 * SLOPE_STEP, -dz).normalize();
        _quaternion.setFromUnitVectors(_up, _normal);
        _turn.setFromAxisAngle(_up, print.heading || 0);
        _quaternion.multiply(_turn);
        _position.set(print.x, y + LIFT, print.z);
        this._mesh.setMatrixAt(slot, _matrix.compose(_position, _quaternion, _scale));
        this._mesh.instanceMatrix.needsUpdate = true;
        this._mesh.count = this._prints.length;
    }

    // Fades every print for `now` (the clock the prints were made on) and the
    // snow lying, `snowCover`; forgets them all once none shows.
    update(now, snowCover) {
        if (this._prints.length === 0) {
            this._mesh.visible = false;
            return;
        }
        let showing = 0;
        for (let i = 0; i < this._prints.length; i++) {
            const fade = footprintFade(this._prints[i].at, now, snowCover);
            this._fade.array[i] = fade;
            if (fade > 0) showing++;
        }
        this._fade.needsUpdate = true;
        if (showing === 0) {
            this.clear();
            return;
        }
        this._mesh.visible = true;
    }

    clear() {
        this._prints = [];
        this._next = 0;
        this._mesh.count = 0;
        this._mesh.visible = false;
    }

    dispose() {
        this._sceneManager.remove(this._mesh);
        this._mesh.geometry.dispose();
        this._mesh.material.dispose();
    }
}
