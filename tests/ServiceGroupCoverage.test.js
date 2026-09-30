// Every service a page injects is there when it renders. ui/main.js provides
// some services at startup and the rest in service groups (ui/serviceGroups.js)
// that load with the pages listed for them in ui/router/pageServiceGroups.js.
// This reads, for each page and for the header (ui/App.js), every module it
// statically reaches and the keys those modules inject, and fails if one of
// ui/main.js's services would be missing: a group-only service injected by the
// header, or by a page its group is not listed for. A listed group the page
// never uses fails too, since it only makes the page slower to open.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assert } from './support/Assert.js';
import { ROOT, staticGraph, stripComments } from './support/StaticImportGraph.js';
import { PAGE_SERVICE_GROUPS } from '../ui/router/pageServiceGroups.js';

const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');

// `inject('key')` calls, and the Options API's `inject: ['key']` and
// `inject: { local: { from: 'key' }, key: { default: … } }`.
export function injectedKeys(text) {
    const code = stripComments(text);
    const keys = new Set([...code.matchAll(/\binject\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
    for (const match of code.matchAll(/\binject:\s*([[{])/g)) {
        const body = balanced(code, match.index + match[0].length - 1);
        if (match[1] === '[') {
            for (const m of body.matchAll(/['"]([^'"]+)['"]/g)) keys.add(m[1]);
        } else {
            for (const [name, value] of topLevelEntries(body)) {
                const from = value.match(/\bfrom:\s*['"]([^'"]+)['"]/);
                keys.add(from ? from[1] : name);
            }
        }
    }
    return keys;
}

// The text between the bracket at `open` and its matching close.
function balanced(code, open) {
    const pairs = { '{': '}', '[': ']', '(': ')' };
    const stack = [];
    for (let i = open; i < code.length; i++) {
        const ch = code[i];
        if (pairs[ch]) stack.push(pairs[ch]);
        else if (ch === stack[stack.length - 1]) {
            stack.pop();
            if (stack.length === 0) return code.slice(open + 1, i);
        }
    }
    throw new Error('unbalanced brackets');
}

// [name, value text] for each `name: value` directly inside an object body.
function topLevelEntries(body) {
    const entries = [];
    let depth = 0;
    let start = 0;
    const parts = [];
    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if ('{[('.includes(ch)) depth++;
        else if ('}])'.includes(ch)) depth--;
        else if (ch === ',' && depth === 0) { parts.push(body.slice(start, i)); start = i + 1; }
    }
    parts.push(body.slice(start));
    for (const part of parts) {
        const m = part.match(/^\s*['"]?(\w+)['"]?\s*:([\s\S]*)$/);
        if (m) entries.push([m[1], m[2]]);
    }
    return entries;
}

// ui/main.js's services: key -> null when provided at startup, or the name
// of the service group that provides it. A group's body runs from
// `defineServiceGroup('name', …` to the `});` that closes it at the start of
// a line.
function mainServices() {
    const code = stripComments(read('ui/main.js'));
    const services = new Map();
    const groupPattern = /^defineServiceGroup\(\s*'([\w-]+)'[\s\S]*?^\}\);/gm;
    const groups = [...code.matchAll(groupPattern)];
    for (const [block, name] of groups) {
        for (const m of block.matchAll(/\bapp\.provide\(\s*'([^']+)'/g)) services.set(m[1], name);
    }
    for (const m of code.replace(groupPattern, '').matchAll(/\bapp\.provide\(\s*'([^']+)'/g)) {
        assert(!services.has(m[1]), `${m[1]} is provided both at startup and in the ${services.get(m[1])} group`);
        services.set(m[1], null);
    }
    return { services, groupNames: new Set(groups.map((g) => g[1])) };
}

function injectedBy(entry) {
    const keys = new Map(); // key -> first file seen injecting it
    for (const file of staticGraph(entry)) {
        if (!file.startsWith('ui/') && !file.startsWith('application/')) continue;
        for (const key of injectedKeys(read(file))) if (!keys.has(key)) keys.set(key, file);
    }
    return keys;
}

// The scanner itself.
{
    const sample = [
        "const a = inject('alpha', null);",
        "// inject('commented')",
        'export default {',
        "    inject: { beta: { default: null }, local: { from: 'gamma' }, delta: 'x' },",
        "    other: { inject: ['epsilon', 'zeta'] }",
        '};'
    ].join('\n');
    const found = [...injectedKeys(sample)].sort();
    assert(JSON.stringify(found) === JSON.stringify(['alpha', 'beta', 'delta', 'epsilon', 'gamma', 'zeta']),
        `the scanner finds every injected key (found ${JSON.stringify(found)})`);
}

const { services, groupNames } = mainServices();
assert(services.size > 100 && [...services.values()].some((g) => g === null), 'ui/main.js provides services at startup');
assert(groupNames.size >= 1, 'ui/main.js defines service groups');
console.log(`✓ ui/main.js provides ${[...services.values()].filter((g) => g === null).length} services at startup and ${[...services.values()].filter((g) => g !== null).length} in ${groupNames.size} groups`);

for (const [page, groups] of Object.entries(PAGE_SERVICE_GROUPS)) {
    for (const group of groups) assert(groupNames.has(group), `${page} lists "${group}", which ui/main.js does not define`);
}

// The header and everything else ui/App.js holds is on every page.
{
    const missing = [...injectedBy('ui/App.js')].filter(([key]) => services.has(key) && services.get(key) !== null);
    assert(missing.length === 0, `the header injects services that only a page's group provides:\n  ${missing.map(([key, file]) => `${key} (${file}, ${services.get(key)} group)`).join('\n  ')}`);
    console.log('✓ the header injects only services provided at startup');
}

const routerCode = stripComments(read('ui/router/index.js'));
const pages = [...new Set([...routerCode.matchAll(/(?:import\(\s*|from\s+)'\.\.\/views\/(\w+)\.js'/g)].map((m) => m[1]))];
assert(pages.length > 30, `the router's pages are found (${pages.length})`);
for (const page of Object.keys(PAGE_SERVICE_GROUPS)) assert(pages.includes(page), `${page} in pageServiceGroups.js is a page the router opens`);

const problems = [];
for (const page of pages) {
    const listed = PAGE_SERVICE_GROUPS[page] || [];
    const used = new Set();
    for (const [key, file] of injectedBy(`ui/views/${page}.js`)) {
        if (!services.has(key)) continue;
        const group = services.get(key);
        if (group === null) continue;
        used.add(group);
        if (!listed.includes(group)) problems.push(`${page} needs the "${group}" group: ${file} injects ${key}`);
    }
    for (const group of listed) if (!used.has(group)) problems.push(`${page} lists the "${group}" group but injects none of its services`);
}
assert(problems.length === 0, `pages and their service groups disagree:\n  ${problems.join('\n  ')}`);
console.log(`✓ each of the ${pages.length} pages loads the groups for every service it injects, and no others`);

console.log('\n✅ All ServiceGroupCoverage tests passed.');
