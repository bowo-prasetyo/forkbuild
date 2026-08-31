import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '../views/HomeView.js';
import EditorView from '../views/EditorView.js';
import RepositoryView from '../views/RepositoryView.js';
import RecentWorldsView from '../views/RecentWorldsView.js';
import AboutView from '../views/AboutView.js';
import AuthorView from '../views/AuthorView.js';
import WorldView from '../views/WorldView.js';
import AvatarSettingsView from '../views/AvatarSettingsView.js';
import IdentityManagementView from '../views/IdentityManagementView.js';
import PeerConnectionsView from '../views/PeerConnectionsView.js';
import ChatView from '../views/ChatView.js';
import ConversationsView from '../views/ConversationsView.js';
import DecentralizedPublicationsView from '../views/DecentralizedPublicationsView.js';
import ReconciliationCandidateLeaderboardView from '../views/ReconciliationCandidateLeaderboardView.js';
import ReconciliationCandidateLeaderboardEvidenceExportComparisonView from '../views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js';

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
    { path: '/world/:documentId', name: 'world', component: WorldView },
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
    // 0.8.180 — Reconciliation Candidate Leaderboard UI Integration. Not
    // yet a top-nav destination (see ui/views/ReconciliationCandidateLeaderboardView.js's
    // own header) — reached by URL until a future milestone gives it a
    // real entry point, the same "reached from elsewhere, never top-nav"
    // shape /chat/:identityId already holds above.
    { path: '/reconciliation-leaderboard', name: 'reconciliation-leaderboard', component: ReconciliationCandidateLeaderboardView },
    // 0.8.192 — Reconciliation Candidate Leaderboard Evidence Export
    // Comparison UI. A second, independent workflow from
    // /reconciliation-leaderboard directly above: that page compares two
    // LIVE archives; this page compares two previously EXPORTED, portable
    // evidence documents, and never reads either live archive at all — see
    // ui/views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js's
    // own header. Not yet a top-nav destination, the identical "reached by
    // URL until a future milestone gives it a real entry point" shape held
    // above.
    { path: '/evidence-export-comparison', name: 'evidence-export-comparison', component: ReconciliationCandidateLeaderboardEvidenceExportComparisonView },
    { path: '/about', name: 'about', component: AboutView }
];

export const router = createRouter({
    history: createWebHashHistory(),
    routes
});
