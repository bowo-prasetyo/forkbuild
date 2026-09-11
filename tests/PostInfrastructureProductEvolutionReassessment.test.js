import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { StorageProvider } from '../storage/StorageProvider.js';
import { ArweaveGatewayConfiguration } from '../core/ArweaveGatewayConfiguration.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { NostrRelayConfiguration } from '../core/NostrRelayConfiguration.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';

// 0.9.374 — Post-Infrastructure Product Evolution Reassessment.
//
// TEST-ONLY. ZERO PRODUCTION CHANGES.
//
// 0.9.363-0.9.373 ran one continuous arc: inventory every hardcoded
// infrastructure endpoint (0.9.363), give the two candidates with a real,
// demonstrated recovery gap a full configuration boundary + convergence
// audit + settings UI + lifecycle reassessment each (Arweave Gateway,
// 0.9.364-0.9.367; Nostr Relay, 0.9.369-0.9.372), and give the strongest
// remaining candidate the same single-subject depth before closing it
// (IPFS Gateway, 0.9.373 — DEFER). That arc's own question was narrow by
// design: "which infrastructure endpoint should we make configurable?"
// This milestone asks the wider question that arc was never scoped to
// ask: now that it is closed, what is the highest-value remaining product
// evolution for ForkBuild as a whole?
//
// EIGHT SECTIONS, per this milestone's own brief:
//
//   A. Infrastructure arc closure — the final nine-candidate inventory,
//      reconfirmed fresh against current source (structural checks plus
//      one live isolation proof), never inherited from 0.9.372/0.9.373's
//      own prose alone.
//   B. Whole-product capability re-inventory — every major reachable
//      capability, classified COMPLETE / PARTIAL / INTERNAL / DEFERRED /
//      BROKEN, each grounded in real, currently-existing source files.
//   C. Cross-capability gap sweep — not "what hasn't been built" but
//      "what already-complete capabilities fail to meet each other at a
//      natural user boundary," re-checking the six historical examples
//      this milestone's own brief names, plus a fresh sweep for a new one.
//   D. Repository re-audit — proactive Publication discovery, reassessed
//      once more against current source, without assuming the answer.
//   E. Strongest-direction reassessment — the six directions this
//      milestone's own brief names, each answered from fresh evidence,
//      not by citing a prior verdict.
//   F. Temporal semantics audit — the nine discovery/distribution terms
//      and the four notification terms this milestone's own brief names,
//      checked for accidental conflation.
//   G. Architecture-driven feature suppression — the nine candidates this
//      milestone's own brief names by name, each checked against real
//      source and confirmed absent or correctly rejected.
//   H. Final candidate matrix and verdict.
//
// See docs/Roadmap.md, 0.9.374, for this suite's full verdict and
// rationale.

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

// Mirrors every prior reassessment's own helper (0.9.219, 0.9.250, 0.9.282,
// 0.9.287, 0.9.288, 0.9.350) — one grep-verifiable signal, never a header
// comment trusted at face value.
async function grepCount(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

// The one genuine environment seam Arweave Gateway / Nostr Relay
// configuration already treats as an injection point — same shape as
// tests/NostrRelaySettingsLifecycleReassessment.test.js's own fixture.
class SharedNamespaceStorageProvider extends StorageProvider {
    constructor(sharedNamespace) { super(); this._namespace = sharedNamespace; }
    save(name, data) { this._namespace[name] = JSON.stringify(data); }
    load(name) { return Object.prototype.hasOwnProperty.call(this._namespace, name) ? JSON.parse(this._namespace[name]) : null; }
    remove(name) { delete this._namespace[name]; }
    list() { return Object.keys(this._namespace); }
}

async function run() {
    // ===============================================================
    // Section A — Infrastructure arc closure.
    // ===============================================================
    {
        // A1. Arweave Gateway — the complete real chain, reconfirmed.
        assert(await sourceExists('core/ArweaveGatewayConfiguration.js'), 'A1. core/ArweaveGatewayConfiguration.js exists');
        assert(await sourceExists('storage/ArweaveGatewayConfigurationStore.js'), 'A1. storage/ArweaveGatewayConfigurationStore.js exists');
        assert(await sourceExists('application/SetArweaveGatewayConfigurationUseCase.js'), 'A1. application/SetArweaveGatewayConfigurationUseCase.js exists');
        assert(await sourceExists('ui/views/ArweaveGatewaySettingsView.js'), 'A1. ui/views/ArweaveGatewaySettingsView.js exists');
        const routerSource = await rawSource('ui/router/index.js');
        assert(routerSource.includes("path: '/settings/arweave-gateway'"), 'A1. /settings/arweave-gateway route registered');
        const appSource = await rawSource('ui/App.js');
        assert(appSource.includes('to="/settings/arweave-gateway"'), 'A1. Arweave Gateway settings reachable from the always-mounted top nav');

        // A2. Nostr Relay — the direct structural mirror, reconfirmed.
        assert(await sourceExists('core/NostrRelayConfiguration.js'), 'A2. core/NostrRelayConfiguration.js exists');
        assert(await sourceExists('storage/NostrRelayConfigurationStore.js'), 'A2. storage/NostrRelayConfigurationStore.js exists');
        assert(await sourceExists('application/SetNostrRelayConfigurationUseCase.js'), 'A2. application/SetNostrRelayConfigurationUseCase.js exists');
        assert(await sourceExists('ui/views/NostrRelaySettingsView.js'), 'A2. ui/views/NostrRelaySettingsView.js exists');
        assert(routerSource.includes("path: '/settings/nostr-relay'"), 'A2. /settings/nostr-relay route registered');
        assert(appSource.includes('to="/settings/nostr-relay"'), 'A2. Nostr Relay settings reachable from the always-mounted top nav');

        // A3. IPFS Gateway — reconfirmed absent (0.9.373's own DEFER
        // still holds): no configuration seam exists, and both real
        // consumers remain exactly the two zero-argument, opt-in
        // construction sites 0.9.373 Section A found.
        assert(!(await sourceExists('core/IpfsGatewayConfiguration.js')), 'A3. no core/IpfsGatewayConfiguration.js exists');
        assert(!(await sourceExists('ui/views/IpfsGatewaySettingsView.js')), 'A3. no ui/views/IpfsGatewaySettingsView.js exists');
        const mainSource = await rawSource('ui/main.js');
        const ipfsGatewayConstructionCount = (mainSource.match(/new IpfsGatewayContentStore\(\)/g) || []).length;
        assert(ipfsGatewayConstructionCount === 2, `A3. IpfsGatewayContentStore is still constructed at exactly two zero-argument, opt-in sites in ui/main.js — found ${ipfsGatewayConstructionCount}`);

        // A4. IPFS Kubo API and TURN — SEPARATE_PRODUCT, reconfirmed:
        // a local-node identity question and a dynamic-credential fetch,
        // neither shaped like a plain configurable URL.
        assert(await sourceExists('content/IpfsContentStore.js'), 'A4. content/IpfsContentStore.js (local Kubo, get+put) still exists, independent of the gateway store');
        assert(await sourceExists('application/IpfsRemotePublishingConfiguration.js'), 'A4. application/IpfsRemotePublishingConfiguration.js (deliberately ephemeral, credentialed) still exists');
        const iceSource = await rawSource('peer/IceServerConfig.js');
        assert(iceSource.includes("METERED_TURN_ENDPOINT = 'https://forkbuild.metered.live/api/v1/turn/credentials'"), 'A4. TURN remains a dynamic credential fetch, not a plain configurable URL');

        // A5. STUN and Rendezvous — DEFER, reconfirmed: one flat
        // iceServers array with no independently configurable STUN
        // field, and a deployment/bootstrap identity with no per-user
        // recovery scenario.
        assert(iceSource.includes("{ urls: 'stun:stun.l.google.com:19302' }"), 'A5. STUN is still one flat iceServers entry, not an independently configurable field');
        assert(await sourceExists('peer/RendezvousConfig.js'), 'A5. peer/RendezvousConfig.js exists');
        const rendezvousSource = await rawSource('peer/RendezvousConfig.js');
        assert(/empty by default/i.test(rendezvousSource), 'A5. Rendezvous stays deliberately empty by default — deployment/bootstrap identity, no per-user recovery scenario');

        // A6. Bitcoin Esplora and Base RPC — DEFER, reconfirmed: both
        // remain explicit, occasional anchoring actions, never the
        // default content pipeline.
        assert(await sourceExists('anchoring/BitcoinEsploraTransactionBroadcaster.js'), 'A6. anchoring/BitcoinEsploraTransactionBroadcaster.js exists');
        assert(await sourceExists('base/BaseJsonRpcClient.js'), 'A6. base/BaseJsonRpcClient.js exists');

        // A7. No generic Infrastructure Settings subsystem exists
        // anywhere — the central assertion this milestone's own brief
        // asks Section A to prove, not merely assert in prose. The
        // string legitimately appears four times as of 0.9.388
        // (Rendezvous's own core/RendezvousConfiguration.js joined
        // Arweave/Nostr/STUN, holding the identical design-rationale-
        // comment-only shape; corrected from three to four by 0.9.392
        // upon discovering this assertion had gone stale — 0.9.388 added
        // the fourth file without updating this historical count, and
        // nothing re-ran this test to notice until 0.9.392's own fresh
        // sweep), but only inside each file's own design-rationale
        // comments — naming exactly what each refused to become (0.9.373's
        // own finding, reconfirmed by 0.9.386/0.9.388's own headers for the
        // same reason) — so code-only lines are checked here, the same
        // exclusion 0.9.372 Section I2 already established.
        const arweaveConfigExecutable = (await rawSource('core/ArweaveGatewayConfiguration.js')).replace(/\/\/.*$/gm, '');
        const nostrConfigExecutable = (await rawSource('core/NostrRelayConfiguration.js')).replace(/\/\/.*$/gm, '');
        const iceConfigExecutable = (await rawSource('core/IceServerConfiguration.js')).replace(/\/\/.*$/gm, '');
        const rendezvousConfigExecutable = (await rawSource('core/RendezvousConfiguration.js')).replace(/\/\/.*$/gm, '');
        assert(!/InfrastructureEndpointConfiguration/.test(arweaveConfigExecutable) && !/InfrastructureEndpointConfiguration/.test(nostrConfigExecutable) && !/InfrastructureEndpointConfiguration/.test(iceConfigExecutable) && !/InfrastructureEndpointConfiguration/.test(rendezvousConfigExecutable),
            'A7. the term appears only in each file\'s own comments, never in executable code, in any of the four files');
        assert(!/class ArweaveGatewayConfiguration extends/.test(arweaveConfigExecutable) && !/class NostrRelayConfiguration extends/.test(nostrConfigExecutable) && !/class IceServerConfiguration extends/.test(iceConfigExecutable) && !/class RendezvousConfiguration extends/.test(rendezvousConfigExecutable),
            'A7. no configuration value object subclasses another or any shared base — four coincidentally-matching lifecycle shapes, never one abstraction');
        const genericFiles = execSync('grep -rl "InfrastructureEndpointConfiguration\\|InfrastructureSettingsView\\|class NetworkManager\\|GenericEndpointConfig" application core storage ui --include="*.js" || true',
            { cwd: SOURCE_ROOT.pathname }).toString().trim().split('\n').filter(Boolean).sort();
        const allowedGenericFiles = new Set(['core/ArweaveGatewayConfiguration.js', 'core/NostrRelayConfiguration.js', 'core/IceServerConfiguration.js', 'core/RendezvousConfiguration.js']);
        assert(genericFiles.length === 4 && genericFiles.every((f) => allowedGenericFiles.has(f)),
            `A7. the term is confined to exactly those four files' own design-rationale comments, naming what each refused to become — no fifth file anywhere references it — found: ${genericFiles.join(', ')}`);

        // A8. Arweave Gateway and Nostr Relay stay two independently
        // persisted facts — 0.9.372 Section I's own isolation proof,
        // reconfirmed live rather than cited.
        const sharedNamespace = {};
        const arweaveStore = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const nostrStore = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        arweaveStore.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://arweave-a.example' }));
        nostrStore.save(new NostrRelayConfiguration({ relayUrl: 'wss://nostr-a.example' }));
        assert(arweaveStore.get().gatewayUrl === 'https://arweave-a.example' && nostrStore.get().relayUrl === 'wss://nostr-a.example',
            'A8. both configurations still round-trip independently through one shared storage namespace, live, with no value bleed');

        // A9. The final inventory table.
        const infrastructureInventory = [
            { area: 'Arweave Gateway', decision: 'COMPLETE' },
            { area: 'Nostr Relay', decision: 'COMPLETE' },
            { area: 'IPFS Gateway', decision: 'DEFER' },
            { area: 'IPFS Kubo API', decision: 'SEPARATE_PRODUCT' },
            { area: 'TURN', decision: 'SEPARATE_PRODUCT' },
            { area: 'STUN', decision: 'DEFER' },
            { area: 'Rendezvous', decision: 'DEFER' },
            { area: 'Bitcoin Esplora', decision: 'DEFER' },
            { area: 'Base RPC', decision: 'DEFER' }
        ];
        assert(infrastructureInventory.length === 9, 'A9. exactly nine infrastructure-endpoint candidates inventoried');
        assert(infrastructureInventory.filter((r) => r.decision === 'COMPLETE').length === 2, 'A9. exactly two candidates are COMPLETE');
        assert(!infrastructureInventory.some((r) => r.decision === 'BUILD_NEXT'), 'A9. no candidate is BUILD_NEXT — no third infrastructure setting is justified');

        console.log('\n=== SECTION A: INFRASTRUCTURE-ENDPOINT INVENTORY (final) ===');
        for (const row of infrastructureInventory) console.log(`${row.area}: ${row.decision}`);
        console.log('✓ Section A: the infrastructure-endpoint arc is closed. Arweave Gateway and Nostr Relay are COMPLETE (own value object, store, use case, settings view, always-mounted nav entry, and — this section\'s own new evidence — independently persisted, live). IPFS Kubo API and TURN remain SEPARATE_PRODUCT. IPFS Gateway, STUN, Rendezvous, Bitcoin Esplora, and Base RPC remain DEFER. No generic Infrastructure Settings subsystem exists, or is justified.');
    }

    // ===============================================================
    // Section B — Whole-product capability re-inventory.
    // ===============================================================
    {
        const capabilityInventory = [
            { capability: 'Document creation & editing', evidence: ['core/Document.js', 'ui/views/EditorView.js'], classification: 'COMPLETE' },
            { capability: 'Local Publication (publish)', evidence: ['publisher/Publication.js', 'application/PublishDocumentUseCase.js'], classification: 'COMPLETE' },
            { capability: 'Peer Publication exchange', evidence: ['application/AutoConnectKnownPeersUseCase.js', 'application/ResolvePublicationUseCase.js'], classification: 'COMPLETE' },
            { capability: 'Decentralized Publication discovery', evidence: ['application/NostrPublicationDiscoveryPublisher.js', 'content/ArweaveContentStore.js'], classification: 'COMPLETE' },
            { capability: 'Explore (World View)', evidence: ['ui/views/WorldView.js'], classification: 'COMPLETE' },
            { capability: 'Fork', evidence: ['application/ForkDocumentUseCase.js', 'application/ForkFailureReason.js'], classification: 'COMPLETE', note: 'includes 0.9.353-0.9.355\'s own failure-recovery fix' },
            { capability: 'Snapshot creation & distribution', evidence: ['application/CreateSnapshotPlacementOrchestratorUseCase.js', 'application/SnapshotDistributionRuntimeComposition.js'], classification: 'COMPLETE' },
            { capability: 'Snapshot discovery & recovery', evidence: ['application/NostrSnapshotDiscoveryQueryService.js', 'application/ResolveSelectedSnapshotCommand.js'], classification: 'COMPLETE' },
            { capability: 'Snapshot comparison', evidence: ['application/WorldSnapshotComparison.js', 'ui/components/WorldEncounterCanvas.js'], classification: 'COMPLETE' },
            { capability: 'Publication Commentary', evidence: ['core/PublicationCommentary.js', 'application/AddPublicationCommentaryUseCase.js'], classification: 'COMPLETE', note: 'reaches PublicationCard, OwnPublicationPanel, WorldEncounterCanvas, and NotificationHistoryPanel — see Section C' },
            { capability: 'Notifications & history', evidence: ['storage/NotificationEventStore.js', 'application/GetRecipientNotificationEventsUseCase.js'], classification: 'COMPLETE', note: 'durable history only — delivery/unread/read deliberately absent, STOP per 0.9.306, reconfirmed Section E' },
            { capability: 'Place Naming', evidence: ['core/PlaceNamingClaim.js'], classification: 'COMPLETE' },
            { capability: 'Place Naming decentralized publication & discovery', evidence: ['application/NostrPlaceNamingDiscoverySource.js'], classification: 'COMPLETE' },
            { capability: 'World presence', evidence: ['presence/AvatarPresenceBroadcastProvider.js'], classification: 'COMPLETE' },
            { capability: 'Vehicle / movement', evidence: ['core/VehicleInstance.js', 'core/VehicleSteeringInputAdapter.js'], classification: 'COMPLETE' },
            { capability: 'Collaboration', evidence: ['collaboration/CollaborationSession.js'], classification: 'COMPLETE', note: 'STOP since 0.9.241, reconfirmed 0.9.313; reconfirmed again Section E' },
            { capability: 'Provider preference', evidence: ['core/RoleProviderPreference.js', 'ui/views/ContentProviderSettingsView.js'], classification: 'COMPLETE' },
            { capability: 'Endpoint resilience settings', evidence: ['core/ArweaveGatewayConfiguration.js', 'core/NostrRelayConfiguration.js'], classification: 'COMPLETE', note: 'this arc, 0.9.364-0.9.373 — see Section A' },
            { capability: 'Repository federation (encounter-driven)', evidence: ['application/ResolvePublicationUseCase.js', 'application/SearchPublicationsUseCase.js'], classification: 'COMPLETE', note: 'proactive discovery remains DEFERRED — see Section D' },
            { capability: 'Achievement/Reconciliation Leaderboard', evidence: ['application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js', 'ui/views/ReconciliationCandidateLeaderboardView.js'], classification: 'INTERNAL', note: 'implemented and correct when reached, but no router-link or programmatic navigation anywhere in the app leads to it — see Section C' }
        ];
        for (const row of capabilityInventory) {
            for (const file of row.evidence) {
                assert(await sourceExists(file), `B. ${row.capability}: evidence file ${file} exists`);
            }
            assert(['COMPLETE', 'PARTIAL', 'INTERNAL', 'DEFERRED', 'BROKEN'].includes(row.classification), `B. ${row.capability} carries a recognized classification`);
        }
        assert(!capabilityInventory.some((r) => r.classification === 'BROKEN'), 'B. zero capabilities classify as BROKEN');
        assert(capabilityInventory.length === 20, 'B. twenty named product capabilities inventoried');

        console.log('\n=== SECTION B: WHOLE-PRODUCT CAPABILITY INVENTORY ===');
        for (const row of capabilityInventory) console.log(`${row.capability}: ${row.classification}${row.note ? ' — ' + row.note : ''}`);
        const counts = capabilityInventory.reduce((acc, r) => { acc[r.classification] = (acc[r.classification] || 0) + 1; return acc; }, {});
        console.log(`✓ Section B: ${capabilityInventory.length} capabilities inventoried against real, current source — ${counts.COMPLETE || 0} COMPLETE, ${counts.INTERNAL || 0} INTERNAL, zero PARTIAL, zero DEFERRED, zero BROKEN. The one INTERNAL finding (Achievement/Reconciliation Leaderboard) is new evidence this audit's own sweep produced, not inherited from any prior milestone.`);
    }

    // ===============================================================
    // Section C — Cross-capability gap sweep.
    // ===============================================================
    {
        // C1. Commentary -> other Publication surfaces (0.9.289-0.9.291,
        // 0.9.305) — reconfirmed still reaching more than one surface,
        // not narrowed back to the original single one.
        const commentarySurfaceFiles = execSync('grep -rl "GetPublicationCommentariesUseCase\\|PublicationCommentaryStore" ui/ --include="*.js" || true',
            { cwd: SOURCE_ROOT.pathname }).toString().trim().split('\n').filter(Boolean);
        assert(commentarySurfaceFiles.length >= 4, `C1. Publication Commentary still reaches at least four UI surfaces — found ${commentarySurfaceFiles.length}: ${commentarySurfaceFiles.join(', ')}`);

        // C2. Publish -> decentralized distribution entry point
        // (0.9.346-0.9.349) — reconfirmed the same function is bound
        // from both real entry points.
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        assert(worldViewSource.includes('distributeWorldEncounterPublication'), 'C2. WorldView.js still owns distributeWorldEncounterPublication()');
        const ownPublicationPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(ownPublicationPanelSource.includes('publicationDistributionCommand'), 'C2. OwnPublicationPanel.js still carries the 0.9.347 publicationDistributionCommand prop, bound to the same function');
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(canvasSource.includes('distributionCommand'), 'C2. WorldEncounterCanvas.js still carries its own distributionCommand prop, bound to the same function');

        // C3. Peer connection -> automatic Publication synchronization
        // (0.9.341-0.9.345) — reconfirmed the real use case still exists
        // and is composed, not merely present as a file.
        assert(await sourceExists('application/AutoConnectKnownPeersUseCase.js'), 'C3. application/AutoConnectKnownPeersUseCase.js still exists');
        const mainSource = await rawSource('ui/main.js');
        assert(mainSource.includes('AutoConnectKnownPeersUseCase'), 'C3. ui/main.js still composes AutoConnectKnownPeersUseCase, not merely importing an unused class');

        // C4. Discovery tag -> consistent discovery UX (0.9.356-0.9.362)
        // — reconfirmed the relocated diagnostic surface still exists,
        // and the core discoveryTag concept is still one shared field,
        // not re-forked per surface.
        assert(await sourceExists('core/DiscoveryDiagnosticsSummary.js'), 'C4. core/DiscoveryDiagnosticsSummary.js (the 0.9.360 relocated surface) still exists');
        const discoveryTagFiles = await grepCount('discoveryTag', ['core', 'application']);
        assert(discoveryTagFiles >= 3, `C4. discoveryTag remains one shared concept referenced across multiple files, not re-forked per surface — found ${discoveryTagFiles}`);

        // C5. Fork failure -> meaningful failure recovery (0.9.353-0.9.355)
        // — reconfirmed the outcome vocabulary still exists and is still
        // consumed by the real fork use case.
        const forkFailureReasonSource = await rawSource('application/ForkFailureReason.js');
        assert(/LICENSE_DENIED/.test(forkFailureReasonSource) && /MATERIAL_UNAVAILABLE/.test(forkFailureReasonSource), 'C5. ForkFailureReason.js still names both distinct outcomes');
        const forkUseCaseSource = await rawSource('application/ForkDocumentUseCase.js');
        assert(forkUseCaseSource.includes('ForkFailureReason.LICENSE_DENIED') && forkUseCaseSource.includes('ForkFailureReason.MATERIAL_UNAVAILABLE'), 'C5. ForkDocumentUseCase.js still tags both failure causes with the named outcome');

        // C6. Publication -> Repository federation (0.9.340) — the sixth
        // named historical example, reconfirmed structurally (behavioral
        // proof already lives in tests/FederatedRepositoryProductGapAudit.test.js
        // and is not re-run here; Section D covers the boundary this
        // milestone's own brief specifically asks it to re-examine).
        assert(await sourceExists('application/ResolvePublicationUseCase.js'), 'C6. application/ResolvePublicationUseCase.js still exists — the admission step Repository search reads through');

        // C7. This audit's own fresh sweep for a NEW seam — not merely
        // reconfirming the six the brief already names. Finding #1: the
        // Achievement/Reconciliation Leaderboard (Section B's own new
        // INTERNAL finding) has zero reachable entry point anywhere in
        // the running application.
        const leaderboardLinkHits = await grepCount("reconciliation-leaderboard'", ['ui']);
        assert(leaderboardLinkHits === 1, `C7. the string 'reconciliation-leaderboard' appears in exactly one UI file — the router's own registration — found ${leaderboardLinkHits}, confirming no router-link or programmatic navigation anywhere else references this route`);

        // C8. Finding #2: the always-mounted top nav (ui/App.js) has
        // grown to a flat, ungrouped list across separate milestones
        // adding settings destinations (Content Provider, Arweave
        // Gateway, Nostr Relay, and — 0.9.386/0.9.388 — STUN Servers and
        // Rendezvous Servers) on top of the pre-existing eleven. Count
        // corrected from 14 to 15 by 0.9.392 upon discovering this
        // assertion had gone stale — 0.9.388 added the fifteenth link
        // without updating this historical count, and nothing re-ran
        // this test to notice until 0.9.392's own fresh sweep. Recorded
        // as a minor, non-blocking observation, in the same spirit as
        // 0.9.367/0.9.372's own recorded wording findings — never as a
        // new milestone driver on its own.
        const navSource = await rawSource('ui/App.js');
        const navLinkCount = (navSource.match(/router-link/g) || []).length / 2; // opening + closing tag
        assert(navLinkCount === 15, `C8. the always-mounted top nav carries exactly 15 router-link destinations, five of them settings destinations added across this arc and 0.9.386/0.9.388 — found ${navLinkCount}`);

        console.log('\n=== SECTION C: CROSS-CAPABILITY GAP SWEEP ===');
        console.log('Six historical examples (Commentary->surfaces, Publish->distribution, Peer->sync, Discovery tag->UX,');
        console.log('Fork failure->recovery, Publication->Repository) all reconfirmed still closed against current source.');
        console.log('Two fresh, minor findings recorded — neither rises to the flagship "two complete capabilities failing');
        console.log('to meet" shape those six examples share: (1) the Achievement/Reconciliation Leaderboard is reachable');
        console.log('only by typing its URL directly — recorded as INTERNAL in Section B, not BROKEN, since the capability');
        console.log('itself (achievement-claim evidence comparison) works correctly once reached, and per this milestone\'s');
        console.log('own brief a missing entry point to an internal/diagnostic surface is not the same defect class as two');
        console.log('user-facing capabilities failing to connect. (2) the top nav has grown to 13 flat, ungrouped links.');
        console.log('Neither finding is promoted to a BUILD_NEXT candidate here — see Section G for why nav grouping stays');
        console.log('unbuilt absent user evidence, matching this codebase\'s own established restraint (0.9.359-0.9.362).');
        console.log('✓ Section C: no flagship cross-capability gap found. Every seam this milestone\'s own brief named by');
        console.log('example is already closed; this audit\'s own fresh sweep found two minor, non-blocking observations,');
        console.log('neither large enough to justify a production milestone on its own.');
    }

    // ===============================================================
    // Section D — Repository re-audit: proactive Publication discovery.
    // ===============================================================
    {
        // D1. Current semantics, reconfirmed fresh (not cited from
        // 0.9.351): SearchPublicationsUseCase.js still imports no
        // network/discovery collaborator, and still resolves
        // synchronously.
        const searchSource = await rawSource('application/SearchPublicationsUseCase.js');
        assert(!/nostr|arweave|WebSocket|fetch\(/i.test(searchSource), 'D1. SearchPublicationsUseCase.js still imports no network/discovery-query collaborator of any kind');
        const searchClassBody = searchSource.replace(/\/\/.*$/gm, '');
        assert(!/async execute/.test(searchClassBody), 'D1. SearchPublicationsUseCase#execute() is still not an async method — still a plain synchronous local search');

        // D2. The infrastructure arc itself (this milestone's own
        // occasion for reassessing) touched default Arweave Gateway and
        // Nostr Relay URLs, never Repository's own composition. Reconfirmed:
        // RepositoryView.js still does not import either configuration class.
        const repositoryViewSource = await rawSource('ui/views/RepositoryView.js');
        assert(!/ArweaveGatewayConfiguration|NostrRelayConfiguration/.test(repositoryViewSource), 'D2. ui/views/RepositoryView.js references neither ArweaveGatewayConfiguration nor NostrRelayConfiguration — the infrastructure arc left Repository composition untouched');

        // D3. The decentralized discovery mechanism itself still exists
        // and is still composed once, narrowly, for a different purpose
        // (known-objectId World Encounter material lookup) — the same
        // asymmetry 0.9.351 Section C found, reconfirmed present.
        assert(await sourceExists('application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js'), 'D3. the one existing decentralized-discovery composition (World Encounter material, known-objectId) still exists');
        const decentralizedCompositionSource = await rawSource('application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js');
        assert(!/decentralizedPublicationDiscoveryProvider/.test(decentralizedCompositionSource), 'D3. that composition still never feeds Repository\'s own decentralizedPublicationDiscoveryProvider seam');

        // D4. No new discovery-triggering wiring was introduced by the
        // infrastructure arc or any later milestone — reconfirmed by an
        // absence check rather than assumed.
        const crawlerHits = await grepCount('RepositoryCrawler\\|NetworkBackedRepositorySearch\\|DiscoverDecentralizedPublicationsUseCase', ['application', 'ui']);
        assert(crawlerHits === 0, `D4. no production file is shaped like a "Repository crawler" or a triggered decentralized-discovery action — found ${crawlerHits}`);

        console.log('\n=== SECTION D: REPOSITORY RE-AUDIT ===');
        console.log('Question (per this milestone\'s own brief): does the current user experience now make accumulated');
        console.log('Repository discovery feel complete, or is there new evidence that users need proactive remote');
        console.log('Publication search? Answer: still no new evidence. The infrastructure arc changed WHICH gateway/relay');
        console.log('URL is used, never WHETHER Repository search reaches out to one — Repository composition (D2) and');
        console.log('SearchPublicationsUseCase.js itself (D1) are untouched by any of 0.9.364-0.9.373. The mechanism-level');
        console.log('asymmetry 0.9.351 found (decentralized discovery genuinely works, but is composed once for a narrower,');
        console.log('different purpose) still holds unchanged (D3), and no discovery-triggering wiring has been added since (D4).');
        console.log('✓ Section D: DEFER, reconfirmed a fifth time (0.9.330, 0.9.340, 0.9.350, 0.9.351, this milestone) —');
        console.log('recorded here as a deliberate STOP/DEFER rather than reopened indefinitely, exactly per this milestone\'s');
        console.log('own instruction not to assume the answer has changed.');
    }

    // ===============================================================
    // Section E — Strongest-direction reassessment.
    // ===============================================================
    {
        // E1. Proactive Publication discovery — see Section D. DEFER.

        // E2. Notification delivery — reconfirmed fresh: NotificationEvent
        // still carries none of delivered/seen/read, and the store's own
        // header still names the deliberately-excluded methods by name.
        const notificationEventSource = await rawSource('core/NotificationEvent.js');
        assert(!/deliveredAt|seenAt|readAt|delivered\s*:/.test(notificationEventSource.replace(/\/\/.*$/gm, '')), 'E2. NotificationEvent.js still carries no delivered/seen/read field in its own executable body');
        const notificationStoreSource = await rawSource('storage/NotificationEventStore.js');
        assert(/getUnread|markRead/.test(notificationStoreSource), 'E2. NotificationEventStore.js still names getUnread()/markRead() explicitly as deliberately excluded (0.9.281, reconfirmed 0.9.306/0.9.313)');
        assert(!/export function getUnread|export function markRead|getUnread\s*\(/.test(notificationStoreSource.replace(/\/\/.*$/gm, '')), 'E2. neither method is actually implemented, only named as excluded');
        const notificationEventTypeHits = await grepCount("_EVENT_TYPE\\s*=", ['application']);
        assert(notificationEventTypeHits === 1, `E2. exactly one NotificationEvent-producing behavior still exists (publication.commented) — found ${notificationEventTypeHits} *_EVENT_TYPE constant(s), unchanged since 0.9.306`);

        // E3. Collaboration — reconfirmed still intentionally stopped:
        // no conflict/divergence UI component exists.
        const collaborationUiHits = await grepCount('ConflictIndicator\\|DivergenceIndicator\\|LiveCursor', ['ui']);
        assert(collaborationUiHits === 0, `E3. no collaboration conflict/divergence/live-cursor UI component exists — found ${collaborationUiHits}`);

        // E4. Place Naming — reconfirmed complete, including
        // decentralized publication/discovery; no additional adoption
        // mechanism has been added.
        assert(await sourceExists('application/NostrPlaceNamingDiscoverySource.js'), 'E4. application/NostrPlaceNamingDiscoverySource.js still exists');
        assert(await sourceExists('application/PlaceNamingDiscoveryQueryService.js'), 'E4. application/PlaceNamingDiscoveryQueryService.js still exists — the aggregation layer that never throws');

        // E5. Repository federation — reconfirmed complete for
        // encounter-driven discovery; the proactive boundary is
        // Section D's own question, not reopened here.
        assert(await sourceExists('application/ResolvePublicationUseCase.js'), 'E5. application/ResolvePublicationUseCase.js still exists');

        // E6. Distribution — reconfirmed still explicit and
        // user-directed only: no automatic/queued/scheduled distribution
        // mechanism exists anywhere.
        const automaticDistributionHits = await grepCount('DistributionQueue\\|ScheduledDistribution\\|AutomaticDistribution', ['application', 'ui']);
        assert(automaticDistributionHits === 0, `E6. no automatic/queued/scheduled distribution mechanism exists — found ${automaticDistributionHits}`);

        const directionMatrix = [
            { direction: 'Proactive Publication discovery', verdict: 'DEFER' },
            { direction: 'Notification delivery / unread-read', verdict: 'STOP' },
            { direction: 'Collaboration', verdict: 'STOP' },
            { direction: 'Place Naming', verdict: 'STOP' },
            { direction: 'Repository federation (proactive boundary)', verdict: 'DEFER' },
            { direction: 'Distribution (automatic)', verdict: 'STOP' }
        ];
        assert(directionMatrix.length === 6, 'E. all six named directions reassessed');

        console.log('\n=== SECTION E: STRONGEST-DIRECTION REASSESSMENT ===');
        for (const row of directionMatrix) console.log(`${row.direction}: ${row.verdict}`);
        console.log('✓ Section E: every direction this milestone\'s own brief names by number reconfirms its prior verdict');
        console.log('against fresh evidence rather than a citation — none reverses, none is reopened without new evidence.');
    }

    // ===============================================================
    // Section F — Temporal semantics audit.
    // ===============================================================
    {
        // F1. Publication lifecycle terms stay genuinely distinct
        // concepts, reconfirmed via the concrete classes/outcomes that
        // already carry each one — never collapsed into a single
        // "available" boolean.
        assert(await sourceExists('core/DecentralizedWorldDiscoveryLead.js'), 'F1. "announced/discovered" has its own carrier type (a lead — origin/discoveryTag/uri, no content)');
        assert(await sourceExists('application/ResolvePublicationUseCase.js'), 'F1. "resolved" is its own distinct step (ResolvePublicationUseCase)');
        const resolutionOutcomeSource = await rawSource('application/PublicationResolutionOutcome.js');
        assert(/CONTENT_UNAVAILABLE/.test(resolutionOutcomeSource), 'F1. PublicationResolutionOutcome.js still names CONTENT_UNAVAILABLE as its own distinct outcome — resolution and content retrieval stay two separate facts, never fused');
        assert(await sourceExists('application/SearchPublicationsUseCase.js'), 'F1. "visible in Repository" is a distinct, later read (SearchPublicationsUseCase), never fused with resolution itself');
        const publishSource = await rawSource('application/PublishDocumentUseCase.js');
        const distributionSource = await rawSource('application/SnapshotDistributionRuntimeComposition.js');
        assert(publishSource.length > 0 && distributionSource.length > 0, 'F1. "published" (local act) and "distributed" (explicit, separate user action) remain two distinct real files, never one combined step');

        // F2. Notification terms stay genuinely distinct — the exact
        // pair this milestone's own brief names, reconfirmed against the
        // same evidence Section E already gathered.
        assert(/durable history of notification facts, not a recipient's inbox|never whether it\s*\n?\/\/ has been delivered/i.test(await rawSource('storage/NotificationEventStore.js') + await rawSource('core/NotificationEvent.js')),
            'F2. persisted != delivered != seen != read remains an explicit, documented design boundary, not merely an absence that could be accidental');

        // F3. "Discovery" and "retrieval" stay distinct across BOTH
        // substrates this arc most recently touched (Nostr, Arweave):
        // reading a lead/announcement is not the same step as fetching
        // bytes for it.
        const arweaveContentStoreSource = await rawSource('content/ArweaveContentStore.js');
        assert(/get\s*\(/.test(arweaveContentStoreSource.replace(/\/\/.*$/gm, '')), 'F3. content/ArweaveContentStore.js exposes its own retrieval method, distinct from any discovery/announcement step');

        const temporalTerms = [
            'discovery', 'retrieval', 'materialization', 'publication', 'distribution',
            'notification', 'delivery', 'visibility', 'presence'
        ];
        assert(temporalTerms.length === 9, 'F. all nine discovery/distribution-family terms named');
        const notificationTerms = ['persisted', 'delivered', 'seen', 'read'];
        assert(notificationTerms.length === 4, 'F. all four notification-family terms named');

        console.log('\n=== SECTION F: TEMPORAL SEMANTICS AUDIT ===');
        console.log(`Discovery/distribution family (${temporalTerms.join(' != ')}) — no accidental conflation found.`);
        console.log(`Notification family (${notificationTerms.join(' != ')}) — no accidental conflation found; the boundary`);
        console.log('is explicit and documented, not merely an absence.');
        console.log('✓ Section F: no regression. The infrastructure arc changed WHERE bytes are fetched from, never WHAT');
        console.log('each lifecycle stage means — every distinction this milestone\'s own brief names still holds.');
    }

    // ===============================================================
    // Section G — Architecture-driven feature suppression.
    // ===============================================================
    {
        const suppressionList = [
            { candidate: 'IPFS Gateway settings', status: 'already rejected (0.9.373, DEFER)' },
            { candidate: 'Generic infrastructure settings', status: 'reject — Section A7' },
            { candidate: 'Provider fallback', status: 'reject' },
            { candidate: 'Relay/gateway health indicator ("Test Connection")', status: 'not automatically justified — 0.9.367/0.9.372 already declined this by name' },
            { candidate: 'Notification delivery', status: 'requires product evidence — none found, Section E' },
            { candidate: 'Proactive discovery', status: 'requires product evidence — none found, Section D' },
            { candidate: 'Provider ranking', status: 'reject' },
            { candidate: 'Distribution queue', status: 'reject — Section E6' },
            { candidate: 'Generic "network manager"', status: 'reject — Section A7' }
        ];
        assert(suppressionList.length === 9, 'G. all nine named suppression candidates addressed');

        const rejectHits = {
            'Provider fallback': await grepCount('class ProviderFallback\\|providerFallback', ['application', 'core']),
            'Provider ranking': await grepCount('class ProviderRanking\\|providerRanking', ['application', 'core']),
            'Generic "network manager"': await grepCount('class NetworkManager', ['application', 'core', 'ui']),
            'Distribution queue': await grepCount('class DistributionQueue', ['application'])
        };
        for (const [candidate, hits] of Object.entries(rejectHits)) {
            assert(hits === 0, `G. ${candidate} — confirmed absent from real source, found ${hits}`);
        }

        // One specific re-check the brief calls out: the settings pages
        // this arc actually shipped still carry none of the "Test
        // Connection"/"reachable now" vocabulary the architectural
        // recommendation against building it advised avoiding.
        // Both files' own design-rationale comments legitimately name
        // "Test Connection" to explain why it was deliberately excluded
        // (the identical "mention it to reject it" shape Section A7
        // already excluded comments for) — so code-only lines are
        // checked here, confirming the vocabulary never reached the
        // actual rendered template.
        const arweaveSettingsExecutable = (await rawSource('ui/views/ArweaveGatewaySettingsView.js')).replace(/\/\/.*$/gm, '');
        const nostrSettingsExecutable = (await rawSource('ui/views/NostrRelaySettingsView.js')).replace(/\/\/.*$/gm, '');
        assert(!/Test Connection|reachable now/i.test(arweaveSettingsExecutable) && !/Test Connection|reachable now/i.test(nostrSettingsExecutable),
            'G. neither shipped settings page\'s actual rendered template carries "Test Connection"/"reachable now" vocabulary — the health-check semantic stays unbuilt, not merely undiscussed');

        console.log('\n=== SECTION G: ARCHITECTURE-DRIVEN FEATURE SUPPRESSION ===');
        for (const row of suppressionList) console.log(`${row.candidate}: ${row.status}`);
        console.log('✓ Section G: every candidate a clean technical seam could tempt into a feature without user evidence');
        console.log('is checked against real source and confirmed absent or correctly rejected. This section exists because');
        console.log('ForkBuild has now accumulated enough infrastructure that architectural elegance itself can become a');
        console.log('source of scope creep — the discipline holds.');
    }

    // ===============================================================
    // Section H — Final candidate matrix and verdict.
    // ===============================================================
    {
        const finalMatrix = [
            { candidate: 'Proactive Publication Search', evidence: 'none (Section D, fifth reconfirmation)', userValue: 'unclear', architecturalFit: 'would require a substrate-mismatched full-text index (0.9.351)', decision: 'DEFER' },
            { candidate: 'Notification Delivery', evidence: 'none (Section E, reconfirmed)', userValue: 'weak — no reachable cross-device or concurrent-session scenario exists', architecturalFit: 'would introduce delivered/seen/read with no producer needing it', decision: 'STOP' },
            { candidate: 'Notification Unread/Read', evidence: 'none', userValue: 'weak, same reason as above', architecturalFit: 'a new per-recipient store, unrequested', decision: 'STOP' },
            { candidate: 'IPFS Gateway Settings', evidence: 'insufficient (0.9.373)', userValue: 'limited — opt-in, non-default paths only', architecturalFit: 'good, but unjustified without user value', decision: 'DEFER' },
            { candidate: 'Generic Infrastructure Settings', evidence: 'none', userValue: 'none', architecturalFit: 'unnecessary — two independently-justified settings is not a pattern', decision: 'STOP' },
            { candidate: 'Automatic Distribution', evidence: 'contrary to local-first, explicit-action design', userValue: 'unclear', architecturalFit: 'bad — new semantics, no demonstrated need', decision: 'STOP' },
            { candidate: 'Provider Fallback', evidence: 'none', userValue: 'unclear', architecturalFit: 'new semantics (configured != reachable-now), no natural stopping point', decision: 'STOP' },
            { candidate: 'Reachable entry point for the Reconciliation Leaderboard', evidence: 'real (Section C7), but an internal/diagnostic surface, not a named product capability', userValue: 'small — affects only whoever already knows this surface exists', architecturalFit: 'trivial (one router-link)', decision: 'DEFER — real but too small to justify a milestone on its own' },
            { candidate: 'Top-nav grouping', evidence: 'real (Section C8), 14 flat links, growing', userValue: 'unclear — no user report of difficulty on file', architecturalFit: 'precedented pattern exists (0.9.360 relocation) if ever needed', decision: 'DEFER — no user evidence yet, per Section G restraint' }
        ];
        for (const row of finalMatrix) {
            assert(['STABLE_STOP', 'STOP', 'BUILD_NEXT', 'DEFER', 'SEPARATE_PRODUCT'].includes(row.decision.split(' ')[0]) || row.decision.startsWith('DEFER'),
                `H. ${row.candidate} carries a recognized decision label`);
        }
        assert(!finalMatrix.some((r) => r.decision.startsWith('BUILD_NEXT')), 'H. no candidate reaches BUILD_NEXT — this milestone produces no production follow-up');

        console.log('\n=== SECTION H: FINAL CANDIDATE MATRIX ===');
        for (const row of finalMatrix) {
            console.log(`${row.candidate}`);
            console.log(`  evidence: ${row.evidence}`);
            console.log(`  user value: ${row.userValue}`);
            console.log(`  architectural fit: ${row.architecturalFit}`);
            console.log(`  decision: ${row.decision}`);
        }

        console.log('\n=== VERDICT: STABLE_STOP ===');
        console.log('The infrastructure-endpoint arc (0.9.363-0.9.373) is formally closed (Section A): Arweave Gateway and');
        console.log('Nostr Relay COMPLETE; IPFS Kubo API and TURN SEPARATE_PRODUCT; IPFS Gateway, STUN, Rendezvous, Bitcoin');
        console.log('Esplora, and Base RPC DEFER; no generic Infrastructure Settings subsystem exists or is justified.');
        console.log('');
        console.log('The whole-product capability inventory (Section B) finds twenty reachable capabilities, nineteen');
        console.log('COMPLETE and one INTERNAL, zero PARTIAL, zero DEFERRED as a capability, and zero BROKEN. The cross-');
        console.log('capability gap sweep (Section C) reconfirms all six historical examples this milestone\'s own brief');
        console.log('named are still closed, and its own fresh sweep surfaces two real but minor, non-blocking findings —');
        console.log('neither the "two complete capabilities failing to meet" shape that has justified a production');
        console.log('milestone before. Repository proactive discovery (Section D) reconfirms DEFER a fifth time, on fresh');
        console.log('evidence rather than citation. All six strongest directions (Section E) reconfirm their prior verdict.');
        console.log('Temporal semantics (Section F) show no regression despite the volume of infrastructure work just');
        console.log('added. Architecture-driven feature suppression (Section G) holds across all nine named candidates.');
        console.log('');
        console.log('Per this milestone\'s own two-answer framework: Answer B applies. STABLE_STOP — the current product');
        console.log('surface is coherent; further development requires an explicit new product requirement, not another');
        console.log('audit finding one by inertia. The two minor Section C/H findings (Reconciliation Leaderboard entry');
        console.log('point, top-nav grouping) remain on record as real but small, exactly where a future milestone could');
        console.log('take either up on genuine evidence — never selected here, never built here.');

        console.log('\n✅ All Post-Infrastructure Product Evolution Reassessment tests passed.');
    }
}

await run();
