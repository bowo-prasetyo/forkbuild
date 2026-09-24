// Small structural checks shared by validators, envelopes and codecs.

export function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

// Unlike isNonEmptyString(), whitespace-only strings are rejected.
export function isNonBlankString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

// Any non-null, non-array object; prototypes are not inspected.
export function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// True when every own key of `value` is listed in `allowedKeys`; used to
// reject imported records that carry unexpected fields.
export function hasOnlyKeys(value, allowedKeys) {
    return Object.keys(value).every((key) => allowedKeys.includes(key));
}
