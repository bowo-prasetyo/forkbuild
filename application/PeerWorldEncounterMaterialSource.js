import { WorldEncounterMaterialSource } from './WorldEncounterMaterialLoading.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { Publication } from '../publisher/Publication.js';
import { AvatarProfile } from '../core/AvatarProfile.js';
import { EventBus } from '../core/events/EventBus.js';
import {
    PeerWorldEncounterMaterialMessageKind,
    toWorldEncounterMaterialRequestMessage,
    isValidPeerWorldEncounterMaterialMessage
} from './PeerWorldEncounterMaterialProtocol.js';

const MATERIAL_RECEIVED_EVENT = 'PeerWorldEncounterMaterialReceived';
const PEER_ORIGIN_PREFIX = 'peer:';

// 0.9.23 — Peer World Encounter Material Source.
//
// 0.9.21 named the seam and left `materialSources.peer` unplugged; 0.9.22
// plugged in the local half. This is the peer half — a concrete
// `WorldEncounterMaterialSource` that answers, for a resolved
// `peer:<identityId>`-origin selection, "please give me the material for
// the object I already selected from you," and nothing else.
//
//   { kind, objectId, origin: 'peer:did:key:z...' }
//                │
//                ▼
//   application/WorldEncounterMaterialLoading.js   (0.9.21, unmodified)
//        loadWorldEncounterMaterial()
//                │
//                ▼
//   application/PeerWorldEncounterMaterialSource.js   ★ (THIS milestone)
//        PeerWorldEncounterMaterialSource#load()
//                │
//                ▼
//   peer/PeerMessageBus.js   (0.2.52, unmodified — already-existing
//        .send() / .subscribe() / .attach()          multiplexed transport)
//                │
//                ▼
//   the ALREADY-CONNECTED peer this origin names
//                │
//                ▼
//   Publication / AvatarProfile   (or null — no answer before timeout)
//
// A RESOLVED SELECTION NAMES A PEER; THIS FILE NEVER RE-DISCOVERS ONE.
// `origin` already identifies exactly which peer's own World data a
// Wanderer's click resolved to (0.9.19/0.9.20) — this class only ever
// parses that origin down to an `identityId` and looks up the matching,
// already-`ConnectedPeerRegistry`-tracked peer. It never asks a peer "what
// do you have," never re-runs discovery, never enumerates a peer's own
// catalog, and never accepts an answer from anyone but the one peer the
// selection already named. A request for object X from peer Y means
// exactly "give me the material for X" — never "tell me everything you
// know."
//
// REUSES peer/PeerMessageBus.js — THE EXISTING MULTIPLEXED TRANSPORT —
// RATHER THAN INVENTING A SECOND ONE. Exactly the restraint application/
// PeerContentExchange.js and application/
// PublicationSnapshotContentPeerExchange.js already hold: peer/
// PeerMessageBus.js already solved namespaced, AUTHENTICATED-only,
// malformed/oversized/duplicate-safe delivery over one already-established
// connection. This class attaches to a caller-supplied bus/registry pair
// exactly like those two siblings' own constructors do, under its own
// `'forkbuild:world-encounter-material'` namespace, and never imports
// `peer/PeerConnection.js`, `peer/WebRtcPeerConnection.js`, or any
// `PeerConnectionProvider` — establishing, authenticating, or closing a
// connection is never this file's job.
//
// THE WIRE PROTOCOL LIVES IN application/PeerWorldEncounterMaterialProtocol.js,
// NEVER INLINE HERE. Message shape, validation, and the size ceiling are
// a separate, self-contained module — this class only ever calls
// `toWorldEncounterMaterialRequestMessage()` and
// `isValidPeerWorldEncounterMaterialMessage()`; it never hand-assembles or
// hand-validates a wire envelope of its own.
//
// REQUESTER ONLY — THIS MILESTONE NEVER ANSWERS AN INCOMING REQUEST. An
// incoming `REQUEST` (a peer asking THIS device for material) is
// structurally recognized and silently ignored: no local material lookup,
// no RESPONSE ever sent from here. Answering another peer's request for
// material — deciding what THIS device is willing to hand out, and from
// where — is a genuinely separate concern (who may ask, what may be
// served, how a local lookup even happens for a peer-facing request) and
// is explicitly separate, later, unscheduled work (the responder;
// unnumbered — 0.9.24 itself now names Decentralized World Discovery
// Source Boundary instead). Building both directions into one class now
// would make this milestone responsible for peer-facing authorization it
// was never asked to design.
//
// EXACTLY ONE PEER IS EVER ASKED — NO FALLBACK, NO BROADCAST, NO RANKING.
// `load()` sends a REQUEST to the one `ConnectedPeer` `origin` names and
// waits only for a RESPONSE that both matches the requested
// `{ encounterKind, objectId }` AND comes from THAT SAME peer
// (`connectedPeer.connectionId` equality) — a different, even fully
// authenticated, connected peer answering with a matching `objectId` is
// never accepted as a substitute. This is the one rule the task's own
// framing insisted on: a peer source must never silently substitute
// another peer because the requested peer cannot provide the material.
//
// NEVER VERIFIES, NEVER TRUSTS, NEVER CACHES. A `Publication`'s own
// `signature` field, if present in the received material, is deserialized
// and returned exactly as supplied — this class never reads it, never
// verifies it, and never decides whether the peer that sent it is
// trustworthy; that stays separate, later, unscheduled work (a future
// verification boundary, unnumbered). Every `load()` call re-sends a fresh
// REQUEST and re-waits fresh — nothing here is memoized, and a second call
// for the identical selection is indistinguishable, on the wire, from the
// first.
//
// `resolvedSelection` IS NEVER MUTATED, AND THE ORIGIN'S IDENTITY IS
// PARSED, NEVER GUESSED. `origin` must be exactly `'peer:' + identityId`
// with a non-empty `identityId` — the SAME convention peer/
// PeerWorldDataIngress.js#derivePeerWorldOrigin() already establishes one
// layer up, re-derived here in reverse (origin -> identityId) rather than
// imported, because that file only ever derives the FORWARD direction
// (connectedPeer -> origin) and has no reverse lookup of its own to
// reuse. A local-origin selection (`origin === 'local'`), a malformed
// origin, or an origin naming no currently-connected peer all resolve to
// `null` — never a thrown error, and never a fallback to any other slot.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Answering an incoming REQUEST from another peer.** See "Requester
//   only," above — the responder, unnumbered (0.9.24 itself now names
//   Decentralized World Discovery Source Boundary instead).
// - **Signature verification or any trust decision.** See "Never
//   verifies, never trusts, never caches," above — a future,
//   unnumbered verification boundary.
// - **Caching, retrying beyond the one in-flight wait, or falling back to
//   a second peer.** See "Exactly one peer is ever asked," above.
// - **Re-discovering a peer's own World, or asking for anything beyond
//   the one already-selected `{ encounterKind, objectId }` pair.** See "A
//   resolved selection names a peer," above.
// - **Any change to `application/WorldEncounterMaterialLoading.js`
//   (0.9.21) or to `ui/components/WorldEncounterCanvas.js`.** This source
//   is only ever plugged in as `materialSources.peer` by a future,
//   unscheduled, unnumbered composition-root wiring milestone (0.9.25
//   itself now names Concrete Decentralized Search/Index Discovery
//   Adapter instead).
export class PeerWorldEncounterMaterialSource extends WorldEncounterMaterialSource {
    // peerMessageBus: a peer/PeerMessageBus.js instance — shared, app-wide,
    //   never owned or disposed by this class.
    // connectedPeerRegistry: an application/ConnectedPeerRegistry.js
    //   instance, used both to attach new peers to the bus (exactly like
    //   application/PublicationSnapshotContentPeerExchange.js's own
    //   constructor already does) and to look up the ConnectedPeer a
    //   resolved selection's own `peer:<identityId>` origin names.
    constructor(peerMessageBus, connectedPeerRegistry, {
        protocol = PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL,
        timeoutMs = PeerWorldEncounterMaterialSource.DEFAULT_TIMEOUT_MS
    } = {}) {
        super();
        if (!peerMessageBus || typeof peerMessageBus.send !== 'function' || typeof peerMessageBus.subscribe !== 'function' || typeof peerMessageBus.attach !== 'function') {
            throw new Error('PeerWorldEncounterMaterialSource: a PeerMessageBus is required');
        }
        if (!connectedPeerRegistry || typeof connectedPeerRegistry.list !== 'function' || typeof connectedPeerRegistry.onChange !== 'function') {
            throw new Error('PeerWorldEncounterMaterialSource: a ConnectedPeerRegistry is required');
        }
        this._bus = peerMessageBus;
        this._registry = connectedPeerRegistry;
        this._protocol = protocol;
        this._timeoutMs = timeoutMs;
        this._eventBus = new EventBus();

        for (const peer of this._registry.list()) {
            this._bus.attach(peer);
        }
        this._unsubscribeRegistry = this._registry.onChange((peers) => {
            for (const peer of peers) {
                this._bus.attach(peer);
            }
        });
        this._unsubscribeBus = this._bus.subscribe(this._protocol, (payload, meta) => this._handleIncoming(payload, meta));
    }

    // Returns a Promise resolving to the `Publication`/`AvatarProfile`
    // the peer named by `resolvedSelection.origin` supplies for
    // `{ kind, objectId }`, or to `null` when: the selection is malformed;
    // `origin` is not a well-formed `peer:<identityId>` origin; no
    // currently-connected peer matches that identity; or the matching peer
    // never answers before this instance's own timeout elapses. See this
    // file's own header for exactly what is, and is not, verified.
    async load(resolvedSelection) {
        const { kind, objectId, origin } = resolvedSelection && typeof resolvedSelection === 'object' ? resolvedSelection : {};
        if (typeof objectId !== 'string' || objectId.length === 0) {
            return null;
        }
        if (kind !== WorldEncounterKind.PUBLICATION && kind !== WorldEncounterKind.AVATAR) {
            return null;
        }
        const identityId = parsePeerIdentityId(origin);
        if (identityId === null) {
            return null;
        }
        const peer = this._registry.list().find((candidate) => candidate.remoteIdentity && candidate.remoteIdentity.identityId === identityId);
        if (!peer) {
            return null;
        }

        const material = await this._requestAndWait(peer, kind, objectId);
        if (material === null) {
            return null;
        }
        return deserializeMaterial(kind, material);
    }

    dispose() {
        if (this._unsubscribeRegistry) {
            this._unsubscribeRegistry();
            this._unsubscribeRegistry = null;
        }
        if (this._unsubscribeBus) {
            this._unsubscribeBus();
            this._unsubscribeBus = null;
        }
        // Deliberately does NOT dispose the injected peerMessageBus or
        // connectedPeerRegistry — both are shared, app-wide collaborators
        // this class never owns, the same restraint every sibling
        // *PeerExchange.js in this codebase already documents.
    }

    // Subscribes BEFORE sending, so a same-tick reply (e.g. in a test
    // double) can never race ahead of this class listening for it —
    // identical discipline to application/
    // MaterializeSnapshotFromPeerUseCase.js#_requestAndWait(). Resolves
    // `null` on timeout, on a synchronous send failure (the peer may have
    // disconnected between lookup and send), and matches an incoming
    // RESPONSE only when it carries the exact `{ kind, objectId }` pair
    // requested AND originates from the exact `peer` asked — see this
    // file's own header, "Exactly one peer is ever asked."
    _requestAndWait(peer, kind, objectId) {
        return new Promise((resolve) => {
            let settled = false;
            let timer = null;
            const finish = (material) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                listener.unsubscribe();
                resolve(material);
            };
            const listener = this._eventBus.subscribe(MATERIAL_RECEIVED_EVENT, (event) => {
                if (event.kind === kind
                    && event.objectId === objectId
                    && event.connectedPeer
                    && event.connectedPeer.connectionId === peer.connectionId) {
                    finish(event.material);
                }
            });
            timer = setTimeout(() => finish(null), this._timeoutMs);
            try {
                const message = toWorldEncounterMaterialRequestMessage(kind, objectId);
                this._bus.send(peer, this._protocol, message);
            } catch {
                finish(null);
            }
        });
    }

    // A structurally invalid message is dropped. A REQUEST is dropped too
    // — see this file's own header, "Requester only." Only a valid
    // RESPONSE is ever published for `_requestAndWait()` to observe.
    _handleIncoming(payload, meta) {
        if (!isValidPeerWorldEncounterMaterialMessage(payload)) {
            return;
        }
        if (payload.kind !== PeerWorldEncounterMaterialMessageKind.RESPONSE) {
            return;
        }
        this._eventBus.publish(MATERIAL_RECEIVED_EVENT, {
            kind: payload.encounterKind,
            objectId: payload.objectId,
            material: payload.material,
            connectedPeer: meta.connectedPeer
        });
    }
}

// Namespaced separately from every other *PeerExchange.js protocol this
// codebase already runs over the same shared peer/PeerMessageBus.js —
// never sharing a namespace with 'forkbuild:content',
// 'forkbuild:snapshot-content-transfer', or any other already-registered
// protocol string.
PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL = 'forkbuild:world-encounter-material';

// Same default as application/MaterializeSnapshotFromPeerUseCase.js's own
// DEFAULT_TIMEOUT_MS (0.8.37) — this class asks exactly one peer, so this
// is simply the one wait a caller experiences per load() call.
PeerWorldEncounterMaterialSource.DEFAULT_TIMEOUT_MS = 8000;

// Pure. `origin` -> `identityId`, the reverse of peer/
// PeerWorldDataIngress.js#derivePeerWorldOrigin()'s own `identityId` ->
// `"peer:" + identityId`. Returns `null`, never throws, for anything that
// is not a string beginning with `'peer:'` followed by at least one
// character — this includes `'local'` (0.9.5's own
// LOCAL_WORLD_DISCOVERY_ORIGIN) and any malformed or missing origin.
function parsePeerIdentityId(origin) {
    if (typeof origin !== 'string' || !origin.startsWith(PEER_ORIGIN_PREFIX)) {
        return null;
    }
    const identityId = origin.slice(PEER_ORIGIN_PREFIX.length);
    return identityId.length > 0 ? identityId : null;
}

// Pure. Turns a RESPONSE's own raw `material` (a plain, already-validated
// JSON object) back into the real domain object `LocalWorldEncounterMaterialSource.js`
// (0.9.22) already returns for the same `kind` — never a newly-invented
// shape. Returns `null`, never throws, when the received `material` does
// not actually deserialize into a well-formed `Publication`/`AvatarProfile`
// — a malformed or lying RESPONSE degrades to "not currently available,"
// exactly like every other miss this file's own `load()` reports.
function deserializeMaterial(kind, material) {
    try {
        if (kind === WorldEncounterKind.PUBLICATION) {
            return Publication.fromJSON(material);
        }
        if (kind === WorldEncounterKind.AVATAR) {
            return AvatarProfile.fromJSON(material);
        }
    } catch {
        return null;
    }
    return null;
}
