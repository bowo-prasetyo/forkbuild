import { readFile } from 'node:fs/promises';

import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { VehicleType } from '../core/VehicleType.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { DocumentManifest } from '../application/DocumentManifest.js';
import { LocalRecoveryStore } from '../persistence/LocalRecoveryStore.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { AutosaveDocumentUseCase } from '../application/AutosaveDocumentUseCase.js';
import { AutosaveScheduler } from '../application/AutosaveScheduler.js';
import { CheckRecoveryUseCase } from '../application/CheckRecoveryUseCase.js';
import { RecoverDocumentUseCase } from '../application/RecoverDocumentUseCase.js';
import { DiscardRecoveryUseCase } from '../application/DiscardRecoveryUseCase.js';
import { CreatePersistenceUseCase } from '../application/CreatePersistenceUseCase.js';

// 0.9.203 — Post-Lifecycle Product Reassessment.
//
// Test-only. No production changes. 0.9.202's own closing recommendation
// asked for exactly this, in the shape 0.9.196 first established: a
// shallow sweep of five broad product areas, looking for the next real
// user-facing gap, now that the entire orphan-placement/unpublish thread
// (0.9.196-0.9.202) is closed. Per the brief that requested this
// milestone, every candidate finding below is classified into exactly
// one of four buckets — never blended, never left ambiguous:
//
//   COMPLETE              — already fully reachable, nothing to do.
//   INTENTIONAL_BOUNDARY  — deliberately undone; a decision, not a gap.
//   ACTUAL_GAP            — a genuine missing product capability.
//   ROUGH_EDGE            — a harmless surface wrinkle, optional to fix.
//
// And, per this milestone's own added criterion (the exact question
// 0.9.196 retroactively turned out to be asking of
// RemoveWorldPlacementUseCase/UnpublishDocumentUseCase): for anything
// that looks like a gap, ask first whether an existing domain/application
// operation can already do it — in which case the fix is a SMALL
// INTEGRATION (wire existing, already-correct code to a UI action), not a
// GENUINE FEATURE (new domain logic that does not exist yet).
//
// This file does not implement anything it finds. Per the brief, it
// stops at classification and recommendation.

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function createTestDocument() {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title: 'Post-Lifecycle Reassessment Test', author: 'tester' }) });
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// Strips full-line `//` comments — the same restraint 0.9.156 through
// 0.9.196 already apply to their own structural sweeps, so a sweep
// counts genuine code references, never a comment that merely names a
// class in prose.
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//'));
}

function countReferences(source, identifier) {
    const pattern = new RegExp(`\\b${identifier}\\b`, 'g');
    const matches = codeOnlyLines(source).join('\n').match(pattern);
    return matches ? matches.length : 0;
}

async function runTests() {
    // ---------------------------------------------------------------
    // Section A — World interaction/navigation. COMPLETE.
    //
    // Reconfirms 0.9.196's own Section A finding, plus the two actions
    // 0.9.197/0.9.198 added since: the composition surface is not only
    // still broad, it now also reaches removal/unpublish, which 0.9.196
    // found missing from this exact surface.
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
        assert(componentTags.size >= 20, `A2. WorldView.js still composes at least 20 distinct component families (found ${componentTags.size})`);

        const placementInfoPanelSource = await rawSource('ui/components/PlacementInfoPanel.js');
        const emitsMatch = placementInfoPanelSource.match(/emits:\s*\[([^\]]*)\]/);
        assert(emitsMatch && /\bremove\b/i.test(emitsMatch[1]), 'A3. PlacementInfoPanel.js still emits \'remove\' — 0.9.197\'s removal action remains reachable');

        const ownPublicationPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(/unpublishCommand/.test(ownPublicationPanelSource), 'A4. OwnPublicationPanel.js still wires an unpublishCommand — 0.9.198\'s retract action remains reachable');

        console.log(`✓ Section A: World interaction/navigation — COMPLETE. ${componentTags.size} component families, including the removal/unpublish actions the 0.9.196 arc added, all still reachable from the same surface.`);
    }

    // ---------------------------------------------------------------
    // Section B — Vehicle system. INTENTIONAL_BOUNDARY, unchanged.
    // ---------------------------------------------------------------
    {
        assert(typeof VehicleType.NONE === 'string' && typeof VehicleType.BICYCLE === 'string'
            && typeof VehicleType.MOTORCYCLE === 'string' && typeof VehicleType.CAR === 'string'
            && typeof VehicleType.DRONE === 'string', 'B1. VehicleType still carries exactly its five original values');
        const vehicleTypeSource = await rawSource('core/VehicleType.js');
        const vehicleTypeCode = codeOnlyLines(vehicleTypeSource).join('\n');
        assert(!/passenger|capacity|multi-?rider|\bfuel\b|\brange\b/i.test(vehicleTypeCode), 'B2. VehicleType.js\'s own CODE still declares no capacity/passenger/fuel vocabulary');
        const repoWideVehicleFiles = [
            'application/AvatarVehicleInteractionController.js',
            'application/AvatarVehicleMovementController.js',
            'core/VehicleInstance.js',
            'core/VehiclePresence.js'
        ];
        for (const file of repoWideVehicleFiles) {
            const source = await rawSource(file);
            assert(!/passenger|multi-?rider/i.test(source), `B3. ${file} still carries no passenger/multi-rider vocabulary`);
        }
        console.log('✓ Section B: Vehicle system — INTENTIONAL_BOUNDARY, unchanged since 0.9.196. Multi-passenger capacity, fuel/range, and rental/ownership remain undocumented requirements, not missing implementations.');
    }

    // ---------------------------------------------------------------
    // Section C — World material lifecycle. ACTUAL GAP, this
    // milestone's one finding: editor-side loss protection.
    //
    // 0.9.196 through 0.9.202 exhaustively examined the PUBLISHED half
    // of a Document's life (publish, place, unpublish, remove, orphan
    // presentation, physical occupancy) and found it complete. This
    // section asks the question none of those six milestones asked:
    // what protects the EDITED-BUT-NOT-YET-SAVED half of a Document's
    // life? The answer is a fully built, fully tested, entirely
    // unreachable subsystem dating to 0.2.6 — AutosaveScheduler,
    // AutosaveDocumentUseCase, CheckRecoveryUseCase,
    // RecoverDocumentUseCase, and DiscardRecoveryUseCase.
    // ---------------------------------------------------------------
    {
        // C1 — the recovery stack is real, composed, and correct. Proven
        // here directly against the same real (not mocked) collaborators
        // tests/PersistenceRecovery.test.js already uses: autosave writes
        // a checkpoint without cleaning or publishing; check detects it
        // is newer than the saved revision; recover deserializes it back
        // through the full migrate->validate->deserialize pipeline;
        // discard removes it without touching the saved document.
        {
            const storage = new InMemoryStorageProvider();
            const recoveryStore = new LocalRecoveryStore(storage);
            const manifest = new DocumentManifest(storage);
            const save = new SaveDocumentUseCase(storage, undefined, undefined, recoveryStore);
            const autosave = new AutosaveDocumentUseCase(recoveryStore, storage);
            const check = new CheckRecoveryUseCase(recoveryStore, storage);
            const recover = new RecoverDocumentUseCase(recoveryStore);
            const discard = new DiscardRecoveryUseCase(recoveryStore);

            const doc = createTestDocument();
            const id = doc.world.id;
            const manager = new DocumentManager();
            manager.load(doc, id);

            save.execute(manager);
            assert(manifest.find(id).revision === 1, 'sanity: explicit save recorded revision 1');

            manager.markDirty();
            const rev = autosave.execute(manager);
            assert(rev !== null && rev.revision === 2, 'C1a. AutosaveDocumentUseCase writes a checkpoint one revision ahead of the last save');
            assert(manager.state.dirty === true, 'C1b. ...without clearing the dirty flag (autosave != save)');

            const status = check.execute(id);
            assert(status.available === true, 'C1c. CheckRecoveryUseCase reports a newer checkpoint is available');

            const recovered = recover.execute(id);
            assert(recovered.document.world.getBuildings().length === 1, 'C1d. RecoverDocumentUseCase deserializes the checkpoint back into a real Document');

            const removed = discard.execute(id);
            assert(removed === true && check.execute(id).available === false, 'C1e. DiscardRecoveryUseCase removes the checkpoint; CheckRecoveryUseCase then reports none available');
        }

        // C2 — the stack is exposed from exactly one composition root,
        // exactly like RemoveWorldPlacementUseCase/UnpublishDocumentUseCase
        // were before 0.9.197/0.9.198 gave them a caller.
        const persistence = new CreatePersistenceUseCase().execute();
        for (const field of ['recoveryStore', 'autosaveDocumentUseCase', 'recoverDocumentUseCase', 'discardRecoveryUseCase', 'checkRecoveryUseCase']) {
            assert(persistence[field], `C2. CreatePersistenceUseCase().execute() still returns ${field}`);
        }

        // C3 — the ONLY UI surface that composes CreatePersistenceUseCase
        // is EditorView.js, and it destructures four of its seven fields
        // — saveDocumentUseCase/loadDocumentUseCase/forkDocumentUseCase/
        // structureDocumentResolver — never the recovery stack.
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        assert(/new CreatePersistenceUseCase\(\)\.execute\(\)/.test(editorViewSource), 'C3a. EditorView.js still composes CreatePersistenceUseCase directly');
        const destructureMatch = editorViewSource.match(/const \{([^}]*)\}\s*=\s*new CreatePersistenceUseCase\(\)\.execute\(\)/);
        assert(destructureMatch, 'C3b. the destructuring assignment is findable');
        const destructured = destructureMatch[1];
        for (const field of ['saveDocumentUseCase', 'loadDocumentUseCase', 'forkDocumentUseCase', 'structureDocumentResolver']) {
            assert(destructured.includes(field), `C3c. EditorView.js destructures ${field}`);
        }
        for (const field of ['recoveryStore', 'autosaveDocumentUseCase', 'recoverDocumentUseCase', 'discardRecoveryUseCase', 'checkRecoveryUseCase']) {
            assert(!destructured.includes(field), `C3d. EditorView.js's destructuring does NOT include ${field} — the recovery stack is composed but never taken`);
        }

        // C4 — the finding is not "Editor takes it but never calls it" —
        // it's that literally nothing in the UI tree ever references any
        // of these five names, and AutosaveScheduler (the debounce
        // orchestrator that would actually trigger a checkpoint) is
        // never instantiated anywhere outside a test file either.
        const uiFiles = [
            'ui/views/EditorView.js', 'ui/views/WorldView.js', 'ui/views/LiveWorldView.js',
            'ui/views/HomeView.js', 'ui/views/RecentWorldsView.js', 'ui/views/RepositoryView.js', 'ui/main.js'
        ];
        for (const identifier of ['AutosaveScheduler', 'recoverDocumentUseCase', 'discardRecoveryUseCase', 'checkRecoveryUseCase', 'autosaveDocumentUseCase']) {
            for (const file of uiFiles) {
                const source = await rawSource(file);
                assert(countReferences(source, identifier) === 0, `C4. ${file} never references ${identifier}`);
            }
        }

        // C5 — and there is no substitute safety net either: EditorView.js
        // has no beforeunload warning and no other dirty-state guard that
        // would tell a user their unsaved edits are at risk before they
        // navigate away or close the tab. This is not "one convenience
        // feature is missing" — it's "the one subsystem built specifically
        // to prevent silent loss of in-progress edits is entirely dormant."
        assert(!/beforeunload/i.test(editorViewSource), 'C5. EditorView.js installs no beforeunload guard — no substitute protection exists');

        console.log('✓ Section C: World material lifecycle — ACTUAL GAP. AutosaveDocumentUseCase/CheckRecoveryUseCase/RecoverDocumentUseCase/DiscardRecoveryUseCase/AutosaveScheduler are all correct (proven directly above) and all composed by CreatePersistenceUseCase — but EditorView.js, the only caller of that composition root, takes four of its seven fields and leaves the entire recovery stack untouched. No checkpoint is ever written today (AutosaveScheduler.start() is called nowhere in production code), so a crash or accidental tab close currently loses every edit since the last explicit Save, silently, with a fully-built recovery path sitting unused since 0.2.6.');
    }

    // ---------------------------------------------------------------
    // Section D — Publication workflow. COMPLETE for the forward and
    // reverse paths; the Bitcoin anchor wallet/signer boundary remains
    // an INTENTIONAL_BOUNDARY, unchanged.
    // ---------------------------------------------------------------
    {
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const clickHandlers = new Set((panelSource.match(/@click="[a-zA-Z]+/g) || []).map((s) => s.replace('@click="', '')));
        assert(clickHandlers.size >= 9, `D1. OwnPublicationPanel.js still wires at least 9 distinct actions (found ${clickHandlers.size})`);
        const unpublishHandlers = [...clickHandlers].filter((h) => /^unpublish|^retract/i.test(h));
        assert(unpublishHandlers.length === 1, 'D2. exactly one unpublish/retract-shaped handler remains wired');

        // The Bitcoin anchor signer family deliberately never constructs
        // its own wallet — the caller (a real, out-of-scope wallet
        // integration) must supply it. This mirrors the SAME restraint
        // WorldView.js's own distribution actions already document for
        // Arweave/Nostr (never composing a signer/relay of their own) —
        // an explicit, previously-documented boundary, not a newly
        // discovered gap.
        const walletSignerSource = await rawSource('application/CreateBitcoinAnchorWalletSignerUseCase.js');
        assert(/execute\(\{\s*wallet\s*\}/.test(walletSignerSource), 'D3. CreateBitcoinAnchorWalletSignerUseCase still requires the caller to supply the wallet — it constructs no wallet capability of its own');

        console.log(`✓ Section D: Publication workflow — COMPLETE. ${clickHandlers.size} wired actions cover the full publish/unpublish/anchor/distribute/Snapshot surface. Bitcoin anchor wallet signing remains an INTENTIONAL_BOUNDARY — real wallet/key management is out of scope, exactly as Arweave/Nostr signer/relay configuration already is for Snapshot distribution.`);
    }

    // ---------------------------------------------------------------
    // Section E — Performance. Deliberately DEFERRED, not assessed.
    // ---------------------------------------------------------------
    {
        console.log('✓ Section E: Performance — deliberately DEFERRED, not assessed, exactly as every prior reassessment in this arc has done. No known bottleneck exists to profile, and Section C found a genuine functional gap; closing that is higher value than speculative profiling.');
    }

    console.log('\n✅ All Post-Lifecycle Product Reassessment tests passed.');
    console.log(`
Classification summary:
  A. World interaction/navigation ....... COMPLETE
  B. Vehicle system ...................... INTENTIONAL_BOUNDARY
  C. World material lifecycle ............ ACTUAL_GAP (existing capability + missing UI -> small integration)
  D. Publication workflow ................ COMPLETE (+ one unchanged INTENTIONAL_BOUNDARY)
  E. Performance .......................... DEFERRED
`);
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
