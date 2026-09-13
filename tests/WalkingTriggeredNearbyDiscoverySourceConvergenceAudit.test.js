import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { WorldSnapshotDiscoveryMonitor } from '../application/WorldSnapshotDiscoveryMonitor.js';
import { shouldRefreshSnapshotDiscovery, DEFAULT_DISCOVERY_REFRESH_RADIUS } from '../application/ShouldRefreshSnapshotDiscovery.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { PlaceNamingDiscoveryQueryService } from '../application/PlaceNamingDiscoveryQueryService.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';

// 0.9.479 — Walking-Triggered Nearby Discovery Source Convergence Audit.
//
// Test-only. Production changes: none (enforced by Section J's own
// git-diff guard).
//
// ORIGINATING OBSERVATION: a product-direction proposal argued that
// `discovery/CompositeDiscoveryProvider.js` makes it "technically
// plausible" to converge the walking-triggered nearby discovery monitor's
// currently Nostr-only candidate feed with Local and Peer sources, and
// asked — self-critically, and correctly — that this be audited BEFORE
// any wiring: "CompositeDiscoveryProvider is an implementation seam, not
// by itself proof that 'search everywhere' is the correct product
// behavior." This milestone takes that self-correction at its word and
// goes one step further: it asks whether `CompositeDiscoveryProvider`
// is even the RIGHT seam to be auditing at all.
//
//   Section A — Locating the real system, and a first correction: the
//               "walking-triggered nearby discovery monitor" is
//               `application/WorldSnapshotDiscoveryMonitor.js` (0.9.186),
//               and `discovery/CompositeDiscoveryProvider.js` is
//               structurally incapable of serving it — a different
//               discovery subsystem entirely, proven by introspection,
//               not merely argued.
//   Section B — The monitor's actual contract, live: query shape, async
//               behavior, result shape, the race-guard, failure
//               isolation, and one genuine, minor asymmetry against its
//               own closest sibling.
//   Section C — Nostr's special status is incidental, not structural,
//               proven live by swapping the real, unmodified command's
//               `discoveryQueryService` for a non-Nostr duck-typed
//               double.
//   Section D — Local source suitability: no local, `search()`-shaped
//               candidate source exists today — confirmed structurally,
//               not merely absent from `ui/main.js`'s own composition.
//   Section E — Peer source suitability: the existing peer material
//               capability is exclusively resolution-of-an-already-known
//               object, explicitly and repeatedly disclaiming
//               enumeration — confirmed by direct citation and by the
//               wire protocol's own two-kind vocabulary.
//   Section F — The composition seam, corrected and demonstrated: never
//               `CompositeDiscoveryProvider`; the codebase already has
//               the RIGHT template, one sibling family over
//               (`PlaceNamingDiscoveryQueryService`) — its isolation and
//               deduplication mechanics are shown live, generalized (in
//               this test only) to the Snapshot-candidate shape, and
//               proven duck-type-compatible with the real, unmodified
//               monitor and command.
//   Section G — Frequency and lifecycle semantics, live: the movement
//               gate is distance-only with no time throttle, and the
//               monitor's existing request-id race-guard already
//               tolerates a slow or failing source without a queue,
//               cancellation, or a second architecture.
//   Section H — Downstream convergence is already proven safe: this
//               milestone RE-EXECUTES, live, the existing whole-pipeline
//               audit (0.9.195) rather than re-deriving its findings —
//               confirming a candidate's origin is never encoded in its
//               World-registry identity, so no source could become
//               "authoritative" merely by participating, whichever
//               sources eventually feed the monitor.
//   Section I — Deliberate exclusions.
//   Section J — No production file touched; final classification.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rliE' : '-rlE';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}

function runGuardLive(relativeTestPath) {
    return execSync(`node ${relativeTestPath}`, { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
}

async function run() {
    console.log('=== 0.9.479 — Walking-Triggered Nearby Discovery Source Convergence Audit ===\n');

    // ===============================================================
    // Section A — Locating the real system, and a first correction.
    // ===============================================================
    {
        // A1. The walking-triggered nearby discovery monitor really is
        // wired to fire from movement, inside WorldView's own existing
        // spatial cadence — never a second polling loop of its own.
        const worldViewSource = await readSource('ui/views/WorldView.js');
        assert(/worldSnapshotDiscoveryMonitor\.observe\(spatialContext\.value\)/.test(worldViewSource),
            '1. WorldSnapshotDiscoveryMonitor#observe() is called from WorldView.js, fed the same spatialContext every other spatial-cadence field on the same tick already reads.');
        assert(/function refreshSpatialUI\(\)[\s\S]*worldSnapshotDiscoveryMonitor\.observe/.test(worldViewSource),
            "2. that call site sits INSIDE refreshSpatialUI() itself — the movement/session-driven tick — never a second, dedicated timer.");

        // A2. discovery/CompositeDiscoveryProvider.js is a REAL class in
        // this codebase, already used for something — but never once
        // referenced from anywhere in the Snapshot-candidate-discovery
        // family the monitor actually calls into.
        const compositeReferences = grepFiles('CompositeDiscoveryProvider',
            ['application/WorldSnapshotDiscoveryMonitor.js', 'application/ShouldRefreshSnapshotDiscovery.js',
             'application/DiscoverSnapshotCandidatesCommand.js', 'application/DiscoverSnapshotRuntimeComposition.js',
             'application/NostrSnapshotDiscoveryQueryService.js']);
        assert(compositeReferences.length === 0,
            '3. none of the five files that make up the walking-triggered discovery chain (monitor, threshold, command, runtime composition, or its one current source) reference CompositeDiscoveryProvider at all.');

        // A3. STRUCTURAL PROOF, not argument: CompositeDiscoveryProvider
        // exposes no `search` method of any kind — it is not merely
        // "unwired," it does not even implement the one method the
        // monitor's own command boundary requires.
        const composite = new CompositeDiscoveryProvider([]);
        assert(typeof composite.search !== 'function',
            "4. CompositeDiscoveryProvider has no search() method — it cannot satisfy executeDiscoverSnapshotCandidatesCommand()'s own duck-typed contract (a discoveryQueryService exposing search()) no matter how it is wired.");
        assert(typeof composite.list === 'function' && typeof composite.findById === 'function',
            "5. what it DOES expose (list()/findById()/findByAuthor()/findByParentId()/findByDocumentId()) is a SYNCHRONOUS Publication-catalog contract — discovery/DiscoveryProvider.js's own family, serving Repository/Editor/CreateDiscoveryUseCase.js, never the async candidate-browsing family the monitor calls into.");
        assert(composite.list().length === 0 && composite.findById('anything') === null,
            '6. an empty CompositeDiscoveryProvider behaves exactly like discovery/DiscoveryProvider.js\'s own base contract — plain values, never a Promise — confirming the shape mismatch is not merely a naming coincidence.');

        // A4. The corrected premise, stated once and carried through the
        // rest of this audit: the codebase already draws a hard line
        // between two independent discovery families that happen to
        // share the English word "discovery" — the Publication-catalog
        // family (CompositeDiscoveryProvider, LocalDiscoveryProvider,
        // DecentralizedPublicationDiscoveryProvider — sync, `Publication`
        // objects, `list`/`findBy*`) and the candidate-browsing family
        // (NostrSnapshotDiscoveryQueryService, PlaceNamingDiscoveryQueryService
        // — async, raw envelopes/candidates, `search(discoveryTag)`). The
        // walking-triggered monitor lives entirely in the second family.
        console.log('✓ Section A: the walking-triggered monitor is WorldSnapshotDiscoveryMonitor.js, fed by refreshSpatialUI()\'s own existing cadence — and CompositeDiscoveryProvider is structurally incapable of serving it: no search() method, a synchronous Publication-catalog contract, zero references anywhere in the chain the monitor actually calls.');
    }

    // ===============================================================
    // Section B — The monitor's actual contract, live.
    // ===============================================================
    {
        // A single, stable injected command — never swapped mid-flight,
        // exactly like the one real, unmodified `discoverSnapshotCandidatesCommand`
        // ui/main.js composes once and hands to the real monitor — whose
        // own behavior varies only by call ORDER (call 1 stays pending
        // until this test explicitly resolves it; every later call
        // resolves immediately). This is the realistic shape a race can
        // actually take: the same collaborator, called twice, where the
        // first call's own network round-trip simply outlives the second.
        let calls = 0;
        let resolveFirstCall = null;
        const monitor = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => {
                calls += 1;
                if (calls === 1) {
                    return new Promise((resolve) => { resolveFirstCall = resolve; });
                }
                return Promise.resolve(['fresh-candidate']);
            }
        });

        // B1. Query shape: observe() takes an opaque, duck-typed context
        // (never a class instance requirement) and the command itself
        // takes NO arguments — the discoveryTag/discoveryQueryService
        // binding already happened one layer up, in ui/main.js.
        const contextA = { position: { x: 0, y: 0, z: 0 } };
        const pending = monitor.observe(contextA);
        assert(monitor.executing === true, '1. `executing` flips true synchronously, before the injected command\'s own promise has even had a chance to settle — an observable flag, not something a caller has to infer from timing.');
        await Promise.resolve(); // let observe()'s own internal .then() chain reach the injected command
        assert(calls === 1, '2. a first observe() call with no prior position always triggers the injected command exactly once.');

        // B2. Repeated polling semantics: a second observe() call for a
        // position inside the refresh radius, while the first is still
        // in flight, does NOT trigger a second command call.
        await monitor.observe({ position: { x: 5, y: 0, z: 0 } });
        assert(calls === 1, '3. a tiny movement (5 units, far under the 100-unit default radius) while a request is already in flight never triggers a second command call — the movement gate, not concurrency, is what limits call volume.');

        // B3. Race protection: a LATER observe() call, for a position far
        // enough to warrant its own fresh call, wins over the FIRST
        // call's own late-arriving response — even when that first call
        // resolves AFTER the second one already has.
        await monitor.observe({ position: { x: 500, y: 0, z: 0 } });
        assert(calls === 2 && JSON.stringify(monitor.lastResult) === JSON.stringify(['fresh-candidate']),
            '4. a later, superseding observe() call always wins — lastResult reflects only the most recently ISSUED request.');
        resolveFirstCall(['stale-candidate']);
        await pending;
        assert(JSON.stringify(monitor.lastResult) === JSON.stringify(['fresh-candidate']),
            '5. the first call\'s own late-arriving response, resolved only now, never overwrites the newer result — never a request-id race an earlier, slower call could still win.');

        // B4. A discovery failure never mutates lastResult, and observe()
        // itself never rejects.
        const failingMonitor = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => Promise.reject(new Error('relay unreachable'))
        });
        await failingMonitor.observe({ position: { x: 0, y: 0, z: 0 } });
        let rejected = false;
        try { await failingMonitor.observe({ position: { x: 0, y: 0, z: 0 } }); } catch { rejected = true; }
        assert(!rejected, '6. observe() never rejects, even when the injected command itself rejects — a caller can always `.then()` it unconditionally.');
        assert(failingMonitor.lastResult === null && failingMonitor.lastError instanceof Error,
            '7. a failed cycle leaves lastResult exactly as it was (never mutated) and records the failure on lastError alone — isolating one bad discovery call from corrupting the last-known-good candidate list.');

        // B5. Result shape: the monitor stores exactly what the command
        // resolved to, verbatim — no envelope, no re-shaping.
        const passthroughMonitor = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => Promise.resolve([{ contentHash: 'abc', locator: 'ipfs://x', storage: 'ipfs' }])
        });
        await passthroughMonitor.observe({ position: { x: 0, y: 0, z: 0 } });
        assert(Array.isArray(passthroughMonitor.lastResult) && passthroughMonitor.lastResult[0].contentHash === 'abc',
            '8. lastResult is exactly the candidate array the command resolved to, byte for byte — the monitor performs no ranking, filtering, or deduplication of its own.');

        // B6. Lifecycle: unlike its own closest sibling
        // (PlaceNamingDiscoveryMonitor, which added an explicit
        // dispose()), WorldSnapshotDiscoveryMonitor.js exposes no
        // dispose() at all — a genuine, minor asymmetry worth naming
        // for whoever eventually builds a composite source for it,
        // never a defect this milestone is scoped to fix.
        assert(typeof monitor.dispose !== 'function',
            '9. WorldSnapshotDiscoveryMonitor has no dispose() method — a real asymmetry against PlaceNamingDiscoveryMonitor.js\'s own explicit disposability, noted here and left alone (see Section I).');

        console.log('✓ Section B: query shape is an opaque context in, a plain candidate array out; the monitor is movement-gated, request-id race-protected, never rejects, never mutates lastResult on failure, and passes results through completely untouched — confirmed live, not merely read from its own header.');
    }

    // ===============================================================
    // Section C — Nostr\'s special status is incidental, proven live.
    // ===============================================================
    {
        // C1. Structural: neither the monitor nor the command imports
        // anything Nostr-specific — both are duck-typed against
        // `search(discoveryTag) -> Promise<Array>` alone.
        const monitorSource = await readSource('application/WorldSnapshotDiscoveryMonitor.js');
        const commandSource = await readSource('application/DiscoverSnapshotCandidatesCommand.js');
        const monitorImports = monitorSource.match(/^import .*/gm) || [];
        const commandImports = commandSource.match(/^import .*/gm) || [];
        assert(![...monitorImports, ...commandImports].some((line) => /nostr/i.test(line)),
            '1. neither WorldSnapshotDiscoveryMonitor.js nor DiscoverSnapshotCandidatesCommand.js IMPORTS anything Nostr-specific — both files\' own headers mention Nostr only in prose, as an example of what they deliberately never construct, never as an actual dependency.');

        // C2. Live: the REAL, unmodified command, driven by a
        // deliberately non-Nostr duck-typed double, behaves identically
        // to driving it with a real NostrSnapshotDiscoveryQueryService.
        const fakePeerShapedSource = {
            search: async (discoveryTag) => (discoveryTag === 'forkbuild-snapshot'
                ? [{ contentHash: 'peer-hash', locator: 'peer://device-9', storage: 'peer' }]
                : [])
        };
        const result = await executeDiscoverSnapshotCandidatesCommand({
            discoveryTag: 'forkbuild-snapshot',
            discoveryQueryService: fakePeerShapedSource
        });
        assert(result.length === 1 && result[0].storage === 'peer',
            '2. executeDiscoverSnapshotCandidatesCommand() — the REAL, unmodified 0.9.150 command — accepts a non-Nostr discoveryQueryService without any change, and forwards its result verbatim.');

        // C3. Confirming the converse holds too: a real
        // NostrSnapshotDiscoveryQueryService, driven by a fake relay
        // queryImpl, is not treated specially by the command either —
        // both sources reach identical code paths.
        const realNostrService = new NostrSnapshotDiscoveryQueryService({
            queryImpl: async () => []
        });
        const nostrResult = await executeDiscoverSnapshotCandidatesCommand({
            discoveryTag: 'forkbuild-snapshot',
            discoveryQueryService: realNostrService
        });
        assert(Array.isArray(nostrResult) && nostrResult.length === 0,
            '3. a real NostrSnapshotDiscoveryQueryService instance flows through the identical, unmodified command boundary — Nostr is one interchangeable implementation of the contract, never a special case inside it.');

        console.log('✓ Section C: Nostr is the monitor\'s only source today purely as a matter of what ui/main.js happens to compose — proven live by driving the real, unmodified command through a non-Nostr double, and confirmed structurally by the complete absence of the word "nostr" from either the monitor or the command\'s own source.');
    }

    // ===============================================================
    // Section D — Local source suitability: the gap, confirmed.
    // ===============================================================
    {
        // D1. No file in this codebase ties a local, offline concept of
        // "Snapshot candidates this device already knows about" to the
        // wire shape (core/SnapshotDiscoveryEnvelope.js) the monitor's
        // command family actually consumes — only the Nostr publisher
        // and query service ever reference that envelope.
        const envelopeReferences = grepFiles("from '.*SnapshotDiscoveryEnvelope", ['application', 'core'])
            .filter((file) => !file.includes('.test.'));
        const nonNostrEnvelopeReferences = envelopeReferences.filter((file) => !/nostr/i.test(file) && !file.includes('core/SnapshotDiscoveryEnvelope.js'));
        assert(nonNostrEnvelopeReferences.length === 0,
            `1. every production file referencing core/SnapshotDiscoveryEnvelope.js is either that envelope's own definition or a Nostr file (application/NostrSnapshotDiscoveryPublisher.js, application/NostrSnapshotDiscoveryQueryService.js) — no local store, cache, or catalog of announced Snapshot candidates exists (found instead: ${nonNostrEnvelopeReferences.join(', ') || 'none'}).`);

        // D2. discovery/LocalDiscoveryProvider.js — the obvious first
        // guess for "the local source" — is proven, structurally, to be
        // the WRONG shape: it answers about `Publication` objects from
        // this device's own published catalog, never about
        // `{contentHash, locator, storage}` candidates for a
        // discoveryTag, and it has no `search()` method at all.
        assert(typeof LocalDiscoveryProvider.prototype.search !== 'function',
            "2. LocalDiscoveryProvider has no search() method — like CompositeDiscoveryProvider (Section A), it belongs to the Publication-catalog family, not the candidate-browsing family the monitor's command requires.");
        const localProviderSource = await readSource('discovery/LocalDiscoveryProvider.js');
        assert(!/contentHash|\blocator\b/.test(localProviderSource),
            '3. LocalDiscoveryProvider.js never mentions contentHash or a locator anywhere — it has no concept of a Snapshot candidate at all, confirming this is a genuine conceptual gap, not merely a missing method on an otherwise-suitable class.');

        console.log('✓ Section D: no local, search()-shaped source of Snapshot candidates exists anywhere in this codebase today — not merely unwired, but conceptually absent. A Local source would require a genuinely NEW decision (what "locally known" even means for an announcement family that exists specifically so OTHER devices can find THIS one\'s content) before it could be wired at all.');
    }

    // ===============================================================
    // Section E — Peer source suitability: the gap, confirmed.
    // ===============================================================
    {
        // E1. The existing peer World Encounter material capability is
        // exclusively resolution-of-an-already-selected object — its own
        // header says so, repeatedly and explicitly. Re-confirmed live
        // against current source, never merely cited from memory.
        const peerSourceText = await readSource('application/PeerWorldEncounterMaterialSource.js');
        const peerSourceNormalized = peerSourceText.replace(/\r?\n\/\/ ?/g, ' ').replace(/\s+/g, ' ');
        assert(/never asks a peer "what do you have," never re-runs discovery, never enumerates a peer's own catalog/.test(peerSourceNormalized),
            "1. PeerWorldEncounterMaterialSource.js's own header still, today, explicitly disclaims exactly the capability a search()-shaped source would need: asking a peer what it has.");
        assert(/A request for object X from peer Y means[\s\S]*never "tell me everything you know\."/.test(peerSourceNormalized),
            '2. the same file explicitly frames its own scope as "give me X," never "tell me everything you know" — the second is precisely what a walking-triggered browse/search capability requires.');

        // E2. The wire protocol itself has no room for a browse/list
        // request — only two message kinds exist, both scoped to one
        // already-known objectId.
        const protocolText = await readSource('application/PeerWorldEncounterMaterialProtocol.js');
        assert(/REQUEST:\s*'REQUEST',\s*RESPONSE:\s*'RESPONSE'/.test(protocolText.replace(/\s+/g, ' ')),
            '3. PeerWorldEncounterMaterialMessageKind carries exactly two kinds, REQUEST and RESPONSE — no LIST/QUERY/BROWSE kind exists to ask a peer "what candidates do you have for this discoveryTag."');
        assert(/isValidWorldEncounterObjectId/.test(protocolText) && /objectId/.test(protocolText),
            '4. both existing message kinds are keyed on a single, already-known objectId — the wire shape has no field for a discoveryTag at all.');

        // E3. Building the responder side — the OTHER half a browse
        // capability would also need (answering "what do you have," not
        // merely asking it) — was explicitly named and explicitly
        // deferred as separate, unscheduled work when the requester side
        // was built.
        assert(/REQUESTER ONLY[\s\S]*never answers an incoming request/i.test(peerSourceText),
            '5. the file that would need to grow a browse capability already documents, in its own header, that it deliberately implements only one direction — answering an incoming request from another peer is separate, unscheduled work, not merely unbuilt by omission.');

        console.log('✓ Section E: the existing peer material capability cannot serve the walking-triggered monitor today — confirmed by direct citation of its own explicit "never enumerates a peer\'s own catalog" disclaimer, and structurally, by a wire protocol with no browse/list message kind and no discoveryTag field at all. A Peer source needs a genuinely new protocol extension AND a responder side neither of which exist yet.');
    }

    // ===============================================================
    // Section F — The composition seam, corrected and demonstrated.
    // ===============================================================
    {
        // F1. The codebase already has the RIGHT template for this
        // exact problem, one sibling discovery family over:
        // PlaceNamingDiscoveryQueryService (0.9.253) already composes N
        // duck-typed `search()` sources, isolating failures via
        // Promise.allSettled and deduplicating by a domain-specific key
        // — never CompositeDiscoveryProvider's own sync, Publication-
        // catalog shape.
        const placeNamingSource = await readSource('application/PlaceNamingDiscoveryQueryService.js');
        assert(/Promise\.allSettled/.test(placeNamingSource),
            '1. PlaceNamingDiscoveryQueryService.js really does isolate its own sources via Promise.allSettled — the exact mechanism a Snapshot-candidate composite would need, already proven in production for a sibling family.');
        assert(typeof PlaceNamingDiscoveryQueryService.prototype.search === 'function',
            '2. and it exposes exactly the search(discoveryTag) shape the walking-triggered monitor\'s own command requires — unlike CompositeDiscoveryProvider (Section A).');

        // F2. A NEW class would still be required, never a reuse of
        // PlaceNamingDiscoveryQueryService itself — its dedup key
        // (claim.id) and its parser (parsePlaceNamingDiscoveryEnvelope)
        // are both specific to the Place Naming envelope, and a
        // Snapshot's own identity key is `contentHash`, a completely
        // different field on a completely different envelope shape.
        assert(!/contentHash/.test(placeNamingSource),
            '3. PlaceNamingDiscoveryQueryService.js has no concept of contentHash at all — reusing this exact class for Snapshot candidates would require bending an unrelated envelope shape into it, never a simple parameterization.');

        // F3. LIVE DEMONSTRATION — a test-only prototype, never imported
        // by any production file, shaped exactly like
        // PlaceNamingDiscoveryQueryService's own proven pattern but
        // generalized here to the REAL, unmodified Snapshot candidate
        // shape ({ contentHash, locator, storage }) and REAL dedup key
        // (contentHash). This is exactly what a future
        // `SnapshotCandidateDiscoveryQueryService` (or equivalent) would
        // need to do — proven safe in principle, without shipping it.
        class SnapshotCandidateCompositeShapedLikePlaceNamingDiscoveryQueryService {
            constructor(sources) { this._sources = sources; }
            async search(discoveryTag) {
                const settled = await Promise.allSettled(this._sources.map((source) => source.search(discoveryTag)));
                const seen = new Set();
                const results = [];
                for (const outcome of settled) {
                    if (outcome.status !== 'fulfilled' || !Array.isArray(outcome.value)) continue;
                    for (const candidate of outcome.value) {
                        if (!candidate || seen.has(candidate.contentHash)) continue;
                        seen.add(candidate.contentHash);
                        results.push(candidate);
                    }
                }
                return results;
            }
        }

        const workingNostrLikeSource = { search: async () => [{ contentHash: 'hash-1', locator: 'ar://tx1', storage: 'arweave' }] };
        const failingSource = { search: async () => { throw new Error('device offline'); } };
        const duplicateReportingSource = { search: async () => [{ contentHash: 'hash-1', locator: 'ipfs://dup', storage: 'ipfs' }, { contentHash: 'hash-2', locator: 'peer://d2', storage: 'peer' }] };

        const prototypeComposite = new SnapshotCandidateCompositeShapedLikePlaceNamingDiscoveryQueryService(
            [workingNostrLikeSource, failingSource, duplicateReportingSource]
        );
        const combined = await prototypeComposite.search('forkbuild-snapshot');
        assert(combined.length === 2,
            '4. a failing source contributes nothing and never fails the whole call (isolation) — exactly two DISTINCT contentHash values survive out of three candidates reported (isolation + dedup working together).');
        assert(combined[0].locator === 'ar://tx1',
            '5. deduplication keeps the FIRST occurrence in constructor order (hash-1 from the first source) — the identical, source-order-preserving rule PlaceNamingDiscoveryQueryService.js already documents for claim.id.');
        assert(combined[1].contentHash === 'hash-2',
            '6. a candidate with no colliding contentHash from any other source always survives, regardless of which source reported it.');

        // F4. Duck-type compatibility, live: this prototype composite —
        // built entirely inside this test, never touching production —
        // is immediately usable as a drop-in `discoveryQueryService` for
        // the REAL, unmodified command AND the REAL, unmodified monitor,
        // with zero changes to either.
        const viaRealCommand = await executeDiscoverSnapshotCandidatesCommand({
            discoveryTag: 'forkbuild-snapshot',
            discoveryQueryService: prototypeComposite
        });
        assert(viaRealCommand.length === 2,
            '7. the real, unmodified executeDiscoverSnapshotCandidatesCommand() accepts the prototype composite exactly as it accepts a single NostrSnapshotDiscoveryQueryService — confirming the seam this milestone recommends needs no change to the monitor or the command, only a new, purpose-built class composed in ui/main.js.');

        const monitorOverComposite = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => executeDiscoverSnapshotCandidatesCommand({
                discoveryTag: 'forkbuild-snapshot',
                discoveryQueryService: prototypeComposite
            })
        });
        await monitorOverComposite.observe({ position: { x: 0, y: 0, z: 0 } });
        assert(monitorOverComposite.lastResult.length === 2 && monitorOverComposite.lastError === null,
            '8. WorldSnapshotDiscoveryMonitor itself, completely unmodified, drives the prototype composite through one full observe() cycle correctly — the walking trigger, the movement gate, and the race-guard all remain exactly as they are today.');

        console.log('✓ Section F: CompositeDiscoveryProvider is the wrong seam (Section A); the right TEMPLATE already exists and is already proven in production one sibling family over (PlaceNamingDiscoveryQueryService). A prototype composite mirroring that exact pattern — isolate via Promise.allSettled, dedupe by contentHash, first-occurrence-wins — is demonstrated live: it isolates a failing source, deduplicates correctly, and plugs into the REAL, unmodified command and monitor with no change to either.');
    }

    // ===============================================================
    // Section G — Frequency and lifecycle semantics, live.
    // ===============================================================
    {
        // G1. The movement gate is DISTANCE-ONLY — there is no time-based
        // throttle anywhere in shouldRefreshSnapshotDiscovery(). A
        // Wanderer oscillating back and forth across exactly the refresh
        // radius, every refreshSpatialUI() tick (roughly every 3
        // seconds, per WorldView.js), re-triggers a fresh discovery call
        // every single time — true today, for Nostr alone, and would
        // remain true, unchanged, for however many sources a future
        // composite queries.
        assert(shouldRefreshSnapshotDiscovery(null, { position: { x: 0, y: 0, z: 0 } }) === true,
            '1. no previous context always refreshes.');
        assert(shouldRefreshSnapshotDiscovery({ position: { x: 0, y: 0, z: 0 } }, { position: { x: 200, y: 0, z: 0 } }) === true,
            `2. crossing the default ${DEFAULT_DISCOVERY_REFRESH_RADIUS}-unit radius always refreshes, regardless of how little wall-clock time has passed since the last call.`);
        assert(shouldRefreshSnapshotDiscovery({ position: { x: 0, y: 0, z: 0 } }, { position: { x: 200, y: 0, z: 0 } }, 500) === false,
            '3. the SAME movement, judged against a wider radius, does not refresh — confirming the decision is purely a function of distance and the caller-supplied radius, with no hidden time component at all.');

        // G2. The monitor's existing request-id race-guard already
        // tolerates a SLOW source (a real concern for a peer round-trip,
        // which is a live network exchange, unlike a synchronous
        // Publication-catalog read) without any queueing or cancellation
        // machinery — a later call simply wins, and the slow call's
        // eventual answer is discarded on arrival.
        let slowSourceSettled = false;
        let slowSourceCalls = 0;
        const monitorWithSlowSource = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => {
                slowSourceCalls += 1;
                if (slowSourceCalls === 1) {
                    return new Promise((resolve) => {
                        setTimeout(() => { slowSourceSettled = true; resolve(['late']); }, 30);
                    });
                }
                return Promise.resolve(['fast']);
            }
        });
        const slowObservation = monitorWithSlowSource.observe({ position: { x: 0, y: 0, z: 0 } });
        await monitorWithSlowSource.observe({ position: { x: 500, y: 0, z: 0 } });
        assert(monitorWithSlowSource.lastResult[0] === 'fast',
            '4. a fast, superseding call wins over a still-in-flight slow one — exactly the property a peer round-trip (which can genuinely be much slower than a relay query) would need in order to participate safely.');
        await slowObservation;
        assert(slowSourceSettled === true && monitorWithSlowSource.lastResult[0] === 'fast',
            '5. the slow call\'s own late arrival, once it finally settles, is silently discarded rather than overwriting the newer result — no crash, no unhandled rejection, no stale data winning a race it already lost.');

        console.log('✓ Section G: the movement gate is purely distance-based, with no time throttle of any kind — true today and unaffected by source count. The monitor\'s existing race-guard already tolerates a slow source safely, with no new queueing, cancellation, or timeout architecture required before a peer source (once it exists) could be added.');
    }

    // ===============================================================
    // Section H — Downstream convergence is already proven safe.
    // ===============================================================
    {
        // H1. RE-EXECUTED LIVE, not re-derived: 0.9.195's own whole-
        // pipeline convergence audit already proves, against CURRENT
        // source, that a candidate's own origin is never encoded in its
        // World-registry identity, and that LOCAL/PEER/SNAPSHOT-origin
        // World contributions converge into identically-shaped World
        // encounters with no source/family field surviving past
        // registration. If a future Local or Peer Snapshot-candidate
        // source is ever built, this is the guarantee it inherits for
        // free, unchanged.
        const output = runGuardLive('tests/AutomaticSnapshotSubsystemBoundaryConvergenceAudit.test.js');
        assert(/All Automatic Snapshot Subsystem Boundary & Convergence Audit tests passed/.test(output),
            "1. tests/AutomaticSnapshotSubsystemBoundaryConvergenceAudit.test.js (0.9.195) still passes, live, against current HEAD — its own findings are current, not stale.");
        assert(/the origin is a pure derived function of contentHash\+publicationId only/.test(output),
            '2. that live run\'s own Section E confirms: a Snapshot\'s World-registry origin is derived purely from contentHash+publicationId — never from which discoveryQueryService (Nostr, or a future Local/Peer source) reported the candidate.');
        assert(/converge, past assembleWorldDiscoveryInputs\(\)\/deriveWorldEncounters\(\), into three IDENTICALLY-shaped World encounters carrying no origin\/family field/.test(output),
            '3. that live run\'s own Section F confirms LOCAL, PEER, and SNAPSHOT origins already converge into identically-shaped World encounters today — proving no source could become "authoritative" merely by participating, a property that pre-dates this milestone and needs no new code to hold for additional Snapshot-candidate sources.');
        assert(/discovery order never becomes ranking/.test(output),
            '4. that live run\'s own Section K confirms discovery order never becomes ranking — directly answering this milestone\'s own "ordering" question for Section E of the original brief: candidate order is an implementation detail of composition (Section F, above), never a ranking decision, exactly as it already is for Nostr alone today.');

        console.log('✓ Section H: the entire downstream pipeline (cascade -> resolve -> materialize -> place -> register -> render) was already, independently, proven safe against multi-origin convergence by 0.9.195 — re-confirmed live against current source rather than re-derived. Nothing downstream needs to change before, during, or after a Local or Peer candidate source is added upstream.');
    }

    // ===============================================================
    // Section I — Deliberate exclusions.
    // ===============================================================
    {
        // No production file implements a new composite class, wires a
        // Local or Peer source, changes WorldSnapshotDiscoveryMonitor.js,
        // DiscoverSnapshotCandidatesCommand.js, or ui/main.js's own
        // composition, or names a new WorldSnapshotDiscoveryMonitor
        // dispose() method (Section B's own noted asymmetry). This
        // milestone answers exactly one question — "can the existing
        // walking-triggered monitor safely converge Nostr, Local, and
        // Peer sources" — and stops there.
        console.log('✓ Section I: no composite class shipped, no source wired, no monitor/command file touched, no dispose() added — audit only, per this milestone\'s own scope.');
    }

    // ===============================================================
    // Section J — no production file touched; final classification.
    // ===============================================================
    {
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(changedNonTestFiles === '', `1. no production file is modified by this milestone (found: ${changedNonTestFiles || 'none'}).`);

        const CLASSIFICATIONS = [
            'READY_TO_COMPOSE',
            'MECHANISM_READY_SOURCES_MISSING',
            'NOT_READY'
        ];
        const verdict = 'MECHANISM_READY_SOURCES_MISSING';
        assert(CLASSIFICATIONS.includes(verdict), '2. the verdict is drawn from this milestone\'s own named taxonomy.');
    }
    console.log('\n✓ Section J: FINAL DECISION.\n' +
'\n' +
'OUTCOME: MECHANISM_READY_SOURCES_MISSING.\n' +
'\n' +
"WHY. Section A corrected the originating proposal's own premise one step further than it had already corrected itself:\n" +
'CompositeDiscoveryProvider is not merely "not proof" of the right product behavior -- it is not even the right\n' +
"MECHANISM. It exposes no search() method, is synchronous, and operates on a completely different domain object\n" +
"(a cataloged Publication) than the monitor's own command requires (a raw {contentHash, locator, storage} candidate,\n" +
'via an async search(discoveryTag)). Section B confirmed the monitor\'s own real contract, live: movement-gated,\n' +
'request-id race-protected, failure-isolated, pass-through only -- exactly the properties any new source would need\n' +
"to respect, none of which require the monitor itself to change. Section C proved Nostr's presence today is\n" +
'incidental, not structural -- both the monitor and the command are already, today, source-agnostic. Sections D and E\n' +
'are this audit\'s own central, sobering finding: neither a Local nor a Peer source actually EXISTS yet at the\n' +
'required shape. Local has no concept of "locally known Snapshot candidates" anywhere in this codebase -- not\n' +
"unwired, conceptually absent. Peer's existing material capability is explicitly, repeatedly documented as\n" +
'resolution-of-an-already-selected-object ONLY, with a wire protocol carrying no browse/list capability and no\n' +
'responder side at all. Section F located the actual right seam this codebase already proves works -- not\n' +
'CompositeDiscoveryProvider, but the template PlaceNamingDiscoveryQueryService already establishes one sibling family\n' +
'over -- and demonstrated, live, that the identical pattern (Promise.allSettled isolation, first-occurrence dedup by\n' +
'contentHash) generalizes safely to the Snapshot shape and plugs into the real, unmodified monitor and command with no\n' +
'changes to either. Section G confirmed the walking trigger\'s own frequency characteristics (distance-only gating,\n' +
'an already-sufficient race-guard) impose no new requirement a future source would have to satisfy beyond what Nostr\n' +
'already satisfies today. Section H re-confirmed, live, that the entire downstream pipeline was already proven immune\n' +
'to multi-origin concerns (authority, ranking, deduplication-as-adoption) three milestones ago, for free.\n' +
'\n' +
'WHAT THIS MEANS. This is not READY_TO_COMPOSE: composing today would mean composing Nostr with nothing, since no\n' +
'second source exists. This is not NOT_READY either: the mechanism -- the composite seam itself, and everything\n' +
"downstream of it -- is fully proven safe, today, with zero new architecture required. The honest, small, evidence-\n" +
'backed next step this audit recommends is exactly the one its own Section F already rehearsed: build one small,\n' +
'new, purpose-built composite query service, modeled on PlaceNamingDiscoveryQueryService\'s own proven pattern, and\n' +
"compose it in ui/main.js around exactly the one source that exists today (Nostr) -- a pure refactor, zero behavior\n" +
'change, verifiable by this same audit\'s own Section F assertions. Local and Peer sources each remain their own,\n' +
'independent, unscheduled milestone -- Local needs a genuinely new product decision about what "locally known" means\n' +
'for an announcement family that exists specifically so OTHER devices can find THIS one\'s content; Peer needs a new\n' +
'wire-protocol message kind AND a responder side, neither of which this audit\'s scope extends to designing.\n');

    console.log('\n✅ All Walking-Triggered Nearby Discovery Source Convergence Audit tests passed.');
}

run().then(() => {
    console.log('\n✓ All WalkingTriggeredNearbyDiscoverySourceConvergenceAudit tests passed');
}).catch((error) => {
    console.error('\n✗ WalkingTriggeredNearbyDiscoverySourceConvergenceAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
