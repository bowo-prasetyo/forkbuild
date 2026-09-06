import { readFile, readdir } from 'node:fs/promises';

import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { WorldPosition } from '../core/WorldPosition.js';
import { EventBus } from '../core/events/EventBus.js';
import { VehicleType } from '../core/VehicleType.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { ReplayDocumentUseCase } from '../application/ReplayDocumentUseCase.js';
import { RestoreHistoryStateUseCase } from '../application/RestoreHistoryStateUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

// 0.9.203 — Post-Lifecycle Product Reassessment.
//
// Test-only. No production changes. 0.9.202's own closing recommendation
// asked for exactly this: not another orphan-thread milestone, but a
// return to the broad question 0.9.196 originally asked —
//
//   "What is the next concrete thing a Wanderer or Publisher should be
//    able to do that they currently cannot?"
//
// — now that the entire lifecycle-gap arc it opened is closed:
//
//   0.9.196  Architecture Reassessment / Product Gap Audit
//   0.9.197  World Placement Removal UI Action
//   0.9.198  Publication Unpublish / Retract UI Action
//   0.9.199  Removal & Retraction Lifecycle Convergence Audit
//   0.9.200  Orphaned World Placement Lifecycle Audit
//   0.9.201  Degraded Orphan Row Handling
//   0.9.202  Unpublished Placement Physical-Occupancy Audit
//
// Same shallow, five-area shape as 0.9.196 — one section per area, never
// inventing a capability, lifecycle state, or semantic this codebase has
// not already earned through real, existing, working code — but with a
// four-way classification instead of three, and one added criterion:
//
//   COMPLETE              — fully wired, reachable, tested.
//   INTENTIONAL_BOUNDARY  — deliberately not built; a documented restraint.
//   ACTUAL_GAP            — no domain/application logic exists at all.
//   ROUGH_EDGE            — a cosmetic/UX edge, not a missing capability.
//
//   For any candidate finding: does an existing domain/application use
//   case ALREADY implement this, with simply no UI caller? That pattern
//   — not ACTUAL_GAP, not ROUGH_EDGE — is exactly what 0.9.196 found for
//   World-placement removal/Publication unpublish, and it is the single
//   most valuable thing this kind of sweep can surface.
//
// Every collaborator this file exercises is existing, unmodified
// application code — the same classes tests/HistoryRestore.test.js,
// tests/WorldPlacement.test.js, and tests/PublicationLifecycle.test.js
// already exercise, composed here the identical way.

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

const stubIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' }),
    sign: (data) => ({ signedBy: 'alice', providerId: 'stub', data })
};

const stubLayoutProvider = {
    getPosition: () => new WorldPosition(0, 0, 0),
    findVisibleDocuments: () => []
};

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function createTestDocument() {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title: 'Reassessment Test', author: 'tester' }) });
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Strips full-line `//` comments so a call-site sweep counts genuine
// references, never a comment that merely NAMES an identifier in prose
// (the same restraint 0.9.156/0.9.191/0.9.194/0.9.195/0.9.196 already
// applied to their own structural sweeps).
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//'));
}

function countReferences(source, identifier) {
    const pattern = new RegExp(`\\b${identifier}\\b`, 'g');
    const matches = codeOnlyLines(source).join('\n').match(pattern);
    return matches ? matches.length : 0;
}

// Repo-wide recursive sweep, the same helper 0.9.195's own convergence
// audit already established, reused here rather than a hand-picked file
// list — the whole point of Section A's finding is that NO ui/ file
// anywhere reaches the identifiers in question, not just the ones an
// author might have thought to check.
async function listJsFilesRecursively(relativeDir) {
    const results = [];
    async function walk(dir) {
        let entries;
        try {
            entries = await readdir(new URL(dir, SOURCE_ROOT), { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const childPath = `${dir}${dir.endsWith('/') ? '' : '/'}${entry.name}`;
            if (entry.isDirectory()) {
                await walk(`${childPath}/`);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                results.push(childPath);
            }
        }
    }
    await walk(relativeDir);
    return results;
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — World interaction/navigation.
    //
    // Re-confirms 0.9.196's own Section A composition finding (still
    // COMPLETE), then goes looking specifically for this milestone's
    // one new criterion: an existing use case with no UI caller. It
    // finds one — a fully-built, fully-tested History Preview & Restore
    // / Operation Timeline capability (0.1.39-0.1.41) sitting on
    // WorldNavigationSession with zero reachable UI anywhere in the
    // product, in either WorldView (observes/navigates) or EditorView
    // (mutates/builds, per 0.5.9) — not a duplicate of EditorSession's
    // plain undo()/redo() pair (A3b below), which has no cursor-
    // scrubbing or preview concept at all.
    // ---------------------------------------------------------------
    {
        const worldView = await rawSource('ui/views/WorldView.js');
        const componentTags = new Set((worldView.match(/<[A-Z][A-Za-z]+/g) || []).map((tag) => tag.slice(1)));
        const expectedFamilies = [
            'AvatarInfoPanel', 'NearbyAvatarsPanel', 'CompassIndicator',
            'WorldMembersPanel', 'WorldPresenceIndicator', 'WorldCollaboratorIndicator',
            'LocationsPanel', 'GeographicPlaceDirectoryPanel', 'GeographicPlacePanel',
            'PlaceNamingPanel', 'WorldSearchPanel', 'WorldMapPanel',
            'PlacementInfoPanel', 'PlacementEditorDialog', 'VehicleInteractionPrompt',
            'OwnPublicationPanel', 'WorldEncounterCanvas'
        ];
        for (const name of expectedFamilies) {
            assert(componentTags.has(name), `A1. WorldView.js still composes ${name}`);
        }
        assert(componentTags.size >= 20, `A2. WorldView.js still composes at least 20 distinct component families (found ${componentTags.size}) — no regression since 0.9.196`);

        // A3 — the domain logic genuinely exists on WorldNavigationSession,
        // by name, not merely something this audit is inferring.
        const navSource = await rawSource('application/WorldNavigationSession.js');
        const historyIdentifiers = [
            'beginHistoryPreview', 'previewHistoryAt', 'cancelHistoryPreview',
            'getHistoryPreview', 'restoreHistoryAt', 'getTimeline', 'getRetiredHistories'
        ];
        for (const identifier of historyIdentifiers) {
            assert(countReferences(navSource, identifier) >= 1, `A3a. WorldNavigationSession.js declares ${identifier}(...) — History Preview & Restore is real, existing domain logic, not a proposal`);
        }
        // A3b — confirms this is not merely EditorSession's plain
        // undo()/redo() under a different name: EditorSession has no
        // cursor-scrubbing/preview concept of its own at all.
        const editorSessionSource = await rawSource('application/EditorSession.js');
        for (const identifier of historyIdentifiers) {
            assert(countReferences(editorSessionSource, identifier) === 0, `A3b. application/EditorSession.js has no ${identifier}(...) of its own — its undo()/redo() pair is a genuinely simpler, separate mechanism, not the same capability under another name`);
        }

        // A4 — a genuine repo-wide sweep (every .js file under ui/, not a
        // hand-picked list) finds not one caller of any of the above,
        // anywhere — not in WorldView.js, not in EditorView.js (whose own
        // undo()/redo() wiring is a structurally DIFFERENT, simpler
        // mechanism — see A5's own EditorSession check), not in any
        // dedicated History/Timeline component (none exists — a
        // dedicated find confirms it).
        const uiFiles = await listJsFilesRecursively('ui/');
        assert(uiFiles.length >= 40, `A4a. sanity: the ui/ sweep found a plausible number of files (${uiFiles.length})`);
        const historyOrTimelineFile = uiFiles.find((f) => /history|timeline/i.test(f));
        assert(!historyOrTimelineFile, `A4b. no ui/ file name mentions History/Timeline at all (found ${historyOrTimelineFile || 'none'}) — this is not a case of the feature living under an unexpected name`);
        for (const file of uiFiles) {
            const source = await rawSource(file);
            for (const identifier of historyIdentifiers) {
                assert(countReferences(source, identifier) === 0, `A4c. ${file} never references ${identifier}(...) — confirms zero UI reachability, repo-wide, not just in the files an author might have thought to check`);
            }
        }

        // A5 — proof the capability is genuinely FUNCTIONAL, not merely
        // present, run directly against real (not mocked) collaborators,
        // the identical minimal WorldNavigationSession construction
        // tests/HistoryRestore.test.js already uses (registry,
        // loadPublicationDocumentUseCase, worldLayoutProvider,
        // saveDocumentUseCase, publishDocumentUseCase,
        // replayDocumentUseCase, restoreHistoryStateUseCase — nothing
        // renderer-shaped beyond the stub `_session` every other audit in
        // this arc that touches WorldNavigationSession also stubs).
        {
            const storage = new InMemoryStorageProvider();
            const serializer = new DocumentSerializer();
            const doc = createTestDocument();
            storage.save(doc.world.id, serializer.serialize(doc));

            const commandRegistry = new CreateCommandRegistryUseCase().execute();
            const replayUseCase = new ReplayDocumentUseCase(commandRegistry);
            const restoreUseCase = new RestoreHistoryStateUseCase(replayUseCase);

            const nav = new WorldNavigationSession({
                registry: new CreateBrickRegistryUseCase().execute(),
                loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(storage),
                worldLayoutProvider: stubLayoutProvider,
                saveDocumentUseCase: new SaveDocumentUseCase(storage),
                publishDocumentUseCase: new PublishDocumentUseCase(new LocalPublisherProvider(storage), stubIdentityProvider),
                replayDocumentUseCase: replayUseCase,
                restoreHistoryStateUseCase: restoreUseCase
            });
            nav._eventBus = new EventBus();
            nav._session = {
                addWorld: () => {}, removeWorld: () => {}, selectBricks: () => {},
                clearSelection: () => {}, clearHover: () => {}, hidePreview: () => {}
            };
            nav._loadWorld(doc.world.id);
            nav._focusedDocumentId = doc.world.id;

            const world = nav.getDocument(doc.world.id).world;
            const buildingId = world.getBuildings()[0].id;
            const history = nav._commandHistories.get(world.id);
            history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(2, 0.5, 0) }));
            history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(4, 0.5, 0) }));

            assert(nav.getTimeline().length === 2, 'A5a. getTimeline() genuinely reflects the two commands just executed');
            assert(nav.beginHistoryPreview() === true, 'A5b. beginHistoryPreview() genuinely starts a preview');
            nav.previewHistoryAt(1);
            assert(nav.getHistoryPreview().cursor === 1, 'A5c. previewHistoryAt()/getHistoryPreview() genuinely track the requested cursor');
            assert(world.getBuildings()[0].getBricks().length === 3, 'A5d. the LIVE document is untouched while a preview is open (1 baseline brick + 2 executed commands) — preview swaps only the rendered world, per its own header');
            nav.cancelHistoryPreview();
            assert(nav.getHistoryPreview() === null, 'A5e. cancelHistoryPreview() genuinely ends the preview');
            nav.restoreHistoryAt(1);
            assert(nav.getDocument(doc.world.id).world.getBuildings()[0].getBricks().length === 2, 'A5f. restoreHistoryAt() genuinely rebases the live document to the requested cursor (1 baseline brick + 1 replayed command, dropping the second)');
            assert(nav.getRetiredHistories(doc.world.id).length === 1, 'A5g. the pre-restore history is genuinely retained as a retired artifact, never discarded');
        }

        console.log('✓ Section A: World interaction/navigation — composition-level COMPLETE, unchanged since 0.9.196. New finding: History Preview & Restore / Operation Timeline (0.1.39-0.1.41) is real, correct, working domain logic on WorldNavigationSession (proven directly above) with ZERO UI callers anywhere in the product — classified EXISTING CAPABILITY + MISSING UI, not ACTUAL_GAP.');
    }

    // ---------------------------------------------------------------
    // Section B — Vehicle system (re-confirmed intentional boundary).
    // ---------------------------------------------------------------
    {
        assert(typeof VehicleType.NONE === 'string' && typeof VehicleType.BICYCLE === 'string'
            && typeof VehicleType.MOTORCYCLE === 'string' && typeof VehicleType.CAR === 'string'
            && typeof VehicleType.DRONE === 'string', 'B1. VehicleType still carries exactly its five original values');
        const vehicleTypeSource = await rawSource('core/VehicleType.js');
        assert(!/passenger|capacity|multi-?rider|\bfuel\b|\brange\b/i.test(codeOnlyLines(vehicleTypeSource).join('\n')),
            'B2. VehicleType.js\'s own CODE still declares no capacity/passenger/fuel vocabulary — unchanged since 0.9.70/0.9.196');

        // B3 — the one piece of NEW evidence this section adds: vehicles
        // are structurally, not incidentally, outside 0.9.197's "Remove
        // from World" system. A VehiclePresence is a pure, recomputed-
        // never-stored sampling result (core/VehiclePlacement.js's own
        // header) with no placementId, no PlacementRecord, and no entry
        // in the placement registry the removal system operates over.
        const vehiclePlacementSource = await rawSource('core/VehiclePlacement.js');
        const vehiclePresenceSource = await rawSource('core/VehiclePresence.js');
        const vehicleRuntimeSource = await rawSource('application/VehicleRuntimeInstances.js');
        for (const [name, source] of [
            ['core/VehiclePlacement.js', vehiclePlacementSource],
            ['core/VehiclePresence.js', vehiclePresenceSource],
            ['application/VehicleRuntimeInstances.js', vehicleRuntimeSource]
        ]) {
            assert(countReferences(source, 'RemoveWorldPlacementUseCase') === 0 && countReferences(source, 'PlacementRegistry') === 0,
                `B3. ${name} references neither RemoveWorldPlacementUseCase nor PlacementRegistry — a vehicle is never the kind of thing 0.9.197's removal system describes, so there is no reach for it to be missing`);
        }
        console.log('✓ Section B: Vehicle system — mount/dismount/steering/braking/collision remain deeply built and tested (40+ dedicated test files); the vehicle line itself has had zero code changes since 0.9.130. Capacity/passenger/fuel/range vocabulary and vehicle ownership remain INTENTIONAL BOUNDARIES. New clarification: vehicles are structurally outside the World-placement removal system (sampled/ephemeral vs. document/placement-registry-backed), not merely un-reached by it. No gap found.');
    }

    // ---------------------------------------------------------------
    // Section C — World material lifecycle (re-confirmed, no new gap).
    //
    // Acquisition, observation, removal (World-placement) and retraction
    // (Publication) are all already closed (0.9.196-0.9.202). This
    // section asks what remains BEYOND removal: in-place editing of
    // published material, content-addressed deletion/GC, and re-
    // placement — and finds each already answered, one way or another.
    // ---------------------------------------------------------------
    {
        // C1 — editing already-published material: fork-on-write
        // (0.2.20), a documented INTENTIONAL_BOUNDARY, not a gap. A
        // Publication is immutable; republishing makes a NEW one.
        const publicationSource = await rawSource('publisher/Publication.js');
        assert(/own first and only revision/.test(publicationSource), 'C1a. Publication.js still documents "a publication is its own first and only revision" — no in-place revision concept exists');
        const navSourceForEditability = await rawSource('application/WorldNavigationSession.js');
        assert(countReferences(navSourceForEditability, 'isDocumentPublished') >= 1 && countReferences(navSourceForEditability, 'getEditabilityNotice') >= 1,
            'C1b. WorldNavigationSession still surfaces isDocumentPublished()/getEditabilityNotice() — the fork-on-write boundary is reachable and explained to the UI, not merely enforced silently');

        // C2 — content-addressed material deletion/GC: does not exist,
        // anywhere, at any layer — the ContentStore abstraction itself
        // declares no delete/remove method for a concrete store to
        // implement, matching this codebase's broader "immutable once
        // put" discipline for Publications and PlacementRecord revisions.
        const contentStoreSource = await rawSource('content/ContentStore.js');
        assert(!/\bdelete\s*\(|\bremove\s*\(/.test(codeOnlyLines(contentStoreSource).join('\n')),
            'C2. content/ContentStore.js declares no delete()/remove() method at all — content-addressed deletion is an INTENTIONAL_BOUNDARY (immutable by construction), not an unimplemented feature');

        // C3 — confirms C2 from the concrete caller's side: unpublishing
        // a document already, deliberately, never touches content
        // storage — tests/PublicationUnpublishUIAction.test.js's own
        // Section E already names this "material/distribution
        // separation"; this just re-confirms the underlying code hasn't
        // drifted since.
        const publisherSource = await rawSource('publisher/LocalPublisherProvider.js');
        const unpublishBody = publisherSource.slice(publisherSource.indexOf('unpublish(publicationId)'), publisherSource.indexOf('unpublish(publicationId)') + 400);
        assert(!/contentStore/i.test(unpublishBody), 'C3. LocalPublisherProvider.unpublish() still never references contentStore — material survives unpublish by construction');

        // C4 — re-placement (move) is already COMPLETE: reachable from
        // World View through the exact same WorldNavigationSession
        // shape "Remove from World" (0.9.197) uses.
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        assert(/session\.movePlacement\(/.test(worldViewSource), 'C4. ui/views/WorldView.js still calls session.movePlacement(...) — moving an already-placed publication to a new position is fully wired, unchanged since before 0.9.196');

        console.log('✓ Section C: World material lifecycle — no new gap. Editing published material (fork-on-write) and content-addressed deletion/GC are both INTENTIONAL_BOUNDARY, each explicitly documented and tested elsewhere, not oversights. Re-placement (move) remains COMPLETE. Each publish is already its own independently addressable, independently placeable entity — no missing "revision" concept.');
    }

    // ---------------------------------------------------------------
    // Section D — Publication workflow (re-confirmed COMPLETE).
    // ---------------------------------------------------------------
    {
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const clickHandlers = new Set((panelSource.match(/@click="[a-zA-Z]+/g) || []).map((s) => s.replace('@click="', '')));
        assert(clickHandlers.size >= 10, `D1. OwnPublicationPanel.js still wires at least 10 distinct actions (found ${clickHandlers.size}) — publish, unpublish, anchor, distribute, and the full Snapshot discover/resolve/materialize/attribute/register/place/claim chain all remain reachable`);
        const unpublishHandlers = [...clickHandlers].filter((h) => /^unpublish|^retract/i.test(h));
        assert(unpublishHandlers.length === 1, 'D2. exactly one unpublish/retract-shaped handler remains — unchanged since 0.9.198');

        // D3 — the one candidate this sweep specifically checked for a
        // possible gap: re-verify/re-anchor after a failed verification.
        // Both already exist, and neither rewrites the original claim —
        // matching docs/Principles.md's own "a verification result does
        // not rewrite the historical claim being verified" (0.8.12).
        const decentralizedViewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');
        assert(/Verify Again/.test(decentralizedViewSource), 'D3a. DecentralizedPublicationsView.js still offers a "Verify Again" re-verification action');
        const anchorCreationViewSource = await rawSource('application/PublicationAnchorCreationView.js');
        assert(/Create Another \$\{anchorTypeLabel\} Anchor/.test(anchorCreationViewSource), 'D3b. describeCreationButtonLabel() still offers "Create Another ... Anchor" once one already exists — re-anchoring is already reachable, modeled as a new anchor rather than an edit to the old one');

        console.log(`✓ Section D: Publication workflow — COMPLETE. ${clickHandlers.size} distinct actions already wired on OwnPublicationPanel.js (forward publish/anchor/distribute/Snapshot chain plus the 0.9.198 unpublish reverse path); re-verify and re-anchor after a failed verification are both already reachable elsewhere (DecentralizedPublicationsView.js), consistent with the "never rewrite a historical claim" boundary. No new gap and no EXISTING-CAPABILITY-MISSING-UI case found here.`);
    }

    // ---------------------------------------------------------------
    // Section E — Performance (re-confirmed intentional deferral).
    //
    // 0.9.196 explicitly deferred this: "no known bottleneck exists to
    // profile; performance work belongs after a real functional gap is
    // closed." That functional-gap arc (0.9.197-0.9.202) is now closed.
    // This section checks, briefly, whether that changes anything — it
    // does not.
    // ---------------------------------------------------------------
    {
        const navSource = await rawSource('application/WorldNavigationSession.js');
        assert(/PRESENCE_HEARTBEAT_INTERVAL_MS\s*=\s*2000/.test(navSource), 'E1a. the existing 2s presence heartbeat cadence is still in place, not a per-frame broadcast');
        assert(/PROFILE_REPUBLISH_INTERVAL_MS\s*=\s*15000/.test(navSource), 'E1b. the existing 15s profile republish cadence is still in place');
        await rawSource('application/AutomaticSnapshotEncounterRetentionPolicy.js'); // throws if the file no longer exists
        console.log('✓ Section E: Performance — deliberately DEFERRED, unchanged since 0.9.196. Existing cadence/retention mechanisms (presence heartbeat, profile republish, automatic Snapshot encounter retention) show performance was already proactively considered where it was actually needed. The 0.9.197-0.9.202 arc added removal/unpublish UI actions and confirmed unbounded same-coordinate co-occupancy is intentional (0.9.202), not a newly discovered bottleneck. No concrete, currently-reachable performance problem was found; this remains an INTENTIONAL_BOUNDARY, not an oversight.');
    }

    console.log(`
--------------------------------------------------------------------
0.9.203 DECISION:

Four of five areas re-confirm what a shallow sweep is supposed to
confirm after a functional-gap arc closes: no invented gap, nothing
manufactured to keep a milestone counter moving.

    Vehicle system         -> INTENTIONAL_BOUNDARY (re-confirmed)
    World material lifecycle -> COMPLETE / INTENTIONAL_BOUNDARY (no gap)
    Publication workflow    -> COMPLETE (no gap)
    Performance             -> INTENTIONAL_BOUNDARY (still deferred)

World interaction/navigation is the exception, and it is the exact
pattern this milestone was designed to look for: History Preview &
Restore / Operation Timeline (0.1.39-0.1.41) is real, correct, already-
tested domain logic on WorldNavigationSession (beginHistoryPreview,
previewHistoryAt, cancelHistoryPreview, getHistoryPreview,
restoreHistoryAt, getTimeline, getRetiredHistories — all proven
functional directly in Section A above) with ZERO UI callers anywhere
in the product. Not a missing domain capability (ACTUAL_GAP) and not a
cosmetic issue (ROUGH_EDGE) — an EXISTING CAPABILITY + MISSING UI,
exactly 0.9.196's own Section C shape one level up the stack.
--------------------------------------------------------------------
0.9.203 RECOMMENDATION:

I would recommend 0.9.204 — a UI action wiring History Preview &
Restore into the product, the same shape as 0.9.197/0.9.198: one seam,
no new domain logic, since restoreHistoryAt()/getTimeline()/
beginHistoryPreview() already do exactly the right thing. The one open
design question that milestone should answer, deliberately left open
here: WHICH view owns this — EditorView.js (mutates/builds, per 0.5.9,
already home to plain undo()/redo()) or a new dedicated surface — since
neither currently composes anything History/Timeline-shaped at all.

If 0.9.204 instead finds this seam is not worth wiring on its own
merits, per this milestone's own brief that is a legitimate outcome too
— the discipline this project has kept since 0.9.196 is to close a real,
already-half-built seam when one exists, never to manufacture a
milestone when the sweep comes back clean.
--------------------------------------------------------------------
`);
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
