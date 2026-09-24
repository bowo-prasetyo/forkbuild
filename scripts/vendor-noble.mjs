// Copies the audited noble cryptography that identity/Ed25519.js uses from
// node_modules into vendor/, so the browser (which loads plain ES modules,
// with no build step) and Node run exactly the same code.
//
//   node scripts/vendor-noble.mjs          regenerate vendor/noble-*
//   node scripts/vendor-noble.mjs --check  exit 1 if vendor/ differs
//
// Files are copied byte for byte, with one change: the curves package
// imports its hashes dependency by package name ('@noble/hashes/x.js'),
// which a browser cannot resolve, so those imports become relative paths
// into vendor/noble-hashes/. Only the files reachable from the entry points
// below are copied. To upgrade, change the exact versions in package.json,
// run `npm install`, then run this script.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = {
    '@noble/curves': { source: join(root, 'node_modules/@noble/curves'), target: join(root, 'vendor/noble-curves') },
    '@noble/hashes': { source: join(root, 'node_modules/@noble/hashes'), target: join(root, 'vendor/noble-hashes') }
};
const ENTRY_POINTS = ['@noble/curves/ed25519.js', '@noble/hashes/sha2.js'];
const IMPORT_PATTERN = /((?:^|\n)\s*(?:import|export)\b[^;'"]*?\bfrom\s*)(['"])([^'"]+)\2/g;

function packageOf(specifier) {
    return Object.keys(PACKAGES).find((name) => specifier === name || specifier.startsWith(name + '/'));
}

function toPosix(path) {
    return path.split(sep).join('/');
}

// Returns Map<target path, file contents> for every vendored file.
export function expectedVendorFiles() {
    const files = new Map();
    const queue = [...ENTRY_POINTS];
    const seen = new Set();
    while (queue.length > 0) {
        const specifier = queue.pop();
        if (seen.has(specifier)) continue;
        seen.add(specifier);
        const name = packageOf(specifier);
        const { source, target } = PACKAGES[name];
        const sub = specifier.slice(name.length + 1);
        const targetPath = join(target, sub);
        const text = readFileSync(join(source, sub), 'utf8').replace(IMPORT_PATTERN, (match, head, quote, spec) => {
            if (spec.startsWith('.')) {
                queue.push(toPosix(join(name, dirname(sub), spec)));
                return match;
            }
            const dependency = packageOf(spec);
            if (!dependency) throw new Error(`vendor-noble: ${specifier} imports unknown package "${spec}"`);
            queue.push(spec);
            const dependencyPath = join(PACKAGES[dependency].target, spec.slice(dependency.length + 1));
            let rel = toPosix(relative(dirname(targetPath), dependencyPath));
            if (!rel.startsWith('.')) rel = './' + rel;
            return `${head}${quote}${rel}${quote}`;
        });
        files.set(targetPath, text);
    }
    for (const { source, target } of Object.values(PACKAGES)) {
        const version = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')).version;
        files.set(join(target, 'LICENSE'), readFileSync(join(source, 'LICENSE'), 'utf8'));
        files.set(join(target, 'VERSION'), version + '\n');
    }
    return files;
}

function listFiles(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)]);
}

// Returns a list of human-readable differences between vendor/ and what
// this script would write (empty when they match).
export function vendorDifferences() {
    const expected = expectedVendorFiles();
    const differences = [];
    for (const [path, text] of expected) {
        if (!existsSync(path)) differences.push(`missing ${toPosix(relative(root, path))}`);
        else if (readFileSync(path, 'utf8') !== text) differences.push(`changed ${toPosix(relative(root, path))}`);
    }
    for (const { target } of Object.values(PACKAGES)) {
        for (const path of listFiles(target)) {
            if (!expected.has(path)) differences.push(`unexpected ${toPosix(relative(root, path))}`);
        }
    }
    return differences;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.includes('--check')) {
        const differences = vendorDifferences();
        if (differences.length > 0) {
            console.error(`vendor/ does not match node_modules:\n  ${differences.join('\n  ')}\nRun: node scripts/vendor-noble.mjs`);
            process.exitCode = 1;
        } else {
            console.log('vendor/ matches node_modules.');
        }
    } else {
        for (const { target } of Object.values(PACKAGES)) rmSync(target, { recursive: true, force: true });
        const files = expectedVendorFiles();
        for (const [path, text] of files) {
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, text);
        }
        console.log(`Wrote ${files.size} files to vendor/.`);
    }
}
