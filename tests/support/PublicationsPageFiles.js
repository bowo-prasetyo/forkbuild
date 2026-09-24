// Test-support only. The Publications page is ui/views/DecentralizedPublicationsView.js
// plus the modules it is split into under ui/views/decentralizedPublications/.
// Source-reading tests read every one of these files, joined, as "the page";
// the view comes last so its `template:` still ends the joined text.
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function publicationsPageFiles() {
    const parts = readdirSync(join(root, 'ui/views/decentralizedPublications'))
        .filter((name) => name.endsWith('.js'))
        .sort()
        .map((name) => `ui/views/decentralizedPublications/${name}`);
    return [...parts, 'ui/views/DecentralizedPublicationsView.js'];
}
