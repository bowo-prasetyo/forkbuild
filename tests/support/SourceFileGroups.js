// Test-support only. A large file that was split keeps its own file plus the
// modules under a sibling folder; source-reading tests read all of them,
// joined, as one unit. The original file comes after its modules so the text
// from a view's `template:` onward is the whole template.
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function jsFilesIn(dir) {
    return readdirSync(join(root, dir))
        .filter((name) => name.endsWith('.js'))
        .sort()
        .map((name) => `${dir}/${name}`);
}

function fileGroup(mainPath, partsDir) {
    return [...jsFilesIn(partsDir), mainPath];
}

// Template sections come after the view, so the text from its `template:`
// to the end of the joined text holds the whole template.
export function publicationsPageFiles() {
    return [
        ...fileGroup('ui/views/DecentralizedPublicationsView.js', 'ui/views/decentralizedPublications'),
        ...jsFilesIn('ui/views/decentralizedPublications/templates')
    ];
}

export function worldViewFiles() {
    return fileGroup('ui/views/WorldView.js', 'ui/views/worldView');
}

export function editorViewFiles() {
    return fileGroup('ui/views/EditorView.js', 'ui/views/editorView');
}

export function worldEncounterCanvasFiles() {
    return fileGroup('ui/components/WorldEncounterCanvas.js', 'ui/components/worldEncounterCanvas');
}

export function worldNavigationSessionFiles() {
    return fileGroup('application/world/WorldNavigationSession.js', 'application/worldNavigation');
}

// css/main.css only @imports its parts, in cascade order.
export function stylesheetFiles() {
    const entry = readFileSync(join(root, 'css/main.css'), 'utf8');
    return [...entry.matchAll(/@import url\('([^']+)'\);/g)].map((match) => `css/${match[1]}`);
}

// DecentralizedPublicationsView.js with each `${nameTemplate}` placeholder
// replaced by that section's markup: the source as it read before the
// template was split, for checks that span the whole template.
export function publicationsViewSourceWithTemplate() {
    const templatesDir = 'ui/views/decentralizedPublications/templates';
    const sections = new Map();
    for (const file of jsFilesIn(templatesDir)) {
        const text = readFileSync(join(root, file), 'utf8');
        const match = text.match(/export const (\w+Template) = `([\s\S]*)`;\s*$/);
        if (!match) throw new Error(`${file} does not export a template section`);
        sections.set(match[1], match[2]);
    }
    const expand = (text) => text.replace(/\$\{(\w+Template)\}/g, (_, name) => expand(sections.get(name)));
    return expand(readFileSync(join(root, 'ui/views/DecentralizedPublicationsView.js'), 'utf8'));
}
