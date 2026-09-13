import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '../views/HomeView.js';
import EditorView from '../views/EditorView.js';
import RepositoryView from '../views/RepositoryView.js';
import RecentWorldsView from '../views/RecentWorldsView.js';
import AboutView from '../views/AboutView.js';
import AuthorView from '../views/AuthorView.js';
import WorldView from '../views/WorldView.js';
import LiveWorldView from '../views/LiveWorldView.js';
import AvatarSettingsView from '../views/AvatarSettingsView.js';
import IdentityManagementView from '../views/IdentityManagementView.js';
import PeerConnectionsView from '../views/PeerConnectionsView.js';
import ChatView from '../views/ChatView.js';
import ConversationsView from '../views/ConversationsView.js';
import DecentralizedPublicationsView from '../views/DecentralizedPublicationsView.js';
import NetworkSettingsView from '../views/NetworkSettingsView.js';
import ContentProviderSettingsView from '../views/ContentProviderSettingsView.js';
import ArweaveGatewaySettingsView from '../views/ArweaveGatewaySettingsView.js';
import NostrRelaySettingsView from '../views/NostrRelaySettingsView.js';
import NostrPublicationRelaySettingsView from '../views/NostrPublicationRelaySettingsView.js';
import StunSettingsView from '../views/StunSettingsView.js';
import TurnServerSettingsView from '../views/TurnServerSettingsView.js';
import RendezvousSettingsView from '../views/RendezvousSettingsView.js';
import ReconciliationCandidateLeaderboardView from '../views/ReconciliationCandidateLeaderboardView.js';
import ReconciliationCandidateLeaderboardEvidenceExportComparisonView from '../views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js';
import ReconciliationWorkspaceView from '../views/ReconciliationWorkspaceView.js';
import PublisherLeaderboardSnapshotClaimAuthoringView from '../views/PublisherLeaderboardSnapshotClaimAuthoringView.js';
import PublisherPerformanceLeaderboardView from '../views/PublisherPerformanceLeaderboardView.js';
import LeaderboardHubView from '../views/LeaderboardHubView.js';

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
    // 0.2.61 — Direct Peer Messaging & Live Chat. Reached from the
    // Friends list (see ui/views/PeerConnectionsView.js), never a
    // top-nav destination.
    { path: '/chat/:identityId', name: 'chat', component: ChatView },
    // 0.2.70 — Presence & Conversation Lifecycle. A top-nav destination
    // (unlike /chat/:identityId above): the one place this app reconciles
    // identity/relationship/friendship/connection/conversation for every
    // peer worth showing, independent of whether any of them are online
    // right now — see application/PeerPresenceUseCase.js's own header.
    { path: '/conversations', name: 'conversations', component: ConversationsView },
    // 0.7.5 — Decentralized Publication UX & Resolution. The "Publication
    // Center" — see ui/views/DecentralizedPublicationsView.js's own
    // header for why this is a top-nav destination distinct from
    // /repository: Repository lists published Documents/Worlds this
    // replica can browse and fork; this page lists signed
    // DecentralizedPublication envelopes (0.7.0) this replica has
    // cataloged (0.7.2), regardless of whether their content resolves.
    { path: '/publications', name: 'publications', component: DecentralizedPublicationsView },
    // Network Settings hub — one top-nav entry point linking to the six
    // endpoint-server settings pages below (content-provider, arweave-gateway,
    // nostr-relay, nostr-publication-relays, stun, rendezvous), each still
    // its own route and component.
    { path: '/settings', name: 'network-settings', component: NetworkSettingsView },
    // 0.9.302 — Content Provider Preference Settings Entry Point. The one
    // ordinary product path to create/change the persisted CONTENT role
    // provider preference (core/RoleProviderPreference.js, 0.9.293) that
    // /publications' own "Use Preferred Provider" trigger (0.9.301)
    // consumes — see ui/views/ContentProviderSettingsView.js's own header.
    // Deliberately its own top-nav destination, not folded into
    // /publications' own already-enormous template.
    { path: '/settings/content-provider', name: 'content-provider-settings', component: ContentProviderSettingsView },
    // 0.9.366 — Arweave Gateway Settings UI. The one ordinary product path
    // to create/change/clear the persisted Arweave gateway retrieval
    // override (core/ArweaveGatewayConfiguration.js, storage/
    // ArweaveGatewayConfigurationStore.js, both 0.9.364) — see
    // ui/views/ArweaveGatewaySettingsView.js's own header. Deliberately its
    // own top-nav destination, the identical "not folded into a growing
    // dashboard" shape /settings/content-provider already holds.
    { path: '/settings/arweave-gateway', name: 'arweave-gateway-settings', component: ArweaveGatewaySettingsView },
    // 0.9.371 — Nostr Relay Settings UI. The one ordinary product path to
    // create/change/clear the persisted Nostr relay discovery override
    // (core/NostrRelayConfiguration.js, storage/NostrRelayConfigurationStore.js,
    // both 0.9.369) — see ui/views/NostrRelaySettingsView.js's own header.
    // Deliberately its own top-nav destination, the identical "not folded
    // into a growing dashboard" shape /settings/arweave-gateway already
    // holds.
    { path: '/settings/nostr-relay', name: 'nostr-relay-settings', component: NostrRelaySettingsView },
    // 0.9.447 — Nostr Publication Relay Set Configuration. A genuinely
    // separate route from /settings/nostr-relay directly above — that route
    // is explicitly, correctly scoped to read/discovery only (see
    // NostrRelaySettingsView.js's own header); 0.9.446's own audit
    // (tests/NostrMultiRelayConfigurationUIReachabilityAudit.test.js) proved
    // live that widening it to also cover publication distribution would
    // cross that boundary rather than merely widen a single value. This
    // route is the new, correct destination for the persisted relay SET
    // 0.9.444's own multi-relay fan-out capability needs — see
    // ui/views/NostrPublicationRelaySettingsView.js's own header.
    { path: '/settings/nostr-publication-relays', name: 'nostr-publication-relay-settings', component: NostrPublicationRelaySettingsView },
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
    { path: '/reconciliation-leaderboard', name: 'reconciliation-leaderboard', component: ReconciliationCandidateLeaderboardView },
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
    { path: '/evidence-export-comparison', name: 'evidence-export-comparison', component: ReconciliationCandidateLeaderboardEvidenceExportComparisonView },
    // 0.9.408 — Reconciliation Workspace UI. The first user-facing surface
    // over application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js
    // (0.9.407, UNCHANGED) — see ui/views/ReconciliationWorkspaceView.js's
    // own header. Deliberately its own route, one hop from /publications
    // (the same "Publication Archive" card that already links to
    // /reconciliation-leaderboard above), never folded into either existing
    // reconciliation page and never itself a top-nav destination — the
    // identical "contextual, not global" navigation shape this whole
    // reconciliation family already holds.
    { path: '/reconciliation-workspace', name: 'reconciliation-workspace', component: ReconciliationWorkspaceView },
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
    { path: '/publisher-snapshot-claim', name: 'publisher-snapshot-claim', component: PublisherLeaderboardSnapshotClaimAuthoringView },
    // 0.9.417 — Publisher Performance Leaderboard UI. 0.9.416's own audit
    // (tests/PublisherPerformanceLeaderboardProductGapAudit.test.js)
    // proved application/PublisherRankingPolicy.js (0.8.112) and
    // application/PublisherLeaderboardView.js (0.8.113), both UNCHANGED,
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
    { path: '/publisher-leaderboard', name: 'publisher-leaderboard', component: PublisherPerformanceLeaderboardView },
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
    { path: '/leaderboard', name: 'leaderboard', component: LeaderboardHubView },
    { path: '/about', name: 'about', component: AboutView }
];

export const router = createRouter({
    history: createWebHashHistory(),
    routes
});
