// Test-support only: `text` without HTML comments, for checks that read a
// template. One pass of a replace can leave a comment behind (removing
// `<!-- a -->` from `<!<!-- a -->-- b -->` joins a new `<!--`), so this
// repeats until nothing changes, and an unterminated `<!--` runs to the end.
// The result never contains `<!--`.
export function stripHtmlComments(text) {
    let previous;
    do {
        previous = text;
        text = text.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
    } while (text !== previous);
    return text;
}
