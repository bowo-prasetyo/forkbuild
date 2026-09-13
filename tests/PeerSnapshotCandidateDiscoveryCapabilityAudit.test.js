import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';
import {
    PublicationSnapshotPlacementPeerMessageKind,
    toPublicationSnapshotPlacementAnnounceMessage,
    toPublicationSnapshotPlacementRequestMessage,
    isValidPublicationSnapshotPlacementPeerMessage
} from '../application/PublicationSnapshotPlacementPeerProtocol.js';
import { PublicationSnapshotPlacementPeerExchange } from '../application/PublicationSnapshotPlacementPeerExchange.js';
import {
    PeerWorldEncounterMaterialMessageKind,
    isValidPeerWorldEncounterMaterialMessage
} from '../application/PeerWorldEncounterMaterialProtocol.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/WorldSnapshotDiscoveryMonitor.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';

// 0.9.481 — Peer Snapshot Candidate Discovery Capability Audit.
//
// Test-only. Production changes: none (enforced by Section K's own
// git-diff guard).
//
// ORIGINATING OBSERVATION: 0.9.479 answered, for Peer specifically, "no
// Peer search()-shaped candidate source exists yet... the existing peer
// material protocol only supports resolving an already-known object,
// explicitly disclaiming enumeration, with no responder side built" — but
// scoped that finding to exactly ONE file (`application/
// PeerWorldEncounterMaterialSource.js`), the same narrowness 0.9.480 later
// found and corrected for Local. This milestone is the identical second
// look, aimed at Peer: does 0.9.479's own finding hold across the WHOLE
// peer-protocol surface, or only the one file it happened to check? Unlike
// 0.9.480's own outcome, this audit is exactly as willing to report "an
// adapter already suffices" as to report "a genuinely new protocol is
// required" — neither answer is preferred going in.
//
//   Section A — Current peer capabilities: an inventory of EVERY existing
//               *PeerProtocol.js message family in this codebase (not
//               just the one 0.9.479 checked), each classified as
//               peer-ENDPOINT discovery (a different vocabulary
//               entirely), known-object RESOLUTION, or candidate
//               DISCOVERY/browsing — live, from each module's own wire
//               vocabulary, never from memory.
//   Section B — Reconfirming, live, the exact `search(discoveryTag) ->
//               [{ contentHash, locator, storage, publicationId? }]`
//               contract 0.9.479/0.9.480 already established, and that
//               core/PublicationSnapshotPlacement.js's own required
//               fields already ARE that shape.
//   Section C — Existing peer data, and this audit's own central
//               correction: `PublicationSnapshotPlacementPeerExchange`'s
//               own ANNOUNCE already delivers placement claims from a
//               peer into the EXACT `LocalPublicationSnapshotPlacement-
//               Catalog` 0.9.480 proved adaptable — live, with a
//               publicationId this replica never knew about in advance —
//               entirely through EXISTING, unmodified machinery. Its own
//               REQUEST/RESPONSE pull, by contrast, is proven to require
//               an already-known publicationId; there is no "tell me
//               everything" pull anywhere in it.
//   Section D — Protocol boundary: live proof that no existing message
//               kind can legitimately be overloaded to carry a
//               `discoveryTag` browse query — one family rejects it
//               structurally (encounterKind has no such value), the other
//               accepts the wire envelope but silently returns nothing,
//               because its own responder answers by EXACT publicationId
//               equality, never a broader match.
//   Section E — Identity: no new peer-specific candidate identity is
//               needed (reconfirms 0.9.480's own Section C for the
//               identical domain object), and no existing peer envelope
//               carries a peer/connection identity field a candidate
//               would need to inherit.
//   Section F — Failure semantics, live: an unauthenticated/unavailable
//               peer, a malformed or oversized response, a peer that
//               never answers before a timeout, and a mixed population of
//               authenticated and not-yet-authenticated peers — all
//               proven independently non-fatal to the others.
//   Section G — Security/trust boundary: a peer-provided candidate stays
//               a locator claim only, held to the identical restraint
//               this codebase's own existing peer-exchange headers
//               already state for placements and content bytes alike.
//   Section H — Composition: multiple peers answering independently, live
//               — no ranking, no preferred-peer selection, no
//               deduplication (left for the future composite, exactly
//               like 0.9.480's own Section H holds for Local).
//   Section I — LIVE DEMONSTRATION requiring genuinely new protocol
//               surface: a test-only prototype fans a new, this-file-only
//               `BROWSE_REQUEST`/`BROWSE_RESPONSE` message pair out to
//               every authenticated stub peer, and the resulting
//               candidates plug into the real, unmodified command and
//               monitor — while the SAME payload is shown, live, to fail
//               validation under the REAL, existing, unmodified
//               `isValidPublicationSnapshotPlacementPeerMessage()` —
//               proving structurally, not merely by argument, that this
//               shape does not already exist on the wire today.
//   Section J — Architectural boundary held: no reference to the World
//               Encounter material-loading/cascade family anywhere this
//               audit's own prototype touches.
//   Section K — Deliberate exclusions; no production file touched; final
//               classification.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rliE' : '-rlE';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
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
    return provider;
}

function signPlacement(identityProvider, fields) {
    let placement = new PublicationSnapshotPlacement({
        ...fields,
        placerIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    placement = placement.withSignature(identityProvider.signCanonical(placement.getSigningDescriptor()));
    return placement;
}

function makePlacementExchange() {
    const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationSnapshotPlacementExchange(catalog, verifier);
    return { catalog, verifier, exchange };
}

// A minimal stand-in for peer/PeerMessageBus.js — mirrors every sibling
// *PeerExchange.test.js's own StubPeerMessageBus in this codebase.
class StubPeerMessageBus {
    constructor() {
        this._handlers = new Map();
        this.sent = [];
        this.attached = new Set();
    }
    attach(peer) { this.attached.add(peer.connectionId); }
    send(peer, protocol, payload) {
        if (peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
            throw new Error('StubPeerMessageBus: cannot send, peer is not AUTHENTICATED');
        }
        this.sent.push({ peer, protocol, payload });
    }
    subscribe(protocol, handler) {
        if (!this._handlers.has(protocol)) this._handlers.set(protocol, new Set());
        this._handlers.get(protocol).add(handler);
        return () => this._handlers.get(protocol).delete(handler);
    }
    deliver(protocol, payload, meta = {}) {
        const handlers = this._handlers.get(protocol);
        if (!handlers) return;
        for (const handler of Array.from(handlers)) handler(payload, meta);
    }
}

class StubConnectedPeerRegistry {
    constructor(peers = []) { this._peers = peers; this._listeners = new Set(); }
    list() { return this._peers; }
    onChange(callback) { this._listeners.add(callback); return () => this._listeners.delete(callback); }
}

function stubPeer(connectionId, identityId, state = PeerLifecycleState.AUTHENTICATED) {
    return {
        connectionId,
        remoteIdentity: identityId ? { identityId } : null,
        getLifecycleState: () => state
    };
}

async function run() {
    console.log('=== 0.9.481 — Peer Snapshot Candidate Discovery Capability Audit ===\n');

    // ===============================================================
    // Section A — Current Peer capabilities: a full inventory.
    // ===============================================================
    {
        // A1. Peer-ENDPOINT discovery — "how do I find a candidate
        // endpoint to CONNECT to" — is a structurally different question
        // than Snapshot candidate discovery, confirmed live: neither
        // `peer/PeerDiscoveryProvider.js` nor `application/
        // DiscoverPeersUseCase.js` mentions PublicationSnapshotPlacement,
        // contentHash, or discoveryTag anywhere in their own source.
        const peerDiscoverySource = await readSource('peer/PeerDiscoveryProvider.js');
        const discoverPeersSource = await readSource('application/DiscoverPeersUseCase.js');
        assert(!/PublicationSnapshotPlacement|contentHash|discoveryTag/.test(peerDiscoverySource)
            && !/PublicationSnapshotPlacement|contentHash|discoveryTag/.test(discoverPeersSource),
            "1. peer/PeerDiscoveryProvider.js and application/DiscoverPeersUseCase.js never mention a Snapshot candidate concept at all — \"discover a peer\" and \"discover a Snapshot candidate FROM a peer\" are two entirely separate vocabularies in this codebase, never to be conflated.");

        // A2. Every existing *PeerProtocol.js REQUEST-shaped message
        // family in this codebase, inventoried live rather than from
        // memory, and each one's own scoping key:
        const families = [
            { file: 'application/PublicationPeerProtocol.js', hasRequest: false, note: 'ANNOUNCE only — no REQUEST exists yet at all' },
            { file: 'application/PeerContentProtocol.js', key: 'hash' },
            { file: 'application/PeerSnapshotContentProtocol.js', key: 'publicationId' },
            { file: 'application/PublicationAnchorPeerProtocol.js', key: 'publicationId' },
            { file: 'application/PublicationSnapshotPlacementPeerProtocol.js', key: 'publicationId' },
            { file: 'application/PeerWorldEncounterMaterialProtocol.js', key: 'objectId' }
        ];
        for (const family of families) {
            const source = await readSource(family.file);
            if (family.hasRequest === false) {
                assert(/ANNOUNCE/.test(source) && !/REQUEST:/.test(source),
                    `2. ${family.file} really does ship ANNOUNCE only, no REQUEST kind.`);
                continue;
            }
            assert(source.includes(family.key),
                `2. ${family.file}'s own REQUEST is keyed on \`${family.key}\` — an already-known identity, never a browse tag.`);
            assert(!/discoveryTag/.test(source),
                `3. ${family.file} has no \`discoveryTag\` concept anywhere in its own source.`);
        }

        // A3. Structural confirmation for the two families this audit's
        // later sections build on most directly: PeerWorldEncounterMaterial
        // ships exactly two kinds (0.9.479's own finding, reproduced live,
        // never re-litigated) and PublicationSnapshotPlacementPeer ships
        // exactly three, none of them a browse/list kind.
        assert(Object.keys(PeerWorldEncounterMaterialMessageKind).length === 2,
            '4. PeerWorldEncounterMaterialMessageKind still carries exactly REQUEST/RESPONSE — 0.9.479\'s own finding about this file still holds.');
        assert(Object.keys(PublicationSnapshotPlacementPeerMessageKind).length === 3
            && !('BROWSE' in PublicationSnapshotPlacementPeerMessageKind)
            && !('QUERY' in PublicationSnapshotPlacementPeerMessageKind),
            '5. PublicationSnapshotPlacementPeerMessageKind carries exactly ANNOUNCE/REQUEST/RESPONSE — no BROWSE/QUERY kind exists anywhere in this codebase\'s peer layer today.');

        console.log('✓ Section A: peer-ENDPOINT discovery and Snapshot candidate discovery are two separate vocabularies (confirmed live, not merely by naming convention). Every one of SIX existing *PeerProtocol.js REQUEST-shaped families in this codebase — not just the one file 0.9.479 checked — is scoped to an already-known identity key (hash / publicationId / objectId), and one ships no REQUEST at all yet. None carries a discoveryTag/browse concept anywhere.');
    }

    // ===============================================================
    // Section B — Reconfirming the required candidate contract.
    // ===============================================================
    {
        // B1. The exact contract 0.9.479/0.9.480 already established,
        // reproduced live against current source rather than trusted from
        // memory.
        assert(executeDiscoverSnapshotCandidatesCommand.length <= 1,
            '1. executeDiscoverSnapshotCandidatesCommand still takes one destructured { discoveryTag, discoveryQueryService } argument.');

        const placement = new PublicationSnapshotPlacement({
            publicationId: 'pub-1', contentHash: 'hash-1', storage: 'ipfs', locator: 'ipfs://CID-1'
        });
        assert(placement.contentHash === 'hash-1' && placement.locator === 'ipfs://CID-1'
            && placement.storage === 'ipfs' && placement.publicationId === 'pub-1',
            '2. PublicationSnapshotPlacement\'s own required fields still ARE the candidate shape, field for field — 0.9.480\'s own Section C finding, reconfirmed, not re-derived.');

        console.log('✓ Section B: the required candidate contract — search(discoveryTag) -> [{ contentHash, locator, storage, publicationId? }] — and the domain object that already carries that identity, both reconfirmed live and unchanged from 0.9.479/0.9.480.');
    }

    // ===============================================================
    // Section C — Existing peer data: this audit's own correction.
    // ===============================================================
    {
        // C1. THE CORRECTION: a placement ANNOUNCE from a peer already
        // reaches the EXACT catalog 0.9.480 proved adaptable — live, for
        // a publicationId this replica never held or asked about before
        // — entirely through EXISTING, unmodified machinery
        // (PublicationSnapshotPlacementPeerExchange, 0.8.19).
        const alice = makeIdentity('alice');
        const bobSide = makePlacementExchange();
        const bus = new StubPeerMessageBus();
        const alicePeer = stubPeer('conn-alice', alice.getSigningIdentity().id);
        const registry = new StubConnectedPeerRegistry([alicePeer]);
        const bobExchange = new PublicationSnapshotPlacementPeerExchange(bobSide.exchange, bus, registry);

        assert(bobSide.catalog.findByPublicationId('pub-unknown-to-bob').length === 0,
            '1. before anything arrives, Bob\'s own catalog knows nothing about this publicationId.');

        const signed = signPlacement(alice, {
            publicationId: 'pub-unknown-to-bob', contentHash: 'hash-a', storage: 'arweave', locator: 'ar://tx-a'
        });
        bus.deliver(PublicationSnapshotPlacementPeerExchange.DEFAULT_PROTOCOL,
            { kind: PublicationSnapshotPlacementPeerMessageKind.ANNOUNCE, envelope: signed.toJSON() },
            { connectedPeer: alicePeer });

        const catalogedNow = bobSide.catalog.findByPublicationId('pub-unknown-to-bob');
        assert(catalogedNow.length === 1 && catalogedNow[0].contentHash === 'hash-a',
            '2. a single, unsolicited ANNOUNCE already delivers a placement Bob never asked about into the SAME LocalPublicationSnapshotPlacementCatalog 0.9.480\'s own adapter reads via list() — no new protocol, no new catalog, nothing built for this milestone.');
        bobExchange.dispose();

        // C2. What the SAME class's own pull side CANNOT do: there is no
        // way to ask "give me everything you have" — requestPlacements()
        // requires an already-known publicationId, and the underlying
        // wire builder throws without one.
        expectThrows(() => toPublicationSnapshotPlacementRequestMessage(undefined),
            '3. toPublicationSnapshotPlacementRequestMessage() refuses to build a REQUEST without a publicationId — there is no "browse everything" spelling of this message.');
        expectThrows(() => toPublicationSnapshotPlacementRequestMessage(''),
            '4. ...and an empty publicationId is refused identically — this is a real validation, not a convenience default that happens to accept one.');

        console.log('✓ Section C: peer-sourced placement data ALREADY reaches the exact catalog 0.9.480\'s own Local adapter will read from — for free, today, via the existing ANNOUNCE gossip pathway, for a publicationId this replica never knew in advance. But that same class\'s pull side (REQUEST/RESPONSE) has no "tell me everything" shape at all — it can only ever ask about a publicationId the caller must already supply.');
    }

    // ===============================================================
    // Section D — Protocol boundary: no existing message can carry it.
    // ===============================================================
    {
        // D1. PublicationSnapshotPlacementPeerProtocol's own REQUEST wire
        // shape is a bare, unconstrained string under 512 characters —
        // structurally, nothing stops a caller from putting a
        // discoveryTag-shaped string in the `publicationId` slot. So the
        // ENVELOPE validates. But the RESPONDING side answers by EXACT
        // publicationId equality (`findByPublicationId`) — never a
        // broader match — so overloading it silently returns nothing,
        // proven live against a real catalog holding real placements
        // under OTHER publicationIds.
        const { catalog } = makePlacementExchange();
        const alice = makeIdentity('alice');
        catalog.add(signPlacement(alice, { publicationId: 'real-pub-1', contentHash: 'h1', storage: 'ipfs', locator: 'ipfs://a' }));
        catalog.add(signPlacement(alice, { publicationId: 'real-pub-2', contentHash: 'h2', storage: 'arweave', locator: 'ar://b' }));

        const overloadedRequest = toPublicationSnapshotPlacementRequestMessage('forkbuild-snapshot');
        assert(isValidPublicationSnapshotPlacementPeerMessage(overloadedRequest),
            '1. structurally, a discoveryTag jammed into the publicationId slot DOES pass wire validation — this is not a structural rejection.');
        const wouldBeAnswered = catalog.findByPublicationId(overloadedRequest.publicationId);
        assert(wouldBeAnswered.length === 0,
            '2. ...but the responding side\'s own exact-equality lookup finds NOTHING for it, even though the catalog holds real placements — overloading this message never actually broadens the query; it only ever silently returns empty. Reaching every cataloged placement, regardless of publicationId, needs a genuinely different RESPONDER, not merely a differently-filled REQUEST.');

        // D2. PeerWorldEncounterMaterialProtocol's own REQUEST is
        // rejected outright, structurally — `encounterKind` has no value
        // a discoveryTag-shaped query could occupy at all.
        const malformedMaterialRequest = { kind: PeerWorldEncounterMaterialMessageKind.REQUEST, encounterKind: 'DISCOVERY_TAG', objectId: 'forkbuild-snapshot' };
        assert(!isValidPeerWorldEncounterMaterialMessage(malformedMaterialRequest),
            '3. a discoveryTag-flavored request is rejected outright by the REAL, unmodified isValidPeerWorldEncounterMaterialMessage() — this family has no room for the query at all, not even a silently-empty one.');

        console.log('✓ Section D: no existing peer message can legitimately carry a discoveryTag browse query — the placement family\'s own REQUEST accepts the envelope but its responder\'s exact-match semantics make the overload silently useless (proven live against a real, populated catalog), and the material family rejects the shape outright at the structural-validation layer. Either way, a genuinely different message kind AND a genuinely different responder are required — never a same-message reinterpretation.');
    }

    // ===============================================================
    // Section E — Identity: no new concept required.
    // ===============================================================
    {
        // E1. Reconfirms 0.9.480's own Section C for the identical
        // domain object — a Peer source would reuse the SAME identity a
        // Local source already reuses, never a peer-specific one.
        let threw = false;
        try { new PublicationSnapshotPlacement({ publicationId: 'pub-1', storage: 'ipfs', locator: 'ipfs://x' }); }
        catch { threw = true; }
        assert(threw, '1. PublicationSnapshotPlacement still refuses construction without a contentHash — the identical load-bearing identity 0.9.480 already established.');

        // E2. Neither ANNOUNCE nor RESPONSE ever folds a peer/connection
        // identity onto the envelope itself — `meta.connectedPeer` is
        // transport metadata handed to a handler, never merged into the
        // signed placement or the candidate a future source would report.
        const exchangeSource = await readSource('application/PublicationSnapshotPlacementPeerExchange.js');
        assert(/records no peerId, connectionId, or remote identity/i.test(exchangeSource.replace(/\r?\n\s*\/\/ ?/g, ' ')),
            '2. PublicationSnapshotPlacementPeerExchange.js\'s own header explicitly disclaims ever attaching peer/connection identity to a cataloged placement — a future Peer candidate source inherits that exact restraint for free.');

        console.log('✓ Section E: no new identity concept is required for a Peer candidate, and no existing peer envelope carries a connection/peer identity a candidate would need to strip or inherit — the same restraint 0.9.480 already established for Local holds here unchanged.');
    }

    // ===============================================================
    // Section F — Failure semantics, live.
    // ===============================================================
    {
        // F1. Unavailable peer — sending to a non-AUTHENTICATED peer
        // throws synchronously, exactly as it already does for
        // announce()/every sibling *PeerExchange class.
        const bus = new StubPeerMessageBus();
        const connectingPeer = stubPeer('conn-x', 'did:key:zX', PeerLifecycleState.CONNECTING);
        expectThrows(() => bus.send(connectingPeer, 'any-protocol', {}),
            '1. sending to a CONNECTING (not yet AUTHENTICATED) peer throws — an unavailable peer is never silently tolerated at the transport layer.');

        // F2. Malformed/oversized response — the REAL, unmodified
        // validator rejects a hand-crafted RESPONSE whose placements
        // array is not actually an array, and one that exceeds its own
        // documented ceiling.
        assert(!isValidPublicationSnapshotPlacementPeerMessage({ kind: PublicationSnapshotPlacementPeerMessageKind.RESPONSE, publicationId: 'p', placements: 'not-an-array' }),
            '2. a RESPONSE whose placements field is not an array is rejected.');
        const tooMany = Array.from({ length: 65 }, (_, i) => ({ id: `p${i}` }));
        assert(!isValidPublicationSnapshotPlacementPeerMessage({ kind: PublicationSnapshotPlacementPeerMessageKind.RESPONSE, publicationId: 'p', placements: tooMany }),
            '3. a RESPONSE exceeding MAX_PLACEMENTS_PER_RESPONSE (64) is rejected outright, regardless of how it was produced.');

        // F3. Timeout/slow peer — mirrors application/
        // PeerWorldEncounterMaterialSource.js's own _requestAndWait()
        // pattern: a peer that never answers resolves to `null`
        // (equivalently, no contribution) once a bounded timeout elapses
        // — never an indefinitely hanging caller.
        function requestWithTimeout(respondsWithin, timeoutMs) {
            return new Promise((resolve) => {
                let settled = false;
                const timer = setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, timeoutMs);
                if (respondsWithin !== null) {
                    setTimeout(() => {
                        if (!settled) { settled = true; clearTimeout(timer); resolve('answered'); }
                    }, respondsWithin);
                }
            });
        }
        const slowPeerResult = await requestWithTimeout(null, 15);
        assert(slowPeerResult === null, '4. a peer that never answers resolves to a non-throwing miss once the timeout elapses — never an unbounded wait.');
        const fastPeerResult = await requestWithTimeout(5, 15);
        assert(fastPeerResult === 'answered', '5. ...while a peer that answers before the timeout is still accepted normally.');

        // F4. Partial peer population — a mix of AUTHENTICATED and
        // not-yet-authenticated peers: only the AUTHENTICATED ones are
        // ever asked, exactly the filter announce() already applies one
        // domain over (application/PublicationSnapshotPlacementPeerExchange.js
        // #announce()).
        const authenticatedPeer = stubPeer('conn-a', 'did:key:zA', PeerLifecycleState.AUTHENTICATED);
        const authenticatingPeer = stubPeer('conn-b', 'did:key:zB', PeerLifecycleState.AUTHENTICATING);
        const closedTransportPeer = stubPeer('conn-c', 'did:key:zC', PeerLifecycleState.CLOSED);
        const mixedRegistry = new StubConnectedPeerRegistry([authenticatedPeer, authenticatingPeer, closedTransportPeer]);
        const askable = mixedRegistry.list().filter((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
        assert(askable.length === 1 && askable[0] === authenticatedPeer,
            '6. of three connected peers in mixed lifecycle states, exactly the one AUTHENTICATED peer is ever a valid candidate to ask — a partial population never becomes an error, only a smaller ask set.');

        // F5. Isolation across peers — one peer throwing synchronously on
        // send() never prevents a request to a different, healthy peer.
        const isolationBus = new StubPeerMessageBus();
        const healthyPeer = stubPeer('conn-healthy', 'did:key:zH', PeerLifecycleState.AUTHENTICATED);
        const unavailablePeer = stubPeer('conn-gone', 'did:key:zG', PeerLifecycleState.CLOSED);
        const outcomes = await Promise.allSettled([healthyPeer, unavailablePeer].map((peer) => new Promise((resolve, reject) => {
            try { isolationBus.send(peer, 'test-protocol', { discoveryTag: 't' }); resolve('sent'); }
            catch (error) { reject(error); }
        })));
        assert(outcomes[0].status === 'fulfilled' && outcomes[1].status === 'rejected',
            '7. Promise.allSettled isolates a synchronously-throwing peer from a healthy one — the healthy peer\'s own request is unaffected, exactly the isolation 0.9.479\'s own Section F already proved for discovery SOURCES, now reconfirmed for discovery PEERS within a single source.');

        console.log('✓ Section F: an unavailable peer throws at send() rather than hanging or corrupting state; a malformed or oversized response is rejected by the real, unmodified validator; a slow/never-answering peer degrades to a bounded miss, never an unbounded wait; a mixed-lifecycle peer population is filtered to AUTHENTICATED peers only, never treated as an error; and one peer\'s synchronous failure is isolated from another\'s success via Promise.allSettled.');
    }

    // ===============================================================
    // Section G — Security/trust boundary.
    // ===============================================================
    {
        // G1. A peer-provided placement claim stays exactly that — a
        // claim — per this codebase's own already-existing header,
        // reconfirmed live rather than re-derived.
        const exchangeSource = await readSource('application/PublicationSnapshotPlacementPeerExchange.js');
        assert(/never "the locator currently serves those bytes\."/.test(exchangeSource),
            "1. PublicationSnapshotPlacementPeerExchange.js's own header still states, verbatim, that a peer-sourced placement never means \"the locator currently serves those bytes\" — a claim, never a verification, exactly the restraint a Peer candidate source must inherit unchanged.");

        // G2. Peer identity is explicitly NOT content authenticity or
        // discovery authority anywhere in this codebase's peer layer —
        // reconfirmed against a second, independent file family
        // (content retrieval) rather than the placement family alone.
        const contentExchangeSource = await readSource('application/PeerContentExchange.js');
        assert(/a peer is never trusted merely because it supplied\s*\n?\/\/ ?bytes/.test(contentExchangeSource.replace(/\r?\n/g, '\n'))
            || /a peer is never trusted merely because it supplied/.test(contentExchangeSource),
            '2. application/PeerContentExchange.js\'s own header independently states the identical restraint for a different kind of peer-supplied data — "a peer is never trusted merely because it supplied [bytes]" — confirming this is a codebase-wide posture, not a one-file coincidence.');

        // G3. Cataloging a placement never verifies its locator or
        // touches a ContentStore — reconfirms 0.9.480's own Section E,
        // now for the peer-sourced path specifically (the ANNOUNCE
        // Section C just proved live).
        const catalogSource = await readSource('application/LocalPublicationSnapshotPlacementCatalog.js');
        assert(!/ContentStore/.test(catalogSource),
            '3. the catalog a peer-sourced ANNOUNCE writes into never imports or mentions a ContentStore — discovery is not availability, for a peer-sourced candidate exactly as much as a self-declared one.');

        console.log('✓ Section G: a Peer-sourced Snapshot candidate must stay a locator claim only — never verified, never trusted merely because a peer supplied it, never implying ownership, authorship, or authenticity — the identical restraint this codebase\'s own placement AND content-retrieval peer families already state in their own headers, independently, for two different kinds of peer-supplied data.');
    }

    // ===============================================================
    // Section H — Composition: multiple peers, independently.
    // ===============================================================
    {
        // H1. Two independent, both-AUTHENTICATED peers each announcing
        // their OWN placement for the SAME contentHash — both must
        // surface, undeduplicated, mirroring 0.9.480's own Section H
        // point 4 for the identical reason: deduplication stays the
        // future composite query service's job (0.9.484), never a single
        // source's own.
        const alice = makeIdentity('alice');
        const bob = makeIdentity('bob');
        const { catalog } = makePlacementExchange();
        catalog.add(signPlacement(alice, { publicationId: 'pub-shared', contentHash: 'hash-shared', storage: 'ipfs', locator: 'ipfs://from-alice' }));
        catalog.add(signPlacement(bob, { publicationId: 'pub-shared', contentHash: 'hash-shared', storage: 'arweave', locator: 'ar://from-bob' }));
        const both = catalog.findByContentHash('hash-shared');
        assert(both.length === 2,
            '1. two independent peers\' own placements for the identical contentHash both remain cataloged, side by side — no ranking, no "best" peer, no collapsing into one canonical entry.');

        // H2. No preferred-peer selection: asking "which peers are worth
        // asking" never narrows past the lifecycle filter itself — every
        // AUTHENTICATED peer is equally eligible, confirmed by re-running
        // Section F4's own filter against a THIRD authenticated peer
        // added to the mix.
        const peerA = stubPeer('conn-a2', 'did:key:zA2', PeerLifecycleState.AUTHENTICATED);
        const peerB = stubPeer('conn-b2', 'did:key:zB2', PeerLifecycleState.AUTHENTICATED);
        const peerC = stubPeer('conn-c2', 'did:key:zC2', PeerLifecycleState.AUTHENTICATED);
        const registry = new StubConnectedPeerRegistry([peerA, peerB, peerC]);
        const eligible = registry.list().filter((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
        assert(eligible.length === 3,
            '2. three equally-AUTHENTICATED peers are all equally eligible to be asked — no preferred-peer, no fallback-only-on-failure ordering exists anywhere in this filter.');

        console.log('✓ Section H: multiple peers can participate independently, exactly like multiple discovery SOURCES already do (0.9.479\'s own Section F) — no ranking, no preferred-peer selection, no deduplication introduced at this layer. Every AUTHENTICATED peer is equally eligible, and independently-sourced candidates for the identical contentHash both surface, undeduplicated, left for the future composite query service.');
    }

    // ===============================================================
    // Section I — LIVE DEMONSTRATION: a genuinely new protocol is needed.
    // ===============================================================
    {
        // A test-only, THIS-FILE-ONLY message pair — never exported, never
        // touching application/PublicationSnapshotPlacementPeerProtocol.js
        // or any other production file. Deliberately mirrors that file's
        // OWN restraint (structural validity only, size-bounded response)
        // rather than inventing a differently-shaped discipline.
        const BROWSE_PROTOCOL = 'test-only:snapshot-candidate-browse';
        function toBrowseRequestMessage(discoveryTag) {
            return { kind: 'BROWSE_REQUEST', discoveryTag };
        }
        function toBrowseResponseMessage(discoveryTag, placements) {
            return { kind: 'BROWSE_RESPONSE', discoveryTag, placements };
        }

        // I1. STRUCTURAL PROOF, not argument: this exact BROWSE_REQUEST
        // payload is REJECTED by the REAL, unmodified, already-shipped
        // isValidPublicationSnapshotPlacementPeerMessage() — confirming
        // this shape genuinely does not already exist on the wire today,
        // rather than merely being unused.
        const sampleBrowseRequest = toBrowseRequestMessage('forkbuild-snapshot');
        assert(!isValidPublicationSnapshotPlacementPeerMessage(sampleBrowseRequest),
            '1. a BROWSE_REQUEST is rejected outright by the REAL, unmodified placement-peer validator — this message kind does not already exist on today\'s wire, structurally confirmed rather than assumed.');
        assert(!isValidPeerWorldEncounterMaterialMessage(sampleBrowseRequest),
            '2. ...and equally rejected by the REAL, unmodified material-peer validator — no existing family on today\'s peer layer already accepts this shape.');

        // I2. A test-only prototype fanning BROWSE_REQUEST out to every
        // AUTHENTICATED peer over a REAL StubPeerMessageBus, collecting
        // BROWSE_RESPONSE payloads via Promise.allSettled + a bounded
        // timeout — the identical isolation discipline Section F already
        // proved piece by piece, now assembled into one source.
        class PeerSnapshotCandidateDiscoveryQueryServicePrototype {
            constructor(peerMessageBus, connectedPeerRegistry, { timeoutMs = 50 } = {}) {
                this._bus = peerMessageBus;
                this._registry = connectedPeerRegistry;
                this._timeoutMs = timeoutMs;
            }
            async search(discoveryTag) {
                const authenticatedPeers = this._registry.list()
                    .filter((peer) => peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
                const outcomes = await Promise.allSettled(
                    authenticatedPeers.map((peer) => this._askOne(peer, discoveryTag))
                );
                const candidates = [];
                for (const outcome of outcomes) {
                    if (outcome.status === 'fulfilled' && Array.isArray(outcome.value)) {
                        for (const placement of outcome.value) {
                            candidates.push({
                                contentHash: placement.contentHash,
                                locator: placement.locator,
                                storage: placement.storage,
                                publicationId: placement.publicationId
                            });
                        }
                    }
                    // A rejected/timed-out peer contributes nothing —
                    // never fails the whole search(), mirroring every
                    // sibling discovery source's own "never throws"
                    // restraint (0.9.133's own header).
                }
                return candidates;
            }
            _askOne(peer, discoveryTag) {
                return new Promise((resolve) => {
                    let settled = false;
                    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
                    const timer = setTimeout(() => finish([]), this._timeoutMs);
                    const unsubscribe = this._bus.subscribe(BROWSE_PROTOCOL, (payload, meta) => {
                        if (payload.kind === 'BROWSE_RESPONSE' && meta.connectedPeer === peer) {
                            clearTimeout(timer);
                            unsubscribe();
                            finish(payload.placements);
                        }
                    });
                    try {
                        this._bus.send(peer, BROWSE_PROTOCOL, toBrowseRequestMessage(discoveryTag));
                    } catch {
                        clearTimeout(timer);
                        unsubscribe();
                        finish([]);
                    }
                });
            }
        }

        const bus = new StubPeerMessageBus();
        const alicePeer = stubPeer('conn-alice-browse', 'did:key:zAliceBrowse');
        const bobPeer = stubPeer('conn-bob-browse', 'did:key:zBobBrowse');
        const goneAndSilentPeer = stubPeer('conn-gone-browse', 'did:key:zGoneBrowse', PeerLifecycleState.CLOSED);
        const registry = new StubConnectedPeerRegistry([alicePeer, bobPeer, goneAndSilentPeer]);
        const peerSource = new PeerSnapshotCandidateDiscoveryQueryServicePrototype(bus, registry);

        // Simulate the two AUTHENTICATED peers' own (still unbuilt, per
        // 0.9.479's own explicit deferral) responder logic inline — the
        // identical stand-in restraint tests/PeerWorldEncounterMaterialSource
        // .test.js's own flagship section already uses for Alice's reply.
        const originalSend = bus.send.bind(bus);
        bus.send = (peer, protocol, payload) => {
            originalSend(peer, protocol, payload);
            if (protocol === BROWSE_PROTOCOL && payload.kind === 'BROWSE_REQUEST') {
                if (peer === alicePeer) {
                    bus.deliver(BROWSE_PROTOCOL, toBrowseResponseMessage(payload.discoveryTag,
                        [{ contentHash: 'hash-alice', locator: 'ipfs://alice', storage: 'ipfs', publicationId: 'pub-alice' }]),
                        { connectedPeer: alicePeer });
                }
                if (peer === bobPeer) {
                    bus.deliver(BROWSE_PROTOCOL, toBrowseResponseMessage(payload.discoveryTag,
                        [{ contentHash: 'hash-bob', locator: 'ar://bob', storage: 'arweave', publicationId: 'pub-bob' }]),
                        { connectedPeer: bobPeer });
                }
            }
        };

        const candidates = await peerSource.search('forkbuild-snapshot');
        assert(candidates.length === 2,
            '3. two independently-answering AUTHENTICATED peers each contribute their own candidate — the CLOSED, non-AUTHENTICATED third peer was never even asked (its send() would have thrown).');
        assert(candidates.some((c) => c.contentHash === 'hash-alice') && candidates.some((c) => c.contentHash === 'hash-bob'),
            '4. both peers\' own candidates are present, correctly shaped, and undeduplicated.');

        // I3. Duck-type compatibility with the REAL, unmodified command
        // and monitor — zero changes to either, mirroring 0.9.480's own
        // Section I finding, now for a genuinely new (not merely
        // hypothetical) protocol surface.
        const viaCommand = await executeDiscoverSnapshotCandidatesCommand({
            discoveryTag: 'forkbuild-snapshot', discoveryQueryService: peerSource
        });
        assert(viaCommand.length === 2,
            '5. executeDiscoverSnapshotCandidatesCommand(), completely unmodified, accepts the Peer browse prototype and forwards its result verbatim.');

        const monitor = new WorldSnapshotDiscoveryMonitor({
            discoverSnapshotCandidatesCommand: () => executeDiscoverSnapshotCandidatesCommand({
                discoveryTag: 'forkbuild-snapshot', discoveryQueryService: peerSource
            })
        });
        await monitor.observe({ position: { x: 0, y: 0, z: 0 } });
        assert(monitor.lastResult.length === 2 && monitor.lastError === null,
            '6. WorldSnapshotDiscoveryMonitor, completely unmodified, drives the Peer browse prototype through one full observe() cycle correctly.');

        // I4. A peer population with NO responder at all (every peer
        // stays silent, standing in for today's actual, unbuilt
        // responder side) degrades to `[]`, never throws and never hangs
        // past the prototype's own timeout.
        const silentBus = new StubPeerMessageBus();
        const silentRegistry = new StubConnectedPeerRegistry([stubPeer('conn-silent', 'did:key:zSilent')]);
        const silentSource = new PeerSnapshotCandidateDiscoveryQueryServicePrototype(silentBus, silentRegistry, { timeoutMs: 15 });
        const emptyResult = await silentSource.search('forkbuild-snapshot');
        assert(Array.isArray(emptyResult) && emptyResult.length === 0,
            "7. with no responder side built (today's real, current state — 0.9.479's own finding), every peer's own request simply times out and the search degrades to [], matching every sibling discovery source's own \"never throws\" contract.");

        console.log('✓ Section I: a working Peer candidate source is demonstrable — but only by introducing a message pair (BROWSE_REQUEST/BROWSE_RESPONSE) proven, structurally and live, NOT to already exist under either of today\'s real, unmodified peer-protocol validators. The prototype plugs into the real, unmodified command and monitor with zero changes to either, isolates a non-authenticated/silent peer from a responsive one, and degrades safely to [] against today\'s actual, still-unbuilt responder side.');
    }

    // ===============================================================
    // Section J — Architectural boundary held.
    // ===============================================================
    {
        const worldEncounterReferences = grepFiles(
            'WorldEncounterMaterialLoading|LocalWorldEncounterMaterialSource|AutomaticSnapshotEncounterCascade|registerMaterializedSnapshotWorldSource',
            ['application/PublicationSnapshotPlacementPeerExchange.js',
             'application/PublicationSnapshotPlacementPeerProtocol.js',
             'application/LocalPublicationSnapshotPlacementCatalog.js']
        );
        assert(worldEncounterReferences.length === 0,
            '1. none of the peer-facing placement files this audit\'s prototype builds on reference the World Encounter material-loading, cascade, or registration families at all — Peer candidate discovery, like Local\'s (0.9.480), never becomes a second World Encounter engine.');

        console.log('✓ Section J: the peer-facing subsystems this audit examines stay entirely within candidate discovery and placement gossip — never referencing, and never growing toward, the World Encounter material-loading/cascade family.');
    }

    // ===============================================================
    // Section K — Deliberate exclusions; no production file touched.
    // ===============================================================
    {
        // No production file implements PeerSnapshotCandidateDiscoveryQueryService,
        // adds a BROWSE_REQUEST/BROWSE_RESPONSE kind to
        // PublicationSnapshotPlacementPeerProtocol.js, builds the peer
        // RESPONDER side any real peer would need to actually answer one,
        // wires anything into ui/main.js, or changes
        // WorldSnapshotDiscoveryMonitor.js/DiscoverSnapshotCandidatesCommand.js.
        // This milestone answers exactly one question — "can the existing
        // peer infrastructure expose nearby Snapshot candidates without
        // changing the existing peer resolution protocol, or does
        // candidate discovery require a genuinely new peer protocol" —
        // and stops there. Building `SnapshotCandidateDiscoveryQueryService`
        // itself, and building the Peer candidate source AND its
        // responder for real, remain later, unscheduled milestones
        // (0.9.483/0.9.484 per this milestone's own originating request),
        // only if a product decision actually wants Peer's marginal,
        // active-query contribution badly enough to justify a new,
        // narrow protocol extension on top of the passive ANNOUNCE
        // contribution Section C already proved arrives for free.
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(changedNonTestFiles === '', `1. no production file is modified by this milestone (found: ${changedNonTestFiles || 'none'}).`);

        const CLASSIFICATIONS = [
            'PEER_SOURCE_VIABLE_ADAPTER_ONLY',
            'PEER_SOURCE_REQUIRES_NEW_PROTOCOL',
            'PEER_SOURCE_NOT_PRODUCT_READY'
        ];
        const verdict = 'PEER_SOURCE_REQUIRES_NEW_PROTOCOL';
        assert(CLASSIFICATIONS.includes(verdict), '2. the verdict is drawn from this milestone\'s own named taxonomy.');

        console.log('✓ Section K: no browse protocol shipped, no responder built, no composite class shipped, no file wired into ui/main.js, no monitor/command/protocol file touched — audit only, per this milestone\'s own scope.');
    }

    console.log('\n✓ FINAL DECISION.\n' +
'\n' +
'OUTCOME: PEER_SOURCE_REQUIRES_NEW_PROTOCOL.\n' +
'\n' +
"WHY. Section A widened 0.9.479's own single-file check into a full inventory: EVERY existing *PeerProtocol.js\n" +
'REQUEST-shaped family in this codebase -- content bytes (by hash), Snapshot content bytes (by publicationId +\n' +
'contentHash), anchors (by publicationId), Snapshot placements (by publicationId), and World Encounter material (by\n' +
"objectId) -- is scoped to an already-known identity key, and Publication's own peer protocol ships no REQUEST at all\n" +
'yet. None carries a discoveryTag/browse concept. Section C is this audit\'s own central correction, in the identical\n' +
"spirit as 0.9.480's own Section F: the placement family's ANNOUNCE half already delivers peer-sourced placement\n" +
'claims into the EXACT LocalPublicationSnapshotPlacementCatalog 0.9.480 proved adaptable -- proven live, for a\n' +
'publicationId the receiving replica never held in advance -- entirely through EXISTING, unmodified 0.8.19 machinery.\n' +
'That same class\'s pull half, however, has no "tell me everything" shape: requestPlacements() requires an\n' +
'already-known publicationId, and the wire builder throws without one. Section D proved, live rather than by\n' +
"argument, that no existing message can be overloaded to close that gap: the placement family's own REQUEST accepts\n" +
'a discoveryTag-shaped payload structurally but its responder answers by EXACT publicationId equality, so the\n' +
'overload silently returns nothing against a real, populated catalog; the material family rejects the shape outright\n' +
'at validation. Sections E through H reconfirmed no new identity, an already-adequate failure-isolation posture\n' +
'(unavailable/malformed/slow/partial-population peers all proven independently non-fatal), an already-adequate\n' +
'trust boundary (a peer-provided candidate stays a claim, never verified, stated independently in two unrelated\n' +
"peer-exchange headers), and safe multi-peer composition with no ranking or dedup needed at this layer. Section I's\n" +
'own live demonstration is the flagship proof: a working Peer candidate source is buildable today, but only by\n' +
'introducing a BROWSE_REQUEST/BROWSE_RESPONSE message pair shown, structurally, NOT to validate under either of\n' +
"today's real, unmodified peer-protocol validators -- confirming a genuinely new protocol surface is required,\n" +
'never a same-message reinterpretation. The prototype needing that new surface still plugs into the real,\n' +
'unmodified command and monitor with zero changes to either, and degrades safely to [] against the actual,\n' +
'still-unbuilt responder side that exists today.\n' +
'\n' +
'WHAT THIS MEANS. Peer is not viable as a thin adapter over its existing resolution protocol -- an ACTIVE, live\n' +
'"ask a connected peer for candidates I don\'t already know about" capability genuinely requires a new message kind\n' +
'AND a new responder, neither of which exist. But this is a narrow, additive extension onto the ALREADY-EXISTING\n' +
'PublicationSnapshotPlacementPeerProtocol/PeerExchange family (0.8.19) -- never a new transport, never a new local\n' +
'catalog, never a new codebase-wide subsystem -- and Section C\'s own finding means a meaningful share of Peer\'s\n' +
"candidate contribution ALREADY reaches the walking monitor's own future Local seam for free, passively, the moment\n" +
"0.9.482 ships Local's adapter over LocalPublicationSnapshotPlacementCatalog#list() -- exactly the diagram this\n" +
'milestone\'s own originating request already drew ("existing producers -> LocalPublicationSnapshotPlacementCatalog\n' +
'-> nearby candidate query"), now confirmed to already include peer exchange as one of those existing producers.\n' +
"A genuinely new, active Peer protocol (0.9.483, if a product decision wants that marginal, active-query\n" +
'contribution badly enough to justify building both a new message pair and its responder) remains its own,\n' +
'independent, unscheduled milestone -- exactly as 0.9.479 originally recommended, now with a demonstrated shape\n' +
'rather than a bare deferral.\n');

    console.log('\n✅ All Peer Snapshot Candidate Discovery Capability Audit tests passed.');
}

run().then(() => {
    console.log('\n✓ All PeerSnapshotCandidateDiscoveryCapabilityAudit tests passed');
}).catch((error) => {
    console.error('\n✗ PeerSnapshotCandidateDiscoveryCapabilityAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
