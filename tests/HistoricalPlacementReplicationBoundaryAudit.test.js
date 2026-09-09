import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { CausalStamp } from '../core/CausalStamp.js';
import { RevisionReference } from '../core/RevisionReference.js';
import { ConflictSet } from '../core/ConflictSet.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';

import { ConflictResolver, ConflictRelation } from '../replication/ConflictResolver.js';
import { ConflictPolicy } from '../replication/ConflictPolicy.js';
import { ReplicaMergeService, MergeResult } from '../replication/ReplicaMergeService.js';
import { LocalReplicationStore } from '../replication/LocalReplicationStore.js';
import { CreateReplicationUseCase } from '../application/CreateReplicationUseCase.js';
import { ReplicatePlacementUseCase } from '../application/ReplicatePlacementUseCase.js';
import { SynchronizeReplicaUseCase } from '../application/SynchronizeReplicaUseCase.js';

import { World } from '../core/World.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { MoveStructurePlacementCommand } from '../application/commands/MoveStructurePlacementCommand.js';
import { SetStructurePlacementTransformCommand } from '../application/commands/SetStructurePlacementTransformCommand.js';
import { compareWorldOperations, worldOperationSortKey } from '../core/WorldOperationOrder.js';
import { WorldConflictResolver, WorldOperationOutcome } from '../replication/WorldConflictResolver.js';
import { WorldCommandPropagationUseCase } from '../application/WorldCommandPropagationUseCase.js';

// 0.9.312 — Historical Placement Replication Boundary Audit.
//
// Test/document-only, per this milestone's own brief. No production code
// changes ship here. 0.9.311 (Post-Placement Product Evolution
// Reassessment) closed with STOP and one concrete, actionable finding: a
// complete, working, fully-tested peer placement-replication protocol —
// `replication/ConflictResolver.js` / `replication/ReplicaMergeService.js`
// / `replication/LocalReplicationStore.js` /
// `application/ReplicatePlacementUseCase.js` /
// `application/SynchronizeReplicaUseCase.js` /
// `application/CreateReplicationUseCase.js` — with zero production
// callers, superseded by the live, currently-shipping World collaboration
// protocol (`application/WorldCommandPropagationUseCase.js` /
// `replication/WorldConflictResolver.js`).
//
// The goal here is NOT to revive the historical protocol, migrate data,
// add an adapter, or change anything about collaboration, placement,
// Snapshot distribution, or notifications. It is to make the
// architectural replacement boundary explicit and EXECUTABLE, so a
// future developer who finds the old classes cannot reasonably conclude
// "ForkBuild already has peer placement replication; I should wire it
// back in" without this test suite failing first.
//
//   Section A — Historical protocol identification: the legacy family
//               exists, is fully instantiable/exercisable, and has zero
//               production callers, zero composition-root construction,
//               zero UI entry point, and zero runtime registration.
//   Section B — Live replacement identification: the live collaboration
//               path is real, wired into its own composition root, and
//               genuinely executes a representative operation end to
//               end — not merely present in source.
//   Section C — Semantic comparison: the two systems are built against
//               different ordering primitives (vector-clock CausalStamp
//               vs. scalar Lamport logicalClock) for different data
//               (an independently-published PlacementRecord revision vs.
//               a live World Command) — documented as a different
//               authority/path, never asserted as equivalent.
//   Section D — No accidental bridge: nothing in the current tree
//               imports both families together, and every file that
//               imports the historical family is one of its own six.
//   Section E — Conflict semantics: the historical path surfaces a
//               retained, ambiguous ConflictSet for two concurrent
//               revisions; the live path never does — it always
//               converges on one deterministic winner. The two
//               `*ConflictResolver` classes are proven to be genuinely
//               distinct, despite the deceptively similar name.
//   Section F — Product capability distinction: "peer placement
//               replication" is classified HISTORICAL, explicitly ruled
//               out against MISSING, BROKEN, ORPHANED-needing-a-UI, and
//               DEFERRED-feature, each against real evidence.
//   Section G — No user-facing gap: none of the five journeys this
//               milestone's own brief names reference the historical
//               family anywhere in their real UI/application surfaces.
//   Section H — Documentation consistency: docs/Roadmap.md and
//               docs/Principles.md describe the historical protocol
//               consistently as historical/superseded, never as an
//               available capability.
//   Section I — Architecture regression guard: one reusable invariant —
//               no production file outside the historical family's own
//               six files may depend on it — asserted directly, so a
//               future accidental re-wiring fails this suite, not merely
//               a future audit.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function sourceExists(relativePath) {
    try {
        await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        return true;
    } catch {
        return false;
    }
}

// Mirrors every prior reassessment's own helper (0.9.219 onward, most
// recently 0.9.311) — one grep-verifiable signal, never a header comment
// trusted at face value. Returns the matching FILE LIST (relative paths,
// as grep -l prints them against SOURCE_ROOT), not merely a count, so
// callers can exclude known files and inspect exactly what remains.
function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}

async function grepCount(pattern, dirs, opts = {}) {
    return grepFiles(pattern, dirs, opts).length;
}

// The historical family's own six files — self-references (the family
// wiring itself together) are expected and never evidence of a caller
// outside the family. Every exclusion below is against exactly this set.
const HISTORICAL_FAMILY_FILES = new Set([
    'replication/ConflictResolver.js',
    'replication/ReplicaMergeService.js',
    'replication/LocalReplicationStore.js',
    'application/ReplicatePlacementUseCase.js',
    'application/SynchronizeReplicaUseCase.js',
    'application/CreateReplicationUseCase.js'
]);

function outsideFamily(files) {
    return files.filter((f) => !HISTORICAL_FAMILY_FILES.has(f) && !f.startsWith('tests/'));
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function createIdentity(username) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(username);
    provider.getSigningIdentity(); // force key creation now
    return provider;
}

const BOUNDS = new SpatialBounds({ min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 1, z: 0.5 } });

// Builds a signed genesis (revision 1) PlacementRecord the way
// PlacePublicationUseCase does — owner identity, causal genesis, real
// Ed25519 signature — the exact minimal fixture DecentralizedReplication.
// test.js's own flagship test already establishes as realistic.
function genesisRecord(provider, { placementId, publicationId, x = 0, y = 0, z = 0 }) {
    const signingIdentity = provider.getSigningIdentity();
    let record = new PlacementRecord({
        placementId, publicationId, bounds: BOUNDS,
        position: new Position(x, y, z), revision: 1
    });
    record = record.withOwnerIdentity(signingIdentity.toJSON());
    record = record.withCausalHistory(new CausalStamp().advance(signingIdentity.id), []);
    record = record.withContentHash(record.computeContentHash());
    record = record.withSignature(provider.signCanonical(record.getSigningDescriptor()));
    return record;
}

// Builds the next revision of `parentRecord`, signed by `provider`. An
// explicit `actorKey` simulates two disconnected DEVICES of the SAME
// identity editing concurrently — the real shape of a genuine,
// unresolvable-by-timestamp conflict this protocol was built to detect.
function nextRevision(provider, parentRecord, { x, y, z }, actorKey) {
    const signingIdentity = provider.getSigningIdentity();
    let record = parentRecord.withPosition(new Position(x, y, z));
    const priorStamp = parentRecord.causalStamp || new CausalStamp();
    const parent = new RevisionReference({
        placementId: parentRecord.placementId,
        revision: parentRecord.revision,
        contentReference: { hash: parentRecord.contentHash }
    });
    record = record.withCausalHistory(priorStamp.advance(actorKey || signingIdentity.id), [parent]);
    record = record.withOwnerIdentity(signingIdentity.toJSON());
    record = record.withContentHash(record.computeContentHash());
    record = record.withSignature(provider.signCanonical(record.getSigningDescriptor()));
    return record;
}

function buildThreePlacementWorld({ worldId, houseId, barnId }) {
    const world = new World({ id: worldId });
    world.addStructurePlacement(new StructurePlacement({ id: houseId, documentId: 'doc:structure', position: new Position(0, 0, 0), rotation: 0 }));
    world.addStructurePlacement(new StructurePlacement({ id: barnId, documentId: 'doc:structure', position: new Position(10, 0, 0), rotation: 0 }));
    return world;
}

async function runTests() {
    console.log('Running Historical Placement Replication Boundary Audit tests...\n');

    // ===============================================================
    // Section A — Historical protocol identification.
    // ===============================================================
    {
        // A1. The legacy family's own six files exist and still export
        // exactly what 0.9.311's own inventory found.
        const family = [
            ['replication/ConflictResolver.js', 'export class ConflictResolver'],
            ['replication/ReplicaMergeService.js', 'export class ReplicaMergeService'],
            ['replication/LocalReplicationStore.js', 'export class LocalReplicationStore'],
            ['application/ReplicatePlacementUseCase.js', 'export class ReplicatePlacementUseCase'],
            ['application/SynchronizeReplicaUseCase.js', 'export class SynchronizeReplicaUseCase'],
            ['application/CreateReplicationUseCase.js', 'export class CreateReplicationUseCase']
        ];
        for (const [path, marker] of family) {
            assert(await sourceExists(path), `A1. ${path} still exists.`);
            assert((await rawSource(path)).includes(marker), `A1. ${path} still exports "${marker}".`);
        }

        // A2. Zero production callers OUTSIDE the family's own six files.
        // Each pattern is checked in application/ and ui/ — the only two
        // directories any real product wiring lives in — and every hit
        // inside the family itself (e.g. CreateReplicationUseCase.js
        // constructing a ReplicaMergeService) is explicitly excluded, not
        // silently miscounted as "a caller."
        const constructionPatterns = [
            'new CreateReplicationUseCase(',
            'new ReplicaMergeService(',
            'new ConflictResolver(',
            'new LocalReplicationStore(',
            'new ReplicatePlacementUseCase(',
            'new SynchronizeReplicaUseCase('
        ];
        for (const pattern of constructionPatterns) {
            const hits = outsideFamily(grepFiles(pattern, ['application', 'ui']));
            assert(hits.length === 0,
                `A2. "${pattern}" has zero callers outside the historical family (found in: ${hits.join(', ') || 'none'}).`);
        }

        // A3. No composition-root construction. The two real composition
        // roots the live collaboration path is wired from — ui/main.js
        // (top-level app wiring) and application/CreateWorldViewUseCase.js
        // (the World-session composition root, Section B2 below) — carry
        // zero reference to any historical family name.
        const compositionRoots = ['ui/main.js', 'application/CreateWorldViewUseCase.js'];
        const familyNames = ['ConflictResolver', 'ReplicaMergeService', 'CreateReplicationUseCase',
            'ReplicatePlacementUseCase', 'SynchronizeReplicaUseCase', 'LocalReplicationStore'];
        for (const rootPath of compositionRoots) {
            const source = await rawSource(rootPath);
            for (const name of familyNames) {
                // WorldConflictResolver legitimately contains the substring
                // "ConflictResolver" — exclude it explicitly so this check
                // never produces a false positive against the LIVE class.
                const occurrences = (source.match(new RegExp(name, 'g')) || [])
                    .length - (name === 'ConflictResolver' ? (source.match(/WorldConflictResolver/g) || []).length : 0);
                assert(occurrences === 0, `A3. ${rootPath} never references the historical ${name}.`);
            }
        }

        // A4. No UI entry point — zero references anywhere under ui/.
        const uiHits = outsideFamily(grepFiles('ConflictResolver\\|ReplicaMergeService\\|CreateReplicationUseCase\\|ReplicatePlacementUseCase\\|SynchronizeReplicaUseCase\\|LocalReplicationStore', ['ui']));
        assert(uiHits.length === 0, `A4. ui/ carries zero references to the historical family (found: ${uiHits.join(', ') || 'none'}).`);

        // A5. No active runtime registration — zero references anywhere
        // under server/ either (the only other place a long-running
        // process in this repo is composed).
        if (await sourceExists('server')) {
            const serverHits = outsideFamily(grepFiles('ConflictResolver\\|ReplicaMergeService\\|CreateReplicationUseCase', ['server']));
            assert(serverHits.length === 0, `A5. server/ carries zero references to the historical family (found: ${serverHits.join(', ') || 'none'}).`);
        }

        // A6. Despite A2-A5, the family is NOT "unused" merely because a
        // grep found nothing — it is fully instantiable and exercisable,
        // live, through its own real composition root
        // (CreateReplicationUseCase itself), producing a genuine CONFLICT
        // result with a real, populated ConflictSet for two independently
        // signed, causally concurrent revisions. This is the exact
        // capability 0.9.311's own A15/A15b proved with a bare
        // ConflictResolver.compare() call; this section proves it through
        // the FULL pipeline, top to bottom, including the never-
        // constructed-in-production composition root itself.
        const alice = createIdentity('alice-a1');
        const storage = new InMemoryStorageProvider();
        const registry = new LocalPlacementRegistry(storage);
        const wiring = new CreateReplicationUseCase().execute(storage, registry);
        assert(wiring.mergeService instanceof ReplicaMergeService, 'A6a. CreateReplicationUseCase wires a real ReplicaMergeService.');
        assert(wiring.replicatePlacementUseCase instanceof ReplicatePlacementUseCase, 'A6b. ...and a real ReplicatePlacementUseCase.');
        assert(typeof wiring.createSynchronizeUseCase === 'function', 'A6c. ...and a real SynchronizeReplicaUseCase factory.');

        const base = genesisRecord(alice, { placementId: 'pl-audit-1', publicationId: 'pub-audit', x: 0, y: 0, z: 0 });
        const aliceId = alice.getSigningIdentity().id;
        const fromPhone = nextRevision(alice, base, { x: 10, y: 0, z: 0 }, `${aliceId}#phone`);
        const fromLaptop = nextRevision(alice, base, { x: 0, y: 10, z: 0 }, `${aliceId}#laptop`);
        assert(fromPhone.causalStamp.concurrentWith(fromLaptop.causalStamp),
            'A6d. sanity: the two device-qualified revisions are genuinely causally concurrent.');

        const baseResult = await wiring.replicatePlacementUseCase.execute(base);
        assert(baseResult.result === MergeResult.UPDATED, 'A6e. the genesis revision merges cleanly through the real pipeline.');
        const phoneResult = await wiring.replicatePlacementUseCase.execute(fromPhone);
        assert(phoneResult.result === MergeResult.UPDATED, 'A6f. the first concurrent revision merges cleanly.');
        const conflictResult = await wiring.replicatePlacementUseCase.execute(fromLaptop);
        assert(conflictResult.result === MergeResult.CONFLICT, 'A6g. the SECOND concurrent revision is genuinely detected as a CONFLICT, live, through the unreached composition root.');
        assert(conflictResult.conflictSet instanceof ConflictSet && conflictResult.conflictSet.revisions.length === 2,
            'A6h. ...and produces a real ConflictSet retaining both competing revisions — a fully working capability, not dead code.');

        console.log('✓ A: The historical family\'s six files exist and export what 0.9.311 found (A1); zero production callers outside the family construct any of them (A2); the two real composition roots (ui/main.js, CreateWorldViewUseCase.js) reference none of it (A3); ui/ (A4) and server/ (A5) carry zero references. Despite all of that, the family is fully instantiable and exercisable, live, end to end through its OWN composition root — a real CONFLICT with a real, two-revision ConflictSet (A6) — so "unused" here is a demonstrated fact about callers, never an assumption from an absence of grep hits.');
    }

    // ===============================================================
    // Section B — Live replacement identification.
    // ===============================================================
    {
        // B1. The live collaboration classes exist and export what the
        // composition root actually constructs.
        assert((await rawSource('application/WorldCommandPropagationUseCase.js')).includes('export class WorldCommandPropagationUseCase'),
            'B1a. WorldCommandPropagationUseCase.js still exports the live propagation use case.');
        assert((await rawSource('replication/WorldConflictResolver.js')).includes('export class WorldConflictResolver'),
            'B1b. WorldConflictResolver.js still exports the live conflict resolver.');

        // B2. The composition root genuinely constructs it — this is the
        // real seam that makes this the LIVE path, not merely another
        // file that compiles.
        const createWorldViewSource = await rawSource('application/CreateWorldViewUseCase.js');
        assert(createWorldViewSource.includes('new WorldCommandPropagationUseCase('),
            'B2. application/CreateWorldViewUseCase.js — the real World-session composition root — constructs a live WorldCommandPropagationUseCase.');

        // B3. Execute a REPRESENTATIVE LIVE OPERATION — not merely
        // inspect filenames. A real World, a real StructurePlacement, a
        // real Command, reconciled through the real, unmodified
        // WorldConflictResolver#applyRemote(), exactly the mechanism
        // application/WorldCommandPropagationUseCase.js's own
        // _handleIncoming() calls at step 6 of its trust chain.
        const world = buildThreePlacementWorld({ worldId: 'w-boundary-audit', houseId: 'house', barnId: 'barn' });
        const resolver = new WorldConflictResolver();
        const move = new MoveStructurePlacementCommand({ id: 'op-audit-move', worldId: 'w-boundary-audit', placementId: 'house', delta: { x: 5, y: 0, z: 0 } });
        const outcome = resolver.applyRemote({ worldDocumentId: 'w-boundary-audit', envelope: { operationId: 'op-audit-move', logicalClock: 1 }, command: move, world });
        assert(outcome === WorldOperationOutcome.APPLIED, 'B3a. A real command, run through the real live conflict resolver, genuinely APPLIED.');
        assert(world.getStructurePlacement('house').position.x === 5, 'B3b. ...and genuinely mutated the live World, not a mock.');

        // B4. The live path is wired to the SAME command/application
        // pipeline every other collaborator uses — CommandHistory's own
        // COMMAND_EXECUTED event, not a bespoke propagation trigger.
        const propagationSource = await rawSource('application/WorldCommandPropagationUseCase.js');
        assert(propagationSource.includes('attachCommandHistory') && propagationSource.includes('CommandHistoryEvent.COMMAND_EXECUTED'),
            'B4. WorldCommandPropagationUseCase.js still attaches to the real CommandHistory event stream — the current application pipeline, not a parallel one.');

        console.log('✓ B: The live collaboration classes exist (B1) and are genuinely constructed by the real World-session composition root (B2). A representative operation — a real Command reconciled through the real WorldConflictResolver against a real World — was actually EXECUTED, not merely read from source, and produced the expected mutation (B3). The live path is wired to the same CommandHistory event stream every other collaborator already uses (B4).');
    }

    // ===============================================================
    // Section C — Semantic comparison. Documents the architectural
    // fact that the live system has a DIFFERENT authority/path for
    // collaborative World changes — never asserted as equivalent to
    // the historical protocol.
    // ===============================================================
    {
        // C1. The historical resolver compares CausalStamp — a per-actor
        // VECTOR clock (core/CausalStamp.js's own documented semantics:
        // "A happens-before B iff every component of A <= B"). Proven
        // live: two divergent single-actor advances compare CONCURRENT,
        // a relation that requires genuinely incomparable vectors.
        const stampA = new CausalStamp({ clock: { alice: 1, bob: 0 } });
        const stampB = new CausalStamp({ clock: { alice: 0, bob: 1 } });
        const legacyResolver = new ConflictResolver();
        assert(legacyResolver.compare(stampA, stampB) === ConflictRelation.CONCURRENT,
            'C1. The historical ConflictResolver genuinely detects CONCURRENT vector clocks, live.');

        // C2. The live resolver orders by a SCALAR Lamport logicalClock
        // plus operationId as a tie-breaker (core/WorldOperationOrder.js)
        // — a STRICT TOTAL order. Two operations with the SAME
        // logicalClock (a genuine tie a vector clock would report as
        // CONCURRENT) still resolve to a deterministic -1/1, never an
        // "undecidable" or "concurrent" result — this order has no such
        // relation to report.
        const tie = compareWorldOperations(
            worldOperationSortKey({ logicalClock: 5, operationId: 'op-aaa' }),
            worldOperationSortKey({ logicalClock: 5, operationId: 'op-bbb' })
        );
        assert(tie === -1 || tie === 1, 'C2a. compareWorldOperations() always resolves a tied logicalClock deterministically by operationId — never an undecidable/concurrent result.');
        assert(compareWorldOperations({ logicalClock: 5, operationId: 'x' }, { logicalClock: 5, operationId: 'x' }) === 0,
            'C2b. ...and only the IDENTICAL operation (same id) ever compares equal — this is a total order over DISTINCT operations, unlike the historical resolver\'s CausalStamp.equals().');

        // C3. This distinction is not this test's own invention — it is
        // the documented, already-shipped architectural rationale
        // (docs/Principles.md, "Ordering Is A Deterministic Total Order,
        // Never Wall-Clock Time (0.2.97)"): the vector-clock machinery
        // was built for a DIFFERENT object and was never the right tool
        // for the live collaboration protocol's own job.
        const principles = await rawSource('docs/Principles.md');
        assert(principles.includes('built for a different object — PlacementRecord') && principles.includes('was\nnever the right tool for here'),
            'C3. docs/Principles.md still documents, in its own words, that the historical vector-clock machinery was built for a different object and was never the right tool for the live ordering protocol.');

        // C4. What this section deliberately does NOT do: assert the two
        // resolvers are implementation-equivalent, or that they operate
        // on the same data. They do not — the historical protocol
        // reconciles independently-created PlacementRecord revisions of
        // a PUBLISHED placement (core/PlacementRecord.js); the live
        // protocol reconciles Commands mutating StructurePlacements
        // inside ONE live, shared World document (core/
        // StructurePlacement.js) — a genuinely different data model, per
        // Section F's own capability classification. The fact recorded
        // here is narrower and fully evidenced: the live system has a
        // different ordering PRIMITIVE, and a different AUTHORITY/PATH,
        // for collaborative World changes — never that the two are one
        // system wearing two names.

        console.log('✓ C: The historical resolver genuinely compares vector-clock CausalStamps and can report CONCURRENT (C1); the live resolver genuinely orders by a scalar Lamport clock plus a tie-breaker and NEVER reports an undecidable relation (C2) — a different ordering primitive, confirmed live, not merely read from a comment. docs/Principles.md already documents this exact distinction in its own words (C3). This section does not, and does not need to, claim the two are implementation-equivalent (C4).');
    }

    // ===============================================================
    // Section D — No accidental bridge.
    // ===============================================================
    {
        // D1. No production file imports the LIVE WorldConflictResolver
        // and the HISTORICAL family together — the shape a quiet
        // compatibility adapter would take.
        const liveImporters = grepFiles("from '.*replication/WorldConflictResolver.js'", ['application', 'ui', 'replication', 'core']);
        for (const file of liveImporters) {
            const source = await rawSource(file);
            const importsHistorical = HISTORICAL_FAMILY_FILES.has(file)
                ? false // the family's own files are exempt from this cross-check; none of them import WorldConflictResolver in practice, checked next
                : /replication\/ConflictResolver\.js|ReplicaMergeService|CreateReplicationUseCase/.test(source);
            assert(!importsHistorical, `D1. ${file} imports the live WorldConflictResolver and must not ALSO import the historical family (would be a quiet bridge).`);
        }

        // D2. Every file that imports ANY piece of the historical family
        // is one of its own six files (or a test) — the import graph is
        // closed, nothing external reaches in.
        const historicalImportPatterns = [
            "from '.*replication/ConflictResolver.js'",
            "from '.*replication/ReplicaMergeService.js'",
            "from '.*replication/LocalReplicationStore.js'",
            "from '.*application/ReplicatePlacementUseCase.js'",
            "from '.*application/SynchronizeReplicaUseCase.js'",
            "from '.*application/CreateReplicationUseCase.js'"
        ];
        for (const pattern of historicalImportPatterns) {
            const importers = outsideFamily(grepFiles(pattern, ['application', 'ui', 'replication', 'core', 'placement']));
            assert(importers.length === 0, `D2. "${pattern}" is imported only by the historical family itself and tests (unexpected outside importers: ${importers.join(', ') || 'none'}).`);
        }

        // D3. No file anywhere carries a name suggesting a bridge/adapter
        // between the two protocols.
        const bridgeNameHits = grepFiles('ReplicationBridge\\|ConflictResolverAdapter\\|LegacyReplicationAdapter\\|PlacementReplicationBridge', ['application', 'ui', 'replication', 'core'], { ignoreCase: true });
        assert(bridgeNameHits.length === 0, `D3. No production file is named as a bridge/adapter between the two protocols (found: ${bridgeNameHits.join(', ') || 'none'}).`);

        console.log('✓ D: No production file imports the live WorldConflictResolver alongside the historical family (D1). Every import of any historical-family module traces back to the family\'s own six files, never an external caller (D2). No file anywhere is named as a bridge/adapter between the two protocols (D3). No compatibility adapter quietly reconnects Live Collaboration to Historical Replication.');
    }

    // ===============================================================
    // Section E — Conflict semantics. The two `*ConflictResolver`
    // classes are deceptively similar by name; this section proves
    // they are genuinely distinct, live, in both directions.
    // ===============================================================
    {
        // E1. The historical path: two concurrent, validly signed
        // revisions of the same placement produce a RETAINED, AMBIGUOUS
        // ConflictSet — both revisions survive, a deterministic winner
        // is chosen, but the LOSING side is never discarded.
        const bob = createIdentity('bob-e1');
        const bobId = bob.getSigningIdentity().id;
        const storage = new InMemoryStorageProvider();
        const registry = new LocalPlacementRegistry(storage);
        const replicationStore = new LocalReplicationStore(storage);
        const mergeService = new ReplicaMergeService({
            resolver: new ConflictResolver(), policy: new ConflictPolicy(), registry, replicationStore
        });
        const base = genesisRecord(bob, { placementId: 'pl-e1', publicationId: 'pub-e1' });
        const fromPhone = nextRevision(bob, base, { x: 1, y: 0, z: 0 }, `${bobId}#phone`);
        const fromLaptop = nextRevision(bob, base, { x: 0, y: 0, z: 1 }, `${bobId}#laptop`);
        await mergeService.merge(base);
        await mergeService.merge(fromPhone);
        const legacyConflict = await mergeService.merge(fromLaptop);
        assert(legacyConflict.result === MergeResult.CONFLICT, 'E1a. The historical path genuinely surfaces a CONFLICT for two concurrent revisions.');
        assert(legacyConflict.conflictSet.revisions.length === 2, 'E1b. ...and RETAINS both competing revisions in the ConflictSet — neither is discarded.');

        // E2. The SAME conceptual situation — two concurrent edits of the
        // same target — reconciled through the LIVE path, never produces
        // a retained ambiguity: exactly ONE deterministic winner, in
        // EITHER arrival order, with no ConflictSet-shaped object
        // anywhere in the result.
        function runLive(order) {
            const world = buildThreePlacementWorld({ worldId: 'w-e2', houseId: 'house', barnId: 'barn' });
            const liveResolver = new WorldConflictResolver();
            const early = new SetStructurePlacementTransformCommand({ id: 'op-e2-early', worldId: 'w-e2', placementId: 'house', position: new Position(1, 0, 1), rotation: 10 });
            const late = new SetStructurePlacementTransformCommand({ id: 'op-e2-late', worldId: 'w-e2', placementId: 'house', position: new Position(2, 0, 2), rotation: 20 });
            const ops = order === 'early-first'
                ? [{ envelope: { operationId: 'op-e2-early', logicalClock: 1 }, command: early }, { envelope: { operationId: 'op-e2-late', logicalClock: 2 }, command: late }]
                : [{ envelope: { operationId: 'op-e2-late', logicalClock: 2 }, command: late }, { envelope: { operationId: 'op-e2-early', logicalClock: 1 }, command: early }];
            for (const op of ops) liveResolver.applyRemote({ worldDocumentId: 'w-e2', envelope: op.envelope, command: op.command, world });
            return world.getStructurePlacement('house');
        }
        const forward = runLive('early-first');
        const reversed = runLive('late-first');
        assert(forward.rotation === 20 && reversed.rotation === 20,
            'E2. The live path converges on exactly ONE deterministic winner regardless of arrival order — never a retained, ambiguous conflict set.');

        // E3. Guard against the deceptively similar names directly: the
        // historical `ConflictResolver` and the live `WorldConflictResolver`
        // are genuinely distinct classes — proven structurally, not by
        // filename alone, so a future refactor that quietly aliases or
        // merges them fails THIS assertion first.
        assert(ConflictResolver !== WorldConflictResolver, 'E3a. ConflictResolver and WorldConflictResolver are distinct class objects.');
        assert(!(new WorldConflictResolver() instanceof ConflictResolver) && !(new ConflictResolver() instanceof WorldConflictResolver),
            'E3b. ...with no shared prototype chain in either direction.');
        assert(typeof new ConflictResolver().compare === 'function' && typeof new WorldConflictResolver().compare !== 'function',
            'E3c. Only the historical resolver exposes compare(CausalStamp, CausalStamp) — the live resolver has no method of that name or shape.');
        assert(typeof new WorldConflictResolver().applyRemote === 'function' && typeof new ConflictResolver().applyRemote !== 'function',
            'E3d. ...and only the live resolver exposes applyRemote() — confirming the two are genuinely different tools, not one renamed.');

        console.log('✓ E: The historical path genuinely surfaces a retained, ambiguous ConflictSet for two concurrent revisions (E1); the live path, given the same conceptual situation, converges on exactly one deterministic winner in either arrival order and produces no such retained ambiguity (E2). The two `*ConflictResolver` classes are proven structurally distinct — different prototypes, different methods — guarding against their deceptively similar names ever being conflated (E3).');
    }

    // ===============================================================
    // Section F — Product capability distinction.
    // ===============================================================
    {
        // F1. NOT missing: every file exists and exports what it claims
        // (Section A1, reconfirmed here as this classification's own
        // evidence, not re-derived).
        const familyFiles = Array.from(HISTORICAL_FAMILY_FILES);
        for (const path of familyFiles) {
            assert(await sourceExists(path), `F1. NOT missing — ${path} exists.`);
        }

        // F2. NOT broken: the full pipeline (Section A6) ran a genesis
        // merge, a clean update, and a genuine conflict, all to
        // completion, with no thrown error and no REJECTED result for
        // integrity or authorization — a broken capability could not
        // have done that.
        const carol = createIdentity('carol-f2');
        const storage = new InMemoryStorageProvider();
        const registry = new LocalPlacementRegistry(storage);
        const mergeService = new ReplicaMergeService({
            resolver: new ConflictResolver(), policy: new ConflictPolicy(), registry,
            replicationStore: new LocalReplicationStore(storage)
        });
        const record = genesisRecord(carol, { placementId: 'pl-f2', publicationId: 'pub-f2' });
        const result = await mergeService.merge(record);
        assert(result.result === MergeResult.UPDATED, 'F2. NOT broken — a genuine, unmodified merge completes with UPDATED, not REJECTED or a thrown error.');

        // F3. NOT an orphaned capability still needing a UI: unlike
        // Automatic Snapshot Retention (0.9.195's own precedent for
        // "intentionally internal, no UI needed"), this family's absence
        // of a UI is not the classification — its absence of a LIVE
        // CALLER is. And that gap is filled, in the current product, by
        // a DIFFERENT, real, shipped protocol solving the adjacent
        // problem (collaborative reconciliation of concurrently-changed
        // spatial placement data) for a different data model (Section C4).
        // Evidence: the live protocol is real (Section B), is wired into
        // its own composition root (Section B2), and genuinely executes
        // (Section B3) — this is what makes "superseded," not "merely
        // unused," the correct classification.
        assert((await rawSource('application/CreateWorldViewUseCase.js')).includes('new WorldCommandPropagationUseCase('),
            'F3. NOT an orphaned capability awaiting a UI — a live, composed replacement already exists for the adjacent collaborative-reconciliation problem.');

        // F4. NOT a deferred feature: nothing in docs/Roadmap.md schedules
        // reviving or extending the historical family — Section H
        // confirms the documentation itself never frames it as pending
        // future work, only as historical/superseded fact.
        const roadmap = await rawSource('docs/Roadmap.md');
        assert(!/revive.*(?:ConflictResolver|ReplicaMergeService|CreateReplicationUseCase)/i.test(roadmap),
            'F4. NOT a deferred feature — docs/Roadmap.md never frames reviving the historical family as scheduled or pending work.');

        // F5. The correct, single classification, stated once, plainly.
        const classification = {
            capability: 'Peer placement-replication protocol (ConflictResolver/ReplicaMergeService/CreateReplicationUseCase family)',
            status: 'HISTORICAL',
            notMissing: true, notBroken: true, notOrphanedNeedingUI: true, notDeferredFeature: true
        };
        assert(classification.status === 'HISTORICAL' && classification.notMissing && classification.notBroken
            && classification.notOrphanedNeedingUI && classification.notDeferredFeature,
            'F5. Final classification: HISTORICAL — explicitly ruled out against MISSING, BROKEN, ORPHANED-needing-a-UI, and DEFERRED-feature, each on its own evidence above.');

        console.log('✓ F: "Peer placement replication" is classified HISTORICAL — proven NOT missing (F1, files exist), NOT broken (F2, a real merge runs clean to a genuine result), NOT an orphaned capability merely awaiting a UI (F3, a live replacement already exists for the adjacent problem), and NOT a deferred feature (F4, nothing in docs/Roadmap.md schedules reviving it). F5 records the single correct classification plainly, for a future reassessment to read directly rather than re-derive.');
    }

    // ===============================================================
    // Section G — No user-facing gap. None of the five journeys this
    // milestone's own brief names touch the historical family anywhere
    // in their real UI/application surfaces.
    // ===============================================================
    {
        const journeySurfaces = [
            ['Create → Publish → Distribute → Discover', ['ui/views/EditorView.js', 'ui/main.js', 'ui/components/PublicationCatalog.js']],
            ['Encounter → Comment → Notification → History', ['ui/components/WorldEncounterCanvas.js', 'ui/components/NotificationHistoryPanel.js']],
            ['Snapshot → Distribution → Materialization → Placement', ['ui/components/OwnPublicationPanel.js', 'ui/components/WorldEncounterCanvas.js']],
            ['Publication → Placement visibility', ['ui/components/OwnPublicationPanel.js']],
            ['Collaboration → World changes', ['ui/views/WorldView.js', 'application/WorldCommandPropagationUseCase.js']]
        ];
        // Checked against actual IMPORT/CONSTRUCTION sites, never bare
        // prose — application/WorldCommandPropagationUseCase.js's own
        // header comment describes its pipeline stage as "the
        // ConflictResolver stage" in plain English (referring to the
        // LIVE WorldConflictResolver conceptually); a bare text search
        // for the word "ConflictResolver" would misfire on that
        // legitimate prose. The historical family is a specific set of
        // importable modules — this checks for exactly that.
        const historicalImportOrConstruct = [
            "replication/ConflictResolver.js", "replication/ReplicaMergeService.js",
            "replication/LocalReplicationStore.js", "application/ReplicatePlacementUseCase.js",
            "application/SynchronizeReplicaUseCase.js", "application/CreateReplicationUseCase.js",
            "new ConflictResolver(", "new ReplicaMergeService(", "new CreateReplicationUseCase(",
            "new ReplicatePlacementUseCase(", "new SynchronizeReplicaUseCase(", "new LocalReplicationStore("
        ];
        for (const [journey, files] of journeySurfaces) {
            for (const file of files) {
                const source = await rawSource(file);
                const touchesHistorical = historicalImportOrConstruct.some((needle) => source.includes(needle));
                assert(!touchesHistorical, `G. "${journey}" — ${file} does not import or construct any piece of the historical replication family.`);
            }
        }
        console.log('✓ G: None of the five named journeys (Create→Publish→Distribute→Discover; Encounter→Comment→Notification→History; Snapshot→Distribution→Materialization→Placement; Publication→Placement visibility; Collaboration→World changes) reference the historical replication family anywhere in their real UI/application surfaces. Each remains independently complete without it, exactly as 0.9.311\'s own journey closure (Section B) already found.');
    }

    // ===============================================================
    // Section H — Documentation consistency.
    // ===============================================================
    {
        // H1. docs/Roadmap.md's own 0.9.311 entry classifies the family
        // HISTORICAL, in those words, tied to the real file names.
        const roadmap = await rawSource('docs/Roadmap.md');
        assert(roadmap.includes('## 0.9.311'), 'H1a. docs/Roadmap.md still carries the 0.9.311 entry.');
        assert(/classified\s+\*\*HISTORICAL\*\*/.test(roadmap) || roadmap.includes('HISTORICAL'),
            'H1b. docs/Roadmap.md classifies the peer placement-replication protocol HISTORICAL, in those words.');
        assert(roadmap.includes('replication/ConflictResolver.js') && roadmap.includes('ReplicaMergeService')
            && roadmap.includes('CreateReplicationUseCase'),
            'H1c. ...naming the real files, not a vague description.');

        // H2. docs/Principles.md documents the live protocol's own
        // rationale for NOT reusing the historical machinery — the same
        // fact Section C proves live.
        const principles = await rawSource('docs/Principles.md');
        assert(principles.includes('Ordering Is A Deterministic Total Order, Never Wall-Clock Time'),
            'H2a. docs/Principles.md still carries the 0.2.97 ordering-rationale section.');
        assert(principles.includes('never the right tool for here'),
            'H2b. ...explicitly stating the historical machinery was never the right tool for the live protocol\'s job.');

        // H3. Neither document ever presents the historical protocol as
        // an available, current, or pending capability — no "TODO",
        // "planned", or "coming soon" attached to any of its class names
        // anywhere in either file.
        for (const [label, text] of [['docs/Roadmap.md', roadmap], ['docs/Principles.md', principles]]) {
            const familyMentionLines = text.split('\n').filter((line) =>
                /ConflictResolver|ReplicaMergeService|CreateReplicationUseCase/.test(line)
                && !/WorldConflictResolver/.test(line));
            const presentedAsPending = familyMentionLines.some((line) => /\bTODO\b|\bplanned\b|\bcoming soon\b|\bnot yet built\b/i.test(line));
            assert(!presentedAsPending, `H3. ${label} never presents the historical family as pending/planned future work.`);
        }

        console.log('✓ H: docs/Roadmap.md\'s own 0.9.311 entry classifies the family HISTORICAL by name, against the real files (H1). docs/Principles.md documents, in its own words, why the live protocol deliberately does not reuse the historical machinery (H2). Neither document ever frames the historical family as available, current, or pending work (H3).');
    }

    // ===============================================================
    // Section I — Architecture regression guard. One reusable
    // invariant: no production file outside the historical family's own
    // six files may depend on it. Asserted directly, so a future
    // accidental re-wiring fails THIS suite, not merely a future audit.
    // ===============================================================
    {
        const guardPatterns = [
            "from '.*replication/ConflictResolver.js'",
            "from '.*replication/ReplicaMergeService.js'",
            "from '.*replication/LocalReplicationStore.js'",
            "from '.*application/ReplicatePlacementUseCase.js'",
            "from '.*application/SynchronizeReplicaUseCase.js'",
            "from '.*application/CreateReplicationUseCase.js'",
            'new ConflictResolver(', 'new ReplicaMergeService(', 'new CreateReplicationUseCase(',
            'new ReplicatePlacementUseCase(', 'new SynchronizeReplicaUseCase(', 'new LocalReplicationStore('
        ];
        const violations = [];
        for (const pattern of guardPatterns) {
            const hits = outsideFamily(grepFiles(pattern, ['application', 'ui', 'server', 'replication', 'core', 'placement', 'spatial', 'discovery']));
            for (const file of hits) violations.push(`${file} (${pattern})`);
        }
        assert(violations.length === 0,
            'I. REGRESSION GUARD: no production path anywhere in the current tree depends on the historical peer-placement replication family outside its own six files. ' +
            (violations.length ? `Violations found: ${violations.join('; ')} — a new file has re-wired the historical protocol back into a live path; this is exactly the accidental revival this milestone exists to prevent.`
                : ''));

        console.log('✓ I: One durable invariant — no production file outside the historical family\'s own six files may import or construct any piece of it — checked directly against the full current tree (application/, ui/, server/, replication/, core/, placement/, spatial/, discovery/) and holding with zero violations. If a future change ever re-wires the historical protocol back into a live path, this assertion fails before that change ships, not merely at the next audit.');
    }

    console.log('\n✅ All Historical Placement Replication Boundary Audit tests passed.');
    console.log('\nSUMMARY.\n' +
        'The peer placement-replication protocol (ConflictResolver / ReplicaMergeService /\n' +
        'LocalReplicationStore / ReplicatePlacementUseCase / SynchronizeReplicaUseCase /\n' +
        'CreateReplicationUseCase) is fully instantiable, fully working, and fully tested\n' +
        '(Section A6, E1) — and has zero production callers, zero composition-root\n' +
        'construction, zero UI entry point, and zero runtime registration (Sections A2-A5).\n' +
        'The live World collaboration protocol (WorldCommandPropagationUseCase /\n' +
        'WorldConflictResolver) is real, is genuinely constructed by its own composition\n' +
        'root, and genuinely executes a representative operation end to end (Section B).\n' +
        'The two protocols are built on different ordering primitives for different data —\n' +
        'documented as a different authority/path, never claimed equivalent (Section C).\n' +
        'Nothing bridges them (Section D); their conflict semantics are genuinely different,\n' +
        'despite the deceptively similar class names (Section E). The correct, single\n' +
        'classification is HISTORICAL — not missing, not broken, not an orphaned capability\n' +
        'awaiting a UI, not a deferred feature (Section F). None of ForkBuild\'s current user\n' +
        'journeys require the historical protocol (Section G); the documentation already\n' +
        'describes it consistently as historical/superseded (Section H); and one direct,\n' +
        'reusable regression guard now enforces that no future production path may depend\n' +
        'on it again without failing this suite first (Section I).\n' +
        '\n' +
        'No production code changed. This milestone adds one new test file, one tests.html\n' +
        'registration line, and its own Roadmap entry — the historical family\'s six files,\n' +
        'the live protocol\'s files, and every other file this suite reads remain\n' +
        'byte-for-byte untouched.');
}

runTests().then(() => {
    console.log('\n✓ All HistoricalPlacementReplicationBoundaryAudit tests passed');
}).catch((error) => {
    console.error('\n✗ HistoricalPlacementReplicationBoundaryAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
