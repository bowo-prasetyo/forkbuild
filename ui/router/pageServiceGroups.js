// The service groups (ui/serviceGroups.js, defined in ui/main.js) each page
// needs, loaded beside the page's own modules the first time it opens. A
// page not listed needs only what the app's shell provides. "network" is the
// network runtime (ui/main/composeNetwork.js), which every other group builds
// on and waits for.
// tests/ServiceGroupCoverage.test.js fails if a page injects a service from a
// group not listed for it, or lists a group it does not use.
export const PAGE_SERVICE_GROUPS = Object.freeze({
    AnchorProviderSettingsView: ['network', 'anchoring'],
    AnnouncementDiscoveryProviderSettingsView: ['network'],
    ArweaveGatewaySettingsView: ['network'],
    AuthorView: ['network'],
    BitcoinEsploraSettingsView: ['network'],
    BlurtSettingsView: ['network'],
    BuilderView: ['network'],
    ChallengeView: ['network'],
    ChatView: ['network'],
    ContentProviderSettingsView: ['network'],
    ConversationsView: ['network'],
    DecentralizedPublicationsView: ['network', 'anchoring', 'distribution', 'observationArchive'],
    DevicePairingReceiveView: ['devicePairing'],
    DevicePairingView: ['devicePairing'],
    EditorView: ['network', 'distribution', 'sound', 'walkTogether'],
    FollowingView: ['network'],
    IdentityManagementView: ['network'],
    IpfsGatewaySettingsView: ['network'],
    LiveWorldView: ['network'],
    NetworkSettingsView: ['network'],
    NostrRelaySettingsView: ['network'],
    PeerConnectionsView: ['network'],
    PublicationLinkView: ['network', 'distribution'],
    RecentWorldsView: ['network'],
    RendezvousSettingsView: ['network'],
    RepositoryView: ['network'],
    SteemReadingSettingsView: ['network'],
    StunSettingsView: ['network'],
    TurnServerSettingsView: ['network'],
    WalkTogetherJoinView: ['distribution', 'walkTogether'],
    WorldView: ['network', 'distribution', 'sound', 'walkTogether']
});
