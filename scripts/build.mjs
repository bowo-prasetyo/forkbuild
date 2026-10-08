// Builds the site GitHub Pages publishes (.github/workflows/pages.yml): the
// repository's files as they are, plus the app bundled into bundle/ and an
// index.html that loads the bundle.
//
//   node scripts/build.mjs [outdir]     build into dist/ (or outdir)
//
// Nothing here is needed to work on ForkBuild: the repository still runs
// unbundled (python3 -m http.server), and every other static host can serve
// it as docs/Deployment.md describes. Bundling only makes the published app
// load faster: esbuild joins the ~600 modules of the first load into a few
// dozen minified files, and every import() the app makes (each page, each
// service group, the thumbnail renderer, each translation) becomes its own
// file, loaded when first needed as before.
//
// Bare imports ('vue', 'three', …) resolve through index.html's own import
// map, so the bundle runs exactly the vendored files the unbundled app does.
// The generated index.html drops the import map (nothing is left for it to
// resolve) and its hash in the Content Security Policy, loads the bundled
// stylesheet and entry point, and preloads the files of the first load.
// Everything else is copied unchanged, so pages outside the app (such as
// scripts/steem-threads/) keep working. tests/run-bundle.mjs opens the built
// app in Chromium.
//
// The built site also gets its service worker, sw.js (from
// ui/pwa/serviceWorker.js, with the files to keep on install and a version
// filled in), and a meta tag telling the page to register it, so the
// published app installs and opens offline. The unbundled repository has
// neither.
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE_DIR = 'bundle';
const SERVICE_WORKER_FILE = 'sw.js';
// Left out of the published site, as docs/Deployment.md says.
const NOT_PUBLISHED = ['tests/', 'server/', '.github/'];
// What the service worker keeps on install besides the bundle's own files.
const APP_SHELL = ['index.html', 'manifest.webmanifest', 'favicon.svg', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
    'assets/icons/icon-maskable-512.png', 'assets/icons/apple-touch-icon.png'];
// Translations are kept once used rather than on install: only one is needed.
const TRANSLATION_ENTRY = /^ui\/i18n\/messages\/[^/]+\.js$/;

// Resolves bare specifiers the way the browser does, through index.html's
// import map, so there is one list of what 'vue' or 'three/addons/…' means.
function importMapPlugin(imports) {
    return {
        name: 'import-map',
        setup(build) {
            build.onResolve({ filter: /^[^./]/ }, (args) => {
                if (imports[args.path]) return { path: path.resolve(ROOT, imports[args.path]) };
                const prefix = Object.keys(imports).find((key) => key.endsWith('/') && args.path.startsWith(key));
                if (prefix) return { path: path.resolve(ROOT, imports[prefix] + args.path.slice(prefix.length)) };
                return { errors: [{ text: `${args.path} is not in index.html's import map` }] };
            });
        }
    };
}

function replaceOnce(text, pattern, replacement, what) {
    const matches = text.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)) || [];
    if (matches.length !== 1) throw new Error(`index.html: expected exactly one ${what}, found ${matches.length}`);
    return text.replace(pattern, replacement);
}

// The bundle's files the first load needs: the entry and every file it
// reaches through static imports, and the same for the files it imports
// with import() on the way to showing the app (ui/start.js, ui/main.js).
function firstLoadFiles(outputs, entryFile, startupEntries) {
    const byEntry = new Map(Object.entries(outputs).filter(([, o]) => o.entryPoint).map(([file, o]) => [o.entryPoint, file]));
    const files = [];
    const queue = [entryFile, ...startupEntries.map((entry) => byEntry.get(entry))];
    while (queue.length > 0) {
        const file = queue.shift();
        if (!file || files.includes(file)) continue;
        files.push(file);
        for (const imported of outputs[file].imports) if (imported.kind === 'import-statement') queue.push(imported.path);
    }
    return files;
}

// `developmentVue` bundles Vue's development build, which warns about every
// injection it cannot resolve; tests/run-bundle.mjs uses it to check that
// bundling left every page's services in place. Never published.
export async function build(outdir = path.join(ROOT, 'dist'), { developmentVue = false } = {}) {
    const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const importMapText = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
    const { imports } = JSON.parse(importMapText);
    if (developmentVue) imports.vue = 'node_modules/vue/dist/vue.esm-browser.js';

    rmSync(outdir, { recursive: true, force: true });
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
    for (const file of tracked.filter((f) => !NOT_PUBLISHED.some((dir) => f.startsWith(dir)))) {
        mkdirSync(path.join(outdir, path.dirname(file)), { recursive: true });
        copyFileSync(path.join(ROOT, file), path.join(outdir, file));
    }

    const shared = {
        absWorkingDir: ROOT,
        bundle: true,
        minify: true,
        // Class and function names stay as written: errors and log lines name them.
        keepNames: true,
        sourcemap: 'linked',
        target: 'es2022',
        outdir: path.join(outdir, BUNDLE_DIR),
        metafile: true,
        logLevel: 'warning'
    };
    const js = await esbuild.build({
        ...shared,
        entryPoints: ['ui/boot.js'],
        format: 'esm',
        splitting: true,
        entryNames: '[name]-[hash]',
        chunkNames: 'chunks/[name]-[hash]',
        plugins: [importMapPlugin(imports)]
    });
    const css = await esbuild.build({ ...shared, entryPoints: ['css/main.css'], entryNames: '[name]-[hash]' });
    // esbuild has printed each warning above. A warning is usually a mistake in
    // the code (a duplicate key, an import that doesn't exist), so the build,
    // and with it tests/run-bundle.mjs, fails rather than publishing it.
    const warnings = js.warnings.length + css.warnings.length;
    if (warnings > 0) throw new Error(`esbuild reported ${warnings} warning${warnings === 1 ? '' : 's'}; fix ${warnings === 1 ? 'it' : 'them'} before building`);

    const relative = (file) => path.relative(outdir, path.resolve(ROOT, file)).split(path.sep).join('/');
    const outputs = js.metafile.outputs;
    const entryFile = Object.keys(outputs).find((file) => outputs[file].entryPoint === 'ui/boot.js');
    const stylesheet = Object.keys(css.metafile.outputs).find((file) => file.endsWith('.css'));
    const preloads = firstLoadFiles(outputs, entryFile, ['ui/start.js', 'ui/main.js']);

    let page = html;
    page = replaceOnce(page, /<!-- Content Security Policy: [\s\S]*?-->/,
        '<!-- Content Security Policy: see docs/Deployment.md. Generated by scripts/build.mjs, without the\n         import map index.html has in the repository, and so without its hash. -->', 'Content Security Policy comment');
    page = replaceOnce(page, /\s*<!-- Every module the first load needs[\s\S]*?-->/, '', 'module preload comment');
    page = replaceOnce(page, /\s*<script type="importmap">[\s\S]*?<\/script>\n/, '\n', 'import map');
    page = replaceOnce(page, / 'sha256-[A-Za-z0-9+/=]+'/, '', 'import map hash in the Content Security Policy');
    page = replaceOnce(page, /<link rel="stylesheet" href="css\/main\.css">/, `<link rel="stylesheet" href="${relative(stylesheet)}">`, 'stylesheet');
    page = replaceOnce(page, /<!-- modulepreload:start[\s\S]*?<!-- modulepreload:end -->/,
        ['<!-- The bundle\'s first load (generated by scripts/build.mjs) -->',
            ...preloads.map((file) => `    <link rel="modulepreload" href="${relative(file)}">`)].join('\n'), 'modulepreload block');
    page = replaceOnce(page, /<script type="module" src="ui\/boot\.js"><\/script>/, `<script type="module" src="${relative(entryFile)}"></script>`, 'entry script');
    page = replaceOnce(page, /(<link rel="manifest" href="manifest\.webmanifest">)/,
        `$1\n    <meta name="forkbuild-service-worker" content="${SERVICE_WORKER_FILE}">`, 'manifest link');
    writeFileSync(path.join(outdir, 'index.html'), page);

    const precache = [
        ...APP_SHELL,
        relative(stylesheet),
        ...Object.keys(outputs)
            .filter((file) => file.endsWith('.js') && !TRANSLATION_ENTRY.test(outputs[file].entryPoint || ''))
            .map(relative)
            .sort()
    ];
    const version = createHash('sha256').update(page).update(precache.join('\n')).digest('hex').slice(0, 16);
    const worker = readFileSync(path.join(ROOT, 'ui/pwa/serviceWorker.js'), 'utf8')
        .replace("'__FORKBUILD_VERSION__'", JSON.stringify(version))
        .replace('__FORKBUILD_PRECACHE__', JSON.stringify(precache.map((file) => `./${file}`)));
    writeFileSync(path.join(outdir, SERVICE_WORKER_FILE), worker);

    const jsFiles = Object.keys(outputs).filter((file) => file.endsWith('.js'));
    const bytes = (files) => files.reduce((sum, file) => sum + outputs[file].bytes, 0);
    return {
        outdir,
        entry: relative(entryFile),
        stylesheet: relative(stylesheet),
        files: jsFiles.length,
        serviceWorker: SERVICE_WORKER_FILE,
        precacheFiles: precache.length,
        firstLoadFiles: preloads.length,
        firstLoadBytes: bytes(preloads),
        totalBytes: bytes(jsFiles)
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const outdir = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
    const report = await build(outdir);
    const kib = (n) => `${(n / 1024).toFixed(0)} KiB`;
    console.log(`Built ${path.relative(process.cwd(), report.outdir) || '.'}: ${report.files} script files (${kib(report.totalBytes)}); `
        + `the first load is ${report.firstLoadFiles} of them (${kib(report.firstLoadBytes)}), entry ${report.entry}.`);
}
