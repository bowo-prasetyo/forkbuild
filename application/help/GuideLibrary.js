// The user guide (docs/user/), read from this site the first time Help
// needs it, as sections ready to search (core/help/GuideSearch.js). The
// chapters are the ones the guide's contents page (its README) links to, so
// a chapter added there is searched with no change here. Once fetched, the
// service worker keeps the files (ui/pwa/serviceWorker.js), so Help works
// offline after its first use.
import { guideChapterFiles, guideIndex, guideSections } from '../../core/help/GuideSearch.js';

async function fetchText(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.text();
}

export class GuideLibrary {
    constructor({ fetchText: read = fetchText } = {}) {
        this._read = read;
        this._guides = new Map();
    }

    // The guide in `directory` ('docs/user', or 'docs/user/<code>'):
    // `{ directory, chapters, index }`, loaded once. A chapter that can't be
    // read is left out; rejects only when the contents page can't be.
    load(directory) {
        if (!this._guides.has(directory)) {
            const loading = this._load(directory);
            this._guides.set(directory, loading);
            loading.catch(() => this._guides.delete(directory));
        }
        return this._guides.get(directory);
    }

    async _load(directory) {
        const chapters = guideChapterFiles(await this._read(`${directory}/README.md`));
        const texts = await Promise.all(chapters.map((file) => Promise.resolve()
            .then(() => this._read(`${directory}/${file}`))
            .catch(() => null)));
        const sections = chapters.flatMap((file, i) => (texts[i] === null ? [] : guideSections(texts[i], file)));
        return Object.freeze({ directory, chapters: Object.freeze(chapters), index: guideIndex(sections) });
    }
}
