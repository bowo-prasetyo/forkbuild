import { readFile } from 'node:fs/promises';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import WorldEncounterMarker from '../ui/components/WorldEncounterMarker.js';
import WandererMarker from '../ui/components/WandererMarker.js';
import { describeWorldEncounterView } from '../application/WorldEncounterView.js';
import { describeWorldEncounterReadModel } from '../application/WorldEncounterReadModel.js';
import { deriveWorldEncounters } from '../core/WorldEncounter.js';

// 0.9.3 — World View UI / Wanderer Presence.
//
// This milestone adds three new UI-layer files, all Options API, executed
// directly below via their own `computed`/`props` — the same "call
// computed.call(ctx)" discipline
// ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelectorUI.test.js
// already established for a dumb, zero-`application/`-import component:
//   ui/components/WorldEncounterMarker.js  — one encounterable object
//   ui/components/WandererMarker.js        — the Wanderer's own marker
//   ui/components/WorldEncounterCanvas.js  — the top-level World View surface
//
// Section A: FLAGSHIP — 2 publications, 1 avatar, the Wanderer: all three
//            kinds project onto the canvas.
// Section B: coordinate mapping — screen X ← world x, screen Y ← world z,
//            world y (elevation) never enters the mapping.
// Section C: publications and avatars stay in separate, non-crossing
//            projected arrays.
// Section D: the Wanderer renders independently of encounter data —
//            WandererMarker takes no view/encounter prop at all.
// Section E: empty world (0 publications, 0 avatars) still projects the
//            Wanderer — an empty World is never an empty screen.
// Section F: no sorting — projected order matches the supplied view's own
//            row order.
// Section G: malformed/absent `view` degrades to zero markers, never
//            throws; the Wanderer still projects.
// Section H: WorldEncounterMarker's own `kind`/glyph contract.
// Section I: this milestone's dumb marker components
//            (WorldEncounterMarker.js, WandererMarker.js) import NOTHING —
//            no application/, no core/, not even vue.
// Section J: WorldEncounterCanvas.js imports no core/ module, and (as of
//            0.9.18) exactly two application/ modules —
//            WorldDiscoveryRegistryProjection.js's own
//            describeWorldFromDiscoveryRegistry() and
//            WorldEncounterInspection.js's own
//            describeWorldEncounterInspection() — alongside its own two
//            sibling components.
// Section K: no distance/nearby/radius/score/rank/trust/verified/winner/
//            correctness vocabulary anywhere in this milestone's own code.
// Section L: consumes 0.9.2's own view result directly, end to end.
//
// 0.9.13 note: WorldEncounterCanvas.js gained an optional `registry` prop
// and an `effectiveView` computed sitting in front of `publicationRows`/
// `avatarRows` (registry wins when supplied, otherwise falls back to the
// `view` prop unchanged). Every ctx below never supplies `registry`, so
// `effectiveView` always resolves to `view` exactly as before — this
// file's own sections are otherwise unmodified and still exercise the
// pre-0.9.13 `view`-prop-only contract end to end. Live registry
// subscription itself is covered separately, in
// tests/LiveWorldViewRegistrySubscription.test.js.
//
// 0.9.18 note: WorldEncounterCanvas.js gained a `selectedEncounterInspection`
// computed and a second application/ import — see Section J, updated
// above. Rendering the selected encounter's own inspection is covered
// separately, in tests/WorldEncounterInspectionUI.test.js; this file's own
// sections stay focused on 0.9.3/0.9.4's own projection/selection
// contract, unaffected by that addition.
//
// 0.9.20 note: WorldEncounterCanvas.js gained `selectionOutcome`/
// `resolvedSelectionChoice` page-local state, a `resolvedEncounterSelection`
// computed, `refreshSelectionOutcome()`/`chooseSelectionOrigin()` methods,
// and a third application/ import — see Section J, updated again below.
// Resolving provenance-aware selection is covered separately, in
// tests/WorldEncounterSelectionResolutionUI.test.js; this file's own
// sections stay focused on 0.9.3/0.9.4's own projection/selection
// contract, unaffected by that addition.
//
// 0.9.40 note: WorldEncounterCanvas.js gained `worldDiscoveryLeadRegistry`/
// `decentralizedLeadAssociations` props, `decentralizedLeadOutcome`/
// `resolvedLeadChoice`/`unsubscribeWorldDiscoveryLeadRegistry` page-local
// state, a `resolvedLead` computed, `refreshDecentralizedLeadOutcome()`/
// `chooseDecentralizedLead()` methods, and a fifth application/ import —
// see Section J, updated again below. Resolving decentralized leads is
// covered separately, in
// tests/DecentralizedWorldEncounterLeadSelectionUI.test.js; this file's own
// sections stay focused on 0.9.3/0.9.4's own projection/selection contract,
// unaffected by that addition.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function publicationRow(overrides = {}) {
    return {
        objectId: 'pub-1',
        title: 'First Publication',
        publisherIdentity: { username: 'alice' },
        isSigned: true,
        x: 10,
        y: 3,
        z: 20,
        anchorCount: 0,
        placementCount: 0,
        ...overrides
    };
}

function avatarRow(overrides = {}) {
    return {
        objectId: 'avatar-1',
        ownerIdentity: 'bob',
        displayName: 'Bob',
        x: -10,
        y: 0,
        z: -20,
        ...overrides
    };
}

function viewOf({ publications = [], avatars = [] } = {}) {
    const totalCount = publications.length + avatars.length;
    return {
        isEmpty: totalCount === 0,
        publicationCount: publications.length,
        avatarCount: avatars.length,
        totalCount,
        publications,
        avatars
    };
}

// Mirrors ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelectorUI.test.js's
// own `ctx.decisionPool = selector.computed.decisionPool.call(ctx)` discipline:
// `publicationRows`/`avatarRows` are themselves computed properties that
// `projectedPublications`/`projectedAvatars`/`isWorldEmpty` depend on, so
// this harness resolves them onto `ctx` first, exactly as Vue's own
// reactivity would before any dependent computed reads `this.publicationRows`.
function canvasCtx({ view, wandererPosition } = {}) {
    const ctx = {
        view: view !== undefined ? view : WorldEncounterCanvas.props.view.default(),
        // Never supplied by this file's own tests — see this file's own
        // header, "0.9.13 note." `effectiveView` below therefore always
        // falls back to `view`, exactly as every section here expects.
        registry: null,
        wandererPosition: wandererPosition || { x: 0, y: 0, z: 0 }
    };
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    ctx.avatarRows = WorldEncounterCanvas.computed.avatarRows.call(ctx);
    return ctx;
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: 2 publications, 1 avatar, the Wanderer.
    // ---------------------------------------------------------------
    {
        const view = viewOf({
            publications: [
                publicationRow({ objectId: 'pub-1', title: 'First' }),
                publicationRow({ objectId: 'pub-2', title: 'Second', x: 5, z: 5 })
            ],
            avatars: [avatarRow({ objectId: 'avatar-1' })]
        });
        const ctx = canvasCtx({ view });

        const projectedPublications = WorldEncounterCanvas.computed.projectedPublications.call(ctx);
        const projectedAvatars = WorldEncounterCanvas.computed.projectedAvatars.call(ctx);
        const projectedWanderer = WorldEncounterCanvas.computed.projectedWanderer.call(ctx);

        assert(projectedPublications.length === 2, '1. FLAGSHIP — both publications project onto the canvas');
        assert(projectedAvatars.length === 1, '2. FLAGSHIP — the avatar projects onto the canvas');
        assert(projectedWanderer && Number.isFinite(projectedWanderer.x) && Number.isFinite(projectedWanderer.y), '3. FLAGSHIP — the Wanderer always projects to a finite x/y');
        assert(projectedPublications.every((m) => m.objectId), '4. FLAGSHIP — every projected publication carries its own objectId');
        assert(projectedAvatars[0].objectId === 'avatar-1', '5. FLAGSHIP — the projected avatar carries its own objectId');

        console.log('✓ Section A: FLAGSHIP — 2 publications, 1 avatar, and the Wanderer all project onto the canvas');
    }

    // ---------------------------------------------------------------
    // Section B — coordinate mapping: screen X ← world x, screen Y ← world z.
    // ---------------------------------------------------------------
    {
        // WORLD_HALF_SPAN = 50, CANVAS_SIZE = 600 -> center (0,0) maps to
        // (300,300); +50 maps to 600; -50 maps to 0.
        const origin = viewOf({ publications: [publicationRow({ x: 0, y: 999, z: 0 })] });
        const atOrigin = WorldEncounterCanvas.computed.projectedPublications.call(canvasCtx({ view: origin }))[0];
        assert(atOrigin.x === 300 && atOrigin.y === 300, `6. world (0,_,0) maps to canvas center (300,300), got (${atOrigin.x},${atOrigin.y})`);

        const atEdge = viewOf({ publications: [publicationRow({ x: 50, y: 0, z: -50 })] });
        const edgeMarker = WorldEncounterCanvas.computed.projectedPublications.call(canvasCtx({ view: atEdge }))[0];
        assert(edgeMarker.x === 600 && edgeMarker.y === 0, `7. world (50,_,-50) maps to canvas (600,0), got (${edgeMarker.x},${edgeMarker.y})`);

        const quarter = viewOf({ publications: [publicationRow({ x: 25, y: 0, z: -25 })] });
        const quarterMarker = WorldEncounterCanvas.computed.projectedPublications.call(canvasCtx({ view: quarter }))[0];
        assert(quarterMarker.x === 450 && quarterMarker.y === 150, `8. world (25,_,-25) maps to canvas (450,150), got (${quarterMarker.x},${quarterMarker.y})`);

        // Elevation (world y) never enters the mapping — two rows differing
        // only in y project identically.
        const lowY = viewOf({ publications: [publicationRow({ objectId: 'p', x: 10, y: -500, z: 10 })] });
        const highY = viewOf({ publications: [publicationRow({ objectId: 'p', x: 10, y: 500, z: 10 })] });
        const lowMarker = WorldEncounterCanvas.computed.projectedPublications.call(canvasCtx({ view: lowY }))[0];
        const highMarker = WorldEncounterCanvas.computed.projectedPublications.call(canvasCtx({ view: highY }))[0];
        assert(lowMarker.x === highMarker.x && lowMarker.y === highMarker.y, '9. world elevation (y) never enters the screen mapping');

        // The Wanderer's own position maps through the identical function.
        const wandererCtx = canvasCtx({ wandererPosition: { x: 25, y: 0, z: -25 } });
        const projectedWanderer = WorldEncounterCanvas.computed.projectedWanderer.call(wandererCtx);
        assert(projectedWanderer.x === 450 && projectedWanderer.y === 150, `10. the Wanderer's own position maps through the identical x/z transform, got (${projectedWanderer.x},${projectedWanderer.y})`);

        console.log('✓ Section B: screen X ← world x, screen Y ← world z, elevation never enters the mapping');
    }

    // ---------------------------------------------------------------
    // Section C — publications and avatars stay separate.
    // ---------------------------------------------------------------
    {
        const view = viewOf({
            publications: [publicationRow({ objectId: 'pub-1' })],
            avatars: [avatarRow({ objectId: 'avatar-1' })]
        });
        const ctx = canvasCtx({ view });
        const projectedPublications = WorldEncounterCanvas.computed.projectedPublications.call(ctx);
        const projectedAvatars = WorldEncounterCanvas.computed.projectedAvatars.call(ctx);

        assert(projectedPublications.every((m) => m.objectId !== 'avatar-1'), '11. an avatar never appears among projected publications');
        assert(projectedAvatars.every((m) => m.objectId !== 'pub-1'), '12. a publication never appears among projected avatars');
        assert(!('objects' in WorldEncounterCanvas.computed), '13. there is no flattened, generic "objects" computed property');

        console.log('✓ Section C: publications and avatars stay in separate, non-crossing projected arrays');
    }

    // ---------------------------------------------------------------
    // Section D — the Wanderer renders independently of encounter data.
    // ---------------------------------------------------------------
    {
        assert(!('view' in WandererMarker.props), '14. WandererMarker takes no `view` prop');
        assert(!('publications' in WandererMarker.props) && !('avatars' in WandererMarker.props), '15. WandererMarker takes no encounter-data props at all');
        assert(Object.keys(WandererMarker.props).sort().join(',') === 'x,y', '16. WandererMarker\'s only props are its own already-projected x/y');

        console.log('✓ Section D: WandererMarker renders independently of any encounter data — it has no encounter props to depend on');
    }

    // ---------------------------------------------------------------
    // Section E — empty world still projects the Wanderer.
    // ---------------------------------------------------------------
    {
        const emptyView = viewOf();
        const ctx = canvasCtx({ view: emptyView, wandererPosition: { x: 3, y: 0, z: 4 } });

        assert(WorldEncounterCanvas.computed.isWorldEmpty.call(ctx) === true, '17. 0 publications, 0 avatars — isWorldEmpty is true');
        assert(WorldEncounterCanvas.computed.projectedPublications.call(ctx).length === 0, '18. an empty world projects zero publications');
        assert(WorldEncounterCanvas.computed.projectedAvatars.call(ctx).length === 0, '19. an empty world projects zero avatars');
        const projectedWanderer = WorldEncounterCanvas.computed.projectedWanderer.call(ctx);
        assert(Number.isFinite(projectedWanderer.x) && Number.isFinite(projectedWanderer.y), '20. the Wanderer STILL projects to a finite position in an empty world — an empty World is not an empty screen');

        console.log('✓ Section E: an empty world (0/0) still produces a World View containing the Wanderer');
    }

    // ---------------------------------------------------------------
    // Section F — no sorting: projected order matches the supplied order.
    // ---------------------------------------------------------------
    {
        const view = viewOf({
            publications: [
                publicationRow({ objectId: 'p3', title: 'Third' }),
                publicationRow({ objectId: 'p1', title: 'First' }),
                publicationRow({ objectId: 'p2', title: 'Second' })
            ],
            avatars: [
                avatarRow({ objectId: 'a3' }),
                avatarRow({ objectId: 'a1' }),
                avatarRow({ objectId: 'a2' })
            ]
        });
        const ctx = canvasCtx({ view });

        assert(serialize(WorldEncounterCanvas.computed.projectedPublications.call(ctx).map((m) => m.objectId)) === serialize(['p3', 'p1', 'p2']), '21. publication order is never re-sorted');
        assert(serialize(WorldEncounterCanvas.computed.projectedAvatars.call(ctx).map((m) => m.objectId)) === serialize(['a3', 'a1', 'a2']), '22. avatar order is never re-sorted');

        const canvasSource = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
        const canvasCodeOnly = canvasSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!canvasCodeOnly.includes('.sort('), '23. WorldEncounterCanvas.js\'s own code contains no sort() call anywhere');

        console.log('✓ Section F: projected order preserves the supplied view\'s own row order — no sorting anywhere');
    }

    // ---------------------------------------------------------------
    // Section G — malformed/absent `view` degrades gracefully.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-an-object', 42, {}, { publications: 'nope' }, { publications: null, avatars: null }]) {
            const ctx = canvasCtx({ view: malformed, wandererPosition: { x: 1, y: 0, z: 2 } });
            assert(WorldEncounterCanvas.computed.projectedPublications.call(ctx).length === 0, `24. malformed view (${serialize(malformed)}) projects zero publications`);
            assert(WorldEncounterCanvas.computed.projectedAvatars.call(ctx).length === 0, `25. malformed view (${serialize(malformed)}) projects zero avatars`);
            assert(WorldEncounterCanvas.computed.isWorldEmpty.call(ctx) === true, `26. malformed view (${serialize(malformed)}) reports isWorldEmpty true`);
            const projectedWanderer = WorldEncounterCanvas.computed.projectedWanderer.call(ctx);
            assert(Number.isFinite(projectedWanderer.x) && Number.isFinite(projectedWanderer.y), `27. malformed view (${serialize(malformed)}) still projects the Wanderer`);
        }
        assert(WorldEncounterCanvas.props.view.default().isEmpty === true, '28. the view prop\'s own default is an empty, isEmpty-true shape');

        console.log('✓ Section G: malformed/absent view degrades to zero markers, never throws — the Wanderer still projects');
    }

    // ---------------------------------------------------------------
    // Section H — WorldEncounterMarker's own kind/glyph contract.
    // ---------------------------------------------------------------
    {
        assert(WorldEncounterMarker.computed.glyph.call({ kind: 'PUBLICATION' }) === '📄', '29. a PUBLICATION marker glyphs as 📄');
        assert(WorldEncounterMarker.computed.glyph.call({ kind: 'AVATAR' }) === '👤', '30. an AVATAR marker glyphs as 👤');
        assert(WorldEncounterMarker.props.kind.validator('PUBLICATION') === true, '31. the kind validator accepts PUBLICATION');
        assert(WorldEncounterMarker.props.kind.validator('AVATAR') === true, '32. the kind validator accepts AVATAR');
        assert(WorldEncounterMarker.props.kind.validator('CLAIM') === false, '33. the kind validator rejects a third kind — 0.9.0 never named a third');
        assert(WorldEncounterMarker.props.kind.required === true, '34. kind is a required prop');
        assert(WorldEncounterMarker.props.x.required === true && WorldEncounterMarker.props.y.required === true, '35. x/y are required props — already-projected coordinates, never optional');

        console.log('✓ Section H: WorldEncounterMarker draws exactly the two kinds 0.9.0 named, never a third');
    }

    // ---------------------------------------------------------------
    // Section I — dumb marker components import NOTHING.
    // ---------------------------------------------------------------
    {
        for (const path of ['../ui/components/WorldEncounterMarker.js', '../ui/components/WandererMarker.js']) {
            const source = await readFile(new URL(path, import.meta.url), 'utf8');
            const importLines = source.split('\n').filter((line) => line.trim().startsWith('import '));
            assert(importLines.length === 0, `36. ${path} imports nothing — no application/, no core/, not even vue`);
        }

        console.log('✓ Section I: WorldEncounterMarker.js and WandererMarker.js import nothing — they consume props alone');
    }

    // ---------------------------------------------------------------
    // Section J — WorldEncounterCanvas.js's own import boundary (updated
    // for 0.9.144: exactly eight application/ modules now, still no core/).
    // ---------------------------------------------------------------
    {
        const source = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
        const importLines = source.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 10, '37. WorldEncounterCanvas.js has exactly ten imports as of 0.9.144');
        assert(importLines.some((line) => line.includes('./WorldEncounterMarker.js')) && importLines.some((line) => line.includes('./WandererMarker.js')), '38. WorldEncounterCanvas.js still imports its own two sibling marker components');
        assert(!importLines.some((line) => line.includes('core/')), '39. WorldEncounterCanvas.js never imports any core/ module directly — it receives the projected view as a prop, or via the application/ seams below, instead');
        const applicationImportLines = importLines.filter((line) => line.includes('application/'));
        assert(applicationImportLines.length === 8, '40. WorldEncounterCanvas.js imports exactly eight application/ modules as of 0.9.144');
        assert(applicationImportLines.some((line) => line.includes('WorldDiscoveryRegistryProjection.js') && line.includes('describeWorldFromDiscoveryRegistry')), '41. the 0.9.13 registry-projection import — WorldDiscoveryRegistryProjection.js\'s own describeWorldFromDiscoveryRegistry() — is unchanged');
        assert(applicationImportLines.some((line) => line.includes('WorldEncounterInspection.js') && line.includes('describeWorldEncounterInspection')), '42. the 0.9.18 inspection import — WorldEncounterInspection.js\'s own describeWorldEncounterInspection() — is unchanged');
        assert(applicationImportLines.some((line) => line.includes('WorldEncounterSelectionOutcome.js') && line.includes('describeWorldEncounterSelectionOutcomeFromRegistry')), '43. the 0.9.20 selection-resolution import — WorldEncounterSelectionOutcome.js\'s own describeWorldEncounterSelectionOutcomeFromRegistry() — is unchanged');
        assert(applicationImportLines.some((line) => line.includes('WorldEncounterMaterialInspection.js') && line.includes('inspectWorldEncounterMaterial')), '45. the 0.9.39 material-inspection import — WorldEncounterMaterialInspection.js\'s own inspectWorldEncounterMaterial() — is unchanged');
        assert(applicationImportLines.some((line) => line.includes('DecentralizedWorldEncounterLeadSelection.js') && line.includes('describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry')), '46. 0.9.40\'s own application/ import — DecentralizedWorldEncounterLeadSelection.js\'s own describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry() — is unchanged');
        assert(applicationImportLines.some((line) => line.includes('PublicationDistributionLifecycle.js') && line.includes('PublicationDistributionState')), '47. 0.9.100 adds exactly one new application/ import — PublicationDistributionLifecycle.js\'s own PublicationDistributionState enum, never the describe/transition functions alongside it');
        assert(applicationImportLines.some((line) => line.includes('PublicationMaterialProvenance.js') && line.includes('describePublicationMaterialProvenanceFromInspection')), '48. 0.9.112 adds exactly one new application/ import — PublicationMaterialProvenance.js\'s own describePublicationMaterialProvenanceFromInspection(), never a second provenance derivation of its own');
        assert(applicationImportLines.some((line) => line.includes('SnapshotPublicationAttribution.js') && line.includes('resolveSnapshotPublicationAttribution')), '48b. 0.9.144 adds exactly one new application/ import — SnapshotPublicationAttribution.js\'s own resolveSnapshotPublicationAttribution(), the same pure, no-I/O function OwnPublicationPanel.js already calls directly');
        assert(!importLines.some((line) => line.includes('WorldEncounterIntegration.js') || line.includes('WorldEncounterReadModel.js') || line.includes('WorldEncounterView.js') || line.includes('WorldDiscoverySourceRegistry.js') || line.includes('WorldEncounterSelectionResolution.js') || line.includes('WorldEncounterMaterialLoading.js') || line.includes('DecentralizedWorldEncounterLeadAwareMaterialLoading.js') || line.includes('WorldEncounterMaterialVerification.js') || line.includes('DecentralizedWorldEncounterLeadResolution.js') || line.includes('DecentralizedWorldDiscoveryLeadRegistry.js') || line.includes('DecentralizedWorldEncounterLeadAssociation.js') || line.includes('PublicationDistributionLifecycleStore.js') || line.includes('PublicationDistributionLifecycleTransition.js') || line.includes('PublicationDistributionOrchestrator.js') || line.includes('PublicationDistributionRuntimeComposition.js') || line.includes('PublicationDistributionExecutor.js') || line.includes('ArweavePublicationMaterialUploader.js') || line.includes('NostrPublicationDiscoveryPublisher.js') || line.includes('DecentralizedSnapshotResolver.js') || line.includes('DiscoverSnapshotCommand.js') || line.includes('ArweaveContentStore.js') || line.includes('NostrSnapshotDiscoveryQueryService.js')), '44. WorldEncounterCanvas.js never imports deriveWorldEncounters(), assembleWorldDiscoveryInputs(), describeWorldFromDiscoverySources(), either registry class itself, 0.9.19\'s own candidate function, 0.9.28\'s own resolution function directly, either loading/verification boundary directly, a second lifecycle store/transition, a distribution execution/orchestration collaborator directly, or any Snapshot discovery/resolution/storage collaborator directly — only the eight application/ seams it depends on');

        console.log('✓ Section J: WorldEncounterCanvas.js never imports core/WorldEncounter.js, and imports exactly eight application/ modules — describeWorldFromDiscoveryRegistry(), describeWorldEncounterInspection(), describeWorldEncounterSelectionOutcomeFromRegistry(), inspectWorldEncounterMaterial(), describeDecentralizedWorldEncounterLeadSelectionOutcomeFromRegistry(), PublicationDistributionState, describePublicationMaterialProvenanceFromInspection(), and resolveSnapshotPublicationAttribution() — as of 0.9.144');
    }

    // ---------------------------------------------------------------
    // Section K — no spatial-intelligence or evaluative vocabulary anywhere
    // in this milestone's own code.
    // ---------------------------------------------------------------
    {
        const forbiddenInCode = [
            'score', 'rank', 'winner', 'trust', 'reputation', 'verified', 'confidence',
            'distance', 'nearest', 'nearby', 'radius', 'cluster', 'relevance', 'priorit',
            'fetch(', 'websocket', 'localstorage'
        ];
        for (const path of ['../ui/components/WorldEncounterCanvas.js', '../ui/components/WorldEncounterMarker.js', '../ui/components/WandererMarker.js']) {
            const source = await readFile(new URL(path, import.meta.url), 'utf8');
            const rawCodeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
            const codeOnly = rawCodeOnly.toLowerCase();
            for (const term of forbiddenInCode) {
                if (term === 'verified' && path.includes('WorldEncounterCanvas.js')) {
                    // 0.9.113 note: comparing a discovery result's own
                    // ALREADY-EXISTING `verification.status` against the
                    // literal `'VERIFIED'` value 0.9.37 itself defines — for
                    // exactly one selection-eligibility gate,
                    // `isDiscoveredPublicationSelectable` — is not new
                    // trust/verified vocabulary invented at this layer; see
                    // WorldEncounterCanvas.js's own 0.9.113 header, "only a
                    // VERIFIED discovery result is selectable." This is
                    // narrowly distinct from `isVerified`/`isTrusted`/
                    // `isAuthentic`-style labels or narrative "Verified" UI
                    // copy, which stay banned exactly as before: the check
                    // below strips ONLY that one sanctioned literal
                    // comparison, then re-applies the full ban to whatever
                    // remains.
                    const sanctioned = rawCodeOnly.split("status === 'VERIFIED'").join('');
                    assert(!sanctioned.toLowerCase().includes('verified'),
                        `42. ${path}'s own code never carries "verified" beyond the one sanctioned status === 'VERIFIED' eligibility comparison`);
                    continue;
                }
                assert(!codeOnly.includes(term), `42. ${path}'s own code never carries "${term}"`);
            }
        }

        console.log('✓ Section K: no distance/nearby/radius/score/rank/trust/verified/winner/correctness vocabulary appears in this milestone\'s own code');
    }

    // ---------------------------------------------------------------
    // Section L — consumes 0.9.2's own view result directly, end to end.
    // ---------------------------------------------------------------
    {
        const encounters = deriveWorldEncounters({
            publications: [
                { id: 'pub-1', title: 'Real Publication', publisherIdentity: { username: 'alice' }, signature: { signedBy: 'alice' } }
            ],
            placements: [
                { id: 'placement-1', publicationId: 'pub-1', position: { x: 12, y: 0, z: -8 } }
            ],
            avatarProfiles: [{ avatarId: 'avatar-1', ownerIdentity: 'bob', displayName: 'Bob' }],
            avatarPresences: [{ avatarId: 'avatar-1', position: { x: -4, y: 0, z: 6 } }]
        });
        const readModel = describeWorldEncounterReadModel(encounters);
        const view = describeWorldEncounterView(readModel);
        const ctx = canvasCtx({ view });

        const projectedPublications = WorldEncounterCanvas.computed.projectedPublications.call(ctx);
        const projectedAvatars = WorldEncounterCanvas.computed.projectedAvatars.call(ctx);

        assert(projectedPublications.length === 1 && projectedPublications[0].objectId === 'pub-1' && projectedPublications[0].label === 'Real Publication', '43. a genuine 0.9.0 -> 0.9.1 -> 0.9.2 chain result projects the real publication correctly');
        assert(projectedAvatars.length === 1 && projectedAvatars[0].objectId === 'avatar-1' && projectedAvatars[0].label === 'Bob', '44. a genuine 0.9.0 -> 0.9.1 -> 0.9.2 chain result projects the real avatar correctly');
        assert(WorldEncounterCanvas.computed.isWorldEmpty.call(ctx) === false, '45. a genuine non-empty chain result reports isWorldEmpty false');

        console.log('✓ Section L: WorldEncounterCanvas consumes 0.9.2\'s own describeWorldEncounterView() result end to end');
    }

    console.log('\nAll WorldEncounterCanvasUI tests passed.');
}

run().catch((error) => {
    console.error('WorldEncounterCanvasUI.test.js FAILED:', error);
    process.exitCode = 1;
});
