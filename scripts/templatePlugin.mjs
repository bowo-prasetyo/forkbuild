// Compiles the components' string templates when the site is bundled
// (scripts/build.mjs), so the published app runs Vue's runtime-only build and
// its Content Security Policy needs no 'unsafe-eval': nothing is compiled in
// the browser. The unbundled repository still compiles them in the browser,
// with the full build its import map names.
//
// Every `template:` in a module under ui/ is compiled with @vue/compiler-dom,
// the compiler the browser would run, the version vendor/vue holds. A
// template is a template literal (or a string), and each ${…} in it must be a
// constant template literal of its own: one declared in the same module, or
// imported from another (the sections under ui/**/templates/), which may in
// turn be made of others, or a call, with strings, of a constant arrow
// function that returns a template literal (ui/components/
// FormattedDescription.js). Anything else stops the build, as does a template
// the compiler reports an error in.
//
// The compiled render function is its own module, imported by the component
// in place of the template:
//
//   template: `<p>{{ t('home.title') }}</p>`
//   becomes
//   render: __forkbuildTemplate0
//   with `import { render as __forkbuildTemplate0 } from 'forkbuild-template:<file>#0'`
//
// and its import of 'vue' resolves like every other one.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { babelParse } from 'vue/compiler-sfc';
import { compile } from '@vue/compiler-dom';

const NAMESPACE = 'forkbuild-template';
const RENDER_NAME = '__forkbuildTemplate';
const TEMPLATE_PROPERTY = /\btemplate\s*:/;

const COMPILER_OPTIONS = Object.freeze({
    mode: 'module',
    prefixIdentifiers: true,
    hoistStatic: true,
    cacheHandlers: true,
    // As the production runtime compiler does: comments in a template are notes for whoever edits it.
    comments: false
});

// Fails unless the compiler is the version of the Vue the bundle runs:
// compiled templates call that runtime's internals.
export function checkCompilerVersion(root) {
    const require = createRequire(path.join(root, 'package.json'));
    const compilerVersion = require('@vue/compiler-dom/package.json').version;
    const runtimeVersion = readFileSync(path.join(root, 'vendor/vue/VERSION'), 'utf8').trim();
    if (compilerVersion !== runtimeVersion) {
        throw new Error(`@vue/compiler-dom is ${compilerVersion} but vendor/vue is ${runtimeVersion}; run npm ci, or node scripts/vendor.mjs after upgrading Vue`);
    }
}

function parse(source, file) {
    try {
        return babelParse(source, { sourceType: 'module', sourceFilename: file });
    } catch (error) {
        throw new Error(`${file}: ${error.message}`);
    }
}

// Every node of `node`'s tree, depth first.
function* walk(node) {
    if (!node || typeof node.type !== 'string') return;
    yield node;
    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
        const value = node[key];
        if (Array.isArray(value)) {
            for (const child of value) yield* walk(child);
        } else if (value && typeof value.type === 'string') {
            yield* walk(value);
        }
    }
}

// A `template:` in an object literal. A `{ template }` taken apart is not
// one, and nor is a shorthand `{ template }` (an avatar's template, say).
function isTemplateProperty(node) {
    if (node.type !== 'ObjectProperty' || node.computed || node.shorthand) return false;
    return (node.key.type === 'Identifier' && node.key.name === 'template')
        || (node.key.type === 'StringLiteral' && node.key.value === 'template');
}

// Resolves a module's constant template literals, following imports from
// other modules; each module is read and parsed once per build.
class TemplateConstants {
    constructor() {
        this._modules = new Map();
    }

    // The text of `node`, a template literal or a string in `file`. `bindings`
    // are the parameters of the function being called, by name.
    textOf(node, file, chain = [], bindings = new Map()) {
        if (node.type === 'StringLiteral') return node.value;
        if (node.type !== 'TemplateLiteral') {
            throw new Error(`${file}:${node.loc.start.line}: a template must be a template literal or a string, not ${node.type}`);
        }
        let text = '';
        node.quasis.forEach((quasi, index) => {
            if (quasi.value.cooked === null || quasi.value.cooked === undefined) {
                throw new Error(`${file}:${quasi.loc.start.line}: a template has an invalid escape sequence`);
            }
            text += quasi.value.cooked;
            const expression = node.expressions[index];
            if (!expression) return;
            if (expression.type === 'Identifier' && bindings.has(expression.name)) {
                text += bindings.get(expression.name);
            } else if (expression.type === 'Identifier') {
                text += this._constant(file, expression.name, chain);
            } else if (expression.type === 'CallExpression') {
                text += this._call(expression, file, chain, bindings);
            } else {
                throw new Error(`${file}:${expression.loc.start.line}: \${…} in a template must name a constant template or call a template function, not ${expression.type}`);
            }
        });
        return text;
    }

    _call(call, file, chain, bindings) {
        const where = `${file}:${call.loc.start.line}`;
        if (call.callee.type !== 'Identifier') throw new Error(`${where}: a template can only call a template function by name`);
        const fn = this._module(file).functions.get(call.callee.name);
        if (!fn) throw new Error(`${where}: ${call.callee.name} is not a constant arrow function in this module that returns a template literal`);
        if (call.arguments.length !== fn.params.length) throw new Error(`${where}: ${call.callee.name} takes ${fn.params.length} argument(s)`);
        const args = new Map(fn.params.map((param, index) => {
            const argument = call.arguments[index];
            if (argument.type === 'StringLiteral') return [param, argument.value];
            if (argument.type === 'Identifier' && bindings.has(argument.name)) return [param, bindings.get(argument.name)];
            throw new Error(`${where}: ${call.callee.name} must be called with strings`);
        }));
        const key = `${file}#${call.callee.name}()`;
        if (chain.includes(key)) throw new Error(`${where}: template function ${call.callee.name} calls itself`);
        return this.textOf(fn.body, file, [...chain, key], args);
    }

    _constant(file, name, chain) {
        const key = `${file}#${name}`;
        if (chain.includes(key)) throw new Error(`${file}: template ${name} includes itself (${[...chain, key].join(' → ')})`);
        const module = this._module(file);
        const declared = module.constants.get(name);
        if (declared) return this.textOf(declared, file, [...chain, key]);
        const imported = module.imports.get(name);
        if (imported) {
            const from = path.resolve(path.dirname(file), imported.source);
            return this._exported(from, imported.name, file, [...chain, key]);
        }
        throw new Error(`${file}: \${${name}} in a template is neither a constant declared in the module nor one it imports`);
    }

    _exported(file, name, importer, chain) {
        const module = this._module(file);
        if (!module.exports.has(name)) throw new Error(`${importer}: ${path.basename(file)} exports no constant template named ${name}`);
        return this._constant(file, module.exports.get(name), chain);
    }

    // Indexes `ast`, the module at `file` as it is being compiled, in place
    // of reading the file.
    remember(file, ast) {
        this._modules.set(file, this._index(ast));
    }

    _module(file) {
        if (!this._modules.has(file)) this._modules.set(file, this._index(parse(readFileSync(file, 'utf8'), file)));
        return this._modules.get(file);
    }

    _index(ast) {
        const constants = new Map();
        const functions = new Map();
        const imports = new Map();
        const exports = new Map();
        for (const statement of ast.program.body) {
            const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
            if (declaration && declaration.type === 'VariableDeclaration' && declaration.kind === 'const') {
                for (const declarator of declaration.declarations) {
                    if (declarator.id.type !== 'Identifier' || !declarator.init) continue;
                    const init = declarator.init;
                    if (init.type === 'ArrowFunctionExpression' && init.body.type === 'TemplateLiteral' && init.params.every((param) => param.type === 'Identifier')) {
                        functions.set(declarator.id.name, { params: init.params.map((param) => param.name), body: init.body });
                        continue;
                    }
                    if (init.type !== 'TemplateLiteral' && init.type !== 'StringLiteral') continue;
                    constants.set(declarator.id.name, declarator.init);
                    if (declaration !== statement) exports.set(declarator.id.name, declarator.id.name);
                }
            }
            if (statement.type === 'ImportDeclaration' && statement.source.value.startsWith('.')) {
                for (const specifier of statement.specifiers) {
                    if (specifier.type !== 'ImportSpecifier') continue;
                    const importedName = specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value;
                    imports.set(specifier.local.name, { source: statement.source.value, name: importedName });
                }
            }
            if (statement.type === 'ExportNamedDeclaration' && !statement.declaration && !statement.source) {
                for (const specifier of statement.specifiers) {
                    const exportedName = specifier.exported.type === 'Identifier' ? specifier.exported.name : specifier.exported.value;
                    exports.set(exportedName, specifier.local.name);
                }
            }
        }
        return { constants, functions, imports, exports };
    }
}

// Compiles one template to a module exporting `render`, or throws with every
// error the compiler reported.
export function compileTemplate(template, where) {
    const errors = [];
    const { code } = compile(template, {
        ...COMPILER_OPTIONS,
        onError: (error) => errors.push(error),
        onWarn: (warning) => errors.push(warning)
    });
    if (errors.length > 0) {
        const lines = errors.map((error) => {
            const at = error.loc ? ` (template line ${error.loc.start.line}, column ${error.loc.start.column})` : '';
            return `  ${error.message}${at}`;
        });
        throw new Error(`${where}: the template does not compile:\n${lines.join('\n')}`);
    }
    return code;
}

// `source` (the module at `file`) with each template replaced by an import
// of its compiled render function, and the compiled modules by import path;
// null when the module has no template.
export function precompileModule(source, file, constants = new TemplateConstants()) {
    if (!TEMPLATE_PROPERTY.test(source)) return null;
    const ast = parse(source, file);
    constants.remember(file, ast);
    const properties = [...walk(ast.program)]
        .filter((node) => node.type === 'ObjectExpression')
        .flatMap((object) => object.properties.filter(isTemplateProperty));
    if (properties.length === 0) return null;

    const compiled = new Map();
    const imports = [];
    let contents = source;
    // From the last to the first, so each replacement leaves the offsets of the ones before it as they are.
    properties.sort((a, b) => b.start - a.start).forEach((property, reverseIndex) => {
        const index = properties.length - 1 - reverseIndex;
        const where = `${file}:${property.loc.start.line}`;
        const template = constants.textOf(property.value, file);
        const specifier = `${NAMESPACE}:${file}#${index}`;
        compiled.set(specifier, compileTemplate(template, where));
        imports.push(`import { render as ${RENDER_NAME}${index} } from ${JSON.stringify(specifier)};`);
        contents = `${contents.slice(0, property.start)}render: ${RENDER_NAME}${index}${contents.slice(property.end)}`;
    });
    // On the first line, so every other line keeps its number.
    return { contents: imports.reverse().join(' ') + contents, compiled };
}

// The esbuild plugin: modules under `directories` (relative to `root`) have
// their templates compiled. Must come before any plugin that resolves bare
// imports, since a compiled template's import path is not one.
export function templatePlugin(root, directories = ['ui/']) {
    return {
        name: 'forkbuild-templates',
        setup(build) {
            const constants = new TemplateConstants();
            const compiled = new Map();
            const prefixes = directories.map((directory) => path.join(root, directory));
            build.onResolve({ filter: new RegExp(`^${NAMESPACE}:`) }, (args) => ({ path: args.path, namespace: NAMESPACE }));
            build.onLoad({ filter: /.*/, namespace: NAMESPACE }, (args) => {
                if (!compiled.has(args.path)) return { errors: [{ text: `no compiled template ${args.path}` }] };
                return { contents: compiled.get(args.path), loader: 'js', resolveDir: root };
            });
            build.onLoad({ filter: /\.js$/ }, (args) => {
                if (!prefixes.some((prefix) => args.path.startsWith(prefix))) return undefined;
                const result = precompileModule(readFileSync(args.path, 'utf8'), args.path, constants);
                if (!result) return undefined;
                for (const [specifier, code] of result.compiled) compiled.set(specifier, code);
                return { contents: result.contents, loader: 'js', resolveDir: path.dirname(args.path) };
            });
        }
    };
}
