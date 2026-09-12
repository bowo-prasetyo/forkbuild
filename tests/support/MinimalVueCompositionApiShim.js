// 0.9.448 — Minimal Vue Composition API Test Shim.
//
// TYPE: test-support-only. Never imported by any production file.
//
// This codebase's own `vue` import is resolved, in the browser, through
// `index.html`'s own import map, to a CDN URL — there is no local `vue`
// package a plain `node tests/Foo.test.js` run can resolve. Every prior
// test in this codebase that needed to exercise a Composition-API Vue view
// file's own logic worked around that absence either by testing only the
// non-view collaborators underneath it, or (see
// `ui/views/ReconciliationWorkspaceView.js`'s own header) by writing the
// view in plain Options-API `methods`, callable directly with no Vue
// runtime at all. `ui/views/NostrPublicationRelaySettingsView.js` (0.9.447)
// is Composition-API, so neither escape hatch applies to it — this file is
// the smallest thing that lets `tests/NostrPublicationRelayConfigurationIntegrationBoundaryAudit.test.js`
// (0.9.448) call that REAL, UNMODIFIED view's own `setup()` and observe its
// real `save()`/`load()`/`useDeploymentDefault()` behavior, rather than
// re-deriving that behavior a second time by hand from its source text.
//
// NOT A VUE REIMPLEMENTATION — A DELIBERATELY NON-REACTIVE STAND-IN FOR
// EXACTLY THE FOUR PRIMITIVES THIS ONE VIEW FILE IMPORTS. `ref()`/`computed()`/
// `inject()`/`onMounted()`, and nothing else — no `watch`, no `reactive`, no
// component tree, no template compiler, no DOM. `computed()`'s own getter is
// evaluated fresh on every `.value` read rather than memoized/dependency-
// tracked, which is observably IDENTICAL to real Vue for a getter with no
// side effects and no async gap between a write and the next read — exactly
// how this one view's own `hasOverride`/`effectiveRelayUrls` are used.
//
// `mountComponent(component, injectionContext)` IS THE ONE TEST-ONLY
// HARNESS FUNCTION THIS FILE ADDS BEYOND VUE'S OWN API SURFACE — it exists
// only because this shim has no real component-instance tree of its own to
// scope `inject()`/`onMounted()` calls to. It: (1) makes `injectionContext`
// (a plain `{ key: value }` object) the answer to every `inject()` call
// during this one `setup()` invocation, (2) calls `component.setup()`,
// (3) restores whatever injection/onMounted scope was active before (so
// nested/sequential `mountComponent()` calls in one test file never leak
// into one another), and (4) THEN fires every `onMounted()` callback that
// `setup()` itself registered, mirroring real Vue's own "onMounted fires
// after setup, once mounting completes" ordering. Returns exactly what
// `setup()` itself returned — the same object a real template would bind
// to.
let currentInjectionContext = {};
let currentMountedCallbackQueue = null;

export function ref(value) {
    return { value };
}

export function computed(getter) {
    return { get value() { return getter(); } };
}

export function inject(key, defaultValue) {
    return Object.prototype.hasOwnProperty.call(currentInjectionContext, key)
        ? currentInjectionContext[key]
        : defaultValue;
}

export function onMounted(callback) {
    if (currentMountedCallbackQueue) {
        currentMountedCallbackQueue.push(callback);
    }
}

// Test harness only — see this file's own header. Simulates one real
// mount of `component` (a plain `{ setup() {...} }` object, exactly the
// shape every Composition-API view file in this codebase already exports)
// against `injectionContext`, returning `setup()`'s own returned object
// after every `onMounted()` callback it registered has already run.
export function mountComponent(component, injectionContext = {}) {
    const previousInjectionContext = currentInjectionContext;
    const previousMountedCallbackQueue = currentMountedCallbackQueue;
    currentInjectionContext = injectionContext;
    const mountedCallbackQueue = [];
    currentMountedCallbackQueue = mountedCallbackQueue;
    let exposed;
    try {
        exposed = component.setup();
    } finally {
        currentInjectionContext = previousInjectionContext;
        currentMountedCallbackQueue = previousMountedCallbackQueue;
    }
    for (const callback of mountedCallbackQueue) callback();
    return exposed;
}
