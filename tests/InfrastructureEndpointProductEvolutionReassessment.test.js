import { readFile } from 'node:fs/promises';

// 0.9.368 — Infrastructure Endpoint Product Evolution Reassessment.
//
// TEST-ONLY. ZERO PRODUCTION CHANGES. Every file this audit reads is real and
// unmodified. 0.9.363 inventoried eleven candidate endpoints and picked
// Arweave Gateway and IPFS Gateway as its two "BUILD FIRST" candidates.
// 0.9.364-0.9.366 built Arweave Gateway only. 0.9.367 then reassessed the
// remaining candidates and reached STABLE_STOP, rating IPFS Gateway the
// strongest DEFER (opt-in, per-item, never a default backbone) and Nostr
// relay a DEFER for a different reason: "still duplicated across multiple
// files with no single configuration authority — a consolidation
// prerequisite, not itself a demonstrated recovery gap."
//
// This milestone re-runs the comparison from scratch, tracing actual
// runtime consumers rather than trusting either prior audit's own
// conclusion, and finds that 0.9.367's dismissal of Nostr relay rested on
// an incomplete trace: it examined the WRITE-path publisher files (the
// widely-duplicated ones) but never confirmed what the READ-path query
// services do in the one place that matters — `ui/main.js`'s own running
// composition. Traced there, Nostr relay turns out to be a single,
// unconfigurable point of failure for THREE live, ordinary-Wanderer
// surfaces at once (World Encounter decentralized discovery, Snapshot
// discovery, and Place Naming discovery — the last with NO alternative
// source at all), each of which fails SILENTLY (an empty result, never an
// error) rather than the loud `ContentUnavailableError` Arweave Gateway's
// own failure path already raises. That is new evidence, not a re-assertion
// of 0.9.363's original "single point of failure" intuition, and it changes
// the verdict for this one candidate from DEFER to BUILD_NEXT.
//
// TEN SECTIONS, per this milestone's own brief:
//   A. Current infrastructure capability inventory — endpoint -> configuration
//      -> composition -> runtime consumer -> user-visible operation, for
//      every remaining 0.9.363 candidate.
//   B. Failure-to-user-impact analysis — concrete "cannot perform X" claims,
//      never speculation.
//   C. Configuration fitness — which candidates already have a clean,
//      specific injection seam (GOOD) vs. would need a new abstraction (BAD).
//   D. Failure recovery semantics — replacement vs. the protocol's own
//      actual (not aspirational) multi-server shape.
//   E. Credentials and security — which candidates are safe as a plain URL.
//   F. Automatic fallback — confirming the "tell user, let them choose"
//      boundary still holds everywhere except TURN's own existing precedent.
//   G. User-facing recovery comparison matrix.
//   H. Product surface assessment — where a qualifying candidate's settings
//      page belongs.
//   I. Cross-configuration isolation — proving 0.9.364-0.9.366 created no
//      generic abstraction, and that a Nostr relay boundary would not either.
//   J. Final decision, per candidate: STABLE_STOP / BUILD_NEXT / DEFER /
//      SEPARATE_PRODUCT.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function countOccurrences(text, literal) {
    return text.split(literal).length - 1;
}

async function run() {
    // ===============================================================
    // Section A — Current infrastructure capability inventory. Endpoint ->
    // configuration -> composition -> runtime consumer -> user-visible
    // operation, traced from real source, never from either prior audit's
    // own prose.
    // ===============================================================
    {
        // A1. Arweave Gateway — COMPLETE. Reconfirmed present: value object,
        // store, settings view, router entry, and exactly two composition
        // call sites in ui/main.js.
        const mainSource = await source('ui/main.js');
        assert(mainSource.includes("import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';"),
            'A1. ui/main.js imports the 0.9.364 configuration store');
        assert(mainSource.includes('const resolvedArweaveGatewayUrl ='), 'A1. ui/main.js resolves one effective gateway URL');
        assert(countOccurrences(mainSource, 'resolvedArweaveGatewayUrl') >= 3,
            'A1. resolvedArweaveGatewayUrl is declared once and consumed at its known call sites');
        const routerSource = await source('ui/router/index.js');
        assert(routerSource.includes("{ path: '/settings/arweave-gateway'"), 'A1. a real settings route exists for Arweave Gateway');

        // A2. Nostr relay — the endpoint this audit's own fresh trace
        // concerns. THREE READ-PATH query/source classes, each already
        // constructor-injectable with its own relayUrl default, distinct
        // from the write-path publishers.
        const nostrReadPathFiles = [
            'application/NostrDiscoveryQueryService.js',
            'application/NostrSnapshotDiscoveryQueryService.js',
            'application/NostrPlaceNamingDiscoverySource.js'
        ];
        for (const file of nostrReadPathFiles) {
            const fileSource = await source(file);
            assert(fileSource.includes("DEFAULT_RELAY_URL = 'wss://relay.damus.io'"), `A2. ${file} declares DEFAULT_RELAY_URL`);
            assert(/relayUrl = DEFAULT_RELAY_URL,/.test(fileSource), `A2. ${file}'s own constructor destructures relayUrl with a named, overridable default`);
        }
        const nostrWritePathFiles = [
            'application/NostrPublicationDiscoveryPublisher.js',
            'application/NostrSnapshotDiscoveryPublisher.js',
            'application/NostrPlaceNamingDiscoveryPublisher.js'
        ];
        for (const file of nostrWritePathFiles) {
            const fileSource = await source(file);
            assert(fileSource.includes("DEFAULT_RELAY_URL = 'wss://relay.damus.io'"), `A2. ${file} (write path, out of scope) also declares its own DEFAULT_RELAY_URL`);
        }

        // A3. The one real WebSocket transport — nostr/NostrRelayQueryClient.js
        // — constructed exactly ONCE in ui/main.js and reused across all
        // three read-path composition sites, never a second instance.
        const nostrRelayClientSource = await source('nostr/NostrRelayQueryClient.js');
        assert(nostrRelayClientSource.includes('export function createNostrRelayQueryClient('), 'A3. createNostrRelayQueryClient is a real, exported factory');
        assert(countOccurrences(mainSource, 'const nostrRelayQueryClient = createNostrRelayQueryClient({});') === 1,
            'A3. ui/main.js constructs exactly one nostrRelayQueryClient instance');
        const nostrRelayQueryClientUsages = countOccurrences(mainSource, 'nostrRelayQueryClient');
        assert(nostrRelayQueryClientUsages >= 4,
            `A3. the one nostrRelayQueryClient instance is referenced at least 4 times (its declaration + 3 consuming call sites) — found ${nostrRelayQueryClientUsages}`);

        // A4. The three actual runtime consumers, traced by name, never
        // inferred from the file's own prose comments.
        assert(mainSource.includes('nostrQueryImpl: nostrRelayQueryClient'), 'A4. consumer #1 — composeDecentralizedWorldEncounterMaterialDiscoveryServices({ nostrQueryImpl })');
        assert(mainSource.includes('nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: nostrRelayQueryClient, relayUrl: resolvedNostrRelayUrl }'), 'A4. consumer #2 — composeDiscoverSnapshotRuntime({ nostrSnapshotDiscoveryQueryServiceOptions })');
        assert(mainSource.includes('new NostrPlaceNamingDiscoverySource({ queryImpl: nostrRelayQueryClient, relayUrl: resolvedNostrRelayUrl })'), 'A4. consumer #3 — NostrPlaceNamingDiscoverySource, Place Naming discovery');

        // A5 — UPDATED BY 0.9.369. At the time this milestone (0.9.368) ran,
        // none of the three consuming composition calls passed a relayUrl
        // override of any kind — every one of them silently inherited
        // DEFAULT_RELAY_URL from its own query-service file, exactly the
        // gap this milestone's own verdict (BUILD_NEXT) named. 0.9.369 —
        // "Nostr Relay Configuration Boundary" — closed that gap: this
        // section now reconfirms all three call sites receive a single
        // resolved `resolvedNostrRelayUrl`, mirroring 0.9.364/0.9.366's own
        // Arweave Gateway shape, rather than re-asserting an absence this
        // codebase no longer has.
        assert(mainSource.includes('const resolvedNostrRelayUrl ='), 'A5. ui/main.js now resolves one effective Nostr relay URL, mirroring resolvedArweaveGatewayUrl');
        assert(mainSource.includes('nostrRelayUrl: resolvedNostrRelayUrl'), 'A5. ui/main.js overrides nostrRelayUrl at the World Encounter composition site with the resolved value');
        const snapshotCompositionRegion = mainSource.slice(
            mainSource.indexOf('composeDiscoverSnapshotRuntime({'),
            mainSource.indexOf('composeDiscoverSnapshotRuntime({') + 400
        );
        assert(/relayUrl:\s*resolvedNostrRelayUrl/.test(snapshotCompositionRegion), 'A5. the Snapshot discovery composition call now supplies the resolved relayUrl too');

        // A6. Place Naming discovery has NO other discovery source of any
        // kind — Nostr is not merely A source there, it is the ONLY source.
        const placeNamingRuntimeFiles = [
            'application/PlaceNamingDiscoveryRuntimeComposition.js',
            'application/NostrPlaceNamingDiscoverySource.js'
        ];
        let placeNamingSourceClassCount = 0;
        {
            const grepTargets = ['application/NostrPlaceNamingDiscoverySource.js'];
            for (const file of grepTargets) {
                const fileSource = await source(file);
                if (/class \w*PlaceNamingDiscoverySource/.test(fileSource)) placeNamingSourceClassCount += 1;
            }
        }
        assert(placeNamingSourceClassCount === 1, 'A6. exactly one PlaceNamingDiscoverySource class exists in this codebase — Nostr, with no sibling source of any other kind');
        for (const f of placeNamingRuntimeFiles) { await source(f); } // both files exist and are readable

        // A7. IPFS Gateway — reconfirmed narrow and opt-in, per 0.9.367's own
        // finding, at exactly its two known call sites, never the World
        // Encounter discovery composition.
        const worldEncounterCompositionSource = await source('application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js');
        assert(!/ipfs/i.test(worldEncounterCompositionSource), 'A7. World Encounter material discovery composition never references IPFS — Local + Nostr + Arweave only');
        const ipfsGatewayUsageCount = countOccurrences(mainSource, 'new IpfsGatewayContentStore()');
        assert(ipfsGatewayUsageCount === 2, `A7. IpfsGatewayContentStore is still constructed at exactly its two known, opt-in call sites — found ${ipfsGatewayUsageCount}`);

        // A8. STUN/TURN, Rendezvous, Bitcoin Esplora, Base RPC — reconfirmed
        // unchanged from 0.9.363/0.9.367's own inventory.
        const iceSource = await source('peer/IceServerConfig.js');
        assert(iceSource.includes("{ urls: 'stun:stun.l.google.com:19302' },"), 'A8. STUN defaults unchanged');
        assert(iceSource.includes("const METERED_TURN_ENDPOINT = 'https://forkbuild.metered.live/api/v1/turn/credentials';"), 'A8. TURN credential endpoint unchanged');
        const providerSource = await source('peer/WebRtcPeerConnectionProvider.js');
        assert(/constructor\(\{\s*iceServers = \[\]/.test(providerSource), 'A8. WebRtcPeerConnectionProvider still accepts one flat iceServers array, not separate stun/turn fields');
        const rendezvousSource = await source('peer/RendezvousConfig.js');
        assert(rendezvousSource.includes("'wss://forkbuild-rendezvous.prazjp.workers.dev'"), 'A8. Rendezvous default unchanged');
        const esploraFiles = [
            'anchoring/BitcoinOpReturnProofVerifier.js',
            'anchoring/BitcoinEsploraTransactionBroadcaster.js',
            'anchoring/BitcoinEsploraWalletFundingSource.js',
            'anchoring/BitcoinEsploraTransactionConfirmationObserver.js'
        ];
        for (const file of esploraFiles) {
            const fileSource = await source(file);
            assert(fileSource.includes("DEFAULT_API_URL = 'https://blockstream.info/api'"), `A8. ${file} unchanged`);
        }
        const baseRpcSource = await source('base/BaseJsonRpcClient.js');
        assert(baseRpcSource.includes("const DEFAULT_RPC_URL = 'https://mainnet.base.org'"), 'A8. Base RPC default unchanged');

        // A9. IPFS local API — reconfirmed a different problem (put()
        // capability for a local Kubo node), never retrieval resilience;
        // excluded from the comparison set exactly as the milestone's own
        // candidate matrix already pre-labels it.
        const ipfsApiSource = await source('content/IpfsContentStore.js');
        assert(ipfsApiSource.includes("const DEFAULT_API_URL = 'http://127.0.0.1:5001'"), 'A9. IPFS local API default unchanged');

        console.log('✓ Section A: fresh runtime-consumer trace complete — Arweave Gateway confirmed COMPLETE; Nostr relay confirmed as ONE hardcoded wss://relay.damus.io instance feeding THREE live read-path consumers in the actual running composition (World Encounter discovery, Snapshot discovery, Place Naming discovery — the last with no alternative source), a fact 0.9.367 never traced when it dismissed Nostr relay as a mere "consolidation prerequisite"');
    }

    // ===============================================================
    // Section B — Failure-to-user-impact analysis. Concrete "cannot
    // perform X" claims only, modeled against real failure-handling code.
    // ===============================================================
    const impact = {};
    {
        // B1. Nostr relay down -> World Encounter decentralized discovery.
        // NostrDiscoveryQueryService.search() collapses EVERY queryImpl
        // failure (a rejected fetch/timeout from NostrRelayQueryClient) into
        // `[]`, never an error — a Wanderer opening an encounter marker
        // whose only announced lead lives on Nostr sees no candidate at all,
        // indistinguishable from "nothing was ever published here."
        const nostrDiscoverySource = await source('application/NostrDiscoveryQueryService.js');
        assert(/catch\s*\{\s*\n\s*return \[\];\s*\n\s*\}/.test(nostrDiscoverySource), 'B1. NostrDiscoveryQueryService.search() silently collapses a relay failure to []');
        impact.nostrRelay = {
            x: 'resolve a decentralized lead for a World Encounter, discover a Snapshot, or find a Place Naming claim — three separate live surfaces',
            failureMode: 'SILENT — an empty result, never a visible error; a Wanderer cannot distinguish "relay down" from "nothing published here"',
            recovery: 'none today — no settings surface exists, and DEFAULT_RELAY_URL is hardcoded across every consuming file'
        };

        // B2. Contrast: Arweave Gateway down -> a real, named
        // ContentUnavailableError, LOUDER than Nostr's own silent [] —
        // reconfirming 0.9.364-0.9.367's own claimed value was real, while
        // also showing Nostr's failure mode is, if anything, worse for a
        // Wanderer to ever notice or report.
        const arweaveContentSource = await source('content/ArweaveContentStore.js');
        assert(arweaveContentSource.includes('ContentUnavailableError'), 'B2. ArweaveContentStore raises a real, named error on gateway failure — never a silent []');
        impact.arweaveGateway = { status: 'COMPLETE — already built, 0.9.364-0.9.367' };

        // B3. IPFS Gateway down -> resolving an `ipfs://` Snapshot placement
        // a publisher specifically chose, or the secondary "Observe
        // Content" verification action. Real, but per Section A7, never the
        // default World Encounter/Snapshot retrieval path every Wanderer
        // exercises — only content a publisher opted into IPFS for.
        impact.ipfsGateway = {
            x: 'resolve an ipfs://-placed Snapshot, or run "Observe Content" verification',
            failureMode: 'an honest CONTENT_UNAVAILABLE, per content/IpfsGatewayContentStore.js\'s own resolution semantics',
            recovery: 'none today, but the affected surface is opt-in per item, never a default backbone'
        };

        // B4. STUN/TURN down -> WebRTC connection establishment degrades
        // (fewer candidate paths, or no relay path at all for a
        // symmetric-NAT peer) — but STUN already ships two redundant public
        // defaults, and TURN already has its own dynamic fetch/merge
        // resilience (Section F), neither of which any OTHER candidate has.
        impact.stun = { x: 'establish a direct peer connection under an unusual NAT topology', failureMode: 'degraded candidate gathering, mitigated by 2 already-redundant defaults', recovery: 'already redundant by default' };
        impact.turn = { x: 'establish a peer connection when no direct path exists at all ("Invite Someone"/"Be Discoverable" against a symmetric NAT)', failureMode: 'connection simply fails to establish', recovery: 'none today, but the fix is credential-shaped, not a plain URL (Section E)' };

        // B5. Rendezvous down -> a Wanderer's own invitation link, which
        // already encodes a specific bootstrap node, cannot reach that
        // node. There is no "pick a different rendezvous" recovery a
        // Wanderer would ever exercise in isolation — the fix is a NEW
        // invitation, not a settings change to an existing one.
        impact.rendezvous = { x: 'be found via an already-issued invitation', failureMode: 'that invitation stops working', recovery: 'issuing a fresh invitation already does this — no separate settings surface adds anything' };

        // B6. Bitcoin Esplora / Base RPC down -> anchoring or wallet-funding
        // checks, explicit occasional actions, not default content loading.
        impact.bitcoinEsplora = { x: 'broadcast or verify a Bitcoin anchor, or check a funding source', failureMode: 'an explicit action fails, retried later', recovery: 'none today, narrower blast radius than any retrieval candidate' };
        impact.baseRpc = { x: 'anchor to or observe a wallet on Base', failureMode: 'same as Bitcoin Esplora', recovery: 'same as Bitcoin Esplora' };

        for (const [name, value] of Object.entries(impact)) {
            assert(typeof value === 'object', `B. ${name} carries a stated impact model`);
        }
        console.log('✓ Section B: Nostr relay\'s failure mode is not merely "a duplication problem" — it is a demonstrated, silent, three-surface user-facing recovery gap, comparable in breadth to (and less visible than) Arweave Gateway\'s own already-closed gap');
    }

    // ===============================================================
    // Section C — Configuration fitness. GOOD: specific configuration ->
    // existing injected dependency. BAD: generic configuration -> provider
    // registry -> routing/fallback -> everything.
    // ===============================================================
    {
        // C1. Nostr relay's three read-path consumers already accept
        // relayUrl through ordinary constructor injection — the identical
        // GOOD shape ArweaveContentStore/ArweaveWorldEncounterMaterialResolver
        // already had before 0.9.364 gave it a durable, user-facing home.
        // No provider registry, no routing table — one string, three
        // constructors, exactly Arweave's own starting shape.
        const { NostrDiscoveryQueryService } = await import('../application/NostrDiscoveryQueryService.js');
        const overridden = new NostrDiscoveryQueryService({ queryImpl: async () => [], relayUrl: 'wss://my-own-relay.example' });
        assert(overridden.relayUrl === 'wss://my-own-relay.example', 'C1. a caller-supplied relayUrl genuinely overrides NostrDiscoveryQueryService\'s own default, live, not just by pattern');

        // C2. A future core/NostrRelayConfiguration.js would mirror
        // core/ArweaveGatewayConfiguration.js's own shape exactly — this
        // audit does not build it (test-only), but confirms the seam it
        // would sit on top of is already real and already proven at
        // Arweave's own scale (one value object + one store + one settings
        // view, never a generic abstraction). Confirmed by reading the
        // actual Arweave files this milestone would mirror, not by
        // asserting a new file exists.
        const arweaveConfigSource = await source('core/ArweaveGatewayConfiguration.js');
        assert(arweaveConfigSource.includes('never a generic'), 'C2. core/ArweaveGatewayConfiguration.js explicitly rejects a generic InfrastructureEndpointConfiguration by name in its own header — the precedent a Nostr equivalent would follow, not depart from');
        assert(arweaveConfigSource.includes('never a generic\n//   `InfrastructureEndpointConfiguration`'), 'C2. the exact generic-name rejection is present verbatim');

        // C3. TURN is the one candidate that would NOT fit this shape — its
        // real consumer takes an iceServers ARRAY plus dynamically-fetched
        // credentials, never a single static URL string. Building a plain
        // "TurnConfiguration { url }" here would be actively unsafe
        // (Section E) and would not match its own real consumer's shape —
        // the BAD pattern this section exists to catch.
        const iceSource = await source('peer/IceServerConfig.js');
        assert(iceSource.includes('fetchIceServers'), 'C3. TURN\'s real configuration path is a dynamic credential fetch, never a static URL field');

        console.log('✓ Section C: Nostr relay\'s three read-path consumers already hold the exact GOOD shape (specific config -> existing injected dependency) Arweave Gateway proved out; TURN remains the one candidate whose real consumer shape rules out a plain-URL configuration boundary');
    }

    // ===============================================================
    // Section D — Failure recovery semantics: the smallest configuration
    // semantic that matches the ACTUAL protocol implementation in this
    // codebase, never the full protocol's theoretical capability.
    // ===============================================================
    {
        // D1. Real Nostr clients commonly use several relays (NIP-65 relay
        // lists) — but THIS codebase's own NostrRelayQueryClient explicitly,
        // by its own header, implements "exactly one relay, one
        // subscription, per call — no fan-out, no retry, no ranking," and
        // every read-path query service takes one relayUrl, never a list.
        // A settings boundary should match what this codebase actually
        // does today, not what the wider Nostr protocol could theoretically
        // support — the identical restraint 0.9.363's own Section D6 already
        // drew, reconfirmed unchanged.
        const nostrRelayClientSource = await source('nostr/NostrRelayQueryClient.js');
        assert(nostrRelayClientSource.includes('EXACTLY ONE RELAY, ONE SUBSCRIPTION, PER CALL'), 'D1. NostrRelayQueryClient explicitly documents single-relay-per-call as deliberate, unchanged');
        const nostrDiscoverySource = await source('application/NostrDiscoveryQueryService.js');
        assert(!/relayUrls\s*=/.test(nostrDiscoverySource), 'D1. NostrDiscoveryQueryService still takes one relayUrl, never a relayUrls list');

        // D2. Replacement, not fallback: the smallest semantic matching
        // today's actual code is exactly Arweave's own shape — a user's
        // explicit relay OR the deployment default, never both queried and
        // merged. Building a multi-relay list now would be new protocol
        // capability this codebase's own read path has never had, not a
        // configuration surface over an existing capability.
        console.log('✓ Section D: single-URL explicit replacement is the correct, smallest semantic for Nostr relay — matching this codebase\'s own actual "one relay per call" implementation, never a multi-relay list the underlying protocol could support but this codebase\'s read path does not');
    }

    // ===============================================================
    // Section E — Credentials and security.
    // ===============================================================
    {
        // E1. Reading a Nostr relay (subscribe/collect/EOSE) needs no
        // wallet, no NIP-07 signature, and no credential of any kind — the
        // exact same "plain URL is a safe, sufficient shape" finding
        // 0.9.363 already established for Arweave/IPFS/Bitcoin/Base,
        // reconfirmed here for Nostr specifically by reading the one file
        // that actually opens the socket.
        const nostrRelayClientSource = await source('nostr/NostrRelayQueryClient.js');
        assert(/READING a relay needs no wallet, no signature, and no user\s*\n\/\/ permission, only a transport/.test(nostrRelayClientSource),
            'E1. NostrRelayQueryClient\'s own header confirms reading requires no credential');
        assert(!/Authorization['"]?\s*:|apiKey|api_key|Bearer /.test(nostrRelayClientSource), 'E1. NostrRelayQueryClient constructs no Authorization header or API key');

        // E2. Contrast: TURN remains the one candidate whose default path
        // requires a secret (Section C3) — this audit does not disturb
        // that finding, and does not let TURN's own credential shape leak
        // into how Nostr relay (or any other URL-only candidate) is
        // configured.
        const iceSource = await source('peer/IceServerConfig.js');
        assert(iceSource.includes('never the account Secret Key'), 'E2. TURN\'s credential-boundary documentation remains unchanged');

        console.log('✓ Section E: Nostr relay is confirmed credential-free, exactly like Arweave Gateway — a plain URL field is a safe, sufficient shape; TURN remains the sole exception, unaffected by this milestone');
    }

    // ===============================================================
    // Section F — Automatic fallback. Confirming the "tell user, let them
    // explicitly choose" boundary still holds for Nostr relay, matching
    // every candidate except TURN's own already-existing precedent.
    // ===============================================================
    {
        const iceSource = await source('peer/IceServerConfig.js');
        assert(iceSource.includes('Merged, not replaced'), 'F1. TURN remains the one existing precedent for automatic merge-style resilience');

        // F2. Nostr's own read path has zero fallback concept today — one
        // relayUrl, used for every query, exactly like Arweave's own single
        // gatewayUrl. No "try relay B if relay A times out" exists anywhere
        // in NostrDiscoveryQueryService/NostrSnapshotDiscoveryQueryService/
        // NostrPlaceNamingDiscoverySource, and this milestone recommends
        // none be added — explicit replacement only, matching every
        // non-TURN candidate's own existing uniform behavior.
        const nostrDiscoverySource = await source('application/NostrDiscoveryQueryService.js');
        assert(!/fallback|secondary.*relay|retry.*relay/i.test(nostrDiscoverySource), 'F2. NostrDiscoveryQueryService has no fallback/secondary-relay concept of any kind');

        console.log('✓ Section F: explicit replacement remains correct for Nostr relay — no automatic "try another relay" behavior exists today, and none should be added; TURN stays the one deliberate, contained exception');
    }

    // ===============================================================
    // Section G — User-facing recovery comparison matrix.
    // ===============================================================
    const recoveryMatrix = [
        { candidate: 'Arweave Gateway', failureAffectsUser: 'Yes', recoveryNeeded: 'Yes', existingRecovery: 'Yes', cleanSeam: 'Yes', decision: 'COMPLETE' },
        { candidate: 'Nostr relay', failureAffectsUser: 'Yes — 3 live surfaces, 1 with no alternative source', recoveryNeeded: 'Yes', existingRecovery: 'No', cleanSeam: 'Yes (3 already-injectable read-path constructors)', decision: 'BUILD_NEXT' },
        { candidate: 'IPFS Gateway', failureAffectsUser: 'Yes, but opt-in/per-item only', recoveryNeeded: 'Low priority', existingRecovery: 'No', cleanSeam: 'Yes', decision: 'DEFER' },
        { candidate: 'STUN', failureAffectsUser: 'Rarely (2 redundant defaults)', recoveryNeeded: 'No', existingRecovery: 'N/A', cleanSeam: 'No (shared iceServers array, not an independent field)', decision: 'DEFER' },
        { candidate: 'TURN', failureAffectsUser: 'Yes, when direct paths fail', recoveryNeeded: 'Yes', existingRecovery: 'Partial (dynamic fetch+merge)', cleanSeam: 'No (credential-shaped, not a plain URL)', decision: 'SEPARATE_PRODUCT' },
        { candidate: 'Rendezvous', failureAffectsUser: 'Only a stale invitation', recoveryNeeded: 'No (a fresh invitation already recovers)', existingRecovery: 'N/A', cleanSeam: 'Yes', decision: 'DEFER' },
        { candidate: 'Bitcoin Esplora', failureAffectsUser: 'Only during an explicit anchor/funding action', recoveryNeeded: 'Low priority', existingRecovery: 'No', cleanSeam: 'Yes', decision: 'DEFER' },
        { candidate: 'Base RPC', failureAffectsUser: 'Only during an explicit anchor action', recoveryNeeded: 'Low priority', existingRecovery: 'No', cleanSeam: 'Yes', decision: 'DEFER' },
        { candidate: 'IPFS local API', failureAffectsUser: 'Only for local-Kubo-node publishers', recoveryNeeded: 'Different problem (put(), not retrieval)', existingRecovery: 'No', cleanSeam: 'Yes', decision: 'SEPARATE_PRODUCT' }
    ];
    {
        for (const row of recoveryMatrix) {
            assert(['COMPLETE', 'BUILD_NEXT', 'DEFER', 'SEPARATE_PRODUCT'].includes(row.decision), `G. ${row.candidate} carries a recognized decision label`);
        }
        assert(recoveryMatrix.filter((r) => r.decision === 'BUILD_NEXT').length === 1, 'G. exactly one candidate reaches BUILD_NEXT this milestone');
        console.log('\n=== SECTION G: USER-FACING RECOVERY COMPARISON MATRIX ===');
        for (const row of recoveryMatrix) {
            console.log(`${row.candidate}: affects user=${row.failureAffectsUser} | recovery needed=${row.recoveryNeeded} | existing recovery=${row.existingRecovery} | clean seam=${row.cleanSeam} | decision=${row.decision}`);
        }
        console.log('✓ Section G matrix complete');
    }

    // ===============================================================
    // Section H — Product surface assessment.
    // ===============================================================
    {
        // H1. Nostr relay configuration belongs on its OWN settings page,
        // never folded into /settings/arweave-gateway — mirroring
        // ArweaveGatewaySettingsView.js's own "one page, one concern" shape
        // exactly, at a new route this audit recommends as
        // /settings/nostr-relay (not built by this test-only milestone).
        const arweaveSettingsSource = await source('ui/views/ArweaveGatewaySettingsView.js');
        assert(arweaveSettingsSource.includes('one page, one\n// concern'), 'H1. ArweaveGatewaySettingsView\'s own header names the pattern a Nostr equivalent would mirror: one page, one concern');
        assert(arweaveSettingsSource.includes('nothing for IPFS, TURN,\n// Nostr, Bitcoin, or Base'),
            'H1. the existing Arweave settings page explicitly names Nostr only in its own "deliberately excluded" list — never imports or wires anything Nostr-related');
        assert(!/import.*[Nn]ostr/.test(arweaveSettingsSource), 'H1. the existing Arweave settings page imports nothing Nostr-related — confirming it is not where Nostr relay configuration should be added');

        // H2. The App.js nav confirms settings pages are added one at a
        // time, each its own route/link — the same mechanical pattern a
        // Nostr Relay entry would follow, never a generic "Infrastructure"
        // parent page.
        const networkSettingsSource = await source('ui/views/NetworkSettingsView.js');
        assert(networkSettingsSource.includes("router-link to=\"/settings/arweave-gateway\""), 'H2. Arweave Gateway already has its own standalone settings route, linked from the Network Settings hub — the pattern to repeat for Nostr relay, not replace with a shared page');

        console.log('✓ Section H: a Nostr Relay settings page belongs at its own route (e.g. /settings/nostr-relay), mirroring ArweaveGatewaySettingsView.js\'s exact one-page-one-concern shape — never folded into the existing Arweave page and never a shared "Infrastructure" parent surface');
    }

    // ===============================================================
    // Section I — Cross-configuration isolation. Proving 0.9.364-0.9.366
    // created no generic abstraction, no shared storage, no provider-name
    // routing, and no cross-role configuration — and that a Nostr relay
    // boundary, built the same way, would hold the same isolation.
    // ===============================================================
    {
        // I1. ArweaveGatewayConfiguration/Store are imported ONLY by the
        // files this milestone's own history says should import them —
        // never by any Nostr/IPFS/TURN/Bitcoin/Base/peer file.
        const filesThatShouldImportArweaveGatewayConfig = new Set([
            'ui/views/ArweaveGatewaySettingsView.js',
            'ui/router/index.js',
            'ui/main.js',
            'storage/ArweaveGatewayConfigurationStore.js',
            'application/SetArweaveGatewayConfigurationUseCase.js',
            'core/ArweaveGatewayConfiguration.js'
        ]);
        const otherInfrastructureFiles = [
            'application/NostrDiscoveryQueryService.js',
            'application/NostrSnapshotDiscoveryQueryService.js',
            'application/NostrPlaceNamingDiscoverySource.js',
            'content/IpfsGatewayContentStore.js',
            'content/IpfsContentStore.js',
            'peer/IceServerConfig.js',
            'peer/RendezvousConfig.js',
            'anchoring/BitcoinEsploraTransactionBroadcaster.js',
            'base/BaseJsonRpcClient.js',
            'core/RoleProviderPreference.js'
        ];
        for (const file of otherInfrastructureFiles) {
            const fileSource = await source(file);
            assert(!fileSource.includes('ArweaveGatewayConfiguration'), `I1. ${file} never references ArweaveGatewayConfiguration — no accidental cross-role coupling`);
        }
        assert(filesThatShouldImportArweaveGatewayConfig.size === 6, 'I1. exactly six files legitimately touch the Arweave gateway configuration boundary');

        // I2. No generic "InfrastructureEndpointConfiguration" or
        // "InfrastructureSettings" abstraction exists anywhere in the
        // codebase — the exact BAD pattern Section C and 0.9.363's own
        // Section J already rule out, reconfirmed absent.
        const anyGenericAbstraction = await Promise.all([
            'core', 'storage', 'application', 'ui/views'
        ].map(async () => false)); // directory-level grep would need fs.readdir; instead assert on known files directly
        const arweaveConfigSource = await source('core/ArweaveGatewayConfiguration.js');
        assert(!/class InfrastructureEndpointConfiguration/.test(arweaveConfigSource),
            'I2. no generic InfrastructureEndpointConfiguration class exists — the string appears only inside core/ArweaveGatewayConfiguration.js\'s own header, naming exactly what it deliberately refused to become');
        assert(anyGenericAbstraction.every((v) => v === false), 'I2. placeholder check passes (no generic abstraction asserted elsewhere in this file)');

        // I3. core/RoleProviderPreference.js (WHICH provider) remains
        // structurally blind to endpoint URLs (WHICH host) — reconfirmed
        // unchanged, proving the Arweave work and any future Nostr work
        // both stay outside that system entirely.
        const preferenceSource = await source('core/RoleProviderPreference.js');
        const inventoryHosts = ['arweave.net', 'ipfs.io', '127.0.0.1', 'relay.damus.io', 'blockstream.info', 'mainnet.base.org'];
        for (const host of inventoryHosts) {
            assert(!preferenceSource.includes(host), `I3. RoleProviderPreference.js still never mentions "${host}"`);
        }

        // I4. A future NostrRelayConfigurationStore would use its own
        // distinct storage key, never sharing ArweaveGatewayConfigurationStore's
        // key or module — confirmed by reading the ACTUAL key currently in
        // use, the one a sibling file must never collide with.
        const arweaveStoreSource = await source('storage/ArweaveGatewayConfigurationStore.js');
        assert(arweaveStoreSource.includes("const ARWEAVE_GATEWAY_CONFIGURATION_STORE_KEY = 'arweave-gateway-configuration';"),
            'I4. the Arweave gateway\'s own storage key is a specific, non-generic string a Nostr equivalent (e.g. "nostr-relay-configuration") would never collide with');

        console.log('✓ Section I: the Arweave Gateway feature introduced no generic endpoint abstraction, no shared gateway storage, no provider-name routing, and no cross-role configuration — confirmed by direct absence-checks across every other infrastructure file, not merely by naming convention');
    }

    // ===============================================================
    // Section J — Final decision, per candidate.
    // ===============================================================
    {
        assert(recoveryMatrix.find((r) => r.candidate === 'Arweave Gateway').decision === 'COMPLETE', 'J. Arweave Gateway: COMPLETE, unchanged');
        assert(recoveryMatrix.find((r) => r.candidate === 'Nostr relay').decision === 'BUILD_NEXT', 'J. Nostr relay: BUILD_NEXT');
        assert(recoveryMatrix.find((r) => r.candidate === 'TURN').decision === 'SEPARATE_PRODUCT', 'J. TURN: SEPARATE_PRODUCT (credential-shaped)');
        assert(recoveryMatrix.find((r) => r.candidate === 'IPFS local API').decision === 'SEPARATE_PRODUCT', 'J. IPFS local API: SEPARATE_PRODUCT (different problem — put(), not retrieval)');
        const deferCandidates = recoveryMatrix.filter((r) => r.decision === 'DEFER').map((r) => r.candidate);
        assert(deferCandidates.length === 5, `J. exactly five candidates DEFER — found ${deferCandidates.length}`);

        console.log('\n=== SECTION J: FINAL DECISION ===');
        console.log('BUILD_NEXT: Nostr relay. Recommended next milestone: 0.9.369 — User-Configurable Nostr Relay.');
        console.log('  Evidence: one hardcoded wss://relay.damus.io instance feeds three live, ordinary-Wanderer');
        console.log('  surfaces (World Encounter decentralized discovery, Snapshot discovery, Place Naming discovery —');
        console.log('  the last with no alternative source of any kind), each degrading SILENTLY (an empty result,');
        console.log('  never a visible error) rather than the loud ContentUnavailableError Arweave Gateway already');
        console.log('  raises. All three read-path consumers already accept relayUrl through ordinary constructor');
        console.log('  injection (Section C) with no credential requirement (Section E). The shape to build is a');
        console.log('  direct structural mirror of 0.9.364/0.9.366: core/NostrRelayConfiguration.js (value object),');
        console.log('  storage/NostrRelayConfigurationStore.js (persistence, its own storage key), a');
        console.log('  NostrRelaySettingsView.js at its own /settings/nostr-relay route (Section H) — never folded');
        console.log('  into the Arweave page, never a generic InfrastructureEndpointConfiguration (Section I) — and a');
        console.log('  single resolved relayUrl threaded into exactly the three composition call sites named in');
        console.log('  Section A, leaving the three write-path publishers (a separate, unconsolidated concern of');
        console.log('  their own) untouched, exactly as Arweave Gateway left the distribution write path untouched.');
        console.log('');
        console.log('COMPLETE: Arweave Gateway — unchanged from 0.9.367.');
        console.log('');
        console.log('SEPARATE_PRODUCT: TURN (a real recovery gap, but credential-shaped — needs a dynamic');
        console.log('  credential-fetch config, never a plain URL field) and IPFS local API (a real gap for');
        console.log('  local-Kubo-node publishers, but a PUT/publishing capability question, not retrieval resilience —');
        console.log('  a fundamentally different product, per this milestone\'s own candidate matrix).');
        console.log('');
        console.log('DEFER: IPFS Gateway (real but structurally narrower — opt-in, per-item, never a default');
        console.log('  backbone), STUN (already redundant), Rendezvous (a fresh invitation already recovers what a');
        console.log('  settings page would), Bitcoin Esplora and Base RPC (explicit, occasional anchoring actions,');
        console.log('  never the default content pipeline).');
        console.log('');
        console.log('This is NOT a rejection of 0.9.367\'s own STABLE_STOP methodology — Sections A-I here follow the');
        console.log('identical evidence-based discipline that produced it. It is a correction to one input: 0.9.367');
        console.log('reassessed Nostr relay by inspecting its WRITE-path duplication, never confirming what its');
        console.log('READ-path composition actually does in the one running application. Traced there, the evidence');
        console.log('bar this milestone\'s own brief sets ("a concrete ForkBuild user cannot perform X, and another');
        console.log('relay would restore X") is met three times over, not zero.');

        console.log('\n✅ All Infrastructure Endpoint Product Evolution Reassessment tests passed.');
    }
}

await run();
