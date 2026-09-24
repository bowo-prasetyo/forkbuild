import { publicationsViewSourceWithTemplate } from './support/SourceFileGroups.js';

// The Publications page (ui/views/DecentralizedPublicationsView.js) hides
// many sections behind `v-if="<injected coordinator>"`. A name the template
// reads but setup() never returns is silently `undefined` at render time, so
// the section it gates can never appear — the "Use Preferred Provider"
// anchoring trigger was unreachable this way until its coordinator was added
// to setup()'s return object.
//
// This suite proves:
//   A. every bare-identifier v-if/v-else-if/v-show gate in the template is
//      returned from setup().
//   B. every function the template calls by bare name is returned from
//      setup().
//   C. the Preferred Proof & Anchoring Provider trigger is wired end to end.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${assertionCount}. ${message}`);
}

// Built-ins a template expression may call without setup() returning them.
const TEMPLATE_GLOBALS = new Set(['String', 'Number', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date']);

function splitView(text) {
    const templateStart = text.indexOf('template: `');
    const script = text.slice(0, templateStart);
    const template = text.slice(templateStart + 'template: `'.length, text.lastIndexOf('`')).replace(/<!--[\s\S]*?-->/g, '');
    const returnStart = script.lastIndexOf('\n        return {');
    const returnEnd = script.indexOf('\n        };', returnStart);
    const returnBody = script.slice(returnStart, returnEnd).replace(/\/\/.*$/gm, '');
    const returned = new Set(returnBody.slice(returnBody.indexOf('{') + 1).split(',').map((name) => name.trim().split(':')[0].trim()).filter(Boolean));
    return { template, returned };
}

function templateExpressions(template) {
    const expressions = [];
    for (const match of template.matchAll(/\{\{([\s\S]*?)\}\}/g)) expressions.push(match[1]);
    for (const match of template.matchAll(/\s(?:[:@][\w.:-]+|v-[a-z-]+(?::[\w-]+)?(?:\.\w+)*)="([^"]*)"/g)) expressions.push(match[1]);
    return expressions;
}

async function run() {
    const { template, returned } = splitView(publicationsViewSourceWithTemplate());
    assert(returned.size > 100 && returned.has('entries'), `setup()'s return object is located (${returned.size} names)`);

    // Section A
    {
        const gates = [...template.matchAll(/\sv-(?:if|else-if|show)="!?([A-Za-z_$][\w$]*)"/g)].map((match) => match[1]);
        assert(gates.length > 10, `bare-identifier gates are found in the template (${gates.length})`);
        for (const name of new Set(gates)) {
            assert(returned.has(name), `v-if/v-show gate "${name}" is returned from setup()`);
        }
    }
    console.log('✓ Section A: every bare-identifier template gate is returned from setup()');

    // Section B
    {
        const called = new Set();
        for (const expression of templateExpressions(template)) {
            const code = expression.replace(/'[^']*'|`[^`]*`/g, "''");
            for (const match of code.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) called.add(match[1]);
        }
        assert(called.size > 100, `template function calls are found (${called.size})`);
        for (const name of called) {
            if (TEMPLATE_GLOBALS.has(name)) continue;
            assert(returned.has(name), `template calls "${name}()", which is returned from setup()`);
        }
    }
    console.log('✓ Section B: every function the template calls is returned from setup()');

    // Section C
    {
        assert(/<div v-if="preferredAnchorCreationCoordinator" class="evidence-discovery">/.test(template),
            'the Preferred Provider anchoring trigger is gated on its coordinator');
        for (const name of ['preferredAnchorCreationCoordinator', 'createPreferredAnchor', 'preferredCreationView', 'preferredCreationBadgeClass', 'preferredCreationButtonLabel']) {
            assert(returned.has(name), `${name} is returned from setup()`);
        }
    }
    console.log('✓ Section C: the Preferred Proof & Anchoring Provider trigger is reachable');

    console.log(`\n✅ All Publications View Template Bindings tests passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error('PublicationsViewTemplateBindings.test.js FAILED:', error);
    process.exit(1);
});
