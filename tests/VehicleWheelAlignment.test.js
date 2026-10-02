// Wheels roll the way the vehicle goes. For each wheeled vehicle, drawn
// through the real VehicleVisual at several headings, every wheel stands
// upright with its axle across the direction of travel (heading 0 = +Z,
// core/VehicleInstance.js). A quarter turn in the wheel builders once stood
// every wheel sideways, so the vehicles drove perpendicular to their tyres.
import * as THREE from 'three';
import { VehicleRenderer } from '../renderer/VehicleRenderer.js';
import { VehicleVisual } from '../renderer/VehicleVisual.js';
import { VehicleType } from '../core/VehicleType.js';
import { assert } from './support/Assert.js';

const renderer = new VehicleRenderer();
const EXPECTED_WHEELS = { [VehicleType.BICYCLE]: 2, [VehicleType.MOTORCYCLE]: 2, [VehicleType.CAR]: 4 };

for (const [type, wheelCount] of Object.entries(EXPECTED_WHEELS)) {
    for (const heading of [0, 45, 90, 200, 315]) {
        const visual = new VehicleVisual(renderer, type);
        visual.setHeading(heading);
        visual.root.updateMatrixWorld(true);
        const radians = heading * (Math.PI / 180);
        const travel = new THREE.Vector3(Math.sin(radians), 0, Math.cos(radians));

        const wheels = [];
        visual.root.traverse((object) => {
            if (object.geometry && object.geometry.type === 'TorusGeometry') {
                wheels.push(object);
            }
        });
        assert(wheels.length === wheelCount, `${type}: has ${wheelCount} wheels, found ${wheels.length}`);

        for (const [i, wheel] of wheels.entries()) {
            // A torus's axle is its local Z.
            const axle = new THREE.Vector3(0, 0, 1).transformDirection(wheel.matrixWorld);
            assert(Math.abs(axle.y) < 1e-9, `${type} at ${heading}°, wheel ${i}: stands upright (horizontal axle)`);
            assert(Math.abs(axle.dot(travel)) < 1e-9, `${type} at ${heading}°, wheel ${i}: axle is across the direction of travel, so it rolls that way`);
        }

        // The body points the way it travels (models face local +X).
        const forward = new THREE.Vector3(1, 0, 0).transformDirection(visual.root.matrixWorld);
        assert(forward.dot(travel) > 1 - 1e-9, `${type} at ${heading}°: the body faces the direction of travel`);
        visual.dispose();
    }
    console.log(`✓ ${type}: wheels roll the way it goes`);
}
