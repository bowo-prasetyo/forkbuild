// Copies the third-party ES modules the app runs in the browser from
// node_modules into vendor/, so the app serves every script from its own
// origin (no CDN) and Node tests run exactly the same files.
//
//   node scripts/vendor.mjs          regenerate vendor/
//   node scripts/vendor.mjs --check  exit 1 if vendor/ differs
//
// Only the files reachable from each package's entry points are copied,
// byte for byte, with one exception: the noble packages import each other
// by package name ('@noble/hashes/x.js'), which is rewritten to a relative
// path because nothing maps it. The other packages' bare imports ('vue',
// '@vue/devtools-api', 'three') are left as they are and resolved by the
// import map in index.html, so each must be one of IMPORT_MAP_SPECIFIERS.
//
// To upgrade a library, change its exact version in package.json, run
// `npm install`, run this script, and update index.html's import map if a
// file name changed.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PACKAGES = {
    '@noble/curves': { target: 'vendor/noble-curves', entries: ['ed25519.js'], rewriteBareImports: true },
    '@noble/hashes': { target: 'vendor/noble-hashes', entries: ['sha2.js'], rewriteBareImports: true },
    // The full build: templates are strings compiled in the browser.
    'vue': { target: 'vendor/vue', entries: ['dist/vue.esm-browser.prod.js'] },
    // vue-router publishes no production browser build.
    'vue-router': { target: 'vendor/vue-router', entries: ['dist/vue-router.esm-browser.js'] },
    '@vue/devtools-api': { target: 'vendor/vue-devtools-api', entries: ['lib/esm/index.js'] },
    'three': { target: 'vendor/three', entries: ['build/three.module.js', 'examples/jsm/controls/OrbitControls.js'] }
};
const IMPORT_MAP_SPECIFIERS = ['vue', 'vue-router', '@vue/devtools-api', 'three'];
const IMPORT_PATTERN = /((?:^|\n)\s*(?:import|export)\b[^;'"`]*?\bfrom\s*)(['"])([^'"]+)\2/g;

function packageOf(specifier) {
    return Object.keys(PACKAGES)
        .sort((a, b) => b.length - a.length)
        .find((name) => specifier === name || specifier.startsWith(name + '/'));
}

function toPosix(path) {
    return path.split(sep).join('/');
}

function sourceDir(name) {
    return join(root, 'node_modules', name);
}

// Returns Map<absolute target path, file contents> for every vendored file.
export function expectedVendorFiles() {
    const files = new Map();
    const queue = Object.entries(PACKAGES).flatMap(([name, { entries }]) => entries.map((entry) => `${name}/${entry}`));
    const seen = new Set();
    while (queue.length > 0) {
        const specifier = queue.pop();
        if (seen.has(specifier)) continue;
        seen.add(specifier);
        const name = packageOf(specifier);
        const pkg = PACKAGES[name];
        const sub = specifier.slice(name.length + 1);
        const targetPath = join(root, pkg.target, sub);
        const text = readFileSync(join(sourceDir(name), sub), 'utf8').replace(IMPORT_PATTERN, (match, head, quote, spec) => {
            if (spec.startsWith('.')) {
                queue.push(toPosix(join(name, dirname(sub), spec)));
                return match;
            }
            if (!pkg.rewriteBareImports) {
                if (!IMPORT_MAP_SPECIFIERS.includes(spec)) {
                    throw new Error(`vendor: ${specifier} imports "${spec}", which the import map does not provide`);
                }
                return match;
            }
            const dependency = packageOf(spec);
            if (!dependency) throw new Error(`vendor: ${specifier} imports unknown package "${spec}"`);
            queue.push(spec);
            const dependencyPath = join(root, PACKAGES[dependency].target, spec.slice(dependency.length + 1));
            let rel = toPosix(relative(dirname(targetPath), dependencyPath));
            if (!rel.startsWith('.')) rel = './' + rel;
            return `${head}${quote}${rel}${quote}`;
        });
        files.set(targetPath, text);
    }
    for (const [name, { target }] of Object.entries(PACKAGES)) {
        const manifest = JSON.parse(readFileSync(join(sourceDir(name), 'package.json'), 'utf8'));
        const licensePath = join(sourceDir(name), 'LICENSE');
        files.set(join(root, target, 'LICENSE'), existsSync(licensePath)
            ? readFileSync(licensePath, 'utf8')
            : `${name} ${manifest.version} ships no license file; its package.json declares the ${manifest.license} license.\n`);
        files.set(join(root, target, 'VERSION'), manifest.version + '\n');
    }
    return files;
}

function listFiles(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)]);
}

// Human-readable differences between vendor/ and what this script would
// write (empty when they match).
export function vendorDifferences() {
    const expected = expectedVendorFiles();
    const differences = [];
    for (const [path, text] of expected) {
        if (!existsSync(path)) differences.push(`missing ${toPosix(relative(root, path))}`);
        else if (readFileSync(path, 'utf8') !== text) differences.push(`changed ${toPosix(relative(root, path))}`);
    }
    for (const path of listFiles(join(root, 'vendor'))) {
        if (!expected.has(path)) differences.push(`unexpected ${toPosix(relative(root, path))}`);
    }
    return differences;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.includes('--check')) {
        const differences = vendorDifferences();
        if (differences.length > 0) {
            console.error(`vendor/ does not match node_modules:\n  ${differences.join('\n  ')}\nRun: node scripts/vendor.mjs`);
            process.exitCode = 1;
        } else {
            console.log('vendor/ matches node_modules.');
        }
    } else {
        rmSync(join(root, 'vendor'), { recursive: true, force: true });
        const files = expectedVendorFiles();
        for (const [path, text] of files) {
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, text);
        }
        console.log(`Wrote ${files.size} files to vendor/.`);
    }
}
