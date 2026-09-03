import { readFile } from 'node:fs/promises';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeLocalWorldDiscoverySource } from '../application/WorldEncounterIntegration.js';
import { describePeerWorldDiscoverySource } from '../peer/PeerWorldDataIngress.js';

// 0.9.13 — Live World View Registry Subscription.
//
// 0.9.10 proved a World View can be DERIVED from a registry's current
// membership (describeWorldFromDiscoveryRegistry()); 0.9.12 proved the
// registry CAN NOTIFY a subscriber when that membership changes
// (registry.subscribe()). Neither wired an actual running World View
// component to the other — both milestones' own headers named that
// exact gap and left it unscheduled. This file exercises the wiring
// ui/components/WorldEncounterCanvas.js now performs: a `registry` prop,
// subscribed in `mounted()`, re-projected via 0.9.10's own unmodified
// function on every notification, unsubscribed in `beforeUnmount()`.
//
// This file uses the SAME "call lifecycle/computed/methods.call(ctx)"
// discipline tests/WorldEncounterCanvasUI.test.js and
// tests/WorldEncounterSelectionUI.test.js already established — there is
// no real Vue runtime anywhere in this test suite, so `mounted()` and
// `beforeUnmount()` are invoked directly against a plain ctx object that
// carries the component's own props/data/methods.
//
// Section A: FLAGSHIP — local -> peer B connects -> peer A disconnects,
//            entirely through registry.subscribe(), matching the
//            milestone's own flagship scenario.
// Section B: unmounting stops all further updates — beforeUnmount()'s own
//            unsubscribe() takes effect.
// Section C: no registry prop at all leaves this component driven purely
//            by the `view` prop, exactly as before 0.9.13 — mounted()
//            never subscribes.
// Section D: mounted() seeds worldView from the registry's CURRENT
//            membership immediately, without waiting for a future change.
// Section E: replacement, not mutation — an old worldView snapshot is
//            never mutated in place; a new notification produces an
//            entirely new object.
// Section F: registry wins over view when both are supplied.
// Section G: a malformed/absent registry (no subscribe method) degrades
//            to the same behavior as no registry at all — never throws.
// Section H: architectural boundary — WorldEncounterCanvas.js never
//            calls setSource()/removeSource()/clear(), never reads
//            source.origin or listSources() itself, and never calls
//            deriveWorldEncounters()/assembleWorldDiscoveryInputs()/
//            describeWorldFromDiscoverySources() directly.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function connectedPeerOf(identityId) {
    return { remoteIdentity: identityId ? { identityId } : null };
}

// A publication is only encounterable once it has a matching placement
// (core/WorldEncounter.js's own `describeEncounterablePublication()`
// requires one) — this helper exists purely so this file's own
// scenarios never have to spell out a throwaway placement per
// publication by hand.
function localSourceWithPublications(publicationEntries) {
    return describeLocalWorldDiscoverySource({
        publications: publicationEntries,
        placements: publicationEntries.map((pub, index) => ({
            id: `placement-${pub.id}`,
            publicationId: pub.id,
            position: { x: index, y: 0, z: index }
        }))
    });
}

// Builds a plain object standing in for a mounted WorldEncounterCanvas
// instance: props resolved, data() merged in, methods attached so
// `this.methodName()` calls inside mounted()/beforeUnmount() resolve
// against this same object exactly as Vue's own `this` would.
function buildCanvasInstance({ registry = null, view } = {}) {
    const ctx = {
        registry,
        view: view !== undefined ? view : WorldEncounterCanvas.props.view.default()
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    return ctx;
}

function mount(ctx) {
    WorldEncounterCanvas.mounted.call(ctx);
}

function unmount(ctx) {
    WorldEncounterCanvas.beforeUnmount.call(ctx);
}

function readEffectiveView(ctx) {
    return WorldEncounterCanvas.computed.effectiveView.call(ctx);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: local -> peer B connects -> peer A
    // disconnects, entirely through registry.subscribe().
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-P1', title: 'P1' }],
            placements: [{ id: 'placement-P1', publicationId: 'pub-P1', position: { x: 0, y: 0, z: 0 } }]
        }));
        const peerA = connectedPeerOf('did:key:zPeerA');
        registry.setSource(describePeerWorldDiscoverySource({
            avatarProfiles: [{ avatarId: 'avatar-A1', displayName: 'A1' }],
            avatarPresences: [{ avatarId: 'avatar-A1', position: { x: 1, y: 0, z: 1 } }]
        }, peerA));

        const ctx = buildCanvasInstance({ registry });
        mount(ctx);

        let view = readEffectiveView(ctx);
        assert(view.publications.length === 1 && view.publications[0].objectId === 'pub-P1', '1. FLAGSHIP — mounting against an already-populated registry immediately shows P1');
        assert(view.avatars.length === 1 && view.avatars[0].objectId === 'avatar-A1', '2. FLAGSHIP — mounting also immediately shows peer A\'s A1, with no separate call required');

        // peer B connects.
        const peerB = connectedPeerOf('did:key:zPeerB');
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-P2', title: 'P2' }],
            placements: [{ id: 'placement-P2', publicationId: 'pub-P2', position: { x: 2, y: 0, z: 2 } }]
        }, peerB));

        view = readEffectiveView(ctx);
        assert(view.publications.length === 2, '3. FLAGSHIP — peer B connecting automatically grows the World to P1, P2, with no manual re-projection call from the test');
        assert(view.avatars.length === 1, '4. FLAGSHIP — A1 is unaffected by peer B connecting');

        // peer A disconnects.
        registry.removeSource('peer:did:key:zPeerA');

        view = readEffectiveView(ctx);
        assert(view.publications.length === 2 && view.avatars.length === 0, '5. FLAGSHIP — peer A disconnecting automatically removes A1, leaving P1 and P2');
        const publicationIds = view.publications.map((p) => p.objectId).sort();
        assert(JSON.stringify(publicationIds) === JSON.stringify(['pub-P1', 'pub-P2']), '6. FLAGSHIP — the final World holds exactly P1 and P2');

        unmount(ctx);
        console.log('✓ Section A: FLAGSHIP — local -> peer B connects -> peer A disconnects, all reflected automatically via registry.subscribe()');
    }

    // ---------------------------------------------------------------
    // Section B — unmounting stops all further updates.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const ctx = buildCanvasInstance({ registry });
        mount(ctx);

        registry.setSource(localSourceWithPublications([{ id: 'pub-1', title: 'One' }]));
        assert(readEffectiveView(ctx).publications.length === 1, '7. before unmounting, a registry change is reflected');

        unmount(ctx);
        registry.setSource(localSourceWithPublications([{ id: 'pub-1', title: 'One' }, { id: 'pub-2', title: 'Two' }]));
        assert(readEffectiveView(ctx).publications.length === 1, '8. after unmounting, a later registry change is never reflected — beforeUnmount()\'s own unsubscribe() took effect');

        console.log('✓ Section B: beforeUnmount() unsubscribes — no further updates are ever delivered after unmount');
    }

    // ---------------------------------------------------------------
    // Section C — no registry prop leaves the component driven purely
    // by the `view` prop, exactly as before 0.9.13.
    // ---------------------------------------------------------------
    {
        const view = {
            isEmpty: false, publicationCount: 1, avatarCount: 0, totalCount: 1,
            publications: [{ objectId: 'pub-1', title: 'One', x: 0, y: 0, z: 0 }],
            avatars: []
        };
        const ctx = buildCanvasInstance({ view });
        mount(ctx);

        assert(readEffectiveView(ctx) === view, '9. with no registry supplied, effectiveView is the exact view prop reference, unchanged');
        assert(ctx.worldView === null, '10. with no registry supplied, mounted() never writes worldView — it stays null for this mount\'s entire lifetime');

        unmount(ctx);
        console.log('✓ Section C: no registry prop -> mounted() never subscribes -> the view prop drives rendering exactly as before 0.9.13');
    }

    // ---------------------------------------------------------------
    // Section D — mounted() seeds worldView from the registry's CURRENT
    // membership immediately, without waiting for a future change.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(localSourceWithPublications([{ id: 'pub-1', title: 'One' }]));

        const ctx = buildCanvasInstance({ registry });
        assert(ctx.worldView === null, '11. before mounted() runs, worldView is still null');

        mount(ctx);
        assert(readEffectiveView(ctx).publications.length === 1, '12. mounted() seeds worldView from the registry\'s existing membership immediately — no prior notification is required to see it');

        unmount(ctx);
        console.log('✓ Section D: mounted() seeds the initial snapshot immediately, before any notification ever fires');
    }

    // ---------------------------------------------------------------
    // Section E — replacement, not mutation: an old worldView snapshot
    // is never mutated in place.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(localSourceWithPublications([{ id: 'pub-1', title: 'One' }]));

        const ctx = buildCanvasInstance({ registry });
        mount(ctx);
        const firstSnapshot = ctx.worldView;

        registry.setSource(localSourceWithPublications([{ id: 'pub-1', title: 'One' }, { id: 'pub-2', title: 'Two' }]));
        const secondSnapshot = ctx.worldView;

        assert(firstSnapshot !== secondSnapshot, '13. a registry notification replaces worldView with an entirely new object, never the same reference');
        assert(firstSnapshot.publications.length === 1, '14. the OLD snapshot itself is never mutated underneath a caller still holding a reference to it — it still reports exactly one publication');
        assert(secondSnapshot.publications.length === 2, '15. the new worldView reflects the registry\'s current membership');

        unmount(ctx);
        console.log('✓ Section E: every registry notification replaces worldView wholesale — the previous snapshot is never mutated underneath a caller');
    }

    // ---------------------------------------------------------------
    // Section F — registry wins over view when both are supplied.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(localSourceWithPublications([{ id: 'pub-registry', title: 'From Registry' }]));

        const viewProp = {
            isEmpty: false, publicationCount: 1, avatarCount: 0, totalCount: 1,
            publications: [{ objectId: 'pub-view-prop', title: 'From View Prop', x: 0, y: 0, z: 0 }],
            avatars: []
        };
        const ctx = buildCanvasInstance({ registry, view: viewProp });
        mount(ctx);

        const view = readEffectiveView(ctx);
        assert(view.publications.length === 1 && view.publications[0].objectId === 'pub-registry', '16. when both registry and view are supplied, the registry-derived snapshot wins — the view prop is never consulted');
        assert(view !== viewProp, '17. effectiveView is never the view prop itself once a registry is supplied');

        unmount(ctx);
        console.log('✓ Section F: registry, when supplied, always wins over the view prop — never merged, never a fallback to view');
    }

    // ---------------------------------------------------------------
    // Section G — a malformed/absent registry degrades exactly like no
    // registry at all, never throws.
    // ---------------------------------------------------------------
    {
        for (const malformedRegistry of [{}, { subscribe: 'not-a-function' }, { listSources: () => [] }]) {
            const ctx = buildCanvasInstance({ registry: malformedRegistry });
            let threw = false;
            try {
                mount(ctx);
                unmount(ctx);
            } catch (error) {
                threw = true;
            }
            assert(threw === false, `18. a malformed registry (${JSON.stringify(Object.keys(malformedRegistry))}) never throws on mount/unmount`);
        }

        console.log('✓ Section G: a malformed registry (missing/non-function subscribe) degrades silently — never throws');
    }

    // ---------------------------------------------------------------
    // Section H — architectural boundary: WorldEncounterCanvas.js never
    // manipulates registry membership, never reads a raw source's own
    // origin or calls listSources() itself, and never calls the lower
    // pipeline stages directly.
    //
    // 0.9.20 note: assertion 23 below no longer bans every `.origin`
    // occurrence outright. 0.9.19 deliberately built
    // `application/WorldEncounterSelectionOutcome.js` (and 0.9.19's own
    // `WorldEncounterSelectionResolution.js` underneath it) as the one
    // sanctioned seam through which THIS component may learn provenance
    // — see that file's own header, "the choice belongs at the
    // presentation/application boundary." 0.9.20 reads `.origin` off the
    // already-computed `{ kind, objectId, origin }` candidates that seam
    // returns (`candidate.origin`/`resolvedSelection.origin`/`choice.origin`
    // below) — never off a raw `WorldDiscoverySource`'s own `origin`
    // field, which this component still never touches directly. The
    // narrowed assertion below keeps the original protection (no
    // `source.origin`, no reading `origin` straight off a
    // `listSources()` row) while allowing exactly this one, already-
    // reviewed exception.
    // ---------------------------------------------------------------
    {
        const sourceUrl = new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url);
        const fullSource = await readFile(sourceUrl, 'utf8');
        const codeOnly = fullSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!codeOnly.includes('.setSource('), '19. WorldEncounterCanvas.js never calls registry.setSource() — it never manipulates registry membership');
        assert(!codeOnly.includes('.removeSource('), '20. WorldEncounterCanvas.js never calls registry.removeSource()');
        assert(!codeOnly.includes('.clear('), '21. WorldEncounterCanvas.js never calls registry.clear()');
        assert(!codeOnly.includes('.listSources('), '22. WorldEncounterCanvas.js never calls registry.listSources() itself — that stays entirely inside describeWorldFromDiscoveryRegistry()/describeWorldEncounterSelectionOutcomeFromRegistry()');
        {
            const originAccessors = Array.from(codeOnly.matchAll(/([A-Za-z_$][\w$]*)\.origin\b/g)).map((match) => match[1]);
            // 0.9.101 note (pre-existing gap, unrelated to this milestone's
            // own boundary review): 'resolvedLead' was missing from this
            // allowlist even though 0.9.40 already reads `resolvedLead.origin`
            // in this component's own template (the "Choose Location" active-
            // choice class binding) — the exact same sanctioned
            // candidate/choice provenance vocabulary this assertion already
            // allows one layer over, for World-discovery-source selection
            // instead of decentralized leads. Never a raw source's own
            // `.origin`.
            //
            // 0.9.112 note: 'materialProvenance'/'provenance' are a THIRD,
            // deliberately distinct `.origin` — `application/
            // PublicationMaterialProvenance.js`'s own `{ origin: 'LOCAL' |
            // 'DECENTRALIZED' }` fact, read here as `materialProvenance.origin`
            // (this component's own 0.9.112 computed) and
            // `discoveryResult.provenance.origin` (0.9.110's own runtime
            // composition result, forwarded verbatim). Neither is a raw
            // `WorldDiscoverySource`'s own `.origin` — see that file's own
            // header, "deliberately two values, never more."
            const allowedOriginAccessors = new Set(['candidate', 'resolvedSelection', 'choice', 'resolvedEncounterSelection', 'resolvedLead', 'materialProvenance', 'provenance']);
            assert(originAccessors.length > 0, '23a. WorldEncounterCanvas.js reads .origin only via 0.9.20\'s own resolved-selection candidates, not never at all');
            assert(originAccessors.every((accessor) => allowedOriginAccessors.has(accessor)), `23b. WorldEncounterCanvas.js never reads a raw source's own .origin field — every .origin access is scoped to a 0.9.19/0.9.20 selection candidate (candidate/resolvedSelection/choice), found: ${JSON.stringify(originAccessors)}`);
            assert(!/\bsource\.origin\b/.test(codeOnly) && !/\brow\.origin\b/.test(codeOnly), '23c. WorldEncounterCanvas.js never reads .origin off a raw source or view row');
        }
        assert(!codeOnly.includes('deriveWorldEncounters'), '24. WorldEncounterCanvas.js never calls deriveWorldEncounters() directly');
        assert(!codeOnly.includes('assembleWorldDiscoveryInputs'), '25. WorldEncounterCanvas.js never calls assembleWorldDiscoveryInputs() directly');
        assert(!codeOnly.includes('describeWorldFromDiscoverySources'), '26. WorldEncounterCanvas.js never calls describeWorldFromDiscoverySources() directly — only describeWorldFromDiscoveryRegistry()');
        assert(!codeOnly.includes('WorldDiscoverySourceRegistry'), '27. WorldEncounterCanvas.js never imports or references the WorldDiscoverySourceRegistry class itself — it only ever receives an already-constructed instance as a prop');
        assert(!/identityId|remoteIdentity|peerId/i.test(codeOnly), '28. WorldEncounterCanvas.js never references any peer-identity vocabulary');
        assert(!codeOnly.includes('fetch('), '29. WorldEncounterCanvas.js never fetches peer data itself');
        assert(!/localStorage|sessionStorage|StorageProvider/.test(codeOnly), '30. WorldEncounterCanvas.js never persists anything');
        assert(!codeOnly.includes('.sort('), '31. WorldEncounterCanvas.js still performs no sorting of its own, unchanged from 0.9.3');
        assert(!/verifySignature|signature\.verify/.test(codeOnly), '32. WorldEncounterCanvas.js never verifies a signature');

        console.log('✓ Section H: architectural boundary confirmed — WorldEncounterCanvas.js only ever subscribes, requests a fresh projection, and replaces its own local view state');
    }

    console.log('\nAll Live World View Registry Subscription tests passed.');
}

run().catch((error) => {
    console.error('LiveWorldViewRegistrySubscription.test.js FAILED:', error);
    process.exitCode = 1;
});
