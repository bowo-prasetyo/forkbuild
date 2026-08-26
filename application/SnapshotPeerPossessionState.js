// 0.8.40 — Snapshot Possession Observation Exchange.
//
// Names every state application/ObservePeerSnapshotPossessionUseCase.js
// #execute() can end in — the REQUESTER's own three-value vocabulary for
// "what did asking one peer about one contentHash actually tell me?" — the
// identical "one enum, one file" shape application/
// PeerSnapshotMaterializationOutcome.js (0.8.37) already established, one
// domain over.
//
//   AVAILABLE      — the selected peer answered RESPONSE with
//                     application/PeerSnapshotPossessionProtocol.js's own
//                     `PeerSnapshotPossessionWireState.AVAILABLE`. The peer
//                     reports that it currently holds bytes matching this
//                     contentHash. NEVER a guarantee those bytes are still
//                     there a moment later, and NEVER, on its own, a reason
//                     to trust, prefer, or transfer from that peer — see
//                     application/PublicationSnapshotPossessionPeerExchange.js's
//                     own header and docs/Principles.md, "Peer Possession
//                     Responses Are Observations, Not Placement Claims
//                     (0.8.40)."
//   NOT_AVAILABLE   — the selected peer answered RESPONSE with
//                     `PeerSnapshotPossessionWireState.NOT_AVAILABLE`. Also
//                     the honest report for a peer whose OWN local check
//                     found `CONTENT_HASH_MISMATCH` — see application/
//                     PeerSnapshotPossessionProtocol.js's own header on why
//                     that collapse happens on the wire, never here.
//   UNAVAILABLE     — no RESPONSE arrived before the timeout elapsed. A
//                     purely LOCAL, transport-level fact about THIS
//                     request — the peer may not currently be reachable,
//                     the REQUEST or RESPONSE may have been lost, or the
//                     peer may simply not have answered yet. Deliberately
//                     never conflated with NOT_AVAILABLE: unlike
//                     application/PeerSnapshotContentProtocol.js's own wire
//                     shape (which truly cannot distinguish "doesn't have
//                     it" from "never answered," because a peer that lacks
//                     bytes sends nothing), this protocol's RESPONSE always
//                     carries an explicit answer — so UNAVAILABLE here means
//                     only "nothing came back," never "the peer said no."
//                     This state, by construction, never crosses the wire —
//                     see application/PeerSnapshotPossessionProtocol.js's
//                     own header.
//
// THIS IS A REQUESTER-SIDE, PER-ATTEMPT FACT — never persisted, never
// merged across attempts, never treated as more current than the moment it
// was observed. See application/SnapshotPeerPossessionObservation.js.
export const SnapshotPeerPossessionState = Object.freeze({
    AVAILABLE: 'available',
    NOT_AVAILABLE: 'not-available',
    UNAVAILABLE: 'unavailable'
});
