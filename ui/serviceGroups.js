// Services only some pages use, built the first time one of those pages
// opens rather than when the app starts. ui/main.js defines each group: a
// function that imports its modules, builds its services from the ones
// already running, and provides them to the app. ui/router/index.js loads
// a page's groups beside the page's own modules, so everything the page
// injects is provided before it renders. A provide added after the app
// mounted reaches every component created later.
//
// tests/ServiceGroupCoverage.test.js fails if a page injects a service that
// is neither provided at startup nor in a group its route loads.
const definitions = new Map();
const loads = new Map();

export function defineServiceGroup(name, load) {
    if (definitions.has(name)) throw new Error(`service group "${name}" is already defined`);
    definitions.set(name, load);
}

// Resolves once every named group is provided. Each group is built at most
// once; a load that fails is forgotten, so the next navigation tries again.
export function loadServiceGroups(names) {
    return Promise.all(names.map(loadServiceGroup));
}

function loadServiceGroup(name) {
    if (!loads.has(name)) {
        const load = definitions.get(name);
        if (!load) return Promise.reject(new Error(`no service group named "${name}"`));
        const loading = Promise.resolve().then(load);
        loads.set(name, loading);
        loading.catch(() => { loads.delete(name); });
    }
    return loads.get(name);
}
