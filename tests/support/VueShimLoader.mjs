// 0.9.448 — Node ESM loader hook redirecting the bare `vue` specifier to
// `MinimalVueCompositionApiShim.js` (this same directory).
//
// TYPE: test-support-only, registered via `node:module`'s `register()` from
// inside a test file's own process — never a global Node flag, never
// anything a production file or a real browser page load ever goes
// through. `index.html`'s own import map (the REAL, unmodified resolution
// `vue` gets in production and in a browser) is completely untouched by
// this file; this hook exists solely so a `node tests/Foo.test.js` run —
// which has no import map and no browser — can import a real,
// Composition-API `ui/views/*.js` file at all. Every OTHER specifier
// (every relative `./`/`../` import the target view file itself makes, to
// real, unmodified `core/`/`application/`/`storage/` files) is left
// entirely alone, via `nextResolve()` — this hook's own reach is exactly
// one bare specifier, `'vue'`, and nothing else.
export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'vue') {
        return { url: new URL('./MinimalVueCompositionApiShim.js', import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
}
