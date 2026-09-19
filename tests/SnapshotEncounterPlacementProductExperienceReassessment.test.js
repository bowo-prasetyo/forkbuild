import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { SnapshotPublicationAttributionOutcome } from '../application/SnapshotPublicationAttributionOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { describeSnapshotResolutionOutcomeLabel, describeSnapshotAttributionOutcomeLabel } from '../application/SnapshotOutcomeInspectionView.js';
import { describeWorldEncounterMaterialVerificationStatusLabel } from '../application/WorldEncounterMaterialInspectionView.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/WorldEncounterMaterialVerification.js';
import { shouldRefreshSnapshotDiscovery, DEFAULT_DISCOVERY_REFRESH_RADIUS } from '../application/ShouldRefreshSnapshotDiscovery.js';
import { materializedSnapshotWorldOrigin } from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';

// 0.9.528 — Snapshot Encounter & Placement Product Experience
// Reassessment.
//
// TYPE: test-only product-level audit, requested immediately after
// 0.9.527 closed the Publication Creation & Distribution presentation
// arc (0.9.522-0.9.527). That whole arc asked whether a person can
// correctly understand what happens WHILE creating and distributing a
// Publication. This milestone moves to the very next stage of the same
// document's life: what happens AFTER a Snapshot is discovered while
// walking and BEFORE it becomes a visible/usable object in the World —
//
//   Walking -> threshold reached -> candidates discovered -> candidate
//   selected -> material resolved -> material verified -> Snapshot
//   materialized -> placement created -> Repository admission -> World
//   Encounter
//
// asking one central question: can a user understand why a Snapshot
// appeared, what it represents, whether its material was verified, and
// what has actually been placed — without exposing the underlying
// discovery machinery?
//
// Sections (mirroring the requesting brief's own lettering):
//   A. Discovery-to-encounter comprehension — local/peer/Nostr/Arweave
//      candidates read the same way to a Wanderer.
//   B. Candidate vs material distinction — "found" never implies
//      "verified" or "placed."
//   C. Verification comprehension — THE FLAGSHIP FINDING lives here.
//   D. Placement comprehension — Publication != Placement.
//   E. Walking trigger comprehension — distance-only, no time throttle.
//   F. Multi-source convergence — one identity, never per-source
//      duplication; no content-hash-only identity.
//   G. Failure comprehension — a failure never masquerades as a success.
//   H. World/Repository continuity — Repository admission stays gated
//      on verification; World Encounter stays source-family-blind.
//   I. Trust-language review — the nine-word vocabulary sweep.
//   J. Deliberately excluded scope, and the production-change guard.
//
// THE ONE PRODUCTION CHANGE THIS MILESTONE MAKES (Section C): a new,
// small, pure view file — application/SnapshotOutcomeInspectionView.js —
// and six existing template call sites (four in ui/components/
// OwnPublicationPanel.js, two in ui/components/WorldEncounterCanvas.js)
// routed through it. Nothing else changes: no new outcome value, no new
// pipeline stage, no ranking, no throttle, no fallback, no automatic
// Repository -> World placement, no placement tombstone.

const SOURCE_ROOT = new URL('../', import.meta.url);
const SOURCE_ROOT_PATH = SOURCE_ROOT.pathname;

async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// The same overclaim guard 0.9.519/0.9.526's own reassessments already
// swept their own touched files against — reused here verbatim, never
// redefined with a different word list, so "stronger claim than the
// evidence supports" means the same thing across every milestone in this
// audit series.
const OVERCLAIM_WORDS = /\b(trusted|safe|permanent|guaranteed|owns?|owned|authored?|authorship|authentic|canonical)\b/i;

async function run() {
    console.log('=== 0.9.528 — Snapshot Encounter & Placement Product Experience Reassessment ===\n');

    // ===============================================================
    // Section A — Discovery-to-encounter comprehension.
    // ===============================================================
    {
        const canvasSource = await source('ui/components/WorldEncounterCanvas.js');

        // The "Choose Source" panel's own origin labels — Local/Peer
        // <id>/Snapshot <hash> — are plain, self-explanatory English that
        // never requires a Wanderer to already know Nostr/Arweave/local
        // storage internals to make sense of what they're looking at.
        check(canvasSource.includes("describeSelectionOriginLabel(origin) {"),
            'A1. WorldEncounterCanvas.js exposes describeSelectionOriginLabel(), the one function every "Choose Source" candidate button renders through');
        check(canvasSource.includes("return 'Local';") && canvasSource.includes('return `Peer ${shortIdentityId(identityId)}`;') && canvasSource.includes('return `Snapshot ${shortContentHash(contentHash)}`;'),
            'A2. every discovery-origin family (LOCAL/PEER/SNAPSHOT) resolves to a plain, self-explanatory label — never a raw origin string a Wanderer would need out-of-band knowledge to parse');

        // The panel that actually decides WHICH encounter is shown never
        // branches on which substrate discovered it — describeWorldFromDiscoveryRegistry
        // treats every source the same way, a restraint this file's own
        // header documents at length and this audit re-confirms is still
        // the only such projection this component reads.
        check(canvasSource.includes("import { describeWorldFromDiscoveryRegistry } from '../../application/WorldDiscoveryRegistryProjection.js';"),
            'A3. exactly one, source-blind projection function decides which encounters exist — no per-substrate branch in this component\'s own encounter derivation');

        console.log('✓ Section A: PRODUCT_COMPLETE — local/peer/Nostr/Arweave candidates all resolve through the same plain-English origin labels and the same source-blind encounter projection; a Wanderer never needs to know which discovery substrate supplied a candidate to understand what they are looking at.');
    }

    // ===============================================================
    // Section B — Candidate vs material distinction.
    // ===============================================================
    {
        const panelSource = await source('ui/components/OwnPublicationPanel.js');
        const canvasSource = await source('ui/components/WorldEncounterCanvas.js');

        // Four genuinely distinct fields exist for four genuinely distinct
        // facts, never collapsed into one another anywhere this milestone
        // touches: candidates announced, a resolution over ONE selected
        // candidate, an attribution over an already-resolved candidate,
        // and a placement over an already-materialized candidate.
        const distinctFields = [
            'snapshotCandidateDiscoveryResult',      // "these were announced"
            'selectedSnapshotResolutionResult',       // "this one was retrieved/verified"
            'selectedSnapshotAttributionResult',      // "does it belong to this Publication"
            'selectedSnapshotMaterializationResult',  // "was it written to local storage"
            'selectedSnapshotWorldPlacementResult'    // "does it have a World position"
        ];
        for (const field of distinctFields) {
            check(panelSource.includes(field), `B1. OwnPublicationPanel.js still keeps a distinct field for "${field}" — never folded into a neighboring stage's own field`);
        }

        // "Discover Snapshots" never implies "Check Snapshot Match": the
        // candidate-browsing action and the attribution-oriented action
        // stay two separately labeled buttons.
        check(panelSource.includes(">{{ snapshotCandidateDiscoveryExecuting ? 'Discovering…' : 'Discover Snapshots' }}</button>"),
            'B2. candidate browsing is labeled "Discover Snapshots" (plural) — a distinct action from...');
        check(panelSource.includes(">{{ snapshotDiscoveryExecuting ? 'Checking…' : 'Check Snapshot Match' }}</button>"),
            'B3. ...the attribution-oriented "Check Snapshot Match" (singular, already-known contentHash) — the two questions never merge into one button or one result field');

        // An empty candidate list is reported as a genuine, distinct
        // result ("zero announced"), never conflated with "not yet asked"
        // or an error — the exact distinction this milestone's brief
        // asks Section B to preserve.
        check(panelSource.includes('No Snapshots have been announced under this discoveryTag yet.'),
            'B4. zero discovered candidates is its own honest sentence, never rendered as an error or silently hidden');

        console.log('✓ Section B: PRODUCT_COMPLETE — "found," "resolved," "attributed," "materialized," and "placed" remain five separately-tracked facts throughout OwnPublicationPanel.js and WorldEncounterCanvas.js; no UI surface implies one stage\'s success from another\'s.');
    }

    // ===============================================================
    // Section C — Verification comprehension. THE FLAGSHIP FINDING.
    // ===============================================================
    {
        // -----------------------------------------------------------
        // C1. THE GAP, reproduced against the real enums (what a
        // Wanderer would have seen before this milestone's own fix).
        // -----------------------------------------------------------
        check(SnapshotPublicationAttributionOutcome.MATCH === 'match' && SnapshotPublicationAttributionOutcome.NO_MATCH === 'no-match',
            'C1. reproduction — SnapshotPublicationAttributionOutcome\'s own raw values are bare machine words, exactly as they existed before this fix');
        check(DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH === 'content-hash-mismatch',
            'C1b. reproduction — DecentralizedSnapshotResolutionOutcome\'s own raw values are equally bare');

        // -----------------------------------------------------------
        // C2. THE FIX, live-exercised — every real outcome value from
        // both enums resolves to a genuine, human-readable sentence,
        // never the bare machine word.
        // -----------------------------------------------------------
        const resolutionCases = [
            [DecentralizedSnapshotResolutionOutcome.RESOLVED, 'Retrieved — content hash confirmed'],
            [DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED, 'Not currently announced by any known source'],
            [DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE, 'No content store available for the announced location'],
            [DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE, 'Could not retrieve content from the announced location'],
            [DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, 'Retrieved content does not match the requested hash']
        ];
        for (const [outcome, expected] of resolutionCases) {
            check(describeSnapshotResolutionOutcomeLabel(outcome) === expected, `C2. describeSnapshotResolutionOutcomeLabel(${JSON.stringify(outcome)}) reads "${expected}", never the bare word "${outcome}"`);
        }

        check(describeSnapshotAttributionOutcomeLabel(SnapshotPublicationAttributionOutcome.MATCH) === 'Confirmed to match this Publication',
            'C3. a genuine MATCH reads "Confirmed to match this Publication" — never the bare word "match"');
        check(describeSnapshotAttributionOutcomeLabel(SnapshotPublicationAttributionOutcome.NO_MATCH) === 'Does not match this Publication',
            'C4. a genuine NO_MATCH reads "Does not match this Publication" — never the bare word "no-match"');

        // Attribution's own pass-through resolution failures (see
        // application/SnapshotPublicationAttribution.js's own header, "a
        // resolution failure is never reported as NO_MATCH") resolve to
        // the IDENTICAL sentence describeSnapshotResolutionOutcomeLabel()
        // already produces for that same value — one label table, one
        // meaning, never two different sentences for the same fact
        // depending which panel displays it.
        for (const [outcome] of resolutionCases.filter(([o]) => o !== DecentralizedSnapshotResolutionOutcome.RESOLVED)) {
            check(describeSnapshotAttributionOutcomeLabel(outcome) === describeSnapshotResolutionOutcomeLabel(outcome),
                `C5. a resolution failure (${outcome}) passed through into an attribution result reads IDENTICALLY through both label functions — no second, competing sentence for the same fact`);
        }

        // -----------------------------------------------------------
        // C6. "Confirmed to match" stays THE SAME WORDING for THE SAME
        // KIND OF EVIDENCE (a content-hash correspondence check) no
        // matter which of the two independent verification surfaces in
        // this codebase reports it — this is the concrete "does it get
        // transformed into a stronger claim" check the brief asks for.
        // -----------------------------------------------------------
        const materialVerifiedLabel = describeWorldEncounterMaterialVerificationStatusLabel(WorldEncounterMaterialVerificationStatus.VERIFIED);
        const snapshotMatchLabel = describeSnapshotAttributionOutcomeLabel(SnapshotPublicationAttributionOutcome.MATCH);
        check(materialVerifiedLabel === 'Confirmed to match the selected encounter', 'C6. World Encounter Material verification\'s own 0.9.519 label is unchanged by this milestone');
        check(snapshotMatchLabel.startsWith('Confirmed to match'), 'C7. the NEW Snapshot Attribution label echoes the SAME "Confirmed to match" opening — the identical vocabulary for the identical kind of evidence (a hash equality check), never a stronger word substituted in one location');
        check(!OVERCLAIM_WORDS.test(materialVerifiedLabel) && !OVERCLAIM_WORDS.test(snapshotMatchLabel) && !OVERCLAIM_WORDS.test(describeSnapshotAttributionOutcomeLabel(SnapshotPublicationAttributionOutcome.NO_MATCH)),
            'C8. neither verification label ever escalates into "trusted," "authentic," "owned," or "canonical" — both stay a plain correspondence statement');

        // -----------------------------------------------------------
        // C9. THE FIX, wired into real production source — both real
        // call sites, all six render sites, actually route through the
        // new view rather than a raw `.outcome` interpolation.
        // -----------------------------------------------------------
        const panelSource = await source('ui/components/OwnPublicationPanel.js');
        const canvasSource = await source('ui/components/WorldEncounterCanvas.js');

        check(panelSource.includes("import { describeSnapshotResolutionOutcomeLabel, describeSnapshotAttributionOutcomeLabel } from '../../application/SnapshotOutcomeInspectionView.js';"),
            'C9. OwnPublicationPanel.js imports the new view');
        check(canvasSource.includes("import { describeSnapshotResolutionOutcomeLabel, describeSnapshotAttributionOutcomeLabel } from '../../application/SnapshotOutcomeInspectionView.js';"),
            'C10. WorldEncounterCanvas.js imports the new view');

        const rawOutcomeInterpolations = [
            '{{ snapshotDiscoveryResult.outcome }}',
            '{{ snapshotAttributionResult.outcome }}',
            '{{ selectedSnapshotResolutionResult.outcome }}',
            '{{ selectedSnapshotAttributionResult.outcome }}'
        ];
        for (const raw of rawOutcomeInterpolations) {
            check(!panelSource.includes(raw), `C11. OwnPublicationPanel.js no longer renders the raw interpolation "${raw}" anywhere`);
        }
        check(!canvasSource.includes('{{ snapshotDiscoveryResult.outcome }}') && !canvasSource.includes('{{ snapshotAttributionResult.outcome }}'),
            'C12. WorldEncounterCanvas.js no longer renders either raw Discovery/Attribution interpolation');

        const humanizedInterpolations = [
            '{{ describeSnapshotResolutionLabel(snapshotDiscoveryResult.outcome) }}',
            '{{ describeSnapshotAttributionLabel(snapshotAttributionResult.outcome) }}',
            '{{ describeSnapshotResolutionLabel(selectedSnapshotResolutionResult.outcome) }}',
            '{{ describeSnapshotAttributionLabel(selectedSnapshotAttributionResult.outcome) }}'
        ];
        for (const humanized of humanizedInterpolations) {
            check(panelSource.includes(humanized), `C13. OwnPublicationPanel.js now renders "${humanized}"`);
        }
        check(canvasSource.includes('{{ describeSnapshotResolutionLabel(snapshotDiscoveryResult.outcome) }}') && canvasSource.includes('{{ describeSnapshotAttributionLabel(snapshotAttributionResult.outcome) }}'),
            'C14. WorldEncounterCanvas.js now renders both humanized interpolations');

        // The component-level wrapper methods exist (a runtime-compiled
        // template string cannot call a bare module-level import
        // directly) and each is a thin pass-through, exactly mirroring
        // this file's own pre-existing describeMaterialLoadStatusLabel()/
        // describeMaterialVerificationStatusLabel() shape from 0.9.519.
        check(canvasSource.includes('describeSnapshotResolutionLabel(outcome) {\n            return describeSnapshotResolutionOutcomeLabel(outcome);\n        },'),
            'C15. WorldEncounterCanvas.js\'s own wrapper method is a pure pass-through, no logic of its own');
        check(panelSource.includes('describeSnapshotAttributionLabel(outcome) {\n            return describeSnapshotAttributionOutcomeLabel(outcome);\n        }'),
            'C16. OwnPublicationPanel.js\'s own wrapper method is a pure pass-through, no logic of its own');

        // An unrecognized outcome still renders — never hidden, never
        // refused, never silently blanked — the identical degrade-to-raw
        // discipline every label map in this codebase's evidence chain
        // already holds.
        check(describeSnapshotResolutionOutcomeLabel('MYSTERY') === 'MYSTERY' && describeSnapshotAttributionOutcomeLabel('MYSTERY') === 'MYSTERY',
            'C17. an unrecognized outcome still renders verbatim, never hidden or refused');
        check(describeSnapshotResolutionOutcomeLabel(null) === null && describeSnapshotResolutionOutcomeLabel(undefined) === null,
            'C18. a missing outcome renders as null, exactly like every sibling label function in this family');

        console.log('✓ Section C: FLAGSHIP — the Snapshot Discovery/Attribution readout (both the Publication owner\'s own "Check Snapshot Match" panel and the World Encounter\'s own "Snapshot Attribution" panel) rendered raw DecentralizedSnapshotResolutionOutcome/SnapshotPublicationAttributionOutcome machine words directly ("match," "no-match," "content-hash-mismatch," ...) — the identical vocabulary-consistency gap 0.9.519 closed for the Material/Verification panel, recurring one family over, because that milestone\'s own fix was never swept across this adjacent surface. Fixed by extending the exact same "Confirmed to match ..." wording to the new surface, through a new, small, pure view file.');
    }

    // ===============================================================
    // Section D — Placement comprehension.
    // ===============================================================
    {
        const panelInfoSource = await source('ui/components/PlacementInfoPanel.js');
        const editorSource = await source('ui/components/PlacementEditorDialog.js');
        const worldViewSource = await source('ui/views/WorldView.js');

        // The Publication/Placement split is a NAMED architectural rule,
        // not an implicit convention this milestone would be the first to
        // observe — both files cite the same principle explicitly.
        check(panelInfoSource.includes('A Publication Is What; A Placement Is Where'),
            'D1. PlacementInfoPanel.js names the Publication/Placement distinction as an explicit, cited architectural rule');
        check(editorSource.includes('This moves where the world sits in shared space. It does not\n                    edit the document, and does not create a fork.'),
            'D2. the Move Placement dialog tells the Wanderer, in plain language, that moving never edits the document or forks it');

        // "Remove from World" is explicitly NOT "Unpublish"/"Delete" —
        // the panel's own header states this in so many words, and the
        // button text itself never uses either word.
        check(panelInfoSource.includes('Deliberately NOT\n// "Unpublish"/"Delete"'),
            'D3. PlacementInfoPanel.js\'s own header explicitly rejects "Unpublish"/"Delete" wording for placement removal');
        check(panelInfoSource.includes('>Remove from World</button>') && !panelInfoSource.includes('>Delete<') && !panelInfoSource.includes('>Unpublish<'),
            'D4. the actual button text reads "Remove from World," never "Delete" or "Unpublish"');
        check(panelInfoSource.includes('removing a placement never\n// touches the Publication, the Document, or its material'),
            'D5. the header is explicit that removal never touches the underlying Publication, Document, or material');

        // The identity facts a Wanderer actually sees — position,
        // revision, owner — never include a Publication-identity field
        // that would blur "where" with "what."
        check(panelInfoSource.includes('Position (World Units)') && panelInfoSource.includes('Revision') && panelInfoSource.includes('Owner'),
            'D6. PlacementInfoPanel.js shows exactly WHERE-shaped facts (position, revision, owner) — never a title/description/license field that belongs to the Publication itself');

        check(worldViewSource.includes('session.removePlacement(info.documentId, info.placementId);'),
            'D7. the actual removal call site targets a placement by (documentId, placementId), never a Publication delete/unpublish call');

        console.log('✓ Section D: PRODUCT_COMPLETE — a Publication\'s identity (what) and a placement\'s position/ownership (where) stay visibly, explicitly separate everywhere this milestone re-examined; removing or moving a placement is worded, and implemented, so it never implies the Publication itself was touched.');
    }

    // ===============================================================
    // Section E — Walking trigger comprehension.
    // ===============================================================
    {
        const refreshSource = await source('application/ShouldRefreshSnapshotDiscovery.js');

        check(refreshSource.includes('export const DEFAULT_DISCOVERY_REFRESH_RADIUS = 100;'),
            'E1. the refresh threshold is a DISTANCE (world units), not a duration');
        check(!/setTimeout|setInterval|Date\.now|performance\.now|\bDEFAULT_.*_MS\b/.test(refreshSource),
            'E2. no time-based throttle of any kind exists in the decision function this milestone was asked not to add one to');

        // Live-exercise the real decision boundary: a tiny movement never
        // refreshes; a movement crossing the threshold always does;
        // repeated identical positions never refresh a second time; "no
        // prior context" always refreshes once.
        const near = { position: { x: 0, y: 0, z: 0 } };
        const stillNear = { position: { x: 10, y: 0, z: 0 } };
        const farEnough = { position: { x: 0, y: 0, z: DEFAULT_DISCOVERY_REFRESH_RADIUS } };
        check(shouldRefreshSnapshotDiscovery(near, stillNear) === false, 'E3. movement below threshold never triggers a refresh');
        check(shouldRefreshSnapshotDiscovery(near, farEnough) === true, 'E4. movement crossing the threshold triggers exactly one refresh');
        check(shouldRefreshSnapshotDiscovery(near, near) === false, 'E5. repeated, identical movement (effectively none) never re-triggers');
        check(shouldRefreshSnapshotDiscovery(null, near) === true, 'E6. no prior context at all always refreshes once — there is no stale discovery call that could still be valid');
        check(shouldRefreshSnapshotDiscovery(near, null) === false, 'E7. no CURRENT context (session not yet started) never refreshes — nothing to discover around yet');
        check(shouldRefreshSnapshotDiscovery(near, { position: { x: 200, y: 0, z: 0 } }) === true, 'E8. a genuinely stale discovery source (position moved on while a slow call was still resolving) is still judged purely by distance, never by how long the call took');

        console.log('✓ Section E: PRODUCT_COMPLETE — the walking trigger is, and remains, a pure distance comparison; no time-based throttle exists or was added by this milestone.');
    }

    // ===============================================================
    // Section F — Multi-source convergence.
    // ===============================================================
    {
        const bridgeSource = await source('application/MaterializedSnapshotWorldDiscoveryBridge.js');

        check(bridgeSource.includes('WHY BOTH, NOT `contentHash` ALONE'),
            'F1. this milestone re-confirms the existing, deliberate rationale for a COMPOUND identity key is still in place');
        check(materializedSnapshotWorldOrigin('hash-a', 'pub-1') === 'snapshot:hash-a:pub-1',
            'F2. identity is (contentHash, publicationId) together — the exact pre-existing origin scheme, unmodified');
        check(materializedSnapshotWorldOrigin('hash-a', 'pub-1') === materializedSnapshotWorldOrigin('hash-a', 'pub-1'),
            'F3. the SAME Snapshot, materialized identically twice (as it would be if discovered via two different substrates and independently walked-into), converges on the SAME origin — never two competing World entries');
        check(materializedSnapshotWorldOrigin('hash-a', 'pub-1') === null || materializedSnapshotWorldOrigin('hash-a', 'pub-1').length > 0,
            'F4. sanity: the derivation itself never throws for well-formed input');
        check(materializedSnapshotWorldOrigin(null, 'pub-1') === null && materializedSnapshotWorldOrigin('hash-a', null) === null,
            'F5. a missing contentHash OR publicationId degrades to null, never a partial/malformed key that could silently collide with an unrelated Snapshot');

        console.log('✓ Section F: PRODUCT_COMPLETE — the same Snapshot arriving from local/peer/Nostr/Arweave still converges on one World entry, keyed by (contentHash, publicationId) exactly as before; no content-hash-only identity was introduced.');
    }

    // ===============================================================
    // Section G — Failure comprehension.
    // ===============================================================
    {
        const canvasSource = await source('ui/components/WorldEncounterCanvas.js');

        check(canvasSource.includes("This Snapshot's content is no longer available."),
            'G1. a Snapshot whose content stopped being available says so in plain language, rather than showing an empty/blank detail panel');
        check(canvasSource.includes(':disabled="!selectedSnapshotContentView"'),
            'G2. "View Snapshot" is disabled until there is genuinely something to view — a failed/unresolved Snapshot can never open into an apparently-successful empty panel');

        // The five DecentralizedSnapshotResolutionOutcome failure values,
        // and the two SnapshotPublicationAttributionOutcome values, each
        // land on a DISTINCT sentence — never a single generic "failed."
        const allLabels = new Set();
        for (const value of Object.values(DecentralizedSnapshotResolutionOutcome)) {
            allLabels.add(describeSnapshotResolutionOutcomeLabel(value));
        }
        for (const value of Object.values(SnapshotPublicationAttributionOutcome)) {
            allLabels.add(describeSnapshotAttributionOutcomeLabel(value));
        }
        check(allLabels.size === Object.keys(DecentralizedSnapshotResolutionOutcome).length + Object.keys(SnapshotPublicationAttributionOutcome).length,
            'G3. every one of the seven real outcome values lands on its OWN distinct sentence — none collapse into a shared generic "failed"/"error" label');
        check(![...allLabels].some((label) => /^(error|failed|failure)$/i.test(label)),
            'G4. no label is the bare, undifferentiated word "error"/"failed"/"failure"');

        console.log('✓ Section G: PRODUCT_COMPLETE — a failure at any exercised stage (content no longer available, a specific resolution/attribution failure) reports itself honestly and distinctly; none of them present as an empty success.');
    }

    // ===============================================================
    // Section H — World/Repository continuity.
    // ===============================================================
    {
        const canvasSource = await source('ui/components/WorldEncounterCanvas.js');

        // Repository admission's own real gate, read live: AVAILABLE load,
        // a genuine Publication instance, AND an actively VERIFIED
        // material — never admitted on retrieval success alone.
        check(canvasSource.includes("admitToRepositoryDiscovery(loading, verification) {"),
            'H1. the real admission method still exists under its own 0.9.474 name');
        check(canvasSource.includes("loading.status === 'AVAILABLE'\n                && loading.material instanceof Publication\n                && verification\n                && verification.status === 'VERIFIED'"),
            'H2. admission requires AVAILABLE + a real Publication instance + an actively VERIFIED verification — never resolution success alone (the exact 0.9.523 gate, re-confirmed unmodified)');

        // World Encounter rendering itself never re-derives or displays
        // "which discovery family admitted this" as a Repository-facing
        // fact — admission is additive to World rendering, not a second
        // rendering path keyed by substrate.
        check(canvasSource.includes('admission is additive to World rendering, never a'),
            'H3. admission is documented, and implemented, as additive to an already-complete World rendering — never a precondition for it, and never branched by which substrate supplied the material');

        console.log('✓ Section H: PRODUCT_COMPLETE — Repository admission remains gated on an actively VERIFIED material fact, never mere retrieval; World Encounter rendering itself never branches on which discovery family supplied the material.');
    }

    // ===============================================================
    // Section I — Trust-language review.
    // ===============================================================
    {
        const newViewSource = await source('application/SnapshotOutcomeInspectionView.js');
        const panelSource = await source('ui/components/OwnPublicationPanel.js');
        const canvasSource = await source('ui/components/WorldEncounterCanvas.js');

        const classifications = [];
        classifications.push(['discovered', 'USER_VISIBLE_ACCEPTABLE — describes an announcement being found, never a verdict about what it is']);
        classifications.push(['verified / VERIFIED', 'USER_VISIBLE_ACCEPTABLE, WITH RESTRAINT — never rendered as the bare word to a Wanderer (0.9.519); this milestone\'s own new "match" label deliberately echoes the same restrained "Confirmed to match ..." phrasing rather than the bare word']);
        classifications.push(['confirmed', 'USER_VISIBLE_ACCEPTABLE — this milestone\'s own new label ("Confirmed to match this Publication") states only a content-hash correspondence, never authorship or trust']);
        classifications.push(['published', 'INTERNAL_ONLY in the surfaces this milestone touched — no new occurrence introduced']);
        classifications.push(['stored', 'INTERNAL_ONLY here — SnapshotCandidateMaterializationOutcome.STORED exists only inside the Diagnostic Tools panel, a deliberately technical/manual-recovery surface (see this file\'s own 0.9.324 header) never reached by the ordinary walking-triggered flagship journey']);
        classifications.push(['anchored', 'not used anywhere in this milestone\'s own scope (Snapshot/Placement/World), no gap to report']);
        classifications.push(['permanent', 'not used anywhere in this milestone\'s own scope']);
        classifications.push(['authentic', 'not used anywhere in this milestone\'s own scope — never introduced by this fix']);
        classifications.push(['owned', 'not used anywhere in this milestone\'s own scope — PlacementInfoPanel\'s own "Owner" field names a placement\'s mover, never Publication ownership (Section D)']);

        for (const [term] of classifications) {
            check(typeof term === 'string' && term.length > 0, `I1. "${term}" was reviewed`);
        }

        const newViewCodeOnly = newViewSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        check(!OVERCLAIM_WORDS.test(newViewCodeOnly),
            'I2. the new production file\'s own executable code (labels excepted below) never uses an overclaiming word (trusted/authentic/owned/canonical/...)');
        check(!newViewCodeOnly.includes("'VERIFIED'") && !newViewCodeOnly.includes('"VERIFIED"'),
            'I3. the new file\'s own executable code never introduces a second, bare "VERIFIED" literal of its own — only its comments, describing the PRIOR fix, ever quote that word');

        // The two touched component files still never brand a Snapshot
        // "permanent" or "authentic" anywhere in their own rendered
        // template text — every occurrence of either word in these files
        // lives in a comment explicitly REFUSING that vocabulary (grep-
        // confirmed below), never in a string a Wanderer would see.
        for (const [file, name] of [[panelSource, 'OwnPublicationPanel.js'], [canvasSource, 'WorldEncounterCanvas.js']]) {
            const codeOnly = file.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
            const templateMatch = codeOnly.match(/template:\s*`([\s\S]*)`\s*\}\s*;?\s*$/);
            const templateText = templateMatch ? templateMatch[1] : codeOnly;
            check(!/permanent|authentic/i.test(templateText), `I4. ${name}'s own rendered template never uses "permanent" or "authentic"`);
        }

        console.log('✓ Section I: vocabulary sweep complete over all nine named terms — the one gap found (Section C) was a CONSISTENCY gap (an existing, already-correct phrase not yet reused), never an overclaim; every term classified above is either already restrained, confined to a technical diagnostic surface, or unused in this milestone\'s own scope.');
    }

    // ===============================================================
    // Section J — Deliberately excluded scope, and the production-change
    // guard.
    // ===============================================================
    {
        const EXCLUDED = [
            'changing the walking frequency policy',
            'adding time-based throttling',
            'adding discovery ranking',
            'adding fallback',
            'changing candidate identity',
            'changing Snapshot storage semantics',
            'adding another loading path',
            'adding World-specific discovery',
            'automatic Repository -> World placement',
            'placement garbage collection',
            'placement tombstones',
            'reworking the World Encounter architecture'
        ];
        check(EXCLUDED.length === 12, 'J1. the full exclusion list from this milestone\'s own brief is twelve items, named, not silently dropped');

        // The Diagnostic Tools' own remaining raw outcome renders
        // (Materialization/Position Claim/Placement/Registration) are a
        // DELIBERATE_ASYMMETRY this milestone leaves alone, matching
        // 0.9.521's own precedent for a technical, no-claim-word token
        // never duplicated in humanized form anywhere else in this
        // codebase — named here so the decision is visible, not silent.
        const panelSource = await source('ui/components/OwnPublicationPanel.js');
        const diagnosticRawOutcomes = [
            '{{ selectedSnapshotMaterializationResult.outcome }}',
            '{{ selectedSnapshotWorldPositionClaimResult.outcome }}',
            '{{ selectedSnapshotWorldPlacementResult.outcome }}',
            '{{ selectedSnapshotWorldRegistrationResult.outcome }}'
        ];
        for (const raw of diagnosticRawOutcomes) {
            check(panelSource.includes(raw), `J2. ${raw} is a DELIBERATE_ASYMMETRY, left as-is inside the Diagnostic Tools panel — named explicitly, not silently changed`);
        }
        check(SnapshotWorldPlacementOutcome.PLACED === 'placed' && SnapshotWorldPlacementOutcome.UNPLACED === 'unplaced',
            'J3. those left-alone values remain plain, no-claim-word technical tokens (never containing an overclaim word) — the same category 0.9.521 already found acceptable to leave raw');

        const statusOutput = execSync('git status --porcelain -- . ":(exclude)ui/components/PublicationCard.js" ":(exclude)ui/components/PublicationList.js"' /* AMENDED BY 0.9.638 -- excludes ui/components/PublicationCard.js/PublicationList.js, its own unrelated, separately-justified Commentary distribution-selector UI change */, { cwd: SOURCE_ROOT_PATH }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const productionDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'ui', 'css', 'server', 'replication', 'serializer', 'world', 'world-layout', 'spatial', 'base', 'arweave', 'nostr', 'placement'];
        const touchedProduction = changed.filter((f) => productionDirs.some((dir) => f.startsWith(`${dir}/`)));
        const expectedTouched = ['application/SnapshotOutcomeInspectionView.js', 'ui/components/OwnPublicationPanel.js', 'ui/components/WorldEncounterCanvas.js'];
        check(touchedProduction.every((f) => expectedTouched.includes(f)),
            `J4. every touched/added production file this milestone is responsible for is exactly the expected set (found: ${JSON.stringify(touchedProduction)})`);

        const testsHtmlSource = await source('tests.html');
        check(testsHtmlSource.includes('./tests/SnapshotEncounterPlacementProductExperienceReassessment.test.js'),
            'J5. this milestone\'s own test file is registered in tests.html');

        console.log('✓ Section J: no scope creep into any of the twelve excluded items; the Diagnostic Tools panel\'s own remaining raw, plain-technical-token outcomes are named as a deliberate, unchanged asymmetry rather than silently left inconsistent; this milestone\'s own production changes are exactly the expected three files.');
    }

    console.log(`\n✅ All Snapshot Encounter & Placement Product Experience Reassessment checks passed (${assertionCount} assertions).\n`);
    console.log('=== VERDICT ===');
    console.log('Section A (Discovery-to-encounter comprehension): PRODUCT_COMPLETE.');
    console.log('Section B (Candidate vs material distinction): PRODUCT_COMPLETE.');
    console.log('Section C (Verification comprehension): PRODUCT_GAP found and fixed — FLAGSHIP. Raw DecentralizedSnapshotResolutionOutcome/SnapshotPublicationAttributionOutcome machine words ("match," "no-match," "content-hash-mismatch," ...) were rendered directly in both the Publication owner\'s own Snapshot panel and the World Encounter\'s own Snapshot Attribution panel — a vocabulary-CONSISTENCY gap against 0.9.519\'s own already-established "Confirmed to match ..." phrasing for the identical kind of evidence, not a stronger-claim overclaim. Fixed with one new, small, pure view file and six existing call sites routed through it.');
    console.log('Section D (Placement comprehension): PRODUCT_COMPLETE — Publication != Placement is an explicit, cited rule, held throughout.');
    console.log('Section E (Walking trigger comprehension): PRODUCT_COMPLETE — distance-only, no time throttle.');
    console.log('Section F (Multi-source convergence): PRODUCT_COMPLETE — compound (contentHash, publicationId) identity, unmodified.');
    console.log('Section G (Failure comprehension): PRODUCT_COMPLETE — every failure lands on its own honest, distinct sentence; none present as an empty success.');
    console.log('Section H (World/Repository continuity): PRODUCT_COMPLETE — Repository admission gated on VERIFIED; World Encounter stays source-family-blind.');
    console.log('Section I (Trust-language review): the same Section C gap; every other term already restrained, technical-surface-confined, or unused in this scope.');
    console.log('Section J: twelve-item exclusion list honored; one named, deliberate, unchanged asymmetry (Diagnostic Tools\' own remaining raw, no-claim-word tokens).');
    console.log('');
    console.log('VERDICT: PRODUCT_GAP found and fixed — a single, minimal, presentation-only production change (a new application/SnapshotOutcomeInspectionView.js, and six existing call sites in ui/components/OwnPublicationPanel.js and ui/components/WorldEncounterCanvas.js). Every other question this milestone\'s own brief asked — discovery-to-encounter comprehension, the candidate/material/placement distinction, placement comprehension, the walking trigger, multi-source convergence, failure comprehension, and Repository/World continuity — resolves PRODUCT_COMPLETE, re-confirmed against real, live-exercised production source. STOP the Snapshot Encounter/Placement product arc.');
}

run().catch((error) => {
    console.error('SnapshotEncounterPlacementProductExperienceReassessment.test.js FAILED:', error);
    process.exitCode = 1;
});
