// Text for a person to read, named by a message key rather than written out,
// so the UI can show it in the chosen language (ui/i18n/, docs/Translating.md).
// core/ and application/ return these instead of English sentences; the UI
// turns them into text with t(). `params` fills the message's {placeholders}.
//
// toString() gives the key, so a descriptor that reaches the screen without
// going through t() shows up as "editorAction.selection.selectAll" rather
// than "[object Object]".
export function message(key, params = {}) {
    if (typeof key !== 'string' || key === '') {
        throw new Error('message() requires a key');
    }
    return Object.freeze({
        key,
        params: Object.freeze({ ...params }),
        toString() {
            return key;
        }
    });
}

export function isMessage(value) {
    return Boolean(value) && typeof value === 'object' && typeof value.key === 'string'
        && Boolean(value.params) && typeof value.params === 'object';
}
