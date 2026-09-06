import { readFile } from 'node:fs/promises';

import { AutomaticSnapshotEncounterCascade } from '../application/AutomaticSnapshotEncounterCascade.js';
import { AutomaticSnapshotEncounterCascadeOutcome } from '../application/AutomaticSnapshotEncounterCascadeOutcome.js';
import { AutomaticSnapshotEncounterRetentionReconciliation } from '../application/AutomaticSnapshotEncounterRetentionReconciliation.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { registerMaterializedSnapshotWorldSource } from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';

// 0.9.193 — Automatic Snapshot Session-Lifetime Guard.
//
// 0.9.192's own Section D found a real boundary violation: an in-flight
// automatic cascade started by a `WorldView` mount that is subsequently torn
// down still lands its World registration in the SHARED
// `WorldDiscoverySourceRegistry` — work belonging to a dead session mutating
// the running World after that session has disappeared. This milestone adds
// exactly one narrow guard, entirely inside
// `application/AutomaticSnapshotEncounterCascade.js`: an optional,
// synchronous, constructor-injected `isSessionActive()` predicate, consulted
// once per cascade run, at the single instant this cascade would otherwise
// call `registerMaterializedSnapshotWorldSource()`. Resolution,
// materialization, and placement are NEVER gated, cancelled, or rolled
// back — see that file's own "0.9.193" header section for the full design.
//
//   Section A: FLAGSHIP — orphan prevention. Reproduces 0.9.192's own
//              Section D exactly, but with the guard wired in: a cascade
//              started while the session is active, torn down mid-flight,
//              completing after teardown, is SUPPRESSED rather than
//              registered.
//   Section B: normal live-session registration is completely unaffected —
//              the guard never interferes with the ordinary happy path.
//   Section C: teardown at each of the cascade's own two asynchronous
//              collaborator boundaries (resolution, materialization) always
//              suppresses registration once that call finally settles.
//   Section D: material survives suppression — materialization still ran
//              and stored bytes; only the World-side registration is
//              withheld; no compensating cleanup of any kind occurs.
//   Section E: new-session independence — a second, live session's own
//              cascade run is never contaminated by a first, torn-down
//              session's late SUPPRESSED completion.
//   Section F: the identical publicationId+contentHash a torn-down session
//              suppressed can still be genuinely, independently registered
//              by a fresh cascade instance (a fresh session) afterward.
//   Section G: multiple concurrent candidates in ONE session — only the
//              ones that reach the registration checkpoint while the
//              session is still active actually register.
//   Section H: manual registration (`registerMaterializedSnapshotWorldSource()`
//              called directly, exactly as `OwnPublicationPanel.js`'s own
//              "Register" button already does) has no `isSessionActive`
//              concept at all and is completely unaffected.
//   Section I: retention interaction — a SUPPRESSED outcome is never
//              `SnapshotWorldRegistrationOutcome.REGISTERED`, so the SAME
//              composition-site rule `ui/views/WorldView.js` already uses
//              (`noteAutomaticRegistration()` only on REGISTERED) naturally
//              never watches a suppressed run; a live-session REGISTER still
//              feeds retention exactly as 0.9.190 always has.
//   Section J: structural sweep — no new timer, no new asynchronous
//              lifecycle protocol, and the session check sits in the exact
//              same synchronous stretch as the registration call it gates.
//   Section K: structural sweep — no new Snapshot lifecycle enum
//              (CANCELLED/ABANDONED/EXPIRED/etc.); exactly two outcome
//              values total (INELIGIBLE, SUPPRESSED) belong to this file.
//   Section L: `ui/views/WorldView.js`'s own composition — the session flag
//              is flipped to inactive as the FIRST statement of
//              `onBeforeUnmount()`, before `session.dispose()`, and handed
//              to the cascade as `isSessionActive`.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function pos(x, y, z) {
    return { x, y, z };
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function codeOnlySource(relativePath) {
    const text = await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function originFor(contentHash, publicationId) {
    return `snapshot:${contentHash}:${publicationId}`;
}

function hasOrigin(registry, origin) {
    return registry.listSources().some((source) => source.origin === origin);
}

function publicationStub(id) {
    return { id, title: `Publication ${id}`, publisherIdentity: 'identity-1' };
}

function deferred() {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
}

function resolvedOutcome() {
    return { outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null };
}

function storedOutcome(contentHash) {
    return { outcome: StoreSnapshotContentOutcome.STORED, contentHash, reason: null };
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: orphan prevention.
    // ---------------------------------------------------------------
    {
        const contentHash = 'flagship-hash';
        const publicationId = 'flagship-pub';
        const candidate = { contentHash, locator: 'ar://flagship', storage: 'ar', publicationId };
        const registry = new WorldDiscoverySourceRegistry();
        const origin = originFor(contentHash, publicationId);

        let sessionActive = true;
        const resolveGate = deferred();
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => resolveGate.promise,
            materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome(contentHash)),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            isSessionActive: () => sessionActive
        });

        const resultPromise = cascade.processCandidate(candidate);
        await flushMicrotasks();
        assert(!hasOrigin(registry, origin), 'sanity: still genuinely in flight, blocked on resolveGate');

        // TEARDOWN — exactly what ui/views/WorldView.js's own
        // onBeforeUnmount() now does first: flip the flag, never cancel
        // the in-flight Promise chain.
        sessionActive = false;

        resolveGate.resolve(resolvedOutcome(contentHash));
        const result = await resultPromise;

        assert(result.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, `1. the late completion is SUPPRESSED, not registered — got ${result.outcome}`);
        assert(!hasOrigin(registry, origin), '2. FIX CONFIRMED: no World registration exists for the torn-down session\'s late completion — the exact orphan 0.9.192\'s own Section D found never occurs here');

        console.log('✓ Section A: FLAGSHIP — a cascade torn down mid-flight, completing after teardown, is SUPPRESSED rather than landing an orphaned registration in the shared World registry');
    }

    // ---------------------------------------------------------------
    // Section B — normal live-session registration is unaffected.
    // ---------------------------------------------------------------
    {
        const contentHash = 'live-hash';
        const publicationId = 'live-pub';
        const candidate = { contentHash, locator: 'ar://live', storage: 'ar', publicationId };
        const registry = new WorldDiscoverySourceRegistry();
        const origin = originFor(contentHash, publicationId);

        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome(contentHash)),
            materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome(contentHash)),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            isSessionActive: () => true
        });

        const result = await cascade.processCandidate(candidate);
        assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, `1. a live session still reaches REGISTERED — got ${result.outcome}`);
        assert(hasOrigin(registry, origin), '2. the registration genuinely landed in the registry');

        // Same behavior with NO isSessionActive supplied at all — the
        // default, pre-0.9.193 shape.
        const registryNoGuard = new WorldDiscoverySourceRegistry();
        const cascadeNoGuard = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome(contentHash)),
            materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome(contentHash)),
            worldDiscoverySourceRegistry: registryNoGuard,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId)
        });
        const resultNoGuard = await cascadeNoGuard.processCandidate(candidate);
        assert(resultNoGuard.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '3. a caller that never supplies isSessionActive at all keeps registering exactly as before 0.9.193');

        console.log('✓ Section B: a live session (or a caller supplying no isSessionActive at all) registers exactly as it always has — the guard changes nothing about the happy path');
    }

    // ---------------------------------------------------------------
    // Section C — teardown at each of the cascade's own asynchronous
    // boundaries (resolution, materialization) always suppresses.
    // ---------------------------------------------------------------
    {
        // C1 — teardown while resolution is in flight.
        {
            const contentHash = 'boundary-resolve-hash';
            const publicationId = 'boundary-resolve-pub';
            const candidate = { contentHash, locator: 'ar://boundary-resolve', storage: 'ar', publicationId };
            const registry = new WorldDiscoverySourceRegistry();
            let sessionActive = true;
            const resolveGate = deferred();
            const cascade = new AutomaticSnapshotEncounterCascade({
                resolveSelectedSnapshotCommand: () => resolveGate.promise,
                materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome(contentHash)),
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
                findPublicationById: () => publicationStub(publicationId),
                isSessionActive: () => sessionActive
            });
            const resultPromise = cascade.processCandidate(candidate);
            await flushMicrotasks();
            sessionActive = false;
            resolveGate.resolve(resolvedOutcome(contentHash));
            const result = await resultPromise;
            assert(result.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, `1. teardown during resolution -> SUPPRESSED, got ${result.outcome}`);
            assert(!hasOrigin(registry, originFor(contentHash, publicationId)), '2. no registration for a resolution-boundary teardown');
        }

        // C2 — teardown while materialization is in flight.
        {
            const contentHash = 'boundary-materialize-hash';
            const publicationId = 'boundary-materialize-pub';
            const candidate = { contentHash, locator: 'ar://boundary-materialize', storage: 'ar', publicationId };
            const registry = new WorldDiscoverySourceRegistry();
            let sessionActive = true;
            const materializeGate = deferred();
            const cascade = new AutomaticSnapshotEncounterCascade({
                resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome(contentHash)),
                materializeSelectedSnapshotCommand: () => materializeGate.promise,
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
                findPublicationById: () => publicationStub(publicationId),
                isSessionActive: () => sessionActive
            });
            const resultPromise = cascade.processCandidate(candidate);
            await flushMicrotasks();
            sessionActive = false;
            materializeGate.resolve(storedOutcome(contentHash));
            const result = await resultPromise;
            assert(result.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, `3. teardown during materialization -> SUPPRESSED, got ${result.outcome}`);
            assert(!hasOrigin(registry, originFor(contentHash, publicationId)), '4. no registration for a materialization-boundary teardown');
        }

        // C3 — session already torn down before processCandidate() is even
        // called (the "discovery boundary" case — a stale discovery result
        // handed to a cascade whose session died before it was ever
        // processed).
        {
            const contentHash = 'boundary-predates-hash';
            const publicationId = 'boundary-predates-pub';
            const candidate = { contentHash, locator: 'ar://boundary-predates', storage: 'ar', publicationId };
            const registry = new WorldDiscoverySourceRegistry();
            const cascade = new AutomaticSnapshotEncounterCascade({
                resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome(contentHash)),
                materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome(contentHash)),
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
                findPublicationById: () => publicationStub(publicationId),
                isSessionActive: () => false
            });
            const result = await cascade.processCandidate(candidate);
            assert(result.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, `5. a session already dead before processing even starts still resolves/materializes/places, but is SUPPRESSED at registration, got ${result.outcome}`);
            assert(!hasOrigin(registry, originFor(contentHash, publicationId)), '6. no registration');
        }

        console.log('✓ Section C: teardown during resolution, during materialization, and predating the cascade run entirely all suppress registration once the run reaches its own registration checkpoint');
    }

    // ---------------------------------------------------------------
    // Section D — material survives suppression; no compensating cleanup.
    // ---------------------------------------------------------------
    {
        const contentHash = 'survives-hash';
        const publicationId = 'survives-pub';
        const candidate = { contentHash, locator: 'ar://survives', storage: 'ar', publicationId };
        const registry = new WorldDiscoverySourceRegistry();
        let materializeCalls = 0;
        let removeSourceCalls = 0;
        const originalRemoveSource = registry.removeSource.bind(registry);
        registry.removeSource = (...args) => { removeSourceCalls += 1; return originalRemoveSource(...args); };

        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome(contentHash)),
            materializeSelectedSnapshotCommand: () => {
                materializeCalls += 1;
                return Promise.resolve(storedOutcome(contentHash));
            },
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            isSessionActive: () => false
        });

        const result = await cascade.processCandidate(candidate);
        assert(result.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, '1. sanity: suppressed');
        assert(materializeCalls === 1, '2. materialization genuinely ran to completion — acquisition is never rolled back or skipped because the session is dead');
        assert(!hasOrigin(registry, originFor(contentHash, publicationId)), '3. no World registration exists');
        assert(removeSourceCalls === 0, '4. no compensating removeSource() call of any kind — suppression is a simple withholding, never a rollback/undo');

        console.log('✓ Section D: acquisition (resolve/materialize/place) runs to completion even under a dead session — only the one World-side registration is withheld, with no compensating cleanup or rollback');
    }

    // ---------------------------------------------------------------
    // Section E — new-session independence.
    // ---------------------------------------------------------------
    {
        const orphanHash = 'isolation-orphan-hash';
        const orphanPub = 'isolation-orphan-pub';
        const orphanCandidate = { contentHash: orphanHash, locator: 'ar://isolation-orphan', storage: 'ar', publicationId: orphanPub };
        const liveHash = 'isolation-live-hash';
        const livePub = 'isolation-live-pub';
        const liveCandidate = { contentHash: liveHash, locator: 'ar://isolation-live', storage: 'ar', publicationId: livePub };
        const sharedRegistry = new WorldDiscoverySourceRegistry();

        let sessionAActive = true;
        const resolveGate = deferred();
        const sessionACascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => resolveGate.promise,
            materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome(orphanHash)),
            worldDiscoverySourceRegistry: sharedRegistry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId: orphanPub, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(orphanPub),
            isSessionActive: () => sessionAActive
        });
        const orphanResultPromise = sessionACascade.processCandidate(orphanCandidate);
        await flushMicrotasks();

        // Session A dies.
        sessionAActive = false;

        // A brand-new, independently live session B mounts and processes an
        // entirely unrelated candidate WHILE session A's own late completion
        // is still pending.
        const sessionBCascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome(liveHash)),
            materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome(liveHash)),
            worldDiscoverySourceRegistry: sharedRegistry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId: livePub, position: pos(9000, 0, 0) }),
            findPublicationById: () => publicationStub(livePub),
            isSessionActive: () => true
        });
        const liveResult = await sessionBCascade.processCandidate(liveCandidate);
        assert(liveResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '1. session B\'s own independent, live cascade run reaches REGISTERED, unaffected by session A\'s pending teardown');
        assert(hasOrigin(sharedRegistry, originFor(liveHash, livePub)), '2. session B\'s registration genuinely landed');

        // NOW session A's held-open resolution finally settles.
        resolveGate.resolve(resolvedOutcome(orphanHash));
        const orphanResult = await orphanResultPromise;
        assert(orphanResult.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, '3. session A\'s late completion is SUPPRESSED');
        assert(!hasOrigin(sharedRegistry, originFor(orphanHash, orphanPub)), '4. session A\'s subject never appears in the shared registry');
        assert(hasOrigin(sharedRegistry, originFor(liveHash, livePub)), '5. session B\'s own earlier registration is completely untouched by session A\'s later, suppressed completion');

        console.log('✓ Section E: a second, live session\'s own cascade run is never contaminated by a first, torn-down session\'s late (suppressed) completion, in either direction');
    }

    // ---------------------------------------------------------------
    // Section F — the SAME subject a torn-down session suppressed can
    // still be genuinely, independently registered by a fresh session.
    // ---------------------------------------------------------------
    {
        const contentHash = 'reentry-hash';
        const publicationId = 'reentry-pub';
        const candidate = { contentHash, locator: 'ar://reentry', storage: 'ar', publicationId };
        const sharedRegistry = new WorldDiscoverySourceRegistry();
        const origin = originFor(contentHash, publicationId);

        let oldSessionActive = true;
        const oldCascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome(contentHash)),
            materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome(contentHash)),
            worldDiscoverySourceRegistry: sharedRegistry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            isSessionActive: () => oldSessionActive
        });
        oldSessionActive = false;
        const oldResult = await oldCascade.processCandidate(candidate);
        assert(oldResult.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, 'sanity: the old, dead session\'s own run is suppressed');
        assert(!hasOrigin(sharedRegistry, origin), 'sanity: nothing registered yet');

        // A brand-new WorldView mount (a fresh cascade INSTANCE, with its
        // own idempotency map — never the same one the dead session used)
        // rediscovers and reprocesses the identical publicationId+contentHash.
        const newCascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome(contentHash)),
            materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome(contentHash)),
            worldDiscoverySourceRegistry: sharedRegistry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            isSessionActive: () => true
        });
        const newResult = await newCascade.processCandidate(candidate);
        assert(newResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, `1. a fresh, live session's own independent cascade run genuinely reaches REGISTERED for the SAME subject a dead session suppressed, got ${newResult.outcome}`);
        assert(hasOrigin(sharedRegistry, origin), '2. the registration now exists');

        console.log('✓ Section F: a subject suppressed by a dead session is never permanently blocked — a fresh session\'s own independent cascade instance can still genuinely register it');
    }

    // ---------------------------------------------------------------
    // Section G — multiple concurrent candidates in ONE session: only work
    // that reaches the registration checkpoint while the session is still
    // active actually registers.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        let sessionActive = true;

        const aHash = 'multi-a-hash', aPub = 'multi-a-pub';
        const bHash = 'multi-b-hash', bPub = 'multi-b-pub';
        const cHash = 'multi-c-hash', cPub = 'multi-c-pub';
        const bGate = deferred();

        // Each resolution carries its own candidate's contentHash straight
        // through as an extra field, so materialize (which only ever
        // receives the resolution, never the original candidate) can key
        // its own stored outcome off the SAME subject, with no shared
        // mutable state between concurrently in-flight candidates.
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand: (candidate) => {
                if (candidate.publicationId === bPub) {
                    return bGate.promise.then(() => ({ ...resolvedOutcome(candidate.contentHash), contentHash: candidate.contentHash }));
                }
                return Promise.resolve({ ...resolvedOutcome(candidate.contentHash), contentHash: candidate.contentHash });
            },
            materializeSelectedSnapshotCommand: (resolution) => Promise.resolve(storedOutcome(resolution.contentHash)),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: (publicationId) => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: (publicationId) => publicationStub(publicationId),
            isSessionActive: () => sessionActive
        });

        // A — resolves immediately, while the session is still active.
        const aCandidate = { contentHash: aHash, locator: 'ar://multi-a', storage: 'ar', publicationId: aPub };
        const aResult = await cascade.processCandidate(aCandidate);
        assert(aResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, `1. candidate A, fully processed while the session was active, REGISTERED — got ${aResult.outcome}`);

        // B — starts while active, but its own resolution is held open;
        // the session dies before it settles.
        const bCandidate = { contentHash: bHash, locator: 'ar://multi-b', storage: 'ar', publicationId: bPub };
        const bResultPromise = cascade.processCandidate(bCandidate);
        await flushMicrotasks();
        sessionActive = false;

        // C — submitted for the FIRST time only after the session has
        // already died.
        const cCandidate = { contentHash: cHash, locator: 'ar://multi-c', storage: 'ar', publicationId: cPub };
        const cResult = await cascade.processCandidate(cCandidate);
        assert(cResult.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, `2. candidate C, submitted only after the session died, is SUPPRESSED — got ${cResult.outcome}`);

        bGate.resolve();
        const bResult = await bResultPromise;
        assert(bResult.outcome === AutomaticSnapshotEncounterCascadeOutcome.SUPPRESSED, `3. candidate B, in flight when the session died, is SUPPRESSED once it settles — got ${bResult.outcome}`);

        assert(hasOrigin(registry, originFor(aHash, aPub)), '4. only candidate A — the one that reached registration while the session was genuinely active — is registered');
        assert(!hasOrigin(registry, originFor(bHash, bPub)), '5. candidate B never registers');
        assert(!hasOrigin(registry, originFor(cHash, cPub)), '6. candidate C never registers');

        console.log('✓ Section G: across several concurrent candidates in one session, only the work that reached the registration checkpoint while the session was still active actually registers — a dying session never retroactively un-registers what already succeeded, and never lets later work slip through');
    }

    // ---------------------------------------------------------------
    // Section H — manual registration is completely unaffected: it has no
    // isSessionActive concept of any kind.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publicationId = 'manual-pub';
        const contentHash = 'manual-hash';
        const publication = publicationStub(publicationId);
        const placement = {
            outcome: SnapshotWorldPlacementOutcome.PLACED,
            publicationId,
            contentHash,
            position: pos(1, 2, 3),
            reason: null
        };

        // No session, no cascade, no isSessionActive anywhere in sight —
        // exactly what OwnPublicationPanel.js's own explicit "Register"
        // button already calls, byte-for-byte.
        const registration = registerMaterializedSnapshotWorldSource(registry, placement, publication);
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '1. manual registration reaches REGISTERED exactly as before — this guard belongs ONLY to the automatic cascade');
        assert(hasOrigin(registry, originFor(contentHash, publicationId)), '2. the manual registration genuinely landed');

        const bridgeSource = await codeOnlySource('application/MaterializedSnapshotWorldDiscoveryBridge.js');
        assert(!/isSessionActive/.test(bridgeSource), '3. structural: MaterializedSnapshotWorldDiscoveryBridge.js itself has no isSessionActive concept at all — the guard lives entirely inside the cascade, one layer up, never in the shared registration primitive manual buttons also call');

        console.log('✓ Section H: manual Register (and the shared registration primitive it and the cascade both call) remains completely untouched — the session-lifetime guard belongs exclusively to the automatic cascade composition');
    }

    // ---------------------------------------------------------------
    // Section I — retention interaction.
    // ---------------------------------------------------------------
    {
        // I1 — a SUPPRESSED outcome is never REGISTERED, so the SAME
        // composition-site rule ui/views/WorldView.js already uses never
        // notes it watched.
        {
            const registry = new WorldDiscoverySourceRegistry();
            const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry, retentionRadius: 50 });
            const contentHash = 'retention-suppressed-hash';
            const publicationId = 'retention-suppressed-pub';
            const candidate = { contentHash, locator: 'ar://retention-suppressed', storage: 'ar', publicationId };
            const cascade = new AutomaticSnapshotEncounterCascade({
                resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome(contentHash)),
                materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome(contentHash)),
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
                findPublicationById: () => publicationStub(publicationId),
                isSessionActive: () => false
            });
            const result = await cascade.processCandidate(candidate);
            // Mirrors ui/views/WorldView.js's own refreshSpatialUI() exactly:
            // noteAutomaticRegistration() is called ONLY on REGISTERED.
            if (result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED) {
                reconciliation.noteAutomaticRegistration({ publicationId: result.publicationId, contentHash: result.contentHash });
            }
            assert(reconciliation.watchedAutomaticSubjects().length === 0, '1. a SUPPRESSED result is never noted watched by retention — nobody will ever automatically retain OR remove it, exactly like any other unregistered outcome');
        }

        // I2 — a live-session REGISTER still feeds retention exactly as
        // 0.9.190 always has.
        {
            const registry = new WorldDiscoverySourceRegistry();
            const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({ worldDiscoverySourceRegistry: registry, retentionRadius: 50 });
            const contentHash = 'retention-live-hash';
            const publicationId = 'retention-live-pub';
            const candidate = { contentHash, locator: 'ar://retention-live', storage: 'ar', publicationId };
            const cascade = new AutomaticSnapshotEncounterCascade({
                resolveSelectedSnapshotCommand: () => Promise.resolve(resolvedOutcome(contentHash)),
                materializeSelectedSnapshotCommand: () => Promise.resolve(storedOutcome(contentHash)),
                worldDiscoverySourceRegistry: registry,
                resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
                findPublicationById: () => publicationStub(publicationId),
                isSessionActive: () => true
            });
            const result = await cascade.processCandidate(candidate);
            if (result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED) {
                reconciliation.noteAutomaticRegistration({ publicationId: result.publicationId, contentHash: result.contentHash });
            }
            assert(reconciliation.watchedAutomaticSubjects().some((s) => s.publicationId === publicationId), '2. a live-session REGISTER still gets noted watched by retention, exactly as 0.9.190 always has');
            const removed = reconciliation.reconcile(pos(9000, 0, 0));
            assert(removed.some((r) => r.publicationId === publicationId), '3. retention still automatically removes it once out of range, exactly as before — the guard changed nothing about retention\'s own behavior for genuinely live registrations');
        }

        console.log('✓ Section I: retention behaves exactly as 0.9.190 already established for a live-session REGISTER, and simply never learns about a SUPPRESSED run — no retention-specific change was needed or made');
    }

    // ---------------------------------------------------------------
    // Section J — structural sweep: no new timer, no new asynchronous
    // lifecycle protocol; the guard and the call it gates are the SAME
    // synchronous stretch of code.
    // ---------------------------------------------------------------
    {
        const cascadeSource = await codeOnlySource('application/AutomaticSnapshotEncounterCascade.js');
        assert(!/setTimeout|setInterval/.test(cascadeSource), '1. no new timer of any kind was introduced');
        assert(!/AbortController|AbortSignal|CancellationToken/i.test(cascadeSource), '2. no cancellation-token machinery was introduced — the cascade itself is never cancelled');
        for (const lifecycleMethod of ['destroy(', 'dispose(', 'cancel(', 'abort(']) {
            assert(!cascadeSource.includes(lifecycleMethod), `3. no "${lifecycleMethod}" method was added — the cascade still exposes no cancellation surface of its own`);
        }

        // The session-lifetime check and the registration call it gates sit
        // in the SAME synchronous stretch, with no `await` between them —
        // verified directly against the source between those two markers.
        const guardIndex = cascadeSource.indexOf('!this._isSessionActive()');
        const registerIndex = cascadeSource.indexOf('registerMaterializedSnapshotWorldSource(this._worldDiscoverySourceRegistry');
        assert(guardIndex > -1 && registerIndex > guardIndex, '4. sanity: both the guard check and the register call are present, guard first');
        const between = cascadeSource.slice(guardIndex, registerIndex);
        assert(!/\bawait\b/.test(between), '5. no `await` sits between the isSessionActive() check and the registration call it gates — they run in one uninterrupted synchronous stretch, so no session-teardown race can slip between them');

        console.log('✓ Section J: no new timer, no cancellation-token machinery, no new cancellation method on the cascade, and the session check plus the registration call it gates remain one uninterrupted synchronous stretch');
    }

    // ---------------------------------------------------------------
    // Section K — structural sweep: no new Snapshot LIFECYCLE enum.
    // ---------------------------------------------------------------
    {
        const outcomeKeys = Object.keys(AutomaticSnapshotEncounterCascadeOutcome);
        assert(outcomeKeys.length === 2 && outcomeKeys.includes('INELIGIBLE') && outcomeKeys.includes('SUPPRESSED'),
            `1. AutomaticSnapshotEncounterCascadeOutcome carries exactly two values total — got ${JSON.stringify(outcomeKeys)}`);

        const outcomeSource = await codeOnlySource('application/AutomaticSnapshotEncounterCascadeOutcome.js');
        for (const forbidden of ['CANCELLED', 'CANCELED', 'ABANDONED', 'EXPIRED', 'ORPHANED', 'DEAD', 'STALE']) {
            assert(!outcomeSource.includes(forbidden), `2. no "${forbidden}" lifecycle value exists`);
        }

        const cascadeSource = await codeOnlySource('application/AutomaticSnapshotEncounterCascade.js');
        for (const forbidden of ['CANCELLED', 'CANCELED', 'ABANDONED', 'EXPIRED']) {
            assert(!cascadeSource.includes(forbidden), `3. no "${forbidden}" vocabulary was introduced in the cascade itself`);
        }

        console.log('✓ Section K: no new Snapshot lifecycle enum (CANCELLED/ABANDONED/EXPIRED/etc.) was introduced anywhere — SUPPRESSED is one terminal outcome value, exactly like INELIGIBLE before it');
    }

    // ---------------------------------------------------------------
    // Section L — ui/views/WorldView.js's own composition: the flag is
    // flipped as the FIRST statement of onBeforeUnmount(), before
    // session.dispose(), and handed to the cascade as isSessionActive.
    // ---------------------------------------------------------------
    {
        const viewSource = await readFile(new URL('ui/views/WorldView.js', SOURCE_ROOT), 'utf8');
        assert(/isSessionActive:\s*\(\)\s*=>\s*automaticCascadeSessionActive/.test(viewSource),
            '1. AutomaticSnapshotEncounterCascade is constructed with isSessionActive reading a plain, WorldView-owned flag');

        const unmountIndex = viewSource.indexOf('onBeforeUnmount(() => {');
        assert(unmountIndex > -1, '2. sanity: onBeforeUnmount() exists');
        const afterUnmount = viewSource.slice(unmountIndex);
        const flagFlipIndex = afterUnmount.indexOf('automaticCascadeSessionActive = false;');
        const disposeIndex = afterUnmount.indexOf('session.dispose();');
        const clearIntervalIndex = afterUnmount.indexOf('clearInterval(spatialInterval);');
        assert(flagFlipIndex > -1, '3. the flag is flipped somewhere inside onBeforeUnmount()');
        assert(flagFlipIndex < disposeIndex, '4. the flag is flipped BEFORE session.dispose() runs');
        assert(flagFlipIndex < clearIntervalIndex, '5. the flag is flipped before anything else in onBeforeUnmount() — the very first teardown action taken');

        console.log('✓ Section L: ui/views/WorldView.js flips its own session-lifetime flag as the first action inside onBeforeUnmount(), before any other teardown step, and hands a closure over it to the cascade as isSessionActive — a plain synchronous fact the composition root owns, exactly as designed');
    }

    console.log('\n✅ All Automatic Snapshot Session-Lifetime Guard tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
