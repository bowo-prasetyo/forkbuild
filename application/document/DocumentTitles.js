// The titles the app gives a document it makes: a new World, a fork, a
// copy. They are saved with the document like any title someone types, so
// they are written in the language of whoever made it (docs/Translating.md,
// "Titles the app gives a new document"). The UI sets them once at start-up
// (ui/main.js) from its messages; documents are made in many places across
// application/, and all of them ask here.
//
// Until the UI sets them (tests, tools with no UI), they are the English the
// app has always used: `document.untitledWorld`, `document.forkOf` and
// `document.copyOf` in ui/i18n/messages/en.js, which tests/DocumentTitles.test.js
// keeps equal to these.
const ENGLISH = Object.freeze({
    untitledWorld: () => 'Untitled ForkBuild World',
    forkOf: (title) => `Fork of ${title}`,
    copyOf: (title) => `Copy of ${title}`
});

let titles = ENGLISH;

// `{ untitledWorld(), forkOf(title), copyOf(title) }`, each returning text;
// any left out keeps its English. With no argument, back to English.
export function setDocumentTitles(next = {}) {
    titles = Object.freeze({
        untitledWorld: typeof next.untitledWorld === 'function' ? next.untitledWorld : ENGLISH.untitledWorld,
        forkOf: typeof next.forkOf === 'function' ? next.forkOf : ENGLISH.forkOf,
        copyOf: typeof next.copyOf === 'function' ? next.copyOf : ENGLISH.copyOf
    });
}

// A new, empty World's title.
export function untitledWorldTitle() {
    return titles.untitledWorld();
}

// A fork's title, named after the World it came from (or "Untitled
// ForkBuild World" when that one had none).
export function forkTitle(sourceTitle) {
    return titles.forkOf(sourceTitle || untitledWorldTitle());
}

// A copy's title, the same way.
export function copyTitle(sourceTitle) {
    return titles.copyOf(sourceTitle || untitledWorldTitle());
}
