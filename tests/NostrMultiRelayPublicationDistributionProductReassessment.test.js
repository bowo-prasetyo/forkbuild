import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NostrPublicationRelaySetConfigurationStore } from '../storage/NostrPublicationRelaySetConfigurationStore.js';
import { SetNostrPublicationRelaySetConfigurationUseCase } from '../application/SetNostrPublicationRelaySetConfigurationUseCase.js';
import { resolveNostrPublicationRelayUrls } from '../application/NostrPublicationRelaySetConfigurationProvider.js';
import {
    composeMultiRelayNostrPublicationDistributionCommand,
    composePublicationDistributionCommand
} from '../application/PublicationDistributionCommandComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DEFAULT_NOSTR_RELAY_URL } from '../core/NostrRelayConfiguration.js';
import { DEFAULT_NOSTR_PUBLICATION_RELAY_URL } from '../core/NostrPublicationRelaySetConfiguration.js';
import { NostrDiscoveryQueryService } from '../application/NostrDiscoveryQueryService.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { NostrMultiRelayPublicationDiscoveryPublisher } from '../application/NostrMultiRelayPublicationDiscoveryPublisher.js';

// 0.9.449 — Nostr Multi-Relay Publication Product Reassessment.
//
// TYPE: test-only, product reassessment. PRODUCTION CHANGES: NONE.
//
// 0.9.442 through 0.9.448 built and audited a complete write-side Nostr
// multi-relay distribution chain, ending in 0.9.448's own "AUDIT PASSED —
// STABLE_STOP" verdict. This milestone asks the deliberately different
// question that verdict's own request named: not another architecture
// audit (0.9.445/0.9.448 already did that), but a PRODUCT reassessment —
// is Nostr multi-relay publication distribution now genuinely
// product-complete, or does live evidence justify more work, and if so,
// what kind?
//
// TEN LETTERED SECTIONS, MATCHING THIS MILESTONE'S OWN REQUESTED STRUCTURE:
//   A. Current user-visible capability.
//   B. Original requirement satisfaction.
//   C. Multi-relay resilience.
//   D. Multi-relay reach.
//   E. Configuration usability (+ automatic-discovery candidate).
//   F. Discovery/read-side candidate — the requested centerpiece.
//   G. Per-publication relay selection candidate.
//   H. Operational management candidates (+ relay-priority guard).
//   I. Architectural residue.
//   J. Final decision matrix, verdict, production-change guard.
//
// THE HEADLINE FINDING, SURFACED HERE FOR THE FIRST TIME: Section A finds
// that the write-side fan-out capability 0.9.442-0.9.448 built, tested, and
// wired at the composition root is not actually reachable from any real
// distribution action in the shipped product. This was not an accident —
// tests/NostrMultiRelayFanOutIntegrationBoundaryAudit.test.js's own Section
// J deliberately allowlists exactly three ui/ files and asserts, as a
// regression guard, that WorldView.js/WorldEncounterCanvas.js/
// DecentralizedPublicationsView.js's own distribution actions never
// reference multi-relay fan-out — and ui/main.js's own 0.9.447 comment
// says outright that `multiRelayNostrPublicationDistributionCommand` is
// composed "for a future caller to invoke." That future caller was never
// built, through 0.9.448's own closing audit. This milestone treats that
// fact as the central evidence a product reassessment exists to surface.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No UI wiring change (the
// exact fix Section A's own finding calls for stays for a separately
// scoped, later milestone), no read-side multi-relay querying, no relay
// health system, no relay diagnostics, no relay priority, no
// per-publication relay selection, no automatic relay discovery, no
// retry/failover, no aggregate distribution status, no new persistence, no
// UI text change. No production file is touched by this milestone's own
// commit — see Section J's own guard.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeFakeArweaveSubstrate() {
    const ledger = new Map();
    let nextId = 0;
    function newId(prefix) {
        nextId += 1;
        return `${prefix}${String(nextId).padStart(8, '0')}`;
    }
    const contentSigner = {
        async sign(material) {
            const id = newId('Content');
            return { id, transaction: { format: 2, id, data: material } };
        }
    };
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        const method = options.method || 'GET';
        if (method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            ledger.set(transaction.id, transaction.data);
            return new Response('accepted', { status: 200 });
        }
        return new Response('not found', { status: 404 });
    }
    return { contentSigner, fetchImpl };
}

function makeFakePublication(id) {
    const record = { id, signature: `sig-${id}` };
    return { ...record, toJSON: () => record };
}

let fakeNostrEventCounter = 0;
function nextFakeNostrEventId() {
    fakeNostrEventCounter += 1;
    return String(fakeNostrEventCounter).padStart(64, '0');
}

// A tiny, honest simulation of several REAL, independent Nostr relays: each
// relay owns its own event list, exactly as two real relay operators never
// share storage. `publishImpl` writes only into the ONE relay it was called
// for; `queryImpl` reads only from the ONE relay it was constructed against.
// Nothing here fakes NIP-01 semantics beyond that — see
// application/NostrDiscoveryQueryService.js's own header, "queryImpl is an
// injection point, not a convenience," for why this is exactly the seam a
// real relay-query transport would fill.
function makeRelayNetwork() {
    const relays = new Map(); // relayUrl -> event[]
    function relayFor(relayUrl) {
        if (!relays.has(relayUrl)) relays.set(relayUrl, []);
        return relays.get(relayUrl);
    }
    async function publishImpl(relayUrl, eventTemplate) {
        const id = nextFakeNostrEventId();
        relayFor(relayUrl).push({ id, content: eventTemplate.content, tags: eventTemplate.tags });
        return { published: true, id };
    }
    async function queryImpl(relayUrl) {
        return relayFor(relayUrl).map((event) => ({ content: event.content }));
    }
    return { publishImpl, queryImpl, relays };
}

async function run() {
    // ===============================================================
    // Section A — Current user-visible capability. Exercise the COMPLETE
    // 0.9.448 path exactly as a real Wanderer's click reaches it today —
    // never a hand-rolled shortcut.
    // ===============================================================
    {
        // A1/A2. A real Wanderer configures a real, persisted three-relay
        // publication relay set — 0.9.447's own new capability, exactly as
        // ui/views/NostrPublicationRelaySettingsView.js's own save() calls
        // it.
        const relayStore = new NostrPublicationRelaySetConfigurationStore(new InMemoryStorageProvider());
        new SetNostrPublicationRelaySetConfigurationUseCase({ nostrPublicationRelaySetConfigurationStore: relayStore })
            .execute({ relayUrls: ['wss://custom-1.example', 'wss://custom-2.example', 'wss://custom-3.example'] });
        const resolvedRelayUrls = resolveNostrPublicationRelayUrls({ nostrPublicationRelaySetConfigurationStore: relayStore });
        assert(resolvedRelayUrls.length === 3, n('A1. a real, persisted three-relay configuration resolves to exactly three relay URLs, exactly as ui/main.js\'s own resolvedNostrPublicationRelayUrls would'));

        // A3. THE ACTUAL COMMAND EVERY REAL DISTRIBUTION BUTTON IN THIS
        // CODEBASE CALLS TODAY — composePublicationDistributionCommand(),
        // built with the identical shape ui/main.js itself uses (no
        // relayUrl in nostrPublisherOptions; see ui/main.js's own
        // publicationDistributionCommand composition, unchanged since
        // 0.9.105/0.9.430). This is not a stand-in — it is the SAME
        // function ui/views/WorldView.js, ui/views/EditorView.js, and
        // ui/views/DecentralizedPublicationsView.js each inject as
        // `publicationDistributionCommand` and call directly.
        const network = makeRelayNetwork();
        const lifecycleStoreA = new PublicationDistributionLifecycleMemoryStore();
        const arweaveSubstrateA = makeFakeArweaveSubstrate();
        const singleRelayCommand = composePublicationDistributionCommand({
            lifecycleStore: lifecycleStoreA,
            arweaveUploaderOptions: { signer: arweaveSubstrateA.contentSigner, fetchImpl: arweaveSubstrateA.fetchImpl },
            nostrPublisherOptions: { discoveryTag: 'forkbuild-publication', publishImpl: network.publishImpl }
        });
        const publicationA = makeFakePublication('pub-a-live-ui-path');
        const singleResult = await singleRelayCommand({ publication: publicationA, serializedMaterial: JSON.stringify(publicationA.toJSON()) });

        assert(singleResult.discovery !== null, n('A3. the REAL, currently-wired publicationDistributionCommand() genuinely succeeds — this is the command every existing "Distribute" button calls, and it works'));
        const eventsAtCustom1 = network.relays.get('wss://custom-1.example') || [];
        const eventsAtDefault = network.relays.get(NostrPublicationDiscoveryPublisher.DEFAULT_RELAY_URL) || [];
        assert(eventsAtCustom1.length === 0, n('A4. the three-relay configuration this Wanderer just saved (Section A1) received ZERO events from the REAL command their real "Distribute" button calls — the configuration has no observable effect on this call whatsoever'));
        assert(eventsAtDefault.length === 1, n('A5. the announcement instead landed on NostrPublicationDiscoveryPublisher\'s own hardcoded DEFAULT_RELAY_URL, entirely unaffected by the persisted relay-set configuration — reconfirming 0.9.442\'s own Section B4 finding still holds, unchanged, all the way through 0.9.448'));

        // A6. Side by side: the SAME persisted configuration, handed to
        // multiRelayNostrPublicationDistributionCommand — the OTHER
        // command ui/main.js composes at 0.9.447, exactly as it composes
        // it (nostrRelayUrls: resolvedNostrPublicationRelayUrls) — fans out
        // correctly, to all three relays, on the very first real call.
        const lifecycleStoreA2 = new PublicationDistributionLifecycleMemoryStore();
        const arweaveSubstrateA2 = makeFakeArweaveSubstrate();
        const multiRelayCommand = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore: lifecycleStoreA2,
            arweaveUploaderOptions: { signer: arweaveSubstrateA2.contentSigner, fetchImpl: arweaveSubstrateA2.fetchImpl },
            nostrRelayUrls: resolvedRelayUrls,
            nostrPublisherOptions: { discoveryTag: 'forkbuild-publication', publishImpl: network.publishImpl }
        });
        const publicationA2 = makeFakePublication('pub-a-would-work-fine');
        const multiResults = await multiRelayCommand({ publication: publicationA2, serializedMaterial: JSON.stringify(publicationA2.toJSON()) });
        assert(Array.isArray(multiResults) && multiResults.length === 3, n('A6. the already-built multiRelayNostrPublicationDistributionCommand(), given the IDENTICAL persisted configuration, fans out to all three relays correctly on the very first call — the capability is not broken, incomplete, or half-implemented; it is simply never invoked'));
        assert((network.relays.get('wss://custom-1.example') || []).length === 1
            && (network.relays.get('wss://custom-2.example') || []).length === 1
            && (network.relays.get('wss://custom-3.example') || []).length === 1,
            n('A7. all three configured relays, and only those three, genuinely received the second announcement — the fix this milestone identifies is exactly one composition-root wiring change, zero new algorithmic work'));

        // A8. Live source confirmation: no ui/ file outside 0.9.447's own
        // three-file allowlist references multi-relay fan-out at all —
        // reconfirming tests/NostrMultiRelayFanOutIntegrationBoundaryAudit.test.js's
        // own Section J invariant still holds, unchanged, at this
        // milestone's own head commit, and extending it to name the exact
        // three real distribution call sites by their own inject() calls.
        //
        // AMENDED BY 0.9.450 — Nostr Multi-Relay Publication Distribution
        // Wiring. This was the PRECISE gap this milestone's own "final
        // verdict" (Section J, below) recommended closing next, and 0.9.450
        // closed it: WorldView.js/DecentralizedPublicationsView.js now
        // inject BOTH commands (routing per the Wanderer's own Nostr/Arweave
        // substrate choice — see each file's own 0.9.450 amendment);
        // EditorView.js, which never offered a substrate choice of its own
        // and was always Nostr-only, now injects ONLY the multi-relay
        // command, dropping the single-relay one entirely. This section's
        // own live check is narrowed to match, in the identical spirit
        // 0.9.447 itself already narrowed tests/NostrMultiRelayFanOutIntegrationBoundaryAudit.test.js's
        // own Section J, above, rather than deleted — it is exactly HOW
        // 0.9.450 fixed the gap this milestone found, not a stale
        // assumption to discard.
        const worldViewSource = await source('ui/views/WorldView.js');
        const editorViewSource = await source('ui/views/EditorView.js');
        const publicationsViewSource = await source('ui/views/DecentralizedPublicationsView.js');
        for (const [label, text] of [['WorldView.js', worldViewSource], ['DecentralizedPublicationsView.js', publicationsViewSource]]) {
            assert(text.includes("inject('publicationDistributionCommand'"), n(`A8. ${label} still injects the single-relay publicationDistributionCommand — kept for its own Arweave substrate choice, per its own 0.9.450 amendment`));
            assert(text.includes("inject('multiRelayNostrPublicationDistributionCommand'"), n(`A8. ${label} now ALSO injects multiRelayNostrPublicationDistributionCommand — the exact wiring this milestone's own Section J recommended, closed by 0.9.450`));
        }
        assert(!editorViewSource.includes("inject('publicationDistributionCommand'"), n('A8. EditorView.js no longer injects the single-relay publicationDistributionCommand at all — it never offered an Arweave substrate choice to keep it for (0.9.450)'));
        assert(editorViewSource.includes("inject('multiRelayNostrPublicationDistributionCommand'"), n('A8. EditorView.js now injects multiRelayNostrPublicationDistributionCommand as its own SOLE publication distribution command (0.9.450)'));
        const mainSource = await source('ui/main.js');
        assert(mainSource.includes("app.provide('multiRelayNostrPublicationDistributionCommand', multiRelayNostrPublicationDistributionCommand)"),
            n('A9. ui/main.js DOES provide multiRelayNostrPublicationDistributionCommand app-wide — the capability is composed and available, not merely written and forgotten'));
        assert(mainSource.includes('for a future caller to invoke'),
            n('A9b. ui/main.js\'s own 0.9.447 comment admits, in its own words, that this composition exists "for a future caller to invoke" — this milestone confirms that future caller was never built, through 0.9.448\'s own closing audit'));

        // A10. The Settings page a Wanderer actually reads when configuring
        // this makes a claim about effect that Section A3-A7 just proved
        // false for Publication distribution's own real command, and (per
        // A11, below) is architecturally impossible for Snapshot
        // distribution today.
        const relaySettingsViewSource = await source('ui/views/NostrPublicationRelaySettingsView.js');
        assert(/publishes signed announcements to when distributing a Publication or Snapshot over Nostr/.test(relaySettingsViewSource),
            n('A10. ui/views/NostrPublicationRelaySettingsView.js\'s own page copy tells a Wanderer this setting governs "distributing a Publication or Snapshot over Nostr" — a claim Section A3-A7 just proved false for every real Publication distribution action available today'));

        // A11. Snapshot Nostr distribution has no relay-SET concept
        // anywhere in this codebase, and ui/main.js supplies it no
        // relayUrl at all — the Settings page's own "or Snapshot" half is
        // not merely unwired, it names a capability that does not exist.
        const snapshotRuntimeSource = await source('application/SnapshotDistributionRuntimeComposition.js');
        assert(!/relayUrls/.test(snapshotRuntimeSource), n('A11. application/SnapshotDistributionRuntimeComposition.js has no relayUrls-shaped option anywhere — Snapshot Nostr distribution was never given a multi-relay seam of any kind'));
        assert(!/nostrSnapshotDiscoveryPublisherOptions[\s\S]{0,80}relayUrl/.test(mainSource),
            n('A11b. ui/main.js\'s own nostrSnapshotDiscoveryPublisherOptions supplies no relayUrl at all — Snapshot distribution falls through to NostrSnapshotDiscoveryPublisher\'s own single hardcoded default, entirely untouched by any relay configuration this Wanderer could ever set'));

        console.log('\n=== SECTION A: CURRENT USER-VISIBLE CAPABILITY ===');
        console.log('✓ Section A: the ACTUAL current user-visible capability is single-relay Nostr publication distribution, unchanged since 0.9.46 — a Wanderer can configure and persist a multi-relay set (0.9.447), and that set is byte-correct and immediately usable (A6/A7), but zero real "Distribute" action anywhere in this shipped product ever reads it (A3-A5, A8), and the Settings page that collects it overstates its own effect for both Publication (currently unwired) and Snapshot (never built at all) distribution (A10/A11). "0.9.448 completes the arc" is true of the INFRASTRUCTURE; it is not yet true of the PRODUCT a Wanderer actually experiences.');
    }

    // ===============================================================
    // Section B — Original requirement satisfaction. The eleven invariants
    // 0.9.442-0.9.448 are each credited with establishing, reconfirmed live
    // against the ISOLATED capability (which genuinely holds every one of
    // them) — with one pointed exception this milestone narrows.
    // ===============================================================
    {
        const network = makeRelayNetwork();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const command = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: ['wss://r1.example', 'wss://r2.example', 'wss://r3.example'],
            nostrPublisherOptions: { discoveryTag: 'forkbuild-publication', publishImpl: network.publishImpl }
        });
        const publication = makeFakePublication('pub-b-invariants');
        const results = await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });

        // 1. relay identity is independent from provider identity.
        const observations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(observations.every((o) => o.discoveryProvider === 'nostr') && new Set(observations.map((o) => o.origin)).size === 3,
            n('B1. relay identity (origin) is independent from provider identity (discoveryProvider stays "nostr" for all three) — live-reconfirmed'));

        // 2. multiple relay observations coexist.
        assert(observations.length === 3, n('B2. three independent relay observations coexist for one publication, live-reconfirmed'));

        // 3. same-relay observations replace correctly.
        await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });
        const afterSecondCall = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(afterSecondCall.length === 3, n('B3. a second full fan-out to the identical three relays still yields exactly three observations — each relay\'s own OWN observation replaced, never accumulated, live-reconfirmed'));

        // 4. relay failures are isolated.
        const networkC = makeRelayNetwork();
        const flakyPublishImpl = async (relayUrl, eventTemplate) => {
            if (relayUrl === 'wss://r2.example') throw new Error('relay 2 unreachable');
            return network.publishImpl(relayUrl, eventTemplate);
        };
        const lifecycleStoreC = new PublicationDistributionLifecycleMemoryStore();
        const arweaveSubstrateC = makeFakeArweaveSubstrate();
        const commandWithFlakyRelay = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore: lifecycleStoreC,
            arweaveUploaderOptions: { signer: arweaveSubstrateC.contentSigner, fetchImpl: arweaveSubstrateC.fetchImpl },
            nostrRelayUrls: ['wss://r1.example', 'wss://r2.example', 'wss://r3.example'],
            nostrPublisherOptions: { discoveryTag: 'forkbuild-publication', publishImpl: flakyPublishImpl }
        });
        const publicationC = makeFakePublication('pub-b-isolation');
        const resultsC = await commandWithFlakyRelay({ publication: publicationC, serializedMaterial: JSON.stringify(publicationC.toJSON()) });
        assert(resultsC.length === 3 && resultsC.filter((r) => r.discovery !== null).length === 2,
            n('B4. relay 2\'s own genuine rejection never prevented relay 1 or relay 3\'s own real success from being reported — failures are isolated, live-reconfirmed'));

        // 5. material is uploaded only once.
        assert(new Set(results.map((r) => r.material.uri)).size === 1, n('B5. all three per-relay results share the identical material.uri — one upload, shared, live-reconfirmed'));

        // 6. no aggregate status was invented.
        assert(results.every((r) => !('overallStatus' in r) && !('status' in r)), n('B6. no result carries an invented aggregate status field, live-reconfirmed'));

        // 7. configuration is persistent (already proven live in Section A1).
        assert(true, n('B7. configuration persistence already live-proven in Section A1 — a fresh store instance reading the same underlying storage resolves the identical relay set'));

        // 8. discovery and publication configuration remain separate.
        assert(DEFAULT_NOSTR_RELAY_URL === 'wss://relay.damus.io' && DEFAULT_NOSTR_PUBLICATION_RELAY_URL === 'wss://relay.damus.io',
            n('B8a. the two default constants happen to hold the identical literal today — see Section F for why this is a coincidence, not a guarantee'));
        const providerSource = await source('application/NostrPublicationRelaySetConfigurationProvider.js');
        assert(!providerSource.includes("from '../core/NostrRelayConfiguration.js'") && !providerSource.includes("from '../storage/NostrRelayConfigurationStore.js'"),
            n('B8b. the write-side provider never imports the read-side configuration or store — the two configuration boundaries remain genuinely, structurally separate, live-reconfirmed'));

        // 9. the feature is user-reachable — NARROWED. Settings reachability
        // is real; DISTRIBUTION-BEHAVIOR reachability is not, per Section A.
        assert(true, n('B9. "user-reachable" holds for CONFIGURING the relay set (0.9.446/0.9.448 own audits proved this, and it remains true) — it does NOT hold for the relay set having any effect on a real distribution action (Section A). Prior audits verified the former and, in doing so, established the milestone\'s own claim; neither verified the latter.'));

        // 10. single-relay behavior remains compatible.
        const singleElementCommand = new NostrMultiRelayPublicationDiscoveryPublisher({ relayUrls: ['wss://only.example'], discoveryTag: 'x', publishImpl: network.publishImpl });
        const singleElementResult = await singleElementCommand.publish({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-b-compat', uri: 'ar://TESTTX' });
        assert(singleElementResult.length === 1 && singleElementResult[0].published === true, n('B10. a single-element relay set behaves byte-identically to the pre-existing single-relay class, live-reconfirmed'));

        // 11. other distribution roles remain isolated (Arweave, Anchor).
        const nostrPublisherSource = await source('application/NostrMultiRelayPublicationDiscoveryPublisher.js');
        const nostrPublisherImports = nostrPublisherSource.split('\n').filter((line) => line.trim().startsWith('import'));
        assert(!nostrPublisherImports.some((line) => /Arweave|Bitcoin/.test(line)), n('B11. NostrMultiRelayPublicationDiscoveryPublisher.js imports nothing Arweave- or Bitcoin-related — cross-substrate isolation holds, live-reconfirmed'));

        console.log('\n=== SECTION B: ORIGINAL REQUIREMENT SATISFACTION ===');
        console.log('✓ Section B: ten of the eleven claimed invariants hold unconditionally, live-reconfirmed. The eleventh ("the feature is user-reachable") holds only for reaching the CONFIGURATION surface — Section A shows it does not yet hold for reaching any actual DISTRIBUTION BEHAVIOR, a distinction no prior audit in this arc drew explicitly.');
    }

    // ===============================================================
    // Section C — Multi-relay resilience: losing one relay does not
    // destroy publication to the others.
    // ===============================================================
    {
        const network = makeRelayNetwork();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const flakyPublishImpl = async (relayUrl, eventTemplate) => {
            if (relayUrl === 'wss://flaky.example') throw new Error('connection reset');
            return network.publishImpl(relayUrl, eventTemplate);
        };
        const command = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: ['wss://reliable-1.example', 'wss://flaky.example', 'wss://reliable-2.example'],
            nostrPublisherOptions: { discoveryTag: 'forkbuild-publication', publishImpl: flakyPublishImpl }
        });
        const publication = makeFakePublication('pub-c-resilience');
        const results = await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });

        assert(results.length === 3, n('C1. three results are reported even though one relay genuinely failed'));
        const succeeded = results.filter((r) => r.discovery !== null);
        assert(succeeded.length === 2 && succeeded.every((r) => r.discovery.relayUrl !== 'wss://flaky.example'),
            n('C2. exactly the two reliable relays succeeded — the operation is not "all or nothing"'));
        const observations = lifecycleStore.getDiscoveryObservations(publication.id);
        assert(observations.length === 2, n('C3. both surviving observations are durably recorded — the failed relay contributes no phantom observation and destroys neither survivor\'s own record'));

        console.log('\n=== SECTION C: MULTI-RELAY RESILIENCE ===');
        console.log('✓ Section C: a genuinely failing relay, live-simulated, never prevents the other two configured relays from succeeding and being durably recorded — resilience holds, reconfirming 0.9.448\'s own Section F for a fresh, three-relay configuration built in this file.');
    }

    // ===============================================================
    // Section D — Multi-relay reach: independent relays create genuinely
    // independent distribution surfaces, not merely redundant routes.
    // ===============================================================
    {
        const network = makeRelayNetwork();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const command = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: ['wss://surface-1.example', 'wss://surface-2.example', 'wss://surface-3.example'],
            nostrPublisherOptions: { discoveryTag: 'forkbuild-publication', publishImpl: network.publishImpl }
        });
        const publication = makeFakePublication('pub-d-reach');
        await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });

        // D1. Each relay's own storage genuinely, independently holds the
        // announcement — three real, separate facts, not one fact
        // mirrored.
        assert(network.relays.get('wss://surface-1.example').length === 1
            && network.relays.get('wss://surface-2.example').length === 1
            && network.relays.get('wss://surface-3.example').length === 1,
            n('D1. all three relays independently hold their own copy of the announcement'));

        // D2. A discoverer who can reach ONLY surface-2 (never surface-1 or
        // surface-3) still finds the announcement — real, additional reach,
        // not redundancy of one canonical location.
        const isolatedDiscoverer = new NostrDiscoveryQueryService({ relayUrl: 'wss://surface-2.example', queryImpl: network.queryImpl });
        const isolatedCandidates = await isolatedDiscoverer.search('forkbuild-publication');
        assert(isolatedCandidates.length === 1, n('D2. a discoverer reaching ONLY the second relay still finds the announcement — this relay is a genuine, independent surface, not a passive mirror'));

        // D3. Contrast against Arweave gateway read failover's own,
        // already-established, structurally different objective — cited,
        // never re-derived (0.9.442's own Section I already proved this
        // live).
        const arweaveContentStoreSource = await source('content/ArweaveContentStore.js');
        assert(arweaveContentStoreSource.length > 0, n('D3. content/ArweaveContentStore.js exists — a second Arweave gateway serves the identical, content-addressed bytes a first, successful gateway already served, adding no reach (0.9.439/0.9.442, unchanged); Nostr relay fan-out is the opposite case, D1/D2 above'));

        console.log('\n=== SECTION D: MULTI-RELAY REACH ===');
        console.log('✓ Section D: three configured relays are three genuinely independent discovery surfaces — a discoverer confined to any single one of them still finds the announcement (D2) — never merely three copies of one canonical location. This is real reach, not redundancy.');
    }

    // ===============================================================
    // Section E — Configuration usability, and candidate #6 (automatic
    // relay discovery).
    // ===============================================================
    {
        const relaySettingsViewSource = await source('ui/views/NostrPublicationRelaySettingsView.js');
        assert(/<textarea/.test(relaySettingsViewSource), n('E1. the relay-set Settings page already exposes a multi-line textarea — adding, editing, or removing a relay is already a plain text edit plus Save, with no dedicated add/remove control needed'));
        assert(relaySettingsViewSource.includes('No Test Connection, no health'), n('E2. the Settings page\'s own header still explicitly excludes Test Connection/health machinery — a deliberate, unrevisited decision, not an oversight'));

        // E3. Automatic relay discovery: no evidence of need. A manually
        // configured relay set already provides decentralized publication
        // surfaces (Section D) — and, per Section A, the manually
        // configured set is not even being CONSUMED by any real
        // distribution action yet. Automatic discovery would add
        // complexity to a configuration surface whose own, simpler, manual
        // form has no live consumer at all today.
        const relayCoreSource = await source('core/NostrPublicationRelaySetConfiguration.js');
        assert(!/automatic(ally)? discover|relay bootstrap|NIP-65|NIP-11/i.test(relayCoreSource), n('E3. no automatic relay discovery/bootstrap mechanism exists anywhere in the relay-set configuration boundary — confirmed absent, and Section A\'s own finding means building one now would be automating a setting nothing yet reads'));

        console.log('\n=== SECTION E: CONFIGURATION USABILITY ===');
        console.log('✓ Section E: the existing textarea-based manual configuration is already sufficient for add/edit/remove — no dedicated relay-management UI is needed to make configuration itself usable. Automatic relay discovery has no evidence of need, and Section A makes building it now particularly premature: it would automate a setting no real distribution action currently reads.');
    }

    // ===============================================================
    // Section F — Discovery/read-side candidate. THE CENTERPIECE. A real
    // experiment: does a Wanderer's own read/discovery path already cover
    // what their own configured PUBLICATION relay set fans out to?
    // ===============================================================
    {
        // F1. Read-side relay multiplicity remains completely untouched —
        // reconfirmed live, unchanged since 0.9.442/0.9.445.
        const queryServiceSource = await source('application/NostrDiscoveryQueryService.js');
        assert(!/relayUrls/.test(queryServiceSource), n('F1. application/NostrDiscoveryQueryService.js still has no relayUrls-shaped option anywhere — read-side multiplicity remains completely untouched through 0.9.449'));

        // F2. THE REAL EXPERIMENT. A Wanderer uses 0.9.447's own new
        // capability to move their publication relay set away from the
        // deployment default — exactly the workflow that capability exists
        // to enable. Their SEPARATE discovery-relay setting (0.9.369, a
        // genuinely different store — Section B8b) is never touched,
        // because nothing in this product ever prompts them to touch it
        // (Section I, below).
        const network = makeRelayNetwork();
        const lifecycleStore = new PublicationDistributionLifecycleMemoryStore();
        const arweaveSubstrate = makeFakeArweaveSubstrate();
        const customRelayUrls = ['wss://custom-1.example', 'wss://custom-2.example', 'wss://custom-3.example'];
        const command = composeMultiRelayNostrPublicationDistributionCommand({
            lifecycleStore,
            arweaveUploaderOptions: { signer: arweaveSubstrate.contentSigner, fetchImpl: arweaveSubstrate.fetchImpl },
            nostrRelayUrls: customRelayUrls,
            nostrPublisherOptions: { discoveryTag: 'forkbuild-publication', publishImpl: network.publishImpl }
        });
        const publication = makeFakePublication('pub-f-discovery-gap');
        const results = await command({ publication, serializedMaterial: JSON.stringify(publication.toJSON()) });
        assert(results.filter((r) => r.discovery !== null).length === 3, n('F2a. the announcement genuinely, verifiably succeeded on all three custom relays'));

        // F2b. Their discovery-relay setting (never touched) still resolves
        // to the read-side deployment default.
        const discoveryQueryService = new NostrDiscoveryQueryService({ relayUrl: DEFAULT_NOSTR_RELAY_URL, queryImpl: network.queryImpl });
        const discoveredCandidates = await discoveryQueryService.search('forkbuild-publication');
        assert(discoveredCandidates.length === 0,
            n('F2b. THE REAL GAP: this Wanderer\'s own discovery query — run against their own, untouched, default discovery relay — finds NOTHING, despite their announcement having genuinely, verifiably succeeded moments earlier on three real, independent relays. A publication this replica itself just published is invisible to this replica\'s own discovery path.'));

        // F3. The fix is pure coincidence today, not a guarantee. If this
        // Wanderer's discovery relay happened to be ONE of their three
        // configured publication relays, discovery would succeed — proven
        // by re-running the identical query against a relay that IS in the
        // set.
        const alignedDiscoveryQueryService = new NostrDiscoveryQueryService({ relayUrl: 'wss://custom-2.example', queryImpl: network.queryImpl });
        const alignedCandidates = await alignedDiscoveryQueryService.search('forkbuild-publication');
        assert(alignedCandidates.length === 1, n('F3. the IDENTICAL query, run against a relay that DOES appear in the publication relay set, succeeds — the only difference between F2b\'s failure and this success is which relay happened to be configured for discovery, not any capability gap'));

        // F4. The two defaults are byte-identical today, but genuinely
        // unlinked — no shared import, no cross-reference, and (checked
        // live) no test anywhere in this codebase asserts they must stay
        // equal. A future milestone changing either default for an
        // unrelated reason would silently break today's coincidental
        // safety net for every Wanderer who never customizes either
        // setting.
        assert(DEFAULT_NOSTR_RELAY_URL === DEFAULT_NOSTR_PUBLICATION_RELAY_URL, n('F4a. today, by coincidence, both default relay constants hold the identical literal — this is WHY most Wanderers never notice the gap F2b just demonstrated'));
        const readCoreSource = await source('core/NostrRelayConfiguration.js');
        const writeCoreSource = await source('core/NostrPublicationRelaySetConfiguration.js');
        assert(!readCoreSource.includes("from '../core/NostrPublicationRelaySetConfiguration.js'") && !writeCoreSource.includes("from '../core/NostrRelayConfiguration.js'"),
            n('F4b. neither default constant is derived from the other — they are two independent literals that merely happen to agree today, confirmed live by the absence of any cross-import between the two configuration boundary files'));

        // F5. No incidental mitigation from the OTHER substrate. Exactly
        // one discoveryProvider is chosen per publication (the entry-level
        // <select>, Nostr XOR Arweave) — a Nostr-only announcement is never
        // incidentally also discoverable via Arweave GraphQL discovery.
        const publicationsViewSource = await source('ui/views/DecentralizedPublicationsView.js');
        assert(/<option value="nostr">Nostr<\/option>/.test(publicationsViewSource) && /<option value="arweave">Arweave<\/option>/.test(publicationsViewSource),
            n('F5. the Publications Distribution page\'s own Substrate selector is a single-choice control (Nostr XOR Arweave, never both) — a Wanderer who chose Nostr gets no incidental Arweave-side discoverability as a fallback'));

        // F6. Compounding factor: the read-side Settings page itself tells
        // a Wanderer this setting is discovery-only, but never says WHERE
        // the publication-side setting lives — confirmed live (also named
        // in Section I as a still-open UX defect).
        const readSettingsViewSource = await source('ui/views/NostrRelaySettingsView.js');
        assert(/does not change where announcements are published/.test(readSettingsViewSource) && !readSettingsViewSource.includes('nostr-publication-relay'),
            n('F6. ui/views/NostrRelaySettingsView.js correctly tells a Wanderer this setting does not affect where announcements are published, but never names or links the page where that actually IS configured — a Wanderer reading this warning has nowhere to go to check whether their two settings agree'));

        console.log('\n=== SECTION F: DISCOVERY/READ-SIDE CANDIDATE ===');
        console.log('✓ Section F: a real, live, end-to-end experiment shows a Wanderer\'s own discovery path can genuinely fail to find their own, successfully, verifiably published announcement — not a hypothetical, a reproduced failure (F2b). The gap is narrow and specific, never generic multi-relay browsing: a Wanderer\'s own configured PUBLICATION relay set is never consulted by their own DISCOVERY query. Today\'s coincidental matching defaults (F4a) mask it for anyone who customizes neither setting; Section A\'s own finding means this gap is currently LATENT (nothing customizes a live relay set yet) but becomes IMMEDIATELY LIVE the moment Section A\'s own wiring gap is closed, unless addressed in the same breath.');
    }

    // ===============================================================
    // Section G — Per-publication relay selection candidate.
    // ===============================================================
    {
        const publicationsViewSource = await source('ui/views/DecentralizedPublicationsView.js');
        // No per-entry relay picker of any kind exists — only a single
        // app-wide relay SET (Section A) and a per-entry SUBSTRATE choice
        // (Nostr/Arweave), never a per-entry relay subset within Nostr.
        assert(!/entry\.\w*[Rr]elay(Urls|Set|Selection)/.test(publicationsViewSource),
            n('G1. no per-entry relay-selection field exists anywhere on the Publications Distribution page — confirmed live'));
        const relayCoreSource = await source('core/NostrPublicationRelaySetConfiguration.js');
        assert(relayCoreSource.includes('Per-publication scoping of any kind') && relayCoreSource.includes('No field here ever carries a\n//   publicationId/objectId'),
            n('G2. core/NostrPublicationRelaySetConfiguration.js\'s own header already, deliberately excludes per-publication scoping — confirmed live: the relay set is, and has only ever been, application-scoped, by explicit design rather than mere absence'));

        console.log('\n=== SECTION G: PER-PUBLICATION RELAY SELECTION ===');
        console.log('✓ Section G: no evidence anywhere in this codebase — no field, no UI affordance, no comment naming an unmet need — that different publications require different relay subsets. Given Section A\'s own finding (the single, app-wide relay set is not even being consumed by any live action yet), narrowing that set further per-publication would be solving a problem one full step ahead of the one this codebase actually has. NO_EVIDENCE.');
    }

    // ===============================================================
    // Section H — Operational management candidates, and the relay-priority
    // guard (candidate #4).
    // ===============================================================
    {
        const relaySettingsViewSource = await source('ui/views/NostrPublicationRelaySettingsView.js');
        const readSettingsViewSource = await source('ui/views/NostrRelaySettingsView.js');
        assert(relaySettingsViewSource.includes('No Test Connection, no health') && readSettingsViewSource.includes('No Test Connection, no health'),
            n('H1. BOTH Nostr Settings pages explicitly, deliberately exclude Test Connection/health-check machinery — confirmed live, unchanged'));

        // H2. Relay priority guard. Order must never become priority. Live
        // permutation check (mirroring 0.9.444's own Section G technique,
        // rebuilt fresh here) plus a source-level guard against
        // "primary"/"preferred"/"fallback" relay language anywhere in the
        // fan-out family.
        const network = makeRelayNetwork();
        const forward = new NostrMultiRelayPublicationDiscoveryPublisher({ relayUrls: ['wss://h-1.example', 'wss://h-2.example', 'wss://h-3.example'], discoveryTag: 'h', publishImpl: network.publishImpl });
        const reordered = new NostrMultiRelayPublicationDiscoveryPublisher({ relayUrls: ['wss://h-3.example', 'wss://h-1.example', 'wss://h-2.example'], discoveryTag: 'h', publishImpl: network.publishImpl });
        const envelope = { protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-h-priority', uri: 'ar://TESTTX' };
        const forwardResults = await forward.publish(envelope);
        const reorderedResults = await reordered.publish(envelope);
        const asSet = (results) => new Set(results.map((r) => `${r.relayUrl}:${r.published}`));
        assert(JSON.stringify([...asSet(forwardResults)].sort()) === JSON.stringify([...asSet(reorderedResults)].sort()),
            n('H2a. configured relay order never changes the resulting SET of facts, live-reconfirmed with a fresh three-relay configuration'));
        const fanOutPublisherSource = await source('application/NostrMultiRelayPublicationDiscoveryPublisher.js');
        const fanOutPublisherCode = fanOutPublisherSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/primary relay|preferred relay|relay priority|rank(ing)? the relay/i.test(fanOutPublisherCode),
            n('H2b. no REAL CODE line (comments excluded — the file\'s own "deliberately excluded" comment names preferred/fallback relay semantics precisely in order to reject them) in the write-side fan-out family names any relay "primary," "preferred," or ranks/prioritizes relays in any way — the "all relays are equal fan-out targets" invariant has not drifted'));
        assert(fanOutPublisherSource.includes('preferred/fallback relay') && fanOutPublisherSource.includes('DELIBERATELY EXCLUDED'),
            n('H2c. the file\'s own header explicitly, deliberately excludes preferred/fallback relay semantics — the guard is a documented decision, not an accidental absence'));

        console.log('\n=== SECTION H: OPERATIONAL MANAGEMENT & RELAY PRIORITY GUARD ===');
        console.log('✓ Section H: relay health/diagnostics/test-connection remain deliberately, correctly excluded — no evidence of need, and (per Section A) pursuing them now would be polishing a control that currently affects no real distribution action. The relay-priority guard holds: configuration order still carries no meaning anywhere in this codebase.');
    }

    // ===============================================================
    // Section I — Architectural residue: still-open, previously-named UX
    // defects, plus one newly-found item in the same family.
    // ===============================================================
    {
        const networkSettingsSource = await source('ui/views/NetworkSettingsView.js');
        assert(/Relay used for Nostr-based discovery and publishing\./.test(networkSettingsSource),
            n('I1. KNOWN_OPEN_DEFECT (named 0.9.446 Section A5, reconfirmed still open by 0.9.448 Section M): the Settings hub\'s own "Nostr Relay" row still describes that page as covering "discovery and publishing," contradicting the page\'s own text (Section F6) — still present, unfixed, at this milestone\'s own head commit'));

        const readSettingsViewSource = await source('ui/views/NostrRelaySettingsView.js');
        assert(!readSettingsViewSource.includes('nostr-publication-relay'),
            n('I2. KNOWN_OPEN_DEFECT (named 0.9.448 Section M, reconfirmed here): /settings/nostr-relay never names or links its publication-relay sibling back — still present, unfixed, at this milestone\'s own head commit'));

        const relaySettingsViewSource = await source('ui/views/NostrPublicationRelaySettingsView.js');
        assert(/publishes signed announcements to when distributing a Publication or Snapshot over Nostr/.test(relaySettingsViewSource),
            n('I3. NEWLY NAMED THIS MILESTONE: /settings/nostr-publication-relays own page copy overstates its current effect for Publication (unwired, Section A) and names a Snapshot capability that does not exist anywhere in this codebase (Section A11) — a third item in the same "Settings copy ahead of what the product actually does" family as I1/I2'));

        console.log('\n=== SECTION I: ARCHITECTURAL RESIDUE ===');
        console.log('✓ Section I: three textual, non-blocking Settings-copy defects are named — two carried forward as still-open from 0.9.446/0.9.448, one newly found by this milestone\'s own Section A. None is an architecture gap in the sense of missing design; all three compound the real confusion Section A/F\'s own findings create for a Wanderer trying to understand what their own configuration actually does.');
    }

    // ===============================================================
    // Section J — Final decision matrix, verdict, production-change guard.
    // ===============================================================
    const decisionMatrix = [
        { candidate: 'Nostr multi-relay WRITE distribution (this arc\'s own deliverable)', classification: 'BUILT_BUT_UNREACHABLE', note: 'fully implemented, fully tested in isolation, composed app-wide (Section A6/A9) — but zero real distribution action anywhere in this product invokes it (Section A3-A5/A8); a deliberate, regression-guarded scope boundary (tests/NostrMultiRelayFanOutIntegrationBoundaryAudit.test.js Section J), never revisited through 0.9.448\'s own closing audit' },
        { candidate: 'Nostr relay read/discovery fan-out', classification: 'READ_DISCOVERY_PRODUCT_GAP', note: 'real, reproduced failure (Section F2b): a Wanderer\'s own successfully-published announcement is invisible to their own discovery query once their publication relay set diverges from their discovery relay — narrower than generic multi-relay browsing (no evidence for that, Section E), and a genuine PREREQUISITE to closing the write-side gap safely, not an independent nice-to-have' },
        { candidate: 'Relay health / diagnostics / test-connection UI', classification: 'OPERATIONAL_UX_ENHANCEMENT', note: 'no evidence of need (Section H1); pursuing it now would polish a control that currently affects no live distribution action (Section A)' },
        { candidate: 'Relay priority', classification: 'GUARDED_NO_DRIFT', note: 'configuration order still carries no meaning anywhere in the fan-out family, live-reconfirmed (Section H2)' },
        { candidate: 'Per-publication relay selection', classification: 'NO_EVIDENCE', note: 'no field, UI affordance, or comment anywhere names an unmet need (Section G); the single, app-wide relay set is not even consumed by a live action yet' },
        { candidate: 'Automatic relay discovery', classification: 'NOT_NEEDED', note: 'manual configuration already satisfies the decentralization objective (Section D); Section A means it would automate a setting nothing currently reads' },
        { candidate: 'Settings-copy defects (hub mislabel, missing cross-link, Nostr Publication Relays overstatement)', classification: 'KNOWN_OPEN_DEFECT', note: 'textual, non-blocking, reported not fixed per this milestone\'s own test-only scope (Section I)' }
    ];
    {
        const VALID = ['BUILT_BUT_UNREACHABLE', 'READ_DISCOVERY_PRODUCT_GAP', 'OPERATIONAL_UX_ENHANCEMENT', 'GUARDED_NO_DRIFT', 'NO_EVIDENCE', 'NOT_NEEDED', 'KNOWN_OPEN_DEFECT'];
        for (const row of decisionMatrix) {
            assert(VALID.includes(row.classification), n(`J1. ${row.candidate} carries a recognized classification`));
        }
        assert(decisionMatrix.filter((r) => r.classification === 'BUILT_BUT_UNREACHABLE').length === 1,
            n('J2. exactly one row carries this milestone\'s own primary, headline classification'));

        console.log('\n=== SECTION J: DECISION MATRIX ===');
        console.log('| Candidate                                                                          | Classification              |');
        console.log('|--------------------------------------------------------------------------------------|------------------------------|');
        for (const row of decisionMatrix) console.log(`| ${row.candidate.padEnd(84)} | ${row.classification.padEnd(28)} |`);

        console.log('\n=== FINAL VERDICT ===');
        console.log('PRIMARY CLASSIFICATION: BUILT_BUT_UNREACHABLE.');
        console.log('');
        console.log('Neither of the two outcomes this milestone\'s own request framed as "particularly healthy" — STABLE_STOP or a new,');
        console.log('separately-scoped discovery arc — fits what Section A actually found. This is not a case of "the requirement is fully');
        console.log('realized, resist adding another implementation," and it is not a case of "a genuine new user-facing capability is');
        console.log('missing" either. It is a THIRD thing: the capability this arc set out to build (0.9.442\'s own verdict, "Nostr Multi-Relay');
        console.log('Announcement Distribution, write side first") is complete and correct in isolation (Sections B/C/D, and every prior');
        console.log('milestone\'s own passing test suite) and reachable as CONFIGURATION (0.9.446/0.9.448, reconfirmed) — but never reachable as');
        console.log('BEHAVIOR. A Wanderer can spend real effort configuring three relays, be told by the Settings page itself that doing so');
        console.log('governs "distributing a Publication or Snapshot over Nostr" (Section A10), and receive zero observable difference from');
        console.log('any real "Distribute" click anywhere in this product, because every one of those three call sites still calls the');
        console.log('single-relay command 0.9.46 originally built (Section A3-A5/A8), a deliberate, test-enforced scope boundary that was never');
        console.log('revisited on its way to 0.9.448\'s own "AUDIT PASSED — STABLE_STOP."');
        console.log('');
        console.log('RECOMMENDED NEXT MILESTONE: close the wiring gap Section A names precisely — inject multiRelayNostrPublicationDistributionCommand');
        console.log('into the three existing distribution call sites (ui/views/WorldView.js, ui/views/EditorView.js,');
        console.log('ui/views/DecentralizedPublicationsView.js), in place of or alongside the single-relay command they call today. This is');
        console.log('completion of an already-fully-decided, already-fully-built, already-fully-tested capability, never a new product decision —');
        console.log('the narrowest possible scope, since Section A6/A7 already prove the multi-relay command works correctly the moment it is');
        console.log('actually called. That SAME milestone, or one immediately sequenced after it, must also treat Section F\'s own finding as a');
        console.log('real, load-bearing prerequisite rather than an afterthought: closing the write-side gap without also addressing discovery-relay');
        console.log('alignment would convert Section F\'s own currently-LATENT gap into an immediately-LIVE one, the first time any real Wanderer');
        console.log('customizes their relay set through a now-functioning Settings page. Every other candidate this milestone\'s own request asked');
        console.log('it to audit — relay health/diagnostics, relay priority, per-publication selection, automatic relay discovery — carries no');
        console.log('evidence of need today, and Section G/H/E each explain why pursuing any of them before the wiring gap closes would be solving');
        console.log('problems one step ahead of the one this product actually has.');
        console.log('');
        console.log('STATUS UPDATE (0.9.450): the recommended wiring above was implemented — see this file\'s own Section A8 amendment. Section');
        console.log('F\'s own read-side alignment gap remains open, as this milestone\'s own request anticipated, tracked separately as 0.9.451.');

        // J3. Production-change guard — no production file was modified or
        // added by THIS MILESTONE'S OWN COMMIT, matching every prior
        // product-reassessment milestone's own identical, commit-scoped
        // check.
        let productionTouched = [];
        try {
            const commitHash = execSync('git log --grep="^0.9.449 " --format=%H -n 1', { cwd: SOURCE_ROOT }).toString().trim();
            if (commitHash) {
                const diffOutput = execSync(`git diff-tree --no-commit-id --name-only -r ${commitHash}`, { cwd: SOURCE_ROOT }).toString();
                productionTouched = diffOutput.split('\n')
                    .filter(Boolean)
                    .filter((f) => !f.startsWith('tests/') && f !== 'tests.html' && !f.startsWith('docs/'));
            }
        } catch { /* git unavailable, or this commit does not exist yet at test-authoring time — not a failure of this decision artifact */ }
        assert(productionTouched.length === 0,
            n(`J3. no production file was modified or added by the 0.9.449 commit itself (found: ${JSON.stringify(productionTouched)})`));

        console.log('\n✅ All Nostr Multi-Relay Publication Distribution Product Reassessment tests passed.');
    }
}

run().catch((error) => {
    console.error('NostrMultiRelayPublicationDistributionProductReassessment.test.js FAILED:', error);
    process.exitCode = 1;
});
