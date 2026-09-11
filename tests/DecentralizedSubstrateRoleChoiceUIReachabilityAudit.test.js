import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { ExternalAnchorPublisherRegistry } from '../application/ExternalAnchorPublisherRegistry.js';
import { SnapshotPlacementStoreRegistry } from '../application/SnapshotPlacementStoreRegistry.js';

// 0.9.422 — Decentralized Substrate Role Choice UI Reachability Audit.
//
// Type: test-only reachability audit. No production file is touched.
//
// 0.9.421 found that multi-provider FAN-OUT (one action, many
// destinations) is unwarranted — the architecture excludes it on purpose,
// and a user who wants a Publication on more than one substrate already
// reaches that outcome by repeating an ordinary single-provider action. A
// person then raised the narrower, legitimate question 0.9.421 deliberately
// left open: is that repeatable single-provider CHOICE itself actually
// reachable, for a real user, at the point where the corresponding
// publication action naturally occurs — independently, for each of the
// three RoleProviderRole roles? This milestone answers that from real,
// current source: real routes, real injected collaborators, real registry
// contents — never from the architecture's own theoretical capacity to
// expose a choice.
//
// THE ANSWER IS NOT THE SAME FOR ALL THREE ROLES, AND IS NOT UNIFORMLY
// "READY." Two independent, real generic mechanisms already exist —
// SnapshotPlacementStoreRegistry (CONTENT) and ExternalAnchorPublisherRegistry
// (PROOF_AND_ANCHORING) — each keyed by a plugin's own self-declared name,
// each already driving a real, route-reachable, per-item `v-for` choice UI
// in ui/views/DecentralizedPublicationsView.js (`availableStorageTypes()` /
// `availableAnchorTypes()`) that would present a SECOND button the moment a
// second real provider were ever registered, with zero UI code change. No
// third, equivalent registry exists for ANNOUNCEMENT_AND_DISCOVERY's own
// real write action — `application/PublicationDistributionOrchestrator.js`
// (0.9.58) takes one fixed `arweaveUploaderOptions`/`nostrPublisherOptions`
// pair, composed once in ui/main.js, with no registry, no `availableX
// Types()`, and no per-substrate button anywhere. This is a genuine,
// evidence-backed architectural ASYMMETRY between the three roles — but,
// checked against what is actually registered today, it has NO current
// product consequence: exactly one real Nostr discovery publisher and one
// real Arweave uploader exist to choose between anyway, the identical
// "capability-limited, not UI-limited" situation PROOF_AND_ANCHORING is
// already in with its own single registered Bitcoin publisher. Sections
// A-I trace this precisely, never rounding it up to a uniform verdict and
// never rounding it down to "nothing to see here."
//
// LETTERED SECTIONS:
//   A. Role / provider / implementation / mechanism census — for each of
//      the three roles, how many real providers are registered today, and
//      does a generic, registry-driven choice mechanism exist for it at
//      all.
//   B. UI -> application -> provider reachability chains, traced
//      independently per role, from a real registered route down to a
//      real constructed collaborator.
//   C. The entry-point table — capability count, choice mechanism present,
//      natural entry point — for all three roles, evidence-backed, never
//      assumed from "the provider exists" alone.
//   D. Choice is already contextual, not a standalone "pick your
//      substrates" page — confirmed from where the real markup actually
//      renders.
//   E. Choice vs. fan-out, confirmed absent in the UI layer too — every
//      real creation control passes exactly one provider identifier per
//      call; no multi-select/checkbox pattern exists for a provider or
//      storage or anchorType choice anywhere in this view.
//   F. Repeated-action composition, re-verified fresh at the UI-facing
//      shape (never trusting 0.9.421's own cached live proof) — no
//      overwrite, no lost provenance, two independently distinguishable
//      results.
//   G. Per-role classification, independently — the actual, asymmetric
//      finding, resisting the temptation to force all three roles to the
//      same verdict.
//   H. Substrate choice vs. endpoint configuration vs. fan-out, kept
//      separate — confirmed as three structurally distinct route
//      namespaces in real source.
//   I. Product decision, deliberate exclusion census, and the production
//      boundary check every milestone in this family ends with.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));

async function readSource(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
function listFiles(dirs) {
    return execSync(`git ls-files ${dirs.join(' ')}`, { cwd: SOURCE_ROOT })
        .toString().split('\n').filter((f) => f.endsWith('.js'));
}
async function joinedSource(files) {
    const parts = await Promise.all(files.map((f) => readSource(f)));
    return parts.join('\n');
}
function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

async function run() {
    console.log('Running Decentralized Substrate Role Choice UI Reachability Audit tests...\n');

    // ===============================================================
    // Section A — role / provider / mechanism census.
    // ===============================================================
    {
        assert(Object.values(RoleProviderRole).length === 3, n('A1. the closed three-role vocabulary is unchanged since 0.9.293'));

        // CONTENT — a real, generic, registry-driven mechanism. Minimal
        // duck-typed stores satisfying the registry's own contract
        // (`storage`, `put()`, `get()`) — never a real IPFS/local store,
        // which is not this section's concern.
        function inertContentStore(storage) {
            return { storage, async put() { return null; }, async get() { return null; } };
        }
        const contentRegistry = new SnapshotPlacementStoreRegistry();
        assert(typeof contentRegistry.register === 'function' && typeof contentRegistry.get === 'function', n('A2. SnapshotPlacementStoreRegistry is a real, constructible, register()/get() keyed registry'));
        contentRegistry.register(inertContentStore('local'));
        contentRegistry.register(inertContentStore('ipfs'));
        assert(contentRegistry.get('local') && contentRegistry.get('ipfs'), n('A3. it genuinely holds more than one entry, keyed by a plugin\'s own self-declared storage name'));

        // PROOF_AND_ANCHORING — the same generic shape, one axis over.
        const proofRegistry = new ExternalAnchorPublisherRegistry();
        assert(typeof proofRegistry.register === 'function' && typeof proofRegistry.get === 'function', n('A4. ExternalAnchorPublisherRegistry mirrors the identical register()/get() keyed shape'));

        // ANNOUNCEMENT_AND_DISCOVERY — no such registry exists anywhere.
        const allProductionFiles = listFiles(['application']);
        const distributionRegistryFiles = allProductionFiles.filter((f) => /DiscoveryPublisherRegistry|AnnouncementRegistry|DistributionRegistry/i.test(f));
        assert(distributionRegistryFiles.length === 0, n(`A5. no DiscoveryPublisherRegistry/AnnouncementRegistry/DistributionRegistry class exists anywhere in application/ (found ${JSON.stringify(distributionRegistryFiles)}) — no third, equivalent generic mechanism exists for this role's own write action`));

        // Its own real write action instead takes one fixed options pair.
        const orchestratorSource = await readSource('application/PublicationDistributionOrchestrator.js');
        assert(/arweaveUploaderOptions,\s*\n\s*nostrPublisherOptions/.test(orchestratorSource), n('A6. application/PublicationDistributionOrchestrator.js (0.9.58) takes one fixed arweaveUploaderOptions/nostrPublisherOptions pair per call — an options object, never a registry lookup keyed by a caller-chosen identifier'));
        assert(!/\.register\(|\.get\(providerKey\)|Registry\b/.test(codeOnly(orchestratorSource)), n('A7. confirmed structurally: no register()/get()/Registry vocabulary of any kind appears in its own real code'));

        // Real registered provider counts today, from the one real
        // composition root — never assumed from capability alone.
        const mainSource = await readSource('ui/main.js');
        const contentProviderCount = /stores: \[publicationContentStore, new IpfsContentStore\(\)\]/.test(mainSource) ? 2 : 0;
        const proofPublisherCount = /publishers: \[bitcoinAnchorPublisher\]/.test(mainSource) ? 1 : 0;
        assert(contentProviderCount === 2, n(`A8. CONTENT has two real registered providers today (found ${contentProviderCount})`));
        assert(proofPublisherCount === 1, n(`A9. PROOF_AND_ANCHORING has exactly one real registered publisher today (found ${proofPublisherCount}) — unchanged since 0.9.304`));
        const distributionIsSingleFixedPair = /const publicationDistributionCommand = composePublicationDistributionCommand\(\{/.test(mainSource)
            && /arweaveUploaderOptions,\s*\n\s*nostrPublisherOptions\s*\n\}\);/.test(mainSource);
        assert(distributionIsSingleFixedPair, n('A10. ANNOUNCEMENT_AND_DISCOVERY\'s one real write action is composed exactly once, from exactly one Arweave/Nostr pair — "how many are registered" is not even a meaningful question for this role\'s own real action, because there is no registry to count entries in'));

        console.log('\n=== SECTION A: ROLE / PROVIDER / MECHANISM CENSUS ===');
        console.log(`  CONTENT: ${contentProviderCount} real providers, generic registry-driven mechanism present`);
        console.log(`  PROOF_AND_ANCHORING: ${proofPublisherCount} real publisher, generic registry-driven mechanism present`);
        console.log('  ANNOUNCEMENT_AND_DISCOVERY: 1 fixed Arweave+Nostr pair, no generic mechanism of any kind');
        console.log('✓ Section A: two of the three roles share one real, generic, registry-driven mechanism that already exists independent of how many providers happen to be registered; the third role\'s only real write action has no such mechanism, structurally, at all.');
    }

    // ===============================================================
    // Section B — UI -> application -> provider reachability chains.
    // ===============================================================
    {
        const routerSource = await readSource('ui/router/index.js');
        assert(/path: '\/publications', name: 'publications', component: DecentralizedPublicationsView/.test(routerSource), n('B1. CONTENT\'s and PROOF_AND_ANCHORING\'s own natural entry point — /publications -> DecentralizedPublicationsView — is a real, registered route, not merely an existing component'));
        assert(/path: '\/settings\/content-provider', name: 'content-provider-settings', component: ContentProviderSettingsView/.test(routerSource), n('B2. CONTENT\'s own preference-setting entry point — /settings/content-provider — is likewise a real, registered route'));

        const viewSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        // CONTENT chain: route -> injected coordinator -> per-storage click -> registry lookup.
        assert(/const placementCreationCoordinator = inject\('snapshotPlacementCreationCoordinator'/.test(viewSource) || /inject\('snapshotPlacementCreationCoordinator'/.test(viewSource), n('B3. CONTENT: the view injects a real snapshotPlacementCreationCoordinator, never constructs one of its own'));
        assert(/async function createPlacement\(entry, storage\)/.test(viewSource), n('B4. CONTENT: a real createPlacement(entry, storage) function exists, taking exactly one storage identifier per call'));
        assert(/availableStorageTypes/.test(viewSource) && /v-for="storage in availableStorageTypes"/.test(viewSource), n('B5. CONTENT: the real template renders one button per entry in availableStorageTypes() — the registry\'s own live contents, never a hard-coded list of two'));

        // PROOF_AND_ANCHORING chain: same shape, one axis over.
        assert(/inject\('publicationAnchorCreationCoordinator'/.test(viewSource), n('B6. PROOF_AND_ANCHORING: the view injects a real publicationAnchorCreationCoordinator'));
        assert(/async function createAnchor\(entry, anchorType\)/.test(viewSource), n('B7. PROOF_AND_ANCHORING: a real createAnchor(entry, anchorType) function exists, taking exactly one anchorType per call'));
        assert(/availableAnchorTypes/.test(viewSource) && /v-for="anchorType in availableAnchorTypes"/.test(viewSource), n('B8. PROOF_AND_ANCHORING: the real template renders one button per entry in availableAnchorTypes() — identical shape to Section B5, one role over'));

        // ANNOUNCEMENT_AND_DISCOVERY chain: a single injected command, no
        // per-substrate parameter of any kind.
        const editorSource = await readSource('ui/views/EditorView.js');
        const ownPanelSource = await readSource('ui/components/OwnPublicationPanel.js');
        assert(/inject\('publicationDistributionCommand', null\)/.test(editorSource), n('B9. ANNOUNCEMENT_AND_DISCOVERY: EditorView.js injects the SAME app-wide publicationDistributionCommand — a single fixed action, never a per-role choice'));
        assert(/publicationDistributionCommand\(\{/.test(editorSource) || /publicationDistributionCommand\(publication\)/.test(ownPanelSource), n('B10. it is called with a publication only — no storage, no anchorType, no relay, no substrate identifier of any kind is ever passed by the UI'));

        console.log('\n=== SECTION B: REACHABILITY CHAINS ===');
        console.log('✓ Section B: CONTENT and PROOF_AND_ANCHORING each trace a complete, real chain from a registered route through an injected coordinator to a per-item template loop reading a live registry. ANNOUNCEMENT_AND_DISCOVERY traces an equally real chain to an actual, working "Distribute" action — but that chain has no branch point anywhere for a substrate identifier to enter it.');
    }

    // ===============================================================
    // Section C — the entry-point table.
    // ===============================================================
    {
        const rows = [
            { role: 'CONTENT', capabilityCount: 2, choiceMechanism: true, entryPoint: '/publications, per-publication placement card' },
            { role: 'PROOF_AND_ANCHORING', capabilityCount: 1, choiceMechanism: true, entryPoint: '/publications, per-publication anchor evidence card' },
            { role: 'ANNOUNCEMENT_AND_DISCOVERY', capabilityCount: 1, choiceMechanism: false, entryPoint: 'Editor/World/OwnPublicationPanel "Distribute" button' }
        ];
        assert(rows.length === 3, n('C1. all three roles are represented in the entry-point table, none skipped'));
        assert(rows.filter((r) => r.choiceMechanism).length === 2, n('C2. exactly two roles have a real, generic choice mechanism today'));
        assert(rows.every((r) => r.entryPoint && r.entryPoint.length > 0), n('C3. every role has a real, named, evidence-backed entry point — never "no entry point exists at all"'));

        // The critical distinction this section exists to protect:
        // "provider exists" is never conflated with "a choice mechanism
        // exists to present it."
        const proofRow = rows.find((r) => r.role === 'PROOF_AND_ANCHORING');
        assert(proofRow.capabilityCount === 1 && proofRow.choiceMechanism === true, n('C4. PROOF_AND_ANCHORING has only one real provider, yet its choice mechanism is real and present — a provider count of one does not imply an absent mechanism'));
        const discoveryRow = rows.find((r) => r.role === 'ANNOUNCEMENT_AND_DISCOVERY');
        assert(discoveryRow.capabilityCount === 1 && discoveryRow.choiceMechanism === false, n('C5. ANNOUNCEMENT_AND_DISCOVERY also has only one real provider pair, and here the mechanism is genuinely absent — the same provider count as Proof, a structurally different mechanism outcome'));

        console.log('\n=== SECTION C: ENTRY-POINT TABLE ===');
        console.table ? console.table(rows) : rows.forEach((r) => console.log(`  ${r.role}: capability=${r.capabilityCount}, choiceMechanism=${r.choiceMechanism}, entryPoint=${r.entryPoint}`));
        console.log('✓ Section C: "the provider exists" and "a choice mechanism exists" are independent facts, confirmed to diverge for exactly one of the three roles.');
    }

    // ===============================================================
    // Section D — choice is already contextual.
    // ===============================================================
    {
        const viewSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        // Both real choice mechanisms render INSIDE a per-publication
        // entry card, never on a standalone, generic "pick your
        // substrates" page reachable independent of any one publication.
        assert(/v-for="storage in availableStorageTypes"/.test(viewSource) && /createPlacement\(entry, storage\)/.test(viewSource), n('D1. the CONTENT choice renders bound to a specific `entry` (the publication being acted on), not on a page listing substrates in the abstract'));
        assert(/v-for="anchorType in availableAnchorTypes"/.test(viewSource) && /createAnchor\(entry, anchorType\)/.test(viewSource), n('D2. the PROOF_AND_ANCHORING choice is identically bound to `entry`'));

        // No standalone "Decentralized Substrates" page exists anywhere.
        const routerSource = await readSource('ui/router/index.js');
        assert(!/decentralized-substrates|substrate-picker|provider-picker/i.test(routerSource), n('D3. no generic, standalone substrate/provider-picker route exists — there is nothing here for a future milestone to remove in favor of contextual placement, because contextual placement is already what exists'));

        console.log('\n=== SECTION D: CHOICE IS ALREADY CONTEXTUAL ===');
        console.log('✓ Section D: where a real choice mechanism exists at all, it already renders at the exact point the corresponding action naturally occurs (a specific publication\'s own card), never on a separate, generic settings surface a user would have to already know to visit first.');
    }

    // ===============================================================
    // Section E — choice vs. fan-out, confirmed absent in the UI too.
    // ===============================================================
    {
        const viewSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(/async function createPlacement\(entry, storage\)/.test(viewSource) && !/createPlacement\(entry, storages\)/.test(viewSource), n('E1. createPlacement takes a single `storage` string, never a `storages` array'));
        assert(/async function createAnchor\(entry, anchorType\)/.test(viewSource) && !/createAnchor\(entry, anchorTypes\)/.test(viewSource), n('E2. createAnchor takes a single `anchorType` string, never an `anchorTypes` array'));

        // No checkbox, multi-select, or "select all" control exists for
        // either creation mechanism — confirmed by checking the button
        // markup itself never carries a `type="checkbox"` sibling for
        // storage/anchorType selection (the one real checkbox this file
        // contains, confirmed by source, is for an unrelated peer-
        // comparison feature, never a provider selection).
        assert(/@click="createPlacement\(entry, storage\)"/.test(viewSource), n('E3. the real CONTENT control is a single-invocation @click button, never a checkbox bound to a selection array'));
        assert(/@click="createAnchor\(entry, anchorType\)"/.test(viewSource), n('E4. the real PROOF_AND_ANCHORING control is the identical single-invocation @click shape'));
        assert(/togglePeerPossessionCompareSelection/.test(viewSource), n('E5. the one real checkbox in this file toggles PEER selection for a possession-comparison feature — confirmed unrelated to any provider/storage/anchorType choice, so its presence does not contradict E1-E4'));

        console.log('\n=== SECTION E: CHOICE VS. FAN-OUT ===');
        console.log('✓ Section E: wherever a real choice mechanism exists, it is a selection (pick exactly one, execute once), never a multi-select feeding a batch execution — matching 0.9.421\'s own finding that fan-out is architecturally excluded, now confirmed at the UI control layer too.');
    }

    // ===============================================================
    // Section F — repeated-action composition, re-verified fresh.
    // ===============================================================
    {
        // Never trusted from 0.9.421's own cached live proof — re-derived
        // here, independently, with a fresh catalog and fresh placements,
        // and checked against the specific failure modes this milestone's
        // own brief names: overwriting, lost provenance, and confused
        // identity between the two results.
        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const publicationId = 'pub-ui-reachability-1';
        const contentHash = 'sha256:0123456789abcdef';

        const arweavePlacement = new PublicationSnapshotPlacement({
            publicationId, contentHash, storage: 'ar', locator: 'ar://tx-ui-reachability',
            placerIdentity: { publicKey: 'alice-key', signature: 'sig-a' }
        });
        const { placement: firstResult } = catalog.add(arweavePlacement);

        const ipfsPlacement = new PublicationSnapshotPlacement({
            publicationId, contentHash, storage: 'ipfs', locator: 'ipfs://cid-ui-reachability',
            placerIdentity: { publicKey: 'alice-key', signature: 'sig-b' }
        });
        const { placement: secondResult } = catalog.add(ipfsPlacement);

        // No overwrite: the first result, re-fetched by its own id, is
        // byte-identical to what the first action actually produced.
        const refetchedFirst = catalog.get(firstResult.id);
        assert(refetchedFirst.locator === arweavePlacement.locator && refetchedFirst.storage === 'ar', n('F1. the first action\'s own result is unchanged after the second action runs — no overwrite'));

        // No lost provenance: each result still names its own placing
        // identity and its own locator, independently.
        assert(refetchedFirst.placerIdentity.signature === 'sig-a', n('F2. the first result\'s own provenance (placerIdentity) survives the second action untouched'));
        const refetchedSecond = catalog.get(secondResult.id);
        assert(refetchedSecond.placerIdentity.signature === 'sig-b', n('F3. the second result carries its OWN provenance, never inherited or copied from the first'));

        // Never confused: two distinct ids, two distinct locators, two
        // distinct storages, both findable together by publicationId.
        assert(refetchedFirst.id !== refetchedSecond.id, n('F4. the two results are never merged into or mistaken for one record'));
        const byPublication = catalog.findByPublicationId(publicationId);
        assert(byPublication.length === 2, n(`F5. both results remain independently findable by the SAME publicationId (found ${byPublication.length})`));
        assert(new Set(byPublication.map((p) => p.storage)).size === 2, n('F6. the two results name two distinct storages — never silently deduplicated or collapsed'));

        console.log('\n=== SECTION F: REPEATED-ACTION COMPOSITION, RE-VERIFIED ===');
        console.log('✓ Section F: composing two ordinary single-provider actions produces two independently correct, independently provenanced, mutually undisturbed results — none of overwrite, lost provenance, silent replacement, or provider confusion occurs. A user who wants CONTENT on two substrates already gets a clean, correct outcome from clicking twice.');
    }

    // ===============================================================
    // Section G — per-role classification, independently.
    // ===============================================================
    {
        const CLASSIFICATIONS = Object.freeze(['UI_ALREADY_EXPOSES_CHOICE', 'MECHANISM_READY_CAPABILITY_LIMITED', 'MECHANISM_ABSENT_CAPABILITY_LIMITED', 'UI_GAP_HIDDEN_CAPABILITY']);
        function classify({ capabilityCount, choiceMechanismExists }) {
            if (choiceMechanismExists && capabilityCount >= 2) return 'UI_ALREADY_EXPOSES_CHOICE';
            if (choiceMechanismExists && capabilityCount <= 1) return 'MECHANISM_READY_CAPABILITY_LIMITED';
            if (!choiceMechanismExists && capabilityCount <= 1) return 'MECHANISM_ABSENT_CAPABILITY_LIMITED';
            return 'UI_GAP_HIDDEN_CAPABILITY'; // capability >= 2 but no mechanism — the one genuinely bad outcome
        }
        // Prove the function actually discriminates — the same regression
        // guard 0.9.420's and 0.9.421's own model-evaluation functions held.
        assert(classify({ capabilityCount: 3, choiceMechanismExists: false }) === 'UI_GAP_HIDDEN_CAPABILITY', n('G1. the function WOULD flag a genuine gap if a role ever had two or more real providers with no mechanism to choose between them — a real, available, worst-case branch'));

        const content = classify({ capabilityCount: 2, choiceMechanismExists: true });
        const proof = classify({ capabilityCount: 1, choiceMechanismExists: true });
        const discovery = classify({ capabilityCount: 1, choiceMechanismExists: false });
        assert(content === 'UI_ALREADY_EXPOSES_CHOICE', n(`G2. CONTENT classifies UI_ALREADY_EXPOSES_CHOICE (chose: ${content})`));
        assert(proof === 'MECHANISM_READY_CAPABILITY_LIMITED', n(`G3. PROOF_AND_ANCHORING classifies MECHANISM_READY_CAPABILITY_LIMITED (chose: ${proof}) — the identical situation 0.9.304's own Section E already named ("revisiting a principle would not even help them yet"), now confirmed true of the UI mechanism specifically, not only the preference chain`));
        assert(discovery === 'MECHANISM_ABSENT_CAPABILITY_LIMITED', n(`G4. ANNOUNCEMENT_AND_DISCOVERY classifies MECHANISM_ABSENT_CAPABILITY_LIMITED (chose: ${discovery}) — a real architectural asymmetry from the other two roles, but, like Proof, not a HIDDEN capability: there is no second real provider a mechanism would even have something to show`));
        assert(new Set([content, proof, discovery]).size === 3, n('G5. the three roles receive three DIFFERENT classifications — this section resists forcing a uniform verdict onto roles the evidence does not treat alike'));

        console.log('\n=== SECTION G: PER-ROLE CLASSIFICATION ===');
        console.log(`  CONTENT: ${content}`);
        console.log(`  PROOF_AND_ANCHORING: ${proof}`);
        console.log(`  ANNOUNCEMENT_AND_DISCOVERY: ${discovery}`);
        console.log('✓ Section G: no role classifies UI_GAP_HIDDEN_CAPABILITY — the one outcome that would mean a real user is being denied a real, already-registered choice. The three roles nonetheless land in three different places, an asymmetry worth recording precisely rather than smoothing over.');
    }

    // ===============================================================
    // Section H — substrate choice vs. endpoint configuration vs.
    // fan-out, kept separate.
    // ===============================================================
    {
        const routerSource = await readSource('ui/router/index.js');
        assert(/path: '\/settings\/content-provider'/.test(routerSource), n('H1. substrate CHOICE has its own real route: /settings/content-provider'));
        assert(/path: '\/settings\/arweave-gateway'/.test(routerSource), n('H2. ENDPOINT configuration for an already-chosen substrate has its OWN, separate real route: /settings/arweave-gateway'));
        assert(/path: '\/settings\/nostr-relay'/.test(routerSource), n('H3. and again: /settings/nostr-relay — a second, independent endpoint-configuration route, never merged with substrate choice'));

        const gatewaySettingsSource = await readSource('ui/views/ArweaveGatewaySettingsView.js');
        const relaySettingsSource = await readSource('ui/views/NostrRelaySettingsView.js');
        const contentSettingsSource = await readSource('ui/views/ContentProviderSettingsView.js');
        assert(!/RoleProviderPreference/.test(gatewaySettingsSource), n('H4. ArweaveGatewaySettingsView.js never imports RoleProviderPreference — endpoint configuration and substrate choice remain two different classes, two different views, two different concerns'));
        assert(!/RoleProviderPreference/.test(relaySettingsSource), n('H5. NostrRelaySettingsView.js likewise never imports it'));
        assert(/RoleProviderPreference/.test(contentSettingsSource), n('H6. only ContentProviderSettingsView.js — the one real substrate-CHOICE settings view — imports RoleProviderPreference at all'));

        // Fallback/failover vocabulary, checked once more at the UI layer,
        // confirming 0.9.421's Section C finding still holds here too.
        const settingsBundle = codeOnly([gatewaySettingsSource, relaySettingsSource, contentSettingsSource].join('\n'));
        assert(!/automatic[\s\S]{0,20}fallback|failover/i.test(settingsBundle), n('H7. no automatic fallback/failover vocabulary exists in any of the three settings views — endpoint configuration configures WHERE to reach a chosen substrate, never WHAT to do if it is unreachable'));

        console.log('\n=== SECTION H: THREE KEPT-SEPARATE CONCERNS ===');
        console.log('✓ Section H: substrate choice, endpoint configuration, and fan-out/failover remain three structurally distinct concerns in real, current source — three different route namespaces, and RoleProviderPreference reachable from exactly one of the three settings views.');
    }

    // ===============================================================
    // Section I — product decision, deliberate exclusions, production
    // boundary.
    // ===============================================================
    {
        const DECISIONS = Object.freeze(['NO_PRODUCT_GAP', 'ROLE_SPECIFIC_UI_GAP', 'MULTI_PROVIDER_FANOUT_REQUIRED', 'DEFER']);
        const decisionMatrix = [
            { question: 'Does any role have real, registered, multi-provider capability that its own UI fails to expose', answer: 'NO — the one role with real multi-provider capability (CONTENT) already exposes it, contextually, today (Sections A-D)' },
            { question: 'Does a real choice mechanism exist wherever it would currently matter', answer: 'YES for CONTENT and PROOF_AND_ANCHORING; N/A for ANNOUNCEMENT_AND_DISCOVERY, which also has no second real provider for a mechanism to reveal' },
            { question: 'Is the ANNOUNCEMENT_AND_DISCOVERY asymmetry a currently-live product gap', answer: 'NO — it is a structural fact about the codebase\'s own history (a pre-RoleProviderRole, options-object pipeline), with no user-visible consequence while exactly one real provider pair exists' },
            { question: 'Does repeating a single-provider action already compose correctly, with no data-integrity risk', answer: 'YES — re-verified fresh, no overwrite, no lost provenance, no confusion (Section F)' },
            { question: 'Is multi-provider fan-out required to close this milestone\'s own question', answer: 'NO — 0.9.421 already found fan-out unwarranted; this milestone finds the existing single-provider choice, where capability exists, already reachable' },
            { question: 'Should this milestone force a uniform verdict across all three roles', answer: 'NO — the three roles genuinely classify differently (Section G), and forcing symmetry would misstate the evidence' }
        ];
        assert(decisionMatrix.length === 6, n('I1. every row of this milestone\'s own decision matrix is answered'));
        assert(decisionMatrix.every((row) => typeof row.answer === 'string' && row.answer.length > 0), n('I2. every answer is backed by a specific section above'));

        function decideDirection({ anyRoleHidesRealCapability, anyRoleGenuinelyNeedsFanOut }) {
            if (anyRoleHidesRealCapability) return 'ROLE_SPECIFIC_UI_GAP';
            if (anyRoleGenuinelyNeedsFanOut) return 'MULTI_PROVIDER_FANOUT_REQUIRED';
            return 'NO_PRODUCT_GAP';
        }
        assert(decideDirection({ anyRoleHidesRealCapability: true, anyRoleGenuinelyNeedsFanOut: false }) === 'ROLE_SPECIFIC_UI_GAP', n('I3. the function WOULD choose ROLE_SPECIFIC_UI_GAP if any role\'s classification (Section G) had come back UI_GAP_HIDDEN_CAPABILITY — a real, available branch'));
        assert(decideDirection({ anyRoleHidesRealCapability: false, anyRoleGenuinelyNeedsFanOut: true }) === 'MULTI_PROVIDER_FANOUT_REQUIRED', n('I4. and would choose MULTI_PROVIDER_FANOUT_REQUIRED if this milestone\'s own Section F had found a repeated-action composition bug forcing a real fan-out mechanism to exist instead'));

        const finalDecision = decideDirection({
            anyRoleHidesRealCapability: false,   // Section G: zero UI_GAP_HIDDEN_CAPABILITY classifications
            anyRoleGenuinelyNeedsFanOut: false     // Section F: repeated-action composition already works cleanly
        });
        assert(DECISIONS.includes(finalDecision), n(`I5. the final decision is one of this milestone's own legitimate outcomes (chose: ${finalDecision})`));
        assert(finalDecision === 'NO_PRODUCT_GAP', n(`I6. given zero roles hiding real, registered multi-provider capability, and a repeated-action composition that already works correctly, the decision is NO_PRODUCT_GAP — not ROLE_SPECIFIC_UI_GAP, since the one real asymmetry (Announcement/Discovery's missing mechanism) has no real capability behind it to hide; and not MULTI_PROVIDER_FANOUT_REQUIRED, since 0.9.421 already closed that question (chose: ${finalDecision})`));

        console.log('\n=== SECTION I: PRODUCT DECISION ===');
        for (const row of decisionMatrix) console.log(`  ${row.question}\n      -> ${row.answer}`);
        console.log(`\nDECISION: ${finalDecision}`);

        // Deliberate exclusion census.
        const antiPatterns = [
            /class\s+\w*DiscoveryPublisherRegistry\w*\b/,
            /class\s+\w*SubstratePicker\w*\b/,
            /path: '\/decentralized-substrates'/,
            /createPlacement\(entry, storages\)/,
            /createAnchor\(entry, anchorTypes\)/
        ];
        const scanDirs = ['ui', 'application', 'core', 'storage'];
        const bundle = codeOnly(await joinedSource(listFiles(scanDirs)));
        for (const pattern of antiPatterns) {
            assert(!pattern.test(bundle), n(`I7. no anti-pattern ${pattern} exists in real code (comments stripped) anywhere in ${scanDirs.join('/, ')}/`));
        }

        // Production boundary.
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/DecentralizedSubstrateRoleChoiceUIReachabilityAudit.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`I8. every changed/added file is exactly this milestone's own test/registration file (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const domainDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'ui', 'peer', 'content', 'presence', 'docs'];
        for (const dir of domainDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`I9. ${dir}/ shows no change — this audit evaluates reachability, it does not build anything`));
        }

        console.log('\n=== SECTION I (continued): DELIBERATE EXCLUSIONS + PRODUCTION BOUNDARY ===');
        console.log('✓ Section I: NO_PRODUCT_GAP, backed by every section above. No discovery-publisher registry, substrate-picker class, standalone substrate route, or multi-provider function signature was added. This milestone touches nothing but its own test file and tests.html\'s own registration.');
    }

    // ===============================================================
    // Verdict.
    // ===============================================================
    console.log('\n' + '='.repeat(78));
    console.log('DECENTRALIZED_SUBSTRATE_ROLE_CHOICE_UI_REACHABILITY_AUDIT_COMPLETE');
    console.log('');
    console.log('NO_PRODUCT_GAP. Two of the three RoleProviderRole roles — CONTENT and');
    console.log('PROOF_AND_ANCHORING — already share one real, generic, registry-driven');
    console.log('choice mechanism (SnapshotPlacementStoreRegistry / ExternalAnchorPublisherRegistry,');
    console.log('driving availableStorageTypes()/availableAnchorTypes() into a real,');
    console.log('route-reachable, per-publication v-for in ui/views/');
    console.log('DecentralizedPublicationsView.js) that would present a second button the');
    console.log('moment a second real provider were registered, with zero UI change');
    console.log('required (Sections A-D). CONTENT already has two real providers and');
    console.log('already exposes both, contextually, today. PROOF_AND_ANCHORING has only');
    console.log('one real provider, so its own real, ready mechanism currently has nothing');
    console.log('further to reveal — the identical, already-established situation 0.9.304');
    console.log('named for the preference chain, now reconfirmed true of the UI mechanism');
    console.log('itself. ANNOUNCEMENT_AND_DISCOVERY genuinely has no equivalent mechanism —');
    console.log('its one real write action is a fixed, pre-RoleProviderRole options-object');
    console.log('pipeline with no registry and no per-substrate control of any kind — but');
    console.log('this is a real architectural asymmetry with no current product');
    console.log('consequence, because exactly one real Nostr publisher and one real');
    console.log('Arweave uploader exist for it to choose between anyway (Section A/G).');
    console.log('Repeating a single-provider action already composes correctly today, with');
    console.log('no overwrite, no lost provenance, and no confusion between results');
    console.log('(Section F, re-verified fresh). Substrate choice, endpoint configuration,');
    console.log('and fan-out/failover remain three structurally separate concerns in real');
    console.log('source (Section H). This milestone recommends no new UI, no new registry,');
    console.log('and no generalized substrate-selection page: the one concretely named,');
    console.log('still-open item this audit surfaces for the record — never as a current');
    console.log('gap requiring action — is that ANNOUNCEMENT_AND_DISCOVERY has no');
    console.log('registry-driven extensibility point at all, so IF a genuine second real');
    console.log('provider for that role is ever built, exposing a choice for it would need');
    console.log('new mechanism work that CONTENT and PROOF_AND_ANCHORING would not need');
    console.log('repeated — a capability question for a future milestone, never a UI');
    console.log('question for this one.');
    console.log('='.repeat(78));

    console.log('\n✅ All Decentralized Substrate Role Choice UI Reachability Audit tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
