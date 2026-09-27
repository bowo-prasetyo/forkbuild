import { provide, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import UserWidget from './components/UserWidget.js';
import ExperimentalBanner from './components/ExperimentalBanner.js';
import { CreatePreviewUseCase } from '../application/editor/CreatePreviewUseCase.js';

export default {
    name: 'App',
    components: { UserWidget, ExperimentalBanner },
    // 0.2.32: one app-wide PreviewService, provided here (same
    // provide/inject convention LoginModal's identityUseCase already
    // uses) so its cache and generation queue survive navigating
    // between Repository, Author, and back — see
    // application/editor/CreatePreviewUseCase.js.
    setup() {
        const { previewService } = new CreatePreviewUseCase().execute();
        provide('previewService', previewService);

        // On phone-width screens the nav folds behind a Menu button; choosing a page
        // folds it again.
        const route = useRoute();
        const menuOpen = ref(false);
        watch(() => route.fullPath, () => { menuOpen.value = false; });
        return { menuOpen };
    },
    template: `
        <div class="app-shell">
            <header class="app-header">
                <span class="app-title">ForkBuild</span>
                <button
                    type="button"
                    class="app-menu-toggle"
                    :aria-expanded="menuOpen ? 'true' : 'false'"
                    @click="menuOpen = !menuOpen"
                >{{ menuOpen ? 'Close' : 'Menu' }}</button>
                <div class="app-header-right">
	                <nav :class="['app-nav', { 'app-nav--open': menuOpen }]">
	                    <router-link to="/" class="app-nav-link">Home</router-link>
	                    <router-link to="/editor" class="app-nav-link">Editor</router-link>
	                    <router-link to="/repository" class="app-nav-link">Repository</router-link>
	                    <router-link to="/worlds/recent" class="app-nav-link">My Worlds</router-link>
	                    <router-link to="/avatar" class="app-nav-link">My Avatar</router-link>
	                    <router-link to="/identity" class="app-nav-link">My Identities</router-link>
	                    <router-link to="/peers" class="app-nav-link">Peers</router-link>
	                    <router-link to="/conversations" class="app-nav-link">Conversations</router-link>
	                    <router-link to="/publications" class="app-nav-link">Publications<span class="experimental-badge experimental-badge--nav" title="Experimental: may change or be removed in a later version">Exp.</span></router-link>
	                    <router-link to="/settings" class="app-nav-link">Network Settings</router-link>
	                    <router-link to="/about" class="app-nav-link">About</router-link>
	                </nav>
                    <UserWidget />
                </div>
            </header>

            <ExperimentalBanner v-if="$route.meta.experimental" />
            <main class="app-content">
                <router-view />
            </main>
        </div>
    `
};
