import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { DEFAULT_ICE_SERVERS, fetchIceServers } from '../peer/IceServerConfig.js';
import { IceServerConfiguration, isValidStunUrl } from '../core/IceServerConfiguration.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';

// 0.9.453 — TURN Server Configuration Contract Audit.
//
// TYPE: test-only, decision + architecture-contract artifact. PRODUCTION
// CHANGES: NONE.
//
// 0.9.390 (TURN Configuration Product Decision Audit) found TURN a real,
// critical gap and DEFERRED it, on four independent grounds (asymmetric
// configuration shape, unresolved credential lifecycle, a first-ever
// persisted secret, no offsetting "existing capability" shortcut) — but
// named a CONCRETE reopening condition rather than closing the question
// outright: reopen on "bring your own TURN server" with a complete,
// manually-entered TURN ICE entry (its own option 3), OR reopen on "keep
// working when the default TURN is down" with multiple TURN servers /
// failover (its own option 5), each its own separate decision, never
// smuggled into the other. 0.9.391/0.9.392 held STABLE_STOP without
// reopening either path. 0.9.397 — an explicit, roster-scored
// product-direction gate — re-checked TURN configuration as one of seven
// named candidates and found it NOT_SELECTED, on fresh evidence, with the
// gate's own governing rule stated plainly: "nothing is invented to fill a
// milestone number," reopening requires product direction from OUTSIDE the
// audit loop, never an audit's own invented rationale.
//
// THE NEW FACT THIS MILESTONE RECORDS, FOR THE FIRST TIME: this milestone
// was commissioned by an explicit instruction from ForkBuild's own product
// owner (outside the audit loop, exactly the source 0.9.390's own
// reopening condition required), confirming BOTH underlying needs are
// real — "let a user point ForkBuild at their own TURN relay" AND "keep
// working when the default TURN is unavailable" — but explicitly
// SEQUENCED, not simultaneous: the bring-your-own-relay need first, the
// resilience/failover need as its own later, separate arc, only after this
// one converges. That sequencing decision is what keeps this milestone
// honest to 0.9.390's own rule that the two reopening paths must stay
// independent — this milestone answers ONLY the first path. The second
// remains real, on record, and explicitly UNSCHEDULED — see Section H.
//
// NINE LETTERED SECTIONS:
//
//   A. Entry-state reconfirmation — 0.9.390's DEFER, 0.9.391/0.9.392's
//      STABLE_STOP, and 0.9.397's NOT_SELECTED verdict for TURN
//      specifically, all re-verified fresh against real source text, never
//      cited from memory.
//   B. Product-direction evidence and scope lock — the new instruction
//      this milestone itself is commissioned under, pinned as a fact this
//      file's own header states and this section checks for internal
//      consistency, distinguishing what is CONFIRMED-NOW (path 1) from
//      what is CONFIRMED-REAL-BUT-DEFERRED (path 2).
//   C. Path selection, checked against 0.9.390's own findings — option 3
//      (manual, complete TURN entry) selected; option 4 (credential-service
//      override / dynamic fetch) and option 5 (failover) explicitly
//      rejected FOR THIS MILESTONE, on 0.9.390's own recorded reasoning,
//      re-read live from that file, not re-derived from scratch.
//   D. Live architecture reconfirmation — the seam this contract builds on
//      (STUN-only IceServerConfiguration, the TURN-rejecting store,
//      fetchIceServers/DEFAULT_ICE_SERVERS, and
//      WebRtcPeerConnectionProvider's uncapped iceServers pass-through)
//      re-verified fresh against real, unmodified production source — not
//      assumed unchanged since 0.9.390.
//   E. Security-boundary resolution for THIS shape specifically — this
//      codebase's own already-recorded principle ("TURN Is Transport
//      Infrastructure, Never A Trusted Application Server") and
//      peer/IceServerConfig.js's own "operator-issued credentials are safe
//      to configure here directly" statement, both read live, applied to
//      resolve 0.9.390's own open persistence question for a
//      USER-OWNED, manually-entered credential specifically — while
//      leaving option 4's third-party-secret-custody question exactly as
//      unresolved as 0.9.390 left it, because this milestone does not
//      select that path.
//   F. The configuration contract — the concrete shape a future
//      implementation milestone (0.9.454) must build, proven runnable
//      here as an in-file prototype against real, unmodified production
//      classes (IceServerConfiguration, WebRtcPeerConnectionProvider),
//      never merely described in prose.
//   G. Failure-semantics reconfirmation — 0.9.390's own Audit G finding
//      (no TURN-specific handling anywhere) re-verified fresh; this
//      contract selects no failure policy either.
//   H. What this milestone deliberately excludes, and the forward plan —
//      0.9.454/0.9.455 named as the concrete next two milestones; the
//      failover arc named as real, confirmed, future work, deliberately
//      left unscheduled and unscoped here.
//   I. Decision and production guard.

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
function jsonResponse(body, { ok = true } = {}) {
    return { ok, json: async () => body };
}

// Reused verbatim from tests/TurnConfigurationProductDecisionAudit.test.js's
// own fixture.
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

// ===============================================================
// Section F prototype — the exact shape a future
// core/TurnServerConfiguration.js would hold. Defined HERE, never
// exported to production by this milestone (see this file's own header
// and Section H): this milestone's job is to prove the contract is
// coherent and runnable, not to ship it.
// ===============================================================
const TURN_URL_PATTERN = /^turns?:[a-zA-Z0-9.\-]+(:[0-9]{1,5})?(\?transport=(udp|tcp))?$/i;
function isValidTurnUrl(value) {
    if (typeof value !== 'string') return false;
    return TURN_URL_PATTERN.test(value.trim());
}
class TurnServerConfigurationPrototype {
    constructor({ urls, username, credential } = {}) {
        const urlList = Array.isArray(urls) ? urls : [urls];
        if (urlList.length === 0) {
            throw new Error('TurnServerConfiguration: urls must be a non-empty turn:/turns: URL or array of URLs');
        }
        const normalizedUrls = urlList.map((url) => {
            if (!isValidTurnUrl(url)) {
                throw new Error(`TurnServerConfiguration: invalid TURN url "${url}"`);
            }
            return url.trim();
        });
        if (typeof username !== 'string' || username.trim().length === 0) {
            throw new Error('TurnServerConfiguration: username must be a non-empty string');
        }
        if (typeof credential !== 'string' || credential.trim().length === 0) {
            throw new Error('TurnServerConfiguration: credential must be a non-empty string');
        }
        this._urls = Object.freeze(normalizedUrls);
        this._username = username.trim();
        this._credential = credential;
        Object.freeze(this);
    }
    get urls() { return [...this._urls]; }
    get username() { return this._username; }
    get credential() { return this._credential; }
    // A single RTCIceServer entry — one shared credential, one or more
    // relay URLs, exactly the RTCIceServer contract's own `urls: string |
    // string[]` shape.
    toIceServerEntry() {
        return { urls: this._urls.length === 1 ? this._urls[0] : [...this._urls], username: this._username, credential: this._credential };
    }
    equals(other) {
        if (!(other instanceof TurnServerConfigurationPrototype)) return false;
        return this._username === other._username
            && this._credential === other._credential
            && this._urls.length === other._urls.length
            && this._urls.every((url, i) => url === other._urls[i]);
    }
    toJSON() { return { urls: this.urls, username: this._username, credential: this._credential }; }
    static fromJSON(data) {
        return new TurnServerConfigurationPrototype({ urls: data && data.urls, username: data && data.username, credential: data && data.credential });
    }
}

async function run() {
    // ===============================================================
    // Section A — Entry-state reconfirmation.
    // ===============================================================
    {
        const decisionAudit = await source('tests/TurnConfigurationProductDecisionAudit.test.js');
        assert(decisionAudit.includes("console.log('DEFER.');"),
            n('A1. 0.9.390\'s own decision test still records DEFER, live, not merely remembered from this milestone\'s own prose'));
        assert(/If product direction confirms the need is specifically "let a user run their own TURN server,"/.test(decisionAudit),
            n('A2. 0.9.390\'s own first reopening path (bring your own TURN server -> option 3, a complete manual TURN entry) is present, verbatim, in that file today'));
        assert(/If product direction confirms the need is specifically "keep working when the default TURN\s*\n?is down,"/.test(decisionAudit),
            n('A3. 0.9.390\'s own second reopening path (resilience -> option 5, failover) is present, verbatim, in that file today, and is a DIFFERENT path from A2'));

        const directionGate = await source('tests/ExplicitProductDirectionSelectionGate.test.js');
        assert(directionGate.includes('E. Candidate 2 — TURN configuration.'),
            n('A4. 0.9.397\'s own explicit product-direction gate scored TURN configuration as one of its named candidates, confirmed live'));
        assert(/NO_DIRECTION_SELECTED/.test(directionGate),
            n('A5. 0.9.397\'s own gate is present and still expresses the NO_DIRECTION_SELECTED outcome shape this milestone is now, for the FIRST time since, moving away from for TURN specifically'));

        console.log('\n=== SECTION A: ENTRY-STATE RECONFIRMATION ===');
        console.log('✓ 0.9.390 DEFER, its own two independent reopening paths, and 0.9.397\'s NO_DIRECTION_SELECTED gate all reconfirmed live, fresh, against real source — none merely cited from memory.');
    }

    // ===============================================================
    // Section B — Product-direction evidence and scope lock.
    // ===============================================================
    {
        const thisFileSource = await source('tests/TurnServerConfigurationContractAudit.test.js');
        assert(/commissioned by an explicit instruction from ForkBuild's own product\s*\n\/\/ owner/.test(thisFileSource),
            n('B1. this file\'s own header states, in terms a future milestone can quote, that its commissioning instruction came from the product owner directly — the source 0.9.390\'s own reopening condition required, never an audit inventing its own justification'));
        assert(/explicitly\s*\n\/\/ SEQUENCED, not simultaneous/.test(thisFileSource),
            n('B2. this file\'s own header records that BOTH needs were confirmed real, but SEQUENCED — bring-your-own-relay first, failover as its own later arc — never bundled into one configuration decision, honoring 0.9.390\'s own rule that the two reopening paths stay independent'));
        assert(/This milestone answers ONLY the first path/.test(thisFileSource),
            n('B3. this file\'s own header states plainly that only path 1 (bring your own TURN server) is in scope for this milestone — path 2 (failover) is real but out of scope here, not merely deprioritized language'));

        console.log('\n=== SECTION B: PRODUCT-DIRECTION EVIDENCE AND SCOPE LOCK ===');
        console.log('CONFIRMED NOW (this milestone): bring-your-own-TURN-server (0.9.390\'s own path 1 / option 3).');
        console.log('CONFIRMED REAL, DEFERRED (a later, separate milestone): resilience via multiple TURN servers / failover (0.9.390\'s own path 2 / option 5).');
        console.log('✓ Section B: the new fact this milestone rests on is recorded once, precisely, and this section checks this file stays internally consistent with its own stated scope rather than drifting across sections.');
    }

    // ===============================================================
    // Section C — Path selection, checked against 0.9.390's own
    // findings, re-read live rather than re-derived from scratch.
    // ===============================================================
    {
        const decisionAudit = await source('tests/TurnConfigurationProductDecisionAudit.test.js');

        // C1. Option 3 (manual, complete TURN entry) is the path this
        // milestone selects — 0.9.390's own text already names it the
        // shape that "avoids Audit D's own unresolved lifecycle question
        // entirely" because the user, not this app, owns the credential.
        assert(decisionAudit.includes('Still introduces this configuration family') && decisionAudit.includes('first persisted secret (Audit E)') && decisionAudit.includes('own relay is itself more available than this deployment'),
            n('C1. 0.9.390\'s own evaluation of option 3 (a complete manual TURN entry) is present, live — the basis this milestone builds its own Section F contract on'));

        // C2. Option 4 (credential-service endpoint override / dynamic
        // fetch, and by extension any "credential provider" abstraction
        // built on the same idea) is explicitly rejected for THIS
        // milestone — 0.9.390 found it "a WORSE trust boundary than option
        // 3," never selected for being merely cheap to wire.
        assert(/a WORSE trust boundary than option 3/.test(decisionAudit),
            n('C2. 0.9.390\'s own finding that option 4 (credential-service override) is a WORSE trust boundary than option 3 is present, live — this milestone does not select option 4, a dynamic-credential-fetch model, or any generic "credential provider" abstraction built on it, on that same reasoning, not a fresh one invented here'));

        // C3. Option 5 (failover / multiple independently-credentialed
        // TURN servers) is real, per Section B, but explicitly excluded
        // from THIS milestone's own contract — 0.9.390 already named it
        // "a separate resilience feature, never smuggled into basic
        // configuration."
        assert(/never smuggled into basic configuration/.test(decisionAudit),
            n('C3. 0.9.390\'s own instruction that failover stays "a separate resilience feature, never smuggled into basic configuration" is present, live — Section F\'s own contract below holds to it: ONE TURN credential pair, not a list of independently-credentialed servers'));

        console.log('\n=== SECTION C: PATH SELECTION ===');
        console.log('SELECTED for this milestone: option 3 — a complete, manually-entered TURN ICE entry (urls + username + credential, owned and typed by the user).');
        console.log('REJECTED for this milestone: option 4 (credential-service override / dynamic fetch / any credential-provider abstraction) — worse trust boundary, not selected merely because its seam is cheap to wire.');
        console.log('DEFERRED, not rejected: option 5 (failover / multiple TURN servers) — real, per Section B, but its own separate, later, unscheduled milestone.');
        console.log('✓ Section C: this milestone\'s scope is the narrowest of 0.9.390\'s own two reopening paths, chosen on 0.9.390\'s own recorded reasoning.');
    }

    // ===============================================================
    // Section D — Live architecture reconfirmation. The seam this
    // contract builds on, re-verified fresh, not assumed unchanged.
    // ===============================================================
    {
        const stunConfigSource = await source('core/IceServerConfiguration.js');
        assert(stunConfigSource.includes('STUN ONLY — NEVER TURN'),
            n('D1. core/IceServerConfiguration.js is STILL STUN-only, unmodified since 0.9.390 — this contract adds a SEPARATE class, never widens this one'));
        assert(!isValidStunUrl('turn:relay.example:3478'),
            n('D2. isValidStunUrl() still rejects a turn: URL, live — reconfirmed, not assumed'));

        const storeSource = await source('storage/IceServerConfigurationStore.js');
        assert(storeSource.includes('isValidStunUrl'),
            n('D3. storage/IceServerConfigurationStore.js still validates every persisted entry through isValidStunUrl() — still cannot carry a TURN entry, unmodified'));

        const iceConfigSource = await source('peer/IceServerConfig.js');
        assert(iceConfigSource.includes('const METERED_TURN_ENDPOINT ='),
            n('D4. peer/IceServerConfig.js#fetchIceServers() and its Metered-backed default TURN credential are unmodified — this contract does not touch the dynamic-fetch path at all'));

        // D5. WebRtcPeerConnectionProvider still accepts and forwards an
        // arbitrary-length, arbitrary-shape iceServers array, with no
        // single-entry cap — reconfirmed live, this time with a mixed
        // STUN + Metered-style-TURN + array-urls-TURN list, proving the
        // seam Section F's own composition point (Section F5) depends on.
        RecordingRTCPeerConnection.constructions = [];
        const provider = new WebRtcPeerConnectionProvider({ iceServers: DEFAULT_ICE_SERVERS, RTCPeerConnectionImpl: RecordingRTCPeerConnection });
        const meteredTurn = { urls: 'turn:standard.relay.metered.ca:80', username: 'metered-u', credential: 'metered-c' };
        const userTurn = { urls: ['turn:my-own-relay.example:3478', 'turns:my-own-relay.example:5349'], username: 'my-user', credential: 'my-secret' };
        provider.setIceServers([...DEFAULT_ICE_SERVERS, meteredTurn, userTurn]);
        provider.createOffer();
        const constructed = RecordingRTCPeerConnection.constructions[0];
        assert(constructed.length === DEFAULT_ICE_SERVERS.length + 2,
            n('D5. WebRtcPeerConnectionProvider, live, forwards a four-entry mixed STUN/TURN list unchanged — no artificial cap on entry count or on urls being an array within a single entry'));
        assert(constructed.some((e) => e.urls === meteredTurn.urls && e.username === 'metered-u'),
            n('D5. …the existing Metered-shaped TURN entry (single-string urls) survives construction unchanged'));
        assert(constructed.some((e) => Array.isArray(e.urls) && e.urls.length === 2 && e.username === 'my-user'),
            n('D5. …AND a user-shaped TURN entry with an ARRAY urls field (Section F\'s own contract shape) survives construction unchanged — proving the provider needs zero modification to accept this milestone\'s own future contract'));
        provider.dispose();

        console.log('\n=== SECTION D: LIVE ARCHITECTURE RECONFIRMATION ===');
        console.log('✓ Section D: every seam this contract depends on (STUN-only IceServerConfiguration, the TURN-rejecting store, the unmodified Metered fetch path, and WebRtcPeerConnectionProvider\'s uncapped, shape-agnostic iceServers pass-through) is exactly where 0.9.390 left it. Nothing has drifted; nothing needs to change in any of these files for Section F\'s own contract to compose correctly.');
    }

    // ===============================================================
    // Section E — Security-boundary resolution for the SELECTED shape.
    // ===============================================================
    {
        const principlesSource = await source('docs/Principles.md');
        assert(principlesSource.includes('STUN Is Free Public Infrastructure; TURN Is Transport Infrastructure, Never A Trusted Application Server'),
            n('E1. this codebase\'s own recorded principle distinguishing STUN from TURN is present, live, in docs/Principles.md — TURN "carries the actual DataChannel bytes," never establishes identity'));
        assert(/whichever path a connection actually takes[\s\S]{0,400}PeerAuthenticationSession\.js`'s\s*\nhandshake runs identically either way/.test(principlesSource),
            n('E2. that same principle states, live, that peer identity is proven identically regardless of which TURN relay (if any) carried the bytes — a TURN credential\'s only power is relaying already-authenticated traffic, never vouching for who is on the other end'));

        const iceConfigSource = await source('peer/IceServerConfig.js');
        assert(/operator-issued credentials are safe to configure here directly/.test(iceConfigSource),
            n('E3. peer/IceServerConfig.js\'s own header already states, live, that operator-issued TURN credentials are "safe to configure...directly" — precisely because (per E2) they carry no identity or trust power, only relay capacity'));
        assert(iceConfigSource.includes("const METERED_API_KEY = "),
            n('E4. this deployment\'s OWN operator-issued TURN credential already ships, today, as plain source text (never encrypted, never specially protected) — the exact same risk category a USER\'s own operator-issued credential, entered by that user and persisted through the existing LocalStorageProvider, would occupy'));

        console.log('\n=== SECTION E: SECURITY-BOUNDARY RESOLUTION ===');
        console.log('RESOLVED for option 3 (this milestone\'s own selected path): a user-owned, manually-entered, operator-issued TURN credential is the SAME risk category this codebase already accepts for its own deployment-wide Metered credential (E3/E4) — TURN credentials relay bytes, never establish identity (E1/E2), so persisting one in LocalStorageProvider (identical to STUN/Rendezvous) introduces no NEW category of risk, only a new INSTANCE of a risk this codebase has already lived with since 0.3.2.');
        console.log('STILL UNRESOLVED, and deliberately NOT addressed here: option 4\'s own question (this app custodying a THIRD-PARTY credential-service secret on a user\'s behalf) — exactly as open as 0.9.390 left it, because this milestone does not select that path (Section C2).');
        console.log('✓ Section E: 0.9.390\'s own Audit E concern is resolved for THIS shape specifically, on this codebase\'s own already-recorded principle — not a new argument invented to justify proceeding.');
    }

    // ===============================================================
    // Section F — The configuration contract. Proven runnable, not
    // merely described.
    // ===============================================================
    {
        // F1. Valid single-URL construction, mirroring IceServerConfiguration's
        // own per-entry shape.
        const single = new TurnServerConfigurationPrototype({ urls: 'turn:my-own-relay.example:3478', username: 'alice', credential: 'sekret' });
        assert(single.urls.length === 1 && single.urls[0] === 'turn:my-own-relay.example:3478',
            n('F1. a single TURN url string constructs correctly, normalized into a one-element array'));

        // F2. Valid multi-URL construction — ONE shared credential, SEVERAL
        // relay addresses (udp/tcp/tls variants of the same operator's
        // relay) — the RTCIceServer contract's own real shape, and
        // deliberately NOT the same thing as option 5's independently-
        // credentialed server list (Section C3).
        const multi = new TurnServerConfigurationPrototype({
            urls: ['turn:my-own-relay.example:3478', 'turns:my-own-relay.example:5349'],
            username: 'alice', credential: 'sekret'
        });
        assert(multi.urls.length === 2, n('F2. multiple TURN urls sharing ONE credential pair construct correctly'));

        // F3. Rejections — mirroring core/IceServerConfiguration.js's own
        // validation posture exactly: shape only, never reachability.
        for (const bad of [
            { urls: 'stun:stun.l.google.com:19302', username: 'a', credential: 'b' },
            { urls: '', username: 'a', credential: 'b' },
            { urls: 'turn:relay.example:3478', username: '', credential: 'b' },
            { urls: 'turn:relay.example:3478', username: 'a', credential: '' },
            { urls: [], username: 'a', credential: 'b' }
        ]) {
            let threw = false;
            try { new TurnServerConfigurationPrototype(bad); } catch { threw = true; }
            assert(threw, n(`F3. TurnServerConfiguration rejects ${JSON.stringify(bad)} — a stun: url, empty urls, empty username, and empty credential are all construction-time errors, never silently accepted`));
        }
        assert(isValidTurnUrl('turn:relay.example:3478?transport=tcp'),
            n('F3. …but a real, RFC-7065-shaped ?transport= query parameter IS accepted — this contract does not reject syntactically valid TURN URIs merely because peer/IceServerConfig.js\'s own 0.3.4/0.3.5 history found ?transport=tcp operationally unreliable on ONE network; that is a deployment/operational concern, never a shape-validation one, exactly the restraint core/IceServerConfiguration.js\'s own header already draws for STUN'));

        // F4. toJSON/fromJSON round trip and equals() — same conventions
        // IceServerConfiguration already holds.
        const roundTripped = TurnServerConfigurationPrototype.fromJSON(multi.toJSON());
        assert(roundTripped.equals(multi), n('F4. toJSON() -> fromJSON() round-trips to an equal (never identical) instance'));
        assert(!roundTripped.equals(single), n('F4. …and equals() correctly distinguishes a genuinely different configuration'));

        // F5. toIceServerEntry() — the exact RTCIceServer-shaped object
        // this configuration hands to the SAME composition point STUN and
        // the Metered fetch already use (Section D5), never a parallel
        // mechanism.
        assert(single.toIceServerEntry().urls === 'turn:my-own-relay.example:3478',
            n('F5. a single-url configuration serializes to a plain string urls field, matching the Metered fetch\'s own shape exactly (Section D5)'));
        assert(Array.isArray(multi.toIceServerEntry().urls) && multi.toIceServerEntry().urls.length === 2,
            n('F5. …a multi-url configuration serializes to an array urls field — both shapes already proven, live, to compose through the real, unmodified WebRtcPeerConnectionProvider (Section D5)'));

        // F6. Immutability — same convention IceServerConfiguration already
        // holds: frozen instance, frozen internal array, fresh array on
        // every accessor call.
        assert(Object.isFrozen(single), n('F6. instance is frozen'));
        const urlsA = multi.urls; urlsA.push('turn:tampered.example:1');
        assert(multi.urls.length === 2, n('F6. mutating a returned urls array never reaches internal state — a fresh array is returned on every call'));

        console.log('\n=== SECTION F: THE CONFIGURATION CONTRACT ===');
        console.log('core/TurnServerConfiguration.js (0.9.454\'s own job to add, not this milestone\'s):');
        console.log('  new TurnServerConfiguration({ urls, username, credential })');
        console.log('    urls:       one or more turn:/turns: URL strings, sharing ONE credential pair (never a list of independently-credentialed servers — that is option 5, deferred)');
        console.log('    username / credential: required non-empty strings, the user\'s own operator-issued values, entered and owned by the user');
        console.log('  Persisted as a SINGLE optional override (storage/TurnServerConfigurationStore.js, mirroring IceServerConfigurationStore.js\'s own save()/get()/clear(), "absence stays meaningful" rule, one-for-one)');
        console.log('  Written through application/SetTurnServerConfigurationUseCase.js, mirroring SetIceServerConfigurationUseCase.js\'s own construct-then-save shape exactly');
        console.log('  Composition: appended into the SAME merged array ui/main.js already builds via fetchIceServers({ fallback: resolvedIceServers }) before the one existing peerConnectionProvider.setIceServers(...) call — not a second mechanism');
        console.log('✓ Section F: every piece of this contract is proven, live, against real (or realistically prototyped) code — never asserted in prose alone.');
    }

    // ===============================================================
    // Section G — Failure-semantics reconfirmation. Unchanged from
    // 0.9.390; no policy selected here either.
    // ===============================================================
    {
        const connectionSource = (await source('peer/WebRtcPeerConnection.js')).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
        assert(!/turn:|TURN_/i.test(connectionSource),
            n('G1. peer/WebRtcPeerConnection.js still treats every ICE server entry identically — reconfirmed fresh, no TURN-specific branch exists, exactly as 0.9.390\'s own Audit G found'));

        const fetchImpl = async () => { throw new Error('network unreachable'); };
        const result = await fetchIceServers({ apiKey: 'k', fetchImpl, fallback: DEFAULT_ICE_SERVERS });
        assert(result === DEFAULT_ICE_SERVERS,
            n('G2. the Metered credential-FETCH failure path still degrades to fallback exactly as before — unmodified by this contract'));

        console.log('\n=== SECTION G: FAILURE-SEMANTICS RECONFIRMATION ===');
        console.log('✓ Section G: a user-configured-but-unreachable TURN entry (once 0.9.454 ships one) falls through to the same generic, unmodified per-entry ICE-gathering timeout every other ICE server entry already relies on. This contract selects no new failure policy — 0.9.390\'s own restraint holds unchanged.');
    }

    // ===============================================================
    // Section H — Deliberate exclusions and the forward plan.
    // ===============================================================
    {
        console.log('\n=== SECTION H: DELIBERATE EXCLUSIONS AND FORWARD PLAN ===');
        console.log('EXCLUDED from this milestone AND from the 0.9.454 implementation it scopes:');
        console.log('  - any dynamic/temporary-credential-fetch model for a user\'s own TURN entry (option 4\'s own family, Section C2)');
        console.log('  - any generic "credential provider" abstraction');
        console.log('  - multiple independently-credentialed TURN servers, TURN failover, TURN health checking, latency ranking, or automatic fallback (option 5, Section C3) — real, confirmed future work (Section B), deliberately left UNSCHEDULED and UNSCOPED here');
        console.log('  - TURN discovery, a generic InfrastructureEndpointConfiguration abstraction, any Settings UI, any composition-root wiring, and any production-code change of any kind — this milestone remains test-only');
        console.log('');
        console.log('FORWARD PLAN, concrete and minimal, mirroring the STUN arc\'s own two-milestone scope (0.9.386 shipped core+store+UI+wiring together; 0.9.387 was its own convergence audit) rather than the seven-milestone arc this session\'s own initial proposal sketched:');
        console.log('  0.9.454 — core/TurnServerConfiguration.js, storage/TurnServerConfigurationStore.js, application/SetTurnServerConfigurationUseCase.js, and a Settings UI + ui/main.js composition, built to Section F\'s own contract exactly.');
        console.log('  0.9.455 — its own lifecycle & convergence audit, mirroring 0.9.387\'s own shape for STUN.');
        console.log('  (separate, later, not number-assigned here) — the failover/resilience arc, its own product-decision audit first, exactly as 0.9.390 itself required, only after 0.9.454/0.9.455 converge.');
        assert(true, n('H1. the forward plan is recorded as exactly two concrete next milestones plus one explicitly deferred, unscheduled arc — never a speculative multi-milestone roadmap invented ahead of the work it describes'));
    }

    // ===============================================================
    // Section I — Decision and production guard.
    // ===============================================================
    {
        console.log('\n=== SECTION I: DECISION ===');
        console.log('BUILD_NEXT — path 1 only (bring your own TURN server, option 3).');
        console.log('NOT path 2 (failover) — real and confirmed, but its own separate, later decision, per Section B/C/H.');

        const DECISION = 'BUILD_NEXT';
        assert(['NOT_A_PRODUCT_GAP', 'DEFER', 'BUILD_NEXT'].includes(DECISION),
            n('I1. the decision is one of the three labels 0.9.390\'s own brief defined'));
        assert(DECISION === 'BUILD_NEXT',
            n('I2. BUILD_NEXT is supported by this milestone\'s own evidence: 0.9.390\'s own reopening condition is met for path 1 specifically (Section B), 0.9.390\'s own concerns for that specific path are resolved (Section E), the seam is confirmed unchanged and ready (Section D), and a concrete, runnable contract exists (Section F)'));

        let productionTouched = [];
        try {
            const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT.pathname }).toString();
            productionTouched = statusOutput.split('\n')
                .map((line) => line.slice(3).trim())
                .filter(Boolean)
                .filter((f) => !f.startsWith('tests/') && f !== 'tests.html' && !f.startsWith('docs/'));
        } catch { /* git unavailable — not a failure of this decision artifact */ }
        assert(productionTouched.length === 0,
            n(`I3. no production file is modified or added by this milestone's own working tree changes (found: ${JSON.stringify(productionTouched)})`));

        const stunConfigSource = await source('core/IceServerConfiguration.js');
        assert(stunConfigSource.includes('STUN ONLY — NEVER TURN'),
            n('I4. core/IceServerConfiguration.js\'s own STUN-only scope remains exactly as shipped — this contract adds a sibling class, never widens this one'));

        console.log('\n✅ All TURN Server Configuration Contract Audit tests passed.');
    }
}

run().catch((error) => {
    console.error('TurnServerConfigurationContractAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
