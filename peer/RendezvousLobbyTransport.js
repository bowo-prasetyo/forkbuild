// The public lobby half of a rendezvous network, kept apart from peer/
// RendezvousTransport.js on purpose: that contract answers only "where is
// this identity I already know reachable?" and can never list anyone. A
// lobby is the one place that lists identities, and only those that chose
// to join it with a signed core/LobbyCard.js.
//
// peer/WebSocketRendezvousTransport.js and peer/LocalRendezvousNetwork.js
// implement both contracts over the same connection or map.
export class RendezvousLobbyTransport {
    // Stores a signed card, replacing its identity's card in that lobby.
    // Resolves to the stored card's JSON.
    async joinLobby(card) {
        throw new Error('RendezvousLobbyTransport.joinLobby() must be implemented by a subclass');
    }

    // Withdraws one card. `signature` is the identity's signature over
    // core/LobbyCard.js#getLobbyLeaveSigningDescriptor. Resolves to true if
    // a card was withdrawn.
    async leaveLobby({ identityId, lobby, cardId, signature }) {
        throw new Error('RendezvousLobbyTransport.leaveLobby() must be implemented by a subclass');
    }

    // Resolves to { cards, total }: card JSONs currently in `lobby` (a
    // sample when there are many) and how many there are. Untrusted: every
    // card is verified by its own signature before it is shown.
    async listLobby(lobby) {
        throw new Error('RendezvousLobbyTransport.listLobby() must be implemented by a subclass');
    }
}
