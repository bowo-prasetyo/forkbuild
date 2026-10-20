// The published site compiles every component's template when it is built
// (scripts/templatePlugin.mjs), so it runs Vue's runtime-only build with no
// 'unsafe-eval'. Every template under ui/ compiles, templates made of
// sections and template functions come out whole, and anything the plugin
// can't read as a constant stops the build rather than reaching the browser
// uncompiled. tests/run-bundle.mjs opens the compiled app itself.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert } from './support/Assert.js';
import { checkCompilerVersion, precompileModule } from '../scripts/templatePlugin.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function throwsWith(run, pattern, description) {
    try {
        run();
    } catch (error) {
        assert(pattern.test(error.message), `${description}: ${error.message}`);
        return;
    }
    assert(false, `${description}: it compiled`);
}

{
    checkCompilerVersion(ROOT);
    const files = execFileSync('git', ['ls-files', 'ui/*.js', 'ui/**/*.js'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
    let templates = 0;
    for (const file of files) {
        const result = precompileModule(readFileSync(path.join(ROOT, file), 'utf8'), path.join(ROOT, file));
        if (!result) continue;
        templates += result.compiled.size;
        assert(!/\btemplate\s*:\s*`/.test(result.contents), `${file} has no template left once compiled`);
    }
    assert(templates > 150, `every component's template is found (${templates})`);
    console.log(`✓ all ${templates} component templates under ui/ compile, with the compiler of the Vue the bundle runs`);
}

const dir = mkdtempSync(path.join(tmpdir(), 'forkbuild-templates-'));
try {
    const at = (name) => path.join(dir, name);
    writeFileSync(at('section.js'), 'const inner = `<em>{{ title }}</em>`;\nexport const sectionTemplate = `<h2>${inner}</h2>`;\n');
    const component = [
        "import { sectionTemplate } from './section.js';",
        'const ROW = (item) => `<li v-for="x in ${item}" :key="x">{{ x }}</li>`;',
        'export default {',
        "    name: 'Example',",
        '    template: `<div>${sectionTemplate}<ul>${ROW(\'items\')}</ul><button @click="go">Go</button></div>`',
        '};',
        'export function avatar(effective) {',
        '    const { template, appearance } = effective;',
        '    return { template, appearance };',
        '}',
        ''
    ].join('\n');
    const result = precompileModule(component, at('Example.js'));
    assert(result && result.compiled.size === 1, 'the component\'s one template is compiled; a { template } taken apart is not one');
    const [code] = result.compiled.values();
    assert(/export function render\(_ctx, _cache\)/.test(code) && /from "vue"/.test(code), 'it becomes a module exporting render, importing from vue');
    assert(code.includes('"h2"') && code.includes('"em"') && code.includes('_ctx.title'), 'the imported section, and the section it is made of, are part of it');
    assert(code.includes('_renderList(_ctx.items') && code.includes('_ctx.go'), 'the template function\'s call is filled in with its argument');
    assert(/render: __forkbuildTemplate0/.test(result.contents) && !/template: `/.test(result.contents), 'the component gets render in place of template');
    assert(result.contents.split('\n').length === component.split('\n').length, 'every line of the component keeps its number');
    assert(result.contents.includes('const { template, appearance } = effective;\n    return { template, appearance };'), 'code that only names a template is left as it is');
    console.log('✓ a template made of imported sections and a template function compiles whole; the component imports its render function');

    throwsWith(() => precompileModule('let n = 1;\nexport default { template: `<p>${n}</p>` };\n', at('Let.js')),
        /Let\.js: \$\{n\} in a template is neither a constant/, 'a ${} that names a variable');
    throwsWith(() => precompileModule('export default { template: `<p>${1 + 1}</p>` };\n', at('Sum.js')),
        /Sum\.js:1: .*not BinaryExpression/, 'a ${} that computes');
    throwsWith(() => precompileModule("import { missing } from './section.js';\nexport default { template: `${missing}` };\n", at('Missing.js')),
        /section\.js exports no constant template named missing/, 'a section the module does not export');
    throwsWith(() => precompileModule('export default { template: markup };\n', at('Name.js')),
        /Name\.js:1: a template must be a template literal or a string/, 'a template held in a variable');
    throwsWith(() => precompileModule('export default { template: `<div><p></div>` };\n', at('Broken.js')),
        /Broken\.js:1: the template does not compile/, 'a template with an unclosed element');
    console.log('✓ a template the plugin cannot read as a constant, or that does not compile, stops the build and names the file');
} finally {
    rmSync(dir, { recursive: true, force: true });
}
