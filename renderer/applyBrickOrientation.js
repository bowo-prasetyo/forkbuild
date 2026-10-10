import { normalizeTilt } from '../core/BrickOrientation.js';

// Sets an object's rotation to a brick's tilt then turn (core/BrickOrientation.js,
// Euler order 'YXZ'). Assigns the order and each axis on its own, so it also
// works on any object whose rotation is a plain { x, y } holder.
export function applyBrickOrientation(object, rotationDegrees = 0, tilt = 0) {
    const rotation = object.rotation;
    rotation.order = 'YXZ';
    rotation.x = normalizeTilt(tilt) * (Math.PI / 180);
    rotation.y = (Number.isFinite(rotationDegrees) ? rotationDegrees : 0) * (Math.PI / 180);
}
