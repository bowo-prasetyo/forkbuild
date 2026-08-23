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

// 0.4.9 — the "Snap: Off / 0.5 / 1 / 2" editor setting the design
// conversation asked for is a small closed set of presets over the
// SAME translationSnap this class already had (0.1.47); no new
// mechanism, just named values a settings surface can offer directly.
// "Off" is expressed with setSnappingEnabled(false), not a preset
// value — see that method's own comment.
export const TRANSLATION_SNAP_PRESETS = Object.freeze([0.5, 1, 2]);

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

    // ------------------------------------------------- mutability (0.4.9)
    //
    // Before this milestone every field here was constructor-only —
    // fine for the 0.1.47 "precision is on by default" ship, but a real
    // "Snap: Off / 0.5 / 1 / 2" editor control needs to change these on
    // a LIVE TransformSettings instance (the same one SpatialEditingService
    // already holds a reference to), not rebuild the whole gesture
    // service to flip one preference. These three setters are the whole
    // surface such a control needs; nothing about how snapping is
    // APPLIED (application/TransformSnap.js, SpatialEditingService's own
    // gesture transaction) changes at all.

    setSnappingEnabled(enabled) {
        this._snappingEnabled = !!enabled;
    }

    // value: a positive number, or null for "off." Mirrors
    // setSnappingEnabled(false) in effect (TransformSnap.snapValue
    // already passes a value through unchanged for a <= 0 increment),
    // but is its own axis-scoped control — a settings surface can offer
    // "Off" as either a global toggle or a translation-only preset
    // without the two ever disagreeing about what "off" means.
    setTranslationSnap(value) {
        this._translationSnap = TransformSettings._validateSnapValue(value, 'setTranslationSnap');
    }

    setRotationSnap(value) {
        this._rotationSnap = TransformSettings._validateSnapValue(value, 'setRotationSnap');
    }

    static _validateSnapValue(value, method) {
        if (value === null) {
            return 0;
        }
        if (!Number.isFinite(value) || value <= 0) {
            throw new Error(`TransformSettings.${method}(): value must be a positive number or null`);
        }
        return value;
    }
}
