// Test-support only. application/ is grouped into feature folders, so a
// test that names an application file by its file name, or scans the
// whole layer, finds it here instead of assuming a flat directory.
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function walk(dir) {
    return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return walk(rel);
        return entry.name.endsWith('.js') ? [rel] : [];
    });
}

// Every application/ .js file, repo-relative, sorted.
export function applicationFiles() {
    return walk('application').sort();
}

// The repo-relative path of the application/ file with this name ('Foo' or
// 'Foo.js'), or null when no such file exists.
export function applicationPath(name) {
    const fileName = name.endsWith('.js') ? name : `${name}.js`;
    const matches = applicationFiles().filter((f) => f.endsWith(`/${fileName}`));
    if (matches.length > 1) throw new Error(`ambiguous application file name ${fileName}: ${matches.join(', ')}`);
    return matches[0] ?? null;
}
