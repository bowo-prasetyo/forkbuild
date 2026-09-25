import { CreateIdentityProviderUseCase } from '../../application/identity/CreateIdentityProviderUseCase.js';
import { IdentityUseCase } from '../../application/identity/IdentityUseCase.js';
import { CreatePublicationCommentaryUseCase } from '../../application/publication/commentary/CreatePublicationCommentaryUseCase.js';
import { PeerSessionManager } from '../../application/peer/PeerSessionManager.js';
import { WebRtcPeerConnectionProvider } from '../../peer/WebRtcPeerConnectionProvider.js';
import { WebSocketRendezvousTransport } from '../../peer/WebSocketRendezvousTransport.js';
import { RendezvousDiscoveryProvider } from '../../peer/RendezvousDiscoveryProvider.js';
import { DiscoveryBootstrap } from '../../peer/DiscoveryBootstrap.js';
import { DEFAULT_ICE_SERVERS, createTurnCredentialSource } from '../../peer/IceServerConfig.js';
import { IceServerConfigurationStore } from '../../storage/IceServerConfigurationStore.js';
import { SetIceServerConfigurationUseCase } from '../../application/settings/SetIceServerConfigurationUseCase.js';
import { TurnServerConfigurationStore } from '../../storage/TurnServerConfigurationStore.js';
import { resolveTurnServerConfiguration } from '../../application/settings/TurnServerConfigurationProvider.js';
import { SetTurnServerConfigurationUseCase } from '../../application/settings/SetTurnServerConfigurationUseCase.js';
import { DEFAULT_RENDEZVOUS_URLS } from '../../peer/RendezvousConfig.js';
import { RendezvousConfigurationStore } from '../../storage/RendezvousConfigurationStore.js';
import { SetRendezvousConfigurationUseCase } from '../../application/settings/SetRendezvousConfigurationUseCase.js';
import { CreatePeerRelationshipUseCase } from '../../application/peer/CreatePeerRelationshipUseCase.js';
import { PeerReconnectionUseCase } from '../../application/peer/PeerReconnectionUseCase.js';
import { FindPeerUseCase } from '../../application/peer/FindPeerUseCase.js';
import { AutoConnectKnownPeersUseCase } from '../../application/peer/AutoConnectKnownPeersUseCase.js';
import { CreateFriendRelationshipUseCase } from '../../application/identity/CreateFriendRelationshipUseCase.js';
import { CreateIdentityLifecyclePropagationUseCase } from '../../application/identity/CreateIdentityLifecyclePropagationUseCase.js';
import { CreateDeviceAuthorizationUseCase } from '../../application/identity/CreateDeviceAuthorizationUseCase.js';
import { CreatePeerBlockUseCase } from '../../application/peer/CreatePeerBlockUseCase.js';
import { ChatUseCase } from '../../application/chat/ChatUseCase.js';
import { CreateChatOutboxUseCase } from '../../application/chat/CreateChatOutboxUseCase.js';
import { CreateConversationStoreUseCase } from '../../application/chat/CreateConversationStoreUseCase.js';
import { CreateConversationReadTrackerUseCase } from '../../application/chat/CreateConversationReadTrackerUseCase.js';
import { CreateConversationReadOutboxUseCase } from '../../application/chat/CreateConversationReadOutboxUseCase.js';
import { CreateRemoteReadReceiptStoreUseCase } from '../../application/chat/CreateRemoteReadReceiptStoreUseCase.js';
import { PeerPresenceUseCase } from '../../application/presence/PeerPresenceUseCase.js';
import { VoiceUseCase } from '../../application/chat/VoiceUseCase.js';
import { PeerMessageBus } from '../../peer/PeerMessageBus.js';
import { CreateSiblingReadStateStoreUseCase } from '../../application/chat/CreateSiblingReadStateStoreUseCase.js';
import { DeviceConversationSyncUseCase } from '../../application/chat/DeviceConversationSyncUseCase.js';
import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { DEFAULT_BITCOIN_ESPLORA_API_URL } from '../../core/BitcoinEsploraConfiguration.js';
import { BitcoinEsploraConfigurationStore } from '../../storage/BitcoinEsploraConfigurationStore.js';
import { SetBitcoinEsploraConfigurationUseCase } from '../../application/settings/SetBitcoinEsploraConfigurationUseCase.js';

// Composition root, part 1: the local identity, the saved network settings
// (STUN, TURN, rendezvous, Bitcoin Esplora), peer sessions and discovery,
// relationships, blocking, device authorization, chat, presence and voice.
export function composeIdentityAndPeers() {
    const identityProvider = new CreateIdentityProviderUseCase().execute();
    const identityUseCase = new IdentityUseCase(identityProvider);
    // Bound as createPublicationCommentaryCommand: addPublicationCommentaryCommand,
    // below, wraps it with distribution.
    const { getPublicationCommentariesCommand, addPublicationCommentaryCommand: createPublicationCommentaryCommand } =
        new CreatePublicationCommentaryUseCase().execute(identityProvider);
    // A saved STUN list overrides DEFAULT_ICE_SERVERS; the default is never saved
    // as if it were a preference. Resolved early because peerConnectionProvider
    // needs it at construction.
    const iceServerConfigurationStore = new IceServerConfigurationStore(new LocalStorageProvider());
    const resolvedStunServers = (iceServerConfigurationStore.get() || { servers: DEFAULT_ICE_SERVERS }).servers;
    // A configured TURN server is added alongside STUN, never replacing it, and the
    // browser's ICE picks among them. Its credential is read only here, folded into
    // resolvedIceServers, and never stored or logged anywhere else.
    const turnServerConfigurationStore = new TurnServerConfigurationStore(new LocalStorageProvider());
    const resolvedTurnServerConfiguration = resolveTurnServerConfiguration({ turnServerConfigurationStore });
    const setTurnServerConfigurationUseCase = new SetTurnServerConfigurationUseCase({ turnServerConfigurationStore });
    const resolvedIceServers = resolvedTurnServerConfiguration
        ? [...resolvedStunServers, resolvedTurnServerConfiguration.toIceServerEntry()]
        : resolvedStunServers;
    const setIceServerConfigurationUseCase = new SetIceServerConfigurationUseCase({ iceServerConfigurationStore });
    // A saved rendezvous list overrides DEFAULT_RENDEZVOUS_URLS, which is empty by
    // default (out-of-band invitations only).
    const rendezvousConfigurationStore = new RendezvousConfigurationStore(new LocalStorageProvider());
    const resolvedRendezvousUrls = (rendezvousConfigurationStore.get() || { urls: DEFAULT_RENDEZVOUS_URLS }).urls;
    // TURN relay credentials come from those same rendezvous servers, and only
    // when a peer connection starts (PeerSessionManager awaits
    // prepareIceServers()): opening the app contacts no TURN service. Without
    // one, the configured STUN list and any user TURN entry are used as they are.
    const peerConnectionProvider = new WebRtcPeerConnectionProvider({
        iceServers: resolvedIceServers,
        turnIceServers: createTurnCredentialSource({ rendezvousUrls: resolvedRendezvousUrls })
    });
    const setRendezvousConfigurationUseCase = new SetRendezvousConfigurationUseCase({ rendezvousConfigurationStore });
    // Resolved early: the Bitcoin Esplora consumers below need it.
    const bitcoinEsploraConfigurationStore = new BitcoinEsploraConfigurationStore(new LocalStorageProvider());
    const resolvedBitcoinEsploraApiUrl = (bitcoinEsploraConfigurationStore.get() || { apiUrl: DEFAULT_BITCOIN_ESPLORA_API_URL }).apiUrl;
    const setBitcoinEsploraConfigurationUseCase = new SetBitcoinEsploraConfigurationUseCase({ bitcoinEsploraConfigurationStore });
    const discoveryBootstrap = new DiscoveryBootstrap({
        bootstrapProviders: resolvedRendezvousUrls.map((url) => new RendezvousDiscoveryProvider({
            transport: new WebSocketRendezvousTransport({ url }),
            identityProvider
        }))
    });
    // App-wide, so live peers survive navigating away from /peers.
    const peerSessionManager = new PeerSessionManager({ identityProvider, peerConnectionProvider, discoveryProvider: discoveryBootstrap });
    const peerRelationshipUseCase = new CreatePeerRelationshipUseCase().execute(identityProvider);
    const peerReconnectionUseCase = new PeerReconnectionUseCase({ peerSessionManager, peerRelationshipUseCase });
    const findPeerUseCase = new FindPeerUseCase({ peerSessionManager });
    // Needs no binding: it tries every eligible Known Peer on construction and on
    // each relationship change, never by polling.
    new AutoConnectKnownPeersUseCase({ findPeerUseCase, peerRelationshipUseCase, connectedPeerRegistry: peerSessionManager.registry });
    const peerMessageBus = new PeerMessageBus();
    // Built before friendRelationshipUseCase so its isBlocked predicate can gate
    // the friendship protocol.
    const peerBlockUseCase = new CreatePeerBlockUseCase().execute(identityProvider);
    // Forward reference: its knowsIdentity gate consults friendRelationshipUseCase,
    // which is built below. resolveSocialIdentity is only called at runtime, after
    // assignment. It lets friendship, chat, voice and presence treat an authorized
    // device as its parent identity.
    let deviceAuthorizationUseCase;
    const resolveSocialIdentity = (connectedPeer) => deviceAuthorizationUseCase.resolveConnectionIdentity(connectedPeer);
    const friendRelationshipUseCase = new CreateFriendRelationshipUseCase().execute(identityProvider, {
        peerMessageBus,
        connectedPeerRegistry: peerSessionManager.registry,
        peerBlockUseCase,
        resolveSocialIdentity
    });
    deviceAuthorizationUseCase = new CreateDeviceAuthorizationUseCase().execute(identityProvider, {
        peerMessageBus,
        connectedPeerRegistry: peerSessionManager.registry,
        peerRelationshipUseCase,
        friendRelationshipUseCase
    });
    // knowsIdentity limits propagation to identities remembered as Known Peers or
    // Friends, never an open revocation directory.
    const identityLifecyclePropagationUseCase = new CreateIdentityLifecyclePropagationUseCase().execute(identityProvider, {
        peerMessageBus,
        connectedPeerRegistry: peerSessionManager.registry,
        peerRelationshipUseCase,
        friendRelationshipUseCase
    });
    const chatOutbox = new CreateChatOutboxUseCase().execute(identityProvider);
    const conversationStore = new CreateConversationStoreUseCase().execute(identityProvider);
    const conversationReadOutbox = new CreateConversationReadOutboxUseCase().execute(identityProvider);
    const remoteReadReceiptStore = new CreateRemoteReadReceiptStoreUseCase().execute(identityProvider);
    const chatUseCase = new ChatUseCase(identityProvider, {
        peerMessageBus,
        connectedPeerRegistry: peerSessionManager.registry,
        friendRelationshipUseCase,
        peerBlockUseCase,
        chatOutbox,
        conversationStore,
        conversationReadOutbox,
        remoteReadReceiptStore,
        // One conversation per person, whichever authorized device sent each message.
        resolveSocialIdentity
    });
    const conversationReadTracker = new CreateConversationReadTrackerUseCase().execute(identityProvider);
    const peerPresenceUseCase = new PeerPresenceUseCase({
        connectedPeerRegistry: peerSessionManager.registry,
        peerRelationshipUseCase,
        friendRelationshipUseCase,
        conversationStore,
        chatOutbox,
        conversationReadTracker,
        resolveSocialIdentity
    });

    // What a sibling device reports about its own reads is a different fact from
    // this device's read marker, so it has its own store.
    const siblingReadStateStore = new CreateSiblingReadStateStoreUseCase().execute(identityProvider);
    const deviceConversationSyncUseCase = new DeviceConversationSyncUseCase({
        peerMessageBus,
        connectedPeerRegistry: peerSessionManager.registry,
        deviceAuthorization: deviceAuthorizationUseCase,
        chatUseCase,
        conversationReadTracker,
        siblingReadStateStore
    });

    // No Create*UseCase wrapper: voice has no durable storage.
    const voiceUseCase = new VoiceUseCase(identityProvider, {
        peerMessageBus,
        connectedPeerRegistry: peerSessionManager.registry,
        friendRelationshipUseCase,
        peerBlockUseCase,
        resolveSocialIdentity
    });

    return {
        identityProvider, identityUseCase, createPublicationCommentaryCommand,
        getPublicationCommentariesCommand, iceServerConfigurationStore, turnServerConfigurationStore,
        setTurnServerConfigurationUseCase, setIceServerConfigurationUseCase, rendezvousConfigurationStore,
        setRendezvousConfigurationUseCase, bitcoinEsploraConfigurationStore, resolvedBitcoinEsploraApiUrl,
        setBitcoinEsploraConfigurationUseCase, peerSessionManager, peerRelationshipUseCase,
        peerReconnectionUseCase, findPeerUseCase, peerMessageBus, peerBlockUseCase, deviceAuthorizationUseCase,
        friendRelationshipUseCase, identityLifecyclePropagationUseCase, chatUseCase, peerPresenceUseCase,
        deviceConversationSyncUseCase, voiceUseCase
    };
}
