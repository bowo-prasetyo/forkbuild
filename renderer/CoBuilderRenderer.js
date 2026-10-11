import * as THREE from 'three';

// Build with me (application/buildTogether/BuildTogetherSession.js): where
// each co-builder points, and what each has selected, drawn in their own
// colour: a marker standing where their pointer is, and an outline round
// each brick they have selected. Separate from SelectionRenderer, which
// stays this Editor's own selection only (docs/principles/collaboration.md,
// "Remote Selection Observation Is Never Local Editing Selection").
//
// show(coBuilders) replaces what is drawn; a co-builder with no pointer and
// nothing selected draws nothing.

const MAX_OUTLINED_BRICKS = 60;
const MARKER_HEIGHT = 0.9;

export class CoBuilderRenderer {
    constructor(renderer, brickInstances) {
        this._renderer = renderer;
        this._brickInstances = brickInstances;
        this._objects = [];
        this._box = new THREE.Box3();
    }

    show(coBuilders = []) {
        this.clear();
        let outlined = 0;
        for (const person of coBuilders) {
            const color = new THREE.Color(person.color ?? 0xffffff);
            if (person.pointer) this._add(this._marker(person.pointer, color));
            for (const brickId of person.selection || []) {
                if (outlined >= MAX_OUTLINED_BRICKS) break;
                const bounds = this._brickInstances.has(brickId) ? this._brickInstances.getBounds(brickId, this._box) : null;
                if (!bounds) continue;
                const helper = new THREE.Box3Helper(bounds.clone().expandByScalar(0.03), color);
                helper.material.depthTest = false;
                helper.renderOrder = 10;
                this._add(helper);
                outlined++;
            }
        }
    }

    clear() {
        for (const object of this._objects) {
            this._renderer.remove(object);
            object.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
        this._objects = [];
    }

    dispose() {
        this.clear();
    }

    _add(object) {
        this._renderer.add(object);
        this._objects.push(object);
    }

    _marker(point, color) {
        const group = new THREE.Group();
        const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false });
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 12), material);
        cone.rotation.x = Math.PI;
        cone.position.y = MARKER_HEIGHT;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.36, 24), material.clone());
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        group.add(cone, ring);
        group.position.set(point.x, point.y, point.z);
        group.renderOrder = 10;
        return group;
    }
}
