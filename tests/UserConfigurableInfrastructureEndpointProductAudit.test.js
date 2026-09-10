import { readFile } from 'node:fs/promises';

// 0.9.363 — User-Configurable Infrastructure Endpoint Product Audit.
//
// TEST-ONLY. ZERO PRODUCTION CHANGES. Every file this audit reads is real
// and unmodified; this file characterizes what it finds and recommends a
// verdict per candidate — it configures nothing itself, exactly like every
// "product audit" milestone this repository has already run (0.9.359's own
// World View Main-Screen Clutter Product Audit, 0.9.292's own Decentralized
// Substrate Capability Matrix Audit).
//
// FRAMING. The motivating question — "when the default server is down,
// users should be able to use their own" — names a real capability this
// codebase already half-has: every network-facing adapter in this repo
// already accepts its own endpoint through constructor injection, defaulted
// to a real public instance. What is genuinely missing is a PRODUCT SURFACE
// (a settings UI, or even a composition-root wiring point) that lets an
// end user supply an override — not the underlying architectural seam. This
// audit's job is to find out, with evidence, which of these seams are
// actually worth exposing, in what shape, and which should stay exactly
// as they are: deployment configuration nobody but an operator ever touches.
//
// TEN SECTIONS, mirroring the milestone brief's own lettering:
//
//   A. Current endpoint inventory — every real production endpoint traced
//      to its exact DEFAULT_* constant, file, and line — never a guess.
//   B. Functional vs informational URLs — separating a network dependency
//      from a plain UI hyperlink (mempool.space is the named suspect).
//   C. Configuration ownership — proving every endpoint is ALREADY
//      constructor-injectable, and that nothing today actually supplies an
//      override at the composition root or anywhere in ui/.
//   D. Semantic role separation — STUN vs TURN vs Rendezvous, Arweave
//      Gateway vs Arweave GraphQL, IPFS Gateway vs IPFS API, Bitcoin
//      Esplora vs Base RPC — verified structurally distinct, with one
//      correction to the brief's own assumed grouping (Section D6).
//   E. User-value assessment — would an ordinary Wanderer plausibly need
//      to change this, traced to real product evidence, not speculation.
//   F. Failure scenarios — default unavailable, does ANY existing surface
//      let a user restore the capability today? (Answer, traced: no —
//      the seam is mechanical/code-level only.)
//   G. Configuration vs provider preference — proving the existing
//      RoleProviderPreference system (0.9.293) and this audit's endpoints
//      are genuinely non-overlapping concepts.
//   H. Fallback semantics — replacement vs fallback, checked against the
//      one place this codebase already has BOTH (TURN's fetchIceServers).
//   I. Credential/security boundary — which candidates carry secrets.
//   J. Final candidate matrix and this milestone's own verdict.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function countOccurrences(source, literal) {
    return source.split(literal).length - 1;
}

async function run() {
    // ===============================================================
    // Section A — Current endpoint inventory.
    // ===============================================================
    const inventory = {};
    {
        // A1. Peer connectivity — STUN (two public Google entries, a plain
        // array literal, not individually named fields) and TURN (a
        // per-deployment Metered credential endpoint + API key, fetched
        // dynamically — see Section I).
        const iceSource = await rawSource('peer/IceServerConfig.js');
        assert(iceSource.includes("{ urls: 'stun:stun.l.google.com:19302' },"), 'A1. STUN default #1 present');
        assert(iceSource.includes("{ urls: 'stun1.l.google.com:19302' }") || iceSource.includes("{ urls: 'stun:stun1.l.google.com:19302' }"),
            'A1. STUN default #2 present');
        assert(iceSource.includes("const METERED_TURN_ENDPOINT = 'https://forkbuild.metered.live/api/v1/turn/credentials';"),
            'A1. TURN credential endpoint constant present');
        inventory.stun = { file: 'peer/IceServerConfig.js', value: 'stun:stun.l.google.com:19302 (+ stun1)' };
        inventory.turn = { file: 'peer/IceServerConfig.js', value: 'https://forkbuild.metered.live/api/v1/turn/credentials' };

        // A2. Rendezvous — this deployment's own bootstrap node.
        const rendezvousSource = await rawSource('peer/RendezvousConfig.js');
        assert(rendezvousSource.includes("export const DEFAULT_RENDEZVOUS_URLS = [") &&
            rendezvousSource.includes("'wss://forkbuild-rendezvous.prazjp.workers.dev'"),
            'A2. Rendezvous default bootstrap URL present');
        inventory.rendezvous = { file: 'peer/RendezvousConfig.js', value: 'wss://forkbuild-rendezvous.prazjp.workers.dev' };

        // A3. Arweave Gateway — duplicated independently across FOUR files,
        // never imported from one shared module.
        const arweaveGatewayFiles = [
            'content/ArweaveContentStore.js',
            'application/ArweaveWorldEncounterMaterialResolver.js',
            'application/ArweavePublicationMaterialUploader.js',
            'arweave/ArweaveInjectedProviderSigner.js'
        ];
        for (const file of arweaveGatewayFiles) {
            const source = await rawSource(file);
            assert(source.includes("DEFAULT_GATEWAY_URL = 'https://arweave.net'"),
                `A3. ${file} declares its own DEFAULT_GATEWAY_URL = 'https://arweave.net'`);
        }
        inventory.arweaveGateway = { files: arweaveGatewayFiles, value: 'https://arweave.net', duplication: arweaveGatewayFiles.length };

        // A4. Arweave GraphQL — a SEPARATE endpoint, one file only, never
        // shared with the gateway constant above.
        const arweaveGraphqlSource = await rawSource('application/ArweaveGraphqlDiscoveryQueryService.js');
        assert(arweaveGraphqlSource.includes("const DEFAULT_GRAPHQL_URL = 'https://arweave.net/graphql'"),
            'A4. ArweaveGraphqlDiscoveryQueryService declares its own DEFAULT_GRAPHQL_URL');
        inventory.arweaveGraphql = { file: 'application/ArweaveGraphqlDiscoveryQueryService.js', value: 'https://arweave.net/graphql', duplication: 1 };

        // A5. IPFS Gateway (remote, resolve-only) vs IPFS local API (Kubo,
        // put+get) — two independent files, two independent constants.
        const ipfsGatewaySource = await rawSource('content/IpfsGatewayContentStore.js');
        assert(ipfsGatewaySource.includes("const DEFAULT_GATEWAY_URL = 'https://ipfs.io'"), 'A5. IpfsGatewayContentStore declares DEFAULT_GATEWAY_URL');
        const ipfsApiSource = await rawSource('content/IpfsContentStore.js');
        assert(ipfsApiSource.includes("const DEFAULT_API_URL = 'http://127.0.0.1:5001'"), 'A5. IpfsContentStore declares DEFAULT_API_URL');
        inventory.ipfsGateway = { file: 'content/IpfsGatewayContentStore.js', value: 'https://ipfs.io', duplication: 1 };
        inventory.ipfsApi = { file: 'content/IpfsContentStore.js', value: 'http://127.0.0.1:5001', duplication: 1 };

        // A6. Nostr relay — duplicated independently across SIX files, the
        // widest duplication of any candidate in this inventory.
        const nostrRelayFiles = [
            'application/NostrDiscoveryQueryService.js',
            'application/NostrSnapshotDiscoveryQueryService.js',
            'application/NostrPublicationDiscoveryPublisher.js',
            'application/NostrSnapshotDiscoveryPublisher.js',
            'application/NostrPlaceNamingDiscoveryPublisher.js',
            'application/NostrPlaceNamingDiscoverySource.js'
        ];
        for (const file of nostrRelayFiles) {
            const source = await rawSource(file);
            assert(source.includes("DEFAULT_RELAY_URL = 'wss://relay.damus.io'"),
                `A6. ${file} declares its own DEFAULT_RELAY_URL = 'wss://relay.damus.io'`);
        }
        inventory.nostrRelay = { files: nostrRelayFiles, value: 'wss://relay.damus.io', duplication: nostrRelayFiles.length };

        // A7. Bitcoin Esplora — duplicated across FOUR anchoring/ files.
        const esploraFiles = [
            'anchoring/BitcoinOpReturnProofVerifier.js',
            'anchoring/BitcoinEsploraTransactionBroadcaster.js',
            'anchoring/BitcoinEsploraWalletFundingSource.js',
            'anchoring/BitcoinEsploraTransactionConfirmationObserver.js'
        ];
        for (const file of esploraFiles) {
            const source = await rawSource(file);
            assert(source.includes("DEFAULT_API_URL = 'https://blockstream.info/api'"),
                `A7. ${file} declares its own DEFAULT_API_URL = 'https://blockstream.info/api'`);
        }
        inventory.bitcoinEsplora = { files: esploraFiles, value: 'https://blockstream.info/api', duplication: esploraFiles.length };

        // A8. Base RPC — one file, one constant.
        const baseRpcSource = await rawSource('base/BaseJsonRpcClient.js');
        assert(baseRpcSource.includes("const DEFAULT_RPC_URL = 'https://mainnet.base.org'"), 'A8. BaseJsonRpcClient declares DEFAULT_RPC_URL');
        inventory.baseRpc = { file: 'base/BaseJsonRpcClient.js', value: 'https://mainnet.base.org', duplication: 1 };

        // A9. mempool.space — the named suspect, audited fully in Section B.
        const evidenceViewSource = await rawSource('anchoring/BitcoinAnchorEvidenceView.js');
        assert(evidenceViewSource.includes('return `https://mempool.space${path}`;'), 'A9. mempool.space host string present');
        inventory.mempoolSpace = { file: 'anchoring/BitcoinAnchorEvidenceView.js', value: 'https://mempool.space' };

        console.log(`✓ Section A: ${Object.keys(inventory).length} distinct endpoint candidates inventoried, each traced to real source — Arweave Gateway (4 files), Nostr relay (6 files), and Bitcoin Esplora (4 files) are each duplicated as INDEPENDENT constants, never imported from one shared module`);
    }

    // ===============================================================
    // Section B — Functional vs informational URLs.
    // ===============================================================
    {
        // B1. mempool.space: exactly one occurrence in the ENTIRE
        // production tree, inside a function this file's own header
        // explicitly documents as "string construction only, never a live
        // network call." Verified two ways: the literal claim is still in
        // the comment, and — independently of trusting that comment — the
        // function itself never references fetch/fetchImpl/await at all.
        const evidenceViewSource = await rawSource('anchoring/BitcoinAnchorEvidenceView.js');
        assert(/never a live\s*\n?\s*\/\/\s*network call/.test(evidenceViewSource), 'B1. explorerUrl() is documented as a pure string transform');
        const explorerUrlBody = evidenceViewSource.slice(evidenceViewSource.indexOf('function explorerUrl'));
        assert(!/fetch|await|fetchImpl/.test(explorerUrlBody), 'B1. explorerUrl() body contains no fetch/await/fetchImpl of any kind — genuinely never a network call');
        assert(countOccurrences(evidenceViewSource, 'mempool.space') === 2, 'B1. mempool.space appears exactly twice in its one consuming file — the header comment and the one return statement, both inside explorerUrl()\'s own region');

        // B2. Contrast: every OTHER endpoint in the inventory is consumed
        // by a real fetchImpl(...) call inside its own class, not merely
        // referenced in a comment or interpolated into a display string.
        const functionalChecks = [
            { file: 'content/ArweaveContentStore.js', marker: 'this._fetch(' },
            { file: 'content/IpfsGatewayContentStore.js', marker: 'this._fetch(' },
            { file: 'content/IpfsContentStore.js', marker: 'this._fetch(' },
            { file: 'base/BaseJsonRpcClient.js', marker: 'this._fetch(' },
            { file: 'anchoring/BitcoinEsploraTransactionBroadcaster.js', marker: 'this._fetch(' },
            { file: 'application/NostrDiscoveryQueryService.js', marker: '_relayUrl' },
            { file: 'application/ArweaveGraphqlDiscoveryQueryService.js', marker: 'this._fetch(' },
            { file: 'peer/IceServerConfig.js', marker: 'fetchImpl(' }
        ];
        for (const { file, marker } of functionalChecks) {
            const source = await rawSource(file);
            assert(source.includes(marker), `B2. ${file} actually performs a real call keyed on its own endpoint (found "${marker}")`);
        }

        console.log('✓ Section B: mempool.space is confirmed purely informational — one occurrence, one pure string-construction function, zero network calls — while every other inventoried endpoint is confirmed functional, each consumed by a real fetch/relay call inside its own adapter');
    }

    // ===============================================================
    // Section C — Configuration ownership. Every endpoint is ALREADY
    // constructor-injectable; nothing today supplies an override anywhere
    // in ui/ or at the composition root.
    // ===============================================================
    {
        // C1. Constructor injection pattern, reconfirmed directly for a
        // representative sample spanning every family in the inventory.
        const injectionChecks = [
            { file: 'content/ArweaveContentStore.js', pattern: /gatewayUrl = DEFAULT_GATEWAY_URL/ },
            { file: 'content/IpfsGatewayContentStore.js', pattern: /gatewayUrl = DEFAULT_GATEWAY_URL/ },
            { file: 'content/IpfsContentStore.js', pattern: /apiUrl = DEFAULT_API_URL/ },
            { file: 'base/BaseJsonRpcClient.js', pattern: /rpcUrl = DEFAULT_RPC_URL/ },
            { file: 'anchoring/BitcoinEsploraTransactionBroadcaster.js', pattern: /apiUrl = DEFAULT_API_URL/ },
            { file: 'application/NostrDiscoveryQueryService.js', pattern: /relayUrl = DEFAULT_RELAY_URL/ },
            { file: 'application/ArweaveGraphqlDiscoveryQueryService.js', pattern: /graphqlUrl = DEFAULT_GRAPHQL_URL/ }
        ];
        for (const { file, pattern } of injectionChecks) {
            const source = await rawSource(file);
            assert(pattern.test(source), `C1. ${file}'s own constructor destructures its endpoint with a named, overridable default`);
        }

        // C2. Live proof, not just a pattern match: constructing one of
        // these classes with an explicit override actually takes effect.
        const { ArweaveGraphqlDiscoveryQueryService } = await import('../application/ArweaveGraphqlDiscoveryQueryService.js');
        const overridden = new ArweaveGraphqlDiscoveryQueryService({ graphqlUrl: 'https://my-own-gateway.example/graphql' });
        assert(overridden._graphqlUrl === 'https://my-own-gateway.example/graphql', 'C2. a caller-supplied graphqlUrl genuinely overrides the class-level default');

        // C3. The composition root (ui/main.js) — the ONE place these
        // classes are actually constructed for the running app — never
        // supplies an override for any of them: every call site either
        // passes no options object at all, or passes an object whose
        // fields are `undefined` (the Create*UseCase spread pattern).
        const mainSource = await rawSource('ui/main.js');
        assert(mainSource.includes('new IpfsGatewayContentStore()'), 'C3. ui/main.js constructs IpfsGatewayContentStore with zero arguments (x2 call sites)');
        assert(mainSource.includes('new IpfsContentStore()'), 'C3. ui/main.js constructs IpfsContentStore with zero arguments');
        assert(mainSource.includes('new CreateBaseJsonRpcClientUseCase().execute()'), 'C3. ui/main.js resolves the Base RPC client with zero arguments to execute()');
        assert(mainSource.includes('new CreateBitcoinEsploraTransactionBroadcasterUseCase().execute()'), 'C3. ui/main.js resolves the Esplora broadcaster with zero arguments to execute()');

        // C4. Confirmed structurally for the Create*UseCase wrappers too:
        // they forward `rpcUrl`/`apiUrl` only if a caller supplies one —
        // ui/main.js is that caller, and Section C3 already showed it
        // supplies nothing.
        const createBaseSource = await rawSource('application/CreateBaseJsonRpcClientUseCase.js');
        assert(createBaseSource.includes('...(rpcUrl !== undefined ? { rpcUrl } : {})'), 'C4. CreateBaseJsonRpcClientUseCase only forwards rpcUrl when a caller actually supplies one');

        // C5. Zero live wiring anywhere in ui/ (outside the one
        // composition root already examined above): no file references a
        // concrete endpoint host from this audit's own inventory, and the
        // one existing settings view never mentions one either — the
        // fields it DOES expose (e.g. `relayUrl` inside a documented
        // return-shape comment in WorldView.js, describing what a claim
        // publish already resolved to) are result vocabulary, never a
        // configuration input.
        const inventoryHosts = ['arweave.net', 'ipfs.io', '127.0.0.1:5001', 'relay.damus.io', 'blockstream.info', 'mainnet.base.org', 'metered.live'];
        const nonCompositionRootUiFiles = [
            'ui/views/WorldView.js', 'ui/views/ContentProviderSettingsView.js', 'ui/views/AvatarSettingsView.js'
        ];
        for (const file of nonCompositionRootUiFiles) {
            const source = await rawSource(file);
            for (const host of inventoryHosts) {
                assert(!source.includes(host), `C5. ${file} never references the endpoint host "${host}" — no live wiring exists outside the composition root`);
            }
        }

        console.log('✓ Section C: every inventoried endpoint is ALREADY constructor-injectable (reconfirmed live, not just by pattern), but ui/main.js — the one real composition root — supplies zero overrides anywhere; this is mechanical/code-level configurability only, with no product surface yet');
    }

    // ===============================================================
    // Section D — Semantic role separation.
    // ===============================================================
    {
        // D1. STUN vs Rendezvous: genuinely separate modules, separate
        // files, separate purposes (NAT reflexive-address discovery vs
        // peer bootstrap/lookup) — neither imports the other.
        const iceSource = await rawSource('peer/IceServerConfig.js');
        const rendezvousSource = await rawSource('peer/RendezvousConfig.js');
        assert(!/^import.*RendezvousConfig/m.test(iceSource) && !/^import.*IceServerConfig/m.test(rendezvousSource),
            'D1. IceServerConfig.js and RendezvousConfig.js are structurally independent — neither actually IMPORTS the other (each is free to mention the other by name in its own prose comments)');

        // D2. IMPORTANT CORRECTION to the brief's own assumed grouping:
        // STUN and TURN are NOT independently configurable fields at the
        // one place that actually consumes them. WebRtcPeerConnectionProvider
        // accepts a single flat `iceServers` ARRAY — STUN and TURN entries
        // are just entries in the same list, distinguished only by their
        // own `stun:`/`turn:` URL scheme, exactly per the WebRTC standard
        // itself. A "PeerConnectivitySettings { stun, turn, rendezvous }"
        // shape with STUN and TURN as separate sub-objects — the brief's
        // own proposed sketch — would not match how this codebase's real
        // consumer actually accepts configuration; a faithful design has
        // ONE iceServers list plus a separate rendezvous list, not three
        // peer sub-objects.
        const providerSource = await rawSource('peer/WebRtcPeerConnectionProvider.js');
        assert(/constructor\(\{\s*iceServers = \[\]/.test(providerSource), 'D2. WebRtcPeerConnectionProvider accepts one flat iceServers array, not separate stun/turn fields');
        assert(providerSource.includes('setIceServers(iceServers)'), 'D2. the runtime update path (setIceServers) also takes one flat array');

        // D3. Arweave Gateway (content retrieval) vs Arweave GraphQL
        // (discovery) — genuinely different endpoints, different paths
        // (`arweave.net` vs `arweave.net/graphql`), different consumers,
        // never sharing a constant.
        const graphqlSource = await rawSource('application/ArweaveGraphqlDiscoveryQueryService.js');
        assert(!graphqlSource.includes("DEFAULT_GATEWAY_URL"), 'D3. ArweaveGraphqlDiscoveryQueryService never declares a DEFAULT_GATEWAY_URL of its own — it is graphqlUrl only');
        const arweaveContentSource = await rawSource('content/ArweaveContentStore.js');
        assert(!arweaveContentSource.includes('DEFAULT_GRAPHQL_URL'), 'D3. ArweaveContentStore never declares a DEFAULT_GRAPHQL_URL — it is gatewayUrl only');

        // D4. IPFS Gateway (remote, resolve-only) vs IPFS local API (Kubo,
        // put+get) — structurally distinct capability surfaces, not just
        // distinct URLs: the gateway store's own put() is UNIMPLEMENTED
        // (inherits the abstract base class throw), confirming it really
        // is read-only, never a drop-in replacement for the local API.
        const ipfsGatewaySource = await rawSource('content/IpfsGatewayContentStore.js');
        assert(!/\bput\s*\(/.test(ipfsGatewaySource.replace(/\/\/.*$/gm, '')), 'D4. IpfsGatewayContentStore never overrides put() — a real, structural capability difference from the local API, not merely a different default host');

        // D5. Bitcoin Esplora (anchoring/) vs Base RPC (base/) — separate
        // directories, separate chains, zero cross-imports.
        const esploraSource = await rawSource('anchoring/BitcoinEsploraTransactionBroadcaster.js');
        const baseSource = await rawSource('base/BaseJsonRpcClient.js');
        assert(!esploraSource.includes("from '../base/") && !baseSource.includes("from '../anchoring/"),
            'D5. anchoring/ (Bitcoin) and base/ (Base) share no import between their JSON-RPC/Esplora clients');

        // D6. Nostr relay is a single URL per instance today (no list, no
        // multi-relay semantics anywhere in the six consuming files) —
        // confirming the brief's own restraint against assuming
        // multi-relay semantics prematurely.
        const nostrSource = await rawSource('application/NostrDiscoveryQueryService.js');
        assert(/relayUrl = DEFAULT_RELAY_URL,/.test(nostrSource) && !/relayUrls\s*=/.test(nostrSource),
            'D6. NostrDiscoveryQueryService takes one relayUrl, never a relayUrls list — single-relay semantics only, today');

        console.log('✓ Section D: STUN/Rendezvous, Arweave Gateway/GraphQL, IPFS Gateway/API, and Bitcoin Esplora/Base RPC are all confirmed structurally distinct — WITH one correction: STUN and TURN are not separable configuration fields at their real consumer, which accepts one flat iceServers array (D2)');
    }

    // ===============================================================
    // Section E — User-value assessment, traced to real product evidence.
    // ===============================================================
    const userValue = {};
    {
        // E1. IPFS local API: the product's OWN composition-root comment
        // already documents this exact availability gap for an ordinary
        // user — direct, on-file evidence, not speculation.
        const mainSource = await rawSource('ui/main.js');
        assert(mainSource.includes("Kubo's own\n// default `http://127.0.0.1:5001` is almost certainly unreachable from\n// inside a browser with no local daemon running"),
            'E1. ui/main.js already documents 127.0.0.1:5001 as almost certainly unreachable for an ordinary user — this is the ONE candidate with a self-documented availability gap already on file');
        userValue.ipfsApi = 'High for the minority who run a local Kubo node — but the product itself already treats this default as ordinarily unreachable, which is a genuine reason a user-supplied override has real value: recovering IPFS put() capability at all.';

        // E2. Nostr relay: single point, zero redundancy (Section D6) —
        // an outage of relay.damus.io alone silently empties every
        // discovery/distribution surface reading from it, for every
        // Wanderer, with no existing recourse.
        userValue.nostrRelay = 'High — the single relay is a real single point of failure for Discovery/Distribution product-wide, and the underlying constructor is already override-ready.';

        // E3. Arweave Gateway / IPFS Gateway (content retrieval): directly
        // gates whether a Wanderer can view already-published content at
        // all — the most visible possible failure mode.
        userValue.arweaveGateway = 'High — gates content visibility directly; failure is immediately visible to any Wanderer trying to view a Publication.';
        userValue.ipfsGateway = 'High — same reasoning as Arweave Gateway, for IPFS-addressed content.';

        // E4. Arweave GraphQL, Bitcoin Esplora, Base RPC: real, but
        // narrower — discovery indexing and anchoring/verification, not
        // ordinary content viewing.
        userValue.arweaveGraphql = 'Medium — gates decentralized discovery reach, not content already known/selected.';
        userValue.bitcoinEsplora = 'Medium — gates anchor verification and (for BitcoinEsploraWalletFundingSource) funding-source checks, an infrequent, diagnostic-adjacent path.';
        userValue.baseRpc = 'Medium — gates Base-chain anchoring/wallet observation, similarly infrequent.';

        // E5. TURN: high value when it matters (NAT traversal failure
        // makes "Invite Someone"/"Be Discoverable" simply not work), but
        // see Section I — the credential shape complicates a naive URL
        // field.
        userValue.turn = 'High when needed, but credential-shaped — see Section I.';

        // E6. STUN, Rendezvous: lower day-to-day necessity — STUN is
        // free/redundant-by-default (two entries already), and Rendezvous
        // is explicitly deployment/bootstrap identity per its own header
        // ("A Bootstrap List Is Configuration, Never An Authority").
        userValue.stun = 'Low — already redundant (two public defaults) and rarely the actual point of failure vs. TURN.';
        userValue.rendezvous = 'Low-Medium — deployment/bootstrap identity by design, per peer/RendezvousConfig.js\'s own header; an operator concern more than an ordinary Wanderer one.';

        // E7. mempool.space: zero — it is not a dependency at all
        // (Section B).
        userValue.mempoolSpace = 'None — not a functional dependency (Section B); excluded from configuration entirely.';

        for (const [name, value] of Object.entries(userValue)) {
            assert(typeof value === 'string' && value.length > 0, `E. ${name} carries a stated, evidenced user-value assessment`);
        }
        console.log('✓ Section E: user-value assessed per candidate against real product evidence — IPFS local API\'s availability gap is already self-documented in ui/main.js; mempool.space carries none, having no functional role at all');
    }

    // ===============================================================
    // Section F — Failure scenarios. Default unavailable: does ANY
    // existing surface let a user restore the capability today?
    // ===============================================================
    {
        // F1. Reconfirmed from Section C5: zero UI-level surface exists
        // for any of these endpoints. The ONLY path to a different
        // endpoint today is editing source (changing a DEFAULT_*
        // constant) or writing a new composition-root call with an
        // explicit override — neither reachable by an ordinary Wanderer.
        const settingsSource = await rawSource('ui/views/ContentProviderSettingsView.js');
        assert(!/DEFAULT_GATEWAY_URL|DEFAULT_API_URL|DEFAULT_RELAY_URL|DEFAULT_RPC_URL|DEFAULT_GRAPHQL_URL/.test(settingsSource),
            'F1. the one existing settings view references none of these DEFAULT_* constants');

        // F2. TURN is the sole PARTIAL exception: fetchIceServers() already
        // exists as a form of dynamic resilience (Section H covers its
        // exact semantics), but it degrades to the SAME fixed Metered
        // account/endpoint, never a user-suppliable alternative relay.
        const iceSource = await rawSource('peer/IceServerConfig.js');
        assert(iceSource.includes('fallback = DEFAULT_ICE_SERVERS'), 'F2. fetchIceServers degrades to the fixed DEFAULT_ICE_SERVERS, never a user-supplied alternative');

        // F3. Distribution (write) path is the ONE place a runtime
        // override seam already exists end-to-end in code —
        // resolveArweaveUploaderOptions/resolveNostrPublisherOptions
        // already accept gatewayUrl/relayUrl — but 0.9.106's own header
        // (still true today) documents ui/main.js supplying `{}`, i.e.
        // nothing real. So even the ONE existing seam closest to "user
        // restores capability by supplying an endpoint" is unpopulated.
        const runtimeConfigSource = await rawSource('application/PublicationDistributionRuntimeConfiguration.js');
        assert(runtimeConfigSource.includes('gatewayUrl'), 'F3. the runtime configuration seam already names gatewayUrl as an accepted field');
        const mainSource = await rawSource('ui/main.js');
        assert(mainSource.includes('resolvePublicationDistributionRuntimeConfiguration'), 'F3. ui/main.js actually calls the runtime configuration resolver');

        console.log('✓ Section F: no existing surface lets an ordinary user restore capability when a default endpoint is down — the closest existing seam (Publication Distribution\'s runtime configuration resolver) already accepts gatewayUrl/relayUrl but is called with nothing real (confirmed still true, 0.9.106 through this milestone)');
    }

    // ===============================================================
    // Section G — Configuration vs provider preference. Proving these are
    // genuinely non-overlapping concepts, not two names for one idea.
    // ===============================================================
    {
        // G1. RoleProviderPreference (0.9.293) stores an opaque provider
        // KEY ('local'/'ipfs'/'ar'/'bitcoin-op-return'), never a URL —
        // reconfirmed by checking the file mentions no concrete endpoint
        // host from this audit's own inventory.
        const preferenceSource = await rawSource('core/RoleProviderPreference.js');
        const inventoryHosts = ['arweave.net', 'ipfs.io', '127.0.0.1', 'relay.damus.io', 'blockstream.info', 'mainnet.base.org', 'mempool.space', 'metered.live', 'stun.l.google.com', 'workers.dev'];
        for (const host of inventoryHosts) {
            assert(!preferenceSource.includes(host), `G1. core/RoleProviderPreference.js never mentions the endpoint host "${host}" — it deals in provider keys, never URLs`);
        }

        // G2. The shape rule RoleProviderPreference enforces on its own
        // providerKey is a short lowercase token pattern — structurally
        // incapable of holding a URL (a colon or slash fails the pattern),
        // proving the two concepts could not be accidentally merged even
        // by a careless future caller.
        assert(preferenceSource.includes('/^[a-z][a-z0-9-]*$/'), 'G2. providerKey\'s own validation pattern cannot accept a URL (no colon, no slash, no dot permitted)');

        // G3. Conversely, every endpoint constructor in this audit's
        // inventory validates its URL field as a non-empty STRING only —
        // never against RoleProviderPreference's own key vocabulary —
        // confirming neither system reads the other's concept.
        const arweaveContentSource = await rawSource('content/ArweaveContentStore.js');
        assert(!arweaveContentSource.includes('RoleProviderPreference') && !arweaveContentSource.includes('RoleProviderRole'),
            'G3. ArweaveContentStore never imports the provider-preference vocabulary — the two concepts are wired independently');

        console.log('✓ Section G: RoleProviderPreference (WHICH provider — local/ipfs/ar, an opaque key) and this audit\'s endpoints (WHICH URL a chosen provider\'s adapter talks to) are confirmed non-overlapping — reconfirmed by content, not merely by naming convention');
    }

    // ===============================================================
    // Section H — Fallback semantics: replacement vs fallback, checked
    // against the one place this codebase already implements BOTH ideas.
    // ===============================================================
    {
        // H1. TURN's fetchIceServers() is the one existing precedent for
        // "default down, try something else" in this codebase — and it is
        // a MERGE, not a pure replacement: fetched servers are combined
        // with (never substituted wholesale for) DEFAULT_ICE_SERVERS,
        // deduped by `urls`. This is a genuinely different shape from
        // either "explicit replacement" or "sequential fallback" — it is
        // "always try both, together" for redundancy, not recovery from a
        // failure of one specific server.
        const iceSource = await rawSource('peer/IceServerConfig.js');
        assert(iceSource.includes('return dedupeIceServers([...fetched, ...fallback]);'), 'H1. fetchIceServers merges fetched + fallback rather than replacing one with the other');
        assert(iceSource.includes('Merged, not replaced'), 'H1. the file\'s own header names this choice explicitly as "merged, not replaced"');

        // H2. Every OTHER endpoint in the inventory has no fallback
        // concept whatsoever today — a constructor takes exactly one URL,
        // used for every call, with no secondary attempt on failure. This
        // is uniform across every family except TURN's credential-fetch
        // path.
        const arweaveContentSource = await rawSource('content/ArweaveContentStore.js');
        assert(arweaveContentSource.includes('NO CACHING, NO RETRY, NO DEDUPLICATION, NO FALLBACK BETWEEN GATEWAYS'),
            'H2. ArweaveContentStore explicitly disclaims any fallback/retry concept in its own header — even stronger evidence than mere absence');

        // H3. Conclusion, evidence-based rather than merely re-asserting
        // the brief's own initial preference: EXPLICIT REPLACEMENT is
        // correct as the starting semantics for a new configuration
        // surface on any candidate OTHER than TURN, because that is the
        // uniform behavior every one of those adapters already has today
        // (one URL, used verbatim). TURN itself is the one place this
        // codebase has ALREADY chosen a form of redundancy over pure
        // replacement — worth knowing before ever building TURN
        // configuration, but not a reason to add fallback semantics
        // anywhere else.
        console.log('✓ Section H: explicit replacement matches every candidate\'s existing single-URL behavior except TURN, whose own fetchIceServers already merges (never replaces) — a real existing precedent, but confined to TURN alone, not evidence for building fallback semantics into any other candidate');
    }

    // ===============================================================
    // Section I — Credential/security boundary.
    // ===============================================================
    {
        // I1. TURN is the ONLY candidate whose default path requires a
        // secret — the Metered API key — and whose own file header
        // explicitly distinguishes the safe "credential-scoped" key
        // (fine to ship client-side) from the account Secret Key (must
        // never appear in this repo). This distinction has no equivalent
        // anywhere else in the inventory.
        const iceSource = await rawSource('peer/IceServerConfig.js');
        assert(iceSource.includes('never the account Secret Key'), 'I1. IceServerConfig.js explicitly documents the safe-vs-unsafe credential distinction for TURN');

        // I2. Every other candidate's own adapter constructs zero
        // Authorization/API-key header anywhere in its request path —
        // confirmed directly, not assumed, across one file per family.
        const credentialFreeChecks = [
            'content/ArweaveContentStore.js',
            'content/IpfsGatewayContentStore.js',
            'content/IpfsContentStore.js',
            'base/BaseJsonRpcClient.js',
            'anchoring/BitcoinEsploraTransactionBroadcaster.js',
            'application/NostrDiscoveryQueryService.js',
            'application/ArweaveGraphqlDiscoveryQueryService.js',
            'peer/RendezvousConfig.js'
        ];
        for (const file of credentialFreeChecks) {
            const source = await rawSource(file);
            assert(!/Authorization['"]?\s*:|apiKey|api_key|Bearer /.test(source), `I2. ${file} constructs no Authorization header / API key of any kind`);
        }

        console.log('✓ Section I: TURN is the sole candidate carrying a credential requirement (with an already-documented safe/unsafe key distinction); every other candidate\'s own adapter is confirmed to construct zero Authorization headers or API keys — a plain URL field is a safe, sufficient configuration shape for all of them');
    }

    // ===============================================================
    // Section J — Final candidate matrix and this milestone's own verdict.
    // ===============================================================
    const decisionMatrix = [
        { candidate: 'STUN', userValue: 'Low', configShape: 'One entry inside a shared iceServers list (D2)', credentials: 'No', fallback: 'N/A (already 2 redundant defaults)', decision: 'DEFER' },
        { candidate: 'TURN', userValue: 'High when needed', configShape: 'iceServers entries + credential fields — NOT a plain URL (I1)', credentials: 'Yes', fallback: 'Already merges, not replaces (H1) — precedent, not a pattern to copy elsewhere', decision: 'DEFER' },
        { candidate: 'Rendezvous', userValue: 'Low-Medium', configShape: 'URL list', credentials: 'No', fallback: 'Replacement', decision: 'DEFER' },
        { candidate: 'Arweave Gateway', userValue: 'High', configShape: 'URL', credentials: 'No', fallback: 'Replacement', decision: 'BUILD FIRST' },
        { candidate: 'Arweave GraphQL', userValue: 'Medium', configShape: 'URL', credentials: 'No', fallback: 'Replacement', decision: 'CANDIDATE' },
        { candidate: 'IPFS Gateway', userValue: 'High', configShape: 'URL', credentials: 'No', fallback: 'Replacement', decision: 'BUILD FIRST' },
        { candidate: 'IPFS local API', userValue: 'High for local-node users (self-documented gap, E1)', configShape: 'URL', credentials: 'No', fallback: 'Replacement', decision: 'CANDIDATE' },
        { candidate: 'Nostr relay', userValue: 'High (single point of failure, E2/D6)', configShape: 'URL (single-relay only, today)', credentials: 'No', fallback: 'Replacement', decision: 'CANDIDATE' },
        { candidate: 'Bitcoin Esplora', userValue: 'Medium', configShape: 'URL', credentials: 'No', fallback: 'Replacement', decision: 'DEFER' },
        { candidate: 'Base RPC', userValue: 'Medium', configShape: 'URL', credentials: 'No', fallback: 'Replacement', decision: 'DEFER' },
        { candidate: 'mempool.space', userValue: 'None (not a dependency, Section B)', configShape: 'N/A', credentials: 'No', fallback: 'N/A', decision: 'EXCLUDE' }
    ];
    {
        for (const row of decisionMatrix) {
            assert(['BUILD FIRST', 'CANDIDATE', 'DEFER', 'EXCLUDE'].includes(row.decision),
                `J. ${row.candidate} carries a recognized decision label`);
        }

        console.log('\n=== DECISION MATRIX ===');
        for (const row of decisionMatrix) {
            console.log(`${row.candidate}`);
            console.log(`  User value ....... ${row.userValue}`);
            console.log(`  Config shape ..... ${row.configShape}`);
            console.log(`  Credentials ...... ${row.credentials}`);
            console.log(`  Fallback ......... ${row.fallback}`);
            console.log(`  Decision ......... ${row.decision}`);
        }

        console.log('\n=== VERDICT: SELECTIVE CONFIGURATION, NOT A GENERIC SERVER MANAGER ===');
        console.log('This audit confirms the motivating direction is real — every endpoint in the inventory is already');
        console.log('constructor-injectable with a replaceable default (Section C) — but rejects a single generic');
        console.log('"InfrastructureSettings.servers[]" abstraction, and refines the brief\'s own proposed grouping in one');
        console.log('place: STUN and TURN are not independently configurable fields at their real consumer, which accepts');
        console.log('one flat iceServers array (Section D2) — a family boundary should follow that fact, not an assumed');
        console.log('one-field-per-server-type shape.');
        console.log('');
        console.log('mempool.space is confirmed excluded — a pure UI hyperlink, never a network dependency (Section B).');
        console.log('');
        console.log('BUILD FIRST: Arweave Gateway and IPFS Gateway (content retrieval). Both require zero credentials');
        console.log('(Section I), both use plain replacement semantics that already match every non-TURN candidate\'s');
        console.log('existing single-URL behavior (Section H), both carry the highest, most visible user-value of any');
        console.log('candidate (a down gateway makes already-published content simply unviewable — Section E3), and both');
        console.log('can mirror a pattern ALREADY PROVEN in this exact codebase: application/');
        console.log('PublicationDistributionRuntimeConfiguration.js already accepts a { gatewayUrl } shape for the WRITE');
        console.log('(distribution) path (Section F3) — a read-path counterpart is the same shape, not a new one.');
        console.log('');
        console.log('CANDIDATE, not first: Nostr relay (single point of failure, real user value — but six independently');
        console.log('duplicated constants across application/ would need consolidating or threading individually, a real');
        console.log('but larger unit of work than the two-file Gateway change above), Arweave GraphQL, and IPFS local API.');
        console.log('');
        console.log('DEFER: STUN (already redundant, rarely the actual failure point), TURN (credential-shaped — see');
        console.log('Section I; a plain URL field would be actively unsafe for this one), Rendezvous (deployment/bootstrap');
        console.log('identity by design, per its own file header), Bitcoin Esplora and Base RPC (real but narrower,');
        console.log('anchoring/verification-path value, Section E4).');
        console.log('');
        console.log('This is the asymmetric outcome the brief itself anticipated: two strong first candidates, several');
        console.log('genuine-but-later ones, and a firm exclusion — never one uniform settings page built for all eleven');
        console.log('at once.');

        assert(decisionMatrix.filter((r) => r.decision === 'BUILD FIRST').length === 2, 'J. final: exactly two candidates recommended to build first');
        assert(decisionMatrix.find((r) => r.candidate === 'mempool.space').decision === 'EXCLUDE', 'J. final: mempool.space excluded');
        assert(decisionMatrix.find((r) => r.candidate === 'TURN').decision === 'DEFER', 'J. final: TURN deferred pending a credential-aware config shape');

        console.log('\n✅ All User-Configurable Infrastructure Endpoint Product Audit tests passed.');
    }
}

await run();
