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
    return [
        ...fileGroup('ui/views/WorldView.js', 'ui/views/worldView'),
        ...jsFilesIn('ui/views/worldView/templates')
    ];
}

export function peerConnectionsViewFiles() {
    return [
        ...fileGroup('ui/views/PeerConnectionsView.js', 'ui/views/peerConnections'),
        ...jsFilesIn('ui/views/peerConnections/templates')
    ];
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

// A view's source with each `${nameTemplate}` placeholder replaced by that
// section's markup: the source as it read before the template was split,
// for checks that span the whole template.
function viewSourceWithTemplate(viewPath, templatesDir) {
    const sections = new Map();
    for (const file of jsFilesIn(templatesDir)) {
        const text = readFileSync(join(root, file), 'utf8');
        const match = text.match(/export const (\w+Template) = `([\s\S]*)`;\s*$/);
        if (!match) throw new Error(`${file} does not export a template section`);
        sections.set(match[1], match[2]);
    }
    const expand = (text) => text.replace(/\$\{(\w+Template)\}/g, (_, name) => expand(sections.get(name)));
    return expand(readFileSync(join(root, viewPath), 'utf8'));
}

export function publicationsViewSourceWithTemplate() {
    return viewSourceWithTemplate('ui/views/DecentralizedPublicationsView.js', 'ui/views/decentralizedPublications/templates');
}

export function worldViewSourceWithTemplate() {
    return viewSourceWithTemplate('ui/views/WorldView.js', 'ui/views/worldView/templates');
}

// PeerConnectionsView's composables, then the view with its template
// expanded: every line the single file held before it was split.
export function peerConnectionsViewSource() {
    const parts = jsFilesIn('ui/views/peerConnections').map((file) => readFileSync(join(root, file), 'utf8'));
    return [...parts, viewSourceWithTemplate('ui/views/PeerConnectionsView.js', 'ui/views/peerConnections/templates')].join('\n');
}

// The view a template-section file belongs to, or the file itself: a check
// that counts components counts a view and its template sections once.
const TEMPLATE_OWNERS = {
    'ui/views/worldView/templates/': 'ui/views/WorldView.js',
    'ui/views/peerConnections/templates/': 'ui/views/PeerConnectionsView.js',
    'ui/views/decentralizedPublications/templates/': 'ui/views/DecentralizedPublicationsView.js'
};
export function owningView(file) {
    const dir = Object.keys(TEMPLATE_OWNERS).find((prefix) => file.startsWith(prefix));
    return dir ? TEMPLATE_OWNERS[dir] : file;
}

export function worldViewTemplateFiles() {
    return jsFilesIn('ui/views/worldView/templates');
}
