import { readFile } from 'node:fs/promises';

// 0.9.17 — Integrate World Encounters into the Existing World View.
//
// 0.9.15 mounted `ui/components/WorldEncounterCanvas.js` behind its own,
// separate `/live-world` route (`ui/views/LiveWorldView.js`) — a deliberate
// proving ground, never intended as a second, permanent, user-facing World
// concept alongside `/world/:documentId`. This milestone consolidates the
// presentation mount point, and only the mount point: `ui/views/WorldView.js`
// now injects the SAME app-wide `worldDiscoverySourceRegistry`
// `ui/main.js` already provides (0.9.14) and `LiveWorldView.js` already
// injects (0.9.15), and hands it straight through as `WorldEncounterCanvas`'s
// own `registry` prop — inside a new "World Encounters" `CollapsibleSection`,
// alongside Explore mode's existing "Nearby ___" sections.
//
//   ui/main.js
//       │
//       └── app.provide('worldDiscoverySourceRegistry', registry)   (0.9.14)
//                     │
//                     ├───────────────────────────────┐
//                     ▼                                ▼
//           LiveWorldView.js  (0.9.15,          WorldView.js  ★ (THIS milestone)
//            unchanged, kept                     inject('worldDiscoverySourceRegistry')
//            for `/live-world`)                          │
//                     │                                   ▼
//                     ▼                        "World Encounters" CollapsibleSection
//           WorldEncounterCanvas ────────────▶ WorldEncounterCanvas :registry="…"
//           :registry="…"                       (0.9.3–0.9.13, unmodified)
//
// `ui/views/WorldView.js` OWNS NO DISCOVERY LOGIC OF ANY KIND — the exact
// same architectural boundary `ui/views/LiveWorldView.js` already held
// (0.9.15's own header). It never calls `registry.setSource()`/
// `removeSource()`/`clear()`, never reads `registry.listSources()` or a
// source's own `origin` field, and never calls `deriveWorldEncounters()`,
// `describeWorldFromDiscoveryRegistry()`, `describeWorldFromDiscoverySources()`,
// or `assembleWorldDiscoveryInputs()` itself — every one of those stays
// entirely inside `WorldEncounterCanvas`'s own job, unchanged. This file
// asserts that boundary the SAME way `tests/LiveWorldView.test.js`
// (Section B) and `tests/LiveWorldViewRegistrySubscription.test.js`
// (Section H) already do for their own files: by reading `WorldView.js`'s
// own source as plain text, never importing it — `ui/views/WorldView.js`
// imports `vue`/`vue-router` (`ref`, `computed`, `useRoute`, `useRouter`),
// which, like every other page-level view in this codebase, has no real
// package to resolve under plain Node; only the browser test runner's own
// import map supplies one.
//
// Section A: `ui/views/WorldView.js` imports and registers
//            `WorldEncounterCanvas`, injects the same
//            `worldDiscoverySourceRegistry` key `ui/main.js` provides
//            (defaulting to `null`, never throwing with no provider
//            above it — the same defensive convention `LiveWorldView.js`
//            already uses), and mounts it in its own template, handing
//            the injected registry straight through as `registry`.
// Section B: `WorldView.js` performs no discovery logic of its own around
//            that registry — the same boundary assertions
//            `tests/LiveWorldView.test.js` already makes for
//            `LiveWorldView.js`.
// Section C: `ui/router/index.js` still routes `/world/:documentId` to
//            `WorldView` and keeps `/live-world` registered, pointing at
//            `LiveWorldView` — the route is consolidated in presentation,
//            not deleted.
// Section D: `ui/App.js` no longer carries a separate top-nav "Live World"
//            link — `/world` is the one canonical, user-facing World
//            destination from this milestone forward.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function run() {
    const worldViewSource = await readFile(new URL('../ui/views/WorldView.js', import.meta.url), 'utf8');
    const worldViewCodeOnly = worldViewSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

    // ---------------------------------------------------------------
    // Section A — WorldView.js imports, registers, injects, and mounts
    // WorldEncounterCanvas against the app-wide registry.
    // ---------------------------------------------------------------
    {
        assert(worldViewCodeOnly.includes("import WorldEncounterCanvas from '../components/WorldEncounterCanvas.js'"),
            '1. WorldView.js imports the already-existing WorldEncounterCanvas — never a second, competing canvas');
        assert(/components:\s*\{[\s\S]*?WorldEncounterCanvas[\s\S]*?\}/.test(worldViewCodeOnly),
            '2. WorldView.js registers WorldEncounterCanvas among its own components');
        assert(worldViewCodeOnly.includes("inject('worldDiscoverySourceRegistry', null)"),
            '3. WorldView.js injects the SAME key ui/main.js provides app-wide, defaulting to null rather than throwing with no provider above it');
        assert(/<WorldEncounterCanvas\s+:registry="worldDiscoverySourceRegistry"\s*\/>/.test(worldViewCodeOnly),
            '4. WorldView.js hands the injected registry straight through as WorldEncounterCanvas\'s own registry prop, with no view prop');
        assert(/<CollapsibleSection[\s\S]{0,120}title="World Encounters"/.test(worldViewCodeOnly),
            '5. the canvas is mounted inside a "World Encounters" CollapsibleSection, alongside Explore mode\'s existing Nearby sections');

        console.log('✓ Section A: WorldView.js imports, registers, injects, and mounts WorldEncounterCanvas against the app-wide discovery registry');
    }

    // ---------------------------------------------------------------
    // Section B — architectural boundary: WorldView.js owns no discovery
    // logic of its own around worldDiscoverySourceRegistry.
    // ---------------------------------------------------------------
    {
        assert(!/registry\.setSource\(|registry\.removeSource\(|registry\.clear\(/.test(worldViewCodeOnly),
            '6. WorldView.js never mutates the discovery registry\'s own membership');
        assert(!worldViewCodeOnly.includes('registry.listSources('),
            '7. WorldView.js never reads registry.listSources() itself');
        assert(!worldViewCodeOnly.includes('deriveWorldEncounters'),
            '8. WorldView.js never calls deriveWorldEncounters() directly');
        assert(!worldViewCodeOnly.includes('describeWorldFromDiscoveryRegistry') && !worldViewCodeOnly.includes('describeWorldFromDiscoverySources'),
            '9. WorldView.js never computes a World Encounter projection itself — that stays WorldEncounterCanvas\'s own job');
        assert(!worldViewCodeOnly.includes('assembleWorldDiscoveryInputs'),
            '10. WorldView.js never assembles World discovery inputs directly');
        assert(!worldViewCodeOnly.includes("from '../../application/WorldDiscoverySourceRegistry.js'") && !worldViewCodeOnly.includes('new WorldDiscoverySourceRegistry('),
            '11. WorldView.js never constructs its own WorldDiscoverySourceRegistry — it only ever receives the one instance ui/main.js already provides');

        console.log('✓ Section B: WorldView.js performs no discovery logic of its own around worldDiscoverySourceRegistry — every behavior stays WorldEncounterCanvas\'s own job');
    }

    // ---------------------------------------------------------------
    // Section C — the router keeps both routes: /world/:documentId at
    // WorldView, /live-world (unchanged) at LiveWorldView.
    // ---------------------------------------------------------------
    {
        const routerSource = await readFile(new URL('../ui/router/index.js', import.meta.url), 'utf8');
        assert(/\{\s*path:\s*'\/world\/:documentId',\s*name:\s*'world',\s*component:\s*WorldView\s*\}/.test(routerSource),
            '12. /world/:documentId still routes to WorldView');
        assert(routerSource.includes("path: '/live-world'") && routerSource.includes('LiveWorldView'),
            '13. /live-world remains registered and still points at LiveWorldView — kept, not deleted');

        console.log('✓ Section C: both routes remain registered — /world/:documentId at WorldView, /live-world (unchanged) at LiveWorldView');
    }

    // ---------------------------------------------------------------
    // Section D — App.js drops the separate "Live World" top-nav link;
    // /world is the one canonical, user-facing World destination.
    // ---------------------------------------------------------------
    {
        const appSource = await readFile(new URL('../ui/App.js', import.meta.url), 'utf8');
        assert(!appSource.includes("to=\"/live-world\""), '14. App.js no longer links directly to /live-world from the top nav');
        assert(!/>\s*Live World\s*</.test(appSource), '15. App.js no longer carries a separate "Live World" nav label');

        console.log('✓ Section D: App.js no longer exposes a separate "Live World" top-nav destination');
    }

    console.log('\nAll World View Encounter Integration tests passed.');
}

run().catch((error) => {
    console.error('WorldViewEncounterIntegration.test.js FAILED:', error);
    process.exitCode = 1;
});
