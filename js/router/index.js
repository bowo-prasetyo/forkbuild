import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '../views/HomeView.js';
import EditorView from '../views/EditorView.js';
import AboutView from '../views/AboutView.js';

const routes = [
    { path: '/', name: 'home', component: HomeView },
    { path: '/editor', name: 'editor', component: EditorView },
    { path: '/about', name: 'about', component: AboutView }
];

export const router = createRouter({
    history: createWebHashHistory(),
    routes
});
