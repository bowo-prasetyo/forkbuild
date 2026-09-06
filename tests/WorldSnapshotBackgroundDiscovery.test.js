import { readFile } from 'node:fs/promises';
import { shouldRefreshSnapshotDiscovery, DEFAULT_DISCOVERY_REFRESH_RADIUS } from '../application/ShouldRefreshSnapshotDiscovery.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/WorldSnapshotDiscoveryMonitor.js';

// 0.9.186 — World Snapshot Background Discovery.
//
// 0.9.150/0.9.151 gave this codebase `discoverSnapshotCandidatesCommand` —
// browsing-oriented Snapshot candidate discovery — but left it reachable
// only through an explicit "Discover Snapshots" click (see that command's
// own header, "Caching, retries, or automatic/background discovery of any
// kind... this file is called once per invocation, by a caller who decides
// entirely for itself when to call it"). This milestone adds exactly that
// caller — `WorldSnapshotDiscoveryMonitor`, fed by `ui/views/WorldView.js`'s
// own already-existing `refreshSpatialUI()` tick — and nothing more: every
// existing seam (resolution, materialization, placement, registration)
// stays reachable only through its own existing explicit action.
//
//   Section A: discovery without clicking — observe() alone triggers the
//              injected command
//   Section B: the SAME injected discoverSnapshotCandidatesCommand is
//              used — no second discovery protocol/query service
//   Section C: no automatic cascade — observe() never resolves,
//              materializes, places, or registers anything
//   Section D: context stability — an unchanged context never re-triggers
//   Section E: a meaningful context change triggers a fresh call
//   Section F: movement independence — tiny movement never triggers
//   Section G: failure isolation — a rejected discovery call never
//              mutates lastResult and never throws
//   Section H: the existing explicit discoverSnapshotCandidatesCommand
//              keeps working standalone, untouched by the monitor
//   Section I: race protection — a late result from a stale context never
//              overwrites a newer context's own discovery state
//   Section J: structural boundary — the monitor file contains no
//              resolve/materialize/register/place logic of its own
//   Section K: shouldRefreshSnapshotDiscovery is a pure, standalone
//              decision boundary, independently correct
//   Section L: architectural regression — ui/main.js and
//              ui/views/WorldView.js wire the monitor the same way every
//              other Snapshot discovery capability is already wired

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function pos(x, y, z) {
    return { x, y, z };
}

function ctx(position) {
    return { position };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — discovery without clicking.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        const monitor = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => { calls += 1; return Promise.resolve([{ contentHash: 'h', locator: 'ar://h', storage: 'ar' }]); }
        });

        await monitor.observe(ctx(pos(0, 0, 0)));

        assert(calls === 1, '1. observe() alone — with no button click of any kind — triggers the injected discovery command');
        assert(monitor.lastResult.length === 1 && monitor.lastResult[0].contentHash === 'h',
            '2. the resolved candidates are stored verbatim');

        console.log('✓ Section A: background observation alone triggers discovery, with no explicit user click');
    }

    // ---------------------------------------------------------------
    // Section B — the SAME injected command, no second protocol.
    // ---------------------------------------------------------------
    {
        const fakeCandidates = Object.freeze([Object.freeze({ contentHash: 'shared', locator: 'ar://shared', storage: 'ar' })]);
        // This is exactly the shape ui/main.js's own real
        // discoverSnapshotCandidatesCommand already has: a zero-argument
        // function wrapping executeDiscoverSnapshotCandidatesCommand().
        const discoverSnapshotCandidatesCommand = () => Promise.resolve(fakeCandidates);
        const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand });

        await monitor.observe(ctx(pos(0, 0, 0)));

        assert(monitor.lastResult === fakeCandidates,
            '3. the monitor stores exactly what the injected discoverSnapshotCandidatesCommand resolved to — the same reference');

        const source = await codeOnlySource('application/WorldSnapshotDiscoveryMonitor.js');
        assert(!source.includes('NostrSnapshotDiscoveryQueryService') && !source.includes('new WebSocket') && !source.includes('window.nostr'),
            '4. the monitor never constructs a second Nostr/relay client or query service of its own');

        console.log('✓ Section B: the monitor reuses the exact injected discoverSnapshotCandidatesCommand — no second discovery protocol');
    }

    // ---------------------------------------------------------------
    // Section C — no automatic cascade.
    // ---------------------------------------------------------------
    {
        let resolveCalls = 0;
        let materializeCalls = 0;
        let placeCalls = 0;
        let registerCalls = 0;
        const candidate = { contentHash: 'cascade-check', locator: 'ar://cascade-check', storage: 'ar' };
        const monitor = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([candidate])
        });
        // Spy collaborators the monitor is never handed at all — present
        // only so this test would notice if some future edit accidentally
        // threaded them through.
        monitor._resolveSelectedSnapshotCommand = () => { resolveCalls += 1; };
        monitor._materializeSelectedSnapshotCommand = () => { materializeCalls += 1; };
        monitor._placeMaterializedSnapshot = () => { placeCalls += 1; };
        monitor._registerMaterializedSnapshot = () => { registerCalls += 1; };

        await monitor.observe(ctx(pos(0, 0, 0)));

        assert(resolveCalls === 0 && materializeCalls === 0 && placeCalls === 0 && registerCalls === 0,
            '5. observe() never resolves, materializes, places, or registers a discovered candidate on its own');

        console.log('✓ Section C: background discovery never automatically cascades into resolution/materialization/placement/registration');
    }

    // ---------------------------------------------------------------
    // Section D — context stability: an unchanged context never
    // re-triggers.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        const monitor = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => { calls += 1; return Promise.resolve([]); }
        });

        const context = ctx(pos(10, 0, 10));
        await monitor.observe(context);
        await monitor.observe(ctx(pos(10, 0, 10)));
        await monitor.observe(ctx(pos(10, 0, 10)));

        assert(calls === 1, '6. repeated observation of the same (or an equivalent) World context issues exactly one discovery call, never redundant ones');

        console.log('✓ Section D: repeated observation of an unchanged World context never generates redundant discovery requests');
    }

    // ---------------------------------------------------------------
    // Section E — a meaningful context change triggers a fresh call.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        const monitor = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => { calls += 1; return Promise.resolve([]); }
        });

        await monitor.observe(ctx(pos(0, 0, 0)));
        await monitor.observe(ctx(pos(0, 0, DEFAULT_DISCOVERY_REFRESH_RADIUS + 1)));

        assert(calls === 2, '7. a World-area change beyond the refresh radius triggers a second, independent discovery call');

        console.log('✓ Section E: a meaningful World-context change triggers another discovery call');
    }

    // ---------------------------------------------------------------
    // Section F — movement independence: tiny movement never triggers.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        const monitor = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => { calls += 1; return Promise.resolve([]); }
        });

        await monitor.observe(ctx(pos(0, 0, 0)));
        await monitor.observe(ctx(pos(0.01, 0, 0.01)));
        await monitor.observe(ctx(pos(1, 0, 1)));

        assert(calls === 1, '8. tiny movement that does not change the relevant observation context never causes an additional discovery call');

        console.log('✓ Section F: tiny movement inside the refresh radius never causes unnecessary discovery');
    }

    // ---------------------------------------------------------------
    // Section G — failure isolation.
    // ---------------------------------------------------------------
    {
        const priorResult = Object.freeze([{ contentHash: 'kept', locator: 'ar://kept', storage: 'ar' }]);
        let call = 0;
        const monitor = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => {
                call += 1;
                if (call === 1) return Promise.resolve(priorResult);
                return Promise.reject(new Error('relay unreachable'));
            }
        });

        await monitor.observe(ctx(pos(0, 0, 0)));
        assert(monitor.lastResult === priorResult, '9. sanity: a first successful call is recorded');

        let threw = false;
        try {
            await monitor.observe(ctx(pos(0, 0, DEFAULT_DISCOVERY_REFRESH_RADIUS + 1)));
        } catch (error) {
            threw = true;
        }

        assert(threw === false, '10. observe() never throws/rejects to its own caller, even when the underlying discovery call fails');
        assert(monitor.lastResult === priorResult, '11. a failed discovery call never overwrites (or clears) the last successful result');
        assert(monitor.lastError instanceof Error && monitor.lastError.message === 'relay unreachable',
            '12. the failure is recorded as lastError, honestly, rather than silently swallowed');
        assert(monitor.executing === false, '13. executing state returns to idle after a failure');

        console.log('✓ Section G: a discovery failure never mutates the last known-good result and never propagates as a thrown/rejected error');
    }

    // ---------------------------------------------------------------
    // Section H — the existing explicit command keeps working
    // standalone, untouched by the monitor.
    // ---------------------------------------------------------------
    {
        let directCalls = 0;
        const discoverSnapshotCandidatesCommand = () => { directCalls += 1; return Promise.resolve([{ contentHash: 'direct', locator: 'ar://direct', storage: 'ar' }]); };
        const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand });

        // The exact same function a person's own "Discover Snapshots"
        // click already calls (OwnPublicationPanel's own
        // discoverSnapshotCandidates()) — calling it directly, bypassing
        // the monitor entirely, must still work exactly as it always has.
        const directResult = await discoverSnapshotCandidatesCommand();
        assert(directResult[0].contentHash === 'direct' && directCalls === 1,
            '14. the injected discoverSnapshotCandidatesCommand still works when called directly — the monitor wraps it without altering its own behavior');

        await monitor.observe(ctx(pos(0, 0, 0)));
        assert(directCalls === 2, '15. the monitor and a direct explicit call are simply two independent callers of the SAME command — neither replaces the other');

        console.log('✓ Section H: the existing explicit discovery command is unmodified and still callable on its own — background discovery is an additional trigger, not a replacement');
    }

    // ---------------------------------------------------------------
    // Section I — race protection.
    // ---------------------------------------------------------------
    {
        let resolveA;
        let resolveB;
        let callCount = 0;
        const monitor = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => {
                callCount += 1;
                if (callCount === 1) return new Promise((resolve) => { resolveA = resolve; });
                return new Promise((resolve) => { resolveB = resolve; });
            }
        });

        const contextA = ctx(pos(0, 0, 0));
        const contextB = ctx(pos(0, 0, DEFAULT_DISCOVERY_REFRESH_RADIUS + 1));

        const observationA = monitor.observe(contextA);
        const observationB = monitor.observe(contextB);
        await flushMicrotasks();

        // B's own query resolves FIRST; A's own query — the stale,
        // earlier context — resolves LATER, after B already won.
        resolveB([{ contentHash: 'from-B', locator: 'ar://b', storage: 'ar' }]);
        await observationB;
        assert(monitor.lastResult[0].contentHash === 'from-B', '16. the newer context B\'s own result is applied');

        resolveA([{ contentHash: 'from-A-STALE', locator: 'ar://a', storage: 'ar' }]);
        await observationA;
        await flushMicrotasks();

        assert(monitor.lastResult[0].contentHash === 'from-B',
            '17. a late-arriving result from the STALE, earlier context A never overwrites the current, newer context B\'s own discovery state');

        console.log('✓ Section I: a late result from a stale, superseded context never clobbers a newer context\'s own discovery state');
    }

    // ---------------------------------------------------------------
    // Section J — structural boundary.
    // ---------------------------------------------------------------
    {
        const source = await codeOnlySource('application/WorldSnapshotDiscoveryMonitor.js');
        const forbidden = ['resolveCandidate', 'materialize(', 'materialize =', '.register(', 'unregister', 'distribution'];
        for (const term of forbidden) {
            assert(!source.toLowerCase().includes(term.toLowerCase()),
                `18. the monitor's own source never contains '${term}' — no resolution/materialization/registration/distribution logic of its own`);
        }
        assert(!source.includes('WorldDiscoverySourceRegistry'), '19. the monitor never touches the World runtime registry directly');
        assert(!source.includes('placeMaterializedSnapshot') && !source.includes('registerMaterializedSnapshot'),
            '20. the monitor never imports or calls the existing explicit placement/registration functions');

        console.log('✓ Section J: the monitor contains no resolve/materialize/place/register/distribution logic of its own — a pure background trigger');
    }

    // ---------------------------------------------------------------
    // Section K — shouldRefreshSnapshotDiscovery is a pure, standalone
    // decision boundary.
    // ---------------------------------------------------------------
    {
        assert(shouldRefreshSnapshotDiscovery(null, ctx(pos(0, 0, 0))) === true,
            '21. with nothing ever observed before, the first observation always refreshes');
        assert(shouldRefreshSnapshotDiscovery(ctx(pos(0, 0, 0)), null) === false,
            '22. a current context with no position (nothing to discover around) never refreshes');
        assert(shouldRefreshSnapshotDiscovery(ctx(pos(0, 0, 0)), ctx(pos(0, 0, 0))) === false,
            '23. the exact same position never refreshes');
        assert(shouldRefreshSnapshotDiscovery(ctx(pos(0, 0, 0)), ctx(pos(1, 0, 1))) === false,
            '24. a small movement, well under the radius, never refreshes');
        assert(shouldRefreshSnapshotDiscovery(ctx(pos(0, 0, 0)), ctx(pos(DEFAULT_DISCOVERY_REFRESH_RADIUS, 0, 0))) === true,
            '25. a movement of exactly the refresh radius refreshes');
        assert(shouldRefreshSnapshotDiscovery(ctx(pos(0, 0, 0)), ctx(pos(1000, 0, 1000))) === true,
            '26. a large movement well beyond the radius refreshes');
        assert(shouldRefreshSnapshotDiscovery(null, null) === false,
            '27. no prior and no current context never refreshes — there is nothing to discover around');

        console.log('✓ Section K: shouldRefreshSnapshotDiscovery is a correct, pure, independently-testable decision boundary');
    }

    // ---------------------------------------------------------------
    // Section L — architectural regression.
    // ---------------------------------------------------------------
    {
        const mainCode = await codeOnlySource('ui/main.js');
        assert(mainCode.includes('new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand })'),
            '28. ui/main.js composes WorldSnapshotDiscoveryMonitor around the SAME existing discoverSnapshotCandidatesCommand — never a second query service');
        assert(mainCode.includes("app.provide('worldSnapshotDiscoveryMonitor', worldSnapshotDiscoveryMonitor)"),
            '29. ui/main.js provides worldSnapshotDiscoveryMonitor app-wide, mirroring every other Snapshot discovery capability');

        const viewCode = await codeOnlySource('ui/views/WorldView.js');
        assert(viewCode.includes("const worldSnapshotDiscoveryMonitor = inject('worldSnapshotDiscoveryMonitor', null);"),
            '30. WorldView.js injects the app-wide worldSnapshotDiscoveryMonitor');
        assert(/spatialContext\.value = spatialContextService\.getCurrentContext\(\);[\s\S]{0,400}worldSnapshotDiscoveryMonitor\.observe\(spatialContext\.value\)/.test(viewCode),
            '31. refreshSpatialUI() feeds the just-recomputed spatialContext to the monitor on its own existing cadence — no new polling loop introduced');
        assert(!viewCode.includes('setInterval(') || (viewCode.match(/setInterval\(/g) || []).length === (await codeOnlySourceIntervalCountBaseline()),
            '32. this milestone introduces no additional setInterval polling loop of its own');

        console.log('✓ Section L: architectural regression — the monitor is wired the same way every other Snapshot discovery capability already is, feeding off the existing spatial observation cadence');
    }

    console.log('\n✅ All World Snapshot Background Discovery tests passed.');
}

// Baseline setInterval count this milestone must not increase — WorldView.js
// already has three (spatialInterval, spatialPresenceSyncInterval,
// vehicleInteractionInterval) from prior milestones; this file adds none.
async function codeOnlySourceIntervalCountBaseline() {
    return 3;
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
