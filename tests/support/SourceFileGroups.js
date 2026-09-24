// Test-support only. A large file that was split keeps its own file plus the
// modules under a sibling folder; source-reading tests read all of them,
// joined, as one unit. The original file comes last so a view's `template:`
// still ends the joined text.
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function fileGroup(mainPath, partsDir) {
    const parts = readdirSync(join(root, partsDir))
        .filter((name) => name.endsWith('.js'))
        .sort()
        .map((name) => `${partsDir}/${name}`);
    return [...parts, mainPath];
}

export function publicationsPageFiles() {
    return fileGroup('ui/views/DecentralizedPublicationsView.js', 'ui/views/decentralizedPublications');
}

export function worldViewFiles() {
    return fileGroup('ui/views/WorldView.js', 'ui/views/worldView');
}

export function worldNavigationSessionFiles() {
    return fileGroup('application/WorldNavigationSession.js', 'application/worldNavigation');
}

// css/main.css only @imports its parts, in cascade order.
export function stylesheetFiles() {
    const entry = readFileSync(join(root, 'css/main.css'), 'utf8');
    return [...entry.matchAll(/@import url\('([^']+)'\);/g)].map((match) => `css/${match[1]}`);
}
