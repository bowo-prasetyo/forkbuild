import { readFile } from 'node:fs/promises';

import { AutomaticSnapshotEncounterCascade } from '../application/AutomaticSnapshotEncounterCascade.js';
import { AutomaticSnapshotEncounterRetentionReconciliation } from '../application/AutomaticSnapshotEncounterRetentionReconciliation.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/WorldSnapshotDiscoveryMonitor.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { registerMaterializedSnapshotWorldSource } from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeWorldDiscoverySource } from '../core/WorldDiscoverySource.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';

// 0.9.192 — Automatic World Observation Cadence Audit.
//
// 0.9.191 proved that DISCOVER -> ... -> REGISTER and RETAIN -> UNREGISTER
// compose correctly on `ui/views/WorldView.js`'s own shared `refreshSpatialUI()`
// tick — the one-tick lag (its own Section D) and the phantom re-watch (its
// own Section L) were both recorded as OBSERVED, benign consequences of an
// ordering that file's own `makeAutomaticSession()` harness always drove
// SEQUENTIALLY (one full tick awaited before the next began) and NEVER tore
// down mid-flight. This milestone is test-only — no production file changes
// — and asks the question 0.9.191's own recommendation put in sharp relief:
// with THREE independent autonomous processes now riding one undifferentiated
// 3-second cadence, is that composition's TEMPORAL shape itself — the parts
// 0.9.191 never exercised — still safe? Specifically:
//
//   - What is the actual, provable ordering of synchronous vs. fire-and-
//     forget work within ONE `refreshSpatialUI()`-shaped tick, traced
//     directly rather than inferred from outcomes?
//   - `setInterval(refreshSpatialUI, 3000)` never awaits its own callback
//     (see `ui/views/WorldView.js`'s own call site) — what happens when a
//     SECOND tick's own discovery/cascade chain starts before the FIRST
//     tick's own chain has settled?
//   - What happens to an in-flight discovery/cascade chain when the
//     `WorldView` that started it is torn down (`onBeforeUnmount` clears
//     `spatialInterval`, but that does not cancel an already-in-flight
//     Promise) and a FRESH `WorldView` mount begins observing the same
//     World?
//   - Is `spatialInterval` genuinely the ONLY cadence driving any of this,
//     with no Snapshot-specific timer of its own anywhere in the discovery/
//     cascade/reconciliation files?
//
// EVERY COLLABORATOR BELOW IS EXISTING, UNMODIFIED APPLICATION CODE — THE
// SAME THREE CLASSES 0.9.186/0.9.187/0.9.190 SHIPPED, composed exactly as
// `ui/views/WorldView.js`'s own `refreshSpatialUI()` composes them (see
// `makeAutomaticSession()`, below — the same composition
// `tests/WorldSnapshotAutomaticEncounterRetentionLifecycleAudit.test.js`'s
// own harness already reproduces, extended here only with an optional trace
// hook and the ability to fire ticks WITHOUT awaiting between them). This
// file never repeats 0.9.191's own flagship/boundary/return-movement/multi-
// snapshot/content-revision/material-survival sections — those questions are
// already answered; this file asks only the CONCURRENCY/TEARDOWN/CADENCE
// questions 0.9.191's own always-sequential, always-single-session harness
// structurally could not.
//
//   Section A: the ordering contract, traced directly — spatialContext read,
//              THEN retention reconcile() invoked AND returned, ENTIRELY
//              SYNCHRONOUSLY — discovery's own command has not even been
//              INVOKED yet at that point (WorldSnapshotDiscoveryMonitor#
//              observe() defers its own command call behind a
//              `Promise.resolve().then()` microtask boundary of its own).
//              Discovery invocation, its own settling, cascade processing,
//              and noteAutomaticRegistration() all happen strictly later,
//              as fire-and-forget microtask continuations, in that order
//   Section B: overlapping ticks — a second tick's own discovery call fires
//              before the first tick's own cascade has settled; the cascade's
//              own 0.9.187 per-key idempotency still collapses both into
//              exactly one register call
//   Section C: rapid flapping (inside -> outside -> inside -> outside) fired
//              in a tight, un-awaited burst — the architecture produces no
//              permanently-stuck or duplicated state once everything settles
//   Section D: FLAGSHIP — session teardown. An in-flight cascade started by
//              a WorldView mount that is subsequently torn down still lands
//              its registration in the shared World registry, but a FRESH
//              WorldView mount's own reconciliation never watches it — an
//              orphaned registration, isolated from (never mutating) the new
//              session's own state, exactly as 0.9.191's Section M isolation
//              predicts, now confirmed across an actual teardown boundary
//   Section E: contrast — the orphan Section D produces is NOT "genuine
//              re-entry" into the automatic pipeline; only a fresh session's
//              own independent discovery/cascade run is
//   Section F: manual/LOCAL/PEER sources remain completely untouched under
//              the SAME overlapping-tick and teardown stress Sections B-D
//              exercise
//   Section G: structural sweep — `spatialInterval` (3000ms) is the ONLY
//              timer in `ui/views/WorldView.js` feeding `refreshSpatialUI()`,
//              and none of the three Snapshot application files contain a
//              `setInterval`/`setTimeout`/subscription loop of their own
//   Section H: the temporal contract, asserted as data — one synchronous
//              observation/reconciliation phase per tick, two independently-
//              timed asynchronous phases (discovery, cascade) that may each
//              complete on a LATER tick than the one that started them

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

// A deferred promise pair — the same helper 0.9.188/0.9.191's own test
// files already use to hold a collaborator open mid-flight.
function deferred() {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
}

// Registers a fake, already-PLACED Snapshot directly through the REAL
// registration bridge — exactly what a person's own manual "Register"
// button ultimately does one layer up. Mirrors 0.9.191's own helper.
function registerSnapshot(registry, { contentHash, publicationId, position }) {
    const result = registerMaterializedSnapshotWorldSource(
        registry,
        { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash, publicationId, position },
        publicationStub(publicationId)
    );
    assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'setup: registration itself must succeed');
    return result;
}

// makeAutomaticSession({...}) — reproduces ui/views/WorldView.js's own
// refreshSpatialUI() composition (0.9.186 discovery -> 0.9.187 cascade ->
// 0.9.190 reconciliation), EXACTLY, including its own ordering: the
// discover -> cascade -> noteAutomaticRegistration() chain is fired WITHOUT
// being awaited, and reconcile() runs SYNCHRONOUSLY immediately after, on
// the SAME tick. Extended, over 0.9.191's own version of this same harness,
// with one optional `trace` sink (an array `push()`-only log, never read by
// production code — see Section A) so this file can assert the ACTUAL
// ordering directly rather than only inferring it from outcomes.
function makeAutomaticSession({
    discoverSnapshotCandidatesCommand,
    resolveSelectedSnapshotCommand,
    materializeSelectedSnapshotCommand,
    worldDiscoverySourceRegistry,
    resolvePlacementInfo = null,
    findPublicationById = null,
    retentionRadius = undefined,
    trace = null
}) {
    const log = (event) => { if (trace) trace.push(event); };

    const monitor = new WorldSnapshotDiscoveryMonitor({
        discoverSnapshotCandidatesCommand: () => {
            log('discover:invoked');
            return Promise.resolve(discoverSnapshotCandidatesCommand()).then((result) => {
                log('discover:settled');
                return result;
            });
        }
    });
    const cascade = new AutomaticSnapshotEncounterCascade({
        resolveSelectedSnapshotCommand,
        materializeSelectedSnapshotCommand,
        worldDiscoverySourceRegistry,
        resolvePlacementInfo,
        findPublicationById
    });
    const reconciliation = new AutomaticSnapshotEncounterRetentionReconciliation({
        worldDiscoverySourceRegistry,
        ...(retentionRadius === undefined ? {} : { retentionRadius })
    });

    // tick(position) -> { removedThisTick, settled }
    //
    // Mirrors ui/views/WorldView.js's own refreshSpatialUI() body,
    // statement for statement: read spatial context (here, just `position`
    // itself — a plain stand-in for WorldSpatialContextService's own richer
    // shape, exactly as 0.9.191's own harness already simplifies it) ->
    // invoke monitor.observe() WITHOUT awaiting -> chain cascade processing
    // off its own `.then()` -> call reconcile() SYNCHRONOUSLY, immediately,
    // on the same tick.
    function tick(position) {
        log('spatialContext:read');
        const cascadeResults = [];
        const settled = monitor.observe({ position }).then(() => {
            const candidates = monitor.lastResult;
            if (!Array.isArray(candidates)) return [];
            return Promise.all(candidates.map((candidate) => {
                log('cascade:invoked');
                return cascade.processCandidate(candidate).then((result) => {
                    log('cascade:settled');
                    cascadeResults.push(result);
                    if (result && result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED) {
                        reconciliation.noteAutomaticRegistration({ publicationId: result.publicationId, contentHash: result.contentHash });
                        log('watch:noted');
                    }
                    return result;
                });
            }));
        }).then(() => cascadeResults);

        log('reconcile:invoked');
        const removedThisTick = reconciliation.reconcile(position);
        log('reconcile:returned');

        return { removedThisTick, settled };
    }

    async function fullTick(position) {
        const { removedThisTick, settled } = tick(position);
        const cascadeResults = await settled;
        return { removedThisTick, cascadeResults };
    }

    return { monitor, cascade, reconciliation, tick, fullTick };
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — the ordering contract, traced directly.
    // ---------------------------------------------------------------
    {
        const contentHash = 'trace-hash';
        const publicationId = 'trace-pub';
        const candidate = { contentHash, locator: 'ar://trace', storage: 'ar', publicationId };
        const registry = new WorldDiscoverySourceRegistry();
        const trace = [];

        const session = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([candidate]),
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            retentionRadius: 50,
            trace
        });

        session.tick(pos(0, 0, 0));
        // Immediately after tick() RETURNS — before any microtask has had a
        // chance to run — exactly the synchronous prefix has been logged.
        // Discovery's own command has NOT been invoked yet: `monitor.observe()`
        // itself runs synchronously, but the command call it eventually makes
        // is deferred behind its own `Promise.resolve().then()` (see
        // application/WorldSnapshotDiscoveryMonitor.js's own `observe()`) —
        // so `reconcile()` genuinely runs and RETURNS before discovery has
        // even started, not merely before it has settled.
        assert(
            JSON.stringify(trace) === JSON.stringify(['spatialContext:read', 'reconcile:invoked', 'reconcile:returned']),
            `1. the synchronous portion of one tick is EXACTLY: read spatial context -> invoke AND return reconcile — discovery has not even been INVOKED yet, let alone settled, got ${JSON.stringify(trace)}`
        );

        await flushMicrotasks();
        assert(
            JSON.stringify(trace) === JSON.stringify([
                'spatialContext:read', 'reconcile:invoked', 'reconcile:returned',
                'discover:invoked', 'discover:settled', 'cascade:invoked', 'cascade:settled', 'watch:noted'
            ]),
            `2. once microtasks flush, the fire-and-forget continuation runs in the exact order the cascade chain composes it: discovery is invoked (only NOW, after reconcile() already returned) and settles, THEN the candidate is cascaded, THEN (only on REGISTERED) the subject is noted watched — got ${JSON.stringify(trace)}`
        );
        assert(hasOrigin(registry, originFor(contentHash, publicationId)), '3. sanity: the traced sequence above genuinely ended in a real World registration');

        console.log('✓ Section A: the ordering contract, traced directly — one tick\'s ENTIRE synchronous work is read-context -> reconcile (invoked AND returned); discovery\'s own command is not even INVOKED until the first microtask after that, and settle -> cascade -> watch-note follow strictly later still, exactly matching ui/views/WorldView.js\'s own refreshSpatialUI() body composed with WorldSnapshotDiscoveryMonitor#observe()\'s own internal microtask deferral');
    }

    // ---------------------------------------------------------------
    // Section B — overlapping ticks: a second tick's own discovery call
    // fires before the first tick's own cascade has settled.
    // ---------------------------------------------------------------
    {
        const contentHash = 'overlap-hash';
        const publicationId = 'overlap-pub';
        const candidate = { contentHash, locator: 'ar://overlap', storage: 'ar', publicationId };
        const registry = new WorldDiscoverySourceRegistry();
        let setSourceCalls = 0;
        const originalSetSource = registry.setSource.bind(registry);
        registry.setSource = (...args) => { setSourceCalls += 1; return originalSetSource(...args); };
        let discoverCalls = 0;

        const session = makeAutomaticSession({
            // Every call reports the SAME candidate — the ordinary case: a
            // Nostr announcement does not disappear between two ticks a
            // few hundred milliseconds apart.
            discoverSnapshotCandidatesCommand: () => { discoverCalls += 1; return Promise.resolve([candidate]); },
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            retentionRadius: 50
        });

        // Two ticks fired back-to-back, at positions far enough apart (each
        // >= WorldSnapshotDiscoveryMonitor's own 100-unit refresh threshold)
        // that BOTH genuinely trigger their own discovery call — mirroring
        // `setInterval(refreshSpatialUI, 3000)` firing again before the
        // previous invocation's own fire-and-forget chain has settled
        // (entirely possible for a slow resolve/materialize round-trip).
        // Neither is awaited before the next begins.
        // Neither tick's own command invocation happens synchronously (see
        // Section A: WorldSnapshotDiscoveryMonitor#observe() defers its own
        // command call behind a microtask) — so BOTH are issued, back to
        // back, before either has even invoked its own discovery command,
        // let alone settled. This is the actual overlap: two independent
        // fire-and-forget chains genuinely in flight at once, each having
        // already captured its own `requestId` synchronously.
        const { settled: settledOne } = session.tick(pos(0, 0, 0));
        const { settled: settledTwo } = session.tick(pos(200, 0, 0));

        await Promise.all([settledOne, settledTwo]);
        await flushMicrotasks();

        assert(discoverCalls === 2, '1. both overlapping ticks genuinely triggered their own discovery call once their respective microtasks ran — this was a real overlap, not one call short-circuited by the movement threshold');
        assert(hasOrigin(registry, originFor(contentHash, publicationId)), '2. the subject is registered exactly once, despite two overlapping discovery/cascade chains both processing the identical candidate');
        assert(setSourceCalls === 1, '3. registry.setSource() was called exactly once — AutomaticSnapshotEncounterCascade\'s own 0.9.187 per-publicationId:contentHash idempotency map collapses both overlapping chains into a single register call, exactly as it already does for repeated SEQUENTIAL discovery (0.9.187/0.9.188), now proven under genuine concurrent overlap too');

        console.log('✓ Section B: two overlapping ticks, each genuinely triggering its own discovery call before the other has settled, still collapse into exactly one registration — the cascade\'s own existing per-subject idempotency, never a new lock or queue, is what makes overlapping ticks safe');
    }

    // ---------------------------------------------------------------
    // Section C — rapid flapping fired in a tight, un-awaited burst.
    // ---------------------------------------------------------------
    {
        const contentHash = 'flap-hash';
        const publicationId = 'flap-pub';
        // The Snapshot itself sits at the origin; "inside" is close to it,
        // "outside" is far.
        const candidate = { contentHash, locator: 'ar://flap', storage: 'ar', publicationId };
        const registry = new WorldDiscoverySourceRegistry();
        const counts = { setSource: 0, removeSource: 0 };
        const originalSetSource = registry.setSource.bind(registry);
        const originalRemoveSource = registry.removeSource.bind(registry);
        registry.setSource = (...args) => { counts.setSource += 1; return originalSetSource(...args); };
        registry.removeSource = (...args) => { counts.removeSource += 1; return originalRemoveSource(...args); };

        const session = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([candidate]),
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash, reason: null }),
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            retentionRadius: 50
        });

        const INSIDE = pos(0, 0, 0);
        const OUTSIDE = pos(9000, 0, 0);
        const burst = [INSIDE, OUTSIDE, INSIDE, OUTSIDE, INSIDE, OUTSIDE, INSIDE];

        // Every tick fired immediately, one after another, with NONE of
        // them awaited until the whole burst has been issued — the most
        // adversarial ordering `setInterval`'s own un-awaited callback could
        // ever actually produce (a real Wanderer cannot literally teleport
        // this fast, but the architecture itself places no such limit on
        // how quickly refreshSpatialUI() ticks can fire relative to how
        // slowly a resolve/materialize round-trip settles).
        const settledPromises = burst.map((p) => session.tick(p).settled);
        await Promise.all(settledPromises);
        await flushMicrotasks();

        // Whatever transient churn occurred during the burst, the FINAL
        // reconcile() call — driven by the LAST position in the burst,
        // INSIDE — is always followed by at least one further tick to let
        // that final state actually converge (mirroring the one-tick lag
        // 0.9.191's own Section D already established: a same-tick
        // registration is never visible to that tick's own reconcile()).
        const final = await session.fullTick(INSIDE);
        assert(hasOrigin(registry, originFor(contentHash, publicationId)), '1. after the burst settles and one further tick converges, the Snapshot ends up registered — correctly matching the LAST position in the burst (INSIDE), with no permanently-stuck incorrect state');
        assert(counts.setSource >= 1, '2. sanity: at least one registration occurred during or after the burst');
        assert(session.reconciliation.watchedAutomaticSubjects().some((s) => s.publicationId === publicationId), '3. the subject is correctly watched once everything converges');
        assert(final.removedThisTick.length === 0, '4. the final convergence tick removes nothing further — the architecture reached a stable, correct end state despite the adversarial burst');

        console.log(`✓ Section C: a tight, un-awaited burst of ${burst.length} rapid inside/outside ticks produces ${counts.setSource} registration(s) and ${counts.removeSource} removal(s) of transient churn, but always converges — after settling plus one further tick — to exactly the correct state for wherever the Wanderer actually ended up, with no permanently-stuck or duplicated registration`);
    }

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: session teardown. An in-flight cascade started
    // by a WorldView mount that is subsequently torn down still lands its
    // registration in the shared World registry, but a FRESH WorldView
    // mount's own reconciliation never watches it.
    // ---------------------------------------------------------------
    {
        const contentHash = 'teardown-hash';
        const publicationId = 'teardown-pub';
        const candidate = { contentHash, locator: 'ar://teardown', storage: 'ar', publicationId };
        const sharedRegistry = new WorldDiscoverySourceRegistry();
        const origin = originFor(contentHash, publicationId);

        // The "old" session: mirrors a WorldView mount whose own
        // resolveSelectedSnapshotCommand is held open — a real network
        // round-trip in flight at the exact moment a person navigates away.
        const resolveGate = deferred();
        const oldSession = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([candidate]),
            resolveSelectedSnapshotCommand: () => resolveGate.promise,
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash, reason: null }),
            worldDiscoverySourceRegistry: sharedRegistry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            retentionRadius: 50
        });

        oldSession.tick(pos(0, 0, 0));
        await flushMicrotasks();
        assert(!hasOrigin(sharedRegistry, origin), 'sanity: nothing registered yet — the old session\'s own cascade is genuinely still in flight, blocked on resolveGate');

        // TEARDOWN: exactly what ui/views/WorldView.js's own onBeforeUnmount
        // does — `clearInterval(spatialInterval)` — modeled here simply as
        // "nobody ever calls oldSession.tick() again." Crucially, clearing
        // an interval does NOT cancel a Promise chain already in flight;
        // `oldSession`'s own monitor/cascade/reconciliation instances are
        // never explicitly destroyed (none of the three classes expose a
        // destroy/dispose/cancel method of any kind — see Section G's own
        // structural sweep) — they simply stop being ticked.

        // A FRESH WorldView mount for the SAME World — a person navigating
        // back in — sharing only the registry, exactly mirroring 0.9.191's
        // own Section M session-isolation setup. Its own discovery command
        // never reports this candidate at all (it has not been announced
        // again since the new mount started observing), so its own cascade
        // never runs for it and it is never noted watched by the new
        // session's own reconciliation.
        const newSession = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([]),
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: 'unrelated', reason: null }),
            worldDiscoverySourceRegistry: sharedRegistry,
            resolvePlacementInfo: () => null,
            findPublicationById: () => null,
            retentionRadius: 50
        });
        await newSession.fullTick(pos(0, 0, 0));
        await newSession.fullTick(pos(9000, 0, 0));
        assert(newSession.reconciliation.watchedAutomaticSubjects().length === 0, '1. the fresh session starts, and remains, with an empty watch list of its own — it never learned about the old session\'s still-in-flight subject');

        // NOW the old session's held-open network call finally resolves —
        // long after the "component" that started it was torn down.
        resolveGate.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null });
        await flushMicrotasks();

        assert(hasOrigin(sharedRegistry, origin), '2. OBSERVED: the torn-down session\'s own in-flight cascade still completed and registered into the SHARED World registry — teardown never cancels an in-flight Promise chain, and the registry itself has no notion of "which session" a write came from');
        assert(oldSession.reconciliation.watchedAutomaticSubjects().some((s) => s.publicationId === publicationId), '3. the OLD (orphaned) reconciliation instance now watches it — but nothing will ever call oldSession.reconciliation.reconcile() again, since nobody ticks a torn-down session');
        assert(newSession.reconciliation.watchedAutomaticSubjects().every((s) => s.publicationId !== publicationId), '4. the NEW session\'s own watch list is completely unaffected — the old session\'s late completion never mutated it, exactly as 0.9.191\'s own Section M isolation predicts, now confirmed across an actual teardown boundary');

        // The consequence: the new session's OWN reconciliation, evaluated
        // at a position far from where this Snapshot is placed, does
        // nothing to it — it is not this session's subject to reconcile.
        const newSessionRemoved = newSession.reconciliation.reconcile(pos(9000, 0, 0));
        assert(newSessionRemoved.length === 0, '5. the new session\'s own reconcile() call removes nothing for this origin — it was never watching it');
        assert(hasOrigin(sharedRegistry, origin), '6. FINDING: the registration therefore SURVIVES, orphaned, in the shared World registry — nobody\'s reconciliation is watching it, so it will not be automatically retained OR removed by anyone until some session\'s own discovery/cascade independently re-notes it (see Section E)');

        console.log('✓ Section D: FLAGSHIP — tearing down a WorldView mount never cancels its own in-flight discovery/cascade chain; a late completion still writes into the shared World registry and is watched only by the now-orphaned OLD reconciliation instance, never contaminating a fresh mount\'s own state — but the consequence is a registration that persists, unreconciled by anyone, until a session independently rediscovers it');
    }

    // ---------------------------------------------------------------
    // Section E — contrast: the orphan Section D produces is NOT "genuine
    // re-entry"; only a fresh session's own independent discovery/cascade
    // run is.
    // ---------------------------------------------------------------
    {
        const contentHash = 'reentry-hash';
        const publicationId = 'reentry-pub';
        const candidate = { contentHash, locator: 'ar://reentry', storage: 'ar', publicationId };
        const sharedRegistry = new WorldDiscoverySourceRegistry();
        const origin = originFor(contentHash, publicationId);

        // Produce the exact same orphan Section D found: an old session's
        // cascade completes after the session itself is abandoned.
        const resolveGate = deferred();
        const oldSession = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([candidate]),
            resolveSelectedSnapshotCommand: () => resolveGate.promise,
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash, reason: null }),
            worldDiscoverySourceRegistry: sharedRegistry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            retentionRadius: 50
        });
        oldSession.tick(pos(0, 0, 0));
        await flushMicrotasks();
        resolveGate.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null });
        await flushMicrotasks();
        assert(hasOrigin(sharedRegistry, origin), 'sanity: the orphan exists — old session\'s own late completion registered it, unwatched by anyone');

        // A brand-new session mounts. Its own discovery command DOES
        // announce the identical candidate again (an entirely ordinary
        // case — the original Nostr announcement never went away just
        // because the previous mount tore down) — a GENUINE fresh
        // discovery/cascade run, independent of the orphan above.
        const newSession = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([candidate]),
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash, reason: null }),
            worldDiscoverySourceRegistry: sharedRegistry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            retentionRadius: 50
        });

        // First tick: discovers, cascades, and (once its own settle flushes)
        // registers — an idempotent replace of the SAME origin the orphan
        // above already occupies. Synchronously, right after this call
        // returns, reconcile() has already run and seen nothing watched yet
        // (0.9.191's own one-tick lag, held here across an entirely
        // different session instance).
        const { removedThisTick: firstTickRemoved, settled: firstTickSettled } = newSession.tick(pos(0, 0, 0));
        assert(firstTickRemoved.length === 0 && newSession.reconciliation.watchedAutomaticSubjects().length === 0,
            '1. synchronously, immediately after this tick returns: nothing watched yet and nothing removed — the one-tick lag applies here exactly as everywhere else');
        await firstTickSettled;
        assert(newSession.reconciliation.watchedAutomaticSubjects().some((s) => s.publicationId === publicationId),
            '2. once this tick\'s own fire-and-forget chain settles, the NEW session\'s own reconciliation NOW watches it — a genuinely fresh discovery/cascade run, unlike Section D\'s orphan, DOES constitute real re-entry into the automatic pipeline');

        const revival = await newSession.fullTick(pos(0, 0, 0)); // the first tick that can EVALUATE the now-watched subject
        assert(revival.removedThisTick.length === 0, '3. sanity: this tick keeps it, since the new session\'s own Wanderer sits right on top of it');

        // And, being genuinely watched now, it behaves exactly like any
        // other automatic subject going forward — the new session's own
        // Wanderer walking away DOES get it removed.
        const departure = await newSession.fullTick(pos(9000 + 9000, 0, 0));
        assert(!hasOrigin(sharedRegistry, origin), '4. once genuinely watched, ordinary retention applies — the new session\'s own Wanderer walking far away removes it');
        assert(departure.removedThisTick.some((r) => r.publicationId === publicationId), '5. and this tick reports the removal, exactly as ordinary retention always does');

        console.log('✓ Section E: an orphaned registration left behind by a torn-down session\'s late cascade completion (Section D) is NOT genuine re-entry into the automatic pipeline on its own — only a fresh session\'s own independent discovery/cascade run creates a real watcher, after which the subject behaves exactly like any other automatically-managed Snapshot');
    }

    // ---------------------------------------------------------------
    // Section F — manual/LOCAL/PEER sources remain untouched under the
    // SAME overlapping-tick and teardown stress Sections B-D exercise.
    // ---------------------------------------------------------------
    {
        const sharedRegistry = new WorldDiscoverySourceRegistry();
        registerSnapshot(sharedRegistry, { contentHash: 'manual-cadence-hash', publicationId: 'manual-cadence-pub', position: pos(999999, 0, 0) });
        const manualOrigin = originFor('manual-cadence-hash', 'manual-cadence-pub');
        sharedRegistry.setSource(describeWorldDiscoverySource({ origin: 'local', publications: [publicationStub('cadence-local-pub')], placements: [] }));
        sharedRegistry.setSource(describeWorldDiscoverySource({ origin: 'peer:cadence-identity', publications: [publicationStub('cadence-peer-pub')], placements: [] }));

        const contentHash = 'cadence-auto-hash';
        const publicationId = 'cadence-auto-pub';
        const candidate = { contentHash, locator: 'ar://cadence-auto', storage: 'ar', publicationId };
        const resolveGate = deferred();

        // An old session whose cascade is deliberately left in flight
        // (mirroring Section D) alongside a second, live session firing
        // overlapping ticks (mirroring Section B) — the combined stress of
        // both this milestone's own new scenarios at once.
        const oldSession = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([candidate]),
            resolveSelectedSnapshotCommand: () => resolveGate.promise,
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash, reason: null }),
            worldDiscoverySourceRegistry: sharedRegistry,
            resolvePlacementInfo: () => ({ placementId: 'p', publicationId, position: pos(0, 0, 0) }),
            findPublicationById: () => publicationStub(publicationId),
            retentionRadius: 50
        });
        oldSession.tick(pos(0, 0, 0));

        const liveSession = makeAutomaticSession({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([]),
            resolveSelectedSnapshotCommand: () => Promise.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null }),
            materializeSelectedSnapshotCommand: () => Promise.resolve({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: 'unrelated-cadence', reason: null }),
            worldDiscoverySourceRegistry: sharedRegistry,
            resolvePlacementInfo: () => null,
            findPublicationById: () => null,
            retentionRadius: 50
        });
        liveSession.tick(pos(0, 0, 0));
        liveSession.tick(pos(300, 0, 0));
        liveSession.tick(pos(0, 0, 0));
        await Promise.all([liveSession.tick(pos(300, 0, 0)).settled]);

        resolveGate.resolve({ outcome: DecentralizedSnapshotResolutionOutcome.RESOLVED, bytes: new Uint8Array([1]), reason: null });
        await flushMicrotasks();
        await liveSession.fullTick(pos(9000, 0, 0));

        assert(hasOrigin(sharedRegistry, manualOrigin), '1. the manually-registered Snapshot survives overlapping ticks AND a concurrent orphaned teardown completion');
        assert(hasOrigin(sharedRegistry, 'local'), '2. the unrelated LOCAL source survives');
        assert(hasOrigin(sharedRegistry, 'peer:cadence-identity'), '3. the unrelated PEER source survives');
        assert(liveSession.reconciliation.watchedAutomaticSubjects().every((s) => s.publicationId !== 'manual-cadence-pub'), '4. the manual Snapshot was never, and is never, watched by any automatic reconciliation instance');

        console.log('✓ Section F: manual/LOCAL/PEER World sources remain completely untouched even under the combined stress of overlapping ticks and a concurrently orphaned, torn-down session\'s late cascade completion');
    }

    // ---------------------------------------------------------------
    // Section G — structural sweep: exactly one observation cadence.
    // ---------------------------------------------------------------
    {
        const worldViewSource = await codeOnlySource('ui/views/WorldView.js');
        const setIntervalCalls = worldViewSource.match(/setInterval\(/g) || [];
        assert(setIntervalCalls.length === 3, `1. ui/views/WorldView.js declares exactly three intervals total (spatialInterval, spatialPresenceSyncInterval, vehicleInteractionInterval) — got ${setIntervalCalls.length}; a new one appearing here would be a structural regression worth re-examining, whether or not it touches Snapshot machinery`);
        assert(/spatialInterval\s*=\s*setInterval\(\s*\(\)\s*=>\s*\{[^}]*refreshSpatialUI\(\)/.test(worldViewSource),
            '2. exactly one of those three intervals — spatialInterval — is the one that calls refreshSpatialUI(), the single tick this entire file\'s own Sections A-F exercise');

        // None of the three Snapshot application files this milestone (or
        // 0.9.186/0.9.187/0.9.190) shipped may declare a timer, interval,
        // or subscription loop of their own — each must remain reachable
        // ONLY through a caller-driven method call (observe()/
        // processCandidate()/reconcile()/noteAutomaticRegistration()),
        // exactly as WorldSnapshotDiscoveryMonitor.js's own header already
        // promises ("this file decides, given a call, whether that call is
        // worth acting on — it never schedules its own timer, polling loop,
        // or subscription").
        for (const relativePath of [
            'application/WorldSnapshotDiscoveryMonitor.js',
            'application/AutomaticSnapshotEncounterCascade.js',
            'application/AutomaticSnapshotEncounterRetentionReconciliation.js'
        ]) {
            const source = await codeOnlySource(relativePath);
            for (const forbidden of ['setInterval(', 'setTimeout(', '.subscribe(', 'requestAnimationFrame(']) {
                assert(!source.includes(forbidden), `3. ${relativePath} contains no "${forbidden}" of its own — no hidden second cadence exists anywhere in the discovery/cascade/reconciliation chain`);
            }
            // None of the three exposes a destroy/dispose/cancel method
            // either — confirming Section D's own premise directly: there
            // is structurally no way to cancel an in-flight chain once
            // started, only the choice never to feed it another tick.
            for (const lifecycleMethod of ['destroy(', 'dispose(', 'cancel(', 'abort(']) {
                assert(!source.includes(lifecycleMethod), `4. ${relativePath} exposes no "${lifecycleMethod}" method — confirming Section D's own finding structurally: an in-flight discovery/cascade chain cannot be cancelled, only abandoned`);
            }
        }

        console.log('✓ Section G: structural sweep confirms spatialInterval (3000ms) is the ONLY cadence feeding refreshSpatialUI(), and none of WorldSnapshotDiscoveryMonitor.js/AutomaticSnapshotEncounterCascade.js/AutomaticSnapshotEncounterRetentionReconciliation.js declares a timer, interval, subscription loop, or cancellation method of its own — every finding in Sections A-F is a consequence of ONE shared, caller-driven tick, never a second hidden one');
    }

    // ---------------------------------------------------------------
    // Section H — the temporal contract, asserted as data.
    // ---------------------------------------------------------------
    {
        // This is the "useful architectural documentation" this milestone
        // set out to produce: the actual, now-proven shape of one
        // refreshSpatialUI() tick, held here as an assertable structure
        // rather than only prose in docs/Roadmap.md — a future change that
        // silently altered this contract (e.g. making reconcile() await the
        // discovery/cascade chain, or adding a fourth autonomous phase)
        // would have to knowingly edit this section, not just docs/Roadmap.md.
        const OBSERVATION_TICK_CONTRACT = Object.freeze({
            synchronousPhase: Object.freeze([
                'read spatial context',
                'invoke discovery observe() (fire-and-forget)',
                'invoke AND return retention reconcile() (never awaits discovery)'
            ]),
            asynchronousPhases: Object.freeze({
                discovery: 'may settle on a LATER tick than the one that invoked it (WorldSnapshotDiscoveryMonitor\'s own requestId guard discards a stale response)',
                cascade: 'chained off discovery settling; a subject it REGISTERS is never visible to the SAME tick\'s own already-returned reconcile() call (one-tick lag, 0.9.191 Section D)'
            }),
            teardownSemantics: 'clearing the interval that drives this tick does not cancel an in-flight discovery/cascade chain already underway (Section D); none of the three Snapshot classes expose a cancellation method (Section G)',
            cadenceCount: 1
        });

        assert(OBSERVATION_TICK_CONTRACT.synchronousPhase.length === 3, '1. exactly three synchronous steps per tick, proven directly by Section A\'s own trace');
        assert(OBSERVATION_TICK_CONTRACT.cadenceCount === 1, '2. exactly one observation cadence exists, proven directly by Section G\'s own structural sweep');
        assert(Object.isFrozen(OBSERVATION_TICK_CONTRACT) && Object.isFrozen(OBSERVATION_TICK_CONTRACT.synchronousPhase) && Object.isFrozen(OBSERVATION_TICK_CONTRACT.asynchronousPhases),
            '3. the contract itself is immutable — this section documents what Sections A-G already proved, it does not itself decide anything');

        console.log('✓ Section H: the temporal contract — one synchronous read/invoke/reconcile prefix per tick, two independently-timed fire-and-forget phases that may each resolve on a later tick, and no cancellation semantics on teardown — held here as an assertable structure, matching exactly what Sections A-G each independently proved');
    }

    console.log('\n✅ All World Snapshot Automatic Observation Cadence Audit tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
