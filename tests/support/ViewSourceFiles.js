// Test-support only. A large view is its own file plus the modules it is
// split into under a sibling folder; source-reading tests read all of them,
// joined, as "the view". The view file comes last so its `template:` still
// ends the joined text.
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function viewFiles(viewPath, partsDir) {
    const parts = readdirSync(join(root, partsDir))
        .filter((name) => name.endsWith('.js'))
        .sort()
        .map((name) => `${partsDir}/${name}`);
    return [...parts, viewPath];
}

export function publicationsPageFiles() {
    return viewFiles('ui/views/DecentralizedPublicationsView.js', 'ui/views/decentralizedPublications');
}

export function worldViewFiles() {
    return viewFiles('ui/views/WorldView.js', 'ui/views/worldView');
}
