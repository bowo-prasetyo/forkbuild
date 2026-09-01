import { inject } from 'vue';
import WorldEncounterCanvas from '../components/WorldEncounterCanvas.js';

// 0.9.15 — Mount Live World View.
//
// 0.9.0 through 0.9.14 built a complete, tested World discovery runtime —
// a registry that tracks live sources (0.9.9), a peer lifecycle bridge
// (0.9.11), change notification (0.9.12), a canvas that subscribes to a
// registry and re-renders on its own (0.9.13), and, finally, `ui/main.js`
// actually constructing one running `WorldDiscoverySourceRegistry` and
// providing it app-wide as `worldDiscoverySourceRegistry` (0.9.14). Every
// one of those milestones stopped exactly one step short of the running
// application's own visible surface — 0.9.14's own header named the gap
// by name: "Mounting `ui/components/WorldEncounterCanvas.js` into a
// route, or any other UI surface... is a separate, later, unscheduled UI
// concern." This file, and the one new route in `ui/router/index.js`
// that renders it, are that step, and only that step.
//
//   ui/main.js
//       │
//       ├── owns WorldDiscoveryRuntime                        (0.9.14)
//       │
//       └── app.provide('worldDiscoverySourceRegistry', registry)
//                     │
//                     ▼
//           LiveWorldView.js  ★ (this milestone)
//                inject('worldDiscoverySourceRegistry')
//                     │
//                     ▼
//           WorldEncounterCanvas :registry="…"          (0.9.13, unmodified)
//                     │
//                     ▼
//           live World encounters
//
// THIS FILE OWNS NO DISCOVERY LOGIC OF ANY KIND. It does not construct a
// peer source, does not listen to `peerMessageBus`, does not call
// `registry.setSource()`/`registry.removeSource()`, does not inspect a
// peer's identity, does not call `deriveWorldEncounters()` or any other
// projection function, does not sort or deduplicate anything, does not
// verify a signature, and does not fetch remote content. Every one of
// those already lives behind `WorldEncounterCanvas`'s own `registry` prop
// (0.9.13) and `bootstrapWorldDiscoveryRuntime()` (0.9.14) — this file's
// entire job is to `inject()` the one collaborator `ui/main.js` already
// constructed and hand it straight through, unmodified, as a prop. The
// composition root (`ui/main.js`) stays in charge of runtime wiring; this
// file stays in charge of nothing but mounting the canvas that presents
// it.
//
// `worldDiscoverySourceRegistry` DEFAULTS TO `null`, NEVER THROWS. The
// second `inject()` argument is an explicit fallback, the same defensive
// convention every other optional collaborator among this codebase's
// page-level views already uses (e.g.
// `ui/views/IdentityManagementView.js`'s own
// `inject('identityLifecyclePropagationUseCase', null)`). A mount with no
// provider above it renders `WorldEncounterCanvas` with `registry: null`,
// which itself already degrades to the plain, pre-0.9.13 `view`-prop-
// driven behavior — never a thrown error.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any discovery logic of any kind.** See "this file owns no discovery
//   logic," above — every behavior stays exactly where 0.9.0 through
//   0.9.14 already put it.
// - **A page-local Wanderer position, selection detail panel, or any
//   other UI beyond mounting the canvas.** `WorldEncounterCanvas` already
//   owns all of that (0.9.3/0.9.4); this file adds no template beyond
//   rendering it.
// - **Encounter inspection, material resolution, or signature
//   verification.** Separate, later, unscheduled milestones (0.9.16
//   through 0.9.18).
export default {
    name: 'LiveWorldView',
    components: { WorldEncounterCanvas },
    setup() {
        const worldDiscoverySourceRegistry = inject('worldDiscoverySourceRegistry', null);
        return { worldDiscoverySourceRegistry };
    },
    template: `
        <div class="live-world-view">
            <WorldEncounterCanvas :registry="worldDiscoverySourceRegistry" />
        </div>
    `
};
