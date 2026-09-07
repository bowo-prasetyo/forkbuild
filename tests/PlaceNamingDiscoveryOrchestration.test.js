import { readFile } from 'node:fs/promises';
import { PlaceNamingDiscoveryMonitor, DEFAULT_PLACE_NAMING_DISCOVERY_PROXIMITY_RADIUS } from '../application/PlaceNamingDiscoveryMonitor.js';
import { shouldRefreshPlaceNamingDiscovery, DEFAULT_PLACE_NAMING_DISCOVERY_REFRESH_RADIUS } from '../application/ShouldRefreshPlaceNamingDiscovery.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';
import { composePlaceNamingDiscoveryRuntime } from '../application/PlaceNamingDiscoveryRuntimeComposition.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/DiscoverPlaceNamingClaimsCommand.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';

// 0.9.256 — Automatic Place Naming Discovery Orchestration.
// See docs/Roadmap.md, "0.9.256 — Automatic Place Naming Discovery
// Orchestration."
//
//   Section A: initial position triggers discovery
//   Section B: movement below the refresh threshold does not
//   Section C: movement at exactly the threshold triggers (inclusive)
//   Section D: movement beyond the threshold triggers
//   Section E: discovered distant claims are removed by proximity selection
//   Section F: multiple nearby claims all survive together
//   Section G: discovery order survives into the observation result
//   Section H: a failed discovery cycle never destroys the previous
//              successful observation
//   Section I: a stale asynchronous response cannot overwrite a newer one
//   Section J: rapid movement never produces an incorrect state transition
//   Section K: empty discovery results produce an empty nearby set
//   Section L: a malformed/unresolvable claim is excluded by the existing
//              proximity boundary, without poisoning its neighbors
//   Section M: the monitor never verifies, ranks, adopts, registers, or
//              persists a claim — structural boundary
//   Section N: multiple independent monitor instances/sessions never share
//              state
//   Section O: disposal prevents post-session observations
//   Section P: FLAGSHIP — the real 0.9.254 Nostr source, the real 0.9.253
//              discovery aggregator/command, and the real 0.9.255 proximity
//              selector, driven end-to-end through this monitor, with only
//              the relay transport and the region->position resolver (a
//              stand-in for a future World-layout-aware resolver)
//              controlled by the test

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function pos(x, z) {
    return { x, z };
}

function signatureOf(overrides = {}) {
    return {
        algorithm: 'ed25519',
        signer: 'did:key:zAlice',
        signature: 'sig-abc123',
        signedHash: 'hash-abc123',
        domain: 'forkbuild.place-naming-claim',
        ...overrides
    };
}

function claimJSONOf(overrides = {}) {
    return {
        id: 'claim-1',
        worldId: 'world-1',
        regionId: 'region-1',
        name: 'Old Oak Crossing',
        authorIdentityId: 'did:key:zAlice',
        createdAt: '2026-01-01T00:00:00.000Z',
        signature: signatureOf(),
        ...overrides
    };
}

function envelopeOf(overrides = {}) {
    const { claim: claimOverrides, ...envelopeOverrides } = overrides;
    const claim = claimJSONOf(claimOverrides || {});
    return {
        protocol: 'forkbuild-place-naming-discovery',
        version: 1,
        worldId: claim.worldId,
        regionId: claim.regionId,
        claim,
        ...envelopeOverrides
    };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — initial position triggers discovery.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => { calls += 1; return Promise.resolve([]); }
        });

        await monitor.observe(pos(0, 0));

        assert(calls === 1, '1. the very first observation always triggers a discovery call — there is no prior position that could still be valid');
        assert(Array.isArray(monitor.lastResult) && monitor.lastResult.length === 0, 'the first (empty) discovery cycle is recorded as an empty nearby set');

        console.log('✓ Section A: an initial position triggers discovery');
    }

    // ---------------------------------------------------------------
    // Section B — movement below the refresh threshold does not.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => { calls += 1; return Promise.resolve([]); }
        });

        await monitor.observe(pos(0, 0));
        await monitor.observe(pos(1, 1));
        await monitor.observe(pos(0.01, 0.01));

        assert(calls === 1, '2. movement well under the refresh radius never triggers a second discovery call');

        console.log('✓ Section B: movement below the refresh threshold never re-triggers discovery');
    }

    // ---------------------------------------------------------------
    // Section C — movement at exactly the threshold triggers (inclusive).
    // ---------------------------------------------------------------
    {
        let calls = 0;
        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => { calls += 1; return Promise.resolve([]); }
        });

        await monitor.observe(pos(0, 0));
        await monitor.observe(pos(DEFAULT_PLACE_NAMING_DISCOVERY_REFRESH_RADIUS, 0));

        assert(calls === 2, '3. movement of EXACTLY the refresh radius triggers a fresh discovery call — the boundary is inclusive');
        assert(shouldRefreshPlaceNamingDiscovery(pos(0, 0), pos(DEFAULT_PLACE_NAMING_DISCOVERY_REFRESH_RADIUS, 0)) === true,
            'shouldRefreshPlaceNamingDiscovery() itself agrees: distance === radius refreshes');

        console.log('✓ Section C: movement of exactly the refresh radius triggers discovery (inclusive boundary)');
    }

    // ---------------------------------------------------------------
    // Section D — movement beyond the threshold triggers.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => { calls += 1; return Promise.resolve([]); }
        });

        await monitor.observe(pos(0, 0));
        await monitor.observe(pos(10000, 10000));

        assert(calls === 2, '4. movement well beyond the refresh radius triggers a fresh discovery call');

        console.log('✓ Section D: movement beyond the refresh threshold triggers discovery');
    }

    // ---------------------------------------------------------------
    // Section E — discovered distant claims are removed by 0.9.255
    // proximity selection.
    // ---------------------------------------------------------------
    {
        const near = envelopeOf({ claim: { id: 'near', regionId: 'region-near', name: 'Near Name' } });
        const far = envelopeOf({ claim: { id: 'far', regionId: 'region-far', name: 'Far Name' } });
        const positions = { 'region-near': pos(5, 0), 'region-far': pos(10000, 0) };

        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => Promise.resolve([near, far]),
            resolveClaimPosition: (envelope) => positions[envelope.regionId] || null,
            proximityRadius: 50
        });

        await monitor.observe(pos(0, 0));

        assert(monitor.lastResult.length === 1, '5. only the spatially-relevant claim survives the pipeline');
        assert(monitor.lastResult[0].claim.id === 'near', '6. the surviving claim is the near one, never the far one');

        console.log('✓ Section E: a discovered but distant claim is removed by proximity selection, exactly as 0.9.255 already established');
    }

    // ---------------------------------------------------------------
    // Section F — multiple nearby claims all survive together.
    // ---------------------------------------------------------------
    {
        const alice = envelopeOf({ claim: { id: 'alice', regionId: 'region-1', name: 'Old Oak', authorIdentityId: 'did:key:zAlice' } });
        const bob = envelopeOf({ claim: { id: 'bob', regionId: 'region-1', name: 'Ancient Tree', authorIdentityId: 'did:key:zBob', signature: signatureOf({ signer: 'did:key:zBob' }) } });
        const positions = { 'region-1': pos(1, 1) };

        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => Promise.resolve([alice, bob]),
            resolveClaimPosition: (envelope) => positions[envelope.regionId] || null,
            proximityRadius: 10
        });

        await monitor.observe(pos(0, 0));

        assert(monitor.lastResult.length === 2, '7. multiple independent nearby claims for the same vicinity all survive — the monitor picks no winner');
        assert(monitor.lastResult.map((c) => c.claim.id).join(',') === 'alice,bob', 'both survive, unranked');

        console.log('✓ Section F: multiple nearby claims for the same vicinity all survive, unranked');
    }

    // ---------------------------------------------------------------
    // Section G — discovery order survives into the observation result.
    // ---------------------------------------------------------------
    {
        const c = envelopeOf({ claim: { id: 'c', regionId: 'region-1' } });
        const a = envelopeOf({ claim: { id: 'a', regionId: 'region-1' } });
        const b = envelopeOf({ claim: { id: 'b', regionId: 'region-1' } });
        const positions = { 'region-1': pos(0, 0) };

        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => Promise.resolve([c, a, b]),
            resolveClaimPosition: () => positions['region-1'],
            proximityRadius: 10
        });

        await monitor.observe(pos(0, 0));

        assert(monitor.lastResult.map((entry) => entry.claim.id).join(',') === 'c,a,b',
            '8. the discovery command\'s own order survives untouched all the way through to the observation result');

        console.log('✓ Section G: discovery order survives proximity selection into the final observation, never re-sorted');
    }

    // ---------------------------------------------------------------
    // Section H — a failed discovery cycle never destroys the previous
    // successful observation.
    // ---------------------------------------------------------------
    {
        const kept = envelopeOf({ claim: { id: 'kept', regionId: 'region-1' } });
        let call = 0;
        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => {
                call += 1;
                if (call === 1) return Promise.resolve([kept]);
                return Promise.reject(new Error('relay unreachable'));
            },
            resolveClaimPosition: () => pos(0, 0),
            proximityRadius: 10
        });

        await monitor.observe(pos(0, 0));
        assert(monitor.lastResult.length === 1 && monitor.lastResult[0].claim.id === 'kept', 'sanity: the first successful cycle is recorded');

        let threw = false;
        try {
            await monitor.observe(pos(10000, 10000));
        } catch {
            threw = true;
        }

        assert(threw === false, '9. observe() never throws/rejects to its own caller, even when the underlying discovery call fails');
        assert(monitor.lastResult.length === 1 && monitor.lastResult[0].claim.id === 'kept',
            '10. a failed discovery cycle never overwrites (or clears) the last successful observation');
        assert(monitor.lastError instanceof Error && monitor.lastError.message === 'relay unreachable',
            '11. the failure is recorded honestly as lastError, never silently swallowed');
        assert(monitor.executing === false, '12. executing state returns to idle after a failure');

        console.log('✓ Section H: a failed discovery cycle never mutates the last known-good observation, and never throws to the caller');
    }

    // ---------------------------------------------------------------
    // Section I — a stale asynchronous response cannot overwrite a newer
    // one.
    // ---------------------------------------------------------------
    {
        let resolveA;
        let resolveB;
        let callCount = 0;
        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => {
                callCount += 1;
                if (callCount === 1) return new Promise((resolve) => { resolveA = resolve; });
                return new Promise((resolve) => { resolveB = resolve; });
            },
            // A generous proximityRadius: this section tests request
            // ordering/staleness, not proximity filtering, so every
            // resolved claim (fixed at the origin) must survive regardless
            // of which far-flung position the Wanderer is observed from.
            resolveClaimPosition: () => pos(0, 0),
            proximityRadius: 1000000
        });

        const observationA = monitor.observe(pos(0, 0));
        const observationB = monitor.observe(pos(10000, 10000));
        await flushMicrotasks();

        // B's own query resolves FIRST; A's own query — the stale, earlier
        // position — resolves LATER, after B already won.
        resolveB([envelopeOf({ claim: { id: 'from-B', regionId: 'region-1' } })]);
        await observationB;
        assert(monitor.lastResult[0].claim.id === 'from-B', '13. the newer position\'s own result is applied');

        resolveA([envelopeOf({ claim: { id: 'from-A-STALE', regionId: 'region-1' } })]);
        await observationA;
        await flushMicrotasks();

        assert(monitor.lastResult[0].claim.id === 'from-B',
            '14. a late-arriving result from the STALE, earlier position never overwrites the newer position\'s own observation');

        console.log('✓ Section I: a late result from a stale, superseded request never clobbers a newer observation');
    }

    // ---------------------------------------------------------------
    // Section J — rapid movement never produces an incorrect state
    // transition.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        const resolvers = [];
        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => {
                calls += 1;
                const id = calls;
                return new Promise((resolve) => { resolvers.push({ id, resolve }); });
            },
            // Generous radius, same reasoning as Section I: this section
            // tests request ordering, not proximity filtering.
            resolveClaimPosition: () => pos(0, 0),
            proximityRadius: 1000000
        });

        const observations = [
            monitor.observe(pos(0, 0)),
            monitor.observe(pos(500, 0)),
            monitor.observe(pos(1000, 0)),
            monitor.observe(pos(1500, 0)),
            monitor.observe(pos(2000, 0))
        ];
        await flushMicrotasks();

        assert(calls === 5, '15. five successive movements, each beyond the refresh threshold from the last, each trigger their own discovery call');

        // Resolve out of order — the LAST-issued request (id 5) settles
        // first, exactly the "rapid movement" race a fast Wanderer could
        // actually produce.
        for (const { id, resolve } of [...resolvers].reverse()) {
            resolve([envelopeOf({ claim: { id: `r${id}`, regionId: 'region-1' } })]);
        }
        await Promise.all(observations);
        await flushMicrotasks();

        assert(monitor.lastResult[0].claim.id === 'r5', '16. regardless of resolution order, only the most-recently-ISSUED request\'s own result is ever kept');
        assert(monitor.executing === false, '17. executing settles back to idle once every in-flight request has settled');

        console.log('✓ Section J: rapid successive movement never leaves the monitor in an incorrect or inconsistent state, whatever order responses arrive in');
    }

    // ---------------------------------------------------------------
    // Section K — empty discovery results produce an empty nearby set.
    // ---------------------------------------------------------------
    {
        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => Promise.resolve([]),
            resolveClaimPosition: () => pos(0, 0)
        });

        await monitor.observe(pos(0, 0));

        assert(Array.isArray(monitor.lastResult) && monitor.lastResult.length === 0, '18. an empty discovery result produces an empty (never null/undefined) nearby set');

        // The default proximityRadius (used above, never overridden) is
        // DEFAULT_PLACE_NAMING_DISCOVERY_PROXIMITY_RADIUS — verified
        // directly so a future accidental change to that constant is
        // caught here, not only by the value it happens to produce.
        assert(DEFAULT_PLACE_NAMING_DISCOVERY_PROXIMITY_RADIUS === 100, 'the exported default proximity radius is 100, matching this file\'s own header');

        console.log('✓ Section K: empty discovery results produce an empty nearby set, never null or undefined');
    }

    // ---------------------------------------------------------------
    // Section L — a malformed/unresolvable claim is excluded by the
    // existing proximity boundary, without poisoning its neighbors.
    // ---------------------------------------------------------------
    {
        const resolvable = envelopeOf({ claim: { id: 'resolvable', regionId: 'region-good' } });
        const unresolvable = envelopeOf({ claim: { id: 'unresolvable', regionId: 'region-unknown' } });
        const throwsOnResolve = envelopeOf({ claim: { id: 'throws', regionId: 'region-throws' } });

        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => Promise.resolve([resolvable, unresolvable, throwsOnResolve]),
            resolveClaimPosition: (envelope) => {
                if (envelope.regionId === 'region-good') return pos(0, 0);
                if (envelope.regionId === 'region-throws') throw new Error('resolver exploded');
                return null; // an unknown region — no resolution available
            },
            proximityRadius: 10
        });

        await monitor.observe(pos(0, 0));

        assert(monitor.lastResult.length === 1 && monitor.lastResult[0].claim.id === 'resolvable',
            '19. an unresolvable claim (null position) and a claim whose resolver threw are both excluded, without discarding the one well-formed, nearby claim');

        console.log('✓ Section L: malformed/unresolvable claims are excluded individually by the existing proximity boundary, never poisoning their neighbors');
    }

    // ---------------------------------------------------------------
    // Section M — structural boundary: the monitor never verifies, ranks,
    // adopts, registers, or persists a claim.
    // ---------------------------------------------------------------
    {
        const source = await codeOnlySource('application/PlaceNamingDiscoveryMonitor.js');
        const forbiddenImports = [
            'LocalAuthorizationVerifier',
            'LocalPlaceNamingClaimStore',
            'PlaceNamingClaimExchange',
            'PlaceNamingView',
            'rankClaimsByName',
            'WorldSnapshotDiscoveryMonitor',
            'WorldNavigationSession',
            'WorldLocationDirectory'
        ];
        for (const term of forbiddenImports) {
            assert(!source.includes(term), `20. the monitor's own source never imports or references '${term}' — no verification, ranking, adoption, storage, or Snapshot-monitor coupling of its own`);
        }
        const forbiddenBehaviors = ['verify(', 'adopt(', '.register(', 'unregister', 'persist(', 'localStorage', 'indexedDB'];
        for (const term of forbiddenBehaviors) {
            assert(!source.toLowerCase().includes(term.toLowerCase()), `21. the monitor's own source never contains '${term}'`);
        }

        console.log('✓ Section M: structural boundary — the monitor contains no verification, ranking, adoption, registration, or persistence logic of its own');
    }

    // ---------------------------------------------------------------
    // Section N — multiple independent monitor instances/sessions never
    // share state.
    // ---------------------------------------------------------------
    {
        // Generous radius: this section tests instance isolation, not
        // proximity filtering — each claim resolves to the origin
        // regardless of which position its own monitor is observed from.
        const monitorX = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => Promise.resolve([envelopeOf({ claim: { id: 'x-claim', regionId: 'region-1' } })]),
            resolveClaimPosition: () => pos(0, 0),
            proximityRadius: 1000000
        });
        const monitorY = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => Promise.resolve([envelopeOf({ claim: { id: 'y-claim', regionId: 'region-1' } })]),
            resolveClaimPosition: () => pos(0, 0),
            proximityRadius: 1000000
        });

        await monitorX.observe(pos(0, 0));
        await monitorY.observe(pos(9999, 9999));

        assert(monitorX.lastResult[0].claim.id === 'x-claim', '22. monitor X\'s own observation is entirely its own');
        assert(monitorY.lastResult[0].claim.id === 'y-claim', '23. monitor Y\'s own observation is entirely its own, unaffected by X\'s call or position');

        // A position change on Y must never be interpreted against X's own
        // last-observed baseline, or vice versa.
        let xCalls = 0;
        monitorX._discoverPlaceNamingClaimsCommand = () => { xCalls += 1; return Promise.resolve([]); };
        await monitorX.observe(pos(9999, 9999));
        assert(xCalls === 1, '24. X\'s own refresh threshold is judged against X\'s own last-observed position (still {0,0}), never Y\'s');

        console.log('✓ Section N: independent monitor instances never share last-observed position, request ids, or result/error state');
    }

    // ---------------------------------------------------------------
    // Section O — disposal prevents post-session observations.
    // ---------------------------------------------------------------
    {
        let calls = 0;
        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => { calls += 1; return Promise.resolve([envelopeOf({ claim: { id: 'pre-dispose', regionId: 'region-1' } })]); },
            resolveClaimPosition: () => pos(0, 0),
            proximityRadius: 10
        });

        await monitor.observe(pos(0, 0));
        assert(calls === 1 && monitor.lastResult[0].claim.id === 'pre-dispose', 'sanity: observation before disposal works normally');

        monitor.dispose();
        await monitor.observe(pos(10000, 10000));

        assert(calls === 1, '25. observe() after dispose() never calls the injected discovery command again');
        assert(monitor.lastResult[0].claim.id === 'pre-dispose', '26. the last observation from before disposal is left untouched');

        // A request already in flight at the moment of disposal must be
        // discarded on arrival, never applied.
        let resolveInFlight;
        const inFlightMonitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => new Promise((resolve) => { resolveInFlight = resolve; }),
            resolveClaimPosition: () => pos(0, 0),
            proximityRadius: 10
        });
        const inFlight = inFlightMonitor.observe(pos(0, 0));
        await flushMicrotasks();
        inFlightMonitor.dispose();
        resolveInFlight([envelopeOf({ claim: { id: 'too-late', regionId: 'region-1' } })]);
        await inFlight;
        await flushMicrotasks();

        assert(inFlightMonitor.lastResult === null, '27. a request already in flight when dispose() is called is discarded on arrival, never applied');

        console.log('✓ Section O: disposal prevents both new observations and the late application of an already-in-flight one');
    }

    // ---------------------------------------------------------------
    // Section P — FLAGSHIP: the real Nostr source, the real discovery
    // aggregator/command, and the real proximity selector, driven
    // end-to-end through this monitor.
    // ---------------------------------------------------------------
    {
        const worldId = 'world-1';
        const regionNearTag = derivePlaceNamingDiscoveryTag(worldId, 'region-near');
        const regionFarTag = derivePlaceNamingDiscoveryTag(worldId, 'region-far');

        const nearEvent = {
            id: 'event-near', pubkey: 'pk-alice', kind: 1,
            tags: [['t', regionNearTag]],
            content: JSON.stringify(envelopeOf({ worldId, claim: { id: 'claim-near', worldId, regionId: 'region-near', name: 'Old Oak Crossing' } })),
            sig: 'sig-near'
        };
        const farEvent = {
            id: 'event-far', pubkey: 'pk-bob', kind: 1,
            tags: [['t', regionFarTag]],
            content: JSON.stringify(envelopeOf({ worldId, claim: { id: 'claim-far', worldId, regionId: 'region-far', name: 'Distant Hollow', authorIdentityId: 'did:key:zBob', signature: signatureOf({ signer: 'did:key:zBob' }) } })),
            sig: 'sig-far'
        };
        // A garbage event on the near channel — proves the REAL 0.9.253
        // envelope parser is actually running inside this pipeline, not a
        // stub: malformed content is silently dropped by discovery itself,
        // never even reaching proximity selection.
        const garbageEvent = { id: 'event-garbage', pubkey: 'pk-mallory', kind: 1, tags: [['t', regionNearTag]], content: 'not json at all', sig: 'sig-garbage' };

        async function queryImpl(relayUrl, filter) {
            const requestedTag = filter['#t'][0];
            if (requestedTag === regionNearTag) return [nearEvent, garbageEvent];
            if (requestedTag === regionFarTag) return [farEvent];
            return [];
        }

        const nostrSource = new NostrPlaceNamingDiscoverySource({ queryImpl });
        const { queryService } = composePlaceNamingDiscoveryRuntime({ sources: [nostrSource] });

        // A caller composing multi-region discovery over the SAME real
        // command/aggregator/source, unmodified — exactly the kind of
        // composition a future World-aware caller would build for itself;
        // this monitor never knows or cares how many regions/tags feed it.
        const discoverPlaceNamingClaimsCommand = () => Promise.all([
            executeDiscoverPlaceNamingClaimsCommand({ discoveryTag: regionNearTag, discoveryQueryService: queryService }),
            executeDiscoverPlaceNamingClaimsCommand({ discoveryTag: regionFarTag, discoveryQueryService: queryService })
        ]).then(([nearResults, farResults]) => [...nearResults, ...farResults]);

        // A stand-in for a future World-layout-aware resolver
        // (application/WorldNavigationSession.js) — the one collaborator
        // this milestone deliberately never builds itself (see this
        // monitor's own header, "position resolution is injected, never
        // performed").
        const regionPositions = { 'region-near': pos(10, 0), 'region-far': pos(5000, 0) };

        let observed = null;
        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand,
            resolveClaimPosition: (envelope) => regionPositions[envelope.regionId] || null,
            proximityRadius: 50,
            onObservation: (result) => { observed = result; }
        });

        await monitor.observe(pos(0, 0));

        assert(monitor.lastResult.length === 1, '28. real discovery found two well-formed claims across two regions, and real proximity selection kept exactly the one within range');
        assert(monitor.lastResult[0].claim.id === 'claim-near' && monitor.lastResult[0].claim.name === 'Old Oak Crossing',
            '29. the surviving entry is the near claim, with its own real, unmodified claim payload intact');
        assert(monitor.lastResult[0].worldId === worldId && monitor.lastResult[0].regionId === 'region-near',
            '30. the surviving entry still carries its own real discovery-envelope fields (protocol/version/worldId/regionId), never stripped down to a bespoke shape');
        assert(monitor.lastResult[0].position.x === 10 && monitor.lastResult[0].position.z === 0,
            '31. the resolved position this milestone attached is present on the surviving entry');

        assert(observed !== null && observed.position.x === 0 && observed.position.z === 0 && observed.claims === monitor.lastResult,
            '32. onObservation() is called with exactly { position, claims }, the same claims reference as lastResult');

        console.log('✓ Section P: FLAGSHIP — the real Nostr source, the real discovery aggregator/command, and the real proximity selector work together end-to-end through this monitor, with only the relay transport and the region resolver controlled by the test');
    }

    console.log('\n✅ All Place Naming Discovery Orchestration tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
