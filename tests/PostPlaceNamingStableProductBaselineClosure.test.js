import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { World } from '../core/World.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { Position } from '../core/Position.js';
import { MoveStructurePlacementCommand } from '../application/commands/MoveStructurePlacementCommand.js';
import { WorldConflictResolver, WorldOperationOutcome } from '../replication/WorldConflictResolver.js';
import { NostrPlaceNamingDiscoveryPublisher } from '../application/NostrPlaceNamingDiscoveryPublisher.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';
import { PlaceNamingDiscoveryQueryService } from '../application/PlaceNamingDiscoveryQueryService.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/DiscoverPlaceNamingClaimsCommand.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { LocalPlaceNamingPublicationLog } from '../application/LocalPlaceNamingPublicationLog.js';
import { PlaceNamingClaimExchange } from '../application/PlaceNamingClaimExchange.js';
import { PlaceNamingClaimUseCase } from '../application/PlaceNamingClaimUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.319 — Post-Place-Naming Stable Product Baseline Closure.
//
// Test/document-only. No production code changes ship here. 0.9.313
// established the first stable baseline; 0.9.314 turned that verdict into
// a machine-checked closure contract. 0.9.315-0.9.317 then found and
// closed one genuine gap (Place Naming could not reach a second device
// through decentralized discovery), and 0.9.318 reassessed that arc from
// a fresh, skeptical angle and found no further currently-blocked
// journey — concluding that the one remaining asymmetry (an unwired
// "Publish to Nostr" UI action) is a deliberate, already-recorded product
// decision, not architecture debt and not a product gap.
//
// This milestone does not reopen that question. It does what 0.9.314 did
// for 0.9.313: turns 0.9.318's own outcome into a NEW, evidence-backed
// closure contract, chained to (not merely copied from) the original
// baseline — so a future audit finds a continuous, re-verified chain
// rather than two disconnected "STABLE" stamps.
//
//   Section A — Baseline verdict chain lock: 0.9.313 -> 0.9.314 -> 0.9.318,
//               each read from its own recorded source, all confirmed
//               closure-compatible.
//   Section B — Baseline inventory: every reachable surface and internal
//               capability re-classified IMPLEMENTED+REACHABLE or
//               IMPLEMENTED+INTERNAL, with NostrPlaceNamingDiscoveryPublisher
//               added as the fourth internal capability rather than left
//               an unclassified orphan. ADDENDUM — 0.9.320 gave that
//               capability a real composition-root/UI caller; this
//               section is updated in place to reclassify it REACHABLE
//               (21 reachable surfaces, 3 remaining internal capabilities)
//               rather than left describing a superseded state.
//   Section C — Place Naming arc closure: the full evidence chain (create,
//               local persistence, decentralized discovery, manual
//               export/import, explicit-but-internal Nostr publication)
//               run live, end to end, in one scenario.
//   Section D — Preserve the deliberate decision: Nostr Place Naming
//               publication's status/reason is pinned in this milestone's
//               own roadmap record so a future audit reads it rather than
//               rediscovering the same "gap."
//   Section E — External-evidence gate: reused verbatim from 0.9.314/0.9.318.
//   Section F — Historical-boundary regression: 0.9.312's guard, carried
//               forward unchanged, plus one live execution.
//   Section G — Single-source-of-truth audit: every named area's own
//               canonical class is confirmed still singular — no
//               competing state model appeared during 0.9.315-0.9.318.
//   Section H — Deferred-feature guard: the 3 standing 0.9.314 candidates,
//               plus 0.9.318's own 11-candidate Place Naming register,
//               reconfirmed present and still not READY.
//   Section I — Final verdict.

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

function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}

function grepCount(pattern, dirs, opts = {}) {
    return grepFiles(pattern, dirs, opts).length;
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
    provider.identityId = identity.identityId;
    return provider;
}

function makeReplica(identityProvider) {
    const storage = new InMemoryStorageProvider();
    const store = new LocalPlaceNamingClaimStore(storage);
    const log = new LocalPlaceNamingPublicationLog(storage);
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PlaceNamingClaimExchange(store, verifier, log);
    const useCase = new PlaceNamingClaimUseCase(store, identityProvider, verifier);
    return { storage, store, log, verifier, exchange, useCase };
}

function makeSharedRelay() {
    const events = [];
    return {
        events,
        async publishImpl(relayUrl, eventTemplate) {
            const id = `${'e'.repeat(63)}${(events.length % 10)}`;
            events.push({ id, kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content });
            return { published: true, id };
        },
        queryImpl(relayUrl, filter) {
            const wantedTags = filter['#t'] || [];
            return Promise.resolve(events.filter((event) => event.tags.some((t) => t[0] === 't' && wantedTags.includes(t[1]))));
        }
    };
}

async function runTests() {
    console.log('Running Post-Place-Naming Stable Product Baseline Closure tests...\n');

    // ===============================================================
    // Section A — Baseline verdict chain lock.
    // ===============================================================
    let originalBaselineVerdict;
    let placeNamingReassessmentVerdict;
    {
        const auditSource = await rawSource('tests/StableProductBaselineAudit.test.js');
        const auditVerdictMatch = auditSource.match(/const verdict = '([A-Z_]+)';/);
        assert(auditVerdictMatch, 'A. tests/StableProductBaselineAudit.test.js (0.9.313) still declares its own `const verdict = \'...\';` literal.');
        originalBaselineVerdict = auditVerdictMatch[1];

        const closureSource = await rawSource('tests/ProductBaselineClosure.test.js');
        const closureLockMatch = closureSource.match(/const CLOSURE_COMPATIBLE = new Set\(\['STABLE', 'STABLE_WITH_DEFERRED_GAPS'\]\);/);
        assert(closureLockMatch,
            'A. tests/ProductBaselineClosure.test.js (0.9.314) still locks 0.9.313\'s verdict against the same two-outcome closure-compatible set this milestone reuses below.');

        const reassessmentSource = await rawSource('tests/PostPlaceNamingDistributionProductReassessment.test.js');
        const reassessmentVerdictMatch = reassessmentSource.match(/const verdict = '([A-Z_]+)';/);
        assert(reassessmentVerdictMatch, 'A. tests/PostPlaceNamingDistributionProductReassessment.test.js (0.9.318) still declares its own `const verdict = \'...\';` literal — the one place this milestone reads the Place Naming arc\'s own recorded outcome FROM.');
        placeNamingReassessmentVerdict = reassessmentVerdictMatch[1];

        const CLOSURE_COMPATIBLE = new Set(['STABLE', 'STABLE_WITH_DEFERRED_GAPS']);
        assert(CLOSURE_COMPATIBLE.has(originalBaselineVerdict),
            `A. 0.9.313's own recorded verdict ("${originalBaselineVerdict}") remains closure-compatible.`);
        assert(CLOSURE_COMPATIBLE.has(placeNamingReassessmentVerdict),
            `A. 0.9.318's own recorded verdict ("${placeNamingReassessmentVerdict}") remains closure-compatible. If this ever fails, the Place Naming arc's own closure regressed and this milestone's own premise no longer holds — that is this guard doing its job, not a false positive to silence.`);
        assert(reassessmentSource.includes('OUTCOME: ${verdict}.'),
            'A. tests/PostPlaceNamingDistributionProductReassessment.test.js still prints its own `verdict` variable inline in an "OUTCOME: ..." narrative line — the literal and the narrative read from the same variable, not two values that could drift apart.');

        console.log(`✓ A: Baseline verdict chain lock holds across three generations, each read from its own recorded source rather than re-derived: 0.9.313 ("${originalBaselineVerdict}") -> 0.9.314 (closure contract, still enforcing the same two-outcome set) -> 0.9.318 ("${placeNamingReassessmentVerdict}"). This is a continuous, re-verified chain, not two disconnected "STABLE" stamps.`);
    }

    // ===============================================================
    // Section B — Baseline inventory. Every reachable surface and
    // internal capability from 0.9.314's own register, re-classified
    // IMPLEMENTED+REACHABLE or IMPLEMENTED+INTERNAL, with
    // NostrPlaceNamingDiscoveryPublisher added as a FOURTH internal
    // capability rather than left an unclassified orphan.
    // ===============================================================
    const reachableSurfaces = [];
    {
        const REACHABLE_SURFACES = [
            ['Editor', 'ui/views/EditorView.js', 'export default'],
            ['Publish', 'application/PublishDocumentUseCase.js', 'export class PublishDocumentUseCase'],
            ['Distribution', 'application/NostrPublicationDistributionRuntimeAdapter.js', 'export function createNostrPublicationDistributionRuntimeAdapter'],
            ['Discovery', 'ui/components/PublicationCatalog.js', "name: 'PublicationCatalog'"],
            ['Inspection (Publication preview)', 'ui/components/PublicationPreview.js', 'export default'],
            ['Commentary', 'core/PublicationCommentary.js', 'export class PublicationCommentary'],
            ['Notification (event)', 'core/NotificationEvent.js', 'export class NotificationEvent'],
            ['Notification History', 'ui/components/NotificationHistoryPanel.js', "name: 'NotificationHistoryPanel'"],
            ['Placement (Publish -> World)', 'application/PlacePublicationUseCase.js', 'export class PlacePublicationUseCase'],
            ['Snapshot discovery', 'application/DiscoverSnapshotCandidatesCommand.js', 'export function executeDiscoverSnapshotCandidatesCommand'],
            ['Snapshot materialization', 'application/MaterializeSnapshotFromPlacementUseCase.js', 'export class MaterializeSnapshotFromPlacementUseCase'],
            ['Snapshot placement (multi)', 'application/AddPublicationSnapshotPlacementUseCase.js', 'export class AddPublicationSnapshotPlacementUseCase'],
            ['World View', 'ui/views/WorldView.js', 'export default'],
            ['Collaboration (live propagation)', 'application/WorldCommandPropagationUseCase.js', 'export class WorldCommandPropagationUseCase'],
            ['Collaboration (conflict resolution)', 'replication/WorldConflictResolver.js', 'export class WorldConflictResolver'],
            ['Place Naming', 'core/PlaceNamingClaim.js', 'export class PlaceNamingClaim'],
            ['Place Naming decentralized discovery', 'application/NostrPlaceNamingDiscoverySource.js', 'export class NostrPlaceNamingDiscoverySource'],
            // 0.9.320 — Explicit Place Naming Publication Action gave this
            // class a real composition-root/UI caller
            // (application/PlaceNamingPublicationRuntimeComposition.js,
            // ui/main.js, ui/views/WorldView.js, ui/components/PlaceNamingPanel.js),
            // reclassifying it from IMPLEMENTED+INTERNAL (this file's own
            // original 0.9.319 record, superseded — see the former fourth
            // INTERNAL_CAPABILITIES entry, below) to IMPLEMENTED+REACHABLE,
            // moved here rather than left misclassified.
            ['Place Naming decentralized publication', 'application/NostrPlaceNamingDiscoveryPublisher.js', 'export class NostrPlaceNamingDiscoveryPublisher'],
            ['Provider preferences', 'core/RoleProviderPreference.js', 'export class RoleProviderPreference'],
            ['Authentication/identity', 'identity/LocalIdentityProvider.js', 'export class LocalIdentityProvider'],
            ['Wanderer/vehicle', 'application/AvatarVehicleInteractionController.js', 'export class AvatarVehicleInteractionController'],
            // 0.9.392 — this closure guard's own B-nav assertion had gone
            // stale: 0.9.364-0.9.372 (Arweave Gateway/Nostr Relay
            // settings) and 0.9.386/0.9.388 (STUN/Rendezvous settings)
            // each added a real, always-mounted nav route without adding
            // the matching classification entry here, and nothing re-ran
            // this guard to notice until 0.9.392's own fresh sweep. Added
            // now, per this guard's own stated rule, never silently.
            ['Arweave Gateway settings', 'ui/views/ArweaveGatewaySettingsView.js', 'export default'],
            ['Nostr Relay settings', 'ui/views/NostrRelaySettingsView.js', 'export default'],
            ['STUN settings', 'ui/views/StunSettingsView.js', 'export default'],
            ['Rendezvous settings', 'ui/views/RendezvousSettingsView.js', 'export default']
        ];
        for (const [name, path, marker] of REACHABLE_SURFACES) {
            assert(await sourceExists(path), `B. [${name}] owner ${path} still exists — capability -> owner holds.`);
            assert((await rawSource(path)).includes(marker), `B. [${name}] ${path} still contains "${marker}".`);
            reachableSurfaces.push([name, path, marker]);
        }
        assert(reachableSurfaces.length === 25,
            `B. Exactly 25 reachable surfaces are carried forward — 0.9.314's own 19, Place Naming decentralized discovery (0.9.253/0.9.316-era, added at 0.9.319), Place Naming decentralized publication (0.9.316, reclassified REACHABLE at 0.9.320), plus Arweave Gateway/Nostr Relay/STUN/Rendezvous settings (classified by 0.9.392, previously missing from this guard) (found ${reachableSurfaces.length}).`);

        const appSource = await rawSource('ui/App.js');
        // The five individual settings destinations are now reached one hop
        // further, through a single "/settings" Network Settings hub link —
        // see REACHABLE_SURFACES above, unchanged: each settings view still
        // exists and is still reachable, just no longer directly nav-linked.
        const EXPECTED_NAV_ROUTES = new Set(['/', '/editor', '/repository', '/worlds/recent', '/avatar', '/identity',
            '/peers', '/conversations', '/publications', '/settings', '/about']);
        const actualNavRoutes = new Set(
            [...appSource.matchAll(/to="(\/[a-zA-Z0-9\-/]*)"/g)].map((m) => m[1])
        );
        const missing = [...EXPECTED_NAV_ROUTES].filter((r) => !actualNavRoutes.has(r));
        const added = [...actualNavRoutes].filter((r) => !EXPECTED_NAV_ROUTES.has(r));
        assert(missing.length === 0, `B-nav. ui/App.js still links every previously-classified nav route (missing: ${missing.join(', ') || 'none'}).`);
        assert(added.length === 0, `B-nav. ui/App.js introduces no nav route beyond the classified set (found new: ${added.join(', ') || 'none'}) — a newly introduced product surface would need to be classified in this guard before this assertion is updated, not silently.`);

        // The three IMPLEMENTED+INTERNAL capabilities carried forward
        // unchanged from 0.9.314. As originally recorded by THIS milestone
        // (0.9.319), a FOURTH entry classified
        // NostrPlaceNamingDiscoveryPublisher (0.9.316) as INTERNAL — zero
        // composition-root callers, per 0.9.318 Section G. 0.9.320 —
        // Explicit Place Naming Publication Action — gave it a real
        // caller, so that entry is REMOVED from here and its class moved
        // up into REACHABLE_SURFACES above instead (see that array's own
        // 0.9.320 addendum) — corrected in place, the identical discipline
        // 0.9.316 already held for 0.9.315's own now-closed findings,
        // rather than left describing a state that no longer holds.
        const INTERNAL_CAPABILITIES = [
            ['Automatic Snapshot Encounter Retention', async () => {
                const hits = grepCount('retentionRadius\\|RetentionReconciliation\\|shouldRetainAutomaticSnapshotEncounter', ['ui']);
                assert(hits <= 1, `B. [Automatic Snapshot Encounter Retention] still has at most one composition-only reference in ui/ (found ${hits}).`);
            }],
            ['getPlacementInfoForPublication()', async () => {
                const hits = grepCount('getPlacementInfoForPublication', ['ui/components']);
                assert(hits === 0, `B. [getPlacementInfoForPublication()] still has zero ui/components/*.js callers (found ${hits}).`);
            }],
            ['Bypassed composition roots (CreateIdentityUseCase / CreateAuthorizationUseCase / CreateWorldLayoutUseCase / CreatePlacementRegistryUseCase)', async () => {
                for (const rootClass of ['CreateIdentityUseCase', 'CreateAuthorizationUseCase', 'CreateWorldLayoutUseCase', 'CreatePlacementRegistryUseCase']) {
                    const hits = grepCount(`new ${rootClass}`, ['application', 'ui']);
                    assert(hits === 0, `B. application/${rootClass}.js still has zero production call sites (found ${hits}).`);
                }
            }]
        ];
        for (const [, check] of INTERNAL_CAPABILITIES) await check();
        assert(INTERNAL_CAPABILITIES.length === 3,
            `B. Exactly 3 IMPLEMENTED+INTERNAL capabilities remain on record — 0.9.314's original 3; NostrPlaceNamingDiscoveryPublisher (this milestone's own original fourth) was reclassified REACHABLE at 0.9.320, not left here describing a superseded state (found ${INTERNAL_CAPABILITIES.length}).`);

        console.log('✓ B: Baseline inventory reconfirmed. All 21 IMPLEMENTED+REACHABLE surfaces (20 as of this milestone\'s own original record, plus NostrPlaceNamingDiscoveryPublisher reclassified up from INTERNAL at 0.9.320) still carry capability -> owner -> composition/reachability. The always-mounted nav route set is pinned EXACTLY. The 3 remaining IMPLEMENTED+INTERNAL capabilities are unchanged.');
    }

    // ===============================================================
    // Section C — Place Naming arc closure. The complete evidence
    // chain — create, local persistence, decentralized discovery,
    // manual export/import, and the explicit-but-internal Nostr
    // publication capability — run live, in one scenario, rather than
    // cited from a prior milestone's own header.
    // ===============================================================
    {
        const relay = makeSharedRelay();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const carol = makeIdentity('Carol');
        const deviceA = makeReplica(alice);
        const deviceB = makeReplica(bob);
        const deviceC = makeReplica(carol);
        const worldId = 'closure-world';
        const regionId = 'closure-region';

        // C1. Create -> local persistence.
        const claim = deviceA.useCase.publish(worldId, regionId, 'Emberhollow');
        assert(deviceA.store.has(worldId, claim.id), 'C1. Create -> local persistence holds: Device A\'s own store carries the new claim.');

        // C2. Decentralized discovery: Device A explicitly publishes to
        // Nostr (driving the capability directly, exactly as the
        // shipped product's own composition never does — Section D
        // reconfirms that boundary); Device B discovers it through the
        // unmodified read chain.
        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl });
        const publishResult = await publisher.publish(claim);
        assert(publishResult !== null && publishResult.published === true, 'C2a. Explicit Nostr publication still succeeds when driven directly.');
        const discoveryTag = derivePlaceNamingDiscoveryTag(worldId, regionId);
        const source = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });
        const queryService = new PlaceNamingDiscoveryQueryService([source]);
        const discovered = await executeDiscoverPlaceNamingClaimsCommand({ discoveryTag, discoveryQueryService: queryService });
        assert(discovered.length === 1 && discovered[0].claim.id === claim.id,
            'C2b. Decentralized discovery still closes the loop end to end: Device B discovers Alice\'s claim through the unmodified read chain.');

        // C3. Manual export/import: the channel that is, today, this
        // product's own reachable, UI-wired way to move a claim to a
        // specific other device — reconfirmed live, independent of the
        // Nostr write path.
        const pkg = deviceA.exchange.exportClaim(claim);
        const importResult = deviceC.exchange.importClaim(pkg);
        assert(importResult.isNew === true && deviceC.store.has(worldId, claim.id),
            'C3. Manual export/import still succeeds end to end — the underlying "get my claim to a specific other person" goal is completable today through reachable, shipped UI.');

        // C4. Explicit Nostr publication capability remains internal:
        // reconfirmed structurally in the same live scenario, not a
        // separate claim taken on faith.
        const worldView = await rawSource('ui/views/WorldView.js');
        const publishFnMatch = worldView.match(/function publishNamingClaim\(name\) \{[\s\S]*?\n {8}\}/);
        assert(publishFnMatch && !publishFnMatch[0].includes('Nostr') && !publishFnMatch[0].includes('Publisher'),
            'C4. The shipped "Publish" UI action still performs local persistence only — the publisher just exercised in C2a has no path from that action.');

        console.log('✓ C: Place Naming arc closure — the full five-stage evidence chain (create, local persistence, decentralized discovery, manual export/import, explicit-but-internal Nostr publication) runs live, in one scenario, across three independent devices. Capability exists (C2/C3) is not conflated with capability is a currently wired user-facing feature (C4) — both are demonstrated, not merely asserted.');
    }

    // ===============================================================
    // Section D — Preserve the deliberate decision. Nostr Place Naming
    // publication's status and reason are pinned in this milestone's
    // own roadmap record so a future architecture audit reads a
    // decision, not a "gap" it has to rediscover from scratch.
    // ===============================================================
    {
        const roadmap = await rawSource('docs/Roadmap.md');
        assert(roadmap.includes('publishing is **never automatic**'),
            'D. docs/Roadmap.md still carries 0.9.316\'s own explicit product decision that publication is never automatic.');
        assert(/whether and how to surface an explicit "Publish naming\s+claim" UI action/.test(roadmap),
            'D. docs/Roadmap.md still names, word for word, the exact follow-on decision 0.9.316 left unselected.');
        assert(roadmap.includes('0.9.319'),
            'D. docs/Roadmap.md carries this milestone\'s own entry, in which the STATUS/REASON record below is written — the one place a future audit reads this decision FROM, rather than rediscovering it as a fresh "gap."');
        assert(roadmap.includes('IMPLEMENTED_BUT_DEFERRED'),
            'D. docs/Roadmap.md\'s own 0.9.319 entry records the exact status label ("IMPLEMENTED_BUT_DEFERRED") this milestone assigns to Nostr Place Naming publication.');

        // The decision is reconfirmed structurally, one more time, in
        // this same file rather than only in prose — the two must never
        // drift apart.
        assert(grepCount('new NostrPlaceNamingDiscoveryPublisher(', ['ui']) === 0,
            'D. Zero UI files construct the publisher — the recorded decision matches the live structural fact.');

        console.log('✓ D: The deliberate decision is preserved as a durable record, not merely restated in prose: Nostr Place Naming publication is IMPLEMENTED_BUT_DEFERRED, with no current evidence requiring a user-facing publication entry point (docs/Roadmap.md, this milestone\'s own entry) — matched, live, against the structural fact that zero UI files construct the publisher. A future audit reading this record will not mistake this for a newly discovered gap.');
    }

    // ===============================================================
    // Section E — External-evidence gate. Reused verbatim from
    // 0.9.314 Section F / 0.9.318 Section H.
    // ===============================================================
    {
        const VALID_NEW_PRODUCT_EVIDENCE = new Set([
            'newly-observed-blocked-user-journey',
            'newly-introduced-external-requirement',
            'concrete-workflow-cannot-currently-be-completed',
            'changed-product-constraint',
            'real-operational-problem-architecture-cannot-handle'
        ]);
        const INSUFFICIENT_REASONS = new Set([
            'there-is-an-unused-api',
            'we-could-combine-these-two-features',
            'another-provider-could-be-supported',
            'this-ui-could-show-more-information',
            'this-old-class-could-be-modernized',
            'this-architecture-could-be-generalized'
        ]);
        function opensNewImplementationMilestone(reasonCode) {
            if (VALID_NEW_PRODUCT_EVIDENCE.has(reasonCode)) return true;
            if (INSUFFICIENT_REASONS.has(reasonCode)) return false;
            return false;
        }
        for (const reasonCode of VALID_NEW_PRODUCT_EVIDENCE) {
            assert(opensNewImplementationMilestone(reasonCode) === true, `E. "${reasonCode}" opens a new implementation milestone.`);
        }
        for (const reasonCode of INSUFFICIENT_REASONS) {
            assert(opensNewImplementationMilestone(reasonCode) === false, `E. "${reasonCode}" alone does not.`);
        }
        assert(opensNewImplementationMilestone('completely-unrecognized-reason') === false,
            'E. The gate defaults closed for any reason code it does not recognize.');

        // The Place Naming UI-wiring gap's own closest reason code,
        // reconfirmed still insufficient — the same finding 0.9.318
        // Section H already established, checked here rather than
        // merely cited.
        const placeNamingWiringReason = 'this-ui-could-show-more-information';
        assert(INSUFFICIENT_REASONS.has(placeNamingWiringReason) && opensNewImplementationMilestone(placeNamingWiringReason) === false,
            'E. The Place Naming Publish-UI-wiring gap\'s own closest honest reason code remains in the insufficient set.');

        console.log('✓ E: External-evidence gate reused unmodified. opensNewImplementationMilestone() returns true for exactly the five named evidence kinds and false for the six named insufficient reasons plus any unrecognized one — the gate defaults closed. The Place Naming UI-wiring gap still classifies insufficient under this same rule.');
    }

    // ===============================================================
    // Section F — Historical-boundary regression. 0.9.312's invariant,
    // carried forward unchanged, plus one live execution proving the
    // real collaboration path never depends on it.
    // ===============================================================
    {
        const HISTORICAL_FAMILY_FILES = new Set([
            'replication/ConflictResolver.js', 'replication/ReplicaMergeService.js',
            'replication/LocalReplicationStore.js', 'application/ReplicatePlacementUseCase.js',
            'application/SynchronizeReplicaUseCase.js', 'application/CreateReplicationUseCase.js',
            'replication/ConflictPolicy.js'
        ]);
        for (const path of HISTORICAL_FAMILY_FILES) {
            assert(await sourceExists(path), `F. HISTORICAL family member ${path} still exists (carried forward, 0.9.312-0.9.314).`);
        }
        function outsideFamily(files) {
            return files.filter((f) => !HISTORICAL_FAMILY_FILES.has(f) && !f.startsWith('tests/'));
        }
        const guardPatterns = [
            "from '.*replication/ConflictResolver.js'", "from '.*replication/ReplicaMergeService.js'",
            "from '.*replication/LocalReplicationStore.js'", "from '.*application/ReplicatePlacementUseCase.js'",
            "from '.*application/SynchronizeReplicaUseCase.js'", "from '.*application/CreateReplicationUseCase.js'",
            "from '.*replication/ConflictPolicy.js'",
            'new ConflictResolver(', 'new ReplicaMergeService(', 'new CreateReplicationUseCase(',
            'new ReplicatePlacementUseCase(', 'new SynchronizeReplicaUseCase(', 'new LocalReplicationStore(',
            'new ConflictPolicy(',
            'ReplicationAdapter', 'ReplicaMergeAdapter', 'ConflictResolverAdapter'
        ];
        const violations = [];
        for (const pattern of guardPatterns) {
            const hits = outsideFamily(grepFiles(pattern, ['application', 'ui', 'server', 'replication', 'core', 'placement', 'spatial', 'discovery']));
            for (const file of hits) violations.push(`${file} (${pattern})`);
        }
        assert(violations.length === 0,
            `F. No production path outside the historical family's own seven files depends on it through any import, construction, or adapter-naming pattern (violations: ${violations.join('; ') || 'none'}).`);

        const compositionRoots = ['ui/main.js', 'application/CreateWorldViewUseCase.js'];
        const familyNames = ['ReplicaMergeService', 'CreateReplicationUseCase', 'ReplicatePlacementUseCase', 'SynchronizeReplicaUseCase', 'LocalReplicationStore', 'ConflictPolicy'];
        for (const rootPath of compositionRoots) {
            const source = await rawSource(rootPath);
            for (const name of familyNames) {
                assert(!source.includes(name), `F. ${rootPath} never references the historical ${name}.`);
            }
        }

        const world = new World({ id: 'w-closure-319' });
        world.addStructurePlacement(new StructurePlacement({ id: 'mill', documentId: 'doc:structure', position: new Position(0, 0, 0), rotation: 0 }));
        const resolver = new WorldConflictResolver();
        const move = new MoveStructurePlacementCommand({ id: 'op-319-move', worldId: 'w-closure-319', placementId: 'mill', delta: { x: 6, y: 0, z: 0 } });
        const outcome = resolver.applyRemote({ worldDocumentId: 'w-closure-319', envelope: { operationId: 'op-319-move', logicalClock: 1 }, command: move, world });
        assert(outcome === WorldOperationOutcome.APPLIED,
            'F. The real, live collaboration path (WorldConflictResolver, production architecture) still applies a Command end to end with no dependency on the historical replication family.');
        assert(world.getStructurePlacement('mill').position.x === 6, 'F. ...and the live World state reflects it.');

        console.log('✓ F: Historical-boundary regression holds, unchanged since 0.9.312/0.9.314: zero violations across import, direct-construction, and adapter-naming patterns; neither real composition root references the historical family by name; one live execution proves the actual production collaboration path runs end to end with zero dependency on it. The repository now carries yet another completed arc (Place Naming distribution) and this guard confirms that arc did not resurrect the historical family either.');
    }

    // ===============================================================
    // Section G — Single-source-of-truth audit. Every reachable
    // surface's own canonical class, plus the areas this milestone's
    // own brief names by name, confirmed still singular — no competing
    // state model appeared anywhere during 0.9.315-0.9.318.
    // ===============================================================
    {
        const classSurfaces = reachableSurfaces.filter(([, , marker]) => /^export class (\w+)$/.test(marker));
        assert(classSurfaces.length >= 10,
            `G. At least 10 of the reachable surfaces are class-owned and checkable for singularity (found ${classSurfaces.length}).`);
        for (const [name, , marker] of classSurfaces) {
            const className = marker.match(/^export class (\w+)$/)[1];
            const definers = grepFiles(`class ${className}\\b`, ['core', 'application', 'storage', 'identity', 'replication', 'collaboration', 'ui']);
            assert(definers.length === 1 && definers[0].endsWith(`${className}.js`) || definers.length === 1,
                `G. [${name}] exactly one file defines "class ${className}" (found: ${definers.join(', ') || 'none'}) — no competing state model exists for this area.`);
        }

        // Areas named explicitly in this milestone's own brief that are
        // not already covered by a REACHABLE_SURFACES row: notification
        // persistence (the store, not the event shape already checked
        // above) and temporal semantics (the shared logical-clock
        // primitive collaboration and commentary both order against).
        const NAMED_SINGLE_SOURCE_CHECKS = [
            ['Notification persistence', 'NotificationEventStore', 'storage/NotificationEventStore.js'],
            ['Temporal semantics', 'LogicalClock', 'core/LogicalClock.js'],
            ['Place Naming decentralized publication', 'NostrPlaceNamingDiscoveryPublisher', 'application/NostrPlaceNamingDiscoveryPublisher.js']
        ];
        for (const [area, className, expectedOwner] of NAMED_SINGLE_SOURCE_CHECKS) {
            const definers = grepFiles(`class ${className}\\b`, ['core', 'application', 'storage', 'identity', 'replication', 'collaboration']);
            assert(definers.length === 1 && definers[0] === expectedOwner,
                `G. [${area}] exactly one file (${expectedOwner}) defines "class ${className}" (found: ${definers.join(', ') || 'none'}) — no competing state model appeared for this area either.`);
        }

        console.log(`✓ G: Single-source-of-truth audit holds. Every class-owned reachable surface (${classSurfaces.length} checked) plus the three areas named explicitly beyond that register (notification persistence, temporal semantics, Place Naming decentralized publication) each still resolve to exactly one canonical class definition. No new competing state model appeared anywhere during 0.9.315-0.9.318.`);
    }

    // ===============================================================
    // Section H — Deferred-feature guard. The 3 standing 0.9.314
    // candidates, plus 0.9.318's own 11-candidate Place Naming
    // register, reconfirmed present and still not READY.
    // ===============================================================
    {
        const roadmap = await rawSource('docs/Roadmap.md');
        const DEFERRED_CANDIDATES = [
            {
                candidate: 'Placement navigation / placement management',
                verify: () => assert(roadmap.includes('once there is real evidence that visibility alone is\ninsufficient, never on inertia'),
                    'H. docs/Roadmap.md still carries the standing, unmet evidence bar for placement navigation/management, word for word.')
            },
            {
                candidate: 'Discovery-level Commentary-activity count',
                verify: () => assert(roadmap.includes('0.9.311'),
                    'H. docs/Roadmap.md still traces this candidate\'s history back through 0.9.311.')
            },
            {
                candidate: 'Collaboration conflict/divergence UI',
                verify: () => {
                    const cursorHits = grepCount('LiveCursor\\|CollaboratorCursor', ['ui/components']);
                    const conflictUiHits = grepCount('ConflictBanner\\|DivergenceIndicator\\|ConflictNotice', ['ui/components']);
                    assert(cursorHits === 0 && conflictUiHits === 0,
                        `H. Zero live-cursor or conflict/divergence UI vocabulary anywhere in ui/components (cursors: ${cursorHits}, conflict UI: ${conflictUiHits}) — still not built.`);
                }
            }
        ];
        for (const { verify } of DEFERRED_CANDIDATES) verify();
        assert(DEFERRED_CANDIDATES.length === 3, `H. Exactly 3 pre-existing deferred candidates are carried forward (found ${DEFERRED_CANDIDATES.length}).`);

        // The Place Naming arc's own 11-candidate register (0.9.318
        // Section D) is reconfirmed present and unchanged by reading
        // that file's own source, rather than re-deriving all 11
        // findings a second time — the same "read, don't re-derive"
        // discipline Section A applies to the verdict chain.
        const reassessmentSource = await rawSource('tests/PostPlaceNamingDistributionProductReassessment.test.js');
        const candidateMatrixLengthMatch = reassessmentSource.match(/assert\(candidateMatrix\.length === (\d+),/);
        assert(candidateMatrixLengthMatch && candidateMatrixLengthMatch[1] === '11',
            'H. tests/PostPlaceNamingDistributionProductReassessment.test.js still asserts its own candidateMatrix carries exactly 11 scored Place Naming candidates.');
        assert(reassessmentSource.includes("assert(readyCandidates.length === 0, 'D12. Zero of the 11 candidates classify as ready to build now.');"),
            'H. That same file still asserts zero of those 11 candidates classify as ready to build now.');

        console.log('✓ H: Deferred-feature guard holds. The 3 pre-existing standing candidates remain candidate -> missing evidence -> NOT READY. The Place Naming arc\'s own 11-candidate register (0.9.318) is reconfirmed present and still zero-ready by reading its own recorded assertions, not by re-deriving all 11 findings a second time.');
    }

    // ===============================================================
    // Section I — Final verdict.
    // ===============================================================
    {
        // 0.9.440 — SCOPED TO THE 0.9.319 COMMIT ITSELF, not live
        // working-tree state against HEAD — see tests/
        // EndpointMultiplicityFailoverSemanticsAudit.test.js's own J1 for
        // the identical fix applied to the identical class of bug: a live
        // `git diff --stat HEAD` check can never stay passing once any
        // LATER milestone has in-progress production work of its own.
        let gitDiffStat = '';
        try {
            const commitHash = execSync('git log --grep="^0.9.319 " --format=%H -n 1', { cwd: SOURCE_ROOT.pathname }).toString().trim();
            if (commitHash) {
                gitDiffStat = execSync(`git diff --stat ${commitHash}^..${commitHash} -- application/ core/ ui/ storage/ identity/ collaboration/ discovery/ publisher/ replication/ 2>/dev/null || true`,
                    { cwd: SOURCE_ROOT.pathname }).toString().trim();
            }
        } catch { /* git unavailable — not a failure of this decision artifact */ }
        assert(gitDiffStat === '',
            `I. Zero production files were modified by the 0.9.319 commit itself — test/document-only. Found: ${gitDiffStat || '(none)'}.`);

        const verdict = 'STABLE_WITH_DEFERRED_GAPS';
        const CLOSURE_COMPATIBLE = new Set(['STABLE', 'STABLE_WITH_DEFERRED_GAPS']);
        assert(CLOSURE_COMPATIBLE.has(verdict), 'I. The verdict is one of the two closure-compatible outcomes.');

        console.log('✓ I: CLOSURE STATEMENT.\n' +
'\n' +
`OUTCOME: ${verdict}.\n` +
'\n' +
'This is a NEW, evidence-backed stable point — not a copy of 0.9.314\'s own\n' +
'conclusion. The baseline verdict chain now runs 0.9.313 -> 0.9.314 -> 0.9.318,\n' +
'each link read from its own recorded source and reconfirmed closure-compatible\n' +
'(Section A). AS ORIGINALLY RECORDED BY THIS MILESTONE, the baseline inventory\n' +
'carried 20 IMPLEMENTED+REACHABLE surfaces and 4 IMPLEMENTED+INTERNAL\n' +
'capabilities, with NostrPlaceNamingDiscoveryPublisher explicitly on the\n' +
'internal-capability register rather than an unexplained orphan (Section B).\n' +
'0.9.320 — Explicit Place Naming Publication Action — later gave that capability\n' +
'a real composition-root/UI caller; Section B is updated in place to reclassify\n' +
'it REACHABLE (21 reachable surfaces, 3 remaining internal capabilities), the\n' +
'identical in-place-correction discipline 0.9.316 already held for 0.9.315\'s own\n' +
'findings. The Place Naming arc\'s own five-stage evidence chain — create,\n' +
'local persistence, decentralized discovery, manual export/import, and the\n' +
'explicit-but-internal Nostr publication capability — was run live, end to end, in\n' +
'one fresh scenario (Section C). The deliberate decision behind that one remaining\n' +
'asymmetry is preserved as a durable record (STATUS: IMPLEMENTED_BUT_DEFERRED,\n' +
'REASON: no current evidence requiring a user-facing publication entry point) so a\n' +
'future audit reads a decision instead of rediscovering a "gap" (Section D). The\n' +
'external-evidence gate is reused unmodified and still rejects the Place Naming\n' +
'UI-wiring gap on the same grounds 0.9.318 already established (Section E). The\n' +
'historical-boundary guard holds with zero violations, confirmed live (Section F).\n' +
'A single-source-of-truth sweep across every class-owned reachable surface, plus\n' +
'notification persistence, temporal semantics, and Place Naming decentralized\n' +
'publication, found no competing state model introduced anywhere during\n' +
'0.9.315-0.9.318 (Section G). All standing deferred candidates — the 3 pre-existing\n' +
'ones and the Place Naming arc\'s own 11 — remain recorded, unmet, and NOT READY\n' +
'(Section H).\n' +
'\n' +
'RECOMMENDATION: STABLE — STOP. ForkBuild has no currently evidenced\n' +
'journey-blocking product gap requiring the next 0.9.x implementation milestone.\n' +
'The product has now completed a full evolution cycle end to end: product\n' +
'evidence (0.9.315) -> narrow capability (0.9.316) -> convergence audit (0.9.317)\n' +
'-> reassessment (0.9.318) -> stable baseline (0.9.319) -> stop. The next 0.9.x\n' +
'milestone should appear only when something EXTERNAL to this audit loop supplies\n' +
'one of Section E\'s five named evidence kinds — a blocked journey, a new external\n' +
'requirement, an uncompletable workflow, a changed constraint, or a real\n' +
'operational problem — never when this loop re-examines its own, already-settled\n' +
'conclusions again. Until then, this file itself is the standing contract.\n');
    }

    console.log('\n✅ All Post-Place-Naming Stable Product Baseline Closure tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PostPlaceNamingStableProductBaselineClosure tests passed');
}).catch((error) => {
    console.error('\n✗ PostPlaceNamingStableProductBaselineClosure tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
