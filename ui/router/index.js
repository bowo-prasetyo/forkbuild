import { createRouter, createWebHashHistory } from 'vue-router';
import { importWithRetry } from '../importWithRetry.js';
import { loadServiceGroups } from '../serviceGroups.js';
import { PAGE_SERVICE_GROUPS } from './pageServiceGroups.js';
import { watchPageLoads } from '../pageLoadFailure.js';
import HomeView from '../views/HomeView.js';

// Each page but Home (a few lines, and the page most visits open) loads its
// modules the first time it is opened, not with the app: together they are
// about half of the app's code, and the World View and Editor bring in
// Three.js. tests/InitialLoadModuleGraph.test.js fails if another page is
// imported statically again.
//
// A page's service groups (ui/router/pageServiceGroups.js) load beside its
// modules, so the services it injects are provided before it renders. A
// failed load is tried again briefly, for browsers that fetch a failed module
// again; if it still fails, the page says so (ui/pageLoadFailure.js).
function page(name, load) {
    const serviceGroups = PAGE_SERVICE_GROUPS[name] || [];
    return () => importWithRetry(() => Promise.all([load(), loadServiceGroups(serviceGroups)]).then(([module]) => module), [500, 1500]);
}
const EditorView = page('EditorView', () => import('../views/EditorView.js'));
const RepositoryView = page('RepositoryView', () => import('../views/RepositoryView.js'));
const RecentWorldsView = page('RecentWorldsView', () => import('../views/RecentWorldsView.js'));
const AboutView = page('AboutView', () => import('../views/AboutView.js'));
const PublicationLinkView = page('PublicationLinkView', () => import('../views/PublicationLinkView.js'));
const AuthorView = page('AuthorView', () => import('../views/AuthorView.js'));
const WorldView = page('WorldView', () => import('../views/WorldView.js'));
const LiveWorldView = page('LiveWorldView', () => import('../views/LiveWorldView.js'));
const AvatarSettingsView = page('AvatarSettingsView', () => import('../views/AvatarSettingsView.js'));
const IdentityManagementView = page('IdentityManagementView', () => import('../views/IdentityManagementView.js'));
const PeerConnectionsView = page('PeerConnectionsView', () => import('../views/PeerConnectionsView.js'));
const FollowingView = page('FollowingView', () => import('../views/FollowingView.js'));
const ChatView = page('ChatView', () => import('../views/ChatView.js'));
const ConversationsView = page('ConversationsView', () => import('../views/ConversationsView.js'));
const DecentralizedPublicationsView = page('DecentralizedPublicationsView', () => import('../views/DecentralizedPublicationsView.js'));
const NetworkSettingsView = page('NetworkSettingsView', () => import('../views/NetworkSettingsView.js'));
const ContentProviderSettingsView = page('ContentProviderSettingsView', () => import('../views/ContentProviderSettingsView.js'));
const AnnouncementDiscoveryProviderSettingsView = page('AnnouncementDiscoveryProviderSettingsView', () => import('../views/AnnouncementDiscoveryProviderSettingsView.js'));
const AnchorProviderSettingsView = page('AnchorProviderSettingsView', () => import('../views/AnchorProviderSettingsView.js'));
const ArweaveGatewaySettingsView = page('ArweaveGatewaySettingsView', () => import('../views/ArweaveGatewaySettingsView.js'));
const IpfsGatewaySettingsView = page('IpfsGatewaySettingsView', () => import('../views/IpfsGatewaySettingsView.js'));
const BitcoinEsploraSettingsView = page('BitcoinEsploraSettingsView', () => import('../views/BitcoinEsploraSettingsView.js'));
const NostrRelaySettingsView = page('NostrRelaySettingsView', () => import('../views/NostrRelaySettingsView.js'));
const SteemReadingSettingsView = page('SteemReadingSettingsView', () => import('../views/SteemReadingSettingsView.js'));
const BlurtSettingsView = page('BlurtSettingsView', () => import('../views/BlurtSettingsView.js'));
const StunSettingsView = page('StunSettingsView', () => import('../views/StunSettingsView.js'));
const TurnServerSettingsView = page('TurnServerSettingsView', () => import('../views/TurnServerSettingsView.js'));
const RendezvousSettingsView = page('RendezvousSettingsView', () => import('../views/RendezvousSettingsView.js'));
const ReconciliationCandidateLeaderboardView = page('ReconciliationCandidateLeaderboardView', () => import('../views/ReconciliationCandidateLeaderboardView.js'));
const ReconciliationCandidateLeaderboardEvidenceExportComparisonView = page('ReconciliationCandidateLeaderboardEvidenceExportComparisonView', () => import('../views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js'));
const ReconciliationWorkspaceView = page('ReconciliationWorkspaceView', () => import('../views/ReconciliationWorkspaceView.js'));
const PublisherLeaderboardSnapshotClaimAuthoringView = page('PublisherLeaderboardSnapshotClaimAuthoringView', () => import('../views/PublisherLeaderboardSnapshotClaimAuthoringView.js'));
const PublisherPerformanceLeaderboardView = page('PublisherPerformanceLeaderboardView', () => import('../views/PublisherPerformanceLeaderboardView.js'));
const LeaderboardHubView = page('LeaderboardHubView', () => import('../views/LeaderboardHubView.js'));
const YourDataView = page('YourDataView', () => import('../views/YourDataView.js'));
const LanguageSettingsView = page('LanguageSettingsView', () => import('../views/LanguageSettingsView.js'));

const routes = [
    { path: '/', name: 'home', component: HomeView },
    { path: '/editor', name: 'editor', component: EditorView },
    { path: '/repository', name: 'repository', component: RepositoryView },
    // 0.3.10 — World Persistence & Return Experience. A LOCAL index —
    // see ui/views/RecentWorldsView.js's own header for why this is
    // never the same list Repository shows (every published World vs.
    // Worlds THIS replica has actually visited).
    { path: '/worlds/recent', name: 'recent-worlds', component: RecentWorldsView },
    { path: '/author/:username', name: 'author', component: AuthorView },
    // 0.9.17 — Integrate World Encounters into the Existing World View.
    // `WorldView` now mounts `ui/components/WorldEncounterCanvas.js`
    // itself, inside a "World Encounters" section, driven by the exact
    // same `worldDiscoverySourceRegistry` `/live-world` below already
    // uses — see WorldView.js's own 0.9.17 comments. `/world/:documentId`
    // is the one canonical, user-facing World surface from this
    // milestone forward.
    { path: '/world/:documentId', name: 'world', component: WorldView },
    // A link to a Publication, naming where its Signed Claim is stored: the
    // "see it in 3D" link on a Steem or Blurt post, or one shared with Share.
    // Opens World View on that Publication once it checks out.
    { path: '/view/steem/:author/:permlink', name: 'steem-publication-link', component: PublicationLinkView },
    { path: '/view/blurt/:author/:permlink', name: 'blurt-publication-link', component: PublicationLinkView },
    { path: '/view/ar/:id', name: 'arweave-publication-link', component: PublicationLinkView },
    { path: '/view/ipfs/:cid', name: 'ipfs-publication-link', component: PublicationLinkView },
    // A link-only share: the Signed Claim and the build travel in the link
    // itself (application/publication/sharing/PublicationLinkPayload.js).
    { path: '/s/:payload', name: 'link-only-publication-link', component: PublicationLinkView },
    // 0.9.15 — Mount Live World View. Superseded as a top-nav, user-
    // facing destination by 0.9.17 above (`WorldEncounterCanvas` now
    // lives inside `/world/:documentId` itself) — kept registered,
    // reachable by direct URL, and deliberately UNCHANGED: it remains
    // useful as an isolated proving ground (no session, no document, no
    // brick registry — just the raw discovery registry rendered on its
    // own), the same role it has always played. Nothing about this
    // route, or `ui/views/LiveWorldView.js` itself, changed for 0.9.17.
    { path: '/live-world', name: 'live-world', component: LiveWorldView },
    { path: '/avatar', name: 'avatar', component: AvatarSettingsView },
    { path: '/identity', name: 'identity', component: IdentityManagementView },
    { path: '/peers', name: 'peers', component: PeerConnectionsView },
    { path: '/following', name: 'following', component: FollowingView },
    // 0.2.61 — Direct Peer Messaging & Live Chat. Reached from the
    // Friends list (see ui/views/PeerConnectionsView.js), never a
    // top-nav destination.
    { path: '/chat/:identityId', name: 'chat', component: ChatView },
    // 0.2.70 — Presence & Conversation Lifecycle. A top-nav destination
    // (unlike /chat/:identityId above): the one place this app reconciles
    // identity/relationship/friendship/connection/conversation for every
    // peer worth showing, independent of whether any of them are online
    // right now — see application/presence/PeerPresenceUseCase.js's own header.
    { path: '/conversations', name: 'conversations', component: ConversationsView },
    // 0.7.5 — Decentralized Publication UX & Resolution. The "Publication
    // Center" — see ui/views/DecentralizedPublicationsView.js's own
    // header for why this is a top-nav destination distinct from
    // /repository: Repository lists published Documents/Worlds this
    // replica can browse and fork; this page lists signed
    // DecentralizedPublication envelopes (0.7.0) this replica has
    // cataloged (0.7.2), regardless of whether their content resolves.
    // Not Experimental as a whole: the page marks its Experimental parts
    // itself (anchoring, wallets, Steem, remote pinning, the expert tabs).
    { path: '/publications', name: 'publications', component: DecentralizedPublicationsView },
    // Network Settings hub — one top-nav entry point linking to every
    // /settings/* page below, each still its own route and component — see
    // ui/views/NetworkSettingsView.js's own header.
    { path: '/settings', name: 'network-settings', component: NetworkSettingsView },
    { path: '/settings/data', name: 'your-data', component: YourDataView },
    { path: '/settings/language', name: 'language-settings', component: LanguageSettingsView },
    // 0.9.302 — Content Provider Preference Settings Entry Point. The one
    // ordinary product path to create/change the persisted CONTENT role
    // provider preference (core/RoleProviderPreference.js, 0.9.293) that
    // /publications' own "Use Preferred Provider" trigger (0.9.301)
    // consumes — see ui/views/ContentProviderSettingsView.js's own header.
    // Deliberately its own top-nav destination, not folded into
    // /publications' own already-enormous template.
    { path: '/settings/content-provider', name: 'content-provider-settings', component: ContentProviderSettingsView },
    // Announcement/Discovery Provider Settings Entry Point. The one ordinary
    // product path to create/change the persisted ANNOUNCEMENT_AND_DISCOVERY
    // role provider preference — see
    // ui/views/AnnouncementDiscoveryProviderSettingsView.js's own header.
    // Mirrors /settings/content-provider's own shape, one role over.
    { path: '/settings/announcement-discovery-provider', name: 'announcement-discovery-provider-settings', component: AnnouncementDiscoveryProviderSettingsView },
    // Proof/Anchoring Provider Settings Entry Point. The one ordinary
    // product path to create/change the persisted PROOF_AND_ANCHORING role
    // provider preference — see ui/views/AnchorProviderSettingsView.js's
    // own header. Mirrors /settings/content-provider's own shape, one role
    // over; lists whichever of Bitcoin/Arweave this replica currently has a
    // registered publisher for (Base is never listed here — it keeps its
    // own separate wallet-guided anchoring flow).
    { path: '/settings/anchor-provider', name: 'anchor-provider-settings', component: AnchorProviderSettingsView },
    // 0.9.366 — Arweave Gateway Settings UI. The one ordinary product path
    // to create/change/clear the persisted Arweave gateway retrieval
    // override (core/ArweaveGatewayConfiguration.js, storage/
    // ArweaveGatewayConfigurationStore.js, both 0.9.364) — see
    // ui/views/ArweaveGatewaySettingsView.js's own header. Deliberately its
    // own top-nav destination, the identical "not folded into a growing
    // dashboard" shape /settings/content-provider already holds.
    { path: '/settings/arweave-gateway', name: 'arweave-gateway-settings', component: ArweaveGatewaySettingsView },
    // 0.9.665 — IPFS Gateway Settings UI. Reverses the 0.9.373/0.9.385/
    // 0.9.657 DEFER verdicts for this exact candidate — see core/
    // IpfsGatewayConfiguration.js's own header for the new evidence
    // (ipfs.io's public gateway now blocks ordinary programmatic
    // requests behind a bot-detection check) that reopened the question.
    // The one ordinary product path to create/change/clear the persisted
    // IPFS gateway retrieval override (core/IpfsGatewayConfiguration.js,
    // storage/IpfsGatewayConfigurationStore.js), mirroring
    // /settings/arweave-gateway's own shape exactly.
    { path: '/settings/ipfs-gateway', name: 'ipfs-gateway-settings', component: IpfsGatewaySettingsView },
    // Bitcoin Endpoint Settings UI. Reopens the DEFER verdict
    // tests/BitcoinEndpointConfigurationUIReachabilityAudit.test.js's own
    // Section G recorded seven times over: the shared Esplora-compatible
    // endpoint behind Bitcoin anchor broadcast, confirmation observation,
    // wallet-funding lookups, and OP_RETURN proof verification
    // (anchoring/BitcoinEsplora*.js, anchoring/BitcoinOpReturnProofVerifier.js)
    // had no user-facing override — if the deployment default ever goes
    // down, there was no way for a person to route around it. The one
    // ordinary product path to create/change/clear the persisted override
    // (core/BitcoinEsploraConfiguration.js, storage/
    // BitcoinEsploraConfigurationStore.js) — see ui/views/
    // BitcoinEsploraSettingsView.js's own header. Mirrors
    // /settings/arweave-gateway's own shape, one field instead of an
    // ordered list.
    { path: '/settings/bitcoin-esplora', name: 'bitcoin-esplora-settings', component: BitcoinEsploraSettingsView, meta: { experimental: true } },
    // 0.9.371 — Nostr Relay Settings UI. The one ordinary product path to
    // create/change/clear the persisted Nostr relay set
    // (core/NostrRelayConfiguration.js, storage/NostrRelayConfigurationStore.js,
    // both 0.9.369) — see ui/views/NostrRelaySettingsView.js's own header.
    // Deliberately its own top-nav destination, the identical "not folded
    // into a growing dashboard" shape /settings/arweave-gateway already
    // holds.
    //
    // UNIFIED — this is now the ONE Nostr relay configuration for the whole
    // application. A separate route, /settings/nostr-publication-relays
    // (0.9.447, ui/views/NostrPublicationRelaySettingsView.js), used to hold
    // an independent relay SET for Publication distribution/discovery
    // only — removed; see core/NostrRelayConfiguration.js's own header,
    // "unified," for the full rationale and what changed.
    { path: '/settings/nostr-relay', name: 'nostr-relay-settings', component: NostrRelaySettingsView },
    { path: '/settings/steem', name: 'steem-reading-settings', component: SteemReadingSettingsView },
    { path: '/settings/blurt', name: 'blurt-settings', component: BlurtSettingsView },
    // 0.9.386 — STUN Settings UI. The one ordinary product path to
    // create/change/clear the persisted STUN server configuration
    // override (core/IceServerConfiguration.js, storage/
    // IceServerConfigurationStore.js, both this same milestone) — see
    // ui/views/StunSettingsView.js's own header. Deliberately its own
    // top-nav destination, the identical "not folded into a growing
    // dashboard" shape /settings/arweave-gateway and /settings/nostr-relay
    // already hold.
    { path: '/settings/stun', name: 'stun-settings', component: StunSettingsView },
    // 0.9.456 — TURN Server Settings UI. A genuinely separate route/store/
    // use case from /settings/stun directly above — see ui/views/
    // TurnServerSettingsView.js's own header, "STUN CONFIGURATION ≠ TURN
    // CONFIGURATION." The one ordinary product path to create/change/clear
    // the persisted TURN server configuration (core/TurnServerConfiguration.js,
    // storage/TurnServerConfigurationStore.js, application/
    // SetTurnServerConfigurationUseCase.js) that 0.9.454/0.9.455 built with
    // no settings surface of its own. Deliberately its own top-nav
    // destination, the identical "not folded into a growing dashboard" shape
    // every sibling endpoint-settings page above already holds.
    { path: '/settings/turn-server', name: 'turn-server-settings', component: TurnServerSettingsView },
    // 0.9.388 — Rendezvous Settings UI. The one ordinary product path to
    // create/change/clear the persisted rendezvous server configuration
    // override (core/RendezvousConfiguration.js, storage/
    // RendezvousConfigurationStore.js, both this same milestone) — see
    // ui/views/RendezvousSettingsView.js's own header. Deliberately its
    // own top-nav destination, the identical "not folded into a growing
    // dashboard" shape /settings/arweave-gateway, /settings/nostr-relay,
    // and /settings/stun already hold.
    { path: '/settings/rendezvous', name: 'rendezvous-settings', component: RendezvousSettingsView },
    // 0.8.180 — Reconciliation Candidate Leaderboard UI Integration. 0.9.400's
    // own audit (tests/ReconciliationLeaderboardEntryPointDecisionAudit.test.js)
    // found this route real, wired, and reachable end to end EXCEPT that no
    // in-app link to it existed anywhere — not even the "contextual, not
    // top-nav" kind /chat/:identityId already held above. Reached now from
    // the Publication Archive card on /publications (ui/views/
    // DecentralizedPublicationsView.js), the exact page that already
    // produces the peer archive export this page's own "Use as Peer
    // Archive" step asks a person to paste. Deliberately still not its own
    // top-nav destination — the identical "contextual, not global"
    // navigation /chat/:identityId already uses.
    { path: '/reconciliation-leaderboard', name: 'reconciliation-leaderboard', component: ReconciliationCandidateLeaderboardView, meta: { experimental: true } },
    // 0.8.192 — Reconciliation Candidate Leaderboard Evidence Export
    // Comparison UI. A second, independent workflow from
    // /reconciliation-leaderboard directly above: that page compares two
    // LIVE archives; this page compares two previously EXPORTED, portable
    // evidence documents, and never reads either live archive at all — see
    // ui/views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js's
    // own header. Deliberately OUT OF SCOPE for 0.9.400: that milestone's
    // own audit gave /reconciliation-leaderboard directly above a real
    // entry point but explicitly left this page as it found it — still
    // reached by URL only, with no in-app link anywhere, a real gap this
    // milestone named but did not close. A future milestone's own decision
    // to make.
    //
    // 0.9.402 recorded that future decision explicitly — CONTEXTUAL_ENTRY_
    // POINT, with the Leaderboard's own "Export Evidence" panel above as
    // the verified natural predecessor — but deliberately deferred wiring
    // it. 0.9.403 fulfills that deferral: one `<router-link>` in
    // ui/views/ReconciliationCandidateLeaderboardView.js's own Evidence
    // Export panel, "Compare Exported Evidence," beside "Export Evidence"
    // itself. This route's own registration, name, and component below are
    // unchanged by that milestone — only a caller was added, one hop below
    // /reconciliation-leaderboard, still never a top-nav destination.
    { path: '/evidence-export-comparison', name: 'evidence-export-comparison', component: ReconciliationCandidateLeaderboardEvidenceExportComparisonView, meta: { experimental: true } },
    // 0.9.408 — Reconciliation Workspace UI. The first user-facing surface
    // over application/leaderboard/snapshot/ReconcileClaimUseCase.js
    // (0.9.407, UNCHANGED) — see ui/views/ReconciliationWorkspaceView.js's
    // own header. Deliberately its own route, one hop from /publications
    // (the same "Publication Archive" card that already links to
    // /reconciliation-leaderboard above), never folded into either existing
    // reconciliation page and never itself a top-nav destination — the
    // identical "contextual, not global" navigation shape this whole
    // reconciliation family already holds.
    { path: '/reconciliation-workspace', name: 'reconciliation-workspace', component: ReconciliationWorkspaceView, meta: { experimental: true } },
    // 0.9.411 — Publisher Leaderboard Snapshot Claim Authoring & Export.
    // The producer-side counterpart to /reconciliation-workspace directly
    // above: that page consumes a pasted peer claim; this page authors,
    // signs, and exports THIS replica's own — see ui/views/
    // PublisherLeaderboardSnapshotClaimAuthoringView.js's own header.
    // Deliberately its own route, one hop from /publications (the SAME
    // "Publication Archive" card that already links to
    // /reconciliation-leaderboard and /reconciliation-workspace above),
    // never folded into either existing reconciliation page and never
    // itself a top-nav destination — the identical "contextual, not
    // global" navigation shape this whole reconciliation family already
    // holds.
    { path: '/publisher-snapshot-claim', name: 'publisher-snapshot-claim', component: PublisherLeaderboardSnapshotClaimAuthoringView, meta: { experimental: true } },
    // 0.9.417 — Publisher Performance Leaderboard UI. 0.9.416's own audit
    // (tests/PublisherPerformanceLeaderboardProductGapAudit.test.js)
    // proved application/leaderboard/PublisherRankingPolicy.js (0.8.112) and
    // application/leaderboard/PublisherLeaderboardView.js (0.8.113), both UNCHANGED,
    // real and correct but reachable by zero UI paths, and named this
    // exact shape — a distinct route, contextual, not top-nav — as its
    // preferred entry-point candidate (that audit's own Section E).
    // Reached from the SAME "Publication Archive" card on /publications
    // that already links to /reconciliation-leaderboard,
    // /reconciliation-workspace, and /publisher-snapshot-claim above —
    // see ui/views/DecentralizedPublicationsView.js's own 0.9.417
    // comment. Deliberately its own route, never folded into
    // /reconciliation-leaderboard itself (the two remain genuinely
    // distinct concepts — see 0.9.416's own Section A) and never a
    // top-nav destination.
    { path: '/publisher-leaderboard', name: 'publisher-leaderboard', component: PublisherPerformanceLeaderboardView, meta: { experimental: true } },
    // AMENDED — the four routes immediately above this comment
    // (/reconciliation-leaderboard, /reconciliation-workspace,
    // /publisher-snapshot-claim, /publisher-leaderboard) were each
    // originally reached by their own direct contextual link on
    // /publications' own "Publication Archive" card, per their own
    // comments above. Those four links (plus the Publisher Achievement
    // Profile/Badges/Statistics cards that used to sit further down that
    // same page) are now reached through this one hub route instead — see
    // ui/views/LeaderboardHubView.js's own header for why those three cards
    // moved with the links rather than staying behind. The four routes and
    // their components above are otherwise unchanged; only the caller
    // moved.
    { path: '/leaderboard', name: 'leaderboard', component: LeaderboardHubView, meta: { experimental: true } },
    { path: '/about', name: 'about', component: AboutView }
];

export const router = createRouter({
    history: createWebHashHistory(),
    routes
});

// A page that fails to download shows a notice instead of doing nothing.
watchPageLoads(router);
