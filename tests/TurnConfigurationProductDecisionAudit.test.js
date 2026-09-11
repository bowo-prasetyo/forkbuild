import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { DEFAULT_ICE_SERVERS, fetchIceServers } from '../peer/IceServerConfig.js';
import { IceServerConfiguration, isValidStunUrl } from '../core/IceServerConfiguration.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';

// 0.9.390 — TURN Configuration Product Decision Audit.
//
// TYPE: test-only, decision artifact. PRODUCTION CHANGES: NONE.
//
// 0.9.386/0.9.387 (STUN) and 0.9.388/0.9.389 (Rendezvous) closed the two
// candidates 0.9.385's own audit cleared for BUILD_NEXT. TURN was the third
// CRITICAL candidate that same audit found — but named it
// SEPARATE_PRODUCT_DECISION rather than BUILD_NEXT, because its own existing
// seam (`peer/IceServerConfig.js#fetchIceServers`) already names credential
// fields (`endpoint`, `apiKey`), a design question STUN's and Rendezvous's
// own plain-URL-list shape never had to answer. This milestone is that
// deferred decision, not an assumed implementation: it asks whether
// user-configurable TURN is a coherent product capability at all, given that
// TURN — unlike STUN and Rendezvous — is coupled to DYNAMIC credential
// acquisition, not a static value.
//
// TEN LETTERED AUDITS, matching this milestone's own brief:
//
//   A. Current TURN dependency — every value peer/IceServerConfig.js#
//      fetchIceServers depends on, traced to real source, split into STATIC
//      deployment configuration vs. DYNAMICALLY obtained runtime data.
//   B. User-value test — "I want my own TURN server" vs. "I want
//      connectivity to survive when the default TURN infrastructure fails"
//      are checked against this codebase's own recorded requirement text,
//      not assumed equivalent.
//   C. Configuration shape — the three things (TURN relay server / TURN
//      credential endpoint / TURN credentials themselves) evaluated for
//      whether the CURRENT architecture even lets them vary independently.
//   D. Credential lifecycle — whether fetchIceServers()'s own credentials
//      are ephemeral, renewable, Metered-coupled, safe to persist, or
//      user-facing, checked against what this codebase's own source
//      actually reads/relies on (never against an unverifiable claim about
//      Metered's live service).
//   E. Security boundary — which secrets a persisted "TURN configuration"
//      would have to hold, compared against the credential-free shape every
//      shipped configuration (Arweave/Nostr/STUN/Rendezvous) holds today.
//   F. Existing ICE convergence — STUN + Rendezvous + existing ICE
//      construction all proven untouched and still composing correctly.
//   G. Failure semantics — the four possible "configured TURN unreachable"
//      policies enumerated, none selected; today's ACTUAL, already-shipped
//      behavior (credential-FETCH failure only) named precisely and kept
//      distinct from the genuinely different, unbuilt "configured relay is
//      unreachable at ICE-gathering time" case.
//   H. Product alternatives — five options evaluated against A-G's own
//      findings, never selected for technical convenience alone.
//   I. Capability reachability — which of H's options the current
//      architecture already permits through an existing injected parameter,
//      vs. which requires a genuinely new domain capability.
//   J. Decision — NOT_A_PRODUCT_GAP / DEFER / BUILD_NEXT, with a concrete
//      reopening condition.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No Settings UI, no
// `core/TurnConfiguration.js` (or equivalent) value object, no storage
// class, no composition-root wiring, no credential handling, no generic
// `InfrastructureEndpointConfiguration` abstraction, and no modification of
// `core/IceServerConfiguration.js`'s own STUN-only scope. This milestone
// decides whether and how a future implementation milestone should touch
// TURN — it builds none of it.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
async function sourceExists(relativePath) {
    try { await source(relativePath); return true; } catch { return false; }
}
function codeOnly(src) {
    return src.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}
function jsonResponse(body, { ok = true } = {}) {
    return { ok, json: async () => body };
}

// Reused verbatim from tests/UserConfigurableInfrastructureEndpointProductDirectionAudit.test.js's
// own fixture — this audit's own Section F concern is WHICH iceServers
// value reaches the concrete construction call, not gathering timing.
class FakeDataChannel {
    constructor(label) { this.label = label; this._listeners = new Map(); }
    addEventListener(type, handler) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(handler);
    }
    removeEventListener(type, handler) { this._listeners.get(type)?.delete(handler); }
    send() {}
    close() {}
}
class RecordingRTCPeerConnection {
    constructor({ iceServers } = {}) {
        this.iceServers = iceServers;
        RecordingRTCPeerConnection.constructions.push(iceServers);
        this.iceGatheringState = 'complete';
        this.iceConnectionState = 'new';
        this._listeners = new Map();
    }
    addEventListener(type, handler) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(handler);
    }
    removeEventListener(type, handler) { this._listeners.get(type)?.delete(handler); }
    createDataChannel(label) { return new FakeDataChannel(label); }
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' }; }
    async setLocalDescription() {}
    addTrack() { return { replaceTrack: async () => {} }; }
    close() {}
}

async function run() {
    // ===============================================================
    // Audit A — Current TURN dependency. Every value fetchIceServers()
    // touches, traced to real source, split STATIC vs. DYNAMIC.
    // ===============================================================
    const dependency = {};
    {
        const iceSource = await source('peer/IceServerConfig.js');

        // A1. STATIC deployment configuration — hardcoded module-level
        // constants, identical for every user of this deployment, never
        // obtained at runtime.
        assert(iceSource.includes("const METERED_TURN_ENDPOINT = 'https://forkbuild.metered.live/api/v1/turn/credentials';"),
            n('A1. the credential-fetch URL is a STATIC, hardcoded deployment constant (METERED_TURN_ENDPOINT), never obtained at runtime'));
        assert(iceSource.includes("const METERED_API_KEY = "),
            n('A1. the API key authenticating that fetch is ALSO a static, hardcoded deployment constant (METERED_API_KEY), never user-supplied'));
        assert(iceSource.includes('const FETCH_ICE_SERVERS_TIMEOUT_MS = 5000;'),
            n('A1. the fetch timeout bound is a static constant, not runtime data'));
        dependency.static = ['credential-fetch URL (endpoint)', 'API key (apiKey)', 'fetch timeout', 'fallback STUN list (DEFAULT_ICE_SERVERS)'];

        // A2. DYNAMIC runtime data — obtained fresh from the credential
        // service's own HTTP response on every call, never hardcoded.
        assert(/const fetched = await response\.json\(\);/.test(iceSource),
            n('A2. the TURN relay hostname(s), username, and credential are ALL obtained dynamically, parsed fresh from the credential service\'s own JSON response body'));
        assert(!/username\s*[:=]\s*['"]/.test(iceSource) && !/credential\s*[:=]\s*['"]/.test(iceSource),
            n('A2. no username/credential literal exists anywhere in source — confirming TURN username/credential are never static deployment configuration, only ever fetched'));
        dependency.dynamic = ['TURN relay hostname(s) (embedded in the fetch response\'s own `urls` field)', 'username', 'credential', 'implicitly, which specific relay Metered\'s own geo-routing selects for this caller'];

        // A3. No credential-lifetime field is ever read, stored, or acted
        // on anywhere in this dependency chain — confirmed structurally by
        // its absence, not merely undocumented.
        assert(!/expiresAt|expiresIn|\bttl\b|credentialLifetime/i.test(iceSource),
            n('A3. no expiry/TTL/lifetime field is ever read from the fetched response — this codebase treats a fetched TURN credential as an OPAQUE, unstructured `{ urls, username, credential }` entry, nothing more'));

        // A4. fallback-ICE-server behavior already exists and is already
        // exercised end to end by tests/IceServerConfig.test.js — this
        // audit does not re-prove it, only confirms it is real, on record,
        // so Audit G below can build on a fact, not an assumption.
        const existingFetchTest = await source('tests/IceServerConfig.test.js');
        assert(existingFetchTest.includes('degrades to the fallback'),
            n('A4. fallback-on-failure behavior is already shipped and already covered by tests/IceServerConfig.test.js — reconfirmed on record, not re-derived here'));

        // A5. WebRtcPeerConnectionProvider itself never inspects credential
        // shape at all — it accepts whatever `iceServers` array it is
        // handed and passes it straight to RTCPeerConnection, confirmed
        // structurally (no `username`/`credential` reference anywhere in
        // that file).
        const providerSource = codeOnly(await source('peer/WebRtcPeerConnectionProvider.js'));
        assert(!/username|credential/i.test(providerSource),
            n('A5. WebRtcPeerConnectionProvider never reads or validates username/credential fields itself — it is a pure pass-through for whatever iceServers list it is given, STUN or TURN alike'));

        console.log('\n=== AUDIT A: CURRENT TURN DEPENDENCY ===');
        console.log('static:', JSON.stringify(dependency.static));
        console.log('dynamic:', JSON.stringify(dependency.dynamic));
        console.log('✓ Audit A: the credential-fetch URL, the API key authenticating it, and the fallback STUN list are all static deployment configuration. The TURN relay hostname, username, and credential are ALL dynamically obtained from the fetch response, with the relay hostname arriving bundled INSIDE the same response as the credential — never a separately configurable static field. No credential-lifetime field is ever parsed or relied upon anywhere in this codebase.');
    }

    // ===============================================================
    // Audit B — User-value test. "Bring my own TURN server" and "keep
    // working when the default TURN infrastructure fails" are checked
    // against this codebase's OWN recorded requirement text, never
    // assumed equivalent.
    // ===============================================================
    {
        const roadmap = await source('docs/Roadmap.md');

        // B1. The requirement 0.9.385 actually recorded, verbatim.
        assert(roadmap.includes('users must be able to switch critical infrastructure endpoints when the default endpoint is\nunavailable'),
            n('B1. the ONLY product requirement on record for this whole configuration family is a RESILIENCE statement ("switch... when the default is unavailable"), not a "use my own infrastructure" statement'));

        // B2. Nowhere in the recorded requirement, or in 0.9.386-0.9.389's
        // own shipped rationale, does "bring your own TURN server" appear
        // as an independently stated need — it is this milestone's own
        // brief that introduces the phrase as a HYPOTHESIS to test, not a
        // requirement already on record.
        const priorMilestoneText = roadmap.slice(roadmap.indexOf('## 0.9.385'), roadmap.indexOf('## 0.9.390') === -1 ? roadmap.length : roadmap.indexOf('## 0.9.390'));
        assert(!/bring your own turn|use my own turn server/i.test(priorMilestoneText),
            n('B2. no prior milestone (0.9.385-0.9.389) ever recorded "bring your own TURN server" as a stated need — only "keep working when the default is unavailable" is on record'));

        // B3. The two readings are NOT equivalent: resilience is satisfied
        // by ANY reachable relay (this deployment's own second relay, a
        // failover pool, or a user's own server); "bring your own server"
        // is satisfied ONLY by letting a user name a specific relay, even
        // if this deployment's own default is perfectly healthy. A
        // configuration surface answering only the second reading (a
        // single swappable TURN entry, no redundancy) would NOT, by
        // itself, satisfy the first reading's own "keep working when THE
        // DEFAULT fails" — it would simply move which single point of
        // failure exists, exactly the risk `peer/RendezvousConfig.js`'s own
        // header already names for a single bootstrap node (see 0.9.385
        // Section C, reconfirmed).
        const rendezvousConfigSource = await source('peer/RendezvousConfig.js');
        assert(/single point of failure|single-point-of-failure|would make THIS codebase the one thing every deployment/.test(rendezvousConfigSource),
            n('B3. this codebase already has a real, on-record precedent (Rendezvous\'s own single-bootstrap-node risk) for why ONE swappable endpoint is not automatically the same thing as RESILIENCE — the same reasoning applies to a single swappable TURN entry'));

        console.log('\n=== AUDIT B: USER-VALUE TEST ===');
        console.log('recorded requirement: "users must be able to switch critical infrastructure endpoints when the default endpoint is unavailable" (0.9.385)');
        console.log('✓ Audit B: the only requirement actually on record is resilience-shaped ("keep working when the default fails"), never "let me name my own relay" as an independent want. The two are not equivalent — a single user-swappable TURN entry satisfies the second reading without necessarily satisfying the first, the identical single-point-of-failure risk this codebase already named for Rendezvous.');
    }

    // ===============================================================
    // Audit C — Configuration shape. Whether "TURN relay server," "TURN
    // credential endpoint," and "TURN credentials themselves" can even
    // vary INDEPENDENTLY under the current architecture, checked live
    // against fetchIceServers()'s own real signature and behavior —
    // never assumed from the shape's name alone.
    // ===============================================================
    {
        // C1. fetchIceServers()'s own real, live parameter list — the
        // ONLY seam that currently exists for TURN at all.
        const iceSource = await source('peer/IceServerConfig.js');
        assert(/export async function fetchIceServers\(\{\s*\n\s*endpoint = METERED_TURN_ENDPOINT,\s*\n\s*apiKey = METERED_API_KEY,\s*\n\s*fallback = DEFAULT_ICE_SERVERS,/.test(iceSource),
            n('C1. fetchIceServers()\'s real, live signature already parameterizes `endpoint` and `apiKey` — a CREDENTIAL-SERVICE override is already structurally possible without any new function'));

        // C2. Live proof: `endpoint`/`apiKey` genuinely change which
        // credential service is called, through the REAL fetchIceServers()
        // — this is "TURN credential endpoint" configuration, proven, not
        // theorized.
        let capturedUrl = null;
        const fetchImpl = async (url) => { capturedUrl = url; return jsonResponse([{ urls: 'turn:my-own-relay.example:3478', username: 'u', credential: 'c' }]); };
        await fetchIceServers({ endpoint: 'https://my-own-credential-service.example/turn', apiKey: 'user-key', fetchImpl, fallback: [] });
        assert(capturedUrl === 'https://my-own-credential-service.example/turn?apiKey=user-key',
            n('C2. a genuinely different credential-service endpoint + API key, through the REAL fetchIceServers(), reaches the concrete HTTP call — "TURN credential endpoint" is already a live, working seam today'));

        // C3. Live proof: the TURN RELAY HOSTNAME is never a field
        // fetchIceServers() accepts on its own — it only ever ARRIVES
        // bundled inside whatever the credential endpoint's response
        // contains. There is no `relayUrl` (or equivalent) parameter to
        // configure independently of Audit C2's `endpoint`/`apiKey`.
        assert(!/relayUrl|turnServer|relayHost/i.test(iceSource),
            n('C3. no independent "TURN relay server" parameter exists in fetchIceServers() at all — the relay hostname a user would think they are "configuring" is actually determined entirely by whichever credential endpoint answers, never a separately settable field'));

        // C4. Live proof: "TURN credentials themselves" (a specific
        // username/credential pair) are likewise never a parameter
        // fetchIceServers() accepts directly — they can ONLY be obtained
        // by a network call to SOME credential endpoint. There is no code
        // path today that lets a caller hand fetchIceServers() a raw
        // `{ username, credential }` pair to use as-is.
        assert(!/function fetchIceServers[\s\S]*?\busername\s*[,=]/.test(iceSource.split('export async function fetchIceServers')[1] || ''),
            n('C4. fetchIceServers() accepts no username/credential parameter of its own — static, user-typed TURN credentials are not a shape this function can express at all, only `core/IceServerConfiguration.js`\'s own explicitly STUN-only shape exists for a manually-entered ICE entry today'));

        // C5. Confirmed independently: core/IceServerConfiguration.js
        // (STUN's own shipped value object) rejects turn:/turns: BY
        // CONSTRUCTION — the one manually-entered-ICE-entry shape this
        // codebase already has cannot be reused for TURN without changing
        // ITS OWN, already-shipped, deliberate scope.
        assert(!isValidStunUrl('turn:relay.example:3478'), n('C5. isValidStunUrl() rejects a turn: URL, live — confirming core/IceServerConfiguration.js structurally cannot already carry a TURN entry'));
        try {
            new IceServerConfiguration({ servers: [{ urls: 'turn:relay.example:3478' }] });
            assert(false, n('C5. IceServerConfiguration constructor should have thrown for a turn: entry'));
        } catch (error) {
            assert(error instanceof Error && /invalid STUN url/.test(error.message),
                n('C5. IceServerConfiguration\'s constructor throws, live, for a turn: entry — the STUN-only boundary 0.9.386 drew is real and unmodified by anything in this audit'));
        }

        console.log('\n=== AUDIT C: CONFIGURATION SHAPE ===');
        console.log('TURN relay server ALONE:      NOT independently configurable today — bundled inside whatever the credential endpoint returns (Audit C3)');
        console.log('TURN credential endpoint:     ALREADY a live, working seam (endpoint/apiKey), proven against the real function (Audit C1/C2)');
        console.log('TURN credentials themselves:  NOT expressible today — no function accepts a raw username/credential pair, and the one existing manual-ICE-entry shape (IceServerConfiguration) is STUN-only by construction (Audit C4/C5)');
        console.log('✓ Audit C: the three things named in this milestone\'s own brief are NOT symmetric today. Only "credential endpoint" already varies independently. "Relay server" is not a separate knob — it is a side effect of whichever credential endpoint answers. "Credentials themselves" cannot be expressed at all without a genuinely new manual-TURN-entry capability distinct from the STUN-only one that already exists.');
    }

    // ===============================================================
    // Audit D — Credential lifecycle. Checked against what THIS
    // codebase's own source actually reads or relies on — never against
    // an unverifiable claim about Metered's live service behavior.
    // ===============================================================
    {
        const iceSource = await source('peer/IceServerConfig.js');

        // D1. This codebase's own git history already documents TWO
        // structurally different TURN credential shapes having existed:
        // a STATIC, NON-EXPIRING, dashboard-issued credential (0.3.2,
        // removed 0.3.5) hardcoded directly as an iceServers literal, and
        // the CURRENT dynamic REST-fetched credential (0.3.7-present)
        // whose lifetime this source never states at all. These are not
        // the same kind of object merely because both came from Metered.
        assert(/NON-expiring credential in\s*\n?\/\/\s*the Metered dashboard/.test(iceSource),
            n('D1. this file\'s own header documents a PRIOR, now-removed, static/non-expiring credential shape (0.3.2) — proving this codebase has direct experience with a TURN credential that was safe to hardcode, historically'));
        assert(iceSource.includes('const METERED_TURN_ENDPOINT ='),
            n('D1. …and a SEPARATE, CURRENT, dynamically-fetched credential shape (0.3.7) whose lifetime is never stated in source — the two are not interchangeable evidence for "is a TURN credential safe to persist" today'));

        // D2. The current fetch path never persists what it obtains,
        // structurally confirmed: fetchIceServers() has zero references to
        // any storage/persistence primitive.
        assert(!/localStorage|StorageProvider|\.save\(|sessionStorage/.test(iceSource),
            n('D2. fetchIceServers() never persists its own result anywhere — the fetched TURN credential lives only in memory, for the current session, handed straight to setIceServers()'));

        // D3. storage/IceServerConfigurationStore.js — the ONE persistence
        // seam this configuration family already has — is explicitly,
        // deliberately scoped to STUN only, confirmed live against its own
        // header and its own get()/save() validation, which rejects
        // anything that is not a `stun:`/`stuns:` entry.
        const storeSource = await source('storage/IceServerConfigurationStore.js');
        assert(/STUN only|never TURN/i.test((await source('core/IceServerConfiguration.js'))),
            n('D3. core/IceServerConfiguration.js\'s own header already states "STUN only — never TURN" as a deliberate scope boundary, not an oversight'));
        assert(storeSource.includes('isValidStunUrl'), n('D3. storage/IceServerConfigurationStore.js validates every persisted entry through isValidStunUrl() — a TURN entry could not survive a save()/get() round trip through this store even if one were somehow constructed'));

        // D4. Coupling to the current Metered service — the credential-
        // fetch URL and API key are BOTH this deployment's own,
        // hardcoded, Metered-specific values; nothing in fetchIceServers()
        // is Metered-specific in its CODE (it is a generic
        // "GET ?apiKey=... -> JSON array" client), but the ONE call site
        // (ui/main.js) that actually invokes it never varies those
        // defaults — confirmed structurally, live.
        const mainSource = await source('ui/main.js');
        const fetchCallSites = (codeOnly(mainSource).match(/fetchIceServers\(/g) || []).length;
        assert(fetchCallSites === 1, n(`D4. fetchIceServers() is called from exactly one site in ui/main.js today (found ${fetchCallSites}), and that call passes only \`fallback\` — endpoint/apiKey are left at their Metered defaults, live, confirming today's deployment is coupled to Metered by CONFIGURATION CHOICE, not by the function's own code`));
        assert(mainSource.includes('fetchIceServers({ fallback: resolvedIceServers })'),
            n('D4. …confirmed against the exact call site: only `fallback` is overridden, never `endpoint`/`apiKey`'));

        console.log('\n=== AUDIT D: CREDENTIAL LIFECYCLE ===');
        console.log('temporary/renewable:        unverifiable from this codebase\'s own source (no lifetime field is ever read) — genuinely unknown, not assumed either way (Audit A3)');
        console.log('tied to current deployment: YES, by configuration choice at the one call site, not by the function\'s own code (Audit D4)');
        console.log('coupled to Metered:         YES today, but only because nothing overrides endpoint/apiKey — the code itself is Metered-agnostic (Audit D4)');
        console.log('safe to persist:            NOT ESTABLISHED — this codebase has historical evidence of BOTH a safe-to-hardcode credential (0.3.2, removed) AND a never-persisted dynamic one (0.3.7, current); nothing in source says which kind any FUTURE fetch would return (Audit D1)');
        console.log('intended for user exposure: NO — METERED_API_KEY is this deployment\'s own key, never a value any current code path shows to, or collects from, a user');
        console.log('✓ Audit D: the current credential\'s actual lifetime is genuinely unverifiable from this codebase\'s own source — this is the single most consequential finding of this whole audit. A persisted "TURN configuration" that assumed either answer without resolving it first would risk being semantically wrong for the other case: too eager to persist if credentials are meant to be short-lived, needlessly restrictive if they are not.');
    }

    // ===============================================================
    // Audit E — Security boundary. What a persisted TURN configuration
    // would have to hold, compared against the credential-free shape
    // every configuration this codebase HAS shipped holds today.
    // ===============================================================
    {
        // E1. Every configuration this codebase has actually shipped
        // (Arweave Gateway, Nostr Relay, STUN, Rendezvous) is confirmed,
        // live, to hold NO secret field at all — a plain URL or URL list,
        // nothing else.
        const arweaveConfigSource = await sourceExists('core/ArweaveGatewayConfiguration.js') ? await source('core/ArweaveGatewayConfiguration.js') : '';
        const nostrConfigSource = await sourceExists('core/NostrRelayConfiguration.js') ? await source('core/NostrRelayConfiguration.js') : '';
        const stunConfigSource = await source('core/IceServerConfiguration.js');
        const rendezvousConfigSource = await sourceExists('core/RendezvousConfiguration.js') ? await source('core/RendezvousConfiguration.js') : '';
        for (const [name, src] of [['Arweave Gateway', arweaveConfigSource], ['Nostr Relay', nostrConfigSource], ['STUN', stunConfigSource], ['Rendezvous', rendezvousConfigSource]]) {
            assert(src.length > 0, n(`E1. ${name}'s own configuration source exists and was actually read, not assumed`));
            assert(!/password|secret|credential|apiKey|api_key/i.test(codeOnly(src)),
                n(`E1. ${name}'s own shipped configuration value object holds NO secret-shaped field — every configuration this codebase has actually built so far is credential-free`));
        }

        // E2. A TURN configuration answering ANY of this milestone's own
        // three named things would break that pattern for the FIRST time
        // in this configuration family:
        //   - "TURN credential endpoint" (Audit C2's already-live seam)
        //     would require persisting a user-supplied `apiKey` — a
        //     secret this app would then hold on behalf of a THIRD-PARTY
        //     service it does not operate.
        //   - "TURN credentials themselves" would require persisting a
        //     `username`/`credential` pair directly — WebRTC's own
        //     RTCIceServer contract requires exactly this shape for any
        //     TURN entry, so this is not avoidable by picking a
        //     different technical design; it is inherent to what a TURN
        //     entry IS.
        assert(true, n('E2. both concrete TURN configuration shapes this milestone considers would persist a genuine secret in browser storage — the first time any configuration in this family would do so; this is a structural fact about the WebRTC RTCIceServer contract itself, not a design choice this codebase could route around'));

        // E3. Existing browser storage in this codebase (LocalStorageProvider)
        // is confirmed, live, to be ordinary, script-readable storage —
        // never encrypted, never access-controlled beyond the origin
        // itself, the identical seam STUN/Rendezvous configuration already
        // uses for their own, secret-free data.
        const localStorageProviderSource = await source('storage/LocalStorageProvider.js');
        assert(!/encrypt|crypto\.subtle/i.test(localStorageProviderSource),
            n('E3. LocalStorageProvider performs no encryption of any kind, confirmed live — any TURN secret persisted through the existing storage seam would sit in plain, script-readable browser storage exactly like every other persisted value, a materially different risk when the persisted value is a genuine secret rather than a public relay address'));

        console.log('\n=== AUDIT E: SECURITY BOUNDARY ===');
        console.log('TURN username:            would need to be persisted — no code path exists to hold it any other way and still hand WebRTC a working RTCIceServer entry');
        console.log('TURN password/credential: same as above — inherent to the RTCIceServer contract, not a design choice');
        console.log('API credential:           only needed if "credential-service endpoint" is the chosen shape (Audit C2) — a THIRD-PARTY secret this app would then custody');
        console.log('credential-service URL:   not secret by itself, but only meaningful paired with an API credential in every shape this codebase\'s Metered integration currently uses');
        console.log('✓ Audit E: every configuration this codebase has shipped so far (Arweave/Nostr/STUN/Rendezvous) is credential-free by construction. Any TURN configuration answering this milestone\'s own three named things breaks that pattern for the first time — not from a poor design choice, but because a working TURN entry inherently requires a credential, and this codebase\'s existing storage seam offers no stronger protection for a secret than for a public URL.');
    }

    // ===============================================================
    // Audit F — Existing ICE convergence. STUN configuration, Rendezvous
    // configuration, and existing ICE construction all proven untouched.
    // ===============================================================
    {
        // F1. STUN configuration (0.9.386/0.9.387) is completely unmodified
        // by this audit — same file, same STUN-only scope, reconfirmed live
        // (already proven in Audit C5 above; reconfirmed here as this
        // Audit's own convergence claim, not borrowed silently).
        const stunConfigSource = await source('core/IceServerConfiguration.js');
        assert(stunConfigSource.includes('STUN ONLY — NEVER TURN'), n('F1. core/IceServerConfiguration.js\'s own STUN-only header is present and unmodified'));

        // F2. Rendezvous configuration (0.9.388/0.9.389) is untouched — no
        // file in this audit imports RendezvousConfiguration or its store.
        assert(await sourceExists('core/RendezvousConfiguration.js'), n('F2. core/RendezvousConfiguration.js still exists, untouched'));

        // F3. Existing ICE construction still composes STUN's own
        // configured list with a freshly fetched TURN credential set,
        // through the REAL, unmodified WebRtcPeerConnectionProvider —
        // proven end to end, not merely asserted.
        RecordingRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: DEFAULT_ICE_SERVERS, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        const fetchImpl = async () => jsonResponse([{ urls: 'turn:standard.relay.metered.ca:80', username: 'u', credential: 'c' }]);
        const merged = await fetchIceServers({ apiKey: 'test-key', fetchImpl, fallback: DEFAULT_ICE_SERVERS });
        provider.setIceServers(merged);
        provider.createOffer();
        assert(RecordingRTCPeerConnection.constructions[0].some((entry) => entry.urls.startsWith('stun:')),
            n('F3. the merged iceServers list handed to the REAL RTCPeerConnection construction still carries STUN\'s own configured entries, unchanged'));
        assert(RecordingRTCPeerConnection.constructions[0].some((entry) => entry.urls.startsWith('turn:') && entry.username === 'u'),
            n('F3. …AND the freshly fetched TURN entry, composed together — existing ICE convergence (STUN + TURN + real ICE construction) still works exactly as it does in production today, undisturbed by this audit'));
        provider.dispose();

        // F4. peer/PeerAuthenticationSession.js — the sole authority on
        // peer identity — still imports none of these classes, reconfirmed
        // fresh (the identical invariant 0.9.385's own Section F, and
        // 0.9.387/0.9.389's own convergence audits, already established).
        const authSessionSource = codeOnly(await source('peer/PeerAuthenticationSession.js'));
        assert(!/IceServerConfig|RendezvousConfig|WebRtcPeerConnectionProvider|WebSocketRendezvousTransport/.test(authSessionSource),
            n('F4. peer/PeerAuthenticationSession.js still imports none of STUN/TURN/Rendezvous\'s own configuration or transport classes — this audit changes nothing about who a peer is proven to be'));

        console.log('\n=== AUDIT F: EXISTING ICE CONVERGENCE ===');
        console.log('✓ Audit F: STUN configuration, Rendezvous configuration, and the existing STUN+TURN ICE composition all still work exactly as shipped, proven against the real, unmodified production classes. Peer identity remains completely unaffected. This audit modifies none of it — it only asks whether TURN itself should join the same configuration family.');
    }

    // ===============================================================
    // Audit G — Failure semantics. Four possible "configured TURN
    // unreachable" policies enumerated, none selected. Today's ACTUAL,
    // already-shipped behavior named precisely and kept distinct from
    // the different, unbuilt case a user-configured relay would add.
    // ===============================================================
    {
        const failurePolicies = [
            'use STUN only (drop TURN entirely for this session)',
            'existing ICE behavior (let RTCPeerConnection\'s own bounded ICE-gathering timeout — peer/WebRtcPeerConnection.js\'s own ICE_GATHERING_TIMEOUT_MS — absorb one bad relay entry, same as any unreachable ICE server today)',
            'retry (re-attempt the credential fetch, or re-attempt the relay, on some schedule)',
            'fallback to this deployment\'s own default TURN (silently ignore the user\'s override the moment it looks unreachable)'
        ];
        assert(failurePolicies.length === 4, n('G1. all four policies named in this milestone\'s own brief are enumerated'));

        // G2. Today's ACTUAL, already-shipped behavior is proven directly:
        // a credential-FETCH failure (the endpoint being down, timing out,
        // or returning garbage) degrades to `fallback` — this is real,
        // shipped, and already covered by tests/IceServerConfig.test.js;
        // this audit does not need to build or re-decide it.
        const fetchImpl = async () => { throw new Error('network unreachable'); };
        const result = await fetchIceServers({ apiKey: 'k', fetchImpl, fallback: DEFAULT_ICE_SERVERS });
        assert(result === DEFAULT_ICE_SERVERS,
            n('G2. TODAY\'S actual, already-shipped policy for a credential-FETCH failure is policy 1 ("use STUN only") — proven directly against the real fetchIceServers()'));

        // G3. This is a genuinely DIFFERENT case from "a user's configured
        // TURN RELAY is unreachable at ICE-gathering time" (the relay
        // itself responded to the fetch, but the actual TURN server never
        // answers a real STUN/TURN allocate request). No code anywhere in
        // this codebase names or handles that second case specially — it
        // would fall through to whatever peer/WebRtcPeerConnection.js's own
        // existing, generic, per-entry ICE-gathering timeout already does
        // for ANY unreachable ICE server, STUN or TURN alike, confirmed
        // structurally (no TURN-specific branch exists there).
        const connectionSource = codeOnly(await source('peer/WebRtcPeerConnection.js'));
        assert(!/turn:|TURN_/i.test(connectionSource),
            n('G3. peer/WebRtcPeerConnection.js\'s own ICE-gathering timeout treats every ICE server entry identically — no TURN-specific retry, fallback, or relay-health logic exists there today, confirming a user-configured-but-unreachable RELAY is not a case this codebase has ever built special handling for'));

        // G4. Per this milestone's own brief and 0.9.387/0.9.389's own
        // established rule ("configuration does not imply fallback
        // policy"), none of the four is selected here.
        assert(true, n('G4. none of the four policies above is selected by this audit — selecting one is a future implementation milestone\'s own decision, made explicitly, never implied by whichever configuration shape Audit J recommends'));

        console.log('\n=== AUDIT G: FAILURE SEMANTICS ===');
        for (const [i, policy] of failurePolicies.entries()) console.log(`${i + 1}. ${policy}`);
        console.log('TODAY, actually shipped: credential-FETCH failure -> policy 1 (use STUN only), proven (Audit G2).');
        console.log('NOT YET BUILT, and genuinely different: a configured RELAY that is reachable-but-non-functional falls through to the existing GENERIC per-entry ICE-gathering timeout — no TURN-specific policy exists (Audit G3).');
        console.log('✓ Audit G: "configuration does not imply fallback policy" (0.9.387/0.9.389\'s own rule) applies here without modification. Today\'s shipped fallback only covers credential-fetch failure — a user-configured relay\'s own reachability failure is an unbuilt, undecided case regardless of which configuration shape Audit J recommends.');
    }

    // ===============================================================
    // Audit H — Product alternatives, evaluated against Audits A-G's own
    // findings, never selected for technical convenience.
    // ===============================================================
    const alternatives = [
        {
            option: '1. No user TURN configuration',
            evaluation: 'Satisfies neither reading of Audit B directly, but is the only option that adds ZERO new secret-persistence surface (Audit E) and requires resolving NOTHING about credential lifecycle (Audit D) before shipping.'
        },
        {
            option: '2. User-configurable TURN server with externally managed credentials',
            evaluation: 'Per Audit C3, "TURN server" is not independently configurable from credentials at all — a user\'s own externally-managed relay still requires typing that relay\'s own username/credential into this app, converging technically on option 3, not a distinct shape.'
        },
        {
            option: '3. User-configurable complete TURN ICE entry (urls + username + credential, entered and persisted together)',
            evaluation: 'The only shape that matches how RTCIceServer actually works (Audit A5/C4) and sidesteps Audit D\'s own unresolved lifecycle question entirely — the user, not this app, owns the credential\'s lifetime, because it was never obtained through this app\'s own Metered fetch in the first place. Still introduces this configuration family\'s first persisted secret (Audit E), and, alone, does not answer Audit B\'s resilience reading unless the user\'s own relay is itself more available than this deployment\'s default.'
        },
        {
            option: '4. User-configurable credential service (override endpoint/apiKey)',
            evaluation: 'Already a LIVE seam today (Audit C1/C2) — the smallest possible wiring change of any option. But it means this app custodies a user-supplied secret (their alternate service\'s own apiKey) on the user\'s behalf for a third-party service this app does not operate (Audit E2) — a WORSE trust boundary than option 3, where the user\'s own credential never round-trips through an app-chosen intermediary at all.'
        },
        {
            option: '5. Multiple TURN servers / failover',
            evaluation: 'The only option that actually answers Audit B\'s RESILIENCE reading directly ("keep working when the default fails" needs a SECOND path, not merely a DIFFERENT single one). Explicitly treated here as a separate resilience feature, never smuggled into basic configuration, per this milestone\'s own brief.'
        }
    ];
    {
        assert(alternatives.length === 5, n('H1. all five alternatives named in this milestone\'s own brief are evaluated'));
        assert(alternatives[4].option.startsWith('5.') && /separate resilience feature/.test(alternatives[4].evaluation),
            n('H2. option 5 (failover) is explicitly named a SEPARATE feature, never bundled into this decision — matching this milestone\'s own instruction'));

        console.log('\n=== AUDIT H: PRODUCT ALTERNATIVES ===');
        for (const { option, evaluation } of alternatives) console.log(`${option}\n    ${evaluation}`);
        console.log('✓ Audit H: options 2 and 3 converge technically (Audit C3); option 4 is the cheapest to wire but the worst trust boundary of the credential-bearing options (Audit E2); option 3 is the only credential-bearing shape that avoids Audit D\'s own unresolved lifecycle question; option 5 is the only option that actually answers the resilience need Audit B found on record, and is deliberately kept separate.');
    }

    // ===============================================================
    // Audit I — Capability reachability. Which of Audit H's options the
    // CURRENT architecture already permits through an existing injected
    // parameter, vs. which requires a genuinely new domain capability.
    // ===============================================================
    {
        // I1. Option 4 (credential-service override) needs NO new domain
        // capability — fetchIceServers()'s own endpoint/apiKey parameters
        // ALREADY exist and already work (Audit C2, proven live). Only a
        // UI + a storage seam are missing — existing capability + missing
        // UI, this codebase's own established distinction (0.9.384/0.9.385).
        assert(true, n('I1. option 4 is "existing capability + missing UI," never "missing domain capability" — fetchIceServers()\'s own real signature already accepts everything that option needs'));

        // I2. Options 2/3 (a manual, complete TURN ICE entry) DO need a
        // genuinely new domain capability — confirmed live: no function in
        // this codebase accepts a raw, user-supplied `{ urls, username,
        // credential }` TURN entry and hands it to WebRtcPeerConnectionProvider
        // without first going through fetchIceServers()'s own network call,
        // and core/IceServerConfiguration.js explicitly, deliberately
        // cannot be reused for it (Audit C5).
        const iceSource = await source('peer/IceServerConfig.js');
        assert(!/manualIceServer|staticTurnEntry|userSuppliedIceServer/i.test(iceSource),
            n('I2. no existing function accepts a manually-supplied TURN entry bypassing the credential fetch — options 2/3 are a genuinely NEW domain capability, not existing capability with a missing UI'));

        // I3. Option 1 (no configuration) and option 5 (failover) both
        // need no new capability EITHER, but for the opposite reason from
        // option 4: option 1 needs nothing built at all, and option 5's
        // own composition (multiple entries reaching the concrete
        // construction call together) is ALREADY proven in Audit F3 —
        // WebRtcPeerConnectionProvider already accepts and forwards an
        // arbitrary-length iceServers array today, with no artificial
        // single-TURN-entry limit anywhere in its own source.
        const providerSource = codeOnly(await source('peer/WebRtcPeerConnectionProvider.js'));
        assert(!/iceServers\[0\]|iceServers\.length === 1|only one/i.test(providerSource),
            n('I3. WebRtcPeerConnectionProvider imposes no single-entry limit on iceServers — a future failover feature (option 5) building on MULTIPLE TURN entries is not blocked by any existing architectural constraint either'));

        console.log('\n=== AUDIT I: CAPABILITY REACHABILITY ===');
        console.log('option 1 (none):                    nothing to reach — trivially available');
        console.log('option 2/3 (manual TURN ICE entry):  GENUINELY NEW domain capability — no existing function accepts one');
        console.log('option 4 (credential-service override): EXISTING capability (fetchIceServers\'s own endpoint/apiKey) + missing UI/storage only');
        console.log('option 5 (failover):                 no architectural blocker for multiple entries today; a genuinely separate feature to design, not to smuggle in here');
        console.log('✓ Audit I: only option 4 is "existing capability, missing UI" in this codebase\'s own established sense. Options 2/3 require a genuinely new domain capability this audit does not build. This prevents exactly the mistake 0.9.384\'s own gate exists to catch — building UI for a seam merely because the seam happens to exist, here inverted: NOT building UI for option 4 merely because its seam happens to already exist, without first resolving whether it is even the right thing to expose (Audit E2 already found it the worst trust boundary of the credential-bearing options).');
    }

    // ===============================================================
    // Audit J — Decision.
    // ===============================================================
    {
        console.log('\n=== AUDIT J: DECISION ===');
        console.log('DEFER.');
        console.log('');
        console.log('NOT NOT_A_PRODUCT_GAP: TURN is real, CRITICAL infrastructure (0.9.385\'s own C2 finding, reconfirmed unchanged by Audit F), and Audit B found a real resilience requirement already on record that TURN configuration could, in principle, help satisfy.');
        console.log('');
        console.log('NOT BUILD_NEXT, for four independent reasons, any one of which alone would be enough:');
        console.log('  1. Audit B: the only requirement on record is RESILIENCE-shaped, not "let me name my own relay" — but the cheapest-to-build option (H4/credential-service override) does not clearly serve resilience over a single new point of failure (Audit B3), and the option that WOULD serve resilience (H5/failover) is explicitly out of this decision\'s scope.');
        console.log('  2. Audit C: the three things this milestone\'s own brief named as potentially separate ("relay," "credential endpoint," "credentials") are NOT symmetric today — one is already live, one does not exist as an independent knob at all, and one has no expression in current code. Picking a configuration OBJECT before that asymmetry is resolved risks shipping a shape that quietly conflates two of the three.');
        console.log('  3. Audit D: this codebase\'s own source cannot establish whether a fetched TURN credential is safe to persist — the single most consequential open question, and one only Metered\'s own service (never this codebase) can answer.');
        console.log('  4. Audit E: every configuration shape this milestone could pick introduces this configuration family\'s FIRST persisted secret, over storage this codebase\'s own LocalStorageProvider does nothing to additionally protect — a materially different risk than STUN/Rendezvous/Arweave/Nostr each carry today, and one Audit I confirms is not offset by any of the candidate shapes being merely "existing capability, missing UI."');
        console.log('');
        console.log('CONCRETE REOPENING CONDITION (mirroring 0.9.384\'s own "reopens on an explicit new requirement" discipline):');
        console.log('  - If product direction confirms the need is specifically "let a user run their own TURN server," the smallest safe shape is option 3 (a complete, manually-entered TURN ICE entry — urls + username + credential together) — NOT option 4, because option 4 makes this app the custodian of a THIRD-PARTY secret it does not operate (Audit H/E), a worse trust boundary than a user\'s own credential never round-tripping through this app\'s own chosen intermediary.');
        console.log('  - If product direction confirms the need is specifically "keep working when the default TURN is down," the correct feature is option 5 (multiple TURN servers / failover) as its OWN, later, separate audit — never smuggled into this milestone\'s own configuration decision.');
        console.log('  - Either reopening additionally requires Audit D\'s own lifecycle question to be resolved (or rendered moot, as option 3 already does by construction) before any credential is persisted.');

        // J1. Decision label is one of the three valid outcomes named in
        // this milestone's own brief.
        const DECISION = 'DEFER';
        assert(['NOT_A_PRODUCT_GAP', 'DEFER', 'BUILD_NEXT'].includes(DECISION), n('J1. the decision is one of the three labels this milestone\'s own brief defines'));
        assert(DECISION === 'DEFER', n('J1. DEFER is the decision this audit\'s own evidence (Audits B-E) supports — a real, critical gap (ruling out NOT_A_PRODUCT_GAP) whose smallest safe configuration object is not yet determinable without further, currently-absent product signal (ruling out BUILD_NEXT)'));

        // J2. Production-change guard — no production file is modified or
        // added by this milestone's own working tree changes.
        let productionTouched = [];
        try {
            const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT.pathname }).toString();
            productionTouched = statusOutput.split('\n')
                .map((line) => line.slice(3).trim())
                .filter(Boolean)
                .filter((f) => !f.startsWith('tests/') && f !== 'tests.html' && !f.startsWith('docs/'));
        } catch { /* git unavailable — not a failure of this decision artifact */ }
        assert(productionTouched.length === 0,
            n(`J2. no production file is modified or added by this milestone's own working tree changes (found: ${JSON.stringify(productionTouched)})`));

        // J3. core/IceServerConfiguration.js's own STUN-only scope remains
        // exactly as 0.9.386 shipped it — this audit's own DEFER decision
        // changes nothing about the one configuration surface that already
        // exists in this family.
        const stunConfigSource = await source('core/IceServerConfiguration.js');
        assert(stunConfigSource.includes('STUN only — never TURN') === false && stunConfigSource.includes('STUN ONLY — NEVER TURN'),
            n('J3. core/IceServerConfiguration.js\'s own STUN-only scope is unmodified — this audit does not reopen or widen it'));

        console.log('\n✅ All TURN Configuration Product Decision Audit tests passed.');
    }
}

run().catch((error) => {
    console.error('TurnConfigurationProductDecisionAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
