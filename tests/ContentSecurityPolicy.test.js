import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { assert } from './support/Assert.js';

// index.html's Content Security Policy and import map. The browser refuses
// to run the import map unless its exact text hashes to a value listed in
// script-src, so editing one without the other would stop the app loading;
// this test catches that, and keeps the policy's restrictions in place.

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function parsePolicy(content) {
    const directives = new Map();
    for (const part of content.split(';').map((p) => p.trim()).filter(Boolean)) {
        const [name, ...values] = part.split(/\s+/);
        directives.set(name, values);
    }
    return directives;
}

const metas = [...html.matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*>/g)];
assert(metas.length === 1, `index.html declares exactly one Content-Security-Policy (found ${metas.length})`);
const policy = parsePolicy(metas[0][1]);

// Every inline script (the import map) is allowed by hash, and nothing else
// inline or remote can run.
{
    const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert(inlineScripts.length === 1, `the import map is the only inline script (found ${inlineScripts.length})`);
    const scriptSrc = policy.get('script-src') || [];
    for (const text of inlineScripts) {
        const hash = `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
        assert(scriptSrc.includes(hash), `script-src allows the import map; after editing it, set its hash in index.html to ${hash}`);
    }
    const allowed = scriptSrc.filter((source) => !source.startsWith("'sha256-"));
    assert(JSON.stringify(allowed) === JSON.stringify(["'self'", "'unsafe-eval'"]),
        `scripts load only from this origin (found ${JSON.stringify(allowed)}); 'unsafe-eval' is needed by Vue's in-browser template compiler`);
    console.log('✓ script-src: this origin, plus the import map by hash');
}

// The restrictive directives stay restrictive.
{
    const expect = {
        'default-src': ["'self'"],
        'style-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
        'frame-src': ["'none'"],
        'worker-src': ["'none'"]
    };
    for (const [name, values] of Object.entries(expect)) {
        assert(JSON.stringify(policy.get(name)) === JSON.stringify(values), `${name} is ${values.join(' ')} (found ${JSON.stringify(policy.get(name))})`);
    }
    const connect = policy.get('connect-src') || [];
    assert(!connect.includes('*') && !connect.includes('http:') && !connect.includes('ws:'),
        `connect-src allows no plain http:/ws: beyond local nodes (found ${JSON.stringify(connect)})`);
    console.log('✓ the policy keeps its restrictive directives');
}

// Every import map entry is a local, vendored file.
{
    const importMap = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
    for (const [specifier, target] of Object.entries(importMap.imports)) {
        assert(target.startsWith('./vendor/'), `"${specifier}" maps into vendor/ (found ${target})`);
        const path = new URL('../' + target.slice(2), import.meta.url);
        assert(target.endsWith('/') || existsSync(path), `"${specifier}" maps to an existing file (${target})`);
    }
    console.log('✓ the import map points only at vendored files');
}

console.log('\n✅ All ContentSecurityPolicy tests passed.');
