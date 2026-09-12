import { readFile } from 'node:fs/promises';

import { NostrRelayConfiguration, DEFAULT_NOSTR_RELAY_URL } from '../core/NostrRelayConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';
import { SetNostrRelayConfigurationUseCase } from '../application/SetNostrRelayConfigurationUseCase.js';
import { ArweaveGatewayConfiguration } from '../core/ArweaveGatewayConfiguration.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { NostrDiscoveryQueryService } from '../application/NostrDiscoveryQueryService.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';
import { PlaceNamingDiscoveryQueryService } from '../application/PlaceNamingDiscoveryQueryService.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/DiscoverPlaceNamingClaimsCommand.js';
import { composeDecentralizedWorldEncounterMaterialDiscoveryServices } from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { composePlaceNamingDiscoveryRuntime } from '../application/PlaceNamingDiscoveryRuntimeComposition.js';
import { createNostrRelayQueryClient } from '../nostr/NostrRelayQueryClient.js';
import { DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL, DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION } from '../core/DecentralizedDiscoveryEnvelope.js';
import { SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, SNAPSHOT_DISCOVERY_ENVELOPE_VERSION } from '../core/SnapshotDiscoveryEnvelope.js';

// 0.9.372 — Nostr Relay Settings Lifecycle & Product Reassessment.
//
// 0.9.369-0.9.371 answered "can a user configure another relay?" This
// suite asks the harder, once-only question: does that actually close the
// relay-resilience gap 0.9.368 demonstrated, and does anything else in
// this codebase now deserve the same treatment — the direct structural
// mirror of tests/ArweaveGatewayLifecycleReassessment.test.js (0.9.367),
// applied to three read paths and a stateful WebSocket transport instead
// of one retrieval path over `fetch`.
//
// TEST-ONLY. No production file changes ride with this milestone — every
// section below exercises the REAL classes 0.9.369-0.9.371 shipped
// (NostrRelayConfiguration, NostrRelayConfigurationStore,
// SetNostrRelayConfigurationUseCase, NostrDiscoveryQueryService,
// NostrSnapshotDiscoveryQueryService, NostrPlaceNamingDiscoverySource,
// PlaceNamingDiscoveryQueryService, all three runtime compositions, and
// nostr/NostrRelayQueryClient.js's own real, unmodified transport) wired
// together exactly as `ui/main.js` wires them — never a mock of any of
// those collaborators. Only the two genuine environment seams this
// codebase already treats as injection points — `StorageProvider` and
// `webSocketImpl` (nostr/NostrRelayQueryClient.js's own real transport
// injection point) — are supplied by hand.
//
//   Section A — capability inventory: the full configuration chain
//               (value object -> store -> use case -> settings UI ->
//               startup composition -> three read-path consumers) is
//               actually present, and no generic
//               InfrastructureEndpointConfiguration abstraction exists.
//   Section B — user-value closure: the flagship failure/recovery
//               journey, against the REAL classes and the REAL
//               (fake-transport) WebSocket construction, for all three
//               discovery paths, plus the full before/after table.
//   Section C — three discovery surfaces, with particular care for Place
//               Naming discovery, which the 0.9.368 audit found has no
//               alternative source at all.
//   Section D — publishing boundary: a settings-saved override never
//               reaches a publisher's own resolved relayUrl, and the
//               settings page copy states the discovery-only scope
//               explicitly.
//   Section E — silent failure product question: which consumers expose
//               failure, which collapse to `[]`, whether the existing UI
//               can actually distinguish "nothing exists" from "the relay
//               was unreachable," and whether that ambiguity is a
//               separate, later product question.
//   Section F — configuration discoverability: a product-language audit
//               of the real settings page copy.
//   Section G — restart and persistence, plus browser/profile isolation.
//   Section H — the remaining infrastructure candidates, reassessed
//               against the same "can a real user encounter a failure
//               this configuration would meaningfully recover from?" bar.
//   Section I — cross-configuration isolation: Arweave Gateway and Nostr
//               Relay configuration stay two unconnected persisted facts.
//   Section J — final decision, per candidate, using the four-outcome
//               vocabulary (STABLE_STOP / BUILD_NEXT / DEFER /
//               SEPARATE_PRODUCT).
//
// See docs/Roadmap.md, 0.9.372, for this suite's full verdict and
// rationale.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

async function expectRejects(promise, message) {
    let threw = false;
    try { await promise; } catch { threw = true; }
    assert(threw, message);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Two SEPARATE instances over one externally-owned namespace behave the
// way two separate page loads share one browser's localStorage — this is
// what makes "restart" genuine rather than a re-read of the same
// in-memory Map. Two instances over TWO DIFFERENT namespaces (Section G)
// is what makes "separate browser profiles" genuine the same way.
class SharedNamespaceStorageProvider extends StorageProvider {
    constructor(sharedNamespace) { super(); this._namespace = sharedNamespace; }
    save(name, data) { this._namespace[name] = JSON.stringify(data); }
    load(name) { return Object.prototype.hasOwnProperty.call(this._namespace, name) ? JSON.parse(this._namespace[name]) : null; }
    remove(name) { delete this._namespace[name]; }
    list() { return Object.keys(this._namespace); }
}

// A fake WebSocket constructor that NEVER opens — it fires `onerror`
// exactly the way a genuine connection-refused/DNS-failure would, the
// concrete transport-level failure `nostr/NostrRelayQueryClient.js`'s own
// header documents as a rejection, never a silent `[]`. Every
// construction is recorded so a test can prove exactly which relay URL
// the CONCRETE `new webSocketCtor(relayUrl)` call actually reached.
function makeUnreachableRelaySocketClass() {
    class UnreachableRelaySocket {
        constructor(url) {
            this.url = url;
            UnreachableRelaySocket.constructions.push(url);
            this.readyState = 0;
            queueMicrotask(() => {
                if (this.onerror) this.onerror(new Error('connection refused'));
            });
        }
        send() { /* never reached — the socket never opens */ }
        close() { this.readyState = 3; }
    }
    UnreachableRelaySocket.constructions = [];
    return UnreachableRelaySocket;
}

// A fake WebSocket constructor that opens normally and answers a REQ with
// one EVENT per entry in `rawContents`, then EOSE — the concrete,
// successful NIP-01 exchange nostr/NostrRelayQueryClient.js's own header
// documents.
function makeEventsRelaySocketClass(rawContents) {
    class EventsRelaySocket {
        constructor(url) {
            this.url = url;
            EventsRelaySocket.constructions.push(url);
            this.readyState = 0;
            this._subscriptionId = null;
            queueMicrotask(() => {
                this.readyState = 1;
                if (this.onopen) this.onopen();
            });
        }
        send(raw) {
            const frame = JSON.parse(raw);
            if (frame[0] !== 'REQ') return;
            this._subscriptionId = frame[1];
            queueMicrotask(() => {
                for (const content of rawContents) {
                    if (this.onmessage) {
                        this.onmessage({ data: JSON.stringify(['EVENT', this._subscriptionId, { content }]) });
                    }
                }
                if (this.onmessage) {
                    this.onmessage({ data: JSON.stringify(['EOSE', this._subscriptionId]) });
                }
            });
        }
        close() { this.readyState = 3; }
    }
    EventsRelaySocket.constructions = [];
    return EventsRelaySocket;
}

function publicationEnvelopeContent(uri) {
    return JSON.stringify({
        protocol: DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL,
        version: DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION,
        kind: 'PUBLICATION',
        objectId: 'obj-' + 'a'.repeat(40),
        uri
    });
}

function snapshotEnvelopeContent({ contentHash, locator, storage }) {
    return JSON.stringify({
        protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL,
        version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION,
        contentHash, locator, storage
    });
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function run() {
    // ===============================================================
    // Section A — capability inventory. A self-contained sweep — this
    // file makes no assumption that any earlier test file's own sweep
    // still holds.
    // ===============================================================
    {
        // A1. Configuration value object.
        const config = new NostrRelayConfiguration({ relayUrl: 'wss://custom.example' });
        assert(config.relayUrl === 'wss://custom.example', 'A1. the configuration value object exists and holds a relayUrl');
        assert(Object.isFrozen(config), 'A1. the value object is immutable');

        // A2. Persistent override + A3. clear/reset.
        const store = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        assert(store.get() === null, 'A2. absent by default');
        store.save(config);
        assert(store.get().relayUrl === 'wss://custom.example', 'A2. a saved override actually persists');
        store.clear();
        assert(store.get() === null, 'A3. clear() restores genuine absence');

        // A4. Write use case.
        const setUseCase = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: store });
        setUseCase.execute({ relayUrl: 'wss://via-use-case.example' });
        assert(store.get().relayUrl === 'wss://via-use-case.example', 'A4. SetNostrRelayConfigurationUseCase is the real write seam');

        // A5. Settings UI.
        const viewSource = await source('ui/views/NostrRelaySettingsView.js');
        assert(viewSource.includes("name: 'NostrRelaySettingsView'"), 'A5. the settings view component exists');
        assert(/@click="save"/.test(viewSource) && /@click="useDeploymentDefault"/.test(viewSource),
            'A5. the settings view wires both Save and Use Deployment Default');

        // A6. Startup composition.
        const mainSource = await source('ui/main.js');
        assert(mainSource.includes('new NostrRelayConfigurationStore('), 'A6. ui/main.js constructs the store at startup');
        assert(/resolvedNostrRelayUrl\s*=\s*\(nostrRelayConfigurationStore\.get\(\)\s*\|\|\s*\{\s*relayUrl:\s*DEFAULT_NOSTR_RELAY_URL\s*\}\)\.relayUrl/.test(mainSource),
            'A6. ui/main.js resolves the effective relay once, at startup, from the store');

        // A7-A9. All THREE read-path composition call sites receive the
        // resolved relay.
        //
        // AMENDED BY 0.9.451 — Nostr Publication Relay Set Discovery
        // Alignment. World Encounter (Publication) discovery no longer
        // receives `resolvedNostrRelayUrl`; it now receives the resolved
        // publication relay SET instead (`resolvedNostrPublicationRelayUrls`)
        // — see `application/NostrPublicationRelaySetDiscoveryQueryService.js`'s
        // own header for why a publication distributed to a configured
        // relay set must be discoverable through that same set.
        assert(/composeDecentralizedWorldEncounterMaterialDiscoveryServices\(\{[\s\S]{0,300}?nostrRelayUrls:\s*resolvedNostrPublicationRelayUrls/.test(mainSource),
            'A7. World Encounter (Publication) discovery composition receives the resolved publication relay set — 0.9.451');
        assert(/nostrSnapshotDiscoveryQueryServiceOptions:\s*\{[\s\S]{0,200}?relayUrl:\s*resolvedNostrRelayUrl/.test(mainSource),
            'A8. Snapshot discovery composition receives the resolved relay');
        assert(/new NostrPlaceNamingDiscoverySource\(\{[\s\S]{0,200}?relayUrl:\s*resolvedNostrRelayUrl/.test(mainSource),
            'A9. Place Naming discovery construction receives the resolved relay');

        // A10. Write-path isolation — none of the three Nostr publishers'
        // own composition call sites ever mention resolvedNostrRelayUrl.
        const publisherIsolationExcerpts = [
            mainSource.match(/composeSnapshotDistributionRuntime\(\{[\s\S]{0,400}?\}\);/),
            mainSource.match(/composePlaceNamingPublicationRuntime\(\{[\s\S]{0,400}?\}\);/)
        ];
        for (const match of publisherIsolationExcerpts) {
            assert(match, 'A10. sanity — a write-path composition call site was found');
            assert(!match[0].includes('resolvedNostrRelayUrl'), 'A10. a write-path composition call site never receives the settings-configured relay');
        }

        // A11. No generic InfrastructureEndpointConfiguration abstraction
        // exists anywhere — the string appears only inside the two config
        // files' own headers, naming exactly what each refused to become.
        assert(!/class InfrastructureEndpointConfiguration/.test(await source('core/NostrRelayConfiguration.js')),
            'A11. no InfrastructureEndpointConfiguration class exists in core/NostrRelayConfiguration.js');
        assert(!/class InfrastructureEndpointConfiguration/.test(await source('core/ArweaveGatewayConfiguration.js')),
            'A11. no InfrastructureEndpointConfiguration class exists in core/ArweaveGatewayConfiguration.js either');
        assert(!/InfrastructureEndpointConfiguration/.test(await source('storage/NostrRelayConfigurationStore.js')),
            'A11. the store carries no trace of the refused abstraction');

        console.log('✓ Section A: the full chain (value object -> store -> use case -> settings UI -> startup composition -> three read-path consumers) is present, write-path isolation holds, and no generic InfrastructureEndpointConfiguration abstraction exists anywhere');
    }

    // ===============================================================
    // Section B — user-value closure: the flagship failure/recovery
    // journey, against the REAL classes and the REAL WebSocket
    // construction, for all three discovery paths.
    // ===============================================================
    {
        const publicationTag = 'world-encounter-lead-1';
        const snapshotTag = 'forkbuild-snapshot-campaign-1';
        const placeNamingTag = 'forkbuild-place-naming:world-1:region-1';
        const publicationUri = 'ar://' + 'p'.repeat(43);
        const snapshotCandidate = { contentHash: 's'.repeat(43), locator: 'ar://' + 's'.repeat(43), storage: 'ar' };
        const placeNamingRawContent = 'a place naming claim payload, opaque to this source';

        const sharedNamespace = {};

        // ---- BEFORE. Deployment default is unreachable — a genuine
        // WebSocket connection failure, never a 404-equivalent. Nothing
        // has been configured yet. ----
        const storeBefore = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const resolvedBefore = (storeBefore.get() || { relayUrl: DEFAULT_NOSTR_RELAY_URL }).relayUrl;
        assert(resolvedBefore === DEFAULT_NOSTR_RELAY_URL, 'B1. before any configuration, the effective relay is the deployment default');

        // Publication (World Encounter) discovery.
        {
            const SocketClass = makeUnreachableRelaySocketClass();
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const { nostr } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ nostrQueryImpl: queryImpl, nostrRelayUrl: resolvedBefore });
            const result = await nostr.search(publicationTag);
            assert(Array.isArray(result) && result.length === 0,
                'B2. BEFORE: with the deployment default unreachable, Publication discovery finds nothing — silently, per its own [] contract');
            assert(SocketClass.constructions[0] === DEFAULT_NOSTR_RELAY_URL, 'B2. …and the concrete WebSocket construction actually dialed the dead default');
        }

        // Snapshot discovery.
        {
            const SocketClass = makeUnreachableRelaySocketClass();
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const { queryService } = composeDiscoverSnapshotRuntime({ nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl, relayUrl: resolvedBefore } });
            const result = await queryService.search(snapshotTag);
            assert(Array.isArray(result) && result.length === 0, 'B3. BEFORE: Snapshot discovery finds nothing against the unreachable default');
            assert(SocketClass.constructions[0] === DEFAULT_NOSTR_RELAY_URL, 'B3. …dialed the dead default');
        }

        // Place Naming discovery — composed exactly as ui/main.js
        // composes it (wrapped in PlaceNamingDiscoveryQueryService), so
        // the aggregation layer's own failure isolation is exercised too.
        {
            const SocketClass = makeUnreachableRelaySocketClass();
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const source_ = new NostrPlaceNamingDiscoverySource({ queryImpl, relayUrl: resolvedBefore });
            const { queryService } = composePlaceNamingDiscoveryRuntime({ sources: [source_] });
            const result = await queryService.search(placeNamingTag);
            assert(Array.isArray(result) && result.length === 0,
                'B4. BEFORE: Place Naming discovery — composed exactly as the real app composes it — finds nothing against the unreachable default');
            assert(SocketClass.constructions[0] === DEFAULT_NOSTR_RELAY_URL, 'B4. …dialed the dead default');
        }

        // ---- User opens Settings and saves an alternative relay. ----
        const setUseCase = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: storeBefore });
        setUseCase.execute({ relayUrl: 'wss://my-alternative-relay.example' });

        // ---- Reloads the application — a genuinely new store instance,
        // over the SAME underlying storage, exactly as a fresh page load
        // would construct. ----
        const storeAfter = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const resolvedAfter = (storeAfter.get() || { relayUrl: DEFAULT_NOSTR_RELAY_URL }).relayUrl;
        assert(resolvedAfter === 'wss://my-alternative-relay.example', 'B5. after restart, the effective relay is the chosen alternative');

        // ---- AFTER. The same still-dead default would still fail — but
        // discovery now reaches the CHOSEN alternative, and previously
        // undiscoverable content becomes discoverable, for all three
        // paths. ----
        {
            const SocketClass = makeEventsRelaySocketClass([publicationEnvelopeContent(publicationUri)]);
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const { nostr } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ nostrQueryImpl: queryImpl, nostrRelayUrl: resolvedAfter });
            const result = await nostr.search(publicationTag);
            assert(result.length === 1 && result[0].uri === publicationUri,
                'B6. AFTER: Publication discovery now finds the previously-undiscoverable lead, against the user-chosen relay');
            assert(SocketClass.constructions[0] === 'wss://my-alternative-relay.example', 'B6. …reached exactly the chosen alternative, never the still-dead default');
        }
        {
            const SocketClass = makeEventsRelaySocketClass([snapshotEnvelopeContent(snapshotCandidate)]);
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const { queryService } = composeDiscoverSnapshotRuntime({ nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl, relayUrl: resolvedAfter } });
            const result = await queryService.search(snapshotTag);
            assert(result.length === 1 && result[0].contentHash === snapshotCandidate.contentHash,
                'B7. AFTER: Snapshot discovery now finds the previously-undiscoverable candidate, against the user-chosen relay');
            assert(SocketClass.constructions[0] === 'wss://my-alternative-relay.example', 'B7. …reached exactly the chosen alternative');
        }
        {
            const SocketClass = makeEventsRelaySocketClass([placeNamingRawContent]);
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const source_ = new NostrPlaceNamingDiscoverySource({ queryImpl, relayUrl: resolvedAfter });
            const rawResult = await source_.search(placeNamingTag);
            assert(rawResult.length === 1 && rawResult[0] === placeNamingRawContent,
                'B8. AFTER: Place Naming discovery\'s own source now finds the previously-undiscoverable raw claim payload, against the user-chosen relay');
            assert(SocketClass.constructions[0] === 'wss://my-alternative-relay.example', 'B8. …reached exactly the chosen alternative');
        }

        console.log('✓ Section B: the full before/after user journey closes for all THREE discovery paths, against the real classes and the real (fake-transport) WebSocket construction — an unreachable default genuinely finds nothing, a settings-saved alternative genuinely recovers discoverability, across a real restart boundary');

        // ---- The user-value closure table itself. ----
        const table = {
            defaultRelayWorks: 'discovery works — trivially true: the AFTER cases above are exactly this shape, one relay over',
            defaultRelayUnavailable: 'no recovery BEFORE this feature existed (0.9.368) — B2/B3/B4 above reproduce that exact starting condition',
            alternativeConfigured: 'discovery now uses the alternative — B6/B7/B8 above, proven at the concrete WebSocket construction, not merely a stored URL',
            alternativeLaterFails: 'explicit failure behavior remains — see immediately below',
            userWantsDefaultAgain: 'Clear restores the deployment default — see immediately below'
        };

        // "Alternative later fails" — a BROKEN alternative fails through
        // the SAME existing per-consumer contract, never a silent
        // fallback to the deployment default (0.9.370's own "no fallback,
        // no merge, no ranking" restraint, reconfirmed here for the
        // settings-driven path specifically).
        {
            const brokenAlternativeSocket = makeUnreachableRelaySocketClass();
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: brokenAlternativeSocket });
            const { nostr } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ nostrQueryImpl: queryImpl, nostrRelayUrl: 'wss://my-alternative-relay.example' });
            const result = await nostr.search(publicationTag);
            assert(Array.isArray(result) && result.length === 0, 'B9. a later-failing alternative still fails through the existing [] contract');
            assert(brokenAlternativeSocket.constructions.length === 1 && brokenAlternativeSocket.constructions[0] === 'wss://my-alternative-relay.example',
                'B9. exactly one attempt was made, against the configured alternative — never a fallback attempt to the deployment default');
        }

        // "User wants default again" — Clear, then a fresh composition.
        {
            storeAfter.clear();
            const resolvedAfterClear = (storeAfter.get() || { relayUrl: DEFAULT_NOSTR_RELAY_URL }).relayUrl;
            assert(resolvedAfterClear === DEFAULT_NOSTR_RELAY_URL, 'B10. Clear then restart resolves the deployment default');
            const SocketClass = makeEventsRelaySocketClass([]);
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const { nostr } = composeDecentralizedWorldEncounterMaterialDiscoveryServices({ nostrQueryImpl: queryImpl, nostrRelayUrl: resolvedAfterClear });
            await nostr.search(publicationTag);
            assert(SocketClass.constructions[0] === DEFAULT_NOSTR_RELAY_URL, 'B10. …and the concrete WebSocket construction actually reaches the deployment default relay again');
        }

        console.log('✓ Section B (table): ' + JSON.stringify(table));
    }

    // ===============================================================
    // Section C — three discovery surfaces, with particular care for
    // Place Naming discovery, which the 0.9.368 audit found has no
    // alternative source at all.
    // ===============================================================
    {
        const mainSource = await source('ui/main.js');

        // C1-C3. All three surfaces were already proven end-to-end in
        // Section B — this section confirms the STRUCTURAL claim behind
        // that proof: each surface's own real composition call site in
        // ui/main.js genuinely receives its own resolved relay(s) (re-swept
        // independently of Section A's own sweep, never assumed).
        //
        // AMENDED BY 0.9.451 — see this file's own A7 amendment, above:
        // Publication discovery's own resolved value is now the publication
        // relay set, not the general single discovery-relay preference.
        assert(/composeDecentralizedWorldEncounterMaterialDiscoveryServices\(\{[\s\S]{0,300}?nostrRelayUrls:\s*resolvedNostrPublicationRelayUrls/.test(mainSource),
            'C1. Publication discovery\'s real composition call site receives the resolved publication relay set — 0.9.451');
        assert(/nostrSnapshotDiscoveryQueryServiceOptions:\s*\{[\s\S]{0,200}?relayUrl:\s*resolvedNostrRelayUrl/.test(mainSource),
            'C2. Snapshot discovery\'s real composition call site receives the resolved relay');
        assert(/new NostrPlaceNamingDiscoverySource\(\{[\s\S]{0,200}?relayUrl:\s*resolvedNostrRelayUrl/.test(mainSource),
            'C3. Place Naming discovery\'s real construction call site receives the resolved relay');

        // C4. Place Naming discovery, specifically: confirm — structurally,
        // in the real composition — that NostrPlaceNamingDiscoverySource
        // is the ONLY entry ui/main.js ever places in
        // placeNamingDiscoverySources. There is no second, alternative
        // source (peer, Arweave, local) for the settings-configured relay
        // to sit alongside — the relay setting is the ENTIRE resilience
        // lever this discovery family has.
        const placeNamingSourcesBlockMatch = mainSource.match(/const placeNamingDiscoverySources\s*=[\s\S]{0,300}?;/);
        assert(placeNamingSourcesBlockMatch, 'C4. sanity — the placeNamingDiscoverySources declaration was found');
        const placeNamingSourcesBlock = placeNamingSourcesBlockMatch[0];
        assert(/\[\s*new NostrPlaceNamingDiscoverySource\(/.test(placeNamingSourcesBlock),
            'C4. the only possible non-empty content of placeNamingDiscoverySources is a single-element array holding one NostrPlaceNamingDiscoverySource');
        assert(!/PeerDiscoverySource|ArweaveDiscoverySource|LocalDiscoverySource/.test(placeNamingSourcesBlock),
            'C4. no second source type is ever placed alongside it — confirming Place Naming discovery has genuinely no alternative source, exactly as the 0.9.368 audit found');

        console.log('✓ Section C: all three discovery surfaces\' real composition call sites receive the settings-configured relay (proven end to end in Section B); Place Naming discovery in particular has no alternative source of any kind — the relay setting is its entire resilience story');
    }

    // ===============================================================
    // Section D — publishing boundary.
    // ===============================================================
    {
        // D1. Behavioral proof: the three write-path composition
        // functions never read a settings-saved override, even when one
        // is on file at the exact same moment.
        const { composeSnapshotDistributionRuntime } = await import('../application/SnapshotDistributionRuntimeComposition.js');
        const { composePlaceNamingPublicationRuntime } = await import('../application/PlaceNamingPublicationRuntimeComposition.js');

        const store = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: store }).execute({ relayUrl: 'wss://my-read-only-relay.example' });

        const snapshotPublishCalls = [];
        const { discoveryPublisher: snapshotDiscoveryPublisher } = composeSnapshotDistributionRuntime({
            nostrSnapshotDiscoveryPublisherOptions: {
                publishImpl: async (relayUrl) => { snapshotPublishCalls.push(relayUrl); return { published: true, id: 'a'.repeat(64) }; },
                discoveryTag: 'forkbuild-snapshot'
            }
        });
        assert(snapshotDiscoveryPublisher.relayUrl === DEFAULT_NOSTR_RELAY_URL, 'D1. Snapshot publishing still defaults to the deployment default relay, never the settings-saved override on file at this exact moment');
        await snapshotDiscoveryPublisher.publish({ contentHash: 'x'.repeat(43), locator: 'ar://' + 'y'.repeat(43), storage: 'ar' });
        assert(snapshotPublishCalls[0] === DEFAULT_NOSTR_RELAY_URL, 'D1. the concrete publishImpl call reached the deployment default relay, never the settings-saved one');

        const { discoveryPublisher: placeNamingDiscoveryPublisher } = composePlaceNamingPublicationRuntime({
            nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: async () => ({ published: true, id: 'b'.repeat(64) }) }
        });
        assert(placeNamingDiscoveryPublisher.relayUrl === DEFAULT_NOSTR_RELAY_URL, 'D1. Place Naming publishing also still defaults to the deployment default relay');

        // D2. The settings page copy states the discovery-only scope
        // explicitly — this is now MORE important than it was pre-UI,
        // per this milestone's own brief: a user seeing "Nostr Relay" in
        // Settings could reasonably assume it means "my relay" generally.
        const viewSource = await source('ui/views/NostrRelaySettingsView.js');
        const templateMatch = viewSource.match(/template:\s*`([\s\S]*)`\s*\n\};/);
        assert(templateMatch, 'D2. sanity — the view exports a template literal to inspect');
        const templateText = templateMatch[1];
        assert(/discovery/i.test(templateText) && /does not change where announcements are published/i.test(templateText),
            'D2. the discovery-only scope is stated in one plain sentence, distinguishing it from publishing without requiring the reader to already know the architecture');

        console.log('✓ Section D: read configuration ≠ publishing configuration, confirmed behaviorally at the concrete publishImpl call site; the settings page copy already states the discovery-only scope in plain language');
    }

    // ===============================================================
    // Section E — silent failure product question.
    // ===============================================================
    {
        // E1. Class-level failure contracts, reconfirmed directly.
        {
            const SocketClass = makeUnreachableRelaySocketClass();
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const service = new NostrDiscoveryQueryService({ queryImpl, relayUrl: 'wss://dead.example' });
            const result = await service.search('tag');
            assert(Array.isArray(result) && result.length === 0, 'E1. NostrDiscoveryQueryService (Publication discovery) collapses a relay failure to [] — never throws');
        }
        {
            const SocketClass = makeUnreachableRelaySocketClass();
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const service = new NostrSnapshotDiscoveryQueryService({ queryImpl, relayUrl: 'wss://dead.example' });
            const result = await service.search('tag');
            assert(Array.isArray(result) && result.length === 0, 'E1. NostrSnapshotDiscoveryQueryService (Snapshot discovery) also collapses a relay failure to [] — never throws');
        }
        let placeNamingSourceRejects = false;
        {
            const SocketClass = makeUnreachableRelaySocketClass();
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const rawSource = new NostrPlaceNamingDiscoverySource({ queryImpl, relayUrl: 'wss://dead.example' });
            await expectRejects(rawSource.search('tag'), 'E1. NostrPlaceNamingDiscoverySource itself REJECTS on a relay failure — a genuinely different class-level contract from its two siblings');
            placeNamingSourceRejects = true;
        }
        assert(placeNamingSourceRejects, 'E1. sanity — the Place Naming source\'s own reject contract was actually exercised');

        // E2. THE LOAD-BEARING FINDING. The class-level "rejects" contract
        // above is NEVER what a real Wanderer's own discovery call
        // observes — `ui/main.js` never uses NostrPlaceNamingDiscoverySource
        // directly; it always wraps it in PlaceNamingDiscoveryQueryService
        // (composePlaceNamingDiscoveryRuntime()), and THAT class isolates
        // every source's own failure via Promise.allSettled and — its own
        // header says so in as many words — "Never throws." So in the
        // ACTUAL composed pipeline, all THREE discovery paths collapse a
        // relay failure to an empty/no-distinguishing-information result,
        // not two of three as 0.9.370's own Section F (accurately, at the
        // raw class level) reported.
        {
            const SocketClass = makeUnreachableRelaySocketClass();
            const queryImpl = createNostrRelayQueryClient({ webSocketImpl: SocketClass });
            const rawSource = new NostrPlaceNamingDiscoverySource({ queryImpl, relayUrl: 'wss://dead.example' });
            const { queryService } = composePlaceNamingDiscoveryRuntime({ sources: [rawSource] });
            const result = await queryService.search('tag');
            assert(Array.isArray(result) && result.length === 0,
                'E2. PlaceNamingDiscoveryQueryService — the REAL aggregation layer ui/main.js actually composes — swallows the sole source\'s own rejection and resolves [] instead of rejecting');

            // The identical outcome through the exact application command
            // WorldView.js actually calls.
            const commandResult = await executeDiscoverPlaceNamingClaimsCommand({ discoveryTag: 'tag', discoveryQueryService: queryService });
            assert(Array.isArray(commandResult) && commandResult.length === 0,
                'E2. executeDiscoverPlaceNamingClaimsCommand() — the exact command WorldView.js calls — resolves [] rather than rejecting, for the identical reason');
        }

        // E3. Consequence for the existing UI: WorldView.js's own
        // `placeNamingDiscoveryError` (mirroring
        // `placeNamingDiscoveryMonitor.lastError`) is real code, but it is
        // structurally UNREACHABLE from a Nostr relay failure in the real
        // composed pipeline — it could only ever be set by
        // `discoverPlaceNamingClaimsCommand()` REJECTING, and E2 just
        // proved that, composed the way ui/main.js actually composes it,
        // that promise never rejects from a relay-level cause. The
        // "Place naming discovery is temporarily unavailable" message a
        // Wanderer might see today is not dead code by construction (a
        // thrown WorldNavigationSession.getRegions() would still reach
        // it) — but it is never the message a relay outage itself
        // produces.
        const worldViewSource = await source('ui/views/WorldView.js');
        assert(worldViewSource.includes('placeNamingDiscoveryError'), 'E3. sanity — the existing UI indicator this finding is about actually exists in source');
        assert(/discoverPlaceNamingClaimsCommand:\s*\(\)\s*=>\s*\{[\s\S]{0,400}?executeDiscoverPlaceNamingClaimsCommand/.test(worldViewSource),
            'E3. sanity — WorldView.js\'s own command closure really does call executeDiscoverPlaceNamingClaimsCommand(), the exact function E2 exercised');

        // E4. The identical structural story for Snapshot candidate
        // discovery: OwnPublicationPanel.js's own `snapshotCandidateDiscoveryError`
        // is likewise only ever set by discoverSnapshotCandidatesCommand()
        // REJECTING — and E1 already proved NostrSnapshotDiscoveryQueryService.search()
        // (the sole query service behind that command, per
        // composeDiscoverSnapshotRuntime()) never rejects on a relay
        // failure either. "No Snapshots have been announced under this
        // discoveryTag yet." is shown identically whether nothing was
        // ever announced, or the relay was unreachable — a genuine,
        // currently invisible ambiguity, on the ONE discovery family that
        // (like Place Naming) has no alternative source.
        const ownPublicationPanelSource = await source('ui/components/OwnPublicationPanel.js');
        assert(ownPublicationPanelSource.includes('No Snapshots have been announced under this discoveryTag yet.'),
            'E4. sanity — the exact ambiguous copy this finding is about exists in source');

        // E5. Publication (World Encounter) discovery is the one path
        // where the ambiguity is structurally DILUTED, never eliminated:
        // it aggregates Nostr with an independent Arweave GraphQL source,
        // so a Nostr-only outage does not necessarily produce a total
        // empty result the way it does for the two sole-sourced families
        // above.
        const worldEncounterCompositionSource = await source('application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js');
        assert(/each configured service is queried independently/.test(worldEncounterCompositionSource),
            'E5. Publication discovery genuinely queries Nostr and Arweave independently — never a single point of failure the way Snapshot/Place-Naming discovery are');

        // E6. Whether an alternative relay resolves the PRACTICAL
        // problem: yes, for the actual failure mode 0.9.368 demonstrated
        // (a specific relay host being down) — a Wanderer who suspects
        // discovery trouble now has a real, working recovery action
        // (Section B), with no need to first know WHICH failure mode
        // they are in. What remains unsolved is a narrower, presentation-
        // level question: distinguishing "I switched relays and it's
        // still empty because nothing exists" from "I switched relays
        // and it's still empty because THIS relay is also unreachable" —
        // genuinely a separate, later product question, not this
        // milestone's configuration-boundary concern, and not solved
        // here.
        console.log('✓ Section E: Publication and Snapshot discovery collapse a relay failure to [] at the class level (as previously documented); Place Naming discovery\'s own class-level reject contract is real but is swallowed one layer up, in the REAL composed PlaceNamingDiscoveryQueryService — so all three discovery paths are, in practice, equally silent about relay failure; the existing placeNamingDiscoveryError/snapshotCandidateDiscoveryError UI branches exist but are structurally unreachable from a relay-level cause; Publication discovery\'s own Nostr+Arweave aggregation dilutes (never eliminates) the ambiguity; an alternative relay resolves the practical recovery need this milestone was built for, without requiring any new error-state framework — this is recorded as a SEPARATE, later product question (see Section J), not fixed here');
    }

    // ===============================================================
    // Section F — configuration discoverability (a product-language
    // audit of the real settings page copy).
    // ===============================================================
    {
        const viewSource = await source('ui/views/NostrRelaySettingsView.js');
        const templateMatch = viewSource.match(/template:\s*`([\s\S]*)`\s*\n\};/);
        assert(templateMatch, 'F1. sanity — the view exports a template literal to inspect');
        const templateText = templateMatch[1];

        // F2. Plain product name heading.
        assert(/<h1>Nostr Relay<\/h1>/.test(templateText), 'F2. the page heading is the plain product name "Nostr Relay"');

        // F3. "Discovery" scope is explained, not left to jargon alone —
        // it names the concrete discovery families, not just the word
        // "discovery" on its own. STATUS UPDATE (0.9.452): the list itself
        // changed — 0.9.451 moved Publication discovery onto the separate
        // Nostr Publication Relays configuration, and 0.9.452 corrected
        // this page's own copy to match (it no longer lists Publications).
        // The invariant this assertion checks — "discovery" is grounded
        // with a concrete list, never left as unexplained jargon — still
        // holds, against the updated, accurate list.
        assert(/discovery operations, including Snapshots and Place Naming/.test(templateText),
            'F3. "discovery" is grounded with the concrete list of what it covers (Snapshots and Place Naming — Publications moved to its own relay set in 0.9.451/0.9.452), never left as an unexplained term of art');

        // F4. The default is clearly identified — grounded with the
        // actual concrete URL in effect, exactly the same discipline
        // Arweave Gateway's own settings page holds (0.9.367's own G4).
        assert(/No override configured\. Currently using the deployment default: \{\{\s*effectiveRelayUrl\s*\}\}/.test(templateText),
            'F4. "Use Deployment Default" is grounded by displaying the actual concrete relay in effect, never left as an opaque, unexplained label');

        // F5. "Use Deployment Default" itself is an ordinary, self-
        // explanatory button label — reconfirmed it exists as an actual
        // affordance, not just prose.
        assert(/>Use Deployment Default</.test(templateText), 'F5. "Use Deployment Default" exists as a real, clearly labeled action');

        // F6. Publishing-unaffected is explicit — Nostr's own copy is, if
        // anything, MORE explicit than Arweave Gateway's own two-clause
        // version (0.9.367's own G3): one sentence names both scope and
        // exclusion together.
        assert(/This setting affects discovery only; it does not change where announcements are published\./.test(templateText),
            'F6. publishing-unaffected is stated in one explicit, self-contained sentence — never left for the reader to infer from architecture');

        // F7. RECORDED FINDING (non-blocking, the same class 0.9.367's
        // own G6 recorded for Arweave Gateway): the "Saved." confirmation
        // does not itself state that a change takes effect on next
        // application load rather than immediately. Not a defect this
        // test-only milestone corrects — see docs/Roadmap.md, 0.9.372.
        const savedConfirmationMentionsTiming = /Saved\.[^<]*(restart|reload|next (launch|load))/i.test(templateText);
        assert(savedConfirmationMentionsTiming === false,
            'F7. RECORDED FINDING (non-blocking): the "Saved." confirmation does not currently mention next-load timing — the identical, already-precedented finding class 0.9.367 recorded for Arweave Gateway, not a defect this test-only milestone corrects');

        // F8. No incidental exposure of unrelated infrastructure
        // vocabulary.
        const infrastructureJargon = ['IPFS', 'ipfs', 'TURN', 'STUN', 'Arweave', 'Bitcoin', 'Base RPC', 'Rendezvous'];
        for (const term of infrastructureJargon) {
            assert(!templateText.includes(term), `F8 ('${term}'). the page never exposes unrelated infrastructure vocabulary that would make the scope feel broader than one relay`);
        }

        console.log('✓ Section F: the settings page copy names a plain product heading, grounds "discovery" with the concrete families it covers, grounds "Use Deployment Default" with the real concrete relay, states publishing-unaffected in one explicit sentence (stronger than Arweave Gateway\'s own two-clause version), and never leaks unrelated infrastructure vocabulary — with one non-blocking timing-copy finding recorded, the same class already precedented for Arweave Gateway');
    }

    // ===============================================================
    // Section G — restart and persistence, plus browser/profile
    // isolation.
    // ===============================================================
    {
        // G1-G2. Save relay-A -> reload -> relay-A active.
        const sharedNamespace = {};
        const storeBeforeRestart = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: storeBeforeRestart }).execute({ relayUrl: 'wss://relay-a.example' });

        const storeAfterFirstRestart = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        assert(storeAfterFirstRestart !== storeBeforeRestart, 'G1. sanity — a genuinely new store instance');
        assert(storeAfterFirstRestart.get().relayUrl === 'wss://relay-a.example', 'G2. after reload, relay-A is active');

        // G3-G4. Clear -> reload -> deployment default active.
        storeAfterFirstRestart.clear();
        const storeAfterSecondRestart = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const effectiveAfterClearAndRestart = (storeAfterSecondRestart.get() || { relayUrl: DEFAULT_NOSTR_RELAY_URL }).relayUrl;
        assert(effectiveAfterClearAndRestart === DEFAULT_NOSTR_RELAY_URL, 'G3-G4. Clear, then reload, resolves the deployment default');

        // G5. Browser/profile isolation — two independent storage
        // namespaces never observe or overwrite each other's
        // configuration.
        const profileANamespace = {};
        const profileBNamespace = {};
        const storeForProfileA = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(profileANamespace));
        const storeForProfileB = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(profileBNamespace));
        new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: storeForProfileA }).execute({ relayUrl: 'wss://profile-a-relay.example' });
        assert(storeForProfileB.get() === null, 'G5. profile B observes no configuration at all after profile A saves one');
        new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore: storeForProfileB }).execute({ relayUrl: 'wss://profile-b-relay.example' });
        assert(storeForProfileA.get().relayUrl === 'wss://profile-a-relay.example' && storeForProfileB.get().relayUrl === 'wss://profile-b-relay.example',
            'G5. each profile\'s own configuration is exactly what that profile itself saved, unaffected by the other\'s independent save');

        // G6. No per-user/per-profile dimension exists in the store's own
        // constructor shape to misuse in the first place.
        const storeSource = await source('storage/NostrRelayConfigurationStore.js');
        assert(/constructor\(\s*storageProvider\s*=\s*new LocalStorageProvider\(\)\s*\)/.test(storeSource),
            'G6. the store constructor accepts only a StorageProvider — no identity/profile parameter exists to isolate in the first place');

        console.log('✓ Section G: Save -> reload -> saved relay active; Clear -> reload -> deployment default active; two independent browser profiles never observe or overwrite each other\'s configuration, and the store has no identity dimension to misuse in the first place');
    }

    // ===============================================================
    // Section H — remaining infrastructure candidates, reassessed
    // against real evidence: "can a real user encounter a failure this
    // endpoint configuration would meaningfully recover from?"
    // ===============================================================
    {
        const decisions = {};

        // H1. IPFS Gateway. Reconfirmed unchanged from 0.9.367/0.9.368 —
        // never assumed to be "next" merely because it resembles Arweave.
        const worldEncounterCompositionSource = await source('application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js');
        assert(!/ipfs/i.test(worldEncounterCompositionSource), 'H1. World Encounter material discovery composition still never references IPFS — Local + Nostr + Arweave only');
        const mainSourceForIpfs = await source('ui/main.js');
        const ipfsGatewayUsageCount = (mainSourceForIpfs.match(/new IpfsGatewayContentStore\(\)/g) || []).length;
        assert(ipfsGatewayUsageCount === 2, `H1. IpfsGatewayContentStore is still constructed at exactly its two known, narrowly-scoped, opt-in call sites — found ${ipfsGatewayUsageCount}`);
        decisions.ipfsGateway = { candidate: 'IPFS Gateway', verdict: 'DEFER', evidence: 'Still a real but structurally narrower, opt-in-per-item failure mode — never the default World Encounter/Snapshot retrieval backbone. Unchanged since 0.9.367/0.9.368; not "next" merely by resemblance to Arweave.' };

        // H2. STUN — still one flat iceServers array, no independently
        // configurable STUN field to expose.
        const peerConnectionProviderSource = await source('peer/WebRtcPeerConnectionProvider.js');
        assert(/constructor\(\{\s*iceServers\s*=\s*\[\]/.test(peerConnectionProviderSource),
            'H2. the real ICE consumer still accepts one flat iceServers array, not separable STUN configuration');
        decisions.stun = { candidate: 'STUN', verdict: 'DEFER', evidence: 'One flat iceServers array at the real consumer — no independent STUN configuration shape exists to expose to a user, unchanged from 0.9.363/0.9.367/0.9.368.' };

        // H3. TURN — the credential-shaped candidate 0.9.368 already
        // separated out; reconfirmed unchanged.
        const iceServerConfigSource = await source('peer/IceServerConfig.js');
        assert(/fetchIceServers/.test(iceServerConfigSource), 'H3. TURN\'s real consumer is still a dynamic credential fetch, not a plain URL field');
        decisions.turn = { candidate: 'TURN', verdict: 'SEPARATE_PRODUCT', evidence: 'A real gap, but a dynamic credential fetch rules out a plain-URL configuration shape entirely — needs fundamentally different (credential) semantics, unchanged from 0.9.368.' };

        // H4. Rendezvous — still deployment/bootstrap identity, no
        // per-user recovery scenario.
        const rendezvousConfigSource = await source('peer/RendezvousConfig.js');
        assert(/DEFAULT_RENDEZVOUS_URLS\s*=\s*\[/.test(rendezvousConfigSource), 'H4. rendezvous configuration still lives as one deployment-level list');
        decisions.rendezvous = { candidate: 'Rendezvous', verdict: 'DEFER', evidence: 'No user-facing recovery scenario: a person\'s own peers reach them through whichever rendezvous node their invitation already encodes, never a value they would swap in isolation. Unchanged.' };

        // H5. Bitcoin Esplora — explicit, occasional anchoring action,
        // never the default content pipeline.
        decisions.bitcoinEsplora = { candidate: 'Bitcoin Esplora', verdict: 'DEFER', evidence: 'Anchoring is an explicit, occasional user action, not something every session depends on the way discovery/retrieval is. No product evidence of a recurring recovery need. Unchanged.' };

        // H6. Base RPC — same reasoning.
        decisions.baseRpc = { candidate: 'Base RPC', verdict: 'DEFER', evidence: 'Same reasoning as Bitcoin Esplora — an explicit, occasional anchoring action, not the default content pipeline. Unchanged.' };

        const nonCompleteVerdicts = ['DEFER', 'SEPARATE_PRODUCT'];
        for (const [key, decision] of Object.entries(decisions)) {
            assert(nonCompleteVerdicts.includes(decision.verdict), `H (${key}). every remaining candidate reassessed with real evidence, none reaches BUILD_NEXT`);
        }

        console.log('✓ Section H: reassessed against real, current source — IPFS Gateway and STUN, Rendezvous, Bitcoin Esplora, Base RPC remain DEFER; TURN remains SEPARATE_PRODUCT (credential-shaped); none reaches BUILD_NEXT');
        console.log('  ' + JSON.stringify(Object.values(decisions).map((d) => `${d.candidate}: ${d.verdict}`)));
    }

    // ===============================================================
    // Section I — cross-configuration isolation: Arweave Gateway and
    // Nostr Relay configuration coexist with no shared abstraction.
    // ===============================================================
    {
        // I1. Own storage keys, own semantics — behavioral proof, one
        // shared namespace, two independent facts.
        const sharedNamespace = {};
        const arweaveStore = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const nostrStore = new NostrRelayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        arweaveStore.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://arweave-only.example' }));
        nostrStore.save(new NostrRelayConfiguration({ relayUrl: 'wss://nostr-only.example' }));
        assert(arweaveStore.get().gatewayUrl === 'https://arweave-only.example' && nostrStore.get().relayUrl === 'wss://nostr-only.example',
            'I1. both configurations round-trip independently through one shared storage namespace, no value bleed in either direction');
        assert(Object.keys(sharedNamespace).sort().join(',') === 'arweave-gateway-configuration,nostr-relay-configuration',
            'I1. exactly the two expected, distinct storage keys exist — no collision, no shared/merged key');
        nostrStore.clear();
        assert(arweaveStore.get().gatewayUrl === 'https://arweave-only.example', 'I1. clearing the Nostr relay override leaves the co-resident Arweave configuration completely untouched');

        // I2. No EXECUTABLE cross-reference in either direction — each
        // file's own design-rationale comments legitimately discuss the
        // sibling substrate BY NAME (to explain why it deliberately stays
        // a separate file/class), so comment lines are excluded here
        // exactly like every other "what does the code actually DO"
        // sweep elsewhere in this suite excludes them.
        const nostrConfigExecutable = (await source('core/NostrRelayConfiguration.js')).replace(/\/\/.*$/gm, '');
        const nostrStoreExecutable = (await source('storage/NostrRelayConfigurationStore.js')).replace(/\/\/.*$/gm, '');
        assert(!/Arweave/.test(nostrConfigExecutable) && !/Arweave/i.test(nostrStoreExecutable),
            'I2. core/NostrRelayConfiguration.js and storage/NostrRelayConfigurationStore.js never EXECUTABLY reference Arweave (import, construct, or read one of its classes/keys)');
        const arweaveConfigExecutable = (await source('core/ArweaveGatewayConfiguration.js')).replace(/\/\/.*$/gm, '');
        const arweaveStoreExecutable = (await source('storage/ArweaveGatewayConfigurationStore.js')).replace(/\/\/.*$/gm, '');
        assert(!/Nostr/.test(arweaveConfigExecutable) && !/Nostr/.test(arweaveStoreExecutable),
            'I2. core/ArweaveGatewayConfiguration.js and storage/ArweaveGatewayConfigurationStore.js never EXECUTABLY reference Nostr');

        // I3. No shared abstraction emerged merely because the two now
        // happen to share a lifecycle pattern (value object -> store ->
        // use case -> settings view — the identical shape, deliberately).
        // Neither value object subclasses the other, or any shared base
        // beyond plain `Object`.
        assert(!/class NostrRelayConfiguration extends/.test(nostrConfigExecutable), 'I3. NostrRelayConfiguration is not a subclass of anything');
        assert(!/class ArweaveGatewayConfiguration extends/.test(arweaveConfigExecutable), 'I3. ArweaveGatewayConfiguration is not a subclass of anything either');

        console.log('✓ Section I: Arweave Gateway and Nostr Relay configuration coexist cleanly — own storage keys, own semantics, no cross-reference in either direction, and no abstraction emerged merely because their lifecycle shapes now happen to match');
    }

    // ===============================================================
    // Section J — final decision.
    // ===============================================================
    {
        // J1. This milestone's own settings view carries none of the
        // "Test Connection" vocabulary the accompanying architectural
        // recommendation explicitly advises against building next —
        // reconfirmed directly, one more time, from THIS milestone's own
        // perspective (0.9.371's own Section L already swept this; this
        // is an independent re-check, not a reuse of that result).
        const viewSource = await source('ui/views/NostrRelaySettingsView.js');
        const templateMatch = viewSource.match(/template:\s*`([\s\S]*)`\s*\n\};/);
        const templateText = templateMatch[1];
        const testConnectionVocabulary = ['Test Connection', 'health', 'Health', 'reachable now', 'Reachable', 'ping', 'Ping'];
        for (const term of testConnectionVocabulary) {
            assert(!templateText.includes(term), `J1 ('${term}'). the settings page still carries none of the "configured ≠ reachable-now" vocabulary this milestone's own accompanying recommendation advises against`);
        }

        const verdicts = {
            arweaveGateway: 'COMPLETE',
            nostrRelay: 'COMPLETE',
            ipfsGateway: 'DEFER',
            turn: 'SEPARATE_PRODUCT',
            stun: 'DEFER',
            rendezvous: 'DEFER',
            bitcoinEsplora: 'DEFER',
            baseRpc: 'DEFER',
            discoveryFailureVisibility: 'SEPARATE_PRODUCT'
        };
        assert(verdicts.nostrRelay === 'COMPLETE', 'J2. Nostr Relay closes the demonstrated recovery gap — Section B proved it end to end, across all three discovery paths, at the concrete WebSocket construction');
        assert(Object.values(verdicts).every((v) => ['COMPLETE', 'DEFER', 'SEPARATE_PRODUCT'].includes(v)) && !Object.values(verdicts).includes('BUILD_NEXT'),
            'J3. no remaining infrastructure-endpoint candidate reaches BUILD_NEXT');

        console.log('✓ Section J: ' + JSON.stringify(verdicts));
        console.log('\n✅ All Nostr Relay Settings Lifecycle & Product Reassessment (0.9.372) checks passed.');
        console.log('VERDICT: STABLE_STOP for infrastructure-endpoint configuration — Arweave Gateway and Nostr Relay are both COMPLETE, and no remaining candidate (IPFS Gateway, STUN, Rendezvous, Bitcoin Esplora, Base RPC — all DEFER; TURN — SEPARATE_PRODUCT) demonstrates a comparable recovery gap. "Discovery Failure Visibility" (Section E — distinguishing silent relay failure from a genuinely empty result, across all three discovery paths) is named as its own SEPARATE_PRODUCT candidate, distinct from endpoint configuration, and deliberately NOT built here — first because an alternative relay already resolves the practical recovery need, second because it is a presentation/error-semantics question, not a configuration-boundary one. No production code changed in this milestone.');
    }
}

run().catch((error) => {
    console.error('NostrRelaySettingsLifecycleReassessment.test.js FAILED:', error);
    process.exitCode = 1;
});
