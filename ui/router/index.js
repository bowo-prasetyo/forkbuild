import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '../views/HomeView.js';
import EditorView from '../views/EditorView.js';
import RepositoryView from '../views/RepositoryView.js';
import AboutView from '../views/AboutView.js';
import AuthorView from '../views/AuthorView.js';
import WorldView from '../views/WorldView.js';
import AvatarSettingsView from '../views/AvatarSettingsView.js';
import IdentityManagementView from '../views/IdentityManagementView.js';
import PeerConnectionsView from '../views/PeerConnectionsView.js';
import ChatView from '../views/ChatView.js';

const routes = [
    { path: '/', name: 'home', component: HomeView },
    { path: '/editor', name: 'editor', component: EditorView },
    { path: '/repository', name: 'repository', component: RepositoryView },
    { path: '/author/:username', name: 'author', component: AuthorView },
    { path: '/world/:documentId', name: 'world', component: WorldView },
    { path: '/avatar', name: 'avatar', component: AvatarSettingsView },
    { path: '/identity', name: 'identity', component: IdentityManagementView },
    { path: '/peers', name: 'peers', component: PeerConnectionsView },
    // 0.2.61 — Direct Peer Messaging & Live Chat. Reached from the
    // Friends list (see ui/views/PeerConnectionsView.js), never a
    // top-nav destination.
    { path: '/chat/:identityId', name: 'chat', component: ChatView },
    { path: '/about', name: 'about', component: AboutView }
];

export const router = createRouter({
    history: createWebHashHistory(),
    routes
});
