import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '../views/HomeView.js';
import EditorView from '../views/EditorView.js';
import RepositoryView from '../views/RepositoryView.js';
import AboutView from '../views/AboutView.js';
import AuthorView from '../views/AuthorView.js';
import WorldView from '../views/WorldView.js';
import AvatarSettingsView from '../views/AvatarSettingsView.js';
import IdentityManagementView from '../views/IdentityManagementView.js';

const routes = [
    { path: '/', name: 'home', component: HomeView },
    { path: '/editor', name: 'editor', component: EditorView },
    { path: '/repository', name: 'repository', component: RepositoryView },
    { path: '/author/:username', name: 'author', component: AuthorView },
    { path: '/world/:documentId', name: 'world', component: WorldView },
    { path: '/avatar', name: 'avatar', component: AvatarSettingsView },
    { path: '/identity', name: 'identity', component: IdentityManagementView },
    { path: '/about', name: 'about', component: AboutView }
];

export const router = createRouter({
    history: createWebHashHistory(),
    routes
});
