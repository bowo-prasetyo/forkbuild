// Vue drops a text node that is only whitespace when it is the first or last
// thing inside a <template v-if>, so `text<template v-if="x"> {{ more }}</template>`
// shows "textmore". A space that must stay goes inside the expression:
// `<template v-if="x">{{ ' ' + more }}</template>`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { assert } from './support/Assert.js';

function sources(dir) {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? sources(path) : (path.endsWith('.js') ? [path] : []);
    });
}

const LEADING = /<template v-(?:if|else-if|else)\b[^>]*> \{\{/;
const TRAILING = /<template v-(?:if|else-if|else)\b[^>]*>[^<]*\}\} <\/template>/;
const offenders = [];
for (const path of sources(new URL('../ui', import.meta.url).pathname)) {
    readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
        if (LEADING.test(line) || TRAILING.test(line)) offenders.push(`${path.replace(/.*\/ui\//, 'ui/')}:${index + 1}`);
    });
}
assert(offenders.length === 0, `a space Vue would drop, at the edge of a conditional template: ${offenders.join(', ')}`);
console.log('✅ No conditional template loses a space.');
