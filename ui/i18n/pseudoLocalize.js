// The pseudo-locale: English with every letter accented, about 30% longer and
// bracketed, e.g. "Sound on" → "⟦Šöüñð öñ ~~~⟧". Picking it shows at a glance
// which text on screen still bypasses t() (it stays plain), which layouts
// break when a translation is longer than English, and where a message was
// cut off or joined to another (a missing bracket). `{placeholders}` are left
// as they are so parameters still fill in.
const ACCENTED = Object.freeze({
    a: 'å', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ',
    n: 'ñ', o: 'ö', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'ü', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
    A: 'Å', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Î', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ',
    N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Û', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž'
});
const PLACEHOLDER_OR_TEXT = /(\{[A-Za-z0-9_]+\})|([^{]+|\{)/g;
const EXPANSION = 0.3;

export function pseudoLocalize(text) {
    let letters = 0;
    const accented = text.replace(PLACEHOLDER_OR_TEXT, (match, placeholder) => {
        if (placeholder) {
            return placeholder;
        }
        return match.replace(/[A-Za-z]/g, (letter) => {
            letters += 1;
            return ACCENTED[letter];
        });
    });
    const padding = letters > 0 ? ` ${'~'.repeat(Math.ceil(letters * EXPANSION))}` : '';
    return `⟦${accented}${padding}⟧`;
}

// Every message, plural forms included, pseudo-localized.
export function pseudoLocalizeMessages(messages) {
    const result = {};
    for (const [key, message] of Object.entries(messages)) {
        result[key] = typeof message === 'string'
            ? pseudoLocalize(message)
            : Object.freeze(Object.fromEntries(Object.entries(message).map(([form, text]) => [form, pseudoLocalize(text)])));
    }
    return Object.freeze(result);
}
