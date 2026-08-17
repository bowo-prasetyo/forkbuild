import { ValidationResult } from '../serializer/ValidationResult.js';

// 0.2.34 — validates an `appearance` bag against the `AvatarTemplate`
// it claims to belong to. This is the enforcement half of "template +
// appearance are declarative data, not executable code": appearance
// can never carry anything the template didn't already declare as a
// valid option, so there is no path from "edit your avatar" to
// "smuggle arbitrary content into a profile."
//
// Reuses serializer/ValidationResult.js rather than inventing a
// parallel {valid, errors} shape — core/ already depends on
// serializer/ elsewhere (e.g. PlacementRecord -> contentHash), so this
// isn't a new layering exception.
//
// Deliberately strict and single-purpose: this file only answers "is
// this appearance valid for this template," and returns every
// violation found rather than stopping at the first one, so a caller
// (the Avatar Creator UI, AvatarProfileUseCase.updateProfile) can
// report everything wrong with one round trip instead of one error at
// a time.
export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const MAX_APPEARANCE_JSON_BYTES = 4096;
const MAX_MULTIPLE_ENTRIES = 8;

export function isValidHexColor(value) {
    return typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
}

export function validateAvatarAppearance(appearance, template) {
    if (!appearance || typeof appearance !== 'object' || Array.isArray(appearance)) {
        return ValidationResult.fail(['appearance must be a plain object']);
    }
    if (!template) {
        return ValidationResult.fail(['appearance cannot be validated without a template']);
    }

    const errors = [];

    const json = JSON.stringify(appearance);
    if (json.length > MAX_APPEARANCE_JSON_BYTES) {
        errors.push(`appearance is too large (${json.length} bytes, max ${MAX_APPEARANCE_JSON_BYTES})`);
    }

    for (const [key, value] of Object.entries(appearance)) {
        if (key.endsWith('Color')) {
            const componentName = key.slice(0, -'Color'.length);
            const component = template.getComponent(componentName);
            if (!component || !component.hasColor) {
                errors.push(`unknown or non-colorable appearance field: "${key}"`);
                continue;
            }
            if (!isValidHexColor(value)) {
                errors.push(`"${key}" must be a "#rrggbb" hex color, got ${JSON.stringify(value)}`);
            }
            continue;
        }

        const component = template.getComponent(key);
        if (!component) {
            errors.push(`unknown appearance field: "${key}"`);
            continue;
        }

        if (component.multiple) {
            if (!Array.isArray(value)) {
                errors.push(`"${key}" must be an array of option ids`);
                continue;
            }
            if (value.length > MAX_MULTIPLE_ENTRIES) {
                errors.push(`"${key}" has too many entries (${value.length}, max ${MAX_MULTIPLE_ENTRIES})`);
            }
            for (const entry of value) {
                if (!component.options.includes(entry)) {
                    errors.push(`"${key}" contains an unknown option: ${JSON.stringify(entry)}`);
                }
            }
        } else if (!component.options.includes(value)) {
            errors.push(`"${key}" has an unknown option: ${JSON.stringify(value)}`);
        }
    }

    return errors.length === 0 ? ValidationResult.ok() : ValidationResult.fail(errors);
}
