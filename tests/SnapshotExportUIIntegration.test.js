import { readFile } from 'node:fs/promises';

import { BuildPublicationSnapshotTransferPackageUseCase } from '../application/BuildPublicationSnapshotTransferPackageUseCase.js';
import { ImportPublicationSnapshotTransferPackageUseCase } from '../application/ImportPublicationSnapshotTransferPackageUseCase.js';
import { SnapshotContentMaterializationCoordinator } from '../application/SnapshotContentMaterializationCoordinator.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { SnapshotContentTransferOutcome } from '../application/SnapshotContentTransferOutcome.js';
import { validatePublicationSnapshotTransferPackage } from '../application/PublicationSnapshotTransferPackageValidator.js';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import { LocalPublicationCatalog } from '../application/LocalPublicationCatalog.js';
import { DecentralizedPublication } from '../core/DecentralizedPublication.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

// 0.9.215 — Snapshot Export Capability Integration.
//
// 0.9.212's own reassessment found application/
// BuildPublicationSnapshotTransferPackageUseCase.js (0.8.32) — the
// export-side counterpart of application/
// ImportPublicationSnapshotTransferPackageUseCase.js, by its own header's
// own words — fully implemented, exercised by seven separate test files,
// composed nowhere: no coordinator method, no UI action. This milestone
// closes exactly that missing edge — implementation exists, composition
// exists (now), tests exist, UI caller was missing (now exists) — and
// nothing else. It does NOT invent a second Snapshot serialization
// system, does NOT decide how an exported package reaches the user (file
// save, copyable blob, re-import — an explicit, unscheduled follow-on
// question per this milestone's own docs/Roadmap.md entry), and does NOT
// fold export into publish/distribute/announce semantics the existing
// capability never defined.
//
//   Section A — existing capability reachability: the UI invokes the
//               SAME BuildPublicationSnapshotTransferPackageUseCase
//               0.8.32 already built, through a deliberately thin
//               coordinator method, never a duplicate implementation.
//   Section B — correct Snapshot identity: the exported package always
//               corresponds to the explicitly named publicationId — no
//               substitution across two publications' contentHash/
//               locator/storage.
//   Section C — explicit action only: export is never reachable from
//               discovery, materialization, World registration, viewing,
//               comparison, or retention — structural, repository-wide.
//   Section D — failure propagation: an uncataloged/unpossessed
//               publication's real failure reaches the UI as its own
//               distinct error, touching no sibling UI state.
//   Section E — repeated export: BuildPublicationSnapshotTransferPackageUseCase
//               is a pure read with no stored idempotency of its own —
//               two exports of the same publication produce two
//               independent, byte-identical packages; this milestone
//               invents no export-side idempotency at the UI layer.
//   Section F — Snapshot/Publication independence: exporting mutates
//               neither the publication catalog entry nor the content
//               store's own bytes, and the use case itself references
//               none of Publish/Unpublish/Placement/World/Nostr/Arweave.
//   Section G — manual export vs. the automatic Snapshot encounter
//               cascade: no reference to export in either direction.
//   Section H — structural boundary: OwnPublicationPanel.js and
//               WorldView.js never import BuildPublicationSnapshotTransferPackageUseCase.js,
//               SnapshotContentMaterializationCoordinator.js, or a
//               ContentStore directly — only ui/main.js composes them,
//               injecting a plain command function.
//   Section I — FLAGSHIP: Alice exports her own Snapshot; the resulting
//               package validates against Import's own structural
//               validator and a fresh Bob replica genuinely imports it,
//               ending up holding byte-identical content — proving Export
//               and Import are now genuinely symmetric, not merely two
//               independently-tested halves.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function expectRejects(promise, message) {
    let threw = null;
    try { await promise; } catch (e) { threw = e; }
    assert(threw !== null, message);
    return threw;
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function signPublication(identityProvider, fields) {
    let publication = new DecentralizedPublication({ ...fields, publisherIdentity: identityProvider.getSigningIdentity().toJSON() });
    publication = publication.withSignature(identityProvider.signCanonical(publication.getSigningDescriptor()));
    return publication;
}

// A fresh "replica" — its own catalog and content store, mirroring the
// real composition ui/main.js wires (publicationCatalog +
// publicationContentStore, both threaded through
// BuildPublicationSnapshotTransferPackageUseCase AND
// ImportPublicationSnapshotTransferPackageUseCase), never a shared or
// disconnected stand-in.
function makeReplica() {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const contentStore = new LocalContentStore(new InMemoryStorageProvider());
    const buildUseCase = new BuildPublicationSnapshotTransferPackageUseCase({ publicationCatalog, contentStore });
    const importUseCase = new ImportPublicationSnapshotTransferPackageUseCase(new StoreSnapshotContentUseCase(contentStore), publicationCatalog);
    const coordinator = new SnapshotContentMaterializationCoordinator(importUseCase, buildUseCase);
    return { publicationCatalog, contentStore, buildUseCase, importUseCase, coordinator };
}

function publishSnapshot(replica, identityProvider, { id, bytes }) {
    const contentReference = replica.contentStore.put(bytes);
    const publication = signPublication(identityProvider, { id, contentKind: 'forkbuild.structure', contentReference });
    replica.publicationCatalog.add(publication);
    return publication;
}

// The EXACT logic ui/views/WorldView.js's own exportOwnSnapshot()
// implements, reproduced for the same reason
// tests/SnapshotAttributionEndToEndAudit.test.js's own
// makeDiscoverOwnSnapshotAction()/makeDistributeOwnSnapshotAction() are:
// this file structurally proves (Section A2/A4) that the real function
// takes this exact shape, then drives the real OwnPublicationPanel
// method against a functionally identical stand-in wired to a REAL
// coordinator — never a mock of the coordinator itself.
function makeExportOwnSnapshotAction({ exportSnapshotCommand }) {
    return (publication) => {
        if (!exportSnapshotCommand || !publication) {
            return Promise.reject(new Error('Snapshot export is not available.'));
        }
        return exportSnapshotCommand(publication.id);
    };
}

// The real ui/components/OwnPublicationPanel.js interaction surface,
// invoked exactly the way tests/DecentralizedSnapshotSpatialE2EAudit.test.js's
// own panelCtx() already does for its own action family — a real, driven
// component method (`OwnPublicationPanel.methods.exportOwnSnapshot`),
// never a reimplementation of it.
function panelCtx(overrides = {}) {
    return {
        publication: null,
        exportSnapshotCommand: null,
        snapshotExportExecuting: false,
        snapshotExportError: null,
        snapshotExportResult: null,
        snapshotExportRequestId: 0,
        // Sibling families, present so Section D/F can prove export
        // never touches them.
        snapshotDistributionExecuting: false,
        snapshotDistributionError: null,
        snapshotDistributionResult: null,
        snapshotDistributionRequestId: 0,
        snapshotDiscoveryExecuting: false,
        snapshotDiscoveryError: null,
        snapshotDiscoveryResult: null,
        snapshotDiscoveryRequestId: 0,
        exportOwnSnapshot: OwnPublicationPanel.methods.exportOwnSnapshot,
        ...overrides
    };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Strips full-line `//` comments before searching, so a structural check
// never mistakes a class merely named in prose for a genuine import or
// call site — the identical restraint tests/PostUndoRedoProductReassessment.test.js
// and its own predecessors already apply.
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//'));
}

function codeOnly(source) {
    return codeOnlyLines(source).join('\n');
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — existing capability reachability.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice-Export-A');
        const replica = makeReplica();
        const publication = publishSnapshot(replica, alice, { id: 'pub-export-a', bytes: 'section-a-bytes' });

        // A1 — the coordinator's export() is a bare pass-through: it
        // returns EXACTLY what BuildPublicationSnapshotTransferPackageUseCase.execute()
        // itself returns for the identical input, never a second,
        // reinterpreted shape.
        const direct = await replica.buildUseCase.execute(publication.id);
        const viaCoordinator = await replica.coordinator.export(publication.id);
        assert(JSON.stringify(direct) === JSON.stringify(viaCoordinator), 'A1. coordinator.export() returns the use case\'s own result unchanged, byte-for-byte');

        // A2 — ui/main.js composes BuildPublicationSnapshotTransferPackageUseCase
        // over its own publicationCatalog/publicationContentStore, and
        // threads it (alongside the existing import use case) into
        // SnapshotContentMaterializationCoordinator — never a second,
        // disconnected catalog/store pair.
        const mainSource = await rawSource('ui/main.js');
        assert(/new BuildPublicationSnapshotTransferPackageUseCase\(\s*\{\s*publicationCatalog,\s*contentStore:\s*publicationContentStore\s*\}\s*\)/.test(codeOnly(mainSource)),
            'A2a. ui/main.js constructs BuildPublicationSnapshotTransferPackageUseCase over the SAME publicationCatalog/publicationContentStore every other Snapshot action already shares');
        assert(/new SnapshotContentMaterializationCoordinator\(\s*importPublicationSnapshotTransferPackageUseCase,\s*buildPublicationSnapshotTransferPackageUseCase\s*\)/.test(codeOnly(mainSource)),
            'A2b. ui/main.js threads BOTH the import and the newly-composed build use case into the SAME coordinator instance');
        assert(/app\.provide\('exportSnapshotCommand',\s*exportSnapshotCommand\)/.test(codeOnly(mainSource)), 'A2c. ui/main.js provides an exportSnapshotCommand capability app-wide');

        // A3 — ui/views/WorldView.js injects the SAME app-wide command,
        // and its own exportOwnSnapshot() wrapper calls exactly that
        // injected function — never constructing a use case or
        // coordinator of its own.
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        assert(/inject\('exportSnapshotCommand',\s*null\)/.test(codeOnly(worldViewSource)), 'A3a. WorldView.js injects exportSnapshotCommand');
        assert(/function exportOwnSnapshot\(publication\)\s*\{[\s\S]{0,300}?exportSnapshotCommand\(publication\.id\)/.test(worldViewSource),
            'A3b. WorldView.js\'s own exportOwnSnapshot() calls the injected exportSnapshotCommand with publication.id');
        assert(/:exportSnapshotCommand="exportOwnSnapshot"/.test(worldViewSource), 'A3c. WorldView.js binds exportOwnSnapshot to OwnPublicationPanel\'s own exportSnapshotCommand prop');

        // A4 — ui/components/OwnPublicationPanel.js's own exportOwnSnapshot()
        // method calls exactly one thing: the injected exportSnapshotCommand
        // prop, over the whole `publication` object — the SAME shape
        // distributeOwnSnapshot()/discoverOwnSnapshot() already hold.
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const exportMethodMatch = panelSource.match(/exportOwnSnapshot\(\)\s*\{([\s\S]*?)\n\s{8}\},/);
        assert(exportMethodMatch, 'A4a. OwnPublicationPanel.js defines an exportOwnSnapshot() method');
        assert(/this\.exportSnapshotCommand\(publication\)/.test(exportMethodMatch[1]), 'A4b. exportOwnSnapshot() calls this.exportSnapshotCommand(publication) — the injected prop, over the whole publication object');
        assert(!/BuildPublicationSnapshotTransferPackageUseCase|SnapshotContentMaterializationCoordinator/.test(exportMethodMatch[1]),
            'A4c. exportOwnSnapshot() itself references neither the use case nor the coordinator class by name — it only calls the injected prop');

        // A5 — end to end, through the REAL coordinator (never a mock of
        // it): OwnPublicationPanel's own method, driving the exact wrapper
        // shape WorldView.js's own exportOwnSnapshot() takes (A3b above),
        // driving the real coordinator, driving the real use case, over a
        // real catalog/content store.
        const exportSnapshotCommand = (publicationId) => replica.coordinator.export(publicationId);
        const exportAction = makeExportOwnSnapshotAction({ exportSnapshotCommand });
        const ctx = panelCtx({ publication, exportSnapshotCommand: exportAction });
        ctx.exportOwnSnapshot();
        await flushMicrotasks();
        assert(ctx.snapshotExportError === null, 'A5a. no error notice on a successful real export');
        assert(ctx.snapshotExportResult && ctx.snapshotExportResult.publicationId === publication.id, 'A5b. the real, composed export chain returns a package naming the correct publication, driven entirely through OwnPublicationPanel\'s own action');
        assert(ctx.snapshotExportResult.contentHash === publication.contentReference.hash, 'A5c. ...with the correct contentHash');

        console.log('✓ Section A: existing capability reachability — the UI invokes the SAME BuildPublicationSnapshotTransferPackageUseCase 0.8.32 already built, through a deliberately thin coordinator method and a deliberately thin view wrapper, proven both structurally and by a real end-to-end export.');
    }

    // ---------------------------------------------------------------
    // Section B — correct Snapshot identity: no substitution across
    // contentHash/publicationId/locator/storage/World origin.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice-Export-B');
        const bob = makeIdentity('Bob-Export-B');
        const replica = makeReplica();
        const pubA = publishSnapshot(replica, alice, { id: 'pub-export-b-alice', bytes: 'alice-own-bytes' });
        const pubB = publishSnapshot(replica, bob, { id: 'pub-export-b-bob', bytes: 'bob-own-bytes-longer' });

        const packageA = await replica.coordinator.export(pubA.id);
        const packageB = await replica.coordinator.export(pubB.id);

        assert(packageA.publicationId === pubA.id && packageB.publicationId === pubB.id, 'B1. each package names its own requested publicationId, never the other\'s');
        assert(packageA.contentHash === pubA.contentReference.hash && packageB.contentHash === pubB.contentReference.hash, 'B2. each package carries its own publication\'s own contentReference.hash, never swapped');
        assert(packageA.contentHash !== packageB.contentHash, 'B3. sanity: the two publications genuinely have different content hashes');
        assert(packageA.content === 'alice-own-bytes' && packageB.content === 'bob-own-bytes-longer', 'B4. each package carries its own publication\'s own bytes, never the other\'s');

        // B5 — requesting a publicationId this replica never cataloged
        // never falls back to any OTHER publication's bytes — it fails
        // outright (Section D covers the failure shape itself).
        await expectRejects(replica.coordinator.export('pub-never-cataloged'), 'B5. an uncataloged publicationId is never silently satisfied by a different publication\'s content');

        console.log('✓ Section B: correct Snapshot identity — contentHash, publicationId, and content never get substituted for one another across two independent publications.');
    }

    // ---------------------------------------------------------------
    // Section C — explicit action only. Export is reachable from
    // exactly one click handler, repository-wide — never from
    // discovery, materialization, World registration, viewing,
    // comparison, or retention.
    // ---------------------------------------------------------------
    {
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const codeOnlyPanel = codeOnly(panelSource);
        const exportCallSites = (codeOnlyPanel.match(/this\.exportSnapshotCommand\(/g) || []).length;
        assert(exportCallSites === 1, `C1. this.exportSnapshotCommand( is called from exactly one place in OwnPublicationPanel.js (found ${exportCallSites}) — no second, implicit call site`);

        const clickHandlers = new Set((panelSource.match(/@click="[a-zA-Z]+/g) || []).map((s) => s.replace('@click="', '')));
        assert(clickHandlers.has('exportOwnSnapshot'), 'C2. "Export Snapshot" is wired to an explicit @click handler, exactly like every sibling action in this file');

        // C3 — repository-wide: none of the automatic/background/
        // discovery/comparison/retention machinery ever references
        // export, the build use case, or the export command.
        const neverExportingFiles = [
            'application/AutomaticSnapshotEncounterCascade.js',
            'application/AutomaticSnapshotEncounterRetentionPolicy.js',
            'application/AutomaticSnapshotEncounterRetentionReconciliation.js',
            'application/WorldSnapshotDiscoveryMonitor.js',
            'application/WorldSnapshotComparison.js',
            'application/ShouldRefreshSnapshotDiscovery.js',
            'application/DiscoverSnapshotCommand.js',
            'application/DiscoverSnapshotCandidatesCommand.js',
            'application/MaterializeSnapshotFromPlacementUseCase.js',
            'application/MaterializeSnapshotFromPeerUseCase.js',
            'application/MaterializeSnapshotFromSelectedCandidateUseCase.js',
            'application/MaterializedSnapshotWorldDiscoveryBridge.js'
        ];
        for (const path of neverExportingFiles) {
            const source = codeOnly(await rawSource(path));
            assert(!/BuildPublicationSnapshotTransferPackageUseCase|exportSnapshotCommand|\.export\(/.test(source), `C3. ${path} never references the export capability — no hidden automatic export path`);
        }

        console.log('✓ Section C: explicit action only — "Export Snapshot" is reachable from exactly one click handler; no automatic path exists anywhere in discovery, materialization, World registration, comparison, or retention.');
    }

    // ---------------------------------------------------------------
    // Section D — failure propagation: a real export failure is
    // distinguishable and never mutates sibling UI state or invents a
    // new generic FAILED lifecycle.
    // ---------------------------------------------------------------
    {
        const replica = makeReplica();
        const alice = makeIdentity('Alice-Export-D');

        // D1 — an uncataloged publication throws straight through,
        // uncaught, from both the use case and the coordinator — the
        // identical "a genuine caller contract violation this class does
        // not catch" restraint import() already holds for a malformed pkg.
        const useCaseError = await expectRejects(replica.buildUseCase.execute('pub-d-never-cataloged'), 'D1a. BuildPublicationSnapshotTransferPackageUseCase.execute() throws for an uncataloged publication');
        assert(/no publication cataloged/.test(useCaseError.message), 'D1b. the failure names the real cause (uncataloged), never a generic message');
        await expectRejects(replica.coordinator.export('pub-d-never-cataloged'), 'D1c. coordinator.export() propagates the identical failure, uncaught');

        // D2 — a publication known to the catalog but whose bytes this
        // replica never actually stored also fails distinctly (KNOWING vs
        // POSSESSING, the same distinction 0.8.32 draws for import): a
        // publication whose contentReference names a hash this replica
        // never put() into its own content store.
        const { ContentReference } = await import('../core/ContentReference.js');
        const neverStored = signPublication(alice, {
            id: 'pub-d-orphan', contentKind: 'forkbuild.structure',
            contentReference: new ContentReference({ hash: 'a'.repeat(64), uri: 'local:missing' })
        });
        replica.publicationCatalog.add(neverStored);
        await expectRejects(replica.coordinator.export(neverStored.id), 'D2. a cataloged publication whose bytes this replica never stored also fails — knowing is not possessing, on export exactly as it is on import');

        // D3 — a coordinator built with no BuildPublicationSnapshotTransferPackageUseCase
        // at all (every pre-0.9.215 caller of this constructor) fails
        // locally, with no attempt made, rather than silently no-op'ing
        // or falling back to a second construction path.
        const importOnlyCoordinator = new SnapshotContentMaterializationCoordinator(replica.importUseCase);
        const noBuildError = await expectRejects(importOnlyCoordinator.export('anything'), 'D3a. export() throws when no build use case was supplied at construction');
        assert(/no BuildPublicationSnapshotTransferPackageUseCase was supplied/.test(noBuildError.message), 'D3b. ...naming the real cause, distinctly from an uncataloged-publication failure');

        // D4 — driven through the real UI action: the failure lands in
        // snapshotExportError, and touches NO sibling field — no new
        // generic FAILED state, nothing borrowed from
        // snapshotDistributionError/snapshotDiscoveryError.
        const failingCommand = () => Promise.reject(new Error('boom'));
        const ctx = panelCtx({
            publication: neverStored,
            exportSnapshotCommand: makeExportOwnSnapshotAction({ exportSnapshotCommand: failingCommand }),
            snapshotDistributionResult: { untouched: true },
            snapshotDiscoveryResult: { untouched: true }
        });
        ctx.exportOwnSnapshot();
        await flushMicrotasks();
        assert(ctx.snapshotExportError === 'Snapshot export could not be completed.', 'D4a. a real export failure produces this component\'s own distinct error message');
        assert(ctx.snapshotExportResult === null, 'D4b. no result is recorded for a failed attempt');
        assert(ctx.snapshotExportExecuting === false, 'D4c. the in-flight flag clears even on failure');
        assert(ctx.snapshotDistributionResult && ctx.snapshotDistributionResult.untouched === true, 'D4d. a failed export never touches snapshotDistributionResult');
        assert(ctx.snapshotDiscoveryResult && ctx.snapshotDiscoveryResult.untouched === true, 'D4e. a failed export never touches snapshotDiscoveryResult');

        console.log('✓ Section D: failure propagation — an uncataloged publication, an unpossessed one, and a coordinator missing its build use case each fail distinctly and are never caught into a generic FAILED state; a failed UI attempt never mutates sibling action state.');
    }

    // ---------------------------------------------------------------
    // Section E — repeated export: no invented idempotency where none
    // exists in the underlying use case (a pure read).
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice-Export-E');
        const replica = makeReplica();
        const publication = publishSnapshot(replica, alice, { id: 'pub-export-e', bytes: 'repeat-me-bytes' });

        const first = await replica.coordinator.export(publication.id);
        const second = await replica.coordinator.export(publication.id);
        assert(JSON.stringify(first) === JSON.stringify(second), 'E1. exporting the identical publication twice produces two byte-identical packages — the use case is a pure read, so repetition is naturally idempotent, never rejected as a duplicate');

        // E2 — the coordinator itself adds no dedup/memoization of its
        // own: its source never references a cache, a Set, or a Map
        // keyed on publicationId for export().
        const coordinatorSource = codeOnly(await rawSource('application/SnapshotContentMaterializationCoordinator.js'));
        const exportMethodBody = coordinatorSource.match(/async export\(publicationId\)\s*\{([\s\S]*?)\n\s{4}\}/);
        assert(exportMethodBody, 'E2a. export(publicationId) exists on the coordinator');
        assert(!/cache|Map\(|Set\(|already exported|idempot/i.test(exportMethodBody[1]), 'E2b. export() invents no idempotency/dedup machinery of its own — a bare pass-through, exactly like import()');

        // E3 — driven through the real UI action twice in a row: a
        // second click produces a fresh (not stale/frozen) result, and
        // the request-id guard still protects against a stale in-flight
        // response, the identical protection every sibling action holds.
        const exportAction = makeExportOwnSnapshotAction({ exportSnapshotCommand: (id) => replica.coordinator.export(id) });
        const ctx = panelCtx({ publication, exportSnapshotCommand: exportAction });
        ctx.exportOwnSnapshot();
        await flushMicrotasks();
        const resultAfterFirstClick = ctx.snapshotExportResult;
        ctx.exportOwnSnapshot();
        await flushMicrotasks();
        assert(ctx.snapshotExportResult !== null, 'E3a. a second click produces a real result again, never disabled as "already exported"');
        assert(JSON.stringify(resultAfterFirstClick) === JSON.stringify(ctx.snapshotExportResult), 'E3b. the two results are byte-identical, consistent with the use case\'s own pure-read idempotency');

        console.log('✓ Section E: repeated export — BuildPublicationSnapshotTransferPackageUseCase\'s own pure-read idempotency is preserved unchanged; neither the coordinator nor the UI invents dedup/idempotency machinery of its own.');
    }

    // ---------------------------------------------------------------
    // Section F — Snapshot/Publication independence: export mutates
    // neither the publication catalog entry nor the content store, and
    // never touches Publish/Unpublish/Placement/World/Nostr/Arweave.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice-Export-F');
        const replica = makeReplica();
        const publication = publishSnapshot(replica, alice, { id: 'pub-export-f', bytes: 'independence-bytes' });

        const catalogEntryBefore = JSON.stringify(replica.publicationCatalog.get(publication.id));
        const bytesBefore = await replica.contentStore.get(publication.contentReference);

        await replica.coordinator.export(publication.id);
        await replica.coordinator.export(publication.id);

        const catalogEntryAfter = JSON.stringify(replica.publicationCatalog.get(publication.id));
        const bytesAfter = await replica.contentStore.get(publication.contentReference);
        assert(catalogEntryBefore === catalogEntryAfter, 'F1. the publication catalog entry is byte-for-byte unchanged after exporting (even twice)');
        assert(bytesBefore === bytesAfter, 'F2. the content store\'s own bytes are unchanged after exporting');

        // F3 — structural: the use case and coordinator reference none of
        // the systems export must stay independent from.
        const buildUseCaseSource = codeOnly(await rawSource('application/BuildPublicationSnapshotTransferPackageUseCase.js'));
        const forbidden = /Publish|Unpublish|PlacementRegistry|WorldDiscoverySourceRegistry|Nostr|Arweave|VerifyPublication|VerifyDelegation/;
        assert(!forbidden.test(buildUseCaseSource), 'F3a. BuildPublicationSnapshotTransferPackageUseCase.js references none of Publish/Unpublish/Placement/World/Nostr/Arweave/verification');
        const coordinatorSource = codeOnly(await rawSource('application/SnapshotContentMaterializationCoordinator.js'));
        assert(!forbidden.test(coordinatorSource), 'F3b. SnapshotContentMaterializationCoordinator.js references none of them either');

        console.log('✓ Section F: Snapshot/Publication independence — exporting reads catalog and content-store state without ever mutating it, and touches no Publish/Unpublish/Placement/World/Nostr/Arweave machinery.');
    }

    // ---------------------------------------------------------------
    // Section G — manual export vs. the automatic Snapshot encounter
    // cascade: no hidden feedback loop between them, in either
    // direction (see Section C3 above for the automatic-side sweep;
    // this section checks the reverse direction and the World View
    // refresh tick specifically).
    // ---------------------------------------------------------------
    {
        const worldViewSource = await rawSource('ui/views/WorldView.js');

        // G1 — the automatic cascade's own call site inside
        // refreshSpatialUI() never references export.
        const cascadeCallSite = worldViewSource.match(/worldSnapshotDiscoveryMonitor\.observe\([\s\S]{0,2000}?\}\);?\s*\n\s*\}/);
        assert(cascadeCallSite, 'G1a. the automatic discovery/cascade block is found in WorldView.js');
        assert(!/exportSnapshotCommand|BuildPublicationSnapshotTransferPackageUseCase/.test(cascadeCallSite[0]), 'G1b. the automatic Snapshot encounter cascade block never references export — export stays a separate, manual action');

        // G2 — exportOwnSnapshot() itself never references any automatic
        // machinery (the cascade, the discovery monitor, or the
        // retention reconciliation).
        const exportFnMatch = worldViewSource.match(/function exportOwnSnapshot\(publication\)\s*\{([\s\S]*?)\n\s{8}\}/);
        assert(exportFnMatch, 'G2a. WorldView.js\'s own exportOwnSnapshot() is found');
        assert(!/automaticSnapshotEncounterCascade|worldSnapshotDiscoveryMonitor|RetentionReconciliation/.test(exportFnMatch[1]),
            'G2b. exportOwnSnapshot() never references the automatic cascade, discovery monitor, or retention reconciliation — manual export and automatic acquisition remain two independent paths');

        console.log('✓ Section G: manual vs. automatic Snapshot paths — automatic discovery/acquisition/registration never triggers export, and export never references any automatic machinery. No hidden feedback loop in either direction.');
    }

    // ---------------------------------------------------------------
    // Section H — structural boundary: the UI layer never imports
    // low-level Snapshot storage/verification machinery directly for
    // this capability — only the composed command function.
    // ---------------------------------------------------------------
    {
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const codeOnlyPanel = codeOnly(panelSource);
        const importBlock = codeOnlyPanel.slice(0, codeOnlyPanel.indexOf('export default'));
        for (const forbidden of ['BuildPublicationSnapshotTransferPackageUseCase', 'SnapshotContentMaterializationCoordinator', 'ContentStore', 'PublicationCatalog', 'NostrSnapshotDiscoveryPublisher', 'ArweaveContentStore']) {
            assert(!importBlock.includes(forbidden), `H1. OwnPublicationPanel.js's own import block never references ${forbidden} — only the injected exportSnapshotCommand prop`);
        }

        const worldViewSource = await rawSource('ui/views/WorldView.js');
        const codeOnlyWorldView = codeOnly(worldViewSource);
        const worldViewImportBlock = codeOnlyWorldView.slice(0, codeOnlyWorldView.indexOf('export default'));
        for (const forbidden of ['BuildPublicationSnapshotTransferPackageUseCase', 'SnapshotContentMaterializationCoordinator', 'publicationContentStore']) {
            assert(!worldViewImportBlock.includes(forbidden), `H2. WorldView.js's own import block never references ${forbidden} — only the injected exportSnapshotCommand capability`);
        }

        // H3 — ui/main.js is the ONLY file under ui/ that constructs
        // BuildPublicationSnapshotTransferPackageUseCase.
        const { execSync } = await import('node:child_process');
        const grepOutput = execSync("grep -rl 'new BuildPublicationSnapshotTransferPackageUseCase(' ui/ || true", { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
        const constructingFiles = grepOutput.split('\n').map((line) => line.trim()).filter(Boolean);
        assert(constructingFiles.length === 1 && constructingFiles[0] === 'ui/main.js', `H3. exactly one file under ui/ constructs BuildPublicationSnapshotTransferPackageUseCase — ui/main.js (found: ${constructingFiles.join(', ') || 'none'})`);

        console.log('✓ Section H: structural boundary — OwnPublicationPanel.js and WorldView.js never import the export use case, the coordinator class, or a ContentStore/PublicationCatalog directly; only ui/main.js composes them, exposing a plain injected command function.');
    }

    // ---------------------------------------------------------------
    // Section I — FLAGSHIP: Export and Import are now genuinely
    // symmetric, not merely two independently-tested halves. Alice
    // exports her own Snapshot; the resulting package validates against
    // Import's own structural validator (the SAME validator
    // ImportPublicationSnapshotTransferPackageUseCase.js calls first);
    // a fresh Bob replica, who only knows OF the publication (imported
    // just a claim, never the bytes — mirrored here as simply never
    // having stored them), imports the exported package and ends up
    // holding byte-identical content.
    // ---------------------------------------------------------------
    {
        const alice = makeIdentity('Alice-Export-Flagship');
        const aliceReplica = makeReplica();
        const publication = publishSnapshot(aliceReplica, alice, { id: 'pub-export-flagship', bytes: 'flagship-snapshot-bytes' });

        // Alice explicitly exports her own Snapshot — the real UI action.
        const exportAction = makeExportOwnSnapshotAction({ exportSnapshotCommand: (id) => aliceReplica.coordinator.export(id) });
        const aliceCtx = panelCtx({ publication, exportSnapshotCommand: exportAction });
        aliceCtx.exportOwnSnapshot();
        await flushMicrotasks();
        assert(aliceCtx.snapshotExportResult !== null, 'I1. Alice\'s own explicit "Export Snapshot" click produces a real package');
        const exportedPackage = aliceCtx.snapshotExportResult;

        // The exported package is a genuinely well-formed Publication
        // Snapshot Transfer Package by IMPORT's own structural validator
        // — proving the two halves speak the identical wire format.
        let validationThrew = false;
        try { validatePublicationSnapshotTransferPackage(exportedPackage); } catch (e) { validationThrew = true; }
        assert(!validationThrew, 'I2. the exported package validates cleanly against ImportPublicationSnapshotTransferPackageUseCase\'s own structural validator');

        // Bob is a completely independent replica who has never stored
        // Alice's bytes. He imports the package Alice exported.
        const bobReplica = makeReplica();
        const bobResult = await bobReplica.coordinator.import(exportedPackage);
        assert(bobResult.outcome === SnapshotContentTransferOutcome.STORED, 'I3. Bob\'s own real Import Snapshot action, fed Alice\'s exported package, reports STORED');
        assert(bobResult.publicationId === publication.id, 'I4. Bob\'s import result names the correct publicationId');
        const bobBytes = await bobReplica.contentStore.get(publication.contentReference);
        assert(bobBytes === 'flagship-snapshot-bytes', 'I5. Bob now holds byte-identical content to Alice\'s own — Export and Import are genuinely symmetric end to end');

        // A second import of the SAME package Bob already has reports
        // ALREADY_STORED, unchanged, exactly as 0.8.34's own suite
        // already establishes for import in isolation — reconfirmed here
        // for the export-produced package specifically.
        const secondImport = await bobReplica.coordinator.import(exportedPackage);
        assert(secondImport.outcome === SnapshotContentTransferOutcome.ALREADY_STORED, 'I6. importing the identical exported package again reports ALREADY_STORED, never an error');

        console.log('✓ Section I: FLAGSHIP — Alice\'s explicit "Export Snapshot" click produces a package that validates against Import\'s own structural rules and that a fresh replica genuinely imports, ending up with byte-identical content. Import and Export are symmetric, end to end, through real UI actions on both sides.');
    }

    console.log('\n✅ All Snapshot Export UI Integration tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
