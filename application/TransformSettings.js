import { TransformSnap } from './TransformSnap.js';

// Session/application-level transform preferences (0.1.47).
//
// Deliberately NOT document state: nothing here belongs to a World,
// Document, Building, Brick, or Group, and nothing here is serialized
// into the ForkBuild Protocol. TransformSettings lives in the same
// world as DocumentState and EditorSettings — preferences describing
// how THIS session interprets gestures — and the protocol is completely
// unaffected by their existence.
//
// Defaults, and why:
//   snappingEnabled: true      — precision-on by default is the point
//                                of the milestone; the flag exists for a
//                                future settings surface to flip it.
//   translationSnap: 1         — the same unit as the placement grid
//                                (EditorSettings.gridSnapSize since
//                                0.1.13), so placing and moving agree.
//   rotationSnap: 15           — the classic angular increment.
//   precisionMultiplier: 0.1   — holding the precision modifier (Shift)
//                                divides increments by ten: 1 -> 0.1
//                                units, 15 -> 1.5 degrees.
//
// Precision changes gesture interpretation, not document state: the
// multiplier is applied per gesture frame inside the transform
// transaction and never persisted anywhere.
const DEFAULT_SNAPPING_ENABLED = true;
const DEFAULT_TRANSLATION_SNAP = 1;
const DEFAULT_ROTATION_SNAP = 15;
const DEFAULT_PRECISION_MULTIPLIER = 0.1;

export class TransformSettings {
    constructor({
        snappingEnabled = DEFAULT_SNAPPING_ENABLED,
        translationSnap = DEFAULT_TRANSLATION_SNAP,
        rotationSnap = DEFAULT_ROTATION_SNAP,
        precisionMultiplier = DEFAULT_PRECISION_MULTIPLIER
    } = {}) {
        this._snappingEnabled = snappingEnabled;
        this._translationSnap = translationSnap;
        this._rotationSnap = rotationSnap;
        this._precisionMultiplier = precisionMultiplier;
    }

    get snappingEnabled() {
        return this._snappingEnabled;
    }

    get translationSnap() {
        return this._translationSnap;
    }

    get rotationSnap() {
        return this._rotationSnap;
    }

    get precisionMultiplier() {
        return this._precisionMultiplier;
    }

    // The translation increment to apply this frame: the normal
    // increment, or the precision-scaled one while the precision
    // modifier is held.
    translationIncrement(precise = false) {
        return TransformSnap.effectiveIncrement(
            this._translationSnap,
            precise,
            this._precisionMultiplier
        );
    }

    rotationIncrement(precise = false) {
        return TransformSnap.effectiveIncrement(
            this._rotationSnap,
            precise,
            this._precisionMultiplier
        );
    }
}
