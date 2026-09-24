// Pure numeric transform input parsing (0.1.49).
//
// This module parses and interprets user input — it never transforms
// anything. No World, Brick, Group, renderer, Vue, or CommandHistory
// appears here, and no transformed position is ever calculated: that
// remains the job of the existing transform machinery. Numeric input is
// an INPUT SURFACE, not a transform system.
//
// The parser is deliberately strict and grammar-based rather than
// Number()-permissive:
//
//   accepted:  10   10.5   -3.75   +2   .5   0.5   (surrounding spaces ok)
//   rejected:  abc  10foo  1..5  Infinity  NaN  1e999  1e2  (any exponent,
//              any unit suffix, any expression)
//
// Exponential notation is rejected wholesale — "1e999 resolving to
// infinity" then cannot happen, and neither can "1e2" quietly meaning
// 100. Expressions (2+3*4) and units (10cm) are explicitly out of scope
// for 0.1.49; both would be mini-languages and deserve their own
// justification later.
//
// Results are structured values, not exceptions, so callers (the panel
// today, a future command palette or tests) can decide how to react:
//
//   { valid: true,  value: 2.5 }
//   { valid: false, reason: 'empty' | 'invalid-number' | 'non-finite' }
//
// 'empty' is distinct from 'invalid-number' on purpose: an empty field
// means "leave this unchanged" (§13 of the milestone brief), while an
// invalid field blocks the whole Apply.
const NUMERIC_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

export const TransformInput = Object.freeze({
    parseNumericValue(text) {
        if (typeof text !== 'string') {
            return { valid: false, reason: 'invalid-number' };
        }
        const trimmed = text.trim();
        if (trimmed === '') {
            return { valid: false, reason: 'empty' };
        }
        if (!NUMERIC_PATTERN.test(trimmed)) {
            return { valid: false, reason: 'invalid-number' };
        }
        const value = Number(trimmed);
        if (!Number.isFinite(value)) {
            return { valid: false, reason: 'non-finite' };
        }
        return { valid: true, value };
    },

    // mode ('translation' | 'rotation') shares the same grammar today;
    // the parameter exists so future per-mode rules (e.g. a degree-
    // normalization policy) have somewhere to land without callers
    // changing. Parsing stays pure either way.
    parseTransformInput(text, mode = 'translation') {
        void mode;
        return TransformInput.parseNumericValue(text);
    },

    // Interprets the four panel fields as one structured transform
    // intent. Empty fields become null — "unchanged", NOT zero. If any
    // non-empty field fails to parse, the whole intent is invalid and
    // lists the offending fields; nothing reaches the transform layer
    // (and therefore zero history entries are created) until an intent
    // is fully valid.
    //
    //   { valid: true, translation: { x, y, z } | null, rotation: number | null }
    //   { valid: false, invalidFields: ['x', ...] }
    parsePanelInput({ x = '', y = '', z = '', rotation = '' } = {}) {
        const fields = { x, y, z, rotation };
        const parsed = {};
        const invalidFields = [];
        for (const name of Object.keys(fields)) {
            const result = TransformInput.parseTransformInput(
                fields[name],
                name === 'rotation' ? 'rotation' : 'translation'
            );
            if (result.reason === 'empty') {
                parsed[name] = null;
                continue;
            }
            if (!result.valid) {
                invalidFields.push(name);
                continue;
            }
            parsed[name] = result.value;
        }
        if (invalidFields.length > 0) {
            return { valid: false, invalidFields };
        }
        const hasTranslation = parsed.x !== null || parsed.y !== null || parsed.z !== null;
        return {
            valid: true,
            translation: hasTranslation
                ? { x: parsed.x, y: parsed.y, z: parsed.z }
                : null,
            rotation: parsed.rotation
        };
    }
});
