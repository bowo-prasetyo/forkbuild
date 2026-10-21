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
//
// Voice building's speech runtime (TARBALLS) is the exception to
// node_modules: its npm package depends on native Node builds (sharp,
// onnxruntime-node) that every `npm ci` would download for nothing, so its
// few files are taken from the exact published package with `npm pack`
// (no install, no install scripts) and kept with their SHA-256, which is
// what --check compares, offline. To upgrade it, change the version, the
// integrity and the hashes below.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PACKAGES = {
    '@noble/curves': { target: 'vendor/noble-curves', entries: ['ed25519.js', 'secp256k1.js'], rewriteBareImports: true },
    '@noble/hashes': { target: 'vendor/noble-hashes', entries: ['sha2.js', 'legacy.js'], rewriteBareImports: true },
    // The full build, for the unbundled app, whose templates are strings
    // compiled in the browser; and the runtime-only build, for the bundle,
    // whose templates scripts/build.mjs compiles (scripts/templatePlugin.mjs).
    'vue': { target: 'vendor/vue', entries: ['dist/vue.esm-browser.prod.js', 'dist/vue.runtime.esm-browser.prod.js'] },
    // vue-router publishes no production browser build.
    'vue-router': { target: 'vendor/vue-router', entries: ['dist/vue-router.esm-browser.js'] },
    '@vue/devtools-api': { target: 'vendor/vue-devtools-api', entries: ['lib/esm/index.js'] },
    'three': { target: 'vendor/three', entries: ['build/three.module.js', 'examples/jsm/controls/OrbitControls.js'] }
};
const IMPORT_MAP_SPECIFIERS = ['vue', 'vue-router', '@vue/devtools-api', 'three'];

// Taken from published packages rather than node_modules (see above):
// `files` maps a file in the package to its name in `target`, with the
// SHA-256 it must have. The ONNX runtime's WebAssembly binary isn't here:
// voice building downloads it from jsDelivr, checked against its own hash
// (application/voice/SpeechRuntime.js).
const TARBALLS = {
    '@huggingface/transformers': {
        version: '4.3.0',
        integrity: 'sha512-fL1A/WUZwouPrOlYxU5dzIwD2T5J781JiB2jDR8bFe5DwCj0Gfudq+NEXCMno49kQgajHA7xQkrRLJlqG1veEA==',
        target: 'vendor/transformers',
        files: {
            'dist/transformers.min.js': ['transformers.min.js', '1475fd440e9932ab206682ee42cb18f6097403e9ee77ea62084c592d0f83597d'],
            'LICENSE': ['LICENSE', 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30']
        }
    },
    // The ONNX runtime transformers.min.js bundles loads this factory for its
    // WebAssembly binary; the version must match the one bundled.
    'onnxruntime-web': {
        version: '1.31.0-dev.20260914-8d85527a0',
        integrity: 'sha512-Iy7rtadoBgxS/LLvDr3QW38DB1PNXRnr0GJMcL0TAt7c9qjgVQl83UlGCVyeAnK2InpmW8Uc3PL8XIuqtDeF6g==',
        target: 'vendor/onnxruntime-web',
        license: 'MIT',
        files: {
            'dist/ort-wasm-simd-threaded.asyncify.mjs': ['ort-wasm-simd-threaded.asyncify.mjs', '0966b6105cd936744498aa60df7a22cbd47af3374dbc64a9ab561c08a71e3611']
        }
    }
};

function sha256(text) {
    return createHash('sha256').update(text).digest('hex');
}

// The files of a tar archive: Map<path within it, Buffer>.
function untar(buffer) {
    const files = new Map();
    for (let offset = 0; offset + 512 <= buffer.length;) {
        const name = buffer.toString('utf8', offset, offset + 100).replace(/\0.*$/s, '');
        if (!name) break;
        const size = parseInt(buffer.toString('utf8', offset + 124, offset + 136).replace(/\0.*$/s, '').trim() || '0', 8);
        const prefix = buffer.toString('utf8', offset + 345, offset + 500).replace(/\0.*$/s, '');
        const type = buffer.toString('utf8', offset + 156, offset + 157);
        if (type === '0' || type === '\0' || type === '') files.set(prefix ? `${prefix}/${name}` : name, buffer.subarray(offset + 512, offset + 512 + size));
        offset += 512 + Math.ceil(size / 512) * 512;
    }
    return files;
}

// A published package's files, by `npm pack`, its integrity checked.
function packedFiles(name, { version, integrity }) {
    const directory = mkdtempSync(join(tmpdir(), 'forkbuild-vendor-'));
    try {
        const [packed] = JSON.parse(execFileSync('npm', ['pack', `${name}@${version}`, '--json', '--ignore-scripts', '--pack-destination', directory], { encoding: 'utf8' }));
        const archive = readFileSync(join(directory, packed.filename));
        const actual = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
        if (actual !== integrity) throw new Error(`vendor: ${name}@${version} has integrity ${actual}, not ${integrity}`);
        return untar(gunzipSync(archive));
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

// Every file TARBALLS vendors: Map<absolute target path, { text, sha256 }>,
// `text` read from vendor/ when it already has the right hash, else null.
function tarballFiles() {
    const files = new Map();
    for (const [name, pkg] of Object.entries(TARBALLS)) {
        for (const [, [targetName, hash]] of Object.entries(pkg.files)) {
            const path = join(root, pkg.target, targetName);
            const text = existsSync(path) ? readFileSync(path, 'utf8') : null;
            files.set(path, { text: text !== null && sha256(text) === hash ? text : null, sha256: hash });
        }
        files.set(join(root, pkg.target, 'VERSION'), { text: pkg.version + '\n', sha256: sha256(pkg.version + '\n') });
        if (pkg.license) {
            const note = `${name} ${pkg.version} ships no license file; its package.json declares the ${pkg.license} license.\n`;
            files.set(join(root, pkg.target, 'LICENSE'), { text: note, sha256: sha256(note) });
        }
    }
    return files;
}

// The TARBALLS files vendor/ lacks, fetched and checked.
function fetchTarballFiles(files) {
    for (const [name, pkg] of Object.entries(TARBALLS)) {
        const missing = Object.entries(pkg.files).filter(([, [targetName]]) => files.get(join(root, pkg.target, targetName)).text === null);
        if (missing.length === 0) continue;
        const packed = packedFiles(name, pkg);
        for (const [source, [targetName, hash]] of missing) {
            const content = packed.get(`package/${source}`);
            if (!content) throw new Error(`vendor: ${name}@${pkg.version} has no ${source}`);
            const text = content.toString('utf8');
            if (sha256(text) !== hash) throw new Error(`vendor: ${name}@${pkg.version} ${source} has SHA-256 ${sha256(text)}, not ${hash}`);
            files.set(join(root, pkg.target, targetName), { text, sha256: hash });
        }
    }
}
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
    const pinned = tarballFiles();
    for (const [path, { text }] of pinned) {
        if (!existsSync(path)) differences.push(`missing ${toPosix(relative(root, path))}`);
        else if (text === null || readFileSync(path, 'utf8') !== text) differences.push(`changed ${toPosix(relative(root, path))} (not its pinned SHA-256)`);
    }
    for (const path of listFiles(join(root, 'vendor'))) {
        if (!expected.has(path) && !pinned.has(path)) differences.push(`unexpected ${toPosix(relative(root, path))}`);
    }
    return differences;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.includes('--check')) {
        const differences = vendorDifferences();
        if (differences.length > 0) {
            console.error(`vendor/ does not match node_modules and its pinned packages:\n  ${differences.join('\n  ')}\nRun: node scripts/vendor.mjs`);
            process.exitCode = 1;
        } else {
            console.log('vendor/ matches node_modules.');
        }
    } else {
        const files = expectedVendorFiles();
        // Read before vendor/ is cleared: files already right aren't fetched again.
        const pinned = tarballFiles();
        fetchTarballFiles(pinned);
        rmSync(join(root, 'vendor'), { recursive: true, force: true });
        for (const [path, text] of [...files, ...[...pinned].map(([path, { text: pinnedText }]) => [path, pinnedText])]) {
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, text);
        }
        console.log(`Wrote ${files.size + pinned.size} files to vendor/.`);
    }
}
